import React, { useState } from 'react';
import type {
  ApiResult,
  HeadshotUpload,
  HeadshotUploadRequest,
  PastTalk,
  Speaker,
  SpeakerProfileInput,
} from '../../services/apiTypes';
import { HEADSHOT_CONTENT_TYPES, checkHeadshotFile } from '../speaker/headshotRules';

interface SpeakerFormProps {
  /** Present when editing an existing profile. */
  speaker?: Speaker;
  /** Performs the create/update call; the form shows any field errors it returns. */
  onSubmit: (input: SpeakerProfileInput) => Promise<ApiResult<Speaker>>;
  onSaved: (speaker: Speaker) => void;
  onCancel?: () => void;
  /**
   * Requests a presigned upload for this speaker's headshot. Only meaningful when
   * editing (the profile must exist); without it the headshot section is hidden.
   */
  requestHeadshotUpload?: (input: HeadshotUploadRequest) => Promise<ApiResult<HeadshotUpload>>;
}

type Errors = Record<string, string>;

const splitList = (value: string, separator: RegExp): string[] =>
  value
    .split(separator)
    .map((s) => s.trim())
    .filter(Boolean);

/** Admin form for creating or editing any Speaker_Profile (requirements 3.7, 3.8). */
const SpeakerForm: React.FC<SpeakerFormProps> = ({
  speaker,
  onSubmit,
  onSaved,
  onCancel,
  requestHeadshotUpload,
}) => {
  const [name, setName] = useState(speaker?.name ?? '');
  const [bio, setBio] = useState(speaker?.bio ?? '');
  const [location, setLocation] = useState(speaker?.location ?? '');
  const [topics, setTopics] = useState((speaker?.topics ?? []).join(', '));
  const [links, setLinks] = useState((speaker?.links ?? []).join('\n'));
  const [pastTalks, setPastTalks] = useState<PastTalk[]>(speaker?.pastTalks ?? []);
  // undefined = unchanged, null = cleared, string = newly uploaded key
  const [headshotKey, setHeadshotKey] = useState<string | null | undefined>(undefined);
  const [headshotPreview, setHeadshotPreview] = useState<string | undefined>(speaker?.headshotUrl);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string>();
  const [uploadStatus, setUploadStatus] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string>();
  const [saving, setSaving] = useState(false);

  const updateTalk = (index: number, patch: Partial<PastTalk>) =>
    setPastTalks((talks) => talks.map((t, i) => (i === index ? { ...t, ...patch } : t)));

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const file = input.files?.[0];
    if (!file || !requestHeadshotUpload) return;
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
      const req = await requestHeadshotUpload({ contentType: file.type, size: file.size });
      if (!req.ok) {
        setUploadError(
          req.kind === 'error'
            ? (req.error.fields && Object.values(req.error.fields)[0]) || req.error.message
            : req.message,
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
      setUploadStatus('Headshot uploaded. Save the profile to apply it.');
    } finally {
      setUploading(false);
      input.value = '';
    }
  };

  const removeHeadshot = () => {
    setHeadshotKey(null);
    setHeadshotPreview(undefined);
    setUploadError(undefined);
    setUploadStatus('Headshot removed. Save the profile to apply this.');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(undefined);
    const found: Errors = {};
    if (!name.trim()) found.name = 'Name is required';
    setErrors(found);
    if (Object.keys(found).length) return;

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
      ...(speaker ? { updatedAt: speaker.updatedAt } : {}),
    };

    setSaving(true);
    try {
      const result = await onSubmit(input);
      if (result.ok) {
        onSaved(result.data);
      } else if (result.kind === 'error') {
        const fields = result.error.fields;
        if (fields && Object.keys(fields).length) {
          setErrors(fields);
          setFormError('Please fix the highlighted fields.');
        } else {
          setFormError(result.error.message);
        }
      } else {
        setFormError(result.message);
      }
    } finally {
      setSaving(false);
    }
  };

  const field = (key: string) => ({
    'aria-invalid': errors[key] ? true : undefined,
    'aria-describedby': errors[key] ? `speaker-${key}-error` : undefined,
  });
  const errorFor = (key: string) =>
    errors[key] ? (
      <span id={`speaker-${key}-error`} className="field-error" role="alert">
        {errors[key]}
      </span>
    ) : null;

  const knownFields = ['name', 'bio', 'location', 'topics', 'links', 'pastTalks'];
  const otherErrors = Object.entries(errors).filter(([k]) => !knownFields.includes(k));

  return (
    <form
      onSubmit={(e) => void handleSubmit(e)}
      noValidate
      aria-label={speaker ? 'Edit speaker profile' : 'New speaker profile'}
    >
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

      <div>
        <label htmlFor="speaker-name">Name (required)</label>
        <input id="speaker-name" value={name} onChange={(e) => setName(e.target.value)} {...field('name')} />
        {errorFor('name')}
      </div>

      <div>
        <label htmlFor="speaker-bio">Bio</label>
        <textarea id="speaker-bio" rows={5} value={bio} onChange={(e) => setBio(e.target.value)} {...field('bio')} />
        {errorFor('bio')}
      </div>

      <div>
        <label htmlFor="speaker-location">Location</label>
        <input id="speaker-location" value={location} onChange={(e) => setLocation(e.target.value)} {...field('location')} />
        {errorFor('location')}
      </div>

      <div>
        <label htmlFor="speaker-topics">Topics (comma separated)</label>
        <input id="speaker-topics" value={topics} onChange={(e) => setTopics(e.target.value)} {...field('topics')} />
        {errorFor('topics')}
      </div>

      <div>
        <label htmlFor="speaker-links">Social and website links (one per line)</label>
        <textarea id="speaker-links" rows={3} value={links} onChange={(e) => setLinks(e.target.value)} {...field('links')} />
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

      {requestHeadshotUpload && (
        <fieldset>
          <legend>Headshot</legend>
          {headshotPreview ? (
            <img src={headshotPreview} alt={`${name.trim() || 'Speaker'} headshot`} width={120} height={120} />
          ) : (
            <p>No headshot uploaded.</p>
          )}
          <label htmlFor="speaker-headshot">Upload headshot (JPEG, PNG or WebP, up to 5 MB)</label>
          <input
            id="speaker-headshot"
            type="file"
            accept={HEADSHOT_CONTENT_TYPES.join(',')}
            onChange={(e) => void handleFile(e)}
            disabled={uploading}
            aria-describedby="speaker-headshot-status"
          />
          {headshotPreview && (
            <button type="button" className="danger" onClick={removeHeadshot} disabled={uploading}>
              Remove headshot
            </button>
          )}
          {uploadError && (
            <p role="alert" className="field-error">
              {uploadError}
            </p>
          )}
          <div id="speaker-headshot-status" role="status" aria-live="polite">
            {uploadStatus}
          </div>
        </fieldset>
      )}

      <button type="submit" disabled={saving || uploading}>
        {saving ? 'Saving…' : speaker ? 'Save profile' : 'Create speaker'}
      </button>
      {onCancel && (
        <button type="button" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
      )}
    </form>
  );
};

export default SpeakerForm;
