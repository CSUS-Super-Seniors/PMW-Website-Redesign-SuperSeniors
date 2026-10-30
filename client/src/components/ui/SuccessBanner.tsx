import { Banner, type BannerContentProps } from './Banner';

export type SuccessBannerProps = BannerContentProps;

/** In-page confirmation that stays put, unlike Toast. Same layout as ErrorBanner. */
export function SuccessBanner(props: SuccessBannerProps) {
  return <Banner tone="success" {...props} />;
}
