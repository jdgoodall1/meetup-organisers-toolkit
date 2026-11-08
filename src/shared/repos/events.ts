import { config } from '../config';
import { Event, EventStatus } from '../models';
import { deleteItem, getItem, NewItem, putItem, queryAll, QueryOptions, scanAll, updateItem } from './base';

const table = () => config.tables.events;
const key = (eventId: string) => ({ eventId });

export const eventsRepo = {
  create: (item: NewItem<Event>, actor: string) => putItem<Event>(table(), item, actor, 'eventId'),
  get: (eventId: string) => getItem<Event>(table(), key(eventId)),
  update: (
    eventId: string,
    patch: Partial<NewItem<Event>>,
    actor: string,
    expectedUpdatedAt?: string,
  ) => updateItem<Event>(table(), key(eventId), patch, actor, { expectedUpdatedAt }),
  delete: (eventId: string) => deleteItem(table(), key(eventId)),
  listAll: () => scanAll<Event>(table()),
  /** GSI StatusDateIndex, ordered by startDateTime. */
  listByStatus: (status: EventStatus, options?: QueryOptions) =>
    queryAll<Event>(table(), 'StatusDateIndex', 'status', status, options),
};
