import { config } from '../config';
import { SubmissionReview } from '../models';
import { deleteItem, getItem, queryAll, upsertItem } from './base';

const table = () => config.tables.submissionReviews;
const key = (submissionId: string, adminUserId: string) => ({ submissionId, adminUserId });

// Admin-only data. Only admin-facing handlers should import this repo.
export const submissionReviewsRepo = {
  get: (submissionId: string, adminUserId: string) =>
    getItem<SubmissionReview>(table(), key(submissionId, adminUserId)),
  /** One review per admin per submission; creates or replaces rating and notes. */
  upsert: (submissionId: string, adminUserId: string, fields: { rating: number; notes: string }) =>
    upsertItem<SubmissionReview>(
      table(),
      key(submissionId, adminUserId),
      { ...fields, submissionId, adminUserId },
      adminUserId,
    ),
  delete: (submissionId: string, adminUserId: string) =>
    deleteItem(table(), key(submissionId, adminUserId)),
  /** All reviews for a submission (table partition key). */
  listBySubmission: (submissionId: string) =>
    queryAll<SubmissionReview>(table(), undefined, 'submissionId', submissionId),
};
