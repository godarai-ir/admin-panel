/** The scheme of the public tenant origins; `http` only on `.localhost` base domains. */
export type TenantHostScheme = 'http' | 'https';

/**
 * Host multi-tenancy (`MULTI_TENANT_MODE=host`), read with the same variables as LibreChat:
 * the panel of a tenant is `<slug>.<adminBaseDomain>` and manages `<slug>.<chatBaseDomain>`.
 */
export interface HostTenancyConfig {
  enabled: boolean;
  /** `ADMIN_HOST_BASE_DOMAIN`: the panel's own hosts are `<slug>.<adminBaseDomain>`. */
  adminBaseDomain: string;
  /** `TENANT_HOST_BASE_DOMAIN`: LibreChat's hosts are `<slug>.<chatBaseDomain>`. */
  chatBaseDomain: string;
  scheme: TenantHostScheme;
}

/** A `Host` header read as a tenant host: its slug and the port the client connected on, if any. */
export type TenantHostParse = { kind: 'slug'; slug: string; port?: string } | { kind: 'not-tenant' };

/** The tenant of the current request, resolved from the panel host it was reached on. */
export interface RequestTenant {
  slug: string;
  /** The `Host` LibreChat resolves this tenant from: `<slug>.<chatBaseDomain>[:port]`. */
  chatHost: string;
  /** LibreChat's public origin for this tenant, where browsers are sent. */
  chatOrigin: string;
  /** The panel's own public origin for this tenant. */
  adminOrigin: string;
}
