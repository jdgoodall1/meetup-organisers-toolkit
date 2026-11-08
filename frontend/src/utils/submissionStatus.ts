import type { SubmissionStatus } from '../services/apiTypes';

export const SUBMISSION_STATUSES: SubmissionStatus[] = [
  'draft',
  'submitted',
  'shortlisted',
  'accepted',
  'rejected',
  'withdrawn',
];
