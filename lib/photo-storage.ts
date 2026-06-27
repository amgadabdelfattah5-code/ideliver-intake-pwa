import { mkdir, readFile, writeFile } from 'fs/promises';
import path from 'path';

export interface StoredPhoto {
  photoUrl: string;
  contentType: string;
}

interface PhotoInput {
  orderId: string;
  bytes: Buffer;
  contentType: string;
}

function storageMode(): 'data-url' | 'file' {
  return process.env.PHOTO_STORAGE_MODE === 'file' ? 'file' : 'data-url';
}

function storageDir(): string {
  return process.env.PHOTO_STORAGE_DIR || path.join(/* turbopackIgnore: true */ process.cwd(), '.data', 'photos');
}

function extensionForContentType(contentType: string): string {
  if (contentType === 'image/jpeg') return 'jpg';
  if (contentType === 'image/webp') return 'webp';
  if (contentType === 'image/heic') return 'heic';
  return 'png';
}

function fileName(orderId: string, contentType: string): string {
  return `${orderId}.${extensionForContentType(contentType)}`;
}

function dataUrl(bytes: Buffer, contentType: string): string {
  return `data:${contentType};base64,${bytes.toString('base64')}`;
}

export async function storePhoto(input: PhotoInput): Promise<StoredPhoto> {
  if (storageMode() === 'data-url') {
    return {
      photoUrl: dataUrl(input.bytes, input.contentType),
      contentType: input.contentType,
    };
  }

  const dir = storageDir();
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, fileName(input.orderId, input.contentType)), input.bytes);

  return {
    photoUrl: `/api/photos/${input.orderId}`,
    contentType: input.contentType,
  };
}

export async function loadPhotoDataUrl(orderId: string, photoUrl: string): Promise<string> {
  if (photoUrl.startsWith('data:')) return photoUrl;
  if (!photoUrl.startsWith('/api/photos/')) return photoUrl;

  const dir = storageDir();
  const candidates = ['png', 'jpg', 'webp', 'heic'];

  for (const extension of candidates) {
    try {
      const contentType = extension === 'jpg' ? 'image/jpeg' : `image/${extension}`;
      const bytes = await readFile(path.join(dir, `${orderId}.${extension}`));
      return dataUrl(bytes, contentType);
    } catch {
      // Try the next known image extension.
    }
  }

  throw new Error(`Stored photo file not found for order ${orderId}`);
}

export async function readStoredPhoto(orderId: string): Promise<{
  bytes: Buffer;
  contentType: string;
} | null> {
  const dir = storageDir();
  const candidates = [
    ['png', 'image/png'],
    ['jpg', 'image/jpeg'],
    ['webp', 'image/webp'],
    ['heic', 'image/heic'],
  ] as const;

  for (const [extension, contentType] of candidates) {
    try {
      return {
        bytes: await readFile(path.join(dir, `${orderId}.${extension}`)),
        contentType,
      };
    } catch {
      // Try the next known image extension.
    }
  }

  return null;
}
