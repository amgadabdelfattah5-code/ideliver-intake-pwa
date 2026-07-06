// ponytail: Code39 chosen over Code128 because ORDER-{n} is uppercase+digits+hyphen
// (Code39's native alphabet) and Code39's pattern table is ~half the size. Real
// symbology so a physical gun can scan it; the encoded value lives behind
// barcodeValueForOrder() so the format can change without touching the renderer.

const CODE39: Record<string, string> = {
  '0': '101001101101', '1': '110100101011', '2': '101100101011',
  '3': '110110010101', '4': '101001101011', '5': '110100110101',
  '6': '101100110101', '7': '101001011011', '8': '110100101101',
  '9': '101100101101', 'A': '110101001011', 'B': '101101001011',
  'C': '110110100101', 'D': '101011001011', 'E': '110101100101',
  'F': '101101100101', 'G': '101010011011', 'H': '110101001101',
  'I': '101101001101', 'J': '101011001101', 'K': '110101010011',
  'L': '101101010011', 'M': '110110101001', 'N': '101011010011',
  'O': '110101101001', 'P': '101101101001', 'Q': '101010110011',
  'R': '110101011001', 'S': '101101011001', 'T': '101011011001',
  'U': '110010101011', 'V': '100110101011', 'W': '110011010101',
  'X': '100101101011', 'Y': '110010110101', 'Z': '100110110101',
  '-': '100101011011', '.': '110010101101', ' ': '100110101101',
  '*': '100101101101', '$': '100100100101', '/': '100100101001',
  '+': '100101001001', '%': '101001001001',
};

const NARROW = 1;
const WIDE = 3;

export interface BarcodeBar {
  width: number;
  fill: boolean;
}

// Encodes one Code39 character (incl. start/stop '*') into 6 bars + interleaved
// spaces, totalling 12 modules per char. Returns one entry per bar (spaces are
// the gaps between bars and are rendered by the consumer leaving room).
export function encodeCode39(value: string): BarcodeBar[] {
  const chars = value.toUpperCase().split('');
  // ponytail: validate; unknown chars silently dropped rather than crashing the
  // sticker. The caller passes order ids we control, so this is a guard, not a UX.
  const valid = chars.filter((c) => CODE39[c]);
  const stream = ['*', ...valid, '*'];

  const bars: BarcodeBar[] = [];
  for (const char of stream) {
    const pattern = CODE39[char];
    for (let i = 0; i < pattern.length; i++) {
      const isBar = i % 2 === 0;
      const width = pattern[i] === '1' ? WIDE : NARROW;
      if (isBar) bars.push({ width, fill: true });
      else bars.push({ width, fill: false });
    }
  }
  return bars;
}

export function barcodeValueForOrder(orderNumber: string | number): string {
  const trimmed = String(orderNumber ?? '').trim();
  if (!trimmed) return 'ORDER-0';
  // ponytail: only Code39 alphabet is allowed; non-conforming chars are stripped
  // so the encoder never receives garbage. Change this function to reformat the
  // encoded value without touching the renderer.
  return `ORDER-${trimmed}`.toUpperCase().replace(/[^A-Z0-9\-. *$/+%]/g, '');
}

// Self-check. Run with: npx tsx lib/barcode.ts
if (process.argv[1] && process.argv[1].endsWith('barcode.ts')) {
  const v = barcodeValueForOrder(12862);
  const bars = encodeCode39(v);
  const totalModules = bars.reduce((s, b) => s + b.width, 0);
  const barCount = bars.filter((b) => b.fill).length;
  // Code39: stream = ['*', ...chars, '*']; each char is 12 modules (bars+spaces).
  const expectedModules = (v.length + 2) * 12;
  console.log(`${v}: ${bars.length} modules, ${barCount} bars, total width ${totalModules}u`);
  if (v !== 'ORDER-12862') throw new Error('value mismatch');
  if (bars.length !== expectedModules) {
    throw new Error(`expected ${expectedModules} modules, got ${bars.length}`);
  }
  if (barCount !== bars.length / 2) {
    throw new Error(`expected half the modules to be bars, got ${barCount}/${bars.length}`);
  }
  console.log('OK');
}
