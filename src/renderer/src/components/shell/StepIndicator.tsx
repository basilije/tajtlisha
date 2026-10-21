import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import Check from 'lucide-react/dist/esm/icons/check.js';

export type StepKey = 'import' | 'trim' | 'transcribe' | 'translate' | 'review' | 'export';

export type StepStatus = 'done' | 'current' | 'upcoming';

export const STEP_ORDER: readonly StepKey[] = ['import', 'trim', 'transcribe', 'translate', 'review', 'export'];

export type StepIndicatorProps = {
  statuses: Record<StepKey, StepStatus>;
  /** Scrolls or focuses the matching area. Never changes the project. */
  onSelect: (step: StepKey) => void;
};

/** Compact workflow strip under the top bar. Steps are buttons that move focus to their area. */
export function StepIndicator({ statuses, onSelect }: StepIndicatorProps): ReactElement {
  const { t } = useTranslation();

  return (
    <nav className="steps" aria-label={t('shell.steps.label')}>
      <ol className="steps-list">
        {STEP_ORDER.map((step, index) => {
          const status = statuses[step];
          return (
            <li key={step} className={`step is-${status}`}>
              <button
                type="button"
                className="step-button"
                aria-current={status === 'current' ? 'step' : undefined}
                onClick={() => onSelect(step)}
              >
                <span className="step-number" aria-hidden="true">
                  {status === 'done' ? <Check size={12} /> : index + 1}
                </span>
                <span className="step-label">{t(`shell.steps.${step}`)}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
