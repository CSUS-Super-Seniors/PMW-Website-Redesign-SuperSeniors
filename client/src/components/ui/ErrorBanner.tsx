import { Banner, type BannerContentProps } from './Banner';

export type ErrorBannerProps = BannerContentProps;

export function ErrorBanner(props: ErrorBannerProps) {
  return <Banner tone="error" {...props} />;
}
