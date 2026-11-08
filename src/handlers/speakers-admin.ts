// Admin speaker endpoints (admin-only, backed by SpeakerAdminTable):
//   GET  /admin/speakers             - directory with search and filters (Req 4.1-4.3)
//   POST /admin/speakers             - create a profile on behalf of someone (Req 3.7)
//   GET  /admin/speakers/{id}        - full detail incl. marker, notes, history (Req 4.4)
//   PUT  /admin/speakers/{id}        - edit any profile (Req 3.8)
//   POST /admin/speakers/{id}/link   - link a profile to an existing account (Req 3.7)
//   POST /admin/speakers/{id}/headshot-url - presigned headshot upload for any profile (Req 3.8)
//   PUT /admin/speakers/{id}/marker  - set/unset marker with optional note (Req 5.1-5.3)
//   PUT /admin/speakers/{id}/notes   - set private admin notes (Req 5.2)
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { AdminGetUserCommand } from '@aws-sdk/client-cognito-identity-provider';
import { requireAdmin } from '../shared/auth';
import { cognitoClient } from '../shared/aws-clients';
import { config } from '../shared/config';
import { randomUUID } from 'crypto';
import {
  Route,
  Conflict,
  NotFound,
  ValidationError,
  created,
  dispatch,
  ok,
  parseJsonBody,
} from '../shared/http';
import { createHeadshotUpload, deleteHeadshot, getHeadshotUrl, headshotKeyPrefix } from '../shared/headshots';
import type { Booking, Speaker, SpeakerAdmin } from '../shared/models';
import { bookingsRepo, speakerAdminRepo, speakersRepo, submissionsRepo } from '../shared/repos';
import { Body, parseProfileFields, str } from '../shared/speaker-input';
import { FieldErrors, validateHeadshot } from '../shared/validation';

type Ctx = APIGatewayProxyEvent;

const MARKER_FILTERS = ['have_back', 'not_again', 'none'];

/** Case-insensitive free-text match over the searchable profile fields. */
function matchesText(s: Speaker, q: string): boolean {
  const hay = [s.name, s.bio, s.location, ...(s.topics ?? []), ...(s.pastTalks ?? []).map((t) => t.title)]
    .join('\n')
    .toLowerCase();
  return hay.includes(q);
}

/** Bookings history; an unavailable bookings repo yields an empty list. */
async function bookingsFor(speakerId: string): Promise<Booking[]> {
  if (typeof bookingsRepo?.listBySpeaker !== 'function') return [];
  return (await bookingsRepo.listBySpeaker(speakerId)) ?? [];
}

async function withHeadshotUrl(s: Speaker) {
  return { ...s, headshotUrl: s.headshotKey ? await getHeadshotUrl(s.headshotKey) : undefined };
}

const dropUndefined = <T extends object>(o: T): T => JSON.parse(JSON.stringify(o)) as T;

export const MARKER_NOTE_MAX = 1000;
export const ADMIN_NOTES_MAX = 5000;
const MARKER_VALUES = ['have_back', 'not_again', 'unset'] as const;

async function requireSpeakerExists(id: string): Promise<Speaker> {
  const speaker = await speakersRepo.get(id);
  if (!speaker) throw new NotFound('Speaker not found');
  return speaker;
}

const poolId = (): string => process.env.USER_POOL_ID || config.cognito.userPoolId;

interface Account {
  /** Cognito `sub`; this is what speaker profiles store as userId. */
  userId: string;
  email?: string;
}

/**
 * Looks an account up in Cognito by email or user id (the pool signs in with email, so
 * both work as the Username). Undefined when no such account exists.
 */
async function findAccount(identifier: string): Promise<Account | undefined> {
  try {
    const res = await cognitoClient.send(new AdminGetUserCommand({ UserPoolId: poolId(), Username: identifier }));
    const attr = (name: string) => res.UserAttributes?.find((a) => a.Name === name)?.Value;
    return { userId: attr('sub') ?? res.Username ?? identifier, email: attr('email') };
  } catch (err) {
    if ((err as { name?: string })?.name === 'UserNotFoundException') return undefined;
    throw err;
  }
}

/** Best effort: an email for display. A Cognito hiccup must not break the speaker page. */
async function linkedEmailFor(userId: string | undefined): Promise<string | undefined> {
  if (!userId) return undefined;
  try {
    return (await findAccount(userId))?.email;
  } catch (e) {
    console.error('Could not look up linked account', e);
    return undefined;
  }
}

const routes: Route<Ctx>[] = [
  {
    method: 'GET',
    path: '/admin/speakers',
    handler: async (event) => {
      requireAdmin(event);
      const qs = event.queryStringParameters ?? {};
      const q = str(qs.q).toLowerCase();
      const topic = str(qs.topic).toLowerCase();
      const location = str(qs.location).toLowerCase();
      const marker = str(qs.marker);
      if (marker && !MARKER_FILTERS.includes(marker)) {
        throw new ValidationError({ marker: 'Marker filter must be one of have_back, not_again, none' });
      }

      const [speakers, admins] = await Promise.all([speakersRepo.listAll(), speakerAdminRepo.listAll()]);
      const adminById = new Map<string, SpeakerAdmin>(admins.map((a) => [a.speakerId, a]));

      const items = speakers
        .filter((s) => !q || matchesText(s, q))
        .filter((s) => !topic || (s.topics ?? []).some((t) => t.toLowerCase() === topic))
        .filter((s) => !location || (s.location ?? '').toLowerCase().includes(location))
        .filter((s) => {
          const m = adminById.get(s.speakerId)?.marker;
          return !marker || (marker === 'none' ? !m : m === marker);
        })
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((s) => {
          const a = adminById.get(s.speakerId);
          return {
            speakerId: s.speakerId,
            userId: s.userId,
            name: s.name,
            location: s.location,
            topics: s.topics,
            linked: !!s.userId,
            marker: a?.marker,
            markerNote: a?.markerNote,
          };
        });
      return ok({ items, count: items.length });
    },
  },
  {
    method: 'POST',
    path: '/admin/speakers',
    handler: async (event) => {
      const auth = requireAdmin(event);
      const body = parseJsonBody<Body>(event.body, event.isBase64Encoded);
      const errors: FieldErrors = {};
      const fields = parseProfileFields(body, errors);
      if (Object.keys(errors).length) throw new ValidationError(errors);
      // No userId: the profile is unlinked until an admin links it to an account.
      const saved = await speakersRepo.create(
        { speakerId: randomUUID(), ...dropUndefined(fields) },
        auth.userId,
      );
      return created(await withHeadshotUrl(saved));
    },
  },
  {
    method: 'GET',
    path: '/admin/speakers/{id}',
    handler: async (event, params) => {
      requireAdmin(event);
      const speaker = await speakersRepo.get(params.id);
      if (!speaker) throw new NotFound('Speaker not found');
      const [admin, submissions, bookings, linkedEmail] = await Promise.all([
        speakerAdminRepo.get(params.id),
        submissionsRepo.listBySpeaker(params.id),
        bookingsFor(params.id),
        linkedEmailFor(speaker.userId),
      ]);
      return ok({
        speaker: await withHeadshotUrl(speaker),
        admin: admin ?? null,
        submissions: submissions ?? [],
        bookings,
        linkedEmail: linkedEmail ?? null,
      });
    },
  },
  {
    method: 'PUT',
    path: '/admin/speakers/{id}',
    handler: async (event, params) => {
      const auth = requireAdmin(event);
      const body = parseJsonBody<Body>(event.body, event.isBase64Encoded);
      const errors: FieldErrors = {};
      const fields = parseProfileFields(body, errors);
      if (Object.keys(errors).length) throw new ValidationError(errors);
      const existing = await requireSpeakerExists(params.id);
      // userId is not editable here (link has its own route). headshotKey is only
      // touched when present in the body: a key under this speaker's prefix sets it,
      // null or '' clears it.
      let headshotKey = existing.headshotKey;
      if (body.headshotKey !== undefined) {
        const k = body.headshotKey;
        if (k === null || k === '') headshotKey = undefined;
        else if (typeof k === 'string' && k.startsWith(headshotKeyPrefix(params.id))) headshotKey = k;
        else throw new ValidationError({ headshotKey: 'Invalid headshot key' });
      }
      const patch = body.headshotKey === undefined ? fields : { ...fields, headshotKey };
      const expected = typeof body.updatedAt === 'string' ? body.updatedAt : undefined;
      const saved = await speakersRepo.update(params.id, patch, auth.userId, expected);
      if (existing.headshotKey && existing.headshotKey !== headshotKey) {
        // Best effort: an orphaned object is harmless, a failed save is not.
        await deleteHeadshot(existing.headshotKey).catch((e) =>
          console.error('Failed to delete old headshot', e),
        );
      }
      return ok(await withHeadshotUrl(saved));
    },
  },
  {
    method: 'POST',
    path: '/admin/speakers/{id}/link',
    handler: async (event, params) => {
      const auth = requireAdmin(event);
      // Admins link by the person's email; a raw user id is still accepted.
      const body = parseJsonBody<{ email?: unknown; userId?: unknown }>(event.body, event.isBase64Encoded);
      const identifier = str(body.email) || str(body.userId);
      if (!identifier) throw new ValidationError({ email: 'Enter the email address of the account to link' });
      const speaker = await speakersRepo.get(params.id);
      if (!speaker) throw new NotFound('Speaker not found');
      // Never trust the client: the account must exist in Cognito, and its real id is what we store.
      const account = await findAccount(identifier);
      if (!account) throw new ValidationError({ email: 'No account found with that email address' });
      const userId = account.userId;
      if (speaker.userId === userId) return ok(await withHeadshotUrl(speaker)); // idempotent
      if (speaker.userId) throw new Conflict('Speaker is already linked to an account');
      const existing = await speakersRepo.getByUserId(userId);
      if (existing && existing.speakerId !== params.id) {
        throw new Conflict('That account already has a speaker profile');
      }
      const saved = await speakersRepo.update(params.id, { userId }, auth.userId);
      return ok(await withHeadshotUrl(saved));
    },
  },
  {
    method: 'POST',
    path: '/admin/speakers/{id}/headshot-url',
    handler: async (event, params) => {
      requireAdmin(event);
      const body = parseJsonBody<Body>(event.body, event.isBase64Encoded);
      const errors = validateHeadshot(body.contentType, body.size);
      if (Object.keys(errors).length) throw new ValidationError(errors);
      await requireSpeakerExists(params.id);
      const upload = await createHeadshotUpload(params.id, String(body.contentType).toLowerCase().trim());
      return ok(upload);
    },
  },
  {
    method: 'PUT',
    path: '/admin/speakers/{id}/marker',
    handler: async (event, params) => {
      const auth = requireAdmin(event);
      const body = parseJsonBody<{ marker?: unknown; markerNote?: unknown }>(event.body, event.isBase64Encoded);
      const errors: Record<string, string> = {};
      if (typeof body.marker !== 'string' || !(MARKER_VALUES as readonly string[]).includes(body.marker)) {
        errors.marker = 'Marker must be one of have_back, not_again, unset';
      }
      let note: string | undefined;
      if (body.markerNote !== undefined && body.markerNote !== null) {
        if (typeof body.markerNote !== 'string') errors.markerNote = 'Marker note must be text';
        else if (body.markerNote.length > MARKER_NOTE_MAX) {
          errors.markerNote = `Marker note must be at most ${MARKER_NOTE_MAX} characters`;
        } else note = body.markerNote.trim() || undefined;
      }
      if (Object.keys(errors).length) throw new ValidationError(errors);

      await requireSpeakerExists(params.id);
      const now = new Date().toISOString();
      const audit = { markerChangedBy: auth.userId, markerChangedAt: now };
      // Marker, note and audit fields go out in a single write.
      const saved =
        body.marker === 'unset'
          ? await speakerAdminRepo.upsert(params.id, audit, auth.userId, ['marker', 'markerNote'])
          : await speakerAdminRepo.upsert(
              params.id,
              { ...audit, marker: body.marker as 'have_back' | 'not_again', markerNote: note },
              auth.userId,
              note === undefined ? ['markerNote'] : [],
            );
      return ok(saved);
    },
  },
  {
    method: 'PUT',
    path: '/admin/speakers/{id}/notes',
    handler: async (event, params) => {
      const auth = requireAdmin(event);
      const body = parseJsonBody<{ adminNotes?: unknown }>(event.body, event.isBase64Encoded);
      if (typeof body.adminNotes !== 'string') {
        throw new ValidationError({ adminNotes: 'Admin notes must be text' });
      }
      if (body.adminNotes.length > ADMIN_NOTES_MAX) {
        throw new ValidationError({ adminNotes: `Admin notes must be at most ${ADMIN_NOTES_MAX} characters` });
      }
      await requireSpeakerExists(params.id);
      const notes = body.adminNotes.trim();
      const saved = notes
        ? await speakerAdminRepo.upsert(params.id, { adminNotes: notes }, auth.userId)
        : await speakerAdminRepo.upsert(params.id, {}, auth.userId, ['adminNotes']);
      return ok(saved);
    },
  },
];

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> =>
  dispatch(routes, event.httpMethod, event.path, event);
