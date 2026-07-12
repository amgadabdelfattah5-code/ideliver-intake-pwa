const DEFAULT_WP_JSON_BASE = 'https://shop.ideliveregypt.com/wp-json';
const WP_USER = process.env.WP_APP_USER || 'amged.mohammed@gmail.com';
const WP_PASSWORD = process.env.WP_APP_PASSWORD || '';

interface WPMerchant {
  wpUserId: number;
  merchantId: string;
  name: string;
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
}

export async function getDriverOrders(driverId?: number): Promise<WPDriverOrder[]> {
  const auth = Buffer.from(`${WP_USER}:${WP_PASSWORD}`).toString('base64');
  const query = driverId == null ? '' : `?driver_id=${encodeURIComponent(driverId)}`;
  const url = `${getLiquidShipBase()}/driver-orders${query}`;

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
    }),
  });

  if (!res.ok) {
    throw new Error(`WP API error: ${res.status}`);
  }
}
