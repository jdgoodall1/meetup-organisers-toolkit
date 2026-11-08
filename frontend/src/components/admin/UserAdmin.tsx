import React, { useCallback, useEffect, useState } from 'react';
import api from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import ConfirmDialog from '../common/ConfirmDialog';
import type { AdminUser } from '../../services/apiTypes';

const isAdminUser = (u: AdminUser) => u.groups.includes('admin');

/** Admin user management: list, invite an admin, promote and demote (Req 1.4, 1.5). */
const UserAdmin: React.FC = () => {
  const { user: me } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string>();

  const [email, setEmail] = useState('');
  const [inviting, setInviting] = useState(false);
  const [emailError, setEmailError] = useState<string>();
  const [formError, setFormError] = useState<string>();
  const [notice, setNotice] = useState<string>();

  const [actionError, setActionError] = useState<string>();
  const [busyId, setBusyId] = useState<string>();
  const [demoting, setDemoting] = useState<AdminUser>();

  const load = useCallback(async () => {
    const result = await api.listUsers();
    if (result.ok) {
      setUsers(result.data);
      setLoadError(undefined);
    } else {
      setLoadError(result.kind === 'error' ? result.error.message : result.message);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const isSelf = (u: AdminUser) =>
    !!me &&
    (u.userId === me.userId || (!!me.email && u.email.toLowerCase() === me.email.toLowerCase()));

  const onInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailError(undefined);
    setFormError(undefined);
    setNotice(undefined);
    setInviting(true);
    try {
      const result = await api.inviteAdmin(email.trim());
      if (result.ok) {
        setNotice(`Invitation sent to ${result.data.email}. They join as an admin.`);
        setEmail('');
        await load();
      } else if (result.kind === 'error') {
        if (result.error.fields?.email) setEmailError(result.error.fields.email);
        else setFormError(result.error.message);
      } else {
        setFormError(result.message);
      }
    } finally {
      setInviting(false);
    }
  };

  const change = async (target: AdminUser, action: 'promote' | 'demote') => {
    setActionError(undefined);
    setNotice(undefined);
    setBusyId(target.userId);
    try {
      const result =
        action === 'promote' ? await api.promoteUser(target.userId) : await api.demoteUser(target.userId);
      if (result.ok) {
        setNotice(
          `${target.email} is now ${action === 'promote' ? 'an admin' : 'a speaker'}. ` +
            'The change takes effect after they sign in again.',
        );
        await load();
      } else {
        setActionError(
          result.kind === 'error'
            ? (result.error.fields?.userId ?? result.error.message)
            : result.message,
        );
      }
    } finally {
      setBusyId(undefined);
      setDemoting(undefined);
    }
  };

  return (
    <section>
      <h1>Users</h1>
      <p>Role changes take effect after the affected user signs in again or refreshes their session.</p>

      <form aria-label="Invite an admin" onSubmit={(e) => void onInvite(e)} noValidate>
        <h2>Invite an admin</h2>
        <label htmlFor="invite-email">Email</label>
        <input
          id="invite-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={emailError ? true : undefined}
          aria-describedby={emailError ? 'invite-email-error' : undefined}
        />
        {emailError && (
          <p id="invite-email-error" role="alert">
            {emailError}
          </p>
        )}
        {formError && <p role="alert">{formError}</p>}
        <button type="submit" disabled={inviting}>
          {inviting ? 'Inviting…' : 'Send invite'}
        </button>
      </form>

      {notice && <p role="status">{notice}</p>}
      {actionError && <p role="alert">{actionError}</p>}
      {loadError && <p role="alert">{loadError}</p>}
      {loading && <p role="status">Loading users…</p>}

      {!loading &&
        !loadError &&
        (users.length === 0 ? (
          <p>No users found.</p>
        ) : (
          <table aria-label="Users">
            <thead>
              <tr>
                <th scope="col">Email</th>
                <th scope="col">Role</th>
                <th scope="col">Status</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const admin = isAdminUser(u);
                const self = isSelf(u);
                const busy = busyId === u.userId;
                return (
                  <tr key={u.userId}>
                    <th scope="row">
                      {u.email}
                      {self && ' (you)'}
                    </th>
                    <td>
                      <span className={`badge ${admin ? 'badge-admin' : 'badge-speaker'}`}>
                        {admin ? 'Admin' : 'Speaker'}
                      </span>
                    </td>
                    <td>{u.status ?? ''}</td>
                    <td>
                      {admin ? (
                        <>
                          <button
                            type="button"
                            disabled={self || busy}
                            aria-describedby={self ? `self-note-${u.userId}` : undefined}
                            onClick={() => setDemoting(u)}
                          >
                            Demote<span className="visually-hidden"> {u.email}</span>
                          </button>
                          {self && (
                            <span id={`self-note-${u.userId}`}> You cannot demote yourself.</span>
                          )}
                        </>
                      ) : (
                        <button type="button" disabled={busy} onClick={() => void change(u, 'promote')}>
                          Promote<span className="visually-hidden"> {u.email}</span>
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ))}

      {demoting && (
        <ConfirmDialog
          title={`Demote ${demoting.email}?`}
          message="They will lose admin access the next time they sign in."
          confirmLabel="Demote" danger
          busy={busyId === demoting.userId}
          onConfirm={() => void change(demoting, 'demote')}
          onCancel={() => setDemoting(undefined)}
        />
      )}
    </section>
  );
};

export default UserAdmin;
