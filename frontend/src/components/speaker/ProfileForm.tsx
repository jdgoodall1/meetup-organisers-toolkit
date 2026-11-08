import React, { useCallback, useEffect, useRef, useState } from 'react';
import api from '../../services/api';
import { HEADSHOT_CONTENT_TYPES, checkHeadshotFile } from './headshotRules';
import type { ApiResult, PastTalk, Speaker, SpeakerProfileInput } from '../../services/apiTypes';

type Errors = Record<string, string>;

const splitList = (value: string, separator: RegExp): string[] =>
  value
    .split(separator)
    .map((s) => s.trim())
    .filter(Boolean);

const failureMessage = (r: Exclude<ApiResult<unknown>, { ok: true }>): string =>
  r.kind === 'error' ? r.error.message : r.message;

/** Speaker self-service profile (requirements 3.1, 3.2, 3.4, 3.5). */
const ProfileForm: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string>();
  const [profile, setProfile] = useState<Speaker>();

  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [location, setLocation] = useState('');
  const [topics, setTopics] = useState('');
  const [links, setLinks] = useState('');
  const [pastTalks, setPastTalks] = useState<PastTalk[]>([]);
  // undefined = unchanged, null = cleared, string = newly uploaded key
  const [headshotKey, setHeadshotKey] = useState<string | null | undefined>(undefined);
  const [headshotPreview, setHeadshotPreview] = useState<string>();

  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [uploadStatus, setUploadStatus] = useState('');
  const [uploadError, setUploadError] = useState<string>();
  const [uploading, setUploading] = useState(false);
  const errorSummaryRef = useRef<HTMLDivElement>(null);

  const applyProfile = useCallback((p: Speaker) => {
    setProfile(p);
    setName(p.name);
    setBio(p.bio);
    setLocation(p.location);
    setTopics(p.topics.join(', '));
    setLinks(p.links.join('\n'));
    setPastTalks(p.pastTalks);
    setHeadshotKey(undefined);
    setHeadshotPreview(p.headshotUrl);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const r = await api.getMyProfile();
      if (cancelled) return;
      if (r.ok) {
        // The API returns { exists: false, ... } when no profile has been created.
        if (!('exists' in r.data && r.data.exists === false)) applyProfile(r.data as Speaker);
      } else if (!(r.kind === 'error' && r.status === 404)) {
        setLoadError(failureMessage(r));
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [applyProfile]);

  const updateTalk = (index: number, patch: Partial<PastTalk>) =>
    setPastTalks((talks) => talks.map((t, i) => (i === index ? { ...t, ...patch } : t)));

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const file = input.files?.[0];
    if (!file) return;
    setUploadError(undefined);
    setUploadStatus('');
    const problem = checkHeadshotFile(file);
    if (problem) {
      setUploadError(problem);
      input.value = '';
      return;
    }

    setUploading(true);
    setUploadStatus('Uploading headshot…');
    try {
      const req = await api.requestHeadshotUpload({ contentType: file.type, size: file.size });
      if (!req.ok) {
        setUploadError(
          req.kind === 'error' ? (req.error.fields && Object.values(req.error.fields)[0]) || req.error.message : req.message,
        );
        setUploadStatus('');
        return;
      }
      const form = new FormData();
      Object.entries(req.data.fields).forEach(([k, v]) => form.append(k, v));
      form.append('file', file); // S3 requires the file to be the last field
      let response: Response;
      try {
        response = await fetch(req.data.url, { method: 'POST', body: form });
      } catch {
        setUploadError('Headshot upload failed. Check your connection and try again.');
        setUploadStatus('');
        return;
      }
      if (!response.ok) {
        setUploadError('Headshot upload failed. Please try again.');
        setUploadStatus('');
        return;
      }
      setHeadshotKey(req.data.key);
      if (typeof URL.createObjectURL === 'function') setHeadshotPreview(URL.createObjectURL(file));
      setUploadStatus('Headshot uploaded. Save your profile to apply it.');
    } finally {
      setUploading(false);
      input.value = '';
    }
  };

  const removeHeadshot = () => {
    setHeadshotKey(null);
    setHeadshotPreview(undefined);
    setUploadError(undefined);
    setUploadStatus('Headshot removed. Save your profile to apply this.');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(undefined);
    setSaved(false);
    const found: Errors = {};
    if (!name.trim()) found.name = 'Name is required';
    if (!bio.trim()) found.bio = 'Bio is required';
    setErrors(found);
    if (Object.keys(found).length) {
      setFormError('Please fix the highlighted fields.');
      queueMicrotask(() => errorSummaryRef.current?.focus());
      return;
    }

    const talks = pastTalks
      .filter((t) => t.title.trim())
      .map((t) => ({
        title: t.title.trim(),
        ...(t.event?.trim() ? { event: t.event.trim() } : {}),
        ...(t.date?.trim() ? { date: t.date.trim() } : {}),
        ...(t.url?.trim() ? { url: t.url.trim() } : {}),
      }));

    const input: SpeakerProfileInput = {
      name: name.trim(),
      bio: bio.trim(),
      location: location.trim(),
      topics: splitList(topics, /,/),
      links: splitList(links, /\r?\n/),
      pastTalks: talks,
      ...(headshotKey !== undefined ? { headshotKey } : {}),
      ...(profile ? { updatedAt: profile.updatedAt } : {}),
    };

    setSaving(true);
    try {
      const r = await api.saveMyProfile(input);
      if (r.ok) {
        applyProfile(r.data);
        setErrors({});
        setSaved(true);
      } else if (r.kind === 'error') {
        const fields = r.error.fields;
        if (fields && Object.keys(fields).length) {
          setErrors(fields);
          setFormError('Please fix the highlighted fields.');
        } else {
          setFormError(r.error.message);
        }
        queueMicrotask(() => errorSummaryRef.current?.focus());
      } else {
        setFormError(r.message);
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p role="status">Loading your profile…</p>;
  if (loadError) return <p role="alert">{loadError}</p>;

  const field = (key: string) => ({
    'aria-invalid': errors[key] ? true : undefined,
    'aria-describedby': errors[key] ? `profile-${key}-error` : undefined,
  });
  const errorFor = (key: string) =>
    errors[key] ? (
      <span id={`profile-${key}-error`} className="field-error" role="alert">
        {errors[key]}
      </span>
    ) : null;
  const knownFields = ['name', 'bio', 'location', 'topics', 'links', 'pastTalks'];
  const otherErrors = Object.entries(errors).filter(([k]) => !knownFields.includes(k));

  return (
    <section aria-labelledby="profile-heading">
      <h1 id="profile-heading">My profile</h1>

      {!profile && (
        <div role="region" aria-label="Welcome" className="welcome-prompt">
          <h2>Welcome! Let&apos;s set up your speaker profile</h2>
          <p>
            You need a profile with your name and bio before you can submit to any call for papers.
            Fill in the form below and save it to get started.
          </p>
        </div>
      )}

      <form onSubmit={(e) => void handleSubmit(e)} noValidate aria-label="Speaker profile">
        <div ref={errorSummaryRef} tabIndex={-1}>
          {formError && (
            <p role="alert" className="form-error">
              {formError}
            </p>
          )}
          {otherErrors.map(([k, msg]) => (
            <p key={k} role="alert" className="form-error">
              {k}: {msg}
            </p>
          ))}
        </div>
        {saved && <p role="status">Profile saved.</p>}

        <div>
          <label htmlFor="profile-name">Name (required)</label>
          <input id="profile-name" value={name} onChange={(e) => setName(e.target.value)} required aria-required="true" {...field('name')} />
          {errorFor('name')}
        </div>

        <div>
          <label htmlFor="profile-bio">Bio (required)</label>
          <textarea id="profile-bio" rows={5} value={bio} onChange={(e) => setBio(e.target.value)} required aria-required="true" {...field('bio')} />
          {errorFor('bio')}
        </div>

        <div>
          <label htmlFor="profile-location">Location</label>
          <input id="profile-location" value={location} onChange={(e) => setLocation(e.target.value)} {...field('location')} />
          {errorFor('location')}
        </div>

        <div>
          <label htmlFor="profile-topics">Topics (comma separated)</label>
          <input id="profile-topics" value={topics} onChange={(e) => setTopics(e.target.value)} {...field('topics')} />
          {errorFor('topics')}
        </div>

        <div>
          <label htmlFor="profile-links">Social and website links (one per line)</label>
          <textarea id="profile-links" rows={3} value={links} onChange={(e) => setLinks(e.target.value)} {...field('links')} />
          {errorFor('links')}
        </div>

        <fieldset>
          <legend>Past talks</legend>
          {errorFor('pastTalks')}
          {pastTalks.map((talk, i) => (
            <div key={i} role="group" aria-label={`Past talk ${i + 1}`}>
              <label htmlFor={`talk-title-${i}`}>Talk {i + 1} title</label>
              <input id={`talk-title-${i}`} value={talk.title} onChange={(e) => updateTalk(i, { title: e.target.value })} />
              <label htmlFor={`talk-event-${i}`}>Talk {i + 1} event</label>
              <input id={`talk-event-${i}`} value={talk.event ?? ''} onChange={(e) => updateTalk(i, { event: e.target.value })} />
              <label htmlFor={`talk-date-${i}`}>Talk {i + 1} date</label>
              <input id={`talk-date-${i}`} value={talk.date ?? ''} onChange={(e) => updateTalk(i, { date: e.target.value })} />
              <label htmlFor={`talk-url-${i}`}>Talk {i + 1} URL</label>
              <input id={`talk-url-${i}`} value={talk.url ?? ''} onChange={(e) => updateTalk(i, { url: e.target.value })} />
              <button type="button" className="danger" onClick={() => setPastTalks((talks) => talks.filter((_, j) => j !== i))}>
                Remove talk {i + 1}
              </button>
            </div>
          ))}
          <button type="button" onClick={() => setPastTalks((talks) => [...talks, { title: '' }])}>
            Add past talk
          </button>
        </fieldset>

        <fieldset>
          <legend>Headshot</legend>
          {headshotPreview ? (
            <img src={headshotPreview} alt="Your current headshot" width={120} height={120} />
          ) : (
            <p>No headshot uploaded.</p>
          )}
          {profile ? (
            <div>
              <label htmlFor="profile-headshot">Upload headshot (JPEG, PNG or WebP, up to 5 MB)</label>
              <input
                id="profile-headshot"
                type="file"
                accept={HEADSHOT_CONTENT_TYPES.join(',')}
                onChange={(e) => void handleFile(e)}
                disabled={uploading}
                aria-describedby="profile-headshot-status"
              />
              {headshotPreview && (
                <button type="button" className="danger" onClick={removeHeadshot} disabled={uploading}>
                  Remove headshot
                </button>
              )}
            </div>
          ) : (
            <p>Save your profile first, then you can upload a headshot.</p>
          )}
          <div id="profile-headshot-status" role="status" aria-live="polite">
            {uploadStatus}
          </div>
          {uploadError && (
            <p role="alert" className="field-error">
              {uploadError}
            </p>
          )}
        </fieldset>

        <button type="submit" disabled={saving || uploading}>
          {saving ? 'Saving…' : profile ? 'Save profile' : 'Create profile'}
        </button>
      </form>
    </section>
  );
};

export default ProfileForm;
