import type { ReactElement, ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useTranslation } from 'react-i18next';

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

  // The settings page renders its own visible header and close button; the
  // dialog only provides the full-window layer, focus trap and Esc handling.
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Content className="settings-overlay">
          <Dialog.Title className="visually-hidden">{t('shell.settings.title')}</Dialog.Title>
          <Dialog.Description className="visually-hidden">{t('shell.settings.title')}</Dialog.Description>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
