const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL?.replace(/\/$/, '') || '';
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY || '';
const EVOLUTION_INSTANCE = process.env.EVOLUTION_INSTANCE || '';

export function evolutionConfigured(): boolean {
  return Boolean(EVOLUTION_API_URL && EVOLUTION_API_KEY && EVOLUTION_INSTANCE);
}

export async function sendEvolutionText(number: string, text: string): Promise<void> {
  if (!evolutionConfigured()) {
    throw new Error('Evolution API is not configured');
  }

  const response = await fetch(`${EVOLUTION_API_URL}/message/sendText/${EVOLUTION_INSTANCE}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: EVOLUTION_API_KEY,
    },
    body: JSON.stringify({
      number: number.replace(/\D/g, ''),
      text,
    }),
  });

  if (!response.ok) {
    throw new Error(`Evolution API failed with ${response.status}: ${await response.text()}`);
  }
}
