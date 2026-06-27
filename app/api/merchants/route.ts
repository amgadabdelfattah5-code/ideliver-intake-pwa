import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { searchWPMerchants, listAllWPMerchants } from '@/lib/wp-client';

// GET /api/merchants?q= — live WP lookup with cache fallback
export async function GET(req: NextRequest) {
  // Auth check
  const session = await requireRole(['admin', 'pickup']);
  if (session instanceof NextResponse) {
    return session;
  }

  const searchQuery = req.nextUrl.searchParams.get('q') || '';

  try {
    // Try live WP lookup
    let wpMerchants;
    try {
      wpMerchants = searchQuery
        ? await searchWPMerchants(searchQuery)
        : await listAllWPMerchants();
    } catch (wpError) {
      console.error('WP lookup failed, falling back to cache:', wpError);
      // Cache fallback: serve from local Merchant table
      const cached = await prisma.merchant.findMany({
        where: searchQuery
          ? {
              OR: [
                { name: { contains: searchQuery, mode: 'insensitive' } },
                { phone: { contains: searchQuery } },
              ],
            }
          : undefined,
        take: 25,
        orderBy: { name: 'asc' },
      });

      return NextResponse.json({
        success: true,
        source: 'cache',
        merchants: cached.map((m) => ({
          wpUserId: m.wpUserId,
          merchantId: m.merchantId,
          name: m.name,
          phone: m.phone || '',
          email: '',
          governorate: '',
          city: '',
          address: '',
        })),
      });
    }

    const cachedMerchants = await Promise.all(
      wpMerchants.map((m) =>
      prisma.merchant.upsert({
        where: { wpUserId: m.wpUserId },
        create: {
          wpUserId: m.wpUserId,
          merchantId: m.merchantId,
          name: m.name,
          phone: m.phone,
          cachedAt: new Date(),
        },
        update: {
          merchantId: m.merchantId,
          name: m.name,
          phone: m.phone,
          cachedAt: new Date(),
        },
      })
      )
    );

    return NextResponse.json({
      success: true,
      source: 'live',
      merchants: wpMerchants.map((merchant, index) => ({
        ...merchant,
        id: cachedMerchants[index].id,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Merchant lookup failed', details: error },
      { status: 500 }
    );
  }
}
