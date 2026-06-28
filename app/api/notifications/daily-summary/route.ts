import { NextRequest, NextResponse } from 'next/server';
import { OrderStatus } from '@prisma/client';

import { requireRole } from '@/lib/auth';
import { evolutionConfigured, sendEvolutionText } from '@/lib/evolution-whatsapp';
import { prisma } from '@/lib/prisma';

const DEFAULT_RECIPIENTS = ['+201026000806', '+201003323669'];

function cairoDateKey(date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Cairo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const value = (type: string) => parts.find((part) => part.type === type)?.value || '';
  return `${value('year')}-${value('month')}-${value('day')}`;
}

function dateRangeUtc(dateKey: string): { start: Date; end: Date } {
  const [year, month, day] = dateKey.split('-').map(Number);
  const start = new Date(Date.UTC(year, month - 1, day, -2, 0, 0));
  const end = new Date(Date.UTC(year, month - 1, day + 1, -2, 0, 0));
  return { start, end };
}

function money(value: unknown): number {
  const number = Number(String(value || '').replace(/[^\d.]/g, ''));
  return Number.isFinite(number) ? number : 0;
}

function formatMoney(value: number): string {
  return value.toLocaleString('en-US');
}

function recipients(): string[] {
  const configured = process.env.DAILY_SUMMARY_WHATSAPP_RECIPIENTS;
  if (!configured) return DEFAULT_RECIPIENTS;
  return configured.split(',').map((item) => item.trim()).filter(Boolean);
}

export async function POST(req: NextRequest) {
  const session = await requireRole(['admin']);
  if (session instanceof NextResponse) return session;

  const body = await req.json().catch(() => ({}));
  const dateKey = String(body.date || req.nextUrl.searchParams.get('date') || cairoDateKey());
  const force = Boolean(body.force || req.nextUrl.searchParams.get('force') === 'true');
  const dryRun = Boolean(body.dryRun || req.nextUrl.searchParams.get('dryRun') === 'true');
  const action = 'notifications.daily_summary.sent';

  const existing = await prisma.actionLog.findFirst({
    where: {
      action,
      entity: 'daily-summary',
      entityId: dateKey,
    },
  });

  if (existing && !force) {
    return NextResponse.json(
      { error: 'تم إرسال ملخص هذا اليوم من قبل', alreadySent: true, date: dateKey },
      { status: 409 }
    );
  }

  const { start, end } = dateRangeUtc(dateKey);
  const orders = await prisma.order.findMany({
    where: {
      status: OrderStatus.submitted,
      submittedAt: {
        gte: start,
        lt: end,
      },
    },
    include: {
      session: {
        include: { merchant: true },
      },
    },
    orderBy: [{ session: { merchant: { name: 'asc' } } }, { submittedAt: 'asc' }],
  });

  const groups = new Map<
    string,
    { merchant: string; count: number; cod: number; shipping: number; price: number; shipments: string[] }
  >();

  for (const order of orders) {
    const merchant = order.session.merchant.name;
    const fields = (order.correctedFields || {}) as Record<string, unknown>;
    const current =
      groups.get(merchant) ||
      { merchant, count: 0, cod: 0, shipping: 0, price: 0, shipments: [] };

    current.count += 1;
    current.cod += money(fields.COD);
    current.shipping += money(fields.shippingFeePrinted);
    current.price += money(fields.price);
    if (order.shipmentId) current.shipments.push(order.shipmentId);
    groups.set(merchant, current);
  }

  const summaries = Array.from(groups.values());
  const totalOrders = summaries.reduce((sum, item) => sum + item.count, 0);
  const totalCod = summaries.reduce((sum, item) => sum + item.cod, 0);
  const totalShipping = summaries.reduce((sum, item) => sum + item.shipping, 0);
  const totalPrice = summaries.reduce((sum, item) => sum + item.price, 0);

  const lines = [
    'ملخص شحنات iDeliver اليومي',
    `التاريخ: ${dateKey}`,
    '',
    `عدد التجار: ${summaries.length}`,
    `إجمالي الشحنات: ${totalOrders}`,
    `إجمالي التحصيل: ${formatMoney(totalCod)} جنيه`,
    `إجمالي الشحن: ${formatMoney(totalShipping)} جنيه`,
    `إجمالي المنتجات: ${formatMoney(totalPrice)} جنيه`,
    '',
    ...summaries.flatMap((summary, index) => [
      `${index + 1}. ${summary.merchant}`,
      `الشحنات: ${summary.count}`,
      `التحصيل: ${formatMoney(summary.cod)} جنيه`,
      `الشحن: ${formatMoney(summary.shipping)} جنيه`,
      `المنتجات: ${formatMoney(summary.price)} جنيه`,
      `أرقام الشحنات: ${summary.shipments.join(', ') || '-'}`,
      '',
    ]),
  ];
  const message = lines.join('\n').trim();

  if (dryRun || !evolutionConfigured()) {
    return NextResponse.json({
      success: true,
      sent: false,
      reason: dryRun ? 'dryRun' : 'Evolution API is not configured',
      date: dateKey,
      recipients: recipients(),
      message,
      summaries,
    });
  }

  const targetRecipients = recipients();
  for (const recipient of targetRecipients) {
    await sendEvolutionText(recipient, message);
  }

  await prisma.actionLog.create({
    data: {
      actor: session.email,
      action,
      entity: 'daily-summary',
      entityId: dateKey,
      meta: {
        recipients: targetRecipients,
        merchantCount: summaries.length,
        totalOrders,
        totalCod,
        totalShipping,
        totalPrice,
      },
    },
  });

  return NextResponse.json({
    success: true,
    sent: true,
    date: dateKey,
    recipients: targetRecipients,
    message,
    summaries,
  });
}
