import { NextResponse } from 'next/server';
import { fetchTasks } from '@/lib/notion';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const assignee = searchParams.get('assignee') ?? undefined;
    const tasks = await fetchTasks(assignee);
    return NextResponse.json(tasks);
  } catch (error) {
    console.error('[api/notion/tasks]', error);
    return NextResponse.json({ error: 'Failed to fetch tasks' }, { status: 500 });
  }
}
