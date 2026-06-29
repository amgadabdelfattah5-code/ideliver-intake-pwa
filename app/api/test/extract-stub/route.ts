import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { runSessionExtraction } from '@/lib/extraction-provider';

// POST /api/test/extract-stub?sessionId= — stub Hermes extraction (for slice testing)
export async function POST(req: NextRequest) {
  const session = await requireRole(['admin']);
  if (session instanceof NextResponse) return session;

  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get('sessionId');

  if (!sessionId) {
    return NextResponse.json({ error: 'sessionId required' }, { status: 400 });
  }

  try {
    const previousProvider = process.env.EXTRACTION_PROVIDER;
    let extraction: Awaited<ReturnType<typeof runSessionExtraction>>;

    try {
      process.env.EXTRACTION_PROVIDER = 'stub';
      extraction = await runSessionExtraction(sessionId);
    } finally {
      process.env.EXTRACTION_PROVIDER = previousProvider;
    }

    if (extraction.ordersProcessed === 0) {
      return NextResponse.json({ error: 'No orders found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      message: 'Stub extraction complete',
      ordersProcessed: extraction.ordersProcessed,
      sessionId,
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Stub extraction failed', details: error },
      { status: 500 }
    );
  }
}
