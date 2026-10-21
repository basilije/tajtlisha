import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import TriangleAlert from 'lucide-react/dist/esm/icons/triangle-alert.js';

export type SourceBannerProps = {
  onFind: () => void;
};

/** Shown when the saved video is missing or changed. Captions stay; only the video needs relinking. */
export function SourceBanner({ onFind }: SourceBannerProps): ReactElement {
  const { t } = useTranslation();

  return (
    <div className="source-banner message message-warning" role="alert">
      <TriangleAlert aria-hidden="true" size={16} />
      <span className="source-banner-text">{t('shell.source.moved')}</span>
      <button type="button" className="btn btn-sm" onClick={onFind}>
        {t('shell.source.findVideo')}
      </button>
    </div>
  );
}
