import React, { useState } from 'react';
import api from '../../services/api';
import type { EventItem } from '../../services/apiTypes';
import ConfirmDialog from '../common/ConfirmDialog';

interface DeleteEventButtonProps {
  event: Pick<EventItem, 'eventId' | 'title'>;
  onDeleted: () => void;
  onError?: (message: string) => void;
}

/** Deletes an event; if it has bookings the API asks for confirmation first (Req 2.8). */
const DeleteEventButton: React.FC<DeleteEventButtonProps> = ({ event, onDeleted, onError }) => {
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<{ message: string; warnings: string[] }>();

  const run = async (confirmed: boolean) => {
    setBusy(true);
    try {
      const result = await api.deleteEvent(event.eventId, confirmed);
      if (result.ok) {
        setConfirm(undefined);
        onDeleted();
      } else if (result.kind === 'confirm_required') {
        setConfirm({ message: result.message, warnings: result.warnings });
      } else {
        setConfirm(undefined);
        onError?.(result.kind === 'error' ? result.error.message : result.message);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button type="button" className="danger" onClick={() => void run(false)} disabled={busy}>
        Delete<span className="visually-hidden"> {event.title}</span>
      </button>
      {confirm && (
        <ConfirmDialog
          title={`Delete "${event.title}"?`}
          message={confirm.message || 'This event has bookings. Deleting it removes them too.'}
          details={confirm.warnings}
          confirmLabel="Delete event" danger
          busy={busy}
          onConfirm={() => void run(true)}
          onCancel={() => setConfirm(undefined)}
        />
      )}
    </>
  );
};

export default DeleteEventButton;
