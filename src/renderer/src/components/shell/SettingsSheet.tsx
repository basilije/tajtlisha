import type { ReactElement, ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useTranslation } from 'react-i18next';
import X from 'lucide-react/dist/esm/icons/x.js';

export type SettingsSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
};

/**
 * Settings as a full-window sheet above the editor. The editor stays mounted
 * underneath, so the open project and its unsaved state are never touched.
 */
export function SettingsSheet({ open, onOpenChange, children }: SettingsSheetProps): ReactElement {
  const { t } = useTranslation();

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Content className="settings-sheet">
          <div className="settings-sheet-header">
            <Dialog.Title className="settings-sheet-title">{t('shell.settings.title')}</Dialog.Title>
            <Dialog.Close asChild>
              <button type="button" className="btn btn-icon btn-ghost" aria-label={t('shell.settings.close')} title={t('shell.settings.close')}>
                <X aria-hidden="true" size={16} />
              </button>
            </Dialog.Close>
          </div>
          <Dialog.Description className="visually-hidden">{t('shell.settings.title')}</Dialog.Description>
          <div className="settings-sheet-body">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
