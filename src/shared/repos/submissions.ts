import { config } from '../config';
import { Submission } from '../models';
import { deleteItem, getItem, NewItem, putItem, queryAll, QueryOptions, updateItem } from './base';

const table = () => config.tables.submissions;
const key = (submissionId: string) => ({ submissionId });

export const submissionsRepo = {
  create: (item: NewItem<Submission>, actor: string) =>
    putItem<Submission>(table(), item, actor, 'submissionId'),
  get: (submissionId: string) => getItem<Submission>(table(), key(submissionId)),
  /**
   * Optimistic concurrency: expectedUpdatedAt is required. A mismatch raises
   * ConditionalCheckFailedException (409 Conflict).
   */
  update: (
    submissionId: string,
    patch: Partial<NewItem<Submission>>,
    actor: string,
    expectedUpdatedAt: string,
  ) => updateItem<Submission>(table(), key(submissionId), patch, actor, { expectedUpdatedAt }),
  delete: (submissionId: string) => deleteItem(table(), key(submissionId)),
  /** GSI CfpIndex, ordered by createdAt. */
  listByCfp: (cfpId: string, options?: QueryOptions) =>
    queryAll<Submission>(table(), 'CfpIndex', 'cfpId', cfpId, options),
  /** GSI SpeakerIndex, ordered by createdAt. */
  listBySpeaker: (speakerId: string, options?: QueryOptions) =>
    queryAll<Submission>(table(), 'SpeakerIndex', 'speakerId', speakerId, options),
};
