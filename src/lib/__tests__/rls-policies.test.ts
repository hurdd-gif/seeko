import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(__dirname, '../../..');

describe('security RLS policies', () => {
  it('ships a migration that replaces broad docs/tasks/activity/attachment access', () => {
    const migration = fs.readFileSync(
      path.join(root, 'supabase/migrations/20260619000001_harden_rls_for_docs_tasks_attachments.sql'),
      'utf8'
    );

    expect(migration).toContain('DROP POLICY IF EXISTS "Authenticated users can read docs"');
    expect(migration).toContain('DROP POLICY IF EXISTS "Authenticated users can read tasks"');
    expect(migration).toContain('DROP POLICY IF EXISTS "Authenticated users can read activity"');
    expect(migration).toContain('DROP POLICY IF EXISTS "Authenticated can read comment attachments"');
    expect(migration).toContain('DROP POLICY IF EXISTS "Authenticated can upload chat attachments"');
    expect(migration).toContain('public.can_read_doc_for_rls(restricted_department, granted_user_ids, auth.uid())');
    expect(migration).toContain('public.can_read_task_for_rls(id, auth.uid())');
    expect(migration).toContain('public.can_read_task_comment_for_rls(comment_id, auth.uid())');
    expect(migration).toContain("bucket_id = 'chat-attachments'");
    expect(migration).toContain('public.can_read_task_path_for_rls((storage.foldername(name))[1], auth.uid())');
  });

  it('keeps the bootstrap schema aligned with hardened docs/tasks/activity reads', () => {
    const schema = fs.readFileSync(path.join(root, 'docs/supabase-schema.sql'), 'utf8');

    expect(schema).toContain('create policy "Authorized users can read tasks"');
    expect(schema).toContain('create policy "Authorized users can read task_milestone"');
    expect(schema).toContain('create policy "Authorized users can read milestones"');
    expect(schema).toContain('create policy "Authorized users can read docs"');
    expect(schema).toContain('create policy "Authorized users can read activity"');
    expect(schema).toContain('restricted_department text[] default null');
    expect(schema).toContain('task_id    uuid references public.tasks(id) on delete set null');
    expect(schema).toContain('doc_id     uuid references public.docs(id) on delete set null');
    expect(schema).toContain('public.can_read_task_for_rls(id, auth.uid())');
    expect(schema).toContain('public.can_read_doc_for_rls(restricted_department, granted_user_ids, auth.uid())');
    expect(schema).not.toContain('create policy "Authenticated users can read tasks"');
    expect(schema).not.toContain('create policy "Authenticated users can read docs"');
    expect(schema).not.toContain('create policy "Authenticated users can read activity"');
  });
});
