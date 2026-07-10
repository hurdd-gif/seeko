import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(__dirname, '../../..');

describe('security RLS policies', () => {
  it('retires the never-applied 20260619 hardening as an inert superseded stub', () => {
    const migration = fs.readFileSync(
      path.join(root, 'supabase/migrations/20260619000001_harden_rls_for_docs_tasks_attachments.sql'),
      'utf8'
    );

    // The 20260619 assignee-only hardening was never applied (verified live
    // 2026-07-10). Its body is emptied so a stray db push can't cold-apply it
    // over the live staff policies; it points at the migrations that replaced it.
    expect(migration).toContain('SUPERSEDED — never applied');
    expect(migration).toContain('20260710193947_tasks_staff_rls');
    expect(migration).toContain('20260710200000_tasks_api_only_writes');
    // Inert: no policy/function DDL survives.
    expect(migration).not.toMatch(/DROP POLICY/i);
    expect(migration).not.toMatch(/CREATE POLICY/i);
    expect(migration).not.toMatch(/CREATE OR REPLACE FUNCTION/i);
  });

  it('keeps the bootstrap schema aligned with the live staff-scoped tasks RLS + deploy-staged api-only writes', () => {
    const schema = fs.readFileSync(path.join(root, 'docs/supabase-schema.sql'), 'utf8');

    // tasks: verified live via pg_policies 2026-07-10 — SELECT/INSERT/UPDATE
    // scoped to staff (is_staff_for_rls = admin OR non-investor), DELETE
    // admin-only. The deploy-staged api-only migration will later drop the staff
    // INSERT/UPDATE policies; the schema doc reflects the live Phase A state now.
    expect(schema).toContain('create policy "Staff can read tasks"');
    expect(schema).toContain('public.is_staff_for_rls(auth.uid())');
    expect(schema).toContain('create policy "Staff can insert tasks"');
    expect(schema).toContain('create policy "Staff can update tasks"');
    expect(schema).toContain('create policy "Only admins can delete tasks"');
    expect(schema).toContain('-- NOTE (2026-07-10): staff-scoped tasks access is live via');
    // The old broad authenticated tasks policies are gone from the doc.
    expect(schema).not.toContain('create policy "Authenticated users can read tasks"');
    expect(schema).not.toContain('create policy "Authenticated users can insert tasks"');
    expect(schema).not.toContain('create policy "Authenticated users can update tasks"');
    expect(schema).not.toContain('create policy "Authorized users can read tasks"');

    // task_milestone/milestones still gate through can_read_task_for_rls in the
    // doc (live drift is tracked as a separate follow-up, not touched here).
    expect(schema).toContain('create policy "Authorized users can read task_milestone"');
    expect(schema).toContain('create policy "Authorized users can read milestones"');
    expect(schema).toContain('public.can_read_task_for_rls(task_id, auth.uid())');

    // docs/activity remain as documented (unchanged by the tasks correction).
    expect(schema).toContain('create policy "Authorized users can read docs"');
    expect(schema).toContain('create policy "Authorized users can read activity"');
    expect(schema).toContain('restricted_department text[] default null');
    expect(schema).toContain('task_id    uuid references public.tasks(id) on delete set null');
    expect(schema).toContain('doc_id     uuid references public.docs(id) on delete set null');
    expect(schema).toContain('public.can_read_doc_for_rls(restricted_department, granted_user_ids, auth.uid())');
    expect(schema).not.toContain('create policy "Authenticated users can read docs"');
    expect(schema).not.toContain('create policy "Authenticated users can read activity"');
  });
});
