import { NextResponse } from 'next/server';

import { getStaffSession } from '@/lib/auth';

export async function GET() {
  const session = await getStaffSession();

  if (!session) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  return NextResponse.json({
    authenticated: true,
    user: session,
  });
}
