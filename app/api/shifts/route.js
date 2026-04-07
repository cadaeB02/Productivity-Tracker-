import { NextResponse } from 'next/server';

const TZ = 'America/Denver';

// Parse iCal (.ics) feed from WhenIWork
function parseICS(icsText) {
    const events = [];
    const lines = icsText.replace(/\r\n /g, '').split(/\r?\n/);
    let current = null;

    for (const line of lines) {
        if (line === 'BEGIN:VEVENT') {
            current = {};
        } else if (line === 'END:VEVENT' && current) {
            events.push(current);
            current = null;
        } else if (current) {
            const colonIdx = line.indexOf(':');
            if (colonIdx === -1) continue;
            // Handle DTSTART;TZID=...:20260407T092500 format
            const fullKey = line.substring(0, colonIdx);
            const key = fullKey.split(';')[0];
            const value = line.substring(colonIdx + 1);

            // Extract TZID if present
            const tzMatch = fullKey.match(/TZID=([^;:]+)/);

            switch (key) {
                case 'SUMMARY':
                    current.summary = value;
                    break;
                case 'DTSTART':
                    current.start = parseICalDate(value, tzMatch?.[1]);
                    current.startRaw = value;
                    current.startTZ = tzMatch?.[1] || null;
                    break;
                case 'DTEND':
                    current.end = parseICalDate(value, tzMatch?.[1]);
                    current.endRaw = value;
                    break;
                case 'LOCATION':
                    current.location = value;
                    break;
                case 'DESCRIPTION':
                    current.description = value.replace(/\\n/g, '\n').replace(/\\,/g, ',');
                    break;
                case 'UID':
                    current.uid = value;
                    break;
            }
        }
    }
    return events;
}

// Parse iCal date, preserving timezone info
function parseICalDate(str, tzid) {
    if (!str) return null;
    const clean = str.replace(/[^0-9TZ]/g, '');
    const year = clean.substring(0, 4);
    const month = clean.substring(4, 6);
    const day = clean.substring(6, 8);
    const hour = clean.substring(9, 11) || '00';
    const minute = clean.substring(11, 13) || '00';
    const second = clean.substring(13, 15) || '00';
    const isUTC = clean.endsWith('Z');
    
    // Return a structured object with local time info
    return {
        iso: isUTC 
            ? new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}Z`).toISOString()
            : `${year}-${month}-${day}T${hour}:${minute}:${second}`,
        localDate: `${year}-${month}-${day}`,
        localTime: `${hour}:${minute}`,
        isUTC,
        tzid: tzid || (isUTC ? 'UTC' : TZ),
    };
}

// Format time for display in Mountain Time
function formatTimeDisplay(dateObj) {
    if (!dateObj) return null;
    
    if (!dateObj.isUTC) {
        // Already in local time — just format it
        const [h, m] = dateObj.localTime.split(':').map(Number);
        const ampm = h >= 12 ? 'PM' : 'AM';
        const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
        return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
    }
    
    // UTC time — convert to Mountain Time
    const d = new Date(dateObj.iso);
    return d.toLocaleTimeString('en-US', { 
        hour: 'numeric', 
        minute: '2-digit', 
        hour12: true,
        timeZone: TZ,
    });
}

// Get local date in Mountain Time
function getLocalDate(dateObj) {
    if (!dateObj) return null;
    
    if (!dateObj.isUTC) {
        return dateObj.localDate;
    }
    
    // Convert UTC to Mountain Time date
    const d = new Date(dateObj.iso);
    return d.toLocaleDateString('en-CA', { timeZone: TZ }); // en-CA = YYYY-MM-DD
}

// Calculate duration in hours
function getDuration(startObj, endObj) {
    if (!startObj || !endObj) return null;
    
    if (!startObj.isUTC && !endObj.isUTC) {
        // Both are local times — calculate from local time strings
        const [sh, sm] = startObj.localTime.split(':').map(Number);
        const [eh, em] = endObj.localTime.split(':').map(Number);
        let startMins = sh * 60 + sm;
        let endMins = eh * 60 + em;
        if (endMins < startMins) endMins += 24 * 60; // crosses midnight
        return Math.round((endMins - startMins) / 60 * 100) / 100;
    }
    
    // At least one is UTC — use ISO dates
    const start = new Date(startObj.iso);
    const end = new Date(endObj.iso);
    return Math.round((end - start) / 3600000 * 100) / 100;
}

// Detect employer from event summary/description
function detectEmployer(event) {
    const text = `${event.summary || ''} ${event.location || ''} ${event.description || ''}`.toLowerCase();
    
    if (text.includes('golden') || text.includes('bike') || text.includes('gbshop') || text.includes('gbs')) {
        return 'Golden Bike Shop';
    }
    if (text.includes('bentgate') || text.includes('mountaineering') || text.includes('bent gate')) {
        return 'Bentgate Mountaineering';
    }
    return event.summary || 'Unknown';
}

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const icalUrl = searchParams.get('url');
        
        if (!icalUrl) {
            return NextResponse.json({ error: 'No iCal URL provided' }, { status: 400 });
        }

        const response = await fetch(icalUrl, {
            headers: { 'User-Agent': 'HoldCo-OS/1.0' },
            next: { revalidate: 300 },
        });

        if (!response.ok) {
            return NextResponse.json({ error: `Failed to fetch iCal feed: ${response.status}` }, { status: 502 });
        }

        const icsText = await response.text();
        const events = parseICS(icsText);

        // Deduplicate by date + start time + summary (catches recurring events with unique UIDs)
        const seen = new Set();
        const uniqueEvents = events.filter(e => {
            const date = getLocalDate(e.start);
            const time = e.start?.localTime || '';
            const sum = (e.summary || '').toLowerCase().trim();
            const key = `${date}|${time}|${sum}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });

        // Enrich with employer detection and format
        const shifts = uniqueEvents.map(event => ({
            uid: event.uid,
            summary: event.summary || '',
            employer: detectEmployer(event),
            start: event.start?.iso || null,
            end: event.end?.iso || null,
            location: event.location || '',
            date: getLocalDate(event.start),
            startTime: formatTimeDisplay(event.start),
            endTime: formatTimeDisplay(event.end),
            durationHours: getDuration(event.start, event.end),
        }));

        // Sort by date descending
        shifts.sort((a, b) => {
            if (a.date && b.date) return b.date.localeCompare(a.date);
            return 0;
        });

        return NextResponse.json({ 
            shifts,
            count: shifts.length,
            lastFetched: new Date().toISOString(),
        });
    } catch (err) {
        console.error('iCal parse error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
