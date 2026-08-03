import sharp from 'sharp';
import { mkdirSync } from 'fs';

mkdirSync('public/icons', { recursive: true });

const NAVY = { r: 23, g: 54, b: 95, alpha: 1 };

async function makeIcon(size, logoFill, outFile) {
  const logoSize = Math.round(size * logoFill);
  const logo = await sharp('public/ideliver-logo.png')
    .resize(logoSize, logoSize, { fit: 'inside' })
    .png()
    .toBuffer();

  const meta = await sharp(logo).metadata();
  const top = Math.round((size - meta.height) / 2);
  const left = Math.round((size - meta.width) / 2);

  await sharp({ create: { width: size, height: size, channels: 4, background: NAVY } })
    .composite([{ input: logo, top, left }])
    .png()
    .toFile(outFile);

  console.log(`${outFile} done`);
}

await makeIcon(192, 0.80, 'public/icons/icon-192.png');
await makeIcon(512, 0.80, 'public/icons/icon-512.png');
await makeIcon(512, 0.60, 'public/icons/icon-512-maskable.png');
