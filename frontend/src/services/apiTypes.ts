// Types mirroring the backend models (src/shared/models.ts) and handler response shapes.

export type IsoDateString = string;

export interface AuditFields {
  createdAt: IsoDateString;
  createdBy: string;
  updatedAt: IsoDateString;
  updatedBy: string;
}

export type UserRole = 'admin' | 'speaker';
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
export type SpeakerFacingStatus =
  | 'Draft'
  | 'Under review'
  | 'Accepted'
  | 'Not selected'
  | 'Withdrawn';
export type BookingWarningCode = 'SPEAKER_NOT_AGAIN' | 'DUPLICATE_BOOKING' | 'OVERLAPPING_EVENT';

export interface BookingWarning {
  code: BookingWarningCode;
  message: string;
}

// ---- Entities ----

export interface EventItem extends AuditFields {
  eventId: string;
  title: string;
  startDateTime: IsoDateString;
  endDateTime: IsoDateString;
  location: string;
  isOnline: boolean;
  description: string;
  format: string;
  status: EventStatus;
}

export interface EventInput {
  title: string;
  startDateTime: IsoDateString;
  endDateTime: IsoDateString;
  location?: string;
  isOnline?: boolean;
  description?: string;
  format?: string;
  status?: EventStatus;
}

export interface PastTalk {
  title: string;
  event?: string;
  date?: string;
  url?: string;
}

export interface Speaker extends AuditFields {
  speakerId: string;
  userId?: string;
  name: string;
  bio: string;
  headshotKey?: string;
  /** Short-lived signed GET URL. */
  headshotUrl?: string;
  location: string;
  topics: string[];
  links: string[];
  pastTalks: PastTalk[];
}

export interface SpeakerProfileInput {
  name: string;
  bio?: string;
  location?: string;
  topics?: string[];
  links?: string[];
  pastTalks?: PastTalk[];
  /** Key returned by the headshot-url route; null or '' clears it. */
  headshotKey?: string | null;
  /** Optimistic concurrency token. */
  updatedAt?: IsoDateString;
}

/** GET /me/profile before a profile exists. */
export interface EmptySpeakerProfile {
  exists: false;
  name: string;
  bio: string;
  location: string;
  topics: string[];
  links: string[];
  pastTalks: PastTalk[];
}

export type MyProfile = Speaker | EmptySpeakerProfile;

export interface HeadshotUploadRequest {
  contentType: string;
  size: number;
}

/** Presigned POST: send `fields` plus the file as multipart form data to `url`. */
export interface HeadshotUpload {
  url: string;
  fields: Record<string, string>;
  key: string;
  expiresInSeconds: number;
}

export interface SpeakerAdmin extends AuditFields {
  speakerId: string;
  marker?: SpeakerMarker;
  markerNote?: string;
  markerChangedBy?: string;
  markerChangedAt?: IsoDateString;
  adminNotes?: string;
}

export interface SpeakerSummary {
  speakerId: string;
  userId?: string;
  name: string;
  location: string;
  topics: string[];
  linked: boolean;
  marker?: SpeakerMarker;
  markerNote?: string;
}

export interface SpeakerSearchParams {
  q?: string;
  topic?: string;
  location?: string;
  marker?: SpeakerMarker | 'none';
}

export interface SpeakerDetail {
  speaker: Speaker;
  admin: SpeakerAdmin | null;
  submissions: Submission[];
  bookings: Booking[];
  /** Email of the linked account, when linked and the lookup worked. */
  linkedEmail?: string | null;
}

export interface MarkerInput {
  marker: SpeakerMarker | 'unset';
  markerNote?: string | null;
}

export interface CfpQuestion {
  questionId: string;
  type: QuestionType;
  label: string;
  helpText?: string;
  required: boolean;
  options?: string[];
  order: number;
}

/** Question as sent to the server; questionId is generated when omitted, order follows array position. */
export interface CfpQuestionInput {
  questionId?: string;
  type: QuestionType;
  label: string;
  helpText?: string;
  required?: boolean;
  options?: string[];
}

export interface Cfp extends AuditFields {
  cfpId: string;
  title: string;
  description: string;
  /** Optional: when absent the CFP is open as soon as it is published. */
  opensAt?: IsoDateString;
  /** Optional: when absent this is a standing CFP that stays open until an admin closes it. */
  closesAt?: IsoDateString;
  status: CfpStatus;
  questions: CfpQuestion[];
}

/** Admin CFP views add the status derived from the open and close dates. */
export interface AdminCfp extends Cfp {
  effectiveStatus: CfpStatus;
}

export interface CfpInput {
  title: string;
  description?: string;
  /** Omit or send null/empty to clear. */
  opensAt?: IsoDateString | null;
  /** Omit or send null/empty for a standing CFP (no close date). */
  closesAt?: IsoDateString | null;
  status?: CfpStatus;
  questions?: CfpQuestionInput[];
  updatedAt?: IsoDateString;
}

export interface DuplicateCfpInput {
  title?: string;
  opensAt?: IsoDateString;
  closesAt?: IsoDateString;
}

export interface QuestionTemplate extends AuditFields {
  templateId: string;
  name: string;
  questions: CfpQuestion[];
}

/** Provide either `questions` or `cfpId` (save that CFP's current questions). */
export interface TemplateInput {
  name: string;
  questions?: CfpQuestionInput[];
  cfpId?: string;
}

export interface ApplyTemplateInput {
  templateId: string;
  mode?: 'append' | 'replace';
  updatedAt?: IsoDateString;
}

/** Speaker-facing CFP projection. */
export interface SpeakerCfp {
  cfpId: string;
  title: string;
  description: string;
  opensAt?: IsoDateString;
  /** Absent for a standing CFP: shown as open until further notice. */
  closesAt?: IsoDateString;
  questions: CfpQuestion[];
}

export type AnswerValue = string | number | boolean | string[];

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
  durationMinutes: number;
  /** 100 (introductory) to 500 (expert); absent on older submissions. */
  level?: number;
  answers: Record<string, SubmissionAnswer>;
}

/** Speaker-facing submission projection (no audit fields, simplified status). */
export interface SpeakerSubmission {
  submissionId: string;
  cfpId: string;
  status: SpeakerFacingStatus;
  talkTitle: string;
  abstract: string;
  durationMinutes: number;
  level?: number;
  answers: Record<string, SubmissionAnswer>;
  createdAt: IsoDateString;
  updatedAt: IsoDateString;
}

export interface SubmissionInput {
  talkTitle?: string;
  abstract?: string;
  durationMinutes?: number;
  level?: number;
  /** Map of questionId to answer value; replaces the whole map when sent. */
  answers?: Record<string, AnswerValue>;
  updatedAt?: IsoDateString;
}

export interface CreateSubmissionInput extends SubmissionInput {
  cfpId: string;
}

export interface AdminSubmissionListItem {
  submissionId: string;
  cfpId: string;
  speakerId: string;
  speakerName: string | null;
  status: SubmissionStatus;
  talkTitle: string;
  durationMinutes: number;
  level?: number | null;
  createdAt: IsoDateString;
  updatedAt: IsoDateString;
  marker: SpeakerMarker | null;
  markerNote: string | null;
  averageRating: number | null;
  ratingCount: number;
}

export interface ReviewEntry {
  adminUserId: string;
  rating: number;
  notes: string;
  updatedAt: IsoDateString;
}

export interface AdminSubmissionDetail extends Submission {
  speaker: {
    speakerId: string;
    name: string;
    bio: string;
    location: string;
    topics: string[];
    links: string[];
    pastTalks: PastTalk[];
    headshotKey?: string;
  } | null;
  marker: SpeakerMarker | null;
  markerNote: string | null;
  averageRating: number | null;
  ratingCount: number;
  reviews: ReviewEntry[];
}

export interface ReviewInput {
  /** Integer 1 to 5. */
  rating: number;
  notes?: string;
}

export interface Booking extends AuditFields {
  bookingId: string;
  eventId: string;
  speakerId: string | null;
  submissionId?: string;
  status: BookingStatus;
  speakerNameSnapshot: string;
}

export interface BookingInput {
  eventId: string;
  speakerId: string;
  status?: BookingStatus;
  submissionId?: string | null;
  confirmWarnings?: boolean;
}

export interface BookingUpdate {
  status?: BookingStatus;
  submissionId?: string | null;
  updatedAt?: IsoDateString;
}

export interface BookingQuery {
  eventId?: string;
  speakerId?: string;
}

export interface SpeakerBooking {
  bookingId: string;
  eventId: string;
  status: BookingStatus;
  event: {
    eventId: string;
    title: string;
    startDateTime: IsoDateString;
    endDateTime: IsoDateString;
    location: string;
    isOnline: boolean;
    description: string;
    format: string;
  } | null;
}

export interface Identity {
  userId: string;
  email: string;
  groups: string[];
  role: UserRole;
}

export interface AdminUser {
  userId: string;
  username: string;
  email: string;
  status?: string;
  enabled?: boolean;
  groups: string[];
  createdAt?: IsoDateString;
}

export interface InvitedUser {
  userId: string;
  username: string;
  email: string;
  groups: string[];
}

export interface EventQuery {
  status?: EventStatus;
  from?: IsoDateString;
  to?: IsoDateString;
}

export type SubmissionFilter = SubmissionStatus | 'all';

// ---- Result model ----

export interface ApiErrorBody {
  code: string;
  message: string;
  /** Field name to message, for VALIDATION_ERROR. */
  fields?: Record<string, string>;
}

export interface ApiSuccess<T> {
  ok: true;
  status: number;
  data: T;
}

/** Any non-2xx response, or a network failure (status 0, code NETWORK_ERROR). */
export interface ApiFailure {
  ok: false;
  kind: 'error';
  status: number;
  error: ApiErrorBody;
}

/** 409 BOOKING_WARNINGS: resubmit with confirmWarnings: true to proceed. */
export interface ApiBookingWarnings {
  ok: false;
  kind: 'booking_warnings';
  status: 409;
  message: string;
  warnings: BookingWarning[];
}

/** 409 CONFIRM_REQUIRED: repeat the request with confirm: true to proceed. */
export interface ApiConfirmRequired {
  ok: false;
  kind: 'confirm_required';
  status: 409;
  message: string;
  warnings: string[];
}

export type ApiResult<T> =
  | ApiSuccess<T>
  | ApiFailure
  | ApiBookingWarnings
  | ApiConfirmRequired;
