import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

import { createSessionToken, staffSessionCookieName, staffSessionMaxAgeSeconds } from '@/lib/session';
import { verifyLocalPwaAccount } from '@/lib/local-pwa-accounts';
import { getWpJsonBase } from '@/lib/wp-client';
import { clearLoginAttempts, isLoginRateLimited, recordFailedLogin } from '@/lib/login-rate-limit';

// Minimal staff auth: verify WP app-password, issue cookie session
export async function POST(req: Request) {
  // The reverse proxy appends the real peer IP to X-Forwarded-For; the leftmost
  // entry is client-supplied and trivially spoofable, so trust the rightmost one.
  const forwardedFor = req.headers.get('x-forwarded-for');
  const ip = forwardedFor?.split(',').pop()?.trim() || 'unknown';

  try {
    const body = await req.json();
    const { username, password } = body;

    if (!username || !password) {
      return NextResponse.json({ error: 'اسم المستخدم وكلمة المرور مطلوبان' }, { status: 400 });
    }

    if (isLoginRateLimited(ip, username)) {
      return NextResponse.json(
        { error: 'محاولات كثيرة لتسجيل الدخول، حاول مرة أخرى بعد 15 دقيقة' },
        { status: 429 }
      );
    }

    const localAccount = verifyLocalPwaAccount(username, password);
    if (localAccount) {
      clearLoginAttempts(ip, username);
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

    // Verify credentials against WordPress (app-password or user/pass).
    // context=edit so the response includes the user's actual WP roles —
    // without it we'd have to trust every successful login as admin.
    const wpVerify = await fetch(`${getWpJsonBase()}/wp/v2/users/me?context=edit`, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`,
      },
    });

    if (!wpVerify.ok) {
      recordFailedLogin(ip, username);
      return NextResponse.json({ error: 'بيانات الدخول غير صحيحة' }, { status: 401 });
    }

    clearLoginAttempts(ip, username);
    const wpUser = await wpVerify.json();
    const email = wpUser.email || username;
    const displayName = wpUser.name || wpUser.slug || username;
    const wpRoles: string[] = Array.isArray(wpUser.roles) ? wpUser.roles : [];
    const role = wpRoles.includes('administrator') ? 'admin' : 'data_entry';
    const token = createSessionToken({
      wpUserId: wpUser.id,
      username: displayName,
      email,
      role,
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
      user: { id: wpUser.id, username: displayName, email, role },
    });
  } catch {
    return NextResponse.json({ error: 'فشل تسجيل الدخول' }, { status: 500 });
  }
}
