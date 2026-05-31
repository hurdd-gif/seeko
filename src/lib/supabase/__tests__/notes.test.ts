import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchInboxNotes, archiveNote, createNote, convertNoteToTask } from '../data';

vi.mock('../server', () => ({
  createClient: vi.fn(),
}));

describe('notes data layer', () => {
  beforeEach(() => vi.clearAllMocks());

  it('fetchInboxNotes returns open notes ordered desc by created_at', async () => {
    const order = vi.fn().mockResolvedValue({ data: [{ id: 'n1', status: 'open' }], error: null });
    const eq = vi.fn().mockReturnValue({ order });
    const select = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ select });
    const { createClient } = await import('../server');
    (createClient as any).mockResolvedValue({ from });

    const notes = await fetchInboxNotes();
    expect(from).toHaveBeenCalledWith('notes');
    expect(select).toHaveBeenCalledWith('*');
    expect(eq).toHaveBeenCalledWith('status', 'open');
    expect(order).toHaveBeenCalledWith('created_at', { ascending: false });
    expect(notes).toEqual([{ id: 'n1', status: 'open' }]);
  });

  it('archiveNote updates status to archived', async () => {
    const eq = vi.fn().mockResolvedValue({ data: null, error: null });
    const update = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ update });
    const { createClient } = await import('../server');
    (createClient as any).mockResolvedValue({ from });

    await archiveNote('n1');
    expect(from).toHaveBeenCalledWith('notes');
    expect(update).toHaveBeenCalledWith({ status: 'archived' });
    expect(eq).toHaveBeenCalledWith('id', 'n1');
  });

  it('createNote inserts a note for the authed user and returns it', async () => {
    const inserted = { id: 'n2', body: 'hi', source: 'web', created_by: 'u1', status: 'open' };
    const single = vi.fn().mockResolvedValue({ data: inserted, error: null });
    const selectAfterInsert = vi.fn().mockReturnValue({ single });
    const insert = vi.fn().mockReturnValue({ select: selectAfterInsert });
    const from = vi.fn().mockReturnValue({ insert });
    const getUser = vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } });
    const { createClient } = await import('../server');
    (createClient as any).mockResolvedValue({ from, auth: { getUser } });

    const note = await createNote('hi');
    expect(getUser).toHaveBeenCalled();
    expect(from).toHaveBeenCalledWith('notes');
    expect(insert).toHaveBeenCalledWith({ body: 'hi', source: 'web', created_by: 'u1' });
    expect(selectAfterInsert).toHaveBeenCalledWith('*');
    expect(note).toEqual(inserted);
  });

  it('createNote throws Unauthenticated when there is no user', async () => {
    const from = vi.fn();
    const getUser = vi.fn().mockResolvedValue({ data: { user: null } });
    const { createClient } = await import('../server');
    (createClient as any).mockResolvedValue({ from, auth: { getUser } });

    await expect(createNote('hi')).rejects.toThrow('Unauthenticated');
    expect(from).not.toHaveBeenCalled();
  });

  it('convertNoteToTask inserts a task with defaults and archives the note', async () => {
    const created = { id: 't1', name: 'Do the thing', department: 'Coding', status: 'In Progress', priority: 'Medium' };

    const taskSingle = vi.fn().mockResolvedValue({ data: created, error: null });
    const taskSelect = vi.fn().mockReturnValue({ single: taskSingle });
    const taskInsert = vi.fn().mockReturnValue({ select: taskSelect });

    const noteEq = vi.fn().mockResolvedValue({ data: null, error: null });
    const noteUpdate = vi.fn().mockReturnValue({ eq: noteEq });

    const from = vi.fn((table: string) => {
      if (table === 'tasks') return { insert: taskInsert };
      if (table === 'notes') return { update: noteUpdate };
      throw new Error(`unexpected table ${table}`);
    });

    const { createClient } = await import('../server');
    (createClient as any).mockResolvedValue({ from });

    const result = await convertNoteToTask('n1', { name: 'Do the thing', department: 'Coding' });

    expect(from).toHaveBeenCalledWith('tasks');
    expect(taskInsert).toHaveBeenCalledWith({
      name: 'Do the thing',
      department: 'Coding',
      status: 'In Progress',
      priority: 'Medium',
    });
    expect(from).toHaveBeenCalledWith('notes');
    expect(noteUpdate).toHaveBeenCalledWith({ status: 'archived', converted_to_task_id: 't1' });
    expect(noteEq).toHaveBeenCalledWith('id', 'n1');
    expect(result).toEqual(created);
  });
});
