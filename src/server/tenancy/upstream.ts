import http from 'node:http';
import https from 'node:https';
import { createServerOnlyFn } from '@tanstack/react-start';
import { getRequestHeader } from '@tanstack/react-start/server';
import { TENANT_HOST_UNKNOWN_CODE } from '@/constants';
import { getServerApiUrl } from '../utils/url';
import { isHostTenancyEnabled } from './config';
import { resolveRequestTenant } from './host';

/** Statuses whose response may not carry a body (`new Response` throws on one that does). */
const NULL_BODY_STATUSES: ReadonlySet<number> = new Set([101, 204, 205, 304]);

/** The answer to a panel host that names no tenant, shaped like LibreChat's own unknown-host 404. */
const UNKNOWN_TENANT_BODY = { message: 'Not found', code: TENANT_HOST_UNKNOWN_CODE } as const;

/**
 * The `X-Tenant-Id` the deployment (its reverse proxy or auth gateway) set on
 * the request to the panel, trimmed; `undefined` when it carried none, as in
 * single-tenant and host-mode deploys.
 *
 * `createServerOnlyFn` (not a plain function): this file is reachable from a
 * client-bundled route (login.tsx -> @/server -> scopes.ts -> utils/api.ts ->
 * utils/refresh.ts) even though every actual caller is server-only, so the
 * bundler can't otherwise prove `getRequestHeader` stays out of the client build.
 */
export const readTenantHeader = createServerOnlyFn((): string | undefined => {
  if (isHostTenancyEnabled()) return undefined;
  const raw = getRequestHeader('x-tenant-id');
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : undefined;
});

/**
 * What identifies the request's tenant for keys shared across requests (refresh
 * dedupe): the host-mode slug, else the deployment's tenant header, else `''`.
 */
export function requestTenantKey(): string {
  return resolveRequestTenant()?.slug ?? readTenantHeader() ?? '';
}

/** `init` with the deployment's `X-Tenant-Id`, so LibreChat's `preAuthTenantMiddleware` scopes the call. */
function withTenantHeader(init: RequestInit): RequestInit {
  const tenantId = readTenantHeader();
  if (!tenantId) return init;
  return { ...init, headers: { ...headersRecord(init.headers), 'X-Tenant-Id': tenantId } };
}

/** `HeadersInit` as a plain record, keeping the caller's own spelling of a record's names. */
function headersRecord(headers: HeadersInit | undefined): Record<string, string> {
  if (headers instanceof Headers || Array.isArray(headers)) {
    return Object.fromEntries(new Headers(headers));
  }
  return { ...headers };
}

/** A `node:http` response as a web `Response`, its body streamed. */
function toResponse(res: http.IncomingMessage): Response {
  const headers = new Headers();
  for (let i = 0; i < res.rawHeaders.length; i += 2) {
    headers.append(res.rawHeaders[i], res.rawHeaders[i + 1]);
  }
  const status = res.statusCode ?? 502;
  const body = NULL_BODY_STATUSES.has(status)
    ? null
    : new ReadableStream<Uint8Array>({
        start(controller) {
          res.on('data', (chunk: Buffer) => controller.enqueue(new Uint8Array(chunk)));
          res.on('end', () => controller.close());
          res.on('error', (error) => controller.error(error));
        },
        cancel() {
          res.destroy();
        },
      });
  return new Response(body, { status, statusText: res.statusMessage, headers });
}

/**
 * Sends `init` to `url` with `Host` set to `host`. `fetch` cannot: it always
 * sends the URL's own host, and LibreChat resolves the tenant from `Host` alone.
 */
async function sendWithHost(url: URL, host: string, init: RequestInit): Promise<Response> {
  const request = new Request(url, init);
  const body = request.body ? Buffer.from(await request.arrayBuffer()) : undefined;
  const headers: Record<string, string> = {
    ...Object.fromEntries(request.headers),
    host,
    'accept-encoding': 'identity',
    ...(body && { 'content-length': String(body.length) }),
  };
  const transport = url.protocol === 'https:' ? https : http;

  return new Promise((resolve, reject) => {
    const outgoing = transport.request(
      url,
      { method: request.method, headers, signal: init.signal ?? undefined },
      (res) => resolve(toResponse(res)),
    );
    outgoing.on('error', reject);
    outgoing.end(body);
  });
}

/**
 * A request to LibreChat on behalf of the current panel request, carrying its tenant:
 * - host mode: to `API_SERVER_URL` with `Host: <slug>.<TENANT_HOST_BASE_DOMAIN>`, so
 *   LibreChat's host middleware resolves the same tenant a browser on that host gets;
 *   a panel host that names no tenant is answered 404 without calling LibreChat;
 * - otherwise: `fetch` with the deployment's `X-Tenant-Id`, if any.
 */
export async function upstreamFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const url = `${getServerApiUrl()}${path}`;
  if (!isHostTenancyEnabled()) return fetch(url, withTenantHeader(init));

  const tenant = resolveRequestTenant();
  if (!tenant) return Response.json(UNKNOWN_TENANT_BODY, { status: 404 });
  return sendWithHost(new URL(url), tenant.chatHost, init);
}
