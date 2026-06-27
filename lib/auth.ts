import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { staffSessionCookieName, verifySessionToken } from './session';

export type StaffRole = 'admin' | 'pickup' | 'data_entry';

export interface StaffSession {
  wpUserId: number;
  username: string;
  email: string;
  role: StaffRole;
  authProvider?: 'wordpress' | 'local';
}

// Verify staff session from cookie; returns null if invalid
export async function getStaffSession(): Promise<StaffSession | null> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(staffSessionCookieName);
  return verifySessionToken(sessionCookie?.value);
}

// Middleware helper: guard routes that require auth
export async function requireAuth(): Promise<StaffSession | NextResponse> {
  const session = await getStaffSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return session;
}

export async function requireRole(roles: StaffRole[]): Promise<StaffSession | NextResponse> {
  const session = await requireAuth();
  if (session instanceof NextResponse) return session;

  if (!roles.includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  return session;
}
