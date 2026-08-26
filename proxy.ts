import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { after } from 'next/server';
import { trackApiAccess } from '@/lib/redis';

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // /api/ へのアクセスをバックグラウンドで集計（レスポンスをブロックしない）
  if (pathname.startsWith('/api/')) {
    const method = request.method;
    after(async () => {
      await trackApiAccess(method, pathname);
    });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/api/:path*'],
};
