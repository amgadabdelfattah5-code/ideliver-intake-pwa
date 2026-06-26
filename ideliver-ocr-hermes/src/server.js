import http from 'node:http';

const PORT = Number(process.env.PORT || 3000);
const AGENT_TOKEN = process.env.HERMES_OCR_TOKEN || '';
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || process.env.MODEL_PROVIDER_API_KEY || '';
const MODEL = process.env.HERMES_OCR_MODEL || 'google/gemini-2.5-flash';
const MAX_BODY_BYTES = Number(process.env.MAX_BODY_BYTES || 12 * 1024 * 1024);

function json(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

async function readJson(req) {
  let size = 0;
  const chunks = [];

  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      throw new Error('Request body too large');
    }
    chunks.push(chunk);
  }

  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

function assertAuthorized(req) {
  if (!AGENT_TOKEN) return;
  const expected = `Bearer ${AGENT_TOKEN}`;
  if (req.headers.authorization !== expected) {
    const error = new Error('Unauthorized');
    error.status = 401;
    throw error;
  }
}

function extractJsonObject(text) {
  const trimmed = String(text || '').trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    return JSON.parse(trimmed);
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) {
    return JSON.parse(fenced[1]);
  }

  const first = trimmed.indexOf('{');
  const last = trimmed.lastIndexOf('}');
  if (first >= 0 && last > first) {
    return JSON.parse(trimmed.slice(first, last + 1));
  }

  throw new Error('Model response did not contain a JSON object');
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(String(value).replace(/[^\d.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function stringOrEmpty(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeExtraction(raw) {
  const fields = raw.fields && typeof raw.fields === 'object' ? raw.fields : raw;
  const confidence = Number(raw.confidence ?? fields.confidence ?? 0);
  const fieldConfidence =
    raw.fieldConfidence && typeof raw.fieldConfidence === 'object' ? raw.fieldConfidence : {};
  const warnings = Array.isArray(raw.warnings) ? raw.warnings.map(String) : [];

  return {
    fields: {
      recipientName: stringOrEmpty(fields.recipientName),
      recipientPhone: stringOrEmpty(fields.recipientPhone),
      recipientAddress: stringOrEmpty(fields.recipientAddress),
      recipientGovernorate: stringOrEmpty(fields.recipientGovernorate),
      recipientCity: stringOrEmpty(fields.recipientCity),
      product: stringOrEmpty(fields.product || 'Order'),
      price: numberOrNull(fields.price),
      shippingFeePrinted: numberOrNull(fields.shippingFeePrinted),
      COD: numberOrNull(fields.COD),
      notes: stringOrEmpty(fields.notes),
    },
    confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0,
    fieldConfidence,
    warnings,
  };
}

function buildPrompt({ merchantName, sequence }) {
  return [
    'You are the dedicated iDeliver Egypt shipment-photo OCR agent.',
    'Read the attached receipt or handwritten shipment photo and extract only shipment intake data.',
    'The business is Egypt-only delivery. Arabic and English text may appear together.',
    `Merchant: ${merchantName || 'unknown'}. Photo/order sequence: ${sequence || 'unknown'}.`,
    '',
    'Return STRICT JSON only, no markdown, with this shape:',
    '{',
    '  "fields": {',
    '    "recipientName": "string",',
    '    "recipientPhone": "Egypt mobile phone string",',
    '    "recipientAddress": "full address string",',
    '    "recipientGovernorate": "string",',
    '    "recipientCity": "string",',
    '    "product": "string",',
    '    "price": number or null,',
    '    "shippingFeePrinted": number or null,',
    '    "COD": number or null,',
    '    "notes": "string"',
    '  },',
    '  "confidence": number between 0 and 1,',
    '  "fieldConfidence": { "recipientName": number, "recipientPhone": number, "recipientAddress": number, "COD": number },',
    '  "warnings": ["short strings for missing/uncertain fields"]',
    '}',
    '',
    'Rules:',
    '- Do not invent missing values.',
    '- Normalize Arabic numerals to Latin digits.',
    '- COD means total cash to collect from recipient.',
    '- If unclear, use null or empty string and lower confidence.',
  ].join('\n');
}

async function callOpenRouter(payload) {
  if (!OPENROUTER_API_KEY) {
    throw new Error('OPENROUTER_API_KEY is not configured');
  }

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${OPENROUTER_API_KEY}`,
      'content-type': 'application/json',
      'http-referer': 'https://ideliveregypt.com',
      'x-title': 'iDeliver OCR Hermes',
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: buildPrompt(payload) },
            {
              type: 'image_url',
              image_url: {
                url: payload.imageDataUrl,
              },
            },
          ],
        },
      ],
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`OpenRouter failed ${response.status}: ${JSON.stringify(data).slice(0, 500)}`);
  }

  const text = data.choices?.[0]?.message?.content;
  return {
    requestId: data.id || null,
    model: data.model || MODEL,
    raw: data,
    parsed: extractJsonObject(text),
  };
}

async function handleExtract(req, res) {
  assertAuthorized(req);
  const body = await readJson(req);

  if (!body.imageDataUrl || typeof body.imageDataUrl !== 'string') {
    return json(res, 400, { error: 'imageDataUrl is required' });
  }

  const modelResult = await callOpenRouter(body);
  const normalized = normalizeExtraction(modelResult.parsed);

  return json(res, 200, {
    success: true,
    provider: 'ideliver-ocr-hermes',
    model: modelResult.model,
    rawRef: modelResult.requestId,
    ...normalized,
  });
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url === '/health') {
      return json(res, 200, {
        status: 'ok',
        service: 'ideliver-ocr-hermes',
        model: MODEL,
        hasModelKey: Boolean(OPENROUTER_API_KEY),
      });
    }

    if (req.method === 'POST' && req.url === '/extract-shipment-photo') {
      return await handleExtract(req, res);
    }

    return json(res, 404, { error: 'Not found' });
  } catch (error) {
    return json(res, error.status || 500, {
      error: error.message || 'Unexpected OCR agent error',
    });
  }
});

server.listen(PORT, () => {
  console.log(`iDeliver OCR Hermes listening on ${PORT}`);
});
