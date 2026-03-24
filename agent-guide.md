# Parallax Productivity Tracker — Agent Guide

**Version: 6.0** | **Last Updated: 2026-03-24**

## Overview

This document is for the OpenClaw agent. After authenticating via `/api/agent-auth`, read this guide to understand the site structure and available actions.

## V6.0 Changes

- **NEW: Entity Foundation** — Companies can now represent formal LLCs with `is_entity`, `legal_name`, `ein`, compliance fields
- **NEW: Entity Functions** — `getEntities()`, `updateEntityCompliance()` in store.js
- All V5.0 features remain unchanged

## V5.0 Changes

- **Schedule Tab** — Calendar grid + horizontal day timeline + task notepad + AI scheduling
- **Auto-Clock** — Physical jobs auto-start at configured times (via Vercel cron)
- **Agent Schedule API** — Read/write schedule data via `/api/agent-schedule`
- **Projects Page** — Tile grid layout with drag reorder
- **Sleep Tracking** — Manual + Apple Health import
- **Multi-day Sessions** — Sessions can span midnight

---

## Site Navigation

| Page | URL | Purpose |
|------|-----|---------|
| Timer | `/` | Start/stop/pause sessions, task switcher |
| Projects | `/projects` | Manage companies, projects, tasks (tile grid) |
| Schedule | `/schedule` | Calendar, timeline, task notepad, AI scheduler |
| History | `/history` | View past sessions, edit summaries |
| Stats | `/stats` | Bar charts, pay estimates |
| AI Agent | `/agent` | Chat with AI, timesheet edits |
| Settings | `/settings` | API keys, agent token, preferences |

---

## Data Model

### Core Entities
- **Companies** → Projects → Tasks → Sessions
- Companies have `company_type` ('physical' or 'digital'), color, pay config
- Companies with `is_entity = true` are formal LLCs with `legal_name`, `ein`, `state_of_formation`, `formation_date`, `state_renewal_date`, `registered_agent`, `domains`
- Sessions store `start_time`, `end_time`, `duration`, `summary`

### Schedule Entities (V5.0)
- **schedule_blocks** — Planned time blocks (recurring or one-off)
- **schedule_tasks** — Quick-jot task items with duration estimates
- **auto_clock_rules** — Per-company auto-start rules (day + time)
- **sleep_logs** — Daily wake/sleep times

---

## API Endpoints

### POST `/api/agent-auth`
Authenticate with agent token. Returns magic link data for session establishment.

```json
{ "token": "your-agent-token-here" }
```

### GET `/api/agent-schedule?from=2026-03-01&to=2026-03-31`
Returns schedule blocks, tasks, auto-clock rules, sleep logs, and exceptions.

**Headers:** `Authorization: Bearer <agent-token>`

### POST `/api/agent-schedule`
Create schedule entries. Body can contain any combination of:

```json
{
  "blocks": [{ "label": "Physical Job", "start_time": "09:25", "end_time": "19:00", "block_type": "physical_job", "is_recurring": true, "recurring_days": [1,3,4,5] }],
  "tasks": [{ "title": "Review code", "duration_estimate": "medium" }],
  "exceptions": ["2026-03-25"],
  "auto_clock_rules": [{ "company_id": "...", "project_id": "...", "task_id": "...", "day_of_week": 1, "start_time": "09:25" }]
}
```

**Headers:** `Authorization: Bearer <agent-token>`

### POST `/api/auto-clock`
Triggers auto-clock check. Called by Vercel cron every 5 min on weekdays. Can also be called manually.

### GET `/api/auto-clock`
Returns current auto-clock rules for the authenticated user.

**Headers:** `Authorization: Bearer <agent-token>`

---

## Agent Actions

### Clocking In/Out
1. Navigate to Timer page (`/`)
2. Use task switcher to select company → project → task
3. Click play button to start, stop button to end
4. Fill in clock-out summary when stopping

### Managing Schedule
1. Navigate to Schedule page (`/schedule`)
2. Add blocks via "Add Block" button
3. Add tasks via the Task Notepad section
4. Click "AI Schedule" to get AI placement suggestions
5. Right-click a recurring day on calendar to mark as exception

### Managing Projects
1. Navigate to Projects page (`/projects`)
2. Companies display as draggable tiles
3. Click tile to expand and see projects/tasks
4. For physical companies: click ⚡ to configure auto-clock rules

### Editing Timesheets
1. Navigate to History page (`/history`)
2. Click on a session to edit summary, times, or delete
3. Or use AI Agent page (`/agent`) to edit via chat

---

## Tips for the Agent

- Always check for active sessions before starting new ones (avoid duplicates)
- When scheduling tasks, check for exceptions on recurring days
- Use the schedule API to pre-populate the calendar for the user
- Multi-day sessions (e.g., camping) should use transparent colors on the timeline
- The AI scheduler can negotiate with the user about day selection — suggest alternatives if a day is full
