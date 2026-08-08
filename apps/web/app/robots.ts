import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/dashboard/', '/api/', '/me', '/tickets/', '/operations/'],
    },
    sitemap: 'https://www.asotmilsim.com/sitemap.xml',
  }
}
