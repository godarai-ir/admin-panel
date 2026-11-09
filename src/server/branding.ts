import { z } from 'zod';
import { createServerFn } from '@tanstack/react-start';
import type * as t from '@/types';
import { apiFetch, extractApiError } from './utils/api';
import { requireCapability } from './capabilities';
import { SystemCapabilities } from './constants';

const kindSchema = z.enum(['logo', 'chatBackground']);

const updateSchema = z.object({
  kind: kindSchema,
  image: z.string().optional(),
  opacity: z.number().optional(),
  tileSize: z.number().optional(),
});

/** Proxies LibreChat's branding API, which validates the images and owns the limits. */
export const getBrandingFn = createServerFn({ method: 'GET' }).handler(
  async (): Promise<t.BrandingStatus> => {
    await requireCapability(SystemCapabilities.MANAGE_CONFIGS);
    const response = await apiFetch('/api/admin/branding');
    if (!response.ok) {
      return extractApiError(response, 'Failed to read branding');
    }
    return (await response.json()) as t.BrandingStatus;
  },
);

export const updateBrandingFn = createServerFn({ method: 'POST' })
  .validator(updateSchema)
  .handler(async ({ data: { kind, ...body } }): Promise<t.BrandingStatus> => {
    await requireCapability(SystemCapabilities.MANAGE_CONFIGS);
    const response = await apiFetch(`/api/admin/branding/${kind}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      return extractApiError(response, 'Failed to save branding');
    }
    return (await response.json()) as t.BrandingStatus;
  });

export const resetBrandingFn = createServerFn({ method: 'POST' })
  .validator(z.object({ kind: kindSchema }))
  .handler(async ({ data: { kind } }): Promise<t.BrandingStatus> => {
    await requireCapability(SystemCapabilities.MANAGE_CONFIGS);
    const response = await apiFetch(`/api/admin/branding/${kind}`, { method: 'DELETE' });
    if (!response.ok) {
      return extractApiError(response, 'Failed to reset branding');
    }
    return (await response.json()) as t.BrandingStatus;
  });
