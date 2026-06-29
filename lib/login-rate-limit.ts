// ponytail: in-memory per-IP limiter, single instance only — move to a shared
// store (Redis) if this app ever runs more than one replica.
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;

const attempts = new Map<string, { count: number; resetAt: number }>();

// Keyed by ip AND username so a spoofed X-Forwarded-For alone can't reset the lockout.
function key(ip: string, username: string): string {
  return `${ip}:${username.trim().toLowerCase()}`;
}

export function isLoginRateLimited(ip: string, username: string): boolean {
  const entry = attempts.get(key(ip, username));
  if (!entry || entry.resetAt < Date.now()) return false;
  return entry.count >= MAX_ATTEMPTS;
}

export function recordFailedLogin(ip: string, username: string): void {
  const k = key(ip, username);
  const entry = attempts.get(k);
  if (!entry || entry.resetAt < Date.now()) {
    attempts.set(k, { count: 1, resetAt: Date.now() + WINDOW_MS });
    return;
  }
  entry.count += 1;
}

export function clearLoginAttempts(ip: string, username: string): void {
  attempts.delete(key(ip, username));
}
