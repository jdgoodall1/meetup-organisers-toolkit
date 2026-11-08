// Pure booking logic: overlap detection and warning generation (no AWS/IO).
// Warnings are soft: the handler returns 409 with them unless confirmWarnings
// is set (Req 5.5, 5.7, 10.5, 10.6).

import type {
  Booking,
  BookingWarning,
  Event,
  SpeakerAdmin,
} from './models';

type TimeRange = Pick<Event, 'startDateTime' | 'endDateTime'>;

/**
 * True when two events share any time. Intervals are half-open
 * [start, end), so adjacent events (end == start) do not overlap.
 * Symmetric in its arguments. Unparseable dates never overlap.
 */
export function eventsOverlap(a: TimeRange, b: TimeRange): boolean {
  const aStart = Date.parse(a.startDateTime);
  const aEnd = Date.parse(a.endDateTime);
  const bStart = Date.parse(b.startDateTime);
  const bEnd = Date.parse(b.endDateTime);
  if ([aStart, aEnd, bStart, bEnd].some(Number.isNaN)) return false;
  return aStart < bEnd && bStart < aEnd;
}

export interface BookingWarningInput {
  /** The event being booked onto. */
  event: Pick<Event, 'eventId' | 'title' | 'startDateTime' | 'endDateTime'>;
  /** The speaker's marker record, if any (admin-only data). */
  speakerAdmin?: Pick<SpeakerAdmin, 'marker'> | null;
  /** The speaker's existing bookings (any event). Declined ones are ignored. */
  existingBookings: Array<Pick<Booking, 'eventId' | 'status'>>;
  /** Events referenced by existingBookings, for overlap checks. */
  eventsById: Record<string, Pick<Event, 'eventId' | 'title' | 'startDateTime' | 'endDateTime'>>;
}

/**
 * Builds the soft warnings for creating a booking. Returns an empty array
 * when none apply. Order: SPEAKER_NOT_AGAIN, DUPLICATE_BOOKING, then one
 * OVERLAPPING_EVENT per overlapping event (in input order).
 */
export function generateBookingWarnings(input: BookingWarningInput): BookingWarning[] {
  const { event, speakerAdmin, existingBookings, eventsById } = input;
  const warnings: BookingWarning[] = [];

  if (speakerAdmin?.marker === 'not_again') {
    warnings.push({
      code: 'SPEAKER_NOT_AGAIN',
      message: 'This speaker is marked "not again".',
    });
  }

  const active = existingBookings.filter((b) => b.status !== 'declined');

  if (active.some((b) => b.eventId === event.eventId)) {
    warnings.push({
      code: 'DUPLICATE_BOOKING',
      message: 'This speaker already has a booking on this event.',
    });
  }

  const seen = new Set<string>();
  for (const b of active) {
    if (b.eventId === event.eventId || seen.has(b.eventId)) continue;
    seen.add(b.eventId);
    const other = eventsById[b.eventId];
    if (other && eventsOverlap(event, other)) {
      warnings.push({
        code: 'OVERLAPPING_EVENT',
        message: `This speaker is already booked on "${other.title}", which overlaps in time with this event.`,
      });
    }
  }

  return warnings;
}
