import CircleCheck from 'lucide-react/dist/esm/icons/circle-check.js';
import CircleX from 'lucide-react/dist/esm/icons/circle-x.js';
import RefreshCw from 'lucide-react/dist/esm/icons/refresh-cw.js';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import type { FfmpegCapabilityFlags } from '../../../../shared/types/media';
import { useFfmpegStatus } from './hooks';

type Capability = {
  key: keyof FfmpegCapabilityFlags;
  /** Identifier shown as code. Not translated: it names a tool, not prose. */
  code: string;
  labelKey: string;
};

// Each capability is something the export pipeline needs (see FfmpegService).
const CAPABILITIES: Capability[] = [
  { key: 'ffprobe', code: 'ffprobe', labelKey: 'settings.ffmpeg.cap.probe' },
  { key: 'assFilter', code: 'subtitles (ass)', labelKey: 'settings.ffmpeg.cap.subtitles' },
  { key: 'libx264', code: 'libx264', labelKey: 'settings.ffmpeg.cap.video' },
  { key: 'aac', code: 'aac', labelKey: 'settings.ffmpeg.cap.audio' },
  { key: 'mp3', code: 'mp3', labelKey: 'settings.ffmpeg.cap.audio' }
];

export function FfmpegPanel(): ReactElement {
  const { t } = useTranslation();
  const { status, loading, error, check } = useFfmpegStatus();
  const checks = status?.capabilities
    ? CAPABILITIES.map((capability) => ({
        ...capability,
        ok: status.capabilities?.[capability.key] === true
      }))
    : [];
  const missingLabels = checks.length > 0
    ? checks.filter((item) => !item.ok).map((item) => t(item.labelKey))
    : (status?.missing ?? []);

  return (
    <section className="settings-card">
      <div className="settings-card-head">
        <span className="muted">{status?.version ? <code>{status.version}</code> : null}</span>
        <button type="button" className="btn btn-sm" disabled={loading} onClick={() => void check()}>
          <RefreshCw aria-hidden="true" size={13} />
          {t('settings.ffmpeg.recheck')}
        </button>
      </div>

      {loading && !status ? <p className="muted">{t('settings.ffmpeg.checking')}</p> : null}
      {error ? <p className="message message-error">{t('settings.ffmpeg.unreadable')}</p> : null}

      {status && !error ? (
        <>
          {status.available ? <p className="message message-success">{t('settings.ffmpeg.ready')}</p> : null}
          {!status.available && !status.path ? (
            <p className="message message-warning">{t('settings.ffmpeg.notFound')}</p>
          ) : null}

          {checks.length > 0 ? (
            <ul className="settings-check-list">
              {checks.map((item) => (
                <li key={item.key} className="settings-check">
                  {item.ok ? (
                    <CircleCheck aria-hidden="true" size={16} className="icon-success" />
                  ) : (
                    <CircleX aria-hidden="true" size={16} className="icon-danger" />
                  )}
                  <span>{t(item.labelKey)}</span>
                  <code>{item.code}</code>
                  <span className={`badge ${item.ok ? 'badge-success' : 'badge-danger'}`}>
                    {item.ok ? t('settings.ffmpeg.available') : t('settings.ffmpeg.missingStatus')}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}

          {missingLabels.length > 0 ? (
            <p className="message message-warning">
              {t('settings.ffmpeg.missing', { items: missingLabels.join(', ') })}
            </p>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
