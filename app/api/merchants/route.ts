import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { searchWPMerchants, listAllWPMerchants } from '@/lib/wp-client';

type MerchantLookup = Awaited<ReturnType<typeof listAllWPMerchants>>[number];

function normalizeSearchValue(value: string): string {
  return value
    .toLowerCase()
    .replace(/[_\-\s]+/g, ' ')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .trim();
}

function matchesMerchant(merchant: MerchantLookup, query: string): boolean {
  const normalizedQuery = normalizeSearchValue(query);
  if (!normalizedQuery) return true;

  const values = [
    merchant.name,
    merchant.phone,
    merchant.merchantId,
    merchant.email,
  ];

  return values.some((value) => normalizeSearchValue(value || '').includes(normalizedQuery));
}

async function cacheMerchants(wpMerchants: MerchantLookup[]) {
  return Promise.all(
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
}

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
                { merchantId: { contains: searchQuery } },
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
          id: m.id,
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

    if (searchQuery && wpMerchants.length === 0) {
      const allMerchants = await listAllWPMerchants();
      wpMerchants = allMerchants.filter((merchant) => matchesMerchant(merchant, searchQuery));
    }

    const cachedMerchants = await cacheMerchants(wpMerchants);

    return NextResponse.json({
      success: true,
      source: searchQuery && wpMerchants.length > 0 ? 'live-fallback-filter' : 'live',
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
