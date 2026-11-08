import { fetchAuthSession } from 'aws-amplify/auth';
import { API_BASE_URL } from '../config/env';
import type {
  AdminCfp,
  AdminSubmissionDetail,
  AdminSubmissionListItem,
  AdminUser,
  ApiBookingWarnings,
  ApiConfirmRequired,
  ApiFailure,
  ApiResult,
  ApplyTemplateInput,
  Booking,
  BookingInput,
  BookingQuery,
  BookingUpdate,
  Cfp,
  CfpInput,
  CfpQuestionInput,
  CreateSubmissionInput,
  DuplicateCfpInput,
  EventInput,
  EventItem,
  EventQuery,
  HeadshotUpload,
  HeadshotUploadRequest,
  Identity,
  InvitedUser,
  MarkerInput,
  MyProfile,
  QuestionTemplate,
  ReviewInput,
  Speaker,
  SpeakerAdmin,
  SpeakerBooking,
  SpeakerCfp,
  SpeakerDetail,
  SpeakerProfileInput,
  SpeakerSearchParams,
  SpeakerSubmission,
  SpeakerSummary,
  SubmissionFilter,
  SubmissionInput,
  SubmissionStatus,
  TemplateInput,
  UserRole,
  BookingWarning,
} from './apiTypes';

export * from './apiTypes';

export type TokenProvider = () => Promise<string | undefined>;

/** ID token from the Amplify session, falling back to the one AuthContext stores. */
export const defaultTokenProvider: TokenProvider = async () => {
  try {
    const session = await fetchAuthSession();
    const token = session.tokens?.idToken?.toString();
    if (token) return token;
  } catch {
    // fall through to the stored token
  }
  return localStorage.getItem('idToken') || undefined;
};

type Query = Record<string, string | boolean | undefined>;

interface RequestOptions {
  method?: string;
  body?: unknown;
  query?: Query;
}

const enc = encodeURIComponent;

function buildQuery(query?: Query): string {
  if (!query) return '';
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== '') params.set(k, String(v));
  }
  const s = params.toString();
  return s ? `?${s}` : '';
}

function failure(status: number, code: string, message: string, fields?: Record<string, string>): ApiFailure {
  return { ok: false, kind: 'error', status, error: { code, message, ...(fields ? { fields } : {}) } };
}

export interface ApiClientOptions {
  baseUrl?: string;
  getToken?: TokenProvider;
}

export function createApiClient(options: ApiClientOptions = {}) {
  const baseUrl = (options.baseUrl ?? API_BASE_URL).replace(/\/+$/, '');
  const getToken = options.getToken ?? defaultTokenProvider;

  async function request<T>(path: string, opts: RequestOptions = {}): Promise<ApiResult<T>> {
    const headers: Record<string, string> = {};
    if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
    const token = await getToken();
    if (token) headers.Authorization = `Bearer ${token}`;

    let response: Response;
    try {
      response = await fetch(`${baseUrl}${path}${buildQuery(opts.query)}`, {
        method: opts.method ?? 'GET',
        headers,
        ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
      });
    } catch {
      return failure(0, 'NETWORK_ERROR', 'Could not reach the server. Check your connection and try again.');
    }

    const text = await response.text();
    let json: unknown;
    if (text) {
      try {
        json = JSON.parse(text);
      } catch {
        json = undefined;
      }
    }

    if (response.ok) {
      return { ok: true, status: response.status, data: json as T };
    }

    const obj = (json && typeof json === 'object' ? json : {}) as {
      error?: { code?: string; message?: string; fields?: Record<string, string>; warnings?: unknown[] };
      warnings?: BookingWarning[];
    };
    const err = obj.error;
    const code = err?.code ?? `HTTP_${response.status}`;
    const message = err?.message ?? (response.statusText || 'Request failed');

    if (response.status === 409 && code === 'BOOKING_WARNINGS') {
      const warnings = (obj.warnings ?? err?.warnings ?? []) as BookingWarning[];
      const result: ApiBookingWarnings = { ok: false, kind: 'booking_warnings', status: 409, message, warnings };
      return result;
    }
    if (response.status === 409 && code === 'CONFIRM_REQUIRED') {
      const result: ApiConfirmRequired = {
        ok: false,
        kind: 'confirm_required',
        status: 409,
        message,
        warnings: (err?.warnings ?? []) as string[],
      };
      return result;
    }
    return failure(response.status, code, message, err?.fields);
  }

  const confirmQuery = (confirm?: boolean): Query => (confirm ? { confirm: true } : {});

  return {
    request,

    // ---- Identity ----
    getMe: () => request<Identity>('/me'),
    /** Deletes the speaker's account and data. */
    deleteMyAccount: () => request<{ deleted: true }>('/me', { method: 'DELETE' }),

    // ---- Events (admin) ----
    listEvents: async (query: EventQuery = {}) => {
      const r = await request<{ events: EventItem[] }>('/admin/events', { query: { ...query } });
      return r.ok ? { ...r, data: r.data.events } : r;
    },
    getEvent: (id: string) => request<EventItem>(`/admin/events/${enc(id)}`),
    createEvent: (input: EventInput) => request<EventItem>('/admin/events', { method: 'POST', body: input }),
    updateEvent: (id: string, input: Partial<EventInput> & { updatedAt?: string }) =>
      request<EventItem>(`/admin/events/${enc(id)}`, { method: 'PUT', body: input }),
    /** Without confirm, an event with bookings returns kind 'confirm_required'. */
    deleteEvent: (id: string, confirm = false) =>
      request<undefined>(`/admin/events/${enc(id)}`, { method: 'DELETE', query: confirmQuery(confirm) }),

    // ---- Speaker: own profile ----
    getMyProfile: () => request<MyProfile>('/me/profile'),
    saveMyProfile: (input: SpeakerProfileInput) => request<Speaker>('/me/profile', { method: 'PUT', body: input }),
    requestHeadshotUpload: (input: HeadshotUploadRequest) =>
      request<HeadshotUpload>('/me/profile/headshot-url', { method: 'POST', body: input }),

    // ---- Admin: speakers ----
    listSpeakers: async (params: SpeakerSearchParams = {}) => {
      const r = await request<{ items: SpeakerSummary[]; count: number }>('/admin/speakers', {
        query: { ...params },
      });
      return r.ok ? { ...r, data: r.data.items } : r;
    },
    getSpeaker: (id: string) => request<SpeakerDetail>(`/admin/speakers/${enc(id)}`),
    createSpeaker: (input: SpeakerProfileInput) => request<Speaker>('/admin/speakers', { method: 'POST', body: input }),
    updateSpeaker: (id: string, input: SpeakerProfileInput) =>
      request<Speaker>(`/admin/speakers/${enc(id)}`, { method: 'PUT', body: input }),
    requestSpeakerHeadshotUpload: (id: string, input: HeadshotUploadRequest) =>
      request<HeadshotUpload>(`/admin/speakers/${enc(id)}/headshot-url`, { method: 'POST', body: input }),
    /** Links a profile to the account with this email address. */
    linkSpeaker: (id: string, email: string) =>
      request<Speaker>(`/admin/speakers/${enc(id)}/link`, { method: 'POST', body: { email } }),
    setSpeakerMarker: (id: string, input: MarkerInput) =>
      request<SpeakerAdmin>(`/admin/speakers/${enc(id)}/marker`, { method: 'PUT', body: input }),
    setSpeakerNotes: (id: string, adminNotes: string) =>
      request<SpeakerAdmin>(`/admin/speakers/${enc(id)}/notes`, { method: 'PUT', body: { adminNotes } }),

    // ---- Admin: CFPs, questions, templates ----
    listCfps: async (status?: Cfp['status']) => {
      const r = await request<{ cfps: AdminCfp[] }>('/admin/cfps', { query: { status } });
      return r.ok ? { ...r, data: r.data.cfps } : r;
    },
    getCfp: (id: string) => request<AdminCfp>(`/admin/cfps/${enc(id)}`),
    createCfp: (input: CfpInput) => request<Cfp>('/admin/cfps', { method: 'POST', body: input }),
    updateCfp: (id: string, input: Partial<CfpInput>) =>
      request<Cfp>(`/admin/cfps/${enc(id)}`, { method: 'PUT', body: input }),
    /** Without confirm, a CFP with submissions returns kind 'confirm_required'. */
    deleteCfp: (id: string, confirm = false) =>
      request<undefined>(`/admin/cfps/${enc(id)}`, { method: 'DELETE', query: confirmQuery(confirm) }),
    duplicateCfp: (id: string, input: DuplicateCfpInput = {}) =>
      request<Cfp>(`/admin/cfps/${enc(id)}/duplicate`, { method: 'POST', body: input }),
    /** Replaces the ordered question list. May return 'confirm_required' when answers exist. */
    replaceCfpQuestions: (id: string, questions: CfpQuestionInput[], opts: { confirm?: boolean; updatedAt?: string } = {}) =>
      request<Cfp>(`/admin/cfps/${enc(id)}/questions`, {
        method: 'PUT',
        body: { questions, ...(opts.updatedAt ? { updatedAt: opts.updatedAt } : {}) },
        query: confirmQuery(opts.confirm),
      }),
    listTemplates: async () => {
      const r = await request<{ templates: QuestionTemplate[] }>('/admin/templates');
      return r.ok ? { ...r, data: r.data.templates } : r;
    },
    createTemplate: (input: TemplateInput) =>
      request<QuestionTemplate>('/admin/templates', { method: 'POST', body: input }),
    deleteTemplate: (id: string) => request<undefined>(`/admin/templates/${enc(id)}`, { method: 'DELETE' }),
    applyTemplate: (cfpId: string, input: ApplyTemplateInput, confirm = false) =>
      request<Cfp>(`/admin/cfps/${enc(cfpId)}/apply-template`, {
        method: 'POST',
        body: input,
        query: confirmQuery(confirm),
      }),

    // ---- Speaker: open CFPs ----
    listOpenCfps: async () => {
      const r = await request<{ cfps: SpeakerCfp[] }>('/me/cfps');
      return r.ok ? { ...r, data: r.data.cfps } : r;
    },
    getOpenCfp: (id: string) => request<SpeakerCfp>(`/me/cfps/${enc(id)}`),

    // ---- Speaker: submissions ----
    listMySubmissions: async () => {
      const r = await request<{ submissions: SpeakerSubmission[] }>('/me/submissions');
      return r.ok ? { ...r, data: r.data.submissions } : r;
    },
    createSubmission: (input: CreateSubmissionInput) =>
      request<SpeakerSubmission>('/me/submissions', { method: 'POST', body: input }),
    getMySubmission: (id: string) => request<SpeakerSubmission>(`/me/submissions/${enc(id)}`),
    updateMySubmission: (id: string, input: SubmissionInput) =>
      request<SpeakerSubmission>(`/me/submissions/${enc(id)}`, { method: 'PUT', body: input }),
    submitMySubmission: (id: string, input: SubmissionInput = {}) =>
      request<SpeakerSubmission>(`/me/submissions/${enc(id)}/submit`, { method: 'POST', body: input }),
    /** DELETE withdraws; the submission is returned with status Withdrawn. */
    withdrawMySubmission: (id: string) =>
      request<SpeakerSubmission>(`/me/submissions/${enc(id)}`, { method: 'DELETE' }),

    // ---- Speaker: bookings ----
    listMyBookings: async () => {
      const r = await request<{ bookings: SpeakerBooking[] }>('/me/bookings');
      return r.ok ? { ...r, data: r.data.bookings } : r;
    },

    // ---- Admin: submissions and review ----
    listCfpSubmissions: async (cfpId: string, status?: SubmissionFilter) => {
      const r = await request<{ submissions: AdminSubmissionListItem[] }>(
        `/admin/cfps/${enc(cfpId)}/submissions`,
        { query: { status } },
      );
      return r.ok ? { ...r, data: r.data.submissions } : r;
    },
    getSubmission: (id: string) => request<AdminSubmissionDetail>(`/admin/submissions/${enc(id)}`),
    setSubmissionStatus: (id: string, status: SubmissionStatus, updatedAt?: string) =>
      request<AdminSubmissionDetail>(`/admin/submissions/${enc(id)}/status`, {
        method: 'PUT',
        body: { status, ...(updatedAt ? { updatedAt } : {}) },
      }),
    reviewSubmission: (id: string, input: ReviewInput) =>
      request<AdminSubmissionDetail>(`/admin/submissions/${enc(id)}/review`, { method: 'PUT', body: input }),

    // ---- Admin: bookings ----
    listBookings: async (query: BookingQuery) => {
      const r = await request<{ bookings: Booking[] }>('/admin/bookings', { query: { ...query } });
      return r.ok ? { ...r, data: r.data.bookings } : r;
    },
    /** Returns kind 'booking_warnings' on 409; resubmit with confirmWarnings: true. */
    createBooking: (input: BookingInput) => request<Booking>('/admin/bookings', { method: 'POST', body: input }),
    updateBooking: (id: string, input: BookingUpdate) =>
      request<Booking>(`/admin/bookings/${enc(id)}`, { method: 'PUT', body: input }),
    deleteBooking: (id: string) => request<undefined>(`/admin/bookings/${enc(id)}`, { method: 'DELETE' }),

    // ---- Admin: users ----
    listUsers: async () => {
      const r = await request<{ users: AdminUser[] }>('/admin/users');
      return r.ok ? { ...r, data: r.data.users } : r;
    },
    inviteAdmin: (email: string) => request<InvitedUser>('/admin/users/invite', { method: 'POST', body: { email } }),
    promoteUser: (userId: string) =>
      request<{ userId: string; role: UserRole }>(`/admin/users/${enc(userId)}/promote`, { method: 'POST' }),
    demoteUser: (userId: string) =>
      request<{ userId: string; role: UserRole }>(`/admin/users/${enc(userId)}/demote`, { method: 'POST' }),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;

export const api: ApiClient = createApiClient();
export default api;
