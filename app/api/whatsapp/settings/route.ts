import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { getWASettings, saveWASettings } from '@/lib/wp-client';

export async function GET() {
  const auth = await requirePermission('whatsapp');
  if (auth instanceof NextResponse) return auth;
  const settings = await getWASettings();
  return NextResponse.json(settings);
}

export async function POST(req: Request) {
  const auth = await requirePermission('whatsapp');
  if (auth instanceof NextResponse) return auth;
  const body = await req.json();
  await saveWASettings(body);
  return NextResponse.json({ success: true });
}
