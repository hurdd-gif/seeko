# Decks in Documents — Design

**Date:** 2026-03-08
**Status:** Approved

## Overview

Add presentation decks as a special document type in SEEKO Studio. Admins upload PDFs which are split into slide images. Team members and investors view decks inline (scrollable) or in fullscreen presentation mode. Uses the same permission system as docs.

## Data Model

Decks reuse the existing `docs` table with two new columns:

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `type` | text | `'doc'` | `'doc'` or `'deck'` — existing docs unaffected |
| `slides` | jsonb | `null` | Array of `{ url: string, sort_order: number }` — Supabase Storage URLs |

Existing columns reused:
- `title` — deck title
- `content` — deck description (optional)
- `restricted_department` — department access control
- `granted_user_ids` — individual user access grants
- `sort_order`, `created_at`, `updated_at` — standard metadata

Cover thumbnail is the first slide image (no separate column).

## Upload Flow (Admin Only)

1. Admin clicks "New Deck" on docs page
2. Fills in title + optional description
3. Sets department restrictions / granted users (same UI as doc editor)
4. Uploads a PDF file
5. Server splits PDF into per-page images (`pdf-lib` + `sharp` or similar)
6. Each page image uploaded to Supabase Storage bucket `deck-slides`
7. Slide URLs saved to `slides` jsonb column
8. Admin can reorder/delete individual slides or re-upload PDF to replace all

## Docs Page Changes

- **Tab toggle** at top: "Documents | Decks" — filters list by `type` column
- **Deck cards** show first slide as visual thumbnail instead of text preview
- Same department grouping, search, lock/access behavior as docs

## Deck Viewer

- **Inline scroll (default):** Dialog shows all slides stacked vertically, scrollable, with slide numbers
- **Fullscreen mode:** "Present" button enters fullscreen — one slide visible, left/right arrow + keyboard navigation, slide counter (1/5), Escape to exit

## Permissions

Identical to docs — `restricted_department`, `granted_user_ids`, admin sees all. No new permission logic.

## Storage

- **Bucket:** `deck-slides` (new Supabase Storage bucket, public read)
- **Path format:** `{deck_id}/{slide_number}.webp`
- **Image format:** WebP for small file sizes
- **Max PDF size:** TBD (likely 50MB)

## API Changes

| Endpoint | Method | Change |
|----------|--------|--------|
| `POST /api/docs` | POST | Accept `type: 'deck'` |
| `PATCH /api/docs/[id]` | PATCH | Support `slides` field updates |
| `POST /api/docs/upload-deck` | POST | **New** — accepts PDF, returns slide URLs |

## New Components

- `DeckUploader` — PDF upload with progress, preview of extracted slides
- `DeckViewer` — inline scroll view with fullscreen toggle
- `DeckSlideshow` — fullscreen presentation mode (arrows, keyboard, counter)
- `DeckCard` — card variant with slide thumbnail for docs list

## Out of Scope

- In-app slide editing (decks are authored externally)
- Public/unauthenticated link sharing
- Tags/categories on decks
- Video embedding in slides
