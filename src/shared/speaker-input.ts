// Parsing of speaker profile input, shared by the speaker (`speakers-me`) and
// admin (`speakers-admin`) handlers so both enforce identical rules.
import type { PastTalk } from './models';
import { FieldErrors, validateSpeakerProfile } from './validation';

export type Body = Record<string, unknown>;

export const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

export function isHttpUrl(v: string): boolean {
  try {
    const u = new URL(v);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

export function parseStringList(v: unknown, field: string, errors: FieldErrors, urls = false): string[] {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) {
    errors[field] = `${field} must be a list`;
    return [];
  }
  const out: string[] = [];
  v.forEach((item, i) => {
    const s = str(item);
    if (!s) errors[`${field}[${i}]`] = 'Must not be blank';
    else if (urls && !isHttpUrl(s)) errors[`${field}[${i}]`] = 'Must be a valid http(s) URL';
    else out.push(s);
  });
  return out;
}

export function parsePastTalks(v: unknown, errors: FieldErrors): PastTalk[] {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) {
    errors.pastTalks = 'pastTalks must be a list';
    return [];
  }
  const out: PastTalk[] = [];
  v.forEach((item, i) => {
    const t = item && typeof item === 'object' ? (item as Body) : {};
    const title = str(t.title);
    if (!title) {
      errors[`pastTalks[${i}].title`] = 'Title is required';
      return;
    }
    const talk: PastTalk = { title };
    if (str(t.event)) talk.event = str(t.event);
    if (str(t.date)) talk.date = str(t.date);
    if (str(t.url)) {
      if (isHttpUrl(str(t.url))) talk.url = str(t.url);
      else errors[`pastTalks[${i}].url`] = 'Must be a valid http(s) URL';
    }
    out.push(talk);
  });
  return out;
}

export interface ParsedProfileFields {
  name: string;
  bio: string;
  location: string;
  topics: string[];
  links: string[];
  pastTalks: PastTalk[];
}

/** Validate and normalise the editable profile fields (headshot excluded). */
export function parseProfileFields(body: Body, errors: FieldErrors): ParsedProfileFields {
  Object.assign(errors, validateSpeakerProfile(body));
  return {
    name: str(body.name),
    bio: str(body.bio),
    location: str(body.location),
    topics: parseStringList(body.topics, 'topics', errors),
    links: parseStringList(body.links, 'links', errors, true),
    pastTalks: parsePastTalks(body.pastTalks, errors),
  };
}
