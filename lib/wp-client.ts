const DEFAULT_WP_JSON_BASE = 'https://shop.ideliveregypt.com/wp-json';
const WP_USER = process.env.WP_APP_USER || 'amged.mohammed@gmail.com';
const WP_PASSWORD = process.env.WP_APP_PASSWORD || '';

interface WPMerchant {
  wpUserId: number;
  merchantId: string;
  name: string;
  identityLabel: string;
  phone: string;
  email: string;
  governorate: string;
  city: string;
  address: string;
}

export function getWpJsonBase(): string {
  const configured = process.env.WP_API_BASE || DEFAULT_WP_JSON_BASE;
  return configured.replace(/\/liquidship\/v1\/?$/, '').replace(/\/$/, '');
}

export function getLiquidShipBase(): string {
  return `${getWpJsonBase()}/liquidship/v1`;
}

export async function searchWPMerchants(query: string): Promise<WPMerchant[]> {
  const auth = Buffer.from(`${WP_USER}:${WP_PASSWORD}`).toString('base64');
  const url = `${getLiquidShipBase()}/merchants?q=${encodeURIComponent(query)}`;

  const res = await fetch(url, {
    headers: {
      'Authorization': `Basic ${auth}`,
    },
  });

  if (!res.ok) {
    throw new Error(`WP API error: ${res.status}`);
  }

  const data = await res.json();
  return data.merchants || [];
}

export async function listAllWPMerchants(): Promise<WPMerchant[]> {
  const auth = Buffer.from(`${WP_USER}:${WP_PASSWORD}`).toString('base64');
  const url = `${getLiquidShipBase()}/merchants`;

  const res = await fetch(url, {
    headers: {
      'Authorization': `Basic ${auth}`,
    },
  });

  if (!res.ok) {
    throw new Error(`WP API error: ${res.status}`);
  }

  const data = await res.json();
  return data.merchants || [];
}

export interface WPDriverOrder {
  orderId: number;
  tracking: string;
  status: string;
  customerName: string;
  customerPhone: string;
  address: string;
  total: string;
  merchantWpUserId: number;
  merchantName: string;
  merchantIdentityLabel: string;
  assignedDriverId: number;
}

export async function getDriverOrders(driverId?: number, orderId?: number): Promise<WPDriverOrder[]> {
  const auth = Buffer.from(`${WP_USER}:${WP_PASSWORD}`).toString('base64');
  const params = new URLSearchParams();
  if (driverId != null) params.set('driver_id', String(driverId));
  if (orderId != null) params.set('order_id', String(orderId));
  const qs = params.size ? `?${params}` : '';
  const url = `${getLiquidShipBase()}/driver-orders${qs}`;

  const res = await fetch(url, {
    headers: {
      'Authorization': `Basic ${auth}`,
    },
  });

  if (!res.ok) {
    throw new Error(`WP API error: ${res.status}`);
  }

  const data = await res.json();
  return data.orders || [];
}

export interface DeliveryVisitPayload {
  orderId: number;
  driverId: number;
  status: string;
  reasonCode: string;
  note?: string;
  photoDataUrl?: string;
  locationUrl?: string;
  collectedValue?: string;
  collectedPrice?: string;
  collectedShippingFee?: string;
  productPriceRecipient?: string;
  shippingFeeRecipient?: string;
}

export async function submitDeliveryVisit(payload: DeliveryVisitPayload): Promise<void> {
  const auth = Buffer.from(`${WP_USER}:${WP_PASSWORD}`).toString('base64');
  const url = `${getLiquidShipBase()}/visit`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      order_id: payload.orderId,
      driver_id: payload.driverId,
      status: payload.status,
      reason_code: payload.reasonCode,
      note: payload.note,
      photo: payload.photoDataUrl,
      location_url: payload.locationUrl,
      collected_value: payload.collectedValue,
      collected_price: payload.collectedPrice,
      collected_shipping_fee: payload.collectedShippingFee,
      product_price_recipient: payload.productPriceRecipient,
      shipping_fee_recipient: payload.shippingFeeRecipient,
    }),
  });

  if (!res.ok) {
    throw new Error(`WP API error: ${res.status}`);
  }
}

export async function getSettlementView(merchantId: number) {
  const auth = Buffer.from(`${WP_USER}:${WP_PASSWORD}`).toString('base64');
  const res = await fetch(`${getLiquidShipBase()}/settlement/view?merchant_id=${merchantId}`, {
    headers: { Authorization: `Basic ${auth}` },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`WP API error: ${res.status}`);
  return res.json();
}

export async function getSettlementAdjustments(merchantId: number, claimed: boolean) {
  const auth = Buffer.from(`${WP_USER}:${WP_PASSWORD}`).toString('base64');
  const res = await fetch(`${getLiquidShipBase()}/settlement/adjustments?merchant_id=${merchantId}&claimed=${claimed ? 1 : 0}`, {
    headers: { Authorization: `Basic ${auth}` },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`WP API error: ${res.status}`);
  return res.json();
}

export async function postSettlementAdjustment(body: object) {
  const auth = Buffer.from(`${WP_USER}:${WP_PASSWORD}`).toString('base64');
  const res = await fetch(`${getLiquidShipBase()}/settlement/adjustment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Basic ${auth}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`WP API error: ${res.status}`);
  return res.json();
}

export async function postSettlementPayout(body: object) {
  const auth = Buffer.from(`${WP_USER}:${WP_PASSWORD}`).toString('base64');
  const res = await fetch(`${getLiquidShipBase()}/settlement/payout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Basic ${auth}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`WP API error: ${res.status}`);
  return res.json();
}

export async function postSettlementOrderEdit(body: object) {
  const auth = Buffer.from(`${WP_USER}:${WP_PASSWORD}`).toString('base64');
  const res = await fetch(`${getLiquidShipBase()}/settlement/order-edit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Basic ${auth}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`WP API error: ${res.status}`);
  return res.json();
}

export async function getSettlementPayouts(merchantId: number) {
  const auth = Buffer.from(`${WP_USER}:${WP_PASSWORD}`).toString('base64');
  const res = await fetch(`${getLiquidShipBase()}/settlement/payouts?merchant_id=${merchantId}`, {
    headers: { Authorization: `Basic ${auth}` },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`WP API error: ${res.status}`);
  return res.json();
}

export async function fetchSettlementExport(merchantId: number, type: 'main' | 'review') {
  const auth = Buffer.from(`${WP_USER}:${WP_PASSWORD}`).toString('base64');
  const res = await fetch(`${getLiquidShipBase()}/settlement/export?merchant_id=${merchantId}&type=${type}`, {
    headers: { Authorization: `Basic ${auth}` },
  });
  if (!res.ok) throw new Error(`WP API error: ${res.status}`);
  return res;
}
