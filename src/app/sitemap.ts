import type { MetadataRoute } from 'next';
import { getPublicSitemapAssets } from '@/modules/catalog/server/catalog.service';
import { getAssetDetailRoute } from '@/modules/catalog/domain/catalog-utils';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const now = new Date();

  // 1. Rotas estáticas canônicas
  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: `${baseUrl}`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 1.0,
    },
    {
      url: `${baseUrl}/ativos`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: `${baseUrl}/acoes`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: `${baseUrl}/fiis`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: `${baseUrl}/etfs`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: `${baseUrl}/bdrs`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.9,
    },
  ];

  try {
    // 2. Consulta ativos públicos com limite seguro de 1.000 URLs para o MVP
    const publicAssets = await getPublicSitemapAssets(1000);

    const dynamicRoutes: MetadataRoute.Sitemap = publicAssets.map((asset) => ({
      url: `${baseUrl}${getAssetDetailRoute(asset.assetType, asset.ticker)}`,
      lastModified: asset.updatedAt,
      changeFrequency: 'daily',
      priority: 0.8,
    }));

    return [...staticRoutes, ...dynamicRoutes];
  } catch (err) {
    console.error('[Sitemap] Fallback para rotas estáticas devido a erro:', err);
    return staticRoutes;
  }
}
