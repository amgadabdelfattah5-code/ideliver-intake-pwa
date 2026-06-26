import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { runStubExtraction } from '@/lib/extraction-stub';

// POST /api/test/extract-stub?sessionId= — stub Hermes extraction (for slice testing)
export async function POST(req: NextRequest) {
  const session = await requireAuth();
  if (session instanceof NextResponse) return session;

  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get('sessionId');

  if (!sessionId) {
    return NextResponse.json({ error: 'sessionId required' }, { status: 400 });
  }

  try {
    const ordersProcessed = await runStubExtraction(sessionId);

    if (ordersProcessed === 0) {
      return NextResponse.json({ error: 'No orders found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      message: 'Stub extraction complete',
      ordersProcessed,
      sessionId,
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Stub extraction failed', details: error },
      { status: 500 }
    );
  }
}
