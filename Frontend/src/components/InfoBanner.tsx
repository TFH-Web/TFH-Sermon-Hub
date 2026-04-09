import type { ReactNode } from 'react';
import './InfoBanner.css';

type BannerVariant = 'info' | 'gray';

interface InfoBannerProps {
	message: ReactNode;
	variant?: BannerVariant;
}

export const InfoBanner = ({ message, variant = 'info' }: InfoBannerProps) => {
	return <div className={`info-banner info-banner-${variant}`}>{message}</div>;
};
