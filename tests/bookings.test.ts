import { handler } from '../src/handlers/bookings';
import { bookingsRepo, eventsRepo, speakerAdminRepo, speakersRepo, submissionsRepo } from '../src/shared/repos';

jest.mock('../src/shared/repos', () => ({
  bookingsRepo: {
    create: jest.fn(),
    get: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    listByEvent: jest.fn(),
    listBySpeaker: jest.fn(),
    listAll: jest.fn(),
  },
  eventsRepo: { get: jest.fn() },
  speakersRepo: { get: jest.fn(), getByUserId: jest.fn() },
  speakerAdminRepo: { get: jest.fn() },
  submissionsRepo: { get: jest.fn() },
}));

const bookings = bookingsRepo as unknown as Record<string, jest.Mock>;
const events = eventsRepo as unknown as Record<string, jest.Mock>;
const speakers = speakersRepo as unknown as Record<string, jest.Mock>;
const speakerAdmin = speakerAdminRepo as unknown as Record<string, jest.Mock>;
const submissions = submissionsRepo as unknown as Record<string, jest.Mock>;

const makeEvent = (method: string, path: string, groups: string[], body?: unknown, query?: Record<string, string>): any => ({
  httpMethod: method,
  path,
  body: body === undefined ? null : JSON.stringify(body),
  isBase64Encoded: false,
  queryStringParameters: query ?? null,
  requestContext: { authorizer: { claims: { sub: 'user-1', email: 'a@example.com', 'cognito:groups': groups } } },
});
const parse = (r: any) => JSON.parse(r.body);

const evt = (id: string, start: string, end: string) => ({
  eventId: id,
  title: `Event ${id}`,
  startDateTime: start,
  endDateTime: end,
  location: 'Pub',
  isOnline: false,
  description: 'd',
  format: 'talks',
  status: 'scheduled',
});

describe('bookings handler', () => {
  beforeEach(() => {
    [bookings, events, speakers, speakerAdmin, submissions].forEach((r) => Object.values(r).forEach((m) => m.mockReset()));
    events.get.mockImplementation(async (id: string) =>
      id === 'e1' ? evt('e1', '2025-03-01T18:00:00Z', '2025-03-01T20:00:00Z') : undefined,
    );
    speakers.get.mockResolvedValue({ speakerId: 's1', name: 'Ada' });
    speakerAdmin.get.mockResolvedValue(undefined);
    submissions.get.mockImplementation(async (id: string) =>
      id === 'sub1' ? { submissionId: 'sub1', speakerId: 's1' } : id === 'other' ? { submissionId: 'other', speakerId: 's2' } : undefined,
    );
    bookings.listBySpeaker.mockResolvedValue([]);
    bookings.create.mockImplementation(async (item) => item);
  });

  describe('POST /admin/bookings', () => {
    const post = (body: unknown) => handler(makeEvent('POST', '/admin/bookings', ['admin'], body));

    it('creates a proposed booking with a name snapshot', async () => {
      const res = await post({ eventId: 'e1', speakerId: 's1', submissionId: 'sub1' });
      expect(res.statusCode).toBe(201);
      expect(bookings.create).toHaveBeenCalledWith(
        expect.objectContaining({
          eventId: 'e1',
          speakerId: 's1',
          status: 'proposed',
          speakerNameSnapshot: 'Ada',
          submissionId: 'sub1',
        }),
        'user-1',
      );
    });

    it('validates input and referenced records', async () => {
      expect((await post({ speakerId: 's1' })).statusCode).toBe(400);
      expect((await post({ eventId: 'e1', speakerId: 's1', status: 'bogus' })).statusCode).toBe(400);
      expect(parse(await post({ eventId: 'nope', speakerId: 's1' })).error.fields.eventId).toBeDefined();
      speakers.get.mockResolvedValue(undefined);
      expect(parse(await post({ eventId: 'e1', speakerId: 'x' })).error.fields.speakerId).toBeDefined();
      expect(bookings.create).not.toHaveBeenCalled();
    });

    it('rejects a submissionId that does not exist or belongs to another speaker', async () => {
      const missing = await post({ eventId: 'e1', speakerId: 's1', submissionId: 'ghost' });
      expect(missing.statusCode).toBe(400);
      expect(parse(missing).error.fields.submissionId).toMatch(/not found/i);
      const foreign = await post({ eventId: 'e1', speakerId: 's1', submissionId: 'other' });
      expect(foreign.statusCode).toBe(400);
      expect(parse(foreign).error.fields.submissionId).toMatch(/does not belong/i);
      expect(bookings.create).not.toHaveBeenCalled();
    });

    it('does not look up a submission when none is given', async () => {
      expect((await post({ eventId: 'e1', speakerId: 's1' })).statusCode).toBe(201);
      expect(submissions.get).not.toHaveBeenCalled();
    });

    it('returns 409 with warnings for marker, duplicate and overlap, then allows confirmWarnings', async () => {
      speakerAdmin.get.mockResolvedValue({ marker: 'not_again' });
      bookings.listBySpeaker.mockResolvedValue([
        { bookingId: 'b0', eventId: 'e1', status: 'proposed' },
        { bookingId: 'b9', eventId: 'e2', status: 'confirmed' },
      ]);
      events.get.mockImplementation(async (id: string) =>
        id === 'e1'
          ? evt('e1', '2025-03-01T18:00:00Z', '2025-03-01T20:00:00Z')
          : evt('e2', '2025-03-01T19:00:00Z', '2025-03-01T21:00:00Z'),
      );

      const res = await post({ eventId: 'e1', speakerId: 's1' });
      expect(res.statusCode).toBe(409);
      expect(parse(res).warnings.map((w: any) => w.code)).toEqual([
        'SPEAKER_NOT_AGAIN',
        'DUPLICATE_BOOKING',
        'OVERLAPPING_EVENT',
      ]);
      expect(bookings.create).not.toHaveBeenCalled();

      const confirmed = await post({ eventId: 'e1', speakerId: 's1', confirmWarnings: true });
      expect(confirmed.statusCode).toBe(201);
      expect(bookings.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('GET /admin/bookings', () => {
    it('lists by event, by speaker, and every booking when no filter is given', async () => {
      bookings.listByEvent.mockResolvedValue([{ bookingId: 'b1' }]);
      bookings.listBySpeaker.mockResolvedValue([{ bookingId: 'b2' }]);
      const byEvent = await handler(makeEvent('GET', '/admin/bookings', ['admin'], undefined, { eventId: 'e1' }));
      expect(parse(byEvent).bookings).toEqual([{ bookingId: 'b1' }]);
      const bySpeaker = await handler(makeEvent('GET', '/admin/bookings', ['admin'], undefined, { speakerId: 's1' }));
      expect(parse(bySpeaker).bookings).toEqual([{ bookingId: 'b2' }]);
      bookings.listAll.mockResolvedValue([{ bookingId: 'b3' }, { bookingId: 'b4' }]);
      const all = await handler(makeEvent('GET', '/admin/bookings', ['admin']));
      expect(all.statusCode).toBe(200);
      expect(parse(all).bookings).toHaveLength(2);
    });
  });

  describe('PUT/DELETE /admin/bookings/{id}', () => {
    it('updates status, 404s on unknown id, and validates', async () => {
      bookings.get.mockResolvedValue({ bookingId: 'b1', status: 'proposed' });
      bookings.update.mockImplementation(async (_id, patch) => ({ bookingId: 'b1', ...patch }));
      const res = await handler(makeEvent('PUT', '/admin/bookings/b1', ['admin'], { status: 'confirmed' }));
      expect(res.statusCode).toBe(200);
      expect(bookings.update).toHaveBeenCalledWith('b1', { status: 'confirmed' }, 'user-1', undefined);
      expect((await handler(makeEvent('PUT', '/admin/bookings/b1', ['admin'], { status: 'x' }))).statusCode).toBe(400);
      bookings.get.mockResolvedValue(undefined);
      expect((await handler(makeEvent('PUT', '/admin/bookings/zz', ['admin'], { status: 'declined' }))).statusCode).toBe(404);
      expect((await handler(makeEvent('DELETE', '/admin/bookings/zz', ['admin']))).statusCode).toBe(404);
    });

    it('validates a changed submissionId against the booking\'s speaker', async () => {
      bookings.get.mockResolvedValue({ bookingId: 'b1', speakerId: 's1', status: 'proposed' });
      bookings.update.mockImplementation(async (_id, patch) => ({ bookingId: 'b1', ...patch }));
      expect((await handler(makeEvent('PUT', '/admin/bookings/b1', ['admin'], { submissionId: 'ghost' }))).statusCode).toBe(400);
      expect((await handler(makeEvent('PUT', '/admin/bookings/b1', ['admin'], { submissionId: 'other' }))).statusCode).toBe(400);
      expect(bookings.update).not.toHaveBeenCalled();
      expect((await handler(makeEvent('PUT', '/admin/bookings/b1', ['admin'], { submissionId: 'sub1' }))).statusCode).toBe(200);
      expect((await handler(makeEvent('PUT', '/admin/bookings/b1', ['admin'], { submissionId: null }))).statusCode).toBe(200);
    });

    it('deletes an existing booking', async () => {
      bookings.get.mockResolvedValue({ bookingId: 'b1' });
      const res = await handler(makeEvent('DELETE', '/admin/bookings/b1', ['admin']));
      expect(res.statusCode).toBe(204);
      expect(bookings.delete).toHaveBeenCalledWith('b1');
    });
  });

  describe('GET /me/bookings', () => {
    it('returns only own confirmed bookings with an allow-listed shape', async () => {
      speakers.getByUserId.mockResolvedValue({ speakerId: 's1' });
      bookings.listBySpeaker.mockResolvedValue([
        { bookingId: 'b1', eventId: 'e1', speakerId: 's1', status: 'confirmed', speakerNameSnapshot: 'Ada', marker: 'not_again', notes: 'secret', warnings: ['w'], createdBy: 'admin' },
        { bookingId: 'b2', eventId: 'e1', speakerId: 's1', status: 'proposed' },
        { bookingId: 'b3', eventId: 'e1', speakerId: 's1', status: 'declined' },
      ]);
      const res = await handler(makeEvent('GET', '/me/bookings', ['speaker']));
      expect(res.statusCode).toBe(200);
      const { bookings: list } = parse(res);
      expect(list).toHaveLength(1);
      expect(list[0].bookingId).toBe('b1');
      expect(list[0].event.title).toBe('Event e1');
      expect(Object.keys(list[0]).sort()).toEqual(['bookingId', 'event', 'eventId', 'status']);
      expect(res.body).not.toMatch(/marker|secret|warnings|createdBy|speakerNameSnapshot/);
    });

    it('returns an empty list without a profile and rejects admin-only callers', async () => {
      speakers.getByUserId.mockResolvedValue(undefined);
      expect(parse(await handler(makeEvent('GET', '/me/bookings', ['speaker']))).bookings).toEqual([]);
      expect((await handler(makeEvent('GET', '/me/bookings', ['admin']))).statusCode).toBe(403);
    });
  });

  it('returns 403 for speakers on every admin route', async () => {
    for (const [m, p] of [
      ['GET', '/admin/bookings'],
      ['POST', '/admin/bookings'],
      ['PUT', '/admin/bookings/1'],
      ['DELETE', '/admin/bookings/1'],
    ]) {
      expect((await handler(makeEvent(m, p, ['speaker'], {}))).statusCode).toBe(403);
    }
    expect(bookings.create).not.toHaveBeenCalled();
  });
});
