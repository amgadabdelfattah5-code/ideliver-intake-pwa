import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { SessionStatus } from '@prisma/client';

// POST /api/sessions { merchantId } → create new session
export async function POST(req: NextRequest) {
  const session = await requireRole(['admin', 'pickup']);
  if (session instanceof NextResponse) return session;

  try {
    const body = await req.json();
    const { merchantId } = body;

    if (!merchantId) {
      return NextResponse.json({ error: 'رقم التاجر مطلوب' }, { status: 400 });
    }

    const merchant = await prisma.merchant.findUnique({
      where: { id: merchantId },
      select: { id: true },
    });

    if (!merchant) {
      return NextResponse.json({ error: 'التاجر غير موجود في قاعدة بيانات التطبيق' }, { status: 404 });
    }

    const newSession = await prisma.session.create({
      data: {
        merchantId,
        createdBy: session.email,
        status: SessionStatus.created,
        photoCount: 0,
      },
    });

    return NextResponse.json({
      success: true,
      session: {
        id: newSession.id,
        merchantId: newSession.merchantId,
        status: newSession.status,
        photoCount: newSession.photoCount,
        createdAt: newSession.createdAt,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'تعذّر بدء الجلسة', details: error },
      { status: 500 }
    );
  }
}
