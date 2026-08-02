import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { getMerchantRequests } from '@/lib/wp-client';

export async function GET(req: NextRequest) {
  const auth = await requireRole(['admin']);
  if (auth instanceof NextResponse) return auth;
  const { searchParams } = req.nextUrl;
  const status   = searchParams.get('status') ?? 'pending';
  const page     = Math.max(1, Number(searchParams.get('page') ?? 1) || 1);
  const per_page = Math.min(Math.max(1, Number(searchParams.get('per_page') ?? 50) || 50), 100);
  const data = await getMerchantRequests({ status, page, per_page });
  return NextResponse.json(data);
}
