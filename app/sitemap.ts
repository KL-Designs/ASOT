import type { MetadataRoute } from 'next'

const BASE = 'https://www.asotmilsim.com'

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    // Core
    { url: BASE, lastModified: new Date(), changeFrequency: 'weekly', priority: 1 },
    { url: `${BASE}/join`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.9 },

    // About
    { url: `${BASE}/about`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.8 },
    { url: `${BASE}/about/values`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.7 },
    { url: `${BASE}/about/rules`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.7 },
    { url: `${BASE}/about/faq`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.7 },
    { url: `${BASE}/about/callsigns`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.6 },
    { url: `${BASE}/about/contact`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.6 },

    // Community & roster
    { url: `${BASE}/community/orbat`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.7 },
    { url: `${BASE}/community/bios`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.7 },
    { url: `${BASE}/milpacs`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.7 },
    { url: `${BASE}/community/hof`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.5 },
    { url: `${BASE}/community/retired`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.5 },

    // Other public pages
    { url: `${BASE}/gallery`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.6 },
    { url: `${BASE}/partnerships`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.6 },
    { url: `${BASE}/support`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.5 },
    { url: `${BASE}/donate`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.5 },
    { url: `${BASE}/credits`, lastModified: new Date(), changeFrequency: 'yearly', priority: 0.3 },
  ]
}