# Persona: Information Architect

Load this file when working on: Supabase schema, content hierarchy, task taxonomy, data modeling.

---

## Overview

Supabase Postgres is the **single source of truth** for SEEKO Studio data.
Karti manages content via the Supabase Table Editor.
The TypeScript types in `src/lib/types.ts` must align with the table columns exactly.

---

## Supabase Tables

### 1. profiles (= team roster)

Every authenticated user gets a profile row automatically on signup. This doubles as the team roster — the `/team` page lists all profiles.

| Column        | Type           | Notes                                                        |
|---------------|----------------|--------------------------------------------------------------|
| id            | uuid (PK)      | References auth.users                                        |
| display_name  | text           | User display name                                            |
| department    | department enum| Coding, Visual Art, UI/UX, Animation, Asset Creation         |
| role          | text           | Job title / role description                                 |
| is_admin      | boolean        | Full admin access                                            |
| is_contractor | boolean        | Contractor; Activity page hidden from sidebar                |
| is_investor   | boolean        | Grants access to /investor panel; investors see limited view |
| created_at    | timestamptz    |                                                              |
| nda_accepted_at   | timestamptz    | When they signed the NDA (null = not signed)                 |
| nda_signer_name   | text           | Legal full name as typed during signing                      |
| nda_signer_address| text           | Address as typed during signing                              |
| nda_ip            | text           | IP address at time of signing                                |
| nda_user_agent    | text           | Browser user agent at time of signing                        |

---

### 2. tasks

| Column      | Type             | Notes                                     |
|-------------|------------------|-------------------------------------------|
| id          | uuid (PK)        | Auto-generated                            |
| name        | text             | Task name                                 |
| department  | department enum  | Coding, Visual Art, UI/UX, Animation, Asset Creation |
| status      | task_status enum | Complete, In Progress, In Review, Blocked |
| priority    | priority enum    | High, Medium, Low                         |
| area_id     | uuid (FK)        | → areas.id                                |
| assignee_id | uuid (FK)        | → profiles.id                             |
| deadline    | date             |                                           |
| description | text             |                                           |
| created_at  | timestamptz      |                                           |

---

### 3. areas

| Column      | Type              | Notes                                    |
|-------------|-------------------|------------------------------------------|
| id          | uuid (PK)         | Auto-generated                           |
| name        | text              | Area name                                |
| status      | area_status enum  | Active, Planned, Complete                |
| progress    | int               | Percentage 0–100                         |
| description | text              |                                          |
| phase       | area_phase enum   | Alpha, Beta, Launch                      |
| created_at  | timestamptz       |                                          |

**Rows:** Dojo, Battleground, Fighting Club

---

### 4. docs

| Column     | Type        | Notes                                    |
|------------|-------------|------------------------------------------|
| id         | uuid (PK)   | Auto-generated                           |
| title      | text        | Doc title                                |
| content    | text        | HTML content                             |
| parent_id  | uuid (FK)   | → docs.id (self-referencing tree)        |
| sort_order | int         | Ordering within a parent                 |
| granted_user_ids | uuid[] | User IDs granted access when doc is department-restricted |
| created_at | timestamptz |                                          |

### 5. payments

| Column       | Type             | Notes                                  |
|--------------|------------------|----------------------------------------|
| id           | uuid (PK)        | Auto-generated                         |
| recipient_id | uuid (FK)        | → profiles.id                          |
| amount       | decimal          | Total payment amount                   |
| currency     | text             | Default 'USD'                          |
| description  | text             | Summary of what payment covers         |
| status       | payment_status   | pending, paid, cancelled               |
| paid_at      | timestamptz      | When marked as paid                    |
| created_by   | uuid (FK)        | → profiles.id (admin who created it)   |
| created_at   | timestamptz      |                                        |

### 6. payment_items

| Column     | Type             | Notes                                  |
|------------|------------------|----------------------------------------|
| id         | uuid (PK)        | Auto-generated                         |
| payment_id | uuid (FK)        | → payments.id (cascade delete)         |
| task_id    | uuid (FK, null)  | → tasks.id (null for custom items)     |
| label      | text             | Description                            |
| amount     | decimal          | Line item amount                       |

---

## Enum Types (dropdowns in Table Editor)

| Enum           | Values                                                    |
|----------------|-----------------------------------------------------------|
| department     | Coding, Visual Art, UI/UX, Animation, Asset Creation      |
| task_status    | Complete, In Progress, In Review, Blocked                 |
| priority       | High, Medium, Low                                         |
| area_status    | Active, Planned, Complete                                 |
| area_phase     | Alpha, Beta, Launch                                       |
| payment_status | pending, paid, cancelled                                  |

---

## Content Hierarchy

```
Supabase (seeko-studio project)
├── tasks          ← area_id → areas, assignee_id → profiles
├── areas          ← Dojo, Battleground, Fighting Club
├── profiles       ← auto-created from auth.users (= team roster)
├── payments       ← recipient_id → profiles, created_by → profiles
│   └── payment_items ← task_id → tasks (optional)
└── docs           ← self-referencing tree (parent_id)
    ├── Game Design Doc
    └── Onboarding
```

---

## Task Taxonomy

**Departments:** Coding · Visual Art · UI/UX · Animation · Asset Creation
**Statuses:** Complete · In Progress · In Review · Blocked
**Priorities:** High · Medium · Low
**Game Areas:** Dojo · Battleground · Fighting Club

---

## Data Access

All queries go through `src/lib/supabase/data.ts`:

```ts
import { fetchTasks, fetchAreas, fetchTeam, fetchDocs } from '@/lib/supabase/data';

const tasks = await fetchTasks(userId);   // optional assignee filter
const areas = await fetchAreas();
const team  = await fetchTeam();          // queries profiles table
const docs  = await fetchDocs(parentId);  // optional parent filter, null = top-level
```

---

## RLS Policies

- `profiles`: any authenticated user can read all profiles (needed for team page)
- `tasks`, `areas`, `docs`: any authenticated user can read

Doc visibility is enforced in app logic: a doc is locked for a user unless they are admin, their department is in `restricted_department`, or their user id is in `granted_user_ids` (granted access despite department restriction).

Full schema: `docs/supabase-schema.sql`

---

## Skill Routing Reminders

- Before any schema change: review `docs/supabase-schema.sql` first
- After schema changes: update this file AND `src/lib/types.ts` to stay in sync
- Trigger maintenance agent when schema changes significantly
