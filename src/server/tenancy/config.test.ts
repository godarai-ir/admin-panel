import { describe, expect, it } from 'vitest';
import { isHostTenancyEnabled, resolveHostTenancy, validateHostTenancy } from './config';

const validEnv = {
  MULTI_TENANT_MODE: 'host',
  ADMIN_HOST_BASE_DOMAIN: 'admin.example.com',
  TENANT_HOST_BASE_DOMAIN: 'chat.example.com',
  API_SERVER_URL: 'http://librechat:3080',
};

const problemsFor = (env: Record<string, string | undefined>): string[] =>
  validateHostTenancy(resolveHostTenancy(env), env);

describe('isHostTenancyEnabled', () => {
  it.each([undefined, '', 'off', 'true'])('is off for %j', (mode) => {
    expect(isHostTenancyEnabled({ MULTI_TENANT_MODE: mode })).toBe(false);
  });

  it('is on for "host" in any case', () => {
    expect(isHostTenancyEnabled({ MULTI_TENANT_MODE: ' Host ' })).toBe(true);
  });
});

describe('resolveHostTenancy', () => {
  it('normalizes the base domains and defaults the scheme to https', () => {
    expect(
      resolveHostTenancy({
        ...validEnv,
        ADMIN_HOST_BASE_DOMAIN: ' Admin.Example.COM ',
        TENANT_HOST_BASE_DOMAIN: 'CHAT.example.com',
      }),
    ).toEqual({
      enabled: true,
      adminBaseDomain: 'admin.example.com',
      chatBaseDomain: 'chat.example.com',
      scheme: 'https',
    });
  });
});

describe('validateHostTenancy', () => {
  it('accepts nothing at all outside host mode', () => {
    expect(problemsFor({ VITE_API_BASE_URL: 'https://chat.example.com' })).toEqual([]);
  });

  it('accepts a complete configuration', () => {
    expect(problemsFor(validEnv)).toEqual([]);
  });

  it('accepts http on .localhost base domains for development', () => {
    expect(
      problemsFor({
        ...validEnv,
        TENANT_HOST_SCHEME: 'http',
        ADMIN_HOST_BASE_DOMAIN: 'admin.localhost',
        TENANT_HOST_BASE_DOMAIN: 'chat.localhost',
      }),
    ).toEqual([]);
  });

  it('refuses http on public base domains', () => {
    expect(problemsFor({ ...validEnv, TENANT_HOST_SCHEME: 'http' })).toEqual([
      expect.stringContaining('ADMIN_HOST_BASE_DOMAIN'),
      expect.stringContaining('TENANT_HOST_BASE_DOMAIN'),
    ]);
  });

  it('refuses an unknown scheme', () => {
    expect(problemsFor({ ...validEnv, TENANT_HOST_SCHEME: 'ftp' })).toEqual([
      expect.stringContaining('TENANT_HOST_SCHEME'),
    ]);
  });

  it.each(['ADMIN_HOST_BASE_DOMAIN', 'TENANT_HOST_BASE_DOMAIN', 'API_SERVER_URL'])(
    'requires %s',
    (name) => {
      expect(problemsFor({ ...validEnv, [name]: undefined })).toEqual([
        expect.stringContaining(name),
      ]);
    },
  );

  it.each(['https://admin.example.com', 'admin.example.com:443', '*.admin.example.com', 'admin'])(
    'refuses the base domain %j',
    (value) => {
      expect(problemsFor({ ...validEnv, ADMIN_HOST_BASE_DOMAIN: value })).toEqual([
        expect.stringContaining('ADMIN_HOST_BASE_DOMAIN'),
      ]);
    },
  );

  it('refuses one base domain for both the panel and LibreChat', () => {
    expect(problemsFor({ ...validEnv, ADMIN_HOST_BASE_DOMAIN: 'chat.example.com' })).toEqual([
      expect.stringContaining('must differ'),
    ]);
  });

  it('refuses fixed browser-facing origins, which would point every tenant at one', () => {
    expect(
      problemsFor({
        ...validEnv,
        VITE_API_BASE_URL: 'https://chat.example.com',
        VITE_BASE_PATH: '/admin',
      }),
    ).toEqual([expect.stringContaining('VITE_API_BASE_URL and VITE_BASE_PATH')]);
  });
});
