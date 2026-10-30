import type * as t from '@/types';

type Env = Readonly<Record<string, string | undefined>>;

const DNS_LABEL = '[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?';
const BASE_DOMAIN_PATTERN = new RegExp(`^${DNS_LABEL}(?:\\.${DNS_LABEL})+$`);
const LOCALHOST_PATTERN = /(^|\.)localhost$/;

const clean = (value: string | undefined): string => value?.trim() ?? '';

/** True when `MULTI_TENANT_MODE=host`, the same switch LibreChat reads. */
export function isHostTenancyEnabled(env: Env = process.env): boolean {
  return clean(env.MULTI_TENANT_MODE).toLowerCase() === 'host';
}

/** The host multi-tenancy settings; `validateHostTenancy` reports what is wrong with them. */
export function resolveHostTenancy(env: Env = process.env): t.HostTenancyConfig {
  const scheme = clean(env.TENANT_HOST_SCHEME).toLowerCase() || 'https';
  return {
    enabled: isHostTenancyEnabled(env),
    adminBaseDomain: clean(env.ADMIN_HOST_BASE_DOMAIN).toLowerCase(),
    chatBaseDomain: clean(env.TENANT_HOST_BASE_DOMAIN).toLowerCase(),
    scheme: scheme === 'http' ? 'http' : 'https',
  };
}

function baseDomainProblem(name: string, value: string, scheme: t.TenantHostScheme): string[] {
  if (!value) return [`${name} is required (for example ${name.startsWith('ADMIN') ? 'admin' : 'chat'}.example.com)`];
  if (!BASE_DOMAIN_PATTERN.test(value)) {
    return [`${name} must be a bare lowercase host name: no scheme, port, wildcard or trailing dot`];
  }
  if (scheme === 'http' && !LOCALHOST_PATTERN.test(value)) {
    return [`TENANT_HOST_SCHEME "http" requires ${name} to end in .localhost`];
  }
  return [];
}

/**
 * Every reason the environment cannot run the panel in host mode; empty when disabled or valid.
 * The fixed browser-facing settings are refused: each request's origins come from its `Host`.
 */
export function validateHostTenancy(config: t.HostTenancyConfig, env: Env = process.env): string[] {
  if (!config.enabled) return [];

  const scheme = clean(env.TENANT_HOST_SCHEME).toLowerCase();
  const problems = [
    ...(scheme && scheme !== 'http' && scheme !== 'https'
      ? ['TENANT_HOST_SCHEME must be "https" (or "http" on .localhost base domains)']
      : []),
    ...baseDomainProblem('ADMIN_HOST_BASE_DOMAIN', config.adminBaseDomain, config.scheme),
    ...baseDomainProblem('TENANT_HOST_BASE_DOMAIN', config.chatBaseDomain, config.scheme),
  ];
  if (config.adminBaseDomain && config.adminBaseDomain === config.chatBaseDomain) {
    problems.push('ADMIN_HOST_BASE_DOMAIN must differ from TENANT_HOST_BASE_DOMAIN');
  }
  if (!clean(env.API_SERVER_URL)) {
    problems.push('API_SERVER_URL is required: the internal address the panel reaches LibreChat on');
  }
  const fixed = ['VITE_API_BASE_URL', 'VITE_BASE_PATH'].filter((name) => clean(env[name]) !== '');
  if (fixed.length > 0) {
    problems.push(
      `${fixed.join(' and ')} must be unset: each tenant's panel and LibreChat origins come from the request host`,
    );
  }
  return problems;
}
