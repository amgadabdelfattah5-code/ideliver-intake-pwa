import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { getWASettings, saveWASettings } from '@/lib/wp-client';

export async function GET() {
  const auth = await requireRole(['admin']);
  if (auth instanceof NextResponse) return auth;
  const settings = await getWASettings();
  return NextResponse.json(settings);
}

export async function POST(req: Request) {
  const auth = await requireRole(['admin']);
  if (auth instanceof NextResponse) return auth;
  const body = await req.json();
  await saveWASettings(body);
  return NextResponse.json({ success: true });
}
