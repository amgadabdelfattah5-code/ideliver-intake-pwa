import { createHmac, timingSafeEqual } from 'crypto';

import type { StaffSession } from './auth';

const SESSION_MAX_AGE_SECONDS = 60 * 60 * 12;

interface SignedSession extends StaffSession {
  exp: number;
}

function base64UrlEncode(value: string | Buffer): string {
  return Buffer.from(value)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64UrlDecode(value: string): Buffer {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  return Buffer.from(padded, 'base64');
}

function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET;

  if (!secret && process.env.NODE_ENV === 'production') {
    throw new Error('SESSION_SECRET is required in production');
  }

  return secret || 'dev-secret-insecure-change-in-production';
}

function sign(payload: string): string {
  return base64UrlEncode(
    createHmac('sha256', getSessionSecret()).update(payload).digest()
  );
}

export function createSessionToken(session: StaffSession): string {
  const payload: SignedSession = {
    ...session,
    exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS,
  };
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  return `${encodedPayload}.${sign(encodedPayload)}`;
}

export function verifySessionToken(token: string | undefined): StaffSession | null {
  if (!token) return null;

  const [encodedPayload, signature] = token.split('.');
  if (!encodedPayload || !signature) return null;

  const expectedSignature = sign(encodedPayload);
  const provided = Buffer.from(signature);
  const expected = Buffer.from(expectedSignature);

  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return null;
  }

  try {
    const payload = JSON.parse(base64UrlDecode(encodedPayload).toString('utf8')) as SignedSession;

    if (
      payload.wpUserId == null ||
      !payload.username ||
      !payload.email ||
      !payload.exp ||
      !payload.role
    ) {
      return null;
    }

    if (payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }

    return {
      wpUserId: payload.wpUserId,
      username: payload.username,
      email: payload.email,
      role: payload.role,
      authProvider: payload.authProvider,
    };
  } catch {
    return null;
  }
}

export const staffSessionCookieName = 'staff_session';
export const staffSessionMaxAgeSeconds = SESSION_MAX_AGE_SECONDS;
