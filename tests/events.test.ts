import { handler } from '../src/handlers/events';
import { bookingsRepo, cfpsRepo, eventsRepo } from '../src/shared/repos';

jest.mock('../src/shared/repos', () => ({
  eventsRepo: {
    create: jest.fn(),
    get: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    listAll: jest.fn(),
    listByStatus: jest.fn(),
  },
  bookingsRepo: { listByEvent: jest.fn(), delete: jest.fn() },
  cfpsRepo: { listAll: jest.fn(), update: jest.fn() },
}));

const repo = eventsRepo as unknown as Record<string, jest.Mock>;
const bookings = bookingsRepo as unknown as Record<string, jest.Mock>;
const cfps = cfpsRepo as unknown as Record<string, jest.Mock>;

const makeEvent = (
  method: string,
  path: string,
  groups: string[],
  body?: unknown,
  query?: Record<string, string>
): any => ({
  httpMethod: method,
  path,
  body: body === undefined ? null : JSON.stringify(body),
  isBase64Encoded: false,
  queryStringParameters: query ?? null,
  requestContext: {
    authorizer: { claims: { sub: 'admin-sub', email: 'a@example.com', 'cognito:groups': groups } },
  },
});

const parse = (r: any) => JSON.parse(r.body);
const ev = (id: string, start: string, status = 'scheduled') => ({
  eventId: id,
  title: id,
  startDateTime: start,
  endDateTime: start,
  status,
});

describe('events handler', () => {
  beforeEach(() => {
    [repo, bookings, cfps].forEach((r) => Object.values(r).forEach((m) => m.mockReset()));
    bookings.listByEvent.mockResolvedValue([]);
  });

  it('returns 403 for speakers on every route', async () => {
    for (const [m, p] of [
      ['GET', '/admin/events'],
      ['POST', '/admin/events'],
      ['GET', '/admin/events/1'],
      ['PUT', '/admin/events/1'],
      ['DELETE', '/admin/events/1'],
    ]) {
      const res = await handler(makeEvent(m, p, ['speaker'], {}));
      expect(res.statusCode).toBe(403);
    }
    expect(repo.create).not.toHaveBeenCalled();
  });

  describe('POST', () => {
    it('creates an event with defaults and audit actor', async () => {
      repo.create.mockImplementation(async (item) => item);
      const res = await handler(
        makeEvent('POST', '/admin/events', ['admin'], {
          title: ' Meetup ',
          startDateTime: '2025-03-01T18:00:00Z',
        })
      );
      expect(res.statusCode).toBe(201);
      const [item, actor] = repo.create.mock.calls[0];
      expect(actor).toBe('admin-sub');
      expect(item).toMatchObject({
        title: 'Meetup',
        status: 'draft',
        endDateTime: '2025-03-01T18:00:00Z',
        isOnline: false,
      });
      expect(item.eventId).toBeTruthy();
    });

    it('rejects missing title/date and end before start', async () => {
      const r1 = await handler(makeEvent('POST', '/admin/events', ['admin'], {}));
      expect(r1.statusCode).toBe(400);
      expect(Object.keys(parse(r1).error.fields)).toEqual(expect.arrayContaining(['title', 'startDateTime']));

      const r2 = await handler(
        makeEvent('POST', '/admin/events', ['admin'], {
          title: 'x',
          startDateTime: '2025-03-02T00:00:00Z',
          endDateTime: '2025-03-01T00:00:00Z',
        })
      );
      expect(r2.statusCode).toBe(400);
      expect(parse(r2).error.fields.endDateTime).toBeDefined();
      expect(repo.create).not.toHaveBeenCalled();
    });

    it('rejects an invalid status', async () => {
      const res = await handler(
        makeEvent('POST', '/admin/events', ['admin'], {
          title: 'x',
          startDateTime: '2025-03-01T00:00:00Z',
          status: 'bogus',
        })
      );
      expect(res.statusCode).toBe(400);
      expect(parse(res).error.fields.status).toBeDefined();
    });
  });

  describe('GET list', () => {
    it('filters by status using the index', async () => {
      repo.listByStatus.mockResolvedValue([ev('b', '2025-02-01T00:00:00Z')]);
      const res = await handler(makeEvent('GET', '/admin/events', ['admin'], undefined, { status: 'scheduled' }));
      expect(repo.listByStatus).toHaveBeenCalledWith('scheduled');
      expect(parse(res).events).toHaveLength(1);
    });

    it('filters by date range and sorts by start', async () => {
      repo.listAll.mockResolvedValue([
        ev('c', '2025-03-10T00:00:00Z'),
        ev('a', '2025-01-10T00:00:00Z'),
        ev('b', '2025-02-10T00:00:00Z'),
      ]);
      const res = await handler(
        makeEvent('GET', '/admin/events', ['admin'], undefined, {
          from: '2025-02-01T00:00:00Z',
          to: '2025-03-31T00:00:00Z',
        })
      );
      expect(parse(res).events.map((e: any) => e.eventId)).toEqual(['b', 'c']);
    });

    it('rejects bad status and inverted ranges', async () => {
      const r1 = await handler(makeEvent('GET', '/admin/events', ['admin'], undefined, { status: 'nope' }));
      expect(r1.statusCode).toBe(400);
      const r2 = await handler(
        makeEvent('GET', '/admin/events', ['admin'], undefined, { from: '2025-03-01', to: '2025-01-01' })
      );
      expect(r2.statusCode).toBe(400);
    });
  });

  describe('GET/PUT/DELETE by id', () => {
    it('returns 404 for unknown events', async () => {
      repo.get.mockResolvedValue(undefined);
      expect((await handler(makeEvent('GET', '/admin/events/x', ['admin']))).statusCode).toBe(404);
      expect((await handler(makeEvent('PUT', '/admin/events/x', ['admin'], {}))).statusCode).toBe(404);
      expect((await handler(makeEvent('DELETE', '/admin/events/x', ['admin']))).statusCode).toBe(404);
    });

    it('updates by merging with the existing event and validates the result', async () => {
      repo.get.mockResolvedValue(ev('e1', '2025-03-01T00:00:00Z'));
      repo.update.mockImplementation(async (_id, patch) => ({ eventId: 'e1', ...patch }));
      const ok = await handler(makeEvent('PUT', '/admin/events/e1', ['admin'], { title: 'New' }));
      expect(ok.statusCode).toBe(200);
      expect(repo.update.mock.calls[0][1]).toMatchObject({ title: 'New', startDateTime: '2025-03-01T00:00:00Z' });

      const bad = await handler(
        makeEvent('PUT', '/admin/events/e1', ['admin'], { endDateTime: '2025-02-01T00:00:00Z' })
      );
      expect(bad.statusCode).toBe(400);
    });

    it('deletes through the delete hook', async () => {
      repo.get.mockResolvedValue(ev('e1', '2025-03-01T00:00:00Z'));
      const res = await handler(makeEvent('DELETE', '/admin/events/e1', ['admin']));
      expect(res.statusCode).toBe(204);
      expect(repo.delete).toHaveBeenCalledWith('e1');
      expect(bookings.delete).not.toHaveBeenCalled();
    });

    it('returns 409 CONFIRM_REQUIRED when bookings exist and not confirmed, deleting nothing', async () => {
      repo.get.mockResolvedValue(ev('e1', '2025-03-01T00:00:00Z'));
      bookings.listByEvent.mockResolvedValue([{ bookingId: 'b1', eventId: 'e1' }]);
      const res = await handler(makeEvent('DELETE', '/admin/events/e1', ['admin']));
      expect(res.statusCode).toBe(409);
      expect(parse(res).error.code).toBe('CONFIRM_REQUIRED');
      expect(repo.delete).not.toHaveBeenCalled();
      expect(bookings.delete).not.toHaveBeenCalled();
      expect(cfps.update).not.toHaveBeenCalled();
    });

    it('on confirmed delete removes bookings and never touches CFPs', async () => {
      repo.get.mockResolvedValue(ev('e1', '2025-03-01T00:00:00Z'));
      bookings.listByEvent.mockResolvedValue([
        { bookingId: 'b1', eventId: 'e1' },
        { bookingId: 'b2', eventId: 'e1' },
      ]);
      const res = await handler(
        makeEvent('DELETE', '/admin/events/e1', ['admin'], undefined, { confirm: 'true' })
      );
      expect(res.statusCode).toBe(204);
      expect(bookings.delete).toHaveBeenCalledWith('b1');
      expect(bookings.delete).toHaveBeenCalledWith('b2');
      expect(cfps.update).not.toHaveBeenCalled();
      expect(cfps.listAll).not.toHaveBeenCalled();
      expect(repo.delete).toHaveBeenCalledWith('e1');
    });
  });
});
