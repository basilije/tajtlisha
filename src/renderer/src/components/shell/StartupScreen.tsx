import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import TriangleAlert from 'lucide-react/dist/esm/icons/triangle-alert.js';
import RefreshCw from 'lucide-react/dist/esm/icons/refresh-cw.js';

export type StartupScreenProps =
  | { kind: 'loading' }
  | { kind: 'error'; detail: string | null; onRetry: () => void };

/** Full-window state while settings load. Shown only when the editor cannot start without them. */
export function StartupScreen(props: StartupScreenProps): ReactElement {
  const { t } = useTranslation();

  if (props.kind === 'loading') {
    return (
      <div className="startup-screen" role="status">
        <span className="muted">{t('shell.loading')}</span>
      </div>
    );
  }

  return (
    <div className="startup-screen">
      <section className="startup-card" role="alert">
        <TriangleAlert aria-hidden="true" size={22} className="startup-icon" />
        <h1 className="startup-title">{t('shell.loadError.title')}</h1>
        <p className="muted">{t('shell.loadError.body')}</p>
        {props.detail && <p className="mono startup-detail">{props.detail}</p>}
        <button type="button" className="btn btn-primary" onClick={props.onRetry}>
          <RefreshCw aria-hidden="true" size={14} />
          {t('shell.loadError.retry')}
        </button>
      </section>
    </div>
  );
}
