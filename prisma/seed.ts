import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

import { hashPassword } from '../lib/crypto';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is required');

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

async function main() {
  if (await prisma.staffAccount.findFirst({ where: { isAdmin: true } })) return;

  const username = process.env.ADMIN_USERNAME || 'amgad';
  const { hash: passwordHash, salt } = await hashPassword(process.env.ADMIN_PASSWORD || 'Omaramgad@2025');
  await prisma.staffAccount.create({
    data: { username, passwordHash, salt, permissions: [], isAdmin: true, isProtected: true },
  });
}

main().finally(() => prisma.$disconnect());
