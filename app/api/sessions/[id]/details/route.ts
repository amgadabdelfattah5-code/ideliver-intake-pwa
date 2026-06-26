import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// GET /api/sessions/:id → session + orders
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireAuth();
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
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      session: sessionData,
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch session', details: error },
      { status: 500 }
    );
  }
}
