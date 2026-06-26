// WordPress REST API client (app-password auth)
const WP_BASE = process.env.WP_API_BASE || 'https://ideliveregypt.com/wp-json/liquidship/v1';
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

export async function searchWPMerchants(query: string): Promise<WPMerchant[]> {
  const auth = Buffer.from(`${WP_USER}:${WP_PASSWORD}`).toString('base64');
  const url = `${WP_BASE}/merchants?q=${encodeURIComponent(query)}`;

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
  const url = `${WP_BASE}/merchants`;

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
