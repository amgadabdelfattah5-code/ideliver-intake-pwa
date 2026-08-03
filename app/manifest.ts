import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'iDeliver Ops',
    short_name: 'iDeliver',
    description: 'نظام العمليات الداخلي لـ iDeliver مصر',
    start_url: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#17365F',
    theme_color: '#17365F',
    icons: [
      {
        src: '/icons/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-512-maskable.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
