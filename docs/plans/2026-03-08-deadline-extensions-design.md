# Deadline Extension Requests — Design

**Goal:** Let team members request more time on a task deadline. Admins receive a notification, review in-context inside TaskDetail, and approve or deny.

## Data Model

New `deadline_extensions` table:

| Column | Type | Notes |
|--------|------|-------|
| id | uuid (PK) | Auto-generated |
| task_id | uuid (FK) | → tasks.id |
| requested_by | uuid (FK) | → profiles.id |
| extra_hours | integer | Offset in hours (days = n × 24) |
| original_deadline | date | Snapshot of deadline at request time |
| new_deadline | date | original + offset |
| status | text | pending, approved, denied |
| decided_by | uuid (FK, nullable) | → profiles.id |
| decided_at | timestamptz (nullable) | When admin acted |
| denial_reason | text (nullable) | Optional note on denial |
| created_at | timestamptz | Default now() |

**RLS:**
- Members can read their own requests + insert for tasks they're assigned to
- Admins can read all + update status

**Constraint:** Only one pending request per task at a time (enforced in API).

## Notification Kinds

Three new kinds added to `NotificationKind`:
- `deadline_extension_requested` — sent to all admins
- `deadline_extension_approved` — sent to requester
- `deadline_extension_denied` — sent to requester

## Team Member Flow (TaskDetail)

"Request more time" button appears when:
- User is the assignee
- Task has a deadline
- No pending request exists

Clicking reveals an inline form:
- Segmented toggle: Hours / Days
- Number input for amount
- Preview: "New deadline: Mar 15"
- Submit button

While pending: button replaced by status line "Extension requested — waiting for approval" with amount shown.

## Admin Flow (TaskDetail)

Banner at top of TaskDetail when pending request exists:
- Shows: requester name, amount, current → proposed deadline
- Approve button (green accent) — updates deadline immediately
- Deny button (ghost) — reveals optional reason text input, then confirm

## API Routes

- `POST /api/deadline-extensions` — create request (validates assignee, deadline exists, no pending)
- `PATCH /api/deadline-extensions/[id]` — approve or deny (admin only, updates task deadline on approve)

Both trigger notifications via existing `/api/notify/*`.

## Activity Log

New action types logged to activity table:
- "Requested extension" on task
- "Approved extension" / "Denied extension" on task
