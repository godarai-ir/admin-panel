import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type * as t from '@/types';
import { getBrandingFn, resetBrandingFn, updateBrandingFn } from '@/server';
import { BrandingPage } from '../BrandingPage';

vi.mock('@/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

vi.mock('@/server', () => ({
  getBrandingFn: vi.fn(),
  updateBrandingFn: vi.fn(),
  resetBrandingFn: vi.fn(),
}));

const EMPTY: t.BrandingStatus = { logo: null, chatBackground: null };
const CONFIGURED: t.BrandingStatus = {
  logo: { dataUrl: 'data:image/png;base64,AA==' },
  chatBackground: { dataUrl: 'data:image/png;base64,BB==', opacity: 0.1, tileSize: 128 },
};

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <BrandingPage />
    </QueryClientProvider>,
  );
}

function chooseFile(title: string, file: File) {
  const input = document.querySelector<HTMLInputElement>(`input[aria-label="${title}"]`);
  fireEvent.change(input!, { target: { files: [file] } });
}

describe('BrandingPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getBrandingFn).mockResolvedValue(EMPTY);
  });

  it('shows the defaults when nothing is configured', async () => {
    renderPage();
    expect(await screen.findByText('com_branding_logo_default')).toBeTruthy();
    expect(screen.getByText('com_branding_background_default')).toBeTruthy();
    expect(screen.queryByText('com_branding_reset')).toBeNull();
  });

  it('shows the load error', async () => {
    vi.mocked(getBrandingFn).mockRejectedValue(new Error('load failed'));
    renderPage();
    expect(await screen.findByText('load failed')).toBeTruthy();
  });

  it('uploads a valid logo as base64', async () => {
    vi.mocked(updateBrandingFn).mockResolvedValue(CONFIGURED);
    renderPage();
    await screen.findByText('com_branding_logo_default');
    chooseFile('com_branding_logo_title', new File(['hi'], 'a.png', { type: 'image/png' }));
    await waitFor(() =>
      expect(updateBrandingFn).toHaveBeenCalledWith({ data: { kind: 'logo', image: 'aGk=' } }),
    );
    expect(await screen.findByRole('img')).toBeTruthy();
  });

  it('refuses an SVG background before uploading', async () => {
    renderPage();
    await screen.findByText('com_branding_background_default');
    chooseFile(
      'com_branding_background_title',
      new File(['<svg/>'], 'a.svg', { type: 'image/svg+xml' }),
    );
    expect(await screen.findByText('com_branding_error_type')).toBeTruthy();
    expect(updateBrandingFn).not.toHaveBeenCalled();
  });

  it('refuses an oversized logo before uploading', async () => {
    renderPage();
    await screen.findByText('com_branding_logo_default');
    chooseFile(
      'com_branding_logo_title',
      new File([new Uint8Array(513 * 1024)], 'a.png', { type: 'image/png' }),
    );
    expect(await screen.findByText('com_branding_error_size')).toBeTruthy();
    expect(updateBrandingFn).not.toHaveBeenCalled();
  });

  it('restores the default', async () => {
    vi.mocked(getBrandingFn).mockResolvedValue(CONFIGURED);
    vi.mocked(resetBrandingFn).mockResolvedValue({ ...CONFIGURED, logo: null });
    renderPage();
    const [logoReset] = await screen.findAllByText('com_branding_reset');
    fireEvent.click(logoReset);
    await waitFor(() => expect(resetBrandingFn).toHaveBeenCalledWith({ data: { kind: 'logo' } }));
    expect(await screen.findByText('com_branding_logo_default')).toBeTruthy();
  });

  it('saves only changed tile settings after a change', async () => {
    vi.mocked(getBrandingFn).mockResolvedValue(CONFIGURED);
    vi.mocked(updateBrandingFn).mockResolvedValue({
      ...CONFIGURED,
      chatBackground: { ...CONFIGURED.chatBackground!, opacity: 0.5 },
    });
    renderPage();
    fireEvent.change(await screen.findByLabelText(/com_branding_opacity/), {
      target: { value: '0.5' },
    });
    fireEvent.click(screen.getByText('com_ui_save'));
    await waitFor(() =>
      expect(updateBrandingFn).toHaveBeenCalledWith({
        data: { kind: 'chatBackground', opacity: 0.5, tileSize: 128 },
      }),
    );
  });
});
