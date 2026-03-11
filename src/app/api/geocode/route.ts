import { NextRequest, NextResponse } from 'next/server';

// Rate limiter: 30 requests per IP per hour
const RATE_LIMIT = { max: 30, windowMs: 60 * 60 * 1000 };
const ipHits = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  if (ipHits.size > 200) {
    for (const [key, entry] of ipHits) { if (now > entry.resetAt) ipHits.delete(key); }
  }
  const entry = ipHits.get(ip);
  if (!entry || now > entry.resetAt) {
    ipHits.set(ip, { count: 1, resetAt: now + RATE_LIMIT.windowMs });
    return false;
  }
  if (entry.count >= RATE_LIMIT.max) return true;
  entry.count++;
  return false;
}

export async function GET(request: NextRequest) {
  const clientIp = request.headers.get('x-forwarded-for')?.split(',').pop()?.trim()
    || request.headers.get('x-real-ip')
    || 'unknown';
  if (isRateLimited(clientIp)) {
    return NextResponse.json({ error: 'Too many requests. Try again later.' }, { status: 429 });
  }

  const q = request.nextUrl.searchParams.get('q');
  if (!q || q.length < 3) {
    return NextResponse.json([]);
  }

  const params = new URLSearchParams({
    q,
    format: 'json',
    addressdetails: '1',
    limit: '5',
  });

  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?${params}`,
    {
      headers: {
        'User-Agent': 'SeekoStudio/1.0 (signing-app)',
        'Accept-Language': 'en',
      },
    }
  );

  if (!res.ok) {
    return NextResponse.json([], { status: res.status });
  }

  const data = await res.json();
  return NextResponse.json(
    data.map((r: { place_id: number; display_name: string }) => ({
      place_id: r.place_id,
      display_name: r.display_name,
    }))
  );
}
