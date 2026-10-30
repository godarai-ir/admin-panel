import http from 'node:http';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AddressInfo } from 'node:net';

const requestHeaders = new Map<string, string>();

vi.mock('@tanstack/react-start', () => ({ createServerOnlyFn: <T>(fn: T): T => fn }));
vi.mock('@tanstack/react-start/server', () => ({
  getRequestHeader: (name: string) => requestHeaders.get(name.toLowerCase()),
}));

import { requestTenantKey, upstreamFetch } from './upstream';

interface Received {
  method?: string;
  url?: string;
  headers: http.IncomingHttpHeaders;
  body: string;
}

const received: Received[] = [];
let server: http.Server;
let origin: string;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk: Buffer) => (body += chunk.toString()));
    req.on('end', () => {
      received.push({ method: req.method, url: req.url, headers: req.headers, body });
      if (req.url === '/empty') {
        res.writeHead(204).end();
        return;
      }
      res.setHeader('Set-Cookie', ['refreshToken=rt-1; Path=/', 'other=1; Path=/']);
      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ host: req.headers.host }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  received.length = 0;
  requestHeaders.clear();
  vi.stubEnv('API_SERVER_URL', origin);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('upstreamFetch in host mode', () => {
  beforeEach(() => {
    vi.stubEnv('MULTI_TENANT_MODE', 'host');
    vi.stubEnv('ADMIN_HOST_BASE_DOMAIN', 'admin.localhost');
    vi.stubEnv('TENANT_HOST_BASE_DOMAIN', 'chat.localhost');
    vi.stubEnv('TENANT_HOST_SCHEME', 'https');
  });

  it("reaches API_SERVER_URL with the tenant's chat Host, and never its tenant header", async () => {
    requestHeaders.set('host', 'tenant1.admin.localhost:3010');
    requestHeaders.set('x-tenant-id', 'tenant2');

    const response = await upstreamFetch('/api/admin/login/local', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://tenant1.admin.localhost:3010' },
      body: JSON.stringify({ email: 'admin@tenant1.example' }),
    });

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ host: 'tenant1.chat.localhost:3010' });
    const [request] = received;
    expect(request.method).toBe('POST');
    expect(request.url).toBe('/api/admin/login/local');
    expect(request.headers.origin).toBe('https://tenant1.admin.localhost:3010');
    expect(request.headers['x-tenant-id']).toBeUndefined();
    expect(JSON.parse(request.body)).toEqual({ email: 'admin@tenant1.example' });
  });

  it('keeps every Set-Cookie of the reply', async () => {
    requestHeaders.set('host', 'tenant1.admin.localhost');
    const response = await upstreamFetch('/api/auth/refresh', { method: 'POST' });
    expect(response.headers.getSetCookie()).toEqual([
      'refreshToken=rt-1; Path=/',
      'other=1; Path=/',
    ]);
  });

  it('answers a body-less status without a body', async () => {
    requestHeaders.set('host', 'tenant1.admin.localhost');
    const response = await upstreamFetch('/empty');
    expect(response.status).toBe(204);
    expect(response.body).toBeNull();
  });

  it('answers 404 without calling LibreChat for a host that names no tenant', async () => {
    requestHeaders.set('host', 'admin.localhost:3010');
    const response = await upstreamFetch('/api/config');
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ message: 'Not found', code: 'TENANT_HOST_UNKNOWN' });
    expect(received).toHaveLength(0);
  });

  it('keys shared state by the host tenant', () => {
    requestHeaders.set('host', 'tenant1.admin.localhost');
    requestHeaders.set('x-tenant-id', 'tenant2');
    expect(requestTenantKey()).toBe('tenant1');
  });
});

describe('upstreamFetch outside host mode', () => {
  it("forwards the deployment's X-Tenant-Id and keeps the URL's own Host", async () => {
    requestHeaders.set('x-tenant-id', ' tenant-a ');

    await upstreamFetch('/api/config', { headers: { Accept: 'application/json' } });

    const [request] = received;
    expect(request.headers['x-tenant-id']).toBe('tenant-a');
    expect(request.headers.accept).toBe('application/json');
    expect(request.headers.host).toBe(new URL(origin).host);
    expect(requestTenantKey()).toBe('tenant-a');
  });

  it('adds nothing in a single-tenant deployment', async () => {
    await upstreamFetch('/api/config');
    expect(received[0].headers['x-tenant-id']).toBeUndefined();
    expect(requestTenantKey()).toBe('');
  });
});
