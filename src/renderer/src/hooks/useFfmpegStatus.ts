import { useEffect, useState } from 'react';
import type { FfmpegStatus } from '../../../shared/types/media';
import type { TajtlishaApi } from '../../../shared/types/ipc';

export type FfmpegStatusState =
  | { phase: 'checking' }
  | { phase: 'ready'; status: FfmpegStatus }
  | { phase: 'unknown' };

/** Asks main once for the ffmpeg status. Main fails fast, so this never hangs for long. */
export function useFfmpegStatus(): FfmpegStatusState {
  const [state, setState] = useState<FfmpegStatusState>({ phase: 'checking' });

  useEffect(() => {
    const api = typeof window === 'undefined' ? undefined : (window.tajtlisha as TajtlishaApi | undefined);
    if (!api) {
      setState({ phase: 'unknown' });
      return undefined;
    }

    let cancelled = false;
    api.media.getFfmpegStatus().then(
      (status) => {
        if (!cancelled) setState({ phase: 'ready', status });
      },
      () => {
        if (!cancelled) setState({ phase: 'unknown' });
      }
    );
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
