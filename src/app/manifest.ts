import { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'លំហាត់គណិតវិទ្យា - តាមដានការសិក្សា',
    short_name: 'Math Tracking',
    description: 'តាមដានលទ្ធផលលំហាត់គណិតវិទ្យារបស់កូនអ្នក',
    start_url: '/',
    display: 'standalone',
    background_color: '#f6f7f9',
    theme_color: '#4a67d6',
    icons: [
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  };
}
