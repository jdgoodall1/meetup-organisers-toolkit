import * as fc from 'fast-check';
import { eventsOverlap } from '../src/shared/booking-logic';

const MIN = Date.UTC(2000, 0, 1);
const MAX = Date.UTC(2100, 0, 1);

const instantArb = fc.integer({ min: MIN, max: MAX });
const range = (start: number, end: number) => ({
  startDateTime: new Date(start).toISOString(),
  endDateTime: new Date(end).toISOString(),
});
// Arbitrary (possibly zero or negative duration) range
const anyRangeArb = fc.tuple(instantArb, instantArb).map(([s, e]) => range(s, e));

describe('eventsOverlap properties', () => {
  // **Validates: Requirements 10.6**
  it('is symmetric', () => {
    fc.assert(
      fc.property(anyRangeArb, anyRangeArb, (a, b) => {
        expect(eventsOverlap(a, b)).toBe(eventsOverlap(b, a));
      }),
    );
  });

  // **Validates: Requirements 10.6**
  it('adjacent events (end == start) never overlap', () => {
    fc.assert(
      fc.property(instantArb, instantArb, instantArb, (s, mid, e) => {
        const [x, y, z] = [s, mid, e].sort((p, q) => p - q);
        const a = range(x, y);
        const b = range(y, z);
        expect(eventsOverlap(a, b)).toBe(false);
        expect(eventsOverlap(b, a)).toBe(false);
      }),
    );
  });

  // **Validates: Requirements 10.6**
  it('an event with positive duration overlaps itself', () => {
    fc.assert(
      fc.property(instantArb, fc.integer({ min: 1, max: 1_000_000_000 }), (s, d) => {
        const a = range(s, s + d);
        expect(eventsOverlap(a, a)).toBe(true);
      }),
    );
  });
});
