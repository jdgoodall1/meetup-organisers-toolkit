import { config } from '../config';
import { SpeakerAdmin } from '../models';
import { deleteItem, getItem, NewItem, scanAll, upsertItem } from './base';

const table = () => config.tables.speakerAdmin;
const key = (speakerId: string) => ({ speakerId });

// Admin-only data. Only admin-facing handlers should import this repo.
export const speakerAdminRepo = {
  get: (speakerId: string) => getItem<SpeakerAdmin>(table(), key(speakerId)),
  /** Create or update the record for a speaker. */
  upsert: (
    speakerId: string,
    fields: Partial<Omit<NewItem<SpeakerAdmin>, 'speakerId'>>,
    actor: string,
    removeAttrs: string[] = [],
  ) => upsertItem<SpeakerAdmin>(table(), key(speakerId), { ...fields, speakerId }, actor, removeAttrs),
  delete: (speakerId: string) => deleteItem(table(), key(speakerId)),
  listAll: () => scanAll<SpeakerAdmin>(table()),
};
