import { NextRequest, NextResponse } from 'next/server';
import { createRateLimiter } from '@/lib/rate-limiter';

// 30 requests per IP per hour — prevents the public endpoint being used to flood Nominatim
const isRateLimited = createRateLimiter(30, 60 * 60 * 1000);

export async function GET(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for')?.split(',').pop()?.trim() || 'unknown';
  if (isRateLimited(ip)) {
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
