import type * as t from '@/types';

/** Mirrors `BRANDING_LIMITS` in LibreChat, which enforces them. */
export const BRANDING_LIMITS = {
  maxBytes: { logo: 512 * 1024, chatBackground: 1024 * 1024 },
  opacity: { min: 0.02, max: 1 },
  tileSize: { min: 32, max: 512 },
} as const;

const RASTER_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

export const BRANDING_IMAGE_TYPES: Readonly<Record<t.BrandingKind, readonly string[]>> = {
  logo: [...RASTER_TYPES, 'image/svg+xml'],
  chatBackground: RASTER_TYPES,
};

export const BRANDING_QUERY_KEY = ['adminBranding'] as const;
