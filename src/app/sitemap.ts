import { MetadataRoute } from 'next'

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: 'https://sistetecni.com',
      lastModified: new Date(),
    },
  ]
}
