import React, { useState } from 'react';
import api from '../../services/api';
import type { Cfp } from '../../services/apiTypes';
import ConfirmDialog from '../common/ConfirmDialog';

interface CfpActionsProps {
  cfp: Pick<Cfp, 'cfpId' | 'title' | 'status' | 'updatedAt'>;
  /** Called after close/reopen with the updated CFP. */
  onChanged: (cfp: Cfp) => void;
  /** Called after duplicate with the new draft copy. */
  onDuplicated: (cfp: Cfp) => void;
  onDeleted: () => void;
  onError: (message: string) => void;
}

/** Close or reopen, duplicate, and delete (with confirmation when submissions exist). */
const CfpActions: React.FC<CfpActionsProps> = ({ cfp, onChanged, onDuplicated, onDeleted, onError }) => {
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<{ message: string; warnings: string[] }>();

  const fail = (result: { kind: string; error?: { message: string }; message?: string }) =>
    onError(result.kind === 'error' ? (result.error?.message ?? 'Request failed') : (result.message ?? 'Request failed'));

  const setStatus = async (status: 'open' | 'closed') => {
    setBusy(true);
    try {
      const result = await api.updateCfp(cfp.cfpId, { status, updatedAt: cfp.updatedAt });
      if (result.ok) onChanged(result.data);
      else fail(result);
    } finally {
      setBusy(false);
    }
  };

  const duplicate = async () => {
    setBusy(true);
    try {
      const result = await api.duplicateCfp(cfp.cfpId);
      if (result.ok) onDuplicated(result.data);
      else fail(result);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (confirmed: boolean) => {
    setBusy(true);
    try {
      const result = await api.deleteCfp(cfp.cfpId, confirmed);
      if (result.ok) {
        setConfirm(undefined);
        onDeleted();
      } else if (result.kind === 'confirm_required') {
        setConfirm({ message: result.message, warnings: result.warnings });
      } else {
        setConfirm(undefined);
        fail(result);
      }
    } finally {
      setBusy(false);
    }
  };

  const name = <span className="visually-hidden"> {cfp.title}</span>;

  return (
    <>
      {cfp.status === 'open' ? (
        <button type="button" disabled={busy} onClick={() => void setStatus('closed')}>
          Close{name}
        </button>
      ) : (
        <button type="button" disabled={busy} onClick={() => void setStatus('open')}>
          {cfp.status === 'closed' ? 'Reopen' : 'Open'}
          {name}
        </button>
      )}
      <button type="button" disabled={busy} onClick={() => void duplicate()}>
        Duplicate{name}
      </button>
      <button type="button" className="danger" disabled={busy} onClick={() => void remove(false)}>
        Delete{name}
      </button>
      {confirm && (
        <ConfirmDialog
          title={`Delete "${cfp.title}"?`}
          message={confirm.message || 'This CFP has submissions. Deleting it removes them too.'}
          details={confirm.warnings}
          confirmLabel="Delete CFP" danger
          busy={busy}
          onConfirm={() => void remove(true)}
          onCancel={() => setConfirm(undefined)}
        />
      )}
    </>
  );
};

export default CfpActions;
