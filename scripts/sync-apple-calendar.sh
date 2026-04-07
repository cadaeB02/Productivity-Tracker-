#!/bin/bash
# ============================================================
# HoldCo OS — Apple Calendar Sync Script
# Reads ALL calendars from Apple Calendar.app via JXA
# and pushes events to HoldCo OS API
# ============================================================

# ── Config ──
HOLDCO_URL="https://productivitytrackermvp.vercel.app"
API_ENDPOINT="${HOLDCO_URL}/api/apple-calendar"

# Auth: just use your HoldCo OS email — no UUID needed!
HOLDCO_EMAIL="${HOLDCO_EMAIL:-cade.bergthold@gmail.com}"

# Optional sync key for extra security
SYNC_KEY="${HOLDCO_SYNC_KEY:-}"

# How many days ahead/behind to sync
DAYS_BACK=7
DAYS_AHEAD=90

echo "📅 Syncing Apple Calendar → HoldCo OS..."
echo "   Email: $HOLDCO_EMAIL"
echo "   Range: ${DAYS_BACK} days back, ${DAYS_AHEAD} days ahead"

# ── Read Calendar events using JXA (JavaScript for Automation) ──
EVENTS_JSON=$(osascript -l JavaScript << 'JXAEOF'
const app = Application("Calendar");
const now = new Date();
const startDate = new Date(now);
startDate.setDate(startDate.getDate() - 7);
const endDate = new Date(now);
endDate.setDate(endDate.getDate() + 90);

const allEvents = [];
const calendars = app.calendars();

for (const cal of calendars) {
    const calName = cal.name();
    const calColor = cal.color() || null;
    
    try {
        const events = cal.events.whose({
            _and: [
                { startDate: { _greaterThan: startDate }},
                { startDate: { _lessThan: endDate }}
            ]
        })();
        
        for (const ev of events) {
            try {
                const start = ev.startDate();
                const end = ev.endDate();
                allEvents.push({
                    uid: ev.uid(),
                    summary: ev.summary() || '',
                    calendar: calName,
                    calendarColor: calColor,
                    location: ev.location() || '',
                    description: (ev.description() || '').substring(0, 500),
                    allDay: ev.alldayEvent(),
                    start: start ? start.toISOString() : null,
                    end: end ? end.toISOString() : null,
                    date: start ? start.toISOString().split('T')[0] : null,
                    startTime: start ? start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }) : null,
                    endTime: end ? end.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }) : null,
                    status: ev.status() || 'none',
                });
            } catch (evErr) {
                // Skip problematic events
            }
        }
    } catch (calErr) {
        // Calendar might not have events in range
    }
}

JSON.stringify(allEvents);
JXAEOF
)

if [ -z "$EVENTS_JSON" ] || [ "$EVENTS_JSON" = "null" ]; then
    echo "⚠️  No events found or Calendar access denied."
    echo "   If prompted, allow Terminal access to Calendar."
    exit 1
fi

EVENT_COUNT=$(echo "$EVENTS_JSON" | python3 -c "import sys,json; print(len(json.loads(sys.stdin.read())))" 2>/dev/null || echo "?")
echo "   Found: $EVENT_COUNT events"

# ── POST to HoldCo OS (using email for auth) ──
PAYLOAD=$(python3 -c "
import json, sys
events = json.loads(sys.stdin.read())
payload = {
    'events': events,
    'email': '$HOLDCO_EMAIL',
    'syncKey': '$SYNC_KEY'
}
print(json.dumps(payload))
" <<< "$EVENTS_JSON")

RESPONSE=$(curl -s -X POST "$API_ENDPOINT" \
    -H "Content-Type: application/json" \
    -d "$PAYLOAD")

echo "   Response: $RESPONSE"
echo "✅ Apple Calendar synced to HoldCo OS!"
