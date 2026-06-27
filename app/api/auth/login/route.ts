import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

import { createSessionToken, staffSessionCookieName, staffSessionMaxAgeSeconds } from '@/lib/session';
import { verifyLocalPwaAccount } from '@/lib/local-pwa-accounts';
import { getWpJsonBase } from '@/lib/wp-client';

// Minimal staff auth: verify WP app-password, issue cookie session
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { username, password } = body;

    if (!username || !password) {
      return NextResponse.json({ error: 'Username and password required' }, { status: 400 });
    }

    const localAccount = verifyLocalPwaAccount(username, password);
    if (localAccount) {
      const token = createSessionToken(localAccount);
      const cookieStore = await cookies();

      cookieStore.set(staffSessionCookieName, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: staffSessionMaxAgeSeconds,
        path: '/',
      });

      return NextResponse.json({
        success: true,
        user: {
          id: localAccount.wpUserId,
          username: localAccount.username,
          email: localAccount.email,
          role: localAccount.role,
        },
      });
    }

    // Verify credentials against WordPress (app-password or user/pass)
    const wpVerify = await fetch(`${getWpJsonBase()}/wp/v2/users/me`, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`,
      },
    });

    if (!wpVerify.ok) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    const wpUser = await wpVerify.json();
    const email = wpUser.email || username;
    const displayName = wpUser.name || wpUser.slug || username;
    const token = createSessionToken({
      wpUserId: wpUser.id,
      username: displayName,
      email,
      role: 'admin',
      authProvider: 'wordpress',
    });

    const cookieStore = await cookies();
    cookieStore.set(staffSessionCookieName, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: staffSessionMaxAgeSeconds,
      path: '/',
    });

    return NextResponse.json({
      success: true,
      user: { id: wpUser.id, username: displayName, email, role: 'admin' },
    });
  } catch {
    return NextResponse.json({ error: 'Login failed' }, { status: 500 });
  }
}
