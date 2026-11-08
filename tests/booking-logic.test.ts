import { eventsOverlap, generateBookingWarnings } from '../src/shared/booking-logic';

const ev = (eventId: string, start: string, end: string) => ({
  eventId,
  title: `Event ${eventId}`,
  startDateTime: start,
  endDateTime: end,
});

describe('eventsOverlap', () => {
  const a = ev('a', '2025-01-01T18:00:00Z', '2025-01-01T20:00:00Z');

  it('detects partial overlap symmetrically', () => {
    const b = ev('b', '2025-01-01T19:00:00Z', '2025-01-01T21:00:00Z');
    expect(eventsOverlap(a, b)).toBe(true);
    expect(eventsOverlap(b, a)).toBe(true);
  });

  it('treats adjacent events (end == start) as non-overlapping', () => {
    const b = ev('b', '2025-01-01T20:00:00Z', '2025-01-01T22:00:00Z');
    expect(eventsOverlap(a, b)).toBe(false);
    expect(eventsOverlap(b, a)).toBe(false);
  });

  it('detects containment and identical ranges', () => {
    const inner = ev('i', '2025-01-01T18:30:00Z', '2025-01-01T19:00:00Z');
    expect(eventsOverlap(a, inner)).toBe(true);
    expect(eventsOverlap(inner, a)).toBe(true);
    expect(eventsOverlap(a, a)).toBe(true);
  });

  it('returns false for disjoint events and invalid dates', () => {
    expect(eventsOverlap(a, ev('b', '2025-02-01T18:00:00Z', '2025-02-01T20:00:00Z'))).toBe(false);
    expect(eventsOverlap(a, ev('b', 'nope', '2025-02-01T20:00:00Z'))).toBe(false);
  });
});

describe('generateBookingWarnings', () => {
  const target = ev('t', '2025-03-01T18:00:00Z', '2025-03-01T20:00:00Z');

  it('returns no warnings when nothing applies', () => {
    expect(
      generateBookingWarnings({ event: target, existingBookings: [], eventsById: {} }),
    ).toEqual([]);
  });

  it('warns for not_again marker only', () => {
    const w = generateBookingWarnings({
      event: target,
      speakerAdmin: { marker: 'not_again' },
      existingBookings: [],
      eventsById: {},
    });
    expect(w.map((x) => x.code)).toEqual(['SPEAKER_NOT_AGAIN']);
    expect(
      generateBookingWarnings({
        event: target,
        speakerAdmin: { marker: 'have_back' },
        existingBookings: [],
        eventsById: {},
      }),
    ).toEqual([]);
  });

  it('warns for a duplicate booking on the same event', () => {
    const w = generateBookingWarnings({
      event: target,
      existingBookings: [{ eventId: 't', status: 'proposed' }],
      eventsById: { t: target },
    });
    expect(w.map((x) => x.code)).toEqual(['DUPLICATE_BOOKING']);
  });

  it('warns for an overlapping event but not an adjacent one', () => {
    const overlapping = ev('o', '2025-03-01T19:00:00Z', '2025-03-01T21:00:00Z');
    const adjacent = ev('n', '2025-03-01T20:00:00Z', '2025-03-01T22:00:00Z');
    const w = generateBookingWarnings({
      event: target,
      existingBookings: [
        { eventId: 'o', status: 'confirmed' },
        { eventId: 'n', status: 'confirmed' },
      ],
      eventsById: { o: overlapping, n: adjacent },
    });
    expect(w.map((x) => x.code)).toEqual(['OVERLAPPING_EVENT']);
    expect(w[0].message).toContain('Event o');
  });

  it('ignores declined bookings and returns all warnings in order', () => {
    const overlapping = ev('o', '2025-03-01T19:00:00Z', '2025-03-01T21:00:00Z');
    const declined = ev('d', '2025-03-01T18:00:00Z', '2025-03-01T20:00:00Z');
    const w = generateBookingWarnings({
      event: target,
      speakerAdmin: { marker: 'not_again' },
      existingBookings: [
        { eventId: 'd', status: 'declined' },
        { eventId: 't', status: 'confirmed' },
        { eventId: 'o', status: 'proposed' },
      ],
      eventsById: { d: declined, o: overlapping },
    });
    expect(w.map((x) => x.code)).toEqual([
      'SPEAKER_NOT_AGAIN',
      'DUPLICATE_BOOKING',
      'OVERLAPPING_EVENT',
    ]);
  });
});
