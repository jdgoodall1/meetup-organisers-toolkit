import { createApiClient, defaultTokenProvider } from '../api';

const mockFetchAuthSession = jest.fn();
jest.mock('aws-amplify/auth', () => ({ fetchAuthSession: (...a: unknown[]) => mockFetchAuthSession(...a) }));
// import.meta is unavailable under Jest
jest.mock('../../config/env', () => ({ API_BASE_URL: 'https://api.test/dev' }));

const fetchMock = jest.fn();

function reply(status: number, body?: unknown) {
  fetchMock.mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    statusText: 'x',
    text: async () => (body === undefined ? '' : JSON.stringify(body)),
  });
}

const client = () => createApiClient({ baseUrl: 'https://api.test/dev/', getToken: async () => 'tok' });

beforeEach(() => {
  fetchMock.mockReset();
  (global as unknown as { fetch: unknown }).fetch = fetchMock;
});

describe('api client', () => {
  it('attaches Authorization, builds URL and query, unwraps list', async () => {
    reply(200, { events: [{ eventId: 'e1' }] });
    const r = await client().listEvents({ status: 'scheduled' });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.test/dev/admin/events?status=scheduled',
      expect.objectContaining({ method: 'GET', headers: { Authorization: 'Bearer tok' } }),
    );
    expect(r).toEqual({ ok: true, status: 200, data: [{ eventId: 'e1' }] });
  });

  it('sends JSON body and encodes path ids', async () => {
    reply(200, { marker: 'not_again' });
    await client().setSpeakerMarker('a/b', { marker: 'not_again', markerNote: 'n' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.test/dev/admin/speakers/a%2Fb/marker');
    expect(init.method).toBe('PUT');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(init.body)).toEqual({ marker: 'not_again', markerNote: 'n' });
  });

  it('maps validation errors with fields', async () => {
    reply(400, { error: { code: 'VALIDATION_ERROR', message: 'Validation failed', fields: { title: 'Required' } } });
    const r = await client().createEvent({ title: '', startDateTime: 'a', endDateTime: 'b' });
    expect(r).toEqual({
      ok: false,
      kind: 'error',
      status: 400,
      error: { code: 'VALIDATION_ERROR', message: 'Validation failed', fields: { title: 'Required' } },
    });
  });

  it('maps 409 BOOKING_WARNINGS to typed warnings', async () => {
    const warnings = [{ code: 'SPEAKER_NOT_AGAIN', message: 'Marked not again' }];
    reply(409, { error: { code: 'BOOKING_WARNINGS', message: 'Confirm', warnings }, warnings });
    const r = await client().createBooking({ eventId: 'e', speakerId: 's' });
    expect(r).toMatchObject({ ok: false, kind: 'booking_warnings', status: 409, warnings });
  });

  it('maps 409 CONFIRM_REQUIRED and sends confirm=true on retry', async () => {
    reply(409, { error: { code: 'CONFIRM_REQUIRED', message: 'Confirmation required', warnings: ['2 bookings'] } });
    const r = await client().deleteEvent('e1');
    expect(r).toMatchObject({ ok: false, kind: 'confirm_required', warnings: ['2 bookings'] });
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.test/dev/admin/events/e1');

    reply(204);
    const r2 = await client().deleteEvent('e1', true);
    expect(fetchMock.mock.calls[1][0]).toBe('https://api.test/dev/admin/events/e1?confirm=true');
    expect(r2).toEqual({ ok: true, status: 204, data: undefined });
  });

  it('treats other 409 codes as plain errors', async () => {
    reply(409, { error: { code: 'CONFLICT', message: 'Modified' } });
    const r = await client().updateCfp('c1', { title: 't' });
    expect(r).toMatchObject({ ok: false, kind: 'error', status: 409, error: { code: 'CONFLICT' } });
  });

  it('returns a NETWORK_ERROR failure when fetch rejects', async () => {
    fetchMock.mockRejectedValueOnce(new Error('offline'));
    const r = await client().getMe();
    expect(r).toMatchObject({ ok: false, kind: 'error', status: 0, error: { code: 'NETWORK_ERROR' } });
  });

  it('handles non-JSON error bodies', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 502, statusText: 'Bad Gateway', text: async () => '<html>' });
    const r = await client().getMe();
    expect(r).toMatchObject({ ok: false, status: 502, error: { code: 'HTTP_502', message: 'Bad Gateway' } });
  });

  it('omits Authorization when no token', async () => {
    reply(200, { userId: 'u' });
    await createApiClient({ baseUrl: 'https://x', getToken: async () => undefined }).getMe();
    expect(fetchMock.mock.calls[0][1].headers).toEqual({});
  });

  it('calls the speaker and admin routes with the expected methods and paths', async () => {
    const c = client();
    const cases: Array<[() => Promise<unknown>, string, string]> = [
      [() => c.getMyProfile(), 'GET', '/me/profile'],
      [() => c.requestHeadshotUpload({ contentType: 'image/png', size: 1 }), 'POST', '/me/profile/headshot-url'],
      [() => c.requestSpeakerHeadshotUpload('s 1', { contentType: 'image/png', size: 1 }), 'POST', '/admin/speakers/s%201/headshot-url'],
      [() => c.deleteMyAccount(), 'DELETE', '/me'],
      [() => c.withdrawMySubmission('s1'), 'DELETE', '/me/submissions/s1'],
      [() => c.submitMySubmission('s1'), 'POST', '/me/submissions/s1/submit'],
      [() => c.replaceCfpQuestions('c1', [], { confirm: true }), 'PUT', '/admin/cfps/c1/questions?confirm=true'],
      [() => c.applyTemplate('c1', { templateId: 't' }), 'POST', '/admin/cfps/c1/apply-template'],
      [() => c.reviewSubmission('s1', { rating: 4 }), 'PUT', '/admin/submissions/s1/review'],
      [() => c.listBookings({ eventId: 'e1' }), 'GET', '/admin/bookings?eventId=e1'],
      [() => c.demoteUser('u1'), 'POST', '/admin/users/u1/demote'],
      [() => c.listCfpSubmissions('c1', 'all'), 'GET', '/admin/cfps/c1/submissions?status=all'],
    ];
    for (const [call, method, path] of cases) {
      fetchMock.mockClear();
      reply(200, {});
      await call().catch(() => undefined);
      const [url, init] = fetchMock.mock.calls[0];
      expect([init.method, url]).toEqual([method, `https://api.test/dev${path}`]);
    }
  });
});

describe('defaultTokenProvider', () => {
  afterEach(() => localStorage.clear());

  it('uses the Amplify ID token', async () => {
    mockFetchAuthSession.mockResolvedValue({ tokens: { idToken: { toString: () => 'amp' } } });
    expect(await defaultTokenProvider()).toBe('amp');
  });

  it('falls back to the stored idToken', async () => {
    mockFetchAuthSession.mockRejectedValue(new Error('no session'));
    localStorage.setItem('idToken', 'stored');
    expect(await defaultTokenProvider()).toBe('stored');
  });
});
