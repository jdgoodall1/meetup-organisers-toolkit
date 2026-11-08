import React, { useState } from 'react';
import type { ApiResult, EventInput, EventItem, EventStatus } from '../../services/apiTypes';
import { EVENT_STATUSES, isoToLocalInputs, localInputsToIso } from '../../utils/eventDates';


interface EventFormProps {
  /** Present when editing. */
  event?: EventItem;
  /** Performs the create/update call; the form shows any field errors it returns. */
  onSubmit: (input: EventInput) => Promise<ApiResult<EventItem>>;
  onSaved: (event: EventItem) => void;
  onCancel?: () => void;
}

type Errors = Record<string, string>;

const EventForm: React.FC<EventFormProps> = ({ event, onSubmit, onSaved, onCancel }) => {
  const start = isoToLocalInputs(event?.startDateTime);
  const end = isoToLocalInputs(event?.endDateTime);

  const [title, setTitle] = useState(event?.title ?? '');
  const [date, setDate] = useState(start.date);
  const [startTime, setStartTime] = useState(start.time);
  const [endTime, setEndTime] = useState(end.time);
  const [location, setLocation] = useState(event?.location ?? '');
  const [isOnline, setIsOnline] = useState(event?.isOnline ?? false);
  const [format, setFormat] = useState(event?.format ?? '');
  const [description, setDescription] = useState(event?.description ?? '');
  const [status, setStatus] = useState<EventStatus>(event?.status ?? 'draft');
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string>();
  const [saving, setSaving] = useState(false);

  const validate = (): { errors: Errors; input?: EventInput } => {
    const found: Errors = {};
    if (!title.trim()) found.title = 'Title is required';
    if (!date) found.startDateTime = 'Date is required';
    const startIso = date ? localInputsToIso(date, startTime) : undefined;
    if (date && !startIso) found.startDateTime = 'Enter a valid date and start time';
    // A blank end time means the event ends when it starts.
    const endIso = date ? localInputsToIso(date, endTime || startTime) : undefined;
    if (startIso && endIso && Date.parse(endIso) < Date.parse(startIso)) {
      found.endDateTime = 'End time must not be before start time';
    }
    if (Object.keys(found).length || !startIso || !endIso) return { errors: found };
    return {
      errors: found,
      input: {
        title: title.trim(),
        startDateTime: startIso,
        endDateTime: endIso,
        location: location.trim(),
        isOnline,
        format: format.trim(),
        description: description.trim(),
        status,
      },
    };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(undefined);
    const { errors: found, input } = validate();
    setErrors(found);
    if (!input) return;

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

  const field = (name: string) => ({
    'aria-invalid': errors[name] ? true : undefined,
    'aria-describedby': errors[name] ? `${name}-error` : undefined,
  });
  const errorFor = (name: string) =>
    errors[name] ? (
      <span id={`${name}-error`} className="field-error" role="alert">
        {errors[name]}
      </span>
    ) : null;

  // Server errors may name fields the form has no input for; surface them too.
  const knownFields = ['title', 'startDateTime', 'endDateTime', 'location', 'isOnline', 'format', 'description', 'status'];
  const otherErrors = Object.entries(errors).filter(([k]) => !knownFields.includes(k));

  return (
    <form onSubmit={(e) => void handleSubmit(e)} noValidate aria-label={event ? 'Edit event' : 'New event'}>
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
        <label htmlFor="event-title">Title (required)</label>
        <input id="event-title" value={title} onChange={(e) => setTitle(e.target.value)} {...field('title')} />
        {errorFor('title')}
      </div>

      <div>
        <label htmlFor="event-date">Date (required)</label>
        <input id="event-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} {...field('startDateTime')} />
        {errorFor('startDateTime')}
      </div>

      <div>
        <label htmlFor="event-start">Start time</label>
        <input id="event-start" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
      </div>

      <div>
        <label htmlFor="event-end">End time</label>
        <input id="event-end" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} {...field('endDateTime')} />
        {errorFor('endDateTime')}
      </div>

      <div>
        <label htmlFor="event-location">Venue or online location</label>
        <input id="event-location" value={location} onChange={(e) => setLocation(e.target.value)} {...field('location')} />
        {errorFor('location')}
      </div>

      <div>
        <input id="event-online" type="checkbox" checked={isOnline} onChange={(e) => setIsOnline(e.target.checked)} />
        <label htmlFor="event-online">Online event</label>
      </div>

      <div>
        <label htmlFor="event-format">Format</label>
        <input id="event-format" value={format} onChange={(e) => setFormat(e.target.value)} {...field('format')} />
        {errorFor('format')}
      </div>

      <div>
        <label htmlFor="event-status">Status</label>
        <select id="event-status" value={status} onChange={(e) => setStatus(e.target.value as EventStatus)} {...field('status')}>
          {EVENT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        {errorFor('status')}
      </div>

      <div>
        <label htmlFor="event-description">Description</label>
        <textarea
          id="event-description"
          rows={4}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          {...field('description')}
        />
        {errorFor('description')}
      </div>

      <button type="submit" disabled={saving}>
        {saving ? 'Saving…' : event ? 'Save changes' : 'Create event'}
      </button>
      {onCancel && (
        <button type="button" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
      )}
    </form>
  );
};

export default EventForm;
