import { NextResponse } from 'next/server';
import { fetchDocBlocks } from '@/lib/notion';

export async function GET() {
  try {
    const blocks = await fetchDocBlocks();
    return NextResponse.json(blocks);
  } catch (error) {
    console.error('[api/notion/docs]', error);
    return NextResponse.json({ error: 'Failed to fetch docs' }, { status: 500 });
  }
}
