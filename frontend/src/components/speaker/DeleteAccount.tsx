import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { failureMessage } from '../../utils/apiMessages';
import ConfirmDialog from '../common/ConfirmDialog';

export const DELETE_PHRASE = 'DELETE';

/** Speaker-only account deletion (Req 11.5). Requires typing DELETE, then a confirm dialog. */
const DeleteAccount: React.FC = () => {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [typed, setTyped] = useState('');
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');

  const run = async () => {
    setBusy(true);
    setError('');
    try {
      const result = await api.deleteMyAccount();
      if (!result.ok) {
        setOpen(false);
        setError(failureMessage(result));
        return;
      }
      setStatus('Your account has been deleted. Signing you out…');
      setOpen(false);
      await logout();
      navigate('/login', { replace: true });
    } catch {
      setOpen(false);
      setError('Something went wrong deleting your account. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby="delete-account-heading">
      <h2 id="delete-account-heading">Delete my account</h2>
      <p>Deleting your account permanently removes:</p>
      <ul>
        <li>Your speaker profile</li>
        <li>Your submissions and their reviews</li>
        <li>Your headshot</li>
      </ul>
      <p>Bookings are kept for event history but anonymised, so they no longer identify you.</p>
      <p>This cannot be undone.</p>
      <label htmlFor="delete-account-confirm">
        Type {DELETE_PHRASE} to enable account deletion
      </label>
      <input
        id="delete-account-confirm"
        type="text"
        autoComplete="off"
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
      />
      <button type="button" className="danger" onClick={() => setOpen(true)} disabled={typed.trim() !== DELETE_PHRASE || busy}>
        Delete my account
      </button>
      <div role="status" aria-live="polite">
        {status}
      </div>
      {error && <p role="alert">{error}</p>}
      {open && (
        <ConfirmDialog
          title="Delete your account?"
          message="This permanently deletes your account and data. You will be signed out."
          details={['Profile, submissions and headshot are deleted', 'Bookings are anonymised']}
          confirmLabel="Yes, delete my account" danger
          busy={busy}
          onConfirm={() => void run()}
          onCancel={() => setOpen(false)}
        />
      )}
    </section>
  );
};

export default DeleteAccount;
