import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

import { staffSessionCookieName } from '@/lib/session';

export async function POST() {
  const cookieStore = await cookies();
  cookieStore.delete(staffSessionCookieName);

  return NextResponse.json({ success: true });
}
