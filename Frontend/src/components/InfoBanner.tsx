import "./InfoBanner.css";

interface InfoBannerProps {
  message: string;
}

export const InfoBanner = ({ message}: InfoBannerProps) => {
  return (
    <div className="info-banner info-banner-info">
      {message}
    </div>
  );
};