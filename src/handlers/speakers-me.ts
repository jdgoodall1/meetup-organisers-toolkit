// Speaker self-service profile: GET/PUT /me/profile and headshot upload URLs.
// Only the speaker-visible SpeakersTable is touched; admin-only data (marker,
// notes) is never read here.
import { randomUUID } from 'crypto';
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { requireSpeaker } from '../shared/auth';
import {
  Route,
  ValidationError,
  dispatch,
  ok,
  parseJsonBody,
} from '../shared/http';
import { createHeadshotUpload, deleteHeadshot, getHeadshotUrl, headshotKeyPrefix } from '../shared/headshots';
import type { PastTalk, Speaker } from '../shared/models';
import { Body, parseProfileFields } from '../shared/speaker-input';
import { speakersRepo } from '../shared/repos';
import { FieldErrors, validateHeadshot } from '../shared/validation';

type Ctx = APIGatewayProxyEvent;
/** Profile shape returned to the speaker, with a short-lived signed headshot URL. */
/** Admin-only attributes that must never reach a speaker (Req 5.4, 8.12). */
const ADMIN_ONLY_FIELDS = [
  'marker',
  'markerNote',
  'markerChangedBy',
  'markerChangedAt',
  'adminNotes',
  'rating',
  'notes',
  'reviews',
  'review',
  'reviewNotes',
];

async function toResponse(s: Speaker) {
  const { headshotKey, ...rest } = s;
  for (const f of ADMIN_ONLY_FIELDS) delete (rest as Record<string, unknown>)[f];
  return {
    ...rest,
    headshotKey,
    headshotUrl: headshotKey ? await getHeadshotUrl(headshotKey) : undefined,
  };
}

const emptyProfile = {
  name: '',
  bio: '',
  location: '',
  topics: [] as string[],
  links: [] as string[],
  pastTalks: [] as PastTalk[],
};

const routes: Route<Ctx>[] = [
  {
    method: 'GET',
    path: '/me/profile',
    handler: async (event) => {
      const auth = requireSpeaker(event);
      const profile = await speakersRepo.getByUserId(auth.userId);
      // No profile yet: return an empty template so the form can render.
      return ok(profile ? await toResponse(profile) : { exists: false, ...emptyProfile });
    },
  },
  {
    method: 'PUT',
    path: '/me/profile',
    handler: async (event) => {
      const auth = requireSpeaker(event);
      const body = parseJsonBody<Body>(event.body, event.isBase64Encoded);
      const errors: FieldErrors = {};
      const parsed = parseProfileFields(body, errors);

      const existing = await speakersRepo.getByUserId(auth.userId);
      const speakerId = existing?.speakerId ?? randomUUID();

      let headshotKey = existing?.headshotKey;
      if (body.headshotKey !== undefined) {
        const k = body.headshotKey;
        if (k === null || k === '') headshotKey = undefined;
        else if (typeof k === 'string' && k.startsWith(headshotKeyPrefix(speakerId))) headshotKey = k;
        else errors.headshotKey = 'Invalid headshot key';
      }
      if (Object.keys(errors).length) throw new ValidationError(errors);

      const fields = { ...parsed, headshotKey };

      let saved: Speaker;
      if (existing) {
        const expected = typeof body.updatedAt === 'string' ? body.updatedAt : undefined;
        saved = await speakersRepo.update(speakerId, fields, auth.userId, expected);
        if (existing.headshotKey && existing.headshotKey !== headshotKey) {
          // Best effort: an orphaned object is harmless, a failed save is not.
          await deleteHeadshot(existing.headshotKey).catch((e) =>
            console.error('Failed to delete old headshot', e),
          );
        }
      } else {
        // Omit undefined attributes: the document client rejects them on put.
        const item = JSON.parse(JSON.stringify(fields)) as typeof fields;
        saved = await speakersRepo.create({ speakerId, userId: auth.userId, ...item }, auth.userId);
      }
      return ok(await toResponse(saved));
    },
  },
  {
    method: 'POST',
    path: '/me/profile/headshot-url',
    handler: async (event) => {
      const auth = requireSpeaker(event);
      const body = parseJsonBody<Body>(event.body, event.isBase64Encoded);
      const errors = validateHeadshot(body.contentType, body.size);
      if (Object.keys(errors).length) throw new ValidationError(errors);
      const profile = await speakersRepo.getByUserId(auth.userId);
      if (!profile) {
        throw new ValidationError({ profile: 'Save your profile before uploading a headshot' });
      }
      const upload = await createHeadshotUpload(
        profile.speakerId,
        String(body.contentType).toLowerCase().trim(),
      );
      return ok(upload);
    },
  },
];

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> =>
  dispatch(routes, event.httpMethod, event.path, event);
