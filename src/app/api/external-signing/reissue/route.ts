import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { token } = body;

  if (!token || typeof token !== 'string') {
    return NextResponse.json({ error: 'Token required' }, { status: 400 });
  }

  return NextResponse.json(
    { error: 'Public link reissue is disabled. Contact the sender for a new link.' },
    { status: 403 },
  );
}
