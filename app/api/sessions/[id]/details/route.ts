import { NextRequest, NextResponse } from 'next/server';
import { requireAnyPermission } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// GET /api/sessions/:id → session + orders
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireAnyPermission(['capture', 'review', 'print']);
  if (session instanceof NextResponse) return session;

  const { id } = await params;

  try {
    const sessionData = await prisma.session.findUnique({
      where: { id },
      include: {
        merchant: true,
        orders: {
          orderBy: { sequence: 'asc' },
        },
      },
    });

    if (!sessionData) {
      return NextResponse.json({ error: 'الجلسة غير موجودة' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      session: sessionData,
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'تعذّر تحميل الجلسة', details: error },
      { status: 500 }
    );
  }
}
