/** Local until the panel's `librechat-data-provider` version carries the fork's branding types. */
export type BrandingKind = 'logo' | 'chatBackground';

export interface BrandingBackground {
  dataUrl: string;
  opacity: number;
  tileSize: number;
}

export interface BrandingStatus {
  logo: { dataUrl: string } | null;
  chatBackground: BrandingBackground | null;
}

export interface BrandingUpdate {
  kind: BrandingKind;
  image?: string;
  opacity?: number;
  tileSize?: number;
}
