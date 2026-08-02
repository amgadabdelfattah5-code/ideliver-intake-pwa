import { NextResponse } from 'next/server';

import { requireRole } from '@/lib/auth';
import { hashPassword } from '@/lib/crypto';
import { prisma } from '@/lib/prisma';

const validPermissions = ['capture', 'review', 'print', 'whatsapp', 'settlement', 'orders', 'driver', 'merchants'];

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(['admin']);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const account = await prisma.staffAccount.findUnique({ where: { id } });
  if (!account) return NextResponse.json({ error: 'الحساب غير موجود' }, { status: 404 });
  if (account.isProtected) return NextResponse.json({ error: 'لا يمكن تعديل الحساب المحمي' }, { status: 403 });

  const { permissions, password } = await req.json();
  if (permissions !== undefined && (!Array.isArray(permissions) || permissions.some((slug) => !validPermissions.includes(slug)))) {
    return NextResponse.json({ error: 'صلاحيات غير صالحة' }, { status: 400 });
  }
  if (password !== undefined && (typeof password !== 'string' || password.length < 8)) {
    return NextResponse.json({ error: 'كلمة المرور يجب ألا تقل عن 8 أحرف' }, { status: 400 });
  }
  if (permissions === undefined && password === undefined) {
    return NextResponse.json({ error: 'لا توجد تغييرات' }, { status: 400 });
  }

  const credentials = password ? await hashPassword(password) : null;
  return NextResponse.json(await prisma.staffAccount.update({
    where: { id },
    data: {
      ...(permissions !== undefined && { permissions }),
      ...(credentials && { passwordHash: credentials.hash, salt: credentials.salt }),
    },
    omit: { passwordHash: true, salt: true },
  }));
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(['admin']);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const account = await prisma.staffAccount.findUnique({ where: { id } });
  if (!account) return NextResponse.json({ error: 'الحساب غير موجود' }, { status: 404 });
  if (account.isProtected) return NextResponse.json({ error: 'لا يمكن حذف الحساب المحمي' }, { status: 403 });

  await prisma.staffAccount.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
