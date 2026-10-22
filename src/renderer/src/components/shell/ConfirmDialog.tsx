import type { ReactElement } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useTranslation } from 'react-i18next';

export type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  onAnswer: (accept: boolean) => void;
};

/** Small modal for actions that would replace or remove work. Escape cancels. */
export function ConfirmDialog({ open, title, description, confirmLabel, onAnswer }: ConfirmDialogProps): ReactElement {
  const { t } = useTranslation();

  return (
    <Dialog.Root open={open} onOpenChange={(next) => !next && onAnswer(false)}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content confirm-dialog">
          <Dialog.Title className="dialog-title">{title}</Dialog.Title>
          <Dialog.Description className="muted confirm-description">{description}</Dialog.Description>
          <div className="dialog-footer">
            <button type="button" className="btn" onClick={() => onAnswer(false)}>
              {t('shell.confirm.cancel')}
            </button>
            <button type="button" className="btn btn-primary" autoFocus onClick={() => onAnswer(true)}>
              {confirmLabel}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
