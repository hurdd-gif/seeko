import { NextResponse } from 'next/server';
import { fetchTeam } from '@/lib/notion';

export async function GET() {
  try {
    const team = await fetchTeam();
    return NextResponse.json(team);
  } catch (error) {
    console.error('[api/notion/team]', error);
    return NextResponse.json({ error: 'Failed to fetch team' }, { status: 500 });
  }
}
