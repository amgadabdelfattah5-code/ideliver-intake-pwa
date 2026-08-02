import { NextResponse } from 'next/server';

import { requireRole } from '@/lib/auth';
import { hashPassword } from '@/lib/crypto';
import { prisma } from '@/lib/prisma';

const validPermissions = ['capture', 'review', 'print', 'whatsapp', 'settlement', 'orders', 'driver', 'merchants'];

export async function GET() {
  const auth = await requireRole(['admin']);
  if (auth instanceof NextResponse) return auth;

  return NextResponse.json(await prisma.staffAccount.findMany({
    omit: { passwordHash: true, salt: true },
    orderBy: { createdAt: 'asc' },
  }));
}

export async function POST(req: Request) {
  const auth = await requireRole(['admin']);
  if (auth instanceof NextResponse) return auth;

  const { username, password, permissions } = await req.json();
  if (typeof username !== 'string' || !username.trim()) {
    return NextResponse.json({ error: 'اسم المستخدم مطلوب' }, { status: 400 });
  }
  if (typeof password !== 'string' || password.length < 8) {
    return NextResponse.json({ error: 'كلمة المرور يجب ألا تقل عن 8 أحرف' }, { status: 400 });
  }
  if (!Array.isArray(permissions) || permissions.some((slug) => !validPermissions.includes(slug))) {
    return NextResponse.json({ error: 'صلاحيات غير صالحة' }, { status: 400 });
  }

  const normalizedUsername = username.trim();
  if (await prisma.staffAccount.findUnique({ where: { username: normalizedUsername } })) {
    return NextResponse.json({ error: 'اسم المستخدم موجود بالفعل' }, { status: 409 });
  }

  const { hash: passwordHash, salt } = await hashPassword(password);
  const account = await prisma.staffAccount.create({
    data: { username: normalizedUsername, passwordHash, salt, permissions },
    omit: { passwordHash: true, salt: true },
  });
  return NextResponse.json(account, { status: 201 });
}
