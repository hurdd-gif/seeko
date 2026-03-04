# Persona: Software Engineer

Load this file when working on: Next.js, API routes, Supabase queries, TypeScript types, Vitest tests.

---

## Stack

- **Framework:** Next.js 16 App Router (TypeScript, `src/` layout)
- **Auth:** Supabase (`@supabase/supabase-js` v2 + `@supabase/ssr`)
- **Data:** Supabase Postgres (queried via `@supabase/supabase-js`)
- **UI:** shadcn/ui + Tailwind v4
- **Tests:** Vitest (`npm test`)
- **Hosting:** Render

---

## App Router Patterns

- **Server Components** (default) — fetch Supabase data directly, no `useState`
- **Client Components** — `"use client"` directive, handle auth state, interactivity
- Route groups: `(auth)` for login/signup, `(dashboard)` for protected pages

```ts
// Server component fetching Supabase data
import { fetchTasks } from '@/lib/supabase/data';

export default async function TasksPage() {
  const tasks = await fetchTasks();
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

## Supabase Data Layer

All data queries live in `src/lib/supabase/data.ts`:

```ts
import { createClient } from './server';
import type { Task, Area, TeamMember, Doc } from '../types';

export async function fetchTasks(assigneeId?: string): Promise<Task[]>
export async function fetchAreas(): Promise<Area[]>
export async function fetchTeam(): Promise<TeamMember[]>
export async function fetchDocs(parentId?: string): Promise<Doc[]>
```

- Uses the server Supabase client (cookie-based auth)
- Each function creates its own client instance
- Tasks ordered by deadline, areas/team by name, docs by sort_order
- Tasks optionally filtered by `assignee_id` (user's auth UUID)

---

## TypeScript Types (`src/lib/types.ts`)

```ts
export type Task = {
  id: string;
  name: string;
  department: Department | string;
  status: TaskStatus;
  priority: Priority;
  area_id?: string;
  assignee_id?: string;
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
  department: Department | string;
  email?: string;
};

export type Profile = {
  id: string;
  display_name?: string;
  department?: string;
  role?: string;
};

export type Doc = {
  id: string;
  title: string;
  content?: string;
  parent_id?: string;
  sort_order: number;
};
```

---

## Testing

- Test runner: Vitest (`npm test`)
- Unit test Supabase data fetchers with mocked `@supabase/supabase-js`
- Test auth middleware behavior with mocked Supabase responses
- Co-locate tests: `__tests__/` next to the file being tested, or `.test.ts` suffix

---

## Skill Routing Reminders

- Before implementing any feature: invoke `test-driven-development`
- Before claiming complete: invoke `verification-before-completion`
- For bugs: invoke `systematic-debugging`
