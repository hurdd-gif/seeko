# Persona: Information Architect

Load this file when working on: Notion database schema, content hierarchy, task taxonomy, data modeling.

---

## Overview

Notion is the **single source of truth** for SEEKO Studio. Karti manages all content in Notion.
The TypeScript types in `src/lib/types.ts` must align with Notion property names exactly.

---

## Notion Databases

### 1. Tasks DB (`NOTION_TASKS_DB_ID`)

| Property    | Notion Type | Notes                                     |
|-------------|-------------|-------------------------------------------|
| Name        | title       | Task name                                 |
| Department  | select      | Coding, Visual Art, UI/UX, Animation, Asset Creation |
| Status      | select      | Complete, In Progress, In Review, Blocked |
| Priority    | select      | High, Medium, Low                         |
| Area        | relation    | → Areas DB                                |
| Assignee    | people      | Used to filter tasks per team member      |
| Deadline    | date        |                                           |
| Description | rich_text   |                                           |

**Key:** Filter by `Assignee` property using `notion.databases.query` with `{ property: 'Assignee', people: { contains: assigneeName } }`.
The `assigneeName` comes from `profiles.notion_assignee_name` in Supabase.

---

### 2. Areas DB (`NOTION_AREAS_DB_ID`)

| Property    | Notion Type | Notes                                    |
|-------------|-------------|------------------------------------------|
| Name        | title       | Area name                                |
| Status      | select      | Active, Planned, Complete                |
| Progress    | number      | Percentage 0–100                         |
| Description | rich_text   |                                          |
| Phase       | select      | Alpha, Beta, Launch                      |

**Rows:** Dojo, Battleground, Fighting Club

---

### 3. Team DB (`NOTION_TEAM_DB_ID`)

| Property     | Notion Type | Notes                                    |
|--------------|-------------|------------------------------------------|
| Name         | title       | Full name                                |
| Role         | rich_text   | Job title / role description             |
| Department   | select      | Coding, Visual Art, UI/UX, Animation, Asset Creation |
| Email        | email       | For reference only (auth via Supabase)   |
| NotionHandle | rich_text   | @mention handle, matches Assignee names  |

---

### 4. Docs — Notion Pages

- Nested under a **"SEEKO Docs"** parent page (`NOTION_DOCS_PAGE_ID`)
- Fetched as blocks via `notion.blocks.children.list({ block_id: NOTION_DOCS_PAGE_ID })`
- Rendered by `NotionRenderer.tsx` in the app

---

## Content Hierarchy

```
SEEKO Studio (Notion workspace)
├── Tasks DB          ← linked to Areas, Assignee = team member
├── Areas DB          ← Dojo, Battleground, Fighting Club
├── Team DB           ← roster, NotionHandle matches Assignee
└── SEEKO Docs (page)
    ├── Design System
    ├── Game Design Doc
    ├── Engineering Notes
    └── Onboarding
```

---

## Task Taxonomy

**Departments:** Coding · Visual Art · UI/UX · Animation · Asset Creation
**Statuses:** Complete · In Progress · In Review · Blocked
**Priorities:** High · Medium · Low
**Game Areas:** Dojo · Battleground · Fighting Club

---

## Notion → TypeScript Property Mapping

When mapping Notion API responses, handle these common patterns:

```ts
// Title property
const name = page.properties.Name.title[0]?.plain_text ?? '';

// Select property
const status = page.properties.Status.select?.name ?? '';

// Number property
const progress = page.properties.Progress.number ?? 0;

// People property (for Assignee)
const assignee = page.properties.Assignee.people[0]?.name ?? '';

// Relation property
const areaId = page.properties.Area.relation[0]?.id ?? '';

// Date property
const deadline = page.properties.Deadline.date?.start ?? '';

// Rich text property
const description = page.properties.Description.rich_text[0]?.plain_text ?? '';
```

---

## Fresh Database Recommendation

Use fresh Notion databases with the schema above (clean property names matching TypeScript types).
Karti migrates existing tasks into the new structure before Phase 3 API integration begins.

---

## MCP Usage

Use `mcp__claude_ai_Notion__*` tools to:
- Create databases: `notion-create-database`
- Query pages: `notion-fetch`
- Search: `notion-search`
- Create/update pages: `notion-create-pages`, `notion-update-page`

Check if a database already exists (via `notion-search`) before creating a new one.

---

## Skill Routing Reminders

- Before any schema change: review existing DB structure in Notion first
- After schema changes: update this file AND `src/lib/types.ts` to stay in sync
- Trigger maintenance agent when schema changes significantly
