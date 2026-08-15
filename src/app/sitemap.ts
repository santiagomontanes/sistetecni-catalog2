import { MetadataRoute } from 'next'

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date()

  return [
    {
      url: 'https://sistetecni.com',
      lastModified,
    },
    {
      url: 'https://sistetecni.com/politica-de-privacidad',
      lastModified,
    },
    {
      url: 'https://sistetecni.com/eliminacion-de-datos',
      lastModified,
    },
  ]
}
