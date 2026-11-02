import { MetadataRoute } from 'next'

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date()

  return [
    {
      url: 'https://sistetecni.com/tarjeta',
      lastModified,
    },
    {
      url: 'https://sistetecni.com',
      lastModified,
    },
    ...['bar', 'restaurante', 'lavanderia', 'negocios'].map((slug) => ({
      url: `https://sistetecni.com/programas/${slug}`,
      lastModified,
    })),
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
