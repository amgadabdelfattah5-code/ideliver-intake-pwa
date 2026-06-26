import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { SessionStatus } from '@prisma/client';

// POST /api/sessions { merchantId } → create new session
export async function POST(req: NextRequest) {
  const session = await requireAuth();
  if (session instanceof NextResponse) return session;

  try {
    const body = await req.json();
    const { merchantId } = body;

    if (!merchantId) {
      return NextResponse.json({ error: 'merchantId required' }, { status: 400 });
    }

    // Verify merchant exists in WP (optional for slice; can skip for speed)
    // For slice, trust the merchantId from the frontend lookup

    const newSession = await prisma.session.create({
      data: {
        merchantId,
        createdBy: (session as any).email || 'unknown',
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
      { error: 'Failed to create session', details: error },
      { status: 500 }
    );
  }
}
