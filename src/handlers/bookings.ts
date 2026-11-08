// Bookings:
//   GET    /admin/bookings?eventId=|speakerId=  - list by event or by speaker history; no filter = all (Req 10.3, 10.7)
//   POST   /admin/bookings                      - create; soft warnings need confirmWarnings (Req 10.1, 10.5, 10.6)
//   PUT    /admin/bookings/{id}                 - change status / linked submission (Req 10.2)
//   DELETE /admin/bookings/{id}
//   GET    /me/bookings                         - speaker's own confirmed bookings only (Req 10.8, 10.9)
// Speaker responses use an explicit allow-list so admin-only data (marker, notes,
// warnings) can never leak.
import { randomUUID } from 'crypto';
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { requireAdmin, requireSpeaker } from '../shared/auth';
import { generateBookingWarnings } from '../shared/booking-logic';
import {
  NotFound,
  Route,
  ValidationError,
  created,
  dispatch,
  jsonResponse,
  noContent,
  ok,
  parseJsonBody,
} from '../shared/http';
import type { Booking, BookingStatus, Event } from '../shared/models';
import { bookingsRepo, eventsRepo, speakerAdminRepo, speakersRepo, submissionsRepo } from '../shared/repos';

type Ctx = APIGatewayProxyEvent;
type Body = Record<string, unknown>;

export const BOOKING_STATUSES: readonly BookingStatus[] = ['proposed', 'confirmed', 'declined'];

const isStatus = (v: unknown): v is BookingStatus =>
  typeof v === 'string' && (BOOKING_STATUSES as readonly string[]).includes(v);

const nonEmpty = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;

/** Speaker-facing projection of a confirmed booking with its event details. */
export function toSpeakerBooking(b: Booking, event: Event | undefined) {
  return {
    bookingId: b.bookingId,
    eventId: b.eventId,
    status: b.status,
    event: event
      ? {
          eventId: event.eventId,
          title: event.title,
          startDateTime: event.startDateTime,
          endDateTime: event.endDateTime,
          location: event.location,
          isOnline: event.isOnline,
          description: event.description,
          format: event.format,
        }
      : null,
  };
}

/** A linked submission must exist and belong to the booked speaker. */
async function assertSubmissionBelongsTo(submissionId: string, speakerId: string | null): Promise<void> {
  const submission = await submissionsRepo.get(submissionId);
  if (!submission) throw new ValidationError({ submissionId: 'Submission not found' });
  if (submission.speakerId !== speakerId) {
    throw new ValidationError({ submissionId: 'Submission does not belong to this speaker' });
  }
}

const routes: Route<Ctx>[] = [
  {
    method: 'GET',
    path: '/admin/bookings',
    handler: async (event) => {
      requireAdmin(event);
      const q = event.queryStringParameters ?? {};
      const eventId = q.eventId?.trim();
      const speakerId = q.speakerId?.trim();
      // No filter lists every booking (admin Bookings page).
      let items = eventId
        ? await bookingsRepo.listByEvent(eventId)
        : speakerId
          ? await bookingsRepo.listBySpeaker(speakerId)
          : await bookingsRepo.listAll();
      if (eventId && speakerId) items = items.filter((b) => b.speakerId === speakerId);
      items = [...items].sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? ''));
      return ok({ bookings: items });
    },
  },
  {
    method: 'POST',
    path: '/admin/bookings',
    handler: async (event) => {
      const auth = requireAdmin(event);
      const body = parseJsonBody<Body>(event.body, event.isBase64Encoded);

      const fields: Record<string, string> = {};
      if (!nonEmpty(body.eventId)) fields.eventId = 'Event is required';
      if (!nonEmpty(body.speakerId)) fields.speakerId = 'Speaker is required';
      if (body.status !== undefined && !isStatus(body.status)) {
        fields.status = `Status must be one of: ${BOOKING_STATUSES.join(', ')}`;
      }
      if (body.submissionId !== undefined && body.submissionId !== null && !nonEmpty(body.submissionId)) {
        fields.submissionId = 'Submission must be an ID';
      }
      if (body.confirmWarnings !== undefined && typeof body.confirmWarnings !== 'boolean') {
        fields.confirmWarnings = 'confirmWarnings must be true or false';
      }
      if (Object.keys(fields).length) throw new ValidationError(fields);

      const eventId = (body.eventId as string).trim();
      const speakerId = (body.speakerId as string).trim();
      const [targetEvent, speaker, speakerAdmin, existing] = await Promise.all([
        eventsRepo.get(eventId),
        speakersRepo.get(speakerId),
        speakerAdminRepo.get(speakerId),
        bookingsRepo.listBySpeaker(speakerId),
      ]);
      if (!targetEvent) throw new ValidationError({ eventId: 'Event not found' });
      if (!speaker) throw new ValidationError({ speakerId: 'Speaker not found' });
      if (nonEmpty(body.submissionId)) await assertSubmissionBelongsTo(body.submissionId.trim(), speakerId);

      if (body.confirmWarnings !== true) {
        const otherIds = [...new Set(existing.filter((b) => b.eventId !== eventId).map((b) => b.eventId))];
        const others = await Promise.all(otherIds.map((id) => eventsRepo.get(id)));
        const eventsById: Record<string, Event> = {};
        others.forEach((e) => {
          if (e) eventsById[e.eventId] = e;
        });
        const warnings = generateBookingWarnings({
          event: targetEvent,
          speakerAdmin,
          existingBookings: existing,
          eventsById,
        });
        if (warnings.length) {
          return jsonResponse(409, {
            error: {
              code: 'BOOKING_WARNINGS',
              message: 'Confirmation required: resubmit with confirmWarnings set to true',
              warnings,
            },
            warnings,
          });
        }
      }

      const item: Parameters<typeof bookingsRepo.create>[0] = {
        bookingId: randomUUID(),
        eventId,
        speakerId,
        status: (body.status as BookingStatus | undefined) ?? 'proposed',
        speakerNameSnapshot: speaker.name,
        ...(nonEmpty(body.submissionId) ? { submissionId: body.submissionId.trim() } : {}),
      };
      return created(await bookingsRepo.create(item, auth.userId));
    },
  },
  {
    method: 'PUT',
    path: '/admin/bookings/{id}',
    handler: async (event, params) => {
      const auth = requireAdmin(event);
      const body = parseJsonBody<Body>(event.body, event.isBase64Encoded);
      const fields: Record<string, string> = {};
      if (body.status !== undefined && !isStatus(body.status)) {
        fields.status = `Status must be one of: ${BOOKING_STATUSES.join(', ')}`;
      }
      if (body.submissionId !== undefined && body.submissionId !== null && !nonEmpty(body.submissionId)) {
        fields.submissionId = 'Submission must be an ID';
      }
      if (body.status === undefined && body.submissionId === undefined) {
        fields.status = 'Provide status or submissionId to update';
      }
      if (Object.keys(fields).length) throw new ValidationError(fields);

      const existing = await bookingsRepo.get(params.id);
      if (!existing) throw new NotFound('Booking not found');

      if (nonEmpty(body.submissionId)) await assertSubmissionBelongsTo(body.submissionId.trim(), existing.speakerId);

      const patch: Partial<Booking> = {};
      if (body.status !== undefined) patch.status = body.status as BookingStatus;
      if (body.submissionId !== undefined) {
        patch.submissionId = nonEmpty(body.submissionId) ? body.submissionId.trim() : undefined;
      }
      const expected = typeof body.updatedAt === 'string' ? body.updatedAt : undefined;
      return ok(await bookingsRepo.update(params.id, patch, auth.userId, expected));
    },
  },
  {
    method: 'DELETE',
    path: '/admin/bookings/{id}',
    handler: async (event, params) => {
      requireAdmin(event);
      if (!(await bookingsRepo.get(params.id))) throw new NotFound('Booking not found');
      await bookingsRepo.delete(params.id);
      return noContent();
    },
  },
  {
    method: 'GET',
    path: '/me/bookings',
    handler: async (event) => {
      const auth = requireSpeaker(event);
      const profile = await speakersRepo.getByUserId(auth.userId);
      if (!profile) return ok({ bookings: [] });

      const confirmed = (await bookingsRepo.listBySpeaker(profile.speakerId)).filter(
        (b) => b.status === 'confirmed' && b.speakerId === profile.speakerId,
      );
      const events = await Promise.all(confirmed.map((b) => eventsRepo.get(b.eventId)));
      const bookings = confirmed
        .map((b, i) => toSpeakerBooking(b, events[i]))
        .sort((a, b) => (a.event?.startDateTime ?? '').localeCompare(b.event?.startDateTime ?? ''));
      return ok({ bookings });
    },
  },
];

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> =>
  dispatch(routes, event.httpMethod, event.path, event);
