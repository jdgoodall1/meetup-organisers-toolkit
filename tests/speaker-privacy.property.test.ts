import * as fc from 'fast-check';
import { handler } from '../src/handlers/speakers-me';
import { speakersRepo } from '../src/shared/repos';

jest.mock('../src/shared/repos', () => ({
  speakersRepo: { create: jest.fn(), update: jest.fn(), getByUserId: jest.fn() },
}));
jest.mock('../src/shared/headshots', () => ({
  createHeadshotUpload: jest.fn(),
  getHeadshotUrl: jest.fn().mockResolvedValue('https://signed.example/get'),
  deleteHeadshot: jest.fn().mockResolvedValue(undefined),
  headshotKeyPrefix: (id: string) => `headshots/${id}/`,
}));

const repo = speakersRepo as unknown as Record<string, jest.Mock>;

const FORBIDDEN = [
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

const makeEvent = (method: string, body?: unknown): any => ({
  httpMethod: method,
  path: '/me/profile',
  body: body === undefined ? null : JSON.stringify(body),
  isBase64Encoded: false,
  queryStringParameters: null,
  requestContext: {
    authorizer: { claims: { sub: 'user-1', email: 's@example.com', 'cognito:groups': ['speaker'] } },
  },
});

// A stored speaker item polluted with arbitrary admin-only attributes.
const itemArb = fc
  .record({
    marker: fc.constantFrom('have_back', 'not_again', 'unset'),
    markerNote: fc.string(),
    markerChangedBy: fc.string(),
    markerChangedAt: fc.string(),
    adminNotes: fc.string(),
    rating: fc.integer({ min: 1, max: 5 }),
    notes: fc.string(),
    reviews: fc.array(fc.record({ rating: fc.integer(), notes: fc.string() })),
    review: fc.string(),
    reviewNotes: fc.string(),
    name: fc.string({ minLength: 1 }),
    bio: fc.string({ minLength: 1 }),
  })
  .chain((extra) =>
    fc.subarray(FORBIDDEN, { minLength: 1 }).map((keep) => {
      const polluted: Record<string, unknown> = {};
      for (const k of keep) polluted[k] = (extra as any)[k];
      return {
        speakerId: 'sp-1',
        userId: 'user-1',
        name: extra.name,
        bio: extra.bio,
        location: '',
        topics: [],
        links: [],
        pastTalks: [],
        updatedAt: 't',
        ...polluted,
      };
    }),
  );

const hasForbidden = (o: unknown): boolean =>
  JSON.stringify(o, (_k, v) => v) !== undefined &&
  FORBIDDEN.some((f) => Object.prototype.hasOwnProperty.call(o as object, f));

describe('speaker-facing handlers never leak admin-only fields', () => {
  // **Validates: Requirements 5.4, 8.12**
  it('GET /me/profile omits marker, notes and review fields', async () => {
    await fc.assert(
      fc.asyncProperty(itemArb, async (item) => {
        repo.getByUserId.mockResolvedValue(item);
        const r = await handler(makeEvent('GET'));
        expect(r.statusCode).toBe(200);
        expect(hasForbidden(JSON.parse(r.body))).toBe(false);
      }),
    );
  });

  // **Validates: Requirements 5.4, 8.12**
  it('PUT /me/profile omits marker, notes and review fields', async () => {
    await fc.assert(
      fc.asyncProperty(itemArb, async (item) => {
        repo.getByUserId.mockResolvedValue(item);
        repo.update.mockResolvedValue(item);
        repo.create.mockResolvedValue(item);
        const r = await handler(makeEvent('PUT', { name: 'Ann', bio: 'Bio' }));
        expect(r.statusCode).toBe(200);
        expect(hasForbidden(JSON.parse(r.body))).toBe(false);
      }),
    );
  });
});
