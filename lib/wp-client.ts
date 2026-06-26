const DEFAULT_WP_JSON_BASE = 'https://ideliveregypt.com/wp-json';
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
