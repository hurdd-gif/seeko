# Task Notes — Private Lead-to-Assignee Instructions

## Goal

Allow admins (leads) to leave private, timestamped notes on tasks that only the assignee and other admins can see. One-way communication: admins write, assignees read.

## Data Model

New `task_notes` table:

| Column | Type | Notes |
|--------|------|-------|
| id | uuid (PK) | Auto-generated |
| task_id | uuid (FK) | → tasks.id |
| author_id | uuid (FK) | → profiles.id (admin who wrote it) |
| content | text | Note body, max 5000 chars |
| created_at | timestamptz | |

Append-only log. Each note is a separate row displayed chronologically.

### RLS

- **SELECT:** Authenticated users where they are the task assignee OR `is_admin = true`
- **INSERT:** `is_admin = true` only

### Cleanup

Add `task_notes` deletion to the boot-member cascade (before profile deletion).

## UI

### Location

Details tab of TaskDetail, between description and handoff history.

### Visibility

Only rendered if current user is the assignee or an admin. Hidden from other team members entirely.

### Assignee View (read-only)

- Section header: "Notes from Lead" with note icon
- Stack of note cards: admin avatar + name, relative timestamp, note content
- No compose input

### Admin View

- Same note card stack
- Compose area at bottom: textarea + "Add Note" button
- Optimistic update on submit
- Empty state: "No notes yet. Add instructions for the assignee."

## API

### `POST /api/tasks/[id]/notes`

- **Auth:** Admin only (`is_admin = true`)
- **Body:** `{ content: string }`
- **Validation:** Content required, max 5000 chars, task must exist
- **Action:** Insert `task_notes` row, send notification to assignee
- **Response:** `{ id, content, created_at, author_id }`

### Reading Notes

Direct Supabase client query from TaskDetail on mount. Join with profiles for author name/avatar. No real-time subscription needed (notes are infrequent).

## Notifications

When a note is added, the assignee receives a notification:
- **Kind:** `task_note`
- **Title:** "New note on [task name]"
- **Link:** `/tasks` (opens task detail)
