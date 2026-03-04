import { NextResponse } from 'next/server';
import { fetchAreas } from '@/lib/notion';

export async function GET() {
  try {
    const areas = await fetchAreas();
    return NextResponse.json(areas);
  } catch (error) {
    console.error('[api/notion/areas]', error);
    return NextResponse.json({ error: 'Failed to fetch areas' }, { status: 500 });
  }
}
