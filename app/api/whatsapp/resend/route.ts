import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { resendWAMessage } from '@/lib/wp-client';

export async function POST(req: Request) {
  const auth = await requirePermission('whatsapp');
  if (auth instanceof NextResponse) return auth;
  const body = await req.json();
  const result = await resendWAMessage(body);
  return NextResponse.json(result);
}
