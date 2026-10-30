import { createServerOnlyFn } from '@tanstack/react-start';
import { getRequestHeader } from '@tanstack/react-start/server';
import type * as t from '@/types';
import { resolveHostTenancy } from './config';

const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const PORT_PATTERN = /^\d{1,5}$/;
const MAX_HOST_LENGTH = 255;
const IDN_PREFIX = 'xn--';
const DEFAULT_PORTS: Readonly<Record<t.TenantHostScheme, string>> = { https: '443', http: '80' };
const NOT_TENANT: t.TenantHostParse = { kind: 'not-tenant' };

/**
 * Reads a `Host` header as `<slug>.<baseDomain>[:port]`, LibreChat's rule
 * (`packages/api/src/tenancy/host.ts`): one DNS label, optional numeric port.
 * Several labels, IPv6 literals, userinfo, non-ASCII and `xn--` labels are not tenants.
 */
export function parseTenantHost(hostHeader: unknown, baseDomain: string): t.TenantHostParse {
  if (typeof hostHeader !== 'string' || !baseDomain) return NOT_TENANT;

  const raw = hostHeader.trim().toLowerCase();
  if (raw.length === 0 || raw.length > MAX_HOST_LENGTH) return NOT_TENANT;

  const portSeparator = raw.lastIndexOf(':');
  const port = portSeparator === -1 ? undefined : raw.slice(portSeparator + 1);
  if (port !== undefined && !PORT_PATTERN.test(port)) return NOT_TENANT;

  const host = portSeparator === -1 ? raw : raw.slice(0, portSeparator);
  const suffix = `.${baseDomain}`;
  if (!host.endsWith(suffix)) return NOT_TENANT;

  const slug = host.slice(0, host.length - suffix.length);
  if (!SLUG_PATTERN.test(slug) || slug.startsWith(IDN_PREFIX)) return NOT_TENANT;

  return { kind: 'slug', slug, ...(port && { port }) };
}

/** The tenant's chat and panel addresses, from validated parts only. */
export function buildRequestTenant(
  config: t.HostTenancyConfig,
  slug: string,
  port: string | undefined,
): t.RequestTenant {
  const portSuffix = port && port !== DEFAULT_PORTS[config.scheme] ? `:${port}` : '';
  const chatHost = `${slug}.${config.chatBaseDomain}${portSuffix}`;
  return {
    slug,
    chatHost,
    chatOrigin: `${config.scheme}://${chatHost}`,
    adminOrigin: `${config.scheme}://${slug}.${config.adminBaseDomain}${portSuffix}`,
  };
}

/**
 * Host mode: the tenant of the panel host this request reached, from the raw `Host` header
 * (never `X-Forwarded-Host`, which a client can set). `undefined` outside host mode and for a
 * host that is not `<slug>.<ADMIN_HOST_BASE_DOMAIN>`.
 *
 * `createServerOnlyFn`, like `readTenantHeader`: the module is reachable from client-bundled
 * routes through `@/server`, though every caller is server-only.
 */
export const resolveRequestTenant = createServerOnlyFn((): t.RequestTenant | undefined => {
  const config = resolveHostTenancy();
  if (!config.enabled) return undefined;
  const parsed = parseTenantHost(getRequestHeader('host'), config.adminBaseDomain);
  return parsed.kind === 'slug' ? buildRequestTenant(config, parsed.slug, parsed.port) : undefined;
});
