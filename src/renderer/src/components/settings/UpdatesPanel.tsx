import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { userFacingErrorMessage } from '../../utils/error-message';
import { useUpdateState } from './hooks';

type UpdatesPanelProps = {
  isPackaged?: boolean;
};

export function UpdatesPanel({ isPackaged }: UpdatesPanelProps): ReactElement {
  const { t } = useTranslation();
  const { state, busy, actionError, check, download, install } = useUpdateState();

  if (!state) {
    return (
      <section className="settings-card">
        <p className="muted">{t('settings.about.checking')}</p>
      </section>
    );
  }

  const version = state.availableVersion ?? '';
  const percent = Math.round((state.downloadProgress ?? 0) * 100);

  let statusText: string | null = null;
  let tone: 'success' | 'warning' | 'error' | 'muted' = 'muted';
  let action: ReactElement | null = null;

  switch (state.status) {
    case 'unsupported':
      tone = 'warning';
      statusText = isPackaged === false ? t('settings.about.unsupportedDev') : t('settings.about.unsupportedDeb');
      break;
    case 'idle':
      break;
    case 'checking':
      statusText = t('settings.about.checking');
      action = (
        <button type="button" className="btn" disabled>
          {t('settings.about.checking')}
        </button>
      );
      break;
    case 'not_available':
      tone = 'success';
      statusText = t('settings.about.upToDate');
      break;
    case 'available':
      statusText = t('settings.about.updateAvailable', { version });
      action = (
        <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void download()}>
          {t('settings.about.download')}
        </button>
      );
      break;
    case 'downloading':
      statusText = t('settings.about.downloading', { version, percent });
      break;
    case 'downloaded':
      tone = 'success';
      statusText = t('settings.about.readyToInstall', { version });
      action = (
        <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void install()}>
          {t('settings.about.install')}
        </button>
      );
      break;
    case 'error':
      tone = 'error';
      statusText = state.message ?? t('settings.about.updateFailed');
      break;
  }

  // Check stays available whenever the updater can run, including after errors.
  if (!action && state.status !== 'unsupported' && state.status !== 'downloading') {
    action = (
      <button type="button" className="btn" disabled={busy} onClick={() => void check()}>
        {t('settings.about.checkUpdates')}
      </button>
    );
  }

  return (
    <section className="settings-card">
      {statusText ? <p className={`settings-update-status tone-${tone}`}>{statusText}</p> : null}

      {state.status === 'downloading' ? (
        <div
          className="settings-progress"
          role="progressbar"
          aria-label={t('settings.about.updates')}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
        >
          <span style={{ width: `${percent}%` }} />
        </div>
      ) : null}

      {state.status === 'available' && state.releaseNotes ? (
        <details className="settings-release-notes" open>
          <summary>{t('settings.about.releaseNotes')}</summary>
          <pre>{state.releaseNotes}</pre>
        </details>
      ) : null}

      {actionError ? (
        <p className="message message-error">{userFacingErrorMessage(actionError, t('settings.about.updateFailed'))}</p>
      ) : null}

      {action ? <div className="settings-inline">{action}</div> : null}
    </section>
  );
}
