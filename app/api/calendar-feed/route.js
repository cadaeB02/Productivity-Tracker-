import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Generate iCal date string
function toICalDate(dateStr, timeStr) {
    if (!dateStr || !timeStr) return null;
    const [y, m, d] = dateStr.split('-');
    const [h, min] = timeStr.split(':');
    return `${y}${m}${d}T${h}${min}00`;
}

// Escape iCal text
function escapeIcal(text) {
    return (text || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const userId = searchParams.get('uid');
        
        if (!userId) {
            return new Response('Missing uid parameter. Subscribe with: /api/calendar-feed?uid=YOUR_USER_ID', {
                status: 400,
                headers: { 'Content-Type': 'text/plain' },
            });
        }

        // Fetch schedule blocks for this user
        const { data: blocks, error } = await supabase
            .from('schedule_blocks')
            .select('*, companies(name, color)')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(500);

        if (error) {
            console.error('Calendar feed error:', error);
            return new Response('Error fetching schedule data', { status: 500 });
        }

        // Build iCal feed
        const now = new Date();
        const lines = [
            'BEGIN:VCALENDAR',
            'VERSION:2.0',
            'PRODID:-//HoldCo OS//Schedule Feed//EN',
            'CALSCALE:GREGORIAN',
            'METHOD:PUBLISH',
            'X-WR-CALNAME:HoldCo OS Schedule',
            'X-WR-TIMEZONE:America/Denver',
            'REFRESH-INTERVAL;VALUE=DURATION:PT15M',
            'X-PUBLISHED-TTL:PT15M',
        ];

        for (const block of (blocks || [])) {
            if (block.is_recurring && block.recurring_days?.length > 0) {
                // For recurring blocks, generate events for the next 90 days
                const startDate = new Date();
                startDate.setDate(startDate.getDate() - 7); // Include recent past
                const endDate = new Date();
                endDate.setDate(endDate.getDate() + 90);

                for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
                    if (block.recurring_days.includes(d.getDay())) {
                        const dateStr = d.toISOString().split('T')[0];
                        const dtStart = toICalDate(dateStr, block.start_time);
                        const dtEnd = toICalDate(dateStr, block.end_time);
                        if (!dtStart || !dtEnd) continue;

                        lines.push('BEGIN:VEVENT');
                        lines.push(`UID:holdco-${block.id}-${dateStr}@holdco-os`);
                        lines.push(`DTSTAMP:${now.toISOString().replace(/[-:]/g, '').split('.')[0]}Z`);
                        lines.push(`DTSTART;TZID=America/Denver:${dtStart}`);
                        lines.push(`DTEND;TZID=America/Denver:${dtEnd}`);
                        lines.push(`SUMMARY:${escapeIcal(block.label)}`);
                        if (block.companies?.name) {
                            lines.push(`DESCRIPTION:${escapeIcal(block.companies.name)} — ${escapeIcal(block.block_type || 'planned')}`);
                        }
                        lines.push(`CATEGORIES:${escapeIcal(block.block_type || 'planned')}`);
                        lines.push('END:VEVENT');
                    }
                }
            } else if (block.date) {
                // One-off block
                const dtStart = toICalDate(block.date, block.start_time);
                const dtEnd = toICalDate(block.date, block.end_time);
                if (!dtStart || !dtEnd) continue;

                lines.push('BEGIN:VEVENT');
                lines.push(`UID:holdco-${block.id}@holdco-os`);
                lines.push(`DTSTAMP:${now.toISOString().replace(/[-:]/g, '').split('.')[0]}Z`);
                lines.push(`DTSTART;TZID=America/Denver:${dtStart}`);
                lines.push(`DTEND;TZID=America/Denver:${dtEnd}`);
                lines.push(`SUMMARY:${escapeIcal(block.label)}`);
                if (block.companies?.name) {
                    lines.push(`DESCRIPTION:${escapeIcal(block.companies.name)} — ${escapeIcal(block.block_type || 'planned')}`);
                }
                lines.push(`CATEGORIES:${escapeIcal(block.block_type || 'planned')}`);
                lines.push('END:VEVENT');
            }
        }

        // Also include scheduled tasks from Task Notepad
        const { data: tasks } = await supabase
            .from('schedule_tasks')
            .select('*')
            .eq('user_id', userId)
            .not('scheduled_date', 'is', null)
            .not('scheduled_start_time', 'is', null)
            .limit(200);

        for (const task of (tasks || [])) {
            const dtStart = toICalDate(task.scheduled_date, task.scheduled_start_time);
            const dtEnd = toICalDate(task.scheduled_date, task.scheduled_end_time || task.scheduled_start_time);
            if (!dtStart) continue;

            // If no end time, default to 1 hour after start
            let finalEnd = dtEnd;
            if (!task.scheduled_end_time && dtStart) {
                const startH = parseInt(task.scheduled_start_time.split(':')[0]);
                const startM = task.scheduled_start_time.split(':')[1];
                finalEnd = toICalDate(task.scheduled_date, `${String(startH + 1).padStart(2, '0')}:${startM}`);
            }

            const statusEmoji = task.status === 'done' ? '✅' : '📋';
            lines.push('BEGIN:VEVENT');
            lines.push(`UID:holdco-task-${task.id}@holdco-os`);
            lines.push(`DTSTAMP:${now.toISOString().replace(/[-:]/g, '').split('.')[0]}Z`);
            lines.push(`DTSTART;TZID=America/Denver:${dtStart}`);
            lines.push(`DTEND;TZID=America/Denver:${finalEnd || dtStart}`);
            lines.push(`SUMMARY:${statusEmoji} ${escapeIcal(task.title)}`);
            lines.push(`DESCRIPTION:Duration: ${task.duration_estimate || 'unknown'}\\nStatus: ${task.status || 'pending'}`);
            lines.push('CATEGORIES:task');
            lines.push('END:VEVENT');
        }

        lines.push('END:VCALENDAR');

        return new Response(lines.join('\r\n'), {
            status: 200,
            headers: {
                'Content-Type': 'text/calendar; charset=utf-8',
                'Content-Disposition': 'inline; filename="holdco-schedule.ics"',
                'Cache-Control': 'no-cache, no-store, must-revalidate',
            },
        });
    } catch (err) {
        console.error('Calendar feed error:', err);
        return new Response('Server error', { status: 500 });
    }
}
