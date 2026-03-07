# Task Chat Redesign — Design Doc

## Goal

Redesign the task chat/comments section to match the visual polish of the new tasks table, with improved layout, interactions, and collaboration features.

## Architecture

Slide-out panel on desktop (right side overlay with backdrop), dialog on mobile. Two-tab layout: **Details | Chat**. New DB tables for reactions and attachments, new column for threaded replies.

---

## Layout

### Desktop: Slide-out Panel
- Triggered by clicking a task row
- Right-side overlay with backdrop (clicking backdrop closes)
- Width: ~480px
- Two tabs at top: **Details** | **Chat**

### Mobile: Dialog
- Full-screen dialog triggered by clicking a task row
- Same two-tab structure inside

---

## Details Tab

Existing task detail content (name, status, assignee, deadline, description, deliverables, handoffs) moved into the Details tab.

## Chat Tab

### Message Layout
- Uniform left-aligned list (no sent/received differentiation)
- Each message: avatar, name, timestamp, content
- Visual style matches the dark theme and typography of the redesigned table

### Reactions
- Fixed emoji set: thumbs up, thumbs down, celebration, laughing, question mark, fire, heart
- Appear as small pills below each message
- Click to toggle your reaction; shows count

### Threaded Replies
- Flat list with "replying to [name]" reference above the message
- Click a message to set it as reply target
- Reply reference is a small muted line above the message content

### File Sharing
- Attach button in the compose area
- Drag and drop onto the chat area
- File previews inline (images show thumbnail, other files show icon + name)

---

## Database Changes

### New table: `task_comment_reactions`

| Column     | Type      | Notes                          |
|------------|-----------|--------------------------------|
| id         | uuid (PK) | Auto-generated                |
| comment_id | uuid (FK) | -> task_comments.id           |
| user_id    | uuid (FK) | -> profiles.id                |
| emoji      | text      | One of the 7 fixed emojis     |
| created_at | timestamptz |                              |

Unique constraint on (comment_id, user_id, emoji).

### New table: `task_comment_attachments`

| Column     | Type      | Notes                          |
|------------|-----------|--------------------------------|
| id         | uuid (PK) | Auto-generated                |
| comment_id | uuid (FK) | -> task_comments.id           |
| file_url   | text      | Supabase Storage URL          |
| file_name  | text      | Original filename             |
| file_type  | text      | MIME type                     |
| file_size  | int       | Bytes                         |
| created_at | timestamptz |                              |

### Altered table: `task_comments`

| Column      | Type      | Notes                          |
|-------------|-----------|--------------------------------|
| reply_to_id | uuid (FK) | -> task_comments.id (nullable)|

---

## Visual Style

- Dark theme consistent with tasks table
- Muted borders, OKLCH token colors
- JetBrains Mono for timestamps/metadata
- Outfit for message content
- Status colors from existing palette
- Framer Motion for panel slide-in/out and message entrance animations
