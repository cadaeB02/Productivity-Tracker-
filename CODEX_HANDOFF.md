# SDLX Tracker — Project Codex Handoff

*This document is the absolute ground truth for the SDLX Tracker (formerly HoldCo OS / Productivity Tracker MVP) project. Use this context to jump immediately into active development.*

---

## 1. Project Context & Business Logic
**Name:** SDLX Tracker (Super Deluxe Tracker)
**Purpose:** A unified Personal & Business Operating System. It tracks everything from deep-work time to company finances across multiple LLCs, combining the power of a Todoist-style task manager, an Akiflow-style time-blocker, and an ERP-like structure for businesses.
**The User:** Cade. He runs multiple ventures (PocketGC, Digital Mechanic, etc.).
**Key Paradigm (Global vs. Company):** The app operates on a "Global Context" via a sidebar toggle. Users can view *all* tasks/sessions globally, or switch to a specific company (e.g., PocketGC) to only see data and filter metrics for that specific LLC entity.

---

## 2. Tech Stack & Infrastructure
- **Frontend/Backend:** Next.js 14+ (App Router). `/app` directory structure.
- **Database & Auth:** Supabase (PostgreSQL).
- **Styling:** Vanilla CSS (`globals.css`). No Tailwind. The design prioritizes "premium, glassmorphic, alive, dark-mode-first" interfaces.
- **Hosting:** Vercel.
- **AI Integration:** Google Gemini API (`lib/gemini.js`) handles OCR on receipts, chat interface for the Personal Agent, and intelligent time-block planning.
- **Autonomous Coding Hook:** The repo is setting up an "OpenClaw" agent hook locally, allowing a separate agent on an old MacBook Air to autonomously write code overnight communicating via `/api/openclaw` webhook routes.
- **External Integrations:** 
  - **Plaid:** For auto-syncing bank transactions.
  - **Apple Calendar:** A local JXA script (`scripts/sync-apple-calendar.sh`) automatically fetches Apple Calendar events and POSTs them to the API, rendering Apple Calendar natively in the app.

---

## 3. Core Capabilities & Modules (The "App" folders)
- `/app/dashboard` (Nerve Center): Quick summary of timers, recent notes, tasks, & finances.
- `/app/timer`: Manual time clock + historical tracking. Auto-clock rules exist to automatically start tracking.
- `/app/schedule`: The time-blocking agenda and Task manager.
- `/app/projects`: Status management for high-level outcomes.
- `/app/filing` & `/app/treasury`: Finance management. Uploads receipts (processed by Gemini), links to matched Plaid transactions.
- `/app/notes`: Basic text logging + basic CRM features.
- `/app/agent`: A multimodal chat interface with a personal Gemini AI that has RAG access to schedule and notes.

---

## 4. The Codebase Hierarchy
- **`lib/store.js`:** The Mothership. 95% of Supabase client interactions happen via functions exported from here (e.g., `getScheduleTasks`, `addManualSession`, `upsertDocument`). Read this file to understand schemas.
- **`components/`:** Contains core layout shells `PersistentLayout.js`, the global `Sidebar.js`, and `CompanyContext.js` which provides global state to child pages.
- **`app/api/`:** Standard Next.js serverless functions.
- **`lib/migration-vX...sql`:** Foundational SQL files containing recent schema updates. The system uses a multi-tenant LLC approach where tables normally have `user_id` and an optional `company_id`.

---

## 5. Primary Architectures & Data Flow
**Schedule vs Sessions Breakdown:**
- `schedule_blocks` (Templates): "Work at the bike shop from M-F 9-5".
- `schedule_tasks` (Action Items): "Call Jon". Can have a specific date/time, or just be floating.
- `sessions` (Historical Facts): Completed work time blocks. When a user clicks "Log Shift", a session is created.
- `calendar_cache`: A local cache of the Apple Calendar so the web app can render it without lag.

---

## 6. Current Immediate Goal: The Schedule Redesign 
*(This is where you start)*

We are actively redesigning `/app/schedule/page.js` from the ground up to be a hybrid of **Todoist** and **Akiflow**, bringing the app closer to its new name, *SDLX Tracker*. 

### The Target Architecture:
1. **The Navigation Takeover:** When clicking Schedule, the main app's global sidebar compresses, and a unique **Schedule Sidebar** appears.
2. **Left Panel (Todoist Style):**
   - + Add Task
   - Search, Inbox, Today, Upcoming
   - Filters & Labels
   - My Projects vs Team Projects
   - Mini Month-Calendar picker module.
3. **Right Panel (Akiflow Style):**
   - A dynamic, vertical timeline grid (viewable as 1 day, 3 days, 1 week).
   - "Small, Medium, Large" sizing badging for Tasks.
   - Timed Tasks + synced Apple Calendar events render directly on the vertical grid.
   - Dateless tasks live in an inbox above the grid allowing for drag-and-drop onto the timeline.
   - An intuitive toggle to layer historical "Sessions" visually over the timeline to compare *planned vs reality*.

### Next immediate steps for the new AI:
1. **Scaffold the Shell:** Replace the contents of `/app/schedule/page.js` with the new two-pane layout.
2. **Task Schema Check:** Ensure `schedule_tasks` supports properties specifically for size (`small`, `medium`, `large`). 
3. **Grid Implementation:** Build a clean vanilla CSS timeline layout from scratch that renders hours (y-axis) correctly across columns.
