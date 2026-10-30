import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const requestHeaders = new Map<string, string>();

vi.mock('@tanstack/react-start', () => ({ createServerOnlyFn: <T>(fn: T): T => fn }));
vi.mock('@tanstack/react-start/server', () => ({
  getRequestHeader: (name: string) => requestHeaders.get(name.toLowerCase()),
}));

import { buildRequestTenant, parseTenantHost, resolveRequestTenant } from './host';

const BASE = 'admin.example.com';

describe('parseTenantHost', () => {
  it.each([
    ['acme.admin.example.com', { kind: 'slug', slug: 'acme' }],
    ['ACME.Admin.Example.com', { kind: 'slug', slug: 'acme' }],
    ['acme.admin.example.com:3010', { kind: 'slug', slug: 'acme', port: '3010' }],
    ['a-1.admin.example.com', { kind: 'slug', slug: 'a-1' }],
  ])('reads %j as a tenant host', (host, expected) => {
    expect(parseTenantHost(host, BASE)).toEqual(expected);
  });

  it.each([
    undefined,
    '',
    'admin.example.com',
    'a.b.admin.example.com',
    'acme.admin.example.com.',
    'acme.chat.example.com',
    'acme.admin.example.com:port',
    'xn--80ak6aa92e.admin.example.com',
    '-acme.admin.example.com',
    'user@acme.admin.example.com',
    '[::1]:3010',
    `${'a'.repeat(250)}.admin.example.com`,
  ])('refuses %j', (host) => {
    expect(parseTenantHost(host, BASE)).toEqual({ kind: 'not-tenant' });
  });
});

describe('buildRequestTenant', () => {
  const config = {
    enabled: true,
    adminBaseDomain: 'admin.localhost',
    chatBaseDomain: 'chat.localhost',
    scheme: 'https' as const,
  };

  it("builds both of the tenant's origins on the port the client connected on", () => {
    expect(buildRequestTenant(config, 'tenant1', '3010')).toEqual({
      slug: 'tenant1',
      chatHost: 'tenant1.chat.localhost:3010',
      chatOrigin: 'https://tenant1.chat.localhost:3010',
      adminOrigin: 'https://tenant1.admin.localhost:3010',
    });
  });

  it("drops the scheme's default port", () => {
    expect(buildRequestTenant(config, 'tenant1', '443').chatOrigin).toBe(
      'https://tenant1.chat.localhost',
    );
  });
});

describe('resolveRequestTenant', () => {
  beforeEach(() => {
    requestHeaders.clear();
    vi.stubEnv('MULTI_TENANT_MODE', 'host');
    vi.stubEnv('ADMIN_HOST_BASE_DOMAIN', 'admin.example.com');
    vi.stubEnv('TENANT_HOST_BASE_DOMAIN', 'chat.example.com');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('resolves the tenant from the raw Host header', () => {
    requestHeaders.set('host', 'acme.admin.example.com');
    expect(resolveRequestTenant()?.chatHost).toBe('acme.chat.example.com');
  });

  it('ignores X-Forwarded-Host, which a client can set', () => {
    requestHeaders.set('host', 'admin.example.com');
    requestHeaders.set('x-forwarded-host', 'acme.admin.example.com');
    expect(resolveRequestTenant()).toBeUndefined();
  });

  it('resolves nothing outside host mode', () => {
    vi.stubEnv('MULTI_TENANT_MODE', '');
    requestHeaders.set('host', 'acme.admin.example.com');
    expect(resolveRequestTenant()).toBeUndefined();
  });
});
