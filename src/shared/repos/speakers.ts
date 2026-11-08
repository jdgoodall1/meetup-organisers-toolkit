import { config } from '../config';
import { Speaker } from '../models';
import { deleteItem, getItem, NewItem, putItem, queryAll, scanAll, updateItem } from './base';

const table = () => config.tables.speakers;
const key = (speakerId: string) => ({ speakerId });

export const speakersRepo = {
  create: (item: NewItem<Speaker>, actor: string) =>
    putItem<Speaker>(table(), item, actor, 'speakerId'),
  get: (speakerId: string) => getItem<Speaker>(table(), key(speakerId)),
  update: (
    speakerId: string,
    patch: Partial<NewItem<Speaker>>,
    actor: string,
    expectedUpdatedAt?: string,
  ) => updateItem<Speaker>(table(), key(speakerId), patch, actor, { expectedUpdatedAt }),
  delete: (speakerId: string) => deleteItem(table(), key(speakerId)),
  listAll: () => scanAll<Speaker>(table()),
  /** GSI UserIdIndex: profiles linked to a Cognito user. */
  listByUserId: (userId: string) =>
    queryAll<Speaker>(table(), 'UserIdIndex', 'userId', userId),
  getByUserId: async (userId: string) =>
    (await queryAll<Speaker>(table(), 'UserIdIndex', 'userId', userId, { limit: 1 }))[0],
};
