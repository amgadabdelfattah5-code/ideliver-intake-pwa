// ponytail: in-memory per-IP limiter, single instance only — move to a shared
// store (Redis) if this app ever runs more than one replica.
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;

const attempts = new Map<string, { count: number; resetAt: number }>();

export function isLoginRateLimited(ip: string): boolean {
  const entry = attempts.get(ip);
  if (!entry || entry.resetAt < Date.now()) return false;
  return entry.count >= MAX_ATTEMPTS;
}

export function recordFailedLogin(ip: string): void {
  const entry = attempts.get(ip);
  if (!entry || entry.resetAt < Date.now()) {
    attempts.set(ip, { count: 1, resetAt: Date.now() + WINDOW_MS });
    return;
  }
  entry.count += 1;
}

export function clearLoginAttempts(ip: string): void {
  attempts.delete(ip);
}
