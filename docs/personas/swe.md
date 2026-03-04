# Persona: Software Engineer

Load this file when working on: Next.js, API routes, Supabase, Notion API, TypeScript types, Vitest tests.

---

## Stack

- **Framework:** Next.js 14 App Router (TypeScript, `src/` layout)
- **Auth:** Supabase (`@supabase/supabase-js` v2 + `@supabase/ssr`)
- **Data:** Notion API (`@notionhq/client`)
- **UI:** HeroUI v3 (`@heroui/react@beta`)
- **Tests:** Vitest (`npm test`)
- **Hosting:** Render

---

## App Router Patterns

- **Server Components** (default) — fetch Notion data directly, no `useState`
- **Client Components** — `"use client"` directive, handle auth state, interactivity
- Route groups: `(auth)` for login/signup, `(dashboard)` for protected pages
- API routes live in `src/app/api/` as `route.ts` files using `NextRequest`/`NextResponse`

```ts
// Server component fetching Notion data
export default async function TasksPage() {
  const tasks = await fetchTasks(); // lib/notion.ts
  return <TasksTable tasks={tasks} />;
}
```

---

## Supabase Auth

### Client (browser)
```ts
// src/lib/supabase/client.ts
import { createBrowserClient } from '@supabase/ssr';
export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);
```

### Server (RSC + middleware)
```ts
// src/lib/supabase/server.ts
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: (c) => c.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } }
  );
}
```

### Proxy — protect `(dashboard)` routes
**IMPORTANT: Next.js 16 renamed `middleware.ts` → `proxy.ts`, function name `middleware` → `proxy`**

```ts
// src/proxy.ts
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => request.cookies.getAll(), setAll: (c) => c.forEach(({ name, value, options }) => response.cookies.set(name, value, options)) } }
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user && !request.nextUrl.pathname.startsWith('/login')) {
    return NextResponse.redirect(new URL('/login', request.url));
  }
  return response;
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico|login).*)'] };
```

---

## Notion API

**IMPORTANT: `@notionhq/client` v5 API changes:**
- `notion.databases.query` → `notion.dataSources.query` (renamed)
- `database_id` parameter → `data_source_id`
- People filters require Notion User ID (UUID), not a display name

```ts
// src/lib/notion.ts
import { Client } from '@notionhq/client';

const notion = new Client({ auth: process.env.NOTION_TOKEN });

export async function fetchTasks(assigneeName?: string) {
  const res = await notion.dataSources.query({
    data_source_id: process.env.NOTION_TASKS_DB_ID!,
    sorts: [{ property: 'Deadline', direction: 'ascending' }],
  });
  const tasks = res.results.map(pageToTask);
  // Filter by assignee name in-memory (profile.notion_assignee_name)
  return assigneeName
    ? tasks.filter(t => t.assignee?.toLowerCase() === assigneeName.toLowerCase())
    : tasks;
}
```

- Filter tasks in-memory by comparing `task.assignee` (from Notion people property `.name`) against `profile.notion_assignee_name`
- All fetcher functions should be typed — define `Task`, `Area`, `TeamMember` in `src/lib/types.ts`
- Use `notion.blocks.children.list` for Docs page rendering

---

## TypeScript Types (`src/lib/types.ts`)

```ts
export type Task = {
  id: string;
  name: string;
  department: string;
  status: 'Complete' | 'In Progress' | 'In Review' | 'Blocked';
  priority: 'High' | 'Medium' | 'Low';
  area?: string;
  assignee?: string;
  deadline?: string;
  description?: string;
};

export type Area = {
  id: string;
  name: string;
  status: string;
  progress: number;
  description?: string;
  phase?: string;
};

export type TeamMember = {
  id: string;
  name: string;
  role: string;
  department: string;
  email?: string;
  notionHandle?: string;
};

export type Profile = {
  id: string;
  notion_assignee_name: string;
  display_name?: string;
  department?: string;
  role?: string;
};
```

---

## API Route Convention

```ts
// src/app/api/notion/tasks/route.ts
import { NextResponse } from 'next/server';
import { fetchTasks } from '@/lib/notion';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const assignee = searchParams.get('assignee') ?? undefined;
  const tasks = await fetchTasks(assignee);
  return NextResponse.json(tasks);
}
```

---

## api2cli Skills (post-integration)

After Notion integration is live:
1. Run `api2cli` against the Notion API → outputs `.claude/skills/notion/SKILL.md`
2. Run `api2cli` against the Supabase REST API → outputs `.claude/skills/supabase/SKILL.md`
3. Use these generated skills for all future Notion DB queries and Supabase mutations

---

## Testing

- Test runner: Vitest (`npm test`)
- Unit test Notion fetchers with mocked `@notionhq/client`
- Integration test API routes using `vitest` + `msw`
- Test auth middleware behavior with mocked Supabase responses
- Co-locate tests: `__tests__/` next to the file being tested, or `.test.ts` suffix

---

## Skill Routing Reminders

- Before implementing any feature: invoke `test-driven-development`
- Before claiming complete: invoke `verification-before-completion`
- For bugs: invoke `systematic-debugging`
