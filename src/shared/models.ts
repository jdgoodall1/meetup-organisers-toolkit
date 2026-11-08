// Entity types for the CFP and speaker toolkit.
// All timestamps are ISO-8601 UTC strings. All IDs are UUID v4 strings.

// ---------------------------------------------------------------------------
// Common
// ---------------------------------------------------------------------------

/** ISO-8601 UTC timestamp, e.g. "2025-01-31T18:30:00.000Z". */
export type IsoDateString = string;

/** Audit fields carried by every stored item. */
export interface AuditFields {
  createdAt: IsoDateString;
  createdBy: string;
  updatedAt: IsoDateString;
  updatedBy: string;
}

export type UserRole = 'admin' | 'speaker';

// ---------------------------------------------------------------------------
// Status and type unions
// ---------------------------------------------------------------------------

export type EventStatus = 'draft' | 'scheduled' | 'completed' | 'cancelled';
export type SpeakerMarker = 'have_back' | 'not_again';
export type CfpStatus = 'draft' | 'open' | 'closed';
export type QuestionType =
  | 'short_text'
  | 'long_text'
  | 'single_select'
  | 'multi_select'
  | 'number'
  | 'yes_no';
export type SubmissionStatus =
  | 'draft'
  | 'submitted'
  | 'shortlisted'
  | 'accepted'
  | 'rejected'
  | 'withdrawn';
export type BookingStatus = 'proposed' | 'confirmed' | 'declined';

/** Status values shown to speakers (shortlisted is never revealed). */
export type SpeakerFacingStatus =
  | 'Draft'
  | 'Under review'
  | 'Accepted'
  | 'Not selected'
  | 'Withdrawn';

/** Booking warning codes returned in a 409 response. */
export type BookingWarningCode =
  | 'SPEAKER_NOT_AGAIN'
  | 'DUPLICATE_BOOKING'
  | 'OVERLAPPING_EVENT';

export interface BookingWarning {
  code: BookingWarningCode;
  message: string;
}

// ---------------------------------------------------------------------------
// EventsTable (PK eventId; GSI StatusDateIndex: status / startDateTime)
// ---------------------------------------------------------------------------

export interface Event extends AuditFields {
  eventId: string;
  title: string;
  startDateTime: IsoDateString;
  endDateTime: IsoDateString;
  location: string;
  isOnline: boolean;
  description: string;
  format: string;
  status: EventStatus;
  cfpId?: string;
}

// ---------------------------------------------------------------------------
// SpeakersTable (PK speakerId; GSI UserIdIndex: userId) - speaker-visible
// ---------------------------------------------------------------------------

export interface PastTalk {
  title: string;
  event?: string;
  date?: string;
  url?: string;
}

export interface Speaker extends AuditFields {
  speakerId: string;
  /** Cognito sub; absent for profiles created by an admin and not yet linked. */
  userId?: string;
  name: string;
  bio: string;
  headshotKey?: string;
  location: string;
  topics: string[];
  links: string[];
  pastTalks: PastTalk[];
}

// ---------------------------------------------------------------------------
// SpeakerAdminTable (PK speakerId) - admin-only
// ---------------------------------------------------------------------------

export interface SpeakerAdmin extends AuditFields {
  speakerId: string;
  marker?: SpeakerMarker;
  markerNote?: string;
  markerChangedBy?: string;
  markerChangedAt?: IsoDateString;
  adminNotes?: string;
}

// ---------------------------------------------------------------------------
// CfpsTable (PK cfpId; GSI StatusIndex: status / closesAt)
// ---------------------------------------------------------------------------

export interface CfpQuestion {
  questionId: string;
  type: QuestionType;
  label: string;
  helpText?: string;
  required: boolean;
  /** Required (at least 2) for single_select and multi_select. */
  options?: string[];
  order: number;
}

export interface Cfp extends AuditFields {
  cfpId: string;
  title: string;
  description: string;
  /** Optional. When absent the CFP is open as soon as it is published. */
  opensAt?: IsoDateString;
  /** Optional. When absent the CFP is a standing CFP that stays open until an admin closes it. */
  closesAt?: IsoDateString;
  status: CfpStatus;
  /** Embedded, ordered list of questions. */
  questions: CfpQuestion[];
}

// ---------------------------------------------------------------------------
// QuestionTemplatesTable (PK templateId)
// ---------------------------------------------------------------------------

export interface QuestionTemplate extends AuditFields {
  templateId: string;
  name: string;
  questions: CfpQuestion[];
}

// ---------------------------------------------------------------------------
// SubmissionsTable (PK submissionId; GSIs CfpIndex, SpeakerIndex)
// ---------------------------------------------------------------------------

export type AnswerValue = string | number | boolean | string[];

/** Answer with a snapshot of the question label and type (Req 7.9). */
export interface SubmissionAnswer {
  questionLabel: string;
  questionType: QuestionType;
  value: AnswerValue;
}

export interface Submission extends AuditFields {
  submissionId: string;
  cfpId: string;
  speakerId: string;
  status: SubmissionStatus;
  talkTitle: string;
  abstract: string;
  /** Upper bound of the chosen length band (15, 30, 45 or 60). Older items may hold other values. */
  durationMinutes: number;
  /** Talk level: 100 (introductory) to 500 (expert). Required to submit; absent on older items. */
  level?: number;
  /** Map of questionId to answer. */
  answers: Record<string, SubmissionAnswer>;
}

// ---------------------------------------------------------------------------
// SubmissionReviewsTable (PK submissionId, SK adminUserId) - admin-only
// ---------------------------------------------------------------------------

export interface SubmissionReview extends AuditFields {
  submissionId: string;
  adminUserId: string;
  /** Integer 1 to 5. */
  rating: number;
  notes: string;
}

// ---------------------------------------------------------------------------
// BookingsTable (PK bookingId; GSIs EventIndex, SpeakerIndex)
// ---------------------------------------------------------------------------

export interface Booking extends AuditFields {
  bookingId: string;
  eventId: string;
  /** Null after the speaker deletes their account (Req 11.5). */
  speakerId: string | null;
  submissionId?: string;
  status: BookingStatus;
  speakerNameSnapshot: string;
}
