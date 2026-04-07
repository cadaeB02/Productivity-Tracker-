import { NextResponse } from 'next/server';

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
            const key = line.substring(0, colonIdx).split(';')[0];
            const value = line.substring(colonIdx + 1);

            switch (key) {
                case 'SUMMARY':
                    current.summary = value;
                    break;
                case 'DTSTART':
                    current.start = parseICalDate(value);
                    break;
                case 'DTEND':
                    current.end = parseICalDate(value);
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

function parseICalDate(str) {
    // Format: 20260407T140000Z or 20260407T140000
    if (!str) return null;
    const clean = str.replace(/[^0-9TZ]/g, '');
    const year = clean.substring(0, 4);
    const month = clean.substring(4, 6);
    const day = clean.substring(6, 8);
    const hour = clean.substring(9, 11) || '00';
    const minute = clean.substring(11, 13) || '00';
    const second = clean.substring(13, 15) || '00';
    const isUTC = clean.endsWith('Z');
    
    if (isUTC) {
        return new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}Z`).toISOString();
    }
    return new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}`).toISOString();
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
    // Return the summary as employer name if can't detect
    return event.summary || 'Unknown';
}

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const icalUrl = searchParams.get('url');
        
        if (!icalUrl) {
            return NextResponse.json({ error: 'No iCal URL provided' }, { status: 400 });
        }

        // Fetch the iCal feed
        const response = await fetch(icalUrl, {
            headers: { 'User-Agent': 'HoldCo-OS/1.0' },
            next: { revalidate: 300 }, // Cache for 5 minutes
        });

        if (!response.ok) {
            return NextResponse.json({ error: `Failed to fetch iCal feed: ${response.status}` }, { status: 502 });
        }

        const icsText = await response.text();
        const events = parseICS(icsText);

        // Enrich with employer detection and format
        const shifts = events.map(event => ({
            uid: event.uid,
            summary: event.summary || '',
            employer: detectEmployer(event),
            start: event.start,
            end: event.end,
            location: event.location || '',
            description: event.description || '',
            date: event.start ? event.start.split('T')[0] : null,
            startTime: event.start ? new Date(event.start).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }) : null,
            endTime: event.end ? new Date(event.end).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }) : null,
            durationHours: event.start && event.end 
                ? Math.round((new Date(event.end) - new Date(event.start)) / 3600000 * 100) / 100 
                : null,
        }));

        // Sort by date descending (most recent first)
        shifts.sort((a, b) => new Date(b.start) - new Date(a.start));

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
