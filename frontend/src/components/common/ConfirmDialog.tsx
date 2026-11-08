import React, { useEffect, useRef } from 'react';

interface ConfirmDialogProps {
  title: string;
  message: string;
  details?: string[];
  confirmLabel?: string;
  cancelLabel?: string;
  busy?: boolean;
  /** Style the confirm button as destructive. */
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Modal confirmation. Focus starts on Cancel; Escape cancels. */
const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  title,
  message,
  details,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  busy = false,
  danger = false,
  onConfirm,
  onCancel,
}) => {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  return (
    <div
      className="dialog-backdrop"
      onKeyDown={(e) => {
        if (e.key === 'Escape') onCancel();
      }}
    >
      <div role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-message">
        <h2 id="confirm-title">{title}</h2>
        <p id="confirm-message">{message}</p>
        {details && details.length > 0 && (
          <ul>
            {details.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
        )}
        <button type="button" ref={cancelRef} onClick={onCancel} disabled={busy}>
          {cancelLabel}
        </button>
        <button type="button" className={danger ? 'danger' : 'primary'} onClick={onConfirm} disabled={busy}>
          {confirmLabel}
        </button>
      </div>
    </div>
  );
};

export default ConfirmDialog;
