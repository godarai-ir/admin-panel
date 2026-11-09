import { useRef, useState } from 'react';
import { Button } from '@clickhouse/click-ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ChangeEvent, ReactNode } from 'react';
import type * as t from '@/types';
import { BRANDING_IMAGE_TYPES, BRANDING_LIMITS, BRANDING_QUERY_KEY } from '@/constants';
import { getBrandingFn, resetBrandingFn, updateBrandingFn } from '@/server';
import { BusyButton, LoadingState } from '@/components/shared';
import { useLocalize } from '@/hooks';
import { cn } from '@/utils';

function readBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.readAsDataURL(file);
  });
}

function useBrandingWrites() {
  const queryClient = useQueryClient();
  const onSuccess = (status: t.BrandingStatus) =>
    queryClient.setQueryData(BRANDING_QUERY_KEY, status);
  const update = useMutation({
    mutationFn: (data: t.BrandingUpdate) => updateBrandingFn({ data }),
    onSuccess,
  });
  const reset = useMutation({
    mutationFn: (kind: t.BrandingKind) => resetBrandingFn({ data: { kind } }),
    onSuccess,
  });
  return { update, reset };
}

function ErrorText({ message }: { message: string }) {
  return (
    <p role="alert" className="text-sm text-(--cui-color-text-danger)">
      {message}
    </p>
  );
}

function AssetCard({
  kind,
  title,
  description,
  isSet,
  writes,
  children,
}: {
  kind: t.BrandingKind;
  title: string;
  description: string;
  isSet: boolean;
  writes: ReturnType<typeof useBrandingWrites>;
  children: ReactNode;
}) {
  const localize = useLocalize();
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileError, setFileError] = useState('');
  const { update, reset } = writes;
  const isBusy = update.isPending || reset.isPending;
  const failure = update.error ?? reset.error;

  const onFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!BRANDING_IMAGE_TYPES[kind].includes(file.type)) {
      setFileError(localize('com_branding_error_type'));
      return;
    }
    const maxBytes = BRANDING_LIMITS.maxBytes[kind];
    if (file.size > maxBytes) {
      setFileError(localize('com_branding_error_size', { 0: Math.round(maxBytes / 1024) }));
      return;
    }
    setFileError('');
    update.mutate({ kind, image: await readBase64(file) });
  };

  return (
    <section
      aria-label={title}
      className="flex flex-col gap-4 rounded-lg border border-(--cui-color-stroke-default) bg-(--cui-color-background-panel) p-4"
    >
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-medium text-(--cui-color-title-default)">{title}</h3>
        <p className="text-sm text-(--cui-color-text-muted)">{description}</p>
      </div>
      {children}
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          hidden
          aria-label={title}
          accept={BRANDING_IMAGE_TYPES[kind].join(',')}
          onChange={(event) => void onFile(event)}
        />
        <BusyButton
          type="secondary"
          htmlType="button"
          busy={update.isPending}
          disabled={reset.isPending}
          label={localize('com_branding_upload')}
          onClick={() => inputRef.current?.click()}
        />
        {isSet && (
          <Button
            type="empty"
            htmlType="button"
            disabled={isBusy}
            label={localize('com_branding_reset')}
            onClick={() => reset.mutate(kind)}
          />
        )}
      </div>
      {fileError && <ErrorText message={fileError} />}
      {failure && <ErrorText message={failure.message} />}
    </section>
  );
}

function TilePreview({ background, dark }: { background: t.BrandingBackground; dark: boolean }) {
  const localize = useLocalize();
  return (
    <div
      className={cn(
        'relative isolate h-40 overflow-hidden rounded-lg border border-(--cui-color-stroke-default) p-4 text-sm',
        dark ? 'bg-[#1f1f1c] text-white' : 'bg-white text-black',
      )}
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 bg-repeat"
        style={{
          backgroundImage: `url("${background.dataUrl}")`,
          backgroundSize: `${background.tileSize}px`,
          opacity: background.opacity,
        }}
      />
      {localize('com_branding_preview_message')}
    </div>
  );
}

function RangeField({
  label,
  display,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  display: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm text-(--cui-color-text-default)">
      <span className="flex justify-between">
        <span>{label}</span>
        <span className="text-(--cui-color-text-muted)">{display}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function BackgroundEditor({
  background,
  writes,
}: {
  background: t.BrandingBackground;
  writes: ReturnType<typeof useBrandingWrites>;
}) {
  const localize = useLocalize();
  const [draft, setDraft] = useState<{ opacity?: number; tileSize?: number }>({});
  const preview = { ...background, ...draft };
  const isDirty =
    preview.opacity !== background.opacity || preview.tileSize !== background.tileSize;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <TilePreview background={preview} dark={false} />
        <TilePreview background={preview} dark />
      </div>
      <RangeField
        label={localize('com_branding_opacity')}
        display={`${Math.round(preview.opacity * 100)}%`}
        value={preview.opacity}
        min={BRANDING_LIMITS.opacity.min}
        max={BRANDING_LIMITS.opacity.max}
        step={0.01}
        onChange={(opacity) => setDraft((current) => ({ ...current, opacity }))}
      />
      <RangeField
        label={localize('com_branding_tile_size')}
        display={`${preview.tileSize}px`}
        value={preview.tileSize}
        min={BRANDING_LIMITS.tileSize.min}
        max={BRANDING_LIMITS.tileSize.max}
        step={8}
        onChange={(tileSize) => setDraft((current) => ({ ...current, tileSize }))}
      />
      <div>
        <BusyButton
          type="primary"
          htmlType="button"
          busy={writes.update.isPending}
          disabled={!isDirty}
          label={localize('com_ui_save')}
          onClick={() =>
            writes.update.mutate(
              { kind: 'chatBackground', opacity: preview.opacity, tileSize: preview.tileSize },
              { onSuccess: () => setDraft({}) },
            )
          }
        />
      </div>
    </div>
  );
}

function EmptyPreview({ text }: { text: string }) {
  return <p className="text-sm text-(--cui-color-text-muted)">{text}</p>;
}

export function BrandingPage() {
  const localize = useLocalize();
  const query = useQuery({
    queryKey: BRANDING_QUERY_KEY,
    queryFn: () => getBrandingFn(),
    retry: false,
    refetchOnWindowFocus: false,
  });
  const logoWrites = useBrandingWrites();
  const backgroundWrites = useBrandingWrites();

  if (query.isPending) return <LoadingState />;
  if (query.isError) {
    return (
      <div className="p-6">
        <ErrorText message={query.error.message} />
      </div>
    );
  }

  const { logo, chatBackground } = query.data;

  return (
    <div
      role="region"
      aria-label={localize('com_nav_branding')}
      className="flex flex-1 flex-col gap-4 overflow-auto p-6"
    >
      <AssetCard
        kind="logo"
        title={localize('com_branding_logo_title')}
        description={localize('com_branding_logo_description')}
        isSet={logo != null}
        writes={logoWrites}
      >
        {logo ? (
          <img
            src={logo.dataUrl}
            alt={localize('com_branding_logo_title')}
            className="h-10 w-fit max-w-full object-contain"
          />
        ) : (
          <EmptyPreview text={localize('com_branding_logo_default')} />
        )}
      </AssetCard>
      <AssetCard
        kind="chatBackground"
        title={localize('com_branding_background_title')}
        description={localize('com_branding_background_description')}
        isSet={chatBackground != null}
        writes={backgroundWrites}
      >
        {chatBackground ? (
          <BackgroundEditor background={chatBackground} writes={backgroundWrites} />
        ) : (
          <EmptyPreview text={localize('com_branding_background_default')} />
        )}
      </AssetCard>
    </div>
  );
}
