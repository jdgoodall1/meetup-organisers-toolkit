import { config } from '../config';
import { Cfp, CfpStatus } from '../models';
import { deleteItem, getItem, NewItem, putItem, QueryOptions, scanAll, updateItem } from './base';

const table = () => config.tables.cfps;
const key = (cfpId: string) => ({ cfpId });

export const cfpsRepo = {
  create: (item: NewItem<Cfp>, actor: string) => putItem<Cfp>(table(), item, actor, 'cfpId'),
  get: (cfpId: string) => getItem<Cfp>(table(), key(cfpId)),
  /**
   * Optimistic concurrency: expectedUpdatedAt is required. A mismatch raises
   * ConditionalCheckFailedException (409 Conflict).
   */
  update: (cfpId: string, patch: Partial<NewItem<Cfp>>, actor: string, expectedUpdatedAt: string) =>
    updateItem<Cfp>(table(), key(cfpId), patch, actor, { expectedUpdatedAt }),
  delete: (cfpId: string) => deleteItem(table(), key(cfpId)),
  listAll: () => scanAll<Cfp>(table()),
  /**
   * CFPs with the given stored status, ordered by closesAt (soonest first;
   * standing CFPs with no closesAt come last).
   *
   * Deliberately a scan + filter rather than a Query on the StatusIndex GSI
   * (status / closesAt). A GSI only indexes items that carry its range key, so
   * standing CFPs (no closesAt) are never written to it and a Query would
   * silently omit them. Changing the GSI would force replacement of the
   * deployed table, so instead we scan: the CFP table is small (a handful of
   * CFPs per organiser) and the admin list already scans. StatusIndex stays
   * in the template, unused by this code, so no table/index change is needed.
   */
  listByStatus: async (status: CfpStatus, _options?: QueryOptions): Promise<Cfp[]> =>
    (await scanAll<Cfp>(table()))
      .filter((c) => c.status === status)
      .sort((a, b) => {
        if (a.closesAt && b.closesAt) return a.closesAt.localeCompare(b.closesAt);
        if (a.closesAt) return -1;
        if (b.closesAt) return 1;
        return 0;
      }),};
