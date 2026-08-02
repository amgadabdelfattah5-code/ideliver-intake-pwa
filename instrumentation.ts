export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  const { prisma } = await import('./lib/prisma');
  const { hashPassword } = await import('./lib/crypto');

  const existing = await prisma.staffAccount.findFirst({ where: { isAdmin: true } });
  if (existing) return;

  const username = process.env.ADMIN_USERNAME || 'amgad';
  const password = process.env.ADMIN_PASSWORD || 'Omaramgad@2025';
  const { hash: passwordHash, salt } = await hashPassword(password);
  await prisma.staffAccount.create({
    data: { username, passwordHash, salt, permissions: [], isAdmin: true, isProtected: true },
  });
}
