// Events handler: admin CRUD with validation, status and date-range filters.
import { randomUUID } from 'crypto';
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { requireAdmin } from '../shared/auth';
import {
  ConfirmRequired,
  NotFound,
  Route,
  ValidationError,
  created,
  dispatch,
  noContent,
  ok,
  parseJsonBody,
} from '../shared/http';
import type { Event, EventStatus } from '../shared/models';
import { bookingsRepo, eventsRepo } from '../shared/repos';
import { validateEvent } from '../shared/validation';

type Ctx = APIGatewayProxyEvent;

export const EVENT_STATUSES: readonly EventStatus[] = ['draft', 'scheduled', 'completed', 'cancelled'];

type EventBody = Record<string, unknown>;

const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v.trim() : fallback);

function parseStatus(v: unknown, fields: Record<string, string>, field = 'status'): EventStatus | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  if (typeof v === 'string' && (EVENT_STATUSES as readonly string[]).includes(v)) return v as EventStatus;
  fields[field] = `Status must be one of: ${EVENT_STATUSES.join(', ')}`;
  return undefined;
}

function parseDateFilter(v: string | undefined, field: string, fields: Record<string, string>): number | undefined {
  if (!v) return undefined;
  const t = Date.parse(v);
  if (Number.isNaN(t)) {
    fields[field] = `${field} must be a valid date`;
    return undefined;
  }
  return t;
}

/** Build a full event record (minus ids/audit) from a body, validating it. */
function buildEventFields(body: EventBody, base?: Event) {
  const merged = { ...(base ?? {}), ...body } as EventBody;
  const fields = validateEvent(merged);
  const status = parseStatus(merged.status, fields) ?? 'draft';
  if (typeof merged.isOnline !== 'undefined' && typeof merged.isOnline !== 'boolean') {
    fields.isOnline = 'isOnline must be true or false';
  }
  if (Object.keys(fields).length) throw new ValidationError(fields);

  const start = str(merged.startDateTime);
  const end = str(merged.endDateTime) || start;
  return {
    title: str(merged.title),
    startDateTime: start,
    endDateTime: end,
    location: str(merged.location),
    isOnline: merged.isOnline === true,
    description: str(merged.description),
    format: str(merged.format),
    status,
  };
}

/**
 * Delete an event. If it has bookings and `confirm` is false, throws 409
 * CONFIRM_REQUIRED and deletes nothing. On confirmed delete, removes the
 * event's bookings. CFPs are not tied to events, so none are touched.
 * `confirm` is true when the client passed `?confirm=true`.
 */
export async function deleteEvent(event: Event, confirm: boolean, actor: string): Promise<void> {
  const bookings = await bookingsRepo.listByEvent(event.eventId);
  if (bookings.length > 0 && !confirm) {
    throw new ConfirmRequired([
      `This event has ${bookings.length} booking(s) that will be deleted along with it.`,
    ]);
  }
  for (const b of bookings) {
    await bookingsRepo.delete(b.bookingId);
  }
  await eventsRepo.delete(event.eventId);
}

const routes: Route<Ctx>[] = [
  {
    method: 'GET',
    path: '/admin/events',
    handler: async (event) => {
      requireAdmin(event);
      const q = event.queryStringParameters ?? {};
      const fields: Record<string, string> = {};
      const status = parseStatus(q.status, fields);
      const from = parseDateFilter(q.from, 'from', fields);
      const to = parseDateFilter(q.to, 'to', fields);
      if (from !== undefined && to !== undefined && to < from) {
        fields.to = 'to must not be before from';
      }
      if (Object.keys(fields).length) throw new ValidationError(fields);

      const items = status ? await eventsRepo.listByStatus(status) : await eventsRepo.listAll();
      const events = items
        .filter((e) => {
          const t = Date.parse(e.startDateTime);
          return (from === undefined || t >= from) && (to === undefined || t <= to);
        })
        .sort((a, b) => a.startDateTime.localeCompare(b.startDateTime));
      return ok({ events });
    },
  },
  {
    method: 'POST',
    path: '/admin/events',
    handler: async (event) => {
      const auth = requireAdmin(event);
      const body = parseJsonBody<EventBody>(event.body, event.isBase64Encoded);
      const item = { eventId: randomUUID(), ...buildEventFields(body) };
      return created(await eventsRepo.create(item, auth.userId));
    },
  },
  {
    method: 'GET',
    path: '/admin/events/{id}',
    handler: async (event, params) => {
      requireAdmin(event);
      const found = await eventsRepo.get(params.id);
      if (!found) throw new NotFound('Event not found');
      return ok(found);
    },
  },
  {
    method: 'PUT',
    path: '/admin/events/{id}',
    handler: async (event, params) => {
      const auth = requireAdmin(event);
      const body = parseJsonBody<EventBody>(event.body, event.isBase64Encoded);
      const existing = await eventsRepo.get(params.id);
      if (!existing) throw new NotFound('Event not found');
      const patch = buildEventFields(body, existing);
      const expected = typeof body.updatedAt === 'string' ? body.updatedAt : undefined;
      return ok(await eventsRepo.update(params.id, patch, auth.userId, expected));
    },
  },
  {
    method: 'DELETE',
    path: '/admin/events/{id}',
    handler: async (event, params) => {
      const auth = requireAdmin(event);
      const existing = await eventsRepo.get(params.id);
      if (!existing) throw new NotFound('Event not found');
      await deleteEvent(existing, event.queryStringParameters?.confirm === 'true', auth.userId);
      return noContent();
    },
  },
];

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> =>
  dispatch(routes, event.httpMethod, event.path, event);
