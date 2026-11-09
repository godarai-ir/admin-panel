import { createFileRoute } from '@tanstack/react-router';
import { AccessDenied } from '@/components/shared';
import { BrandingPage } from '@/components/branding';
import { SystemCapabilities } from '@/constants';
import { useCapabilities } from '@/hooks';

export const Route = createFileRoute('/_app/branding')({
  component: BrandingRoute,
});

function BrandingRoute() {
  const { hasCapability } = useCapabilities();
  if (!hasCapability(SystemCapabilities.MANAGE_CONFIGS)) return <AccessDenied />;
  return <BrandingPage />;
}
