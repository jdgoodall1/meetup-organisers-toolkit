import { config } from '../config';
import { Booking } from '../models';
import { deleteItem, getItem, NewItem, putItem, queryAll, QueryOptions, scanAll, updateItem } from './base';

export const FORMER_SPEAKER_NAME = 'Former speaker';

const table = () => config.tables.bookings;
const key = (bookingId: string) => ({ bookingId });

export const bookingsRepo = {
  create: (item: NewItem<Booking>, actor: string) =>
    putItem<Booking>(table(), item, actor, 'bookingId'),
  get: (bookingId: string) => getItem<Booking>(table(), key(bookingId)),
  update: (
    bookingId: string,
    patch: Partial<NewItem<Booking>>,
    actor: string,
    expectedUpdatedAt?: string,
  ) => updateItem<Booking>(table(), key(bookingId), patch, actor, { expectedUpdatedAt }),
  delete: (bookingId: string) => deleteItem(table(), key(bookingId)),
  /**
   * Account deletion (Req 11.5): detach a booking from its speaker. The
   * speakerId attribute is removed (it is a GSI key, which cannot hold NULL), so
   * it reads back as null/absent and the booking leaves SpeakerIndex.
   */
  anonymise: (bookingId: string, actor: string) =>
    updateItem<Booking>(
      table(),
      key(bookingId),
      { speakerId: undefined, speakerNameSnapshot: FORMER_SPEAKER_NAME },
      actor,
    ),
  /** Every booking (admin overview). A scan is fine at this table's size. */
  listAll: () => scanAll<Booking>(table()),
  /** GSI EventIndex. */
  listByEvent: (eventId: string, options?: QueryOptions) =>
    queryAll<Booking>(table(), 'EventIndex', 'eventId', eventId, options),
  /** GSI SpeakerIndex, ordered by createdAt. */
  listBySpeaker: (speakerId: string, options?: QueryOptions) =>
    queryAll<Booking>(table(), 'SpeakerIndex', 'speakerId', speakerId, options),
};
