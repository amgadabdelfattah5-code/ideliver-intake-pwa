import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

// Minimal staff auth: verify WP app-password, issue cookie session
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { username, password } = body;

    if (!username || !password) {
      return NextResponse.json({ error: 'Username and password required' }, { status: 400 });
    }

    // Verify credentials against WordPress (app-password or user/pass)
    const wpVerify = await fetch(`${process.env.WP_API_BASE?.replace('/merchants', '')}/wp/v2/users/me`, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`,
      },
    });

    if (!wpVerify.ok) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    const wpUser = await wpVerify.json();

    // Create session cookie (for slice: simple cookie; MFA deferred)
    const cookieStore = await cookies();
    cookieStore.set('staff_session', JSON.stringify({
      wpUserId: wpUser.id,
      username: wpUser.name,
      email: wpUser.email,
    }), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: '/',
    });

    return NextResponse.json({
      success: true,
      user: { id: wpUser.id, username: wpUser.name, email: wpUser.email },
    });
  } catch (error) {
    return NextResponse.json({ error: 'Login failed' }, { status: 500 });
  }
}
