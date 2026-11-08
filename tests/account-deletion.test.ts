import { AdminDeleteUserCommand } from '@aws-sdk/client-cognito-identity-provider';
import { cognitoClient } from '../src/shared/aws-clients';
import { deleteHeadshot } from '../src/shared/headshots';
import {
  bookingsRepo,
  speakerAdminRepo,
  speakersRepo,
  submissionReviewsRepo,
  submissionsRepo,
} from '../src/shared/repos';
import { handler } from '../src/handlers/users';

jest.mock('../src/shared/aws-clients', () => ({
  cognitoClient: { send: jest.fn() },
}));
jest.mock('../src/shared/headshots', () => ({ deleteHeadshot: jest.fn() }));
jest.mock('../src/shared/repos', () => ({
  speakersRepo: { listByUserId: jest.fn(), delete: jest.fn() },
  speakerAdminRepo: { delete: jest.fn() },
  submissionsRepo: { listBySpeaker: jest.fn(), delete: jest.fn() },
  submissionReviewsRepo: { listBySubmission: jest.fn(), delete: jest.fn() },
  bookingsRepo: { listBySpeaker: jest.fn(), anonymise: jest.fn() },
}));

const m = (fn: unknown) => fn as jest.Mock;
const send = m(cognitoClient.send);

const makeEvent = (groups: string[] | null): any => ({
  httpMethod: 'DELETE',
  path: '/me',
  body: null,
  isBase64Encoded: false,
  requestContext: {
    authorizer: groups
      ? { claims: { sub: 'user-1', email: 'me@example.com', 'cognito:groups': groups } }
      : { claims: {} },
  },
});

/** Records the order in which each mutating call happens. */
let calls: string[];
const track = (name: string) => (...args: unknown[]) => {
  calls.push(`${name}:${args.join(',')}`);
  return Promise.resolve();
};

beforeEach(() => {
  calls = [];
  jest.clearAllMocks();
  m(speakersRepo.listByUserId).mockResolvedValue([{ speakerId: 's1', userId: 'user-1', headshotKey: 'headshots/s1/abc' }]);
  m(submissionsRepo.listBySpeaker).mockResolvedValue([{ submissionId: 'sub1' }, { submissionId: 'sub2' }]);
  m(submissionReviewsRepo.listBySubmission).mockImplementation(async (id: string) =>
    id === 'sub1' ? [{ submissionId: 'sub1', adminUserId: 'a1' }] : [],
  );
  m(bookingsRepo.listBySpeaker).mockResolvedValue([{ bookingId: 'b1' }]);
  m(submissionReviewsRepo.delete).mockImplementation(track('review'));
  m(submissionsRepo.delete).mockImplementation(track('submission'));
  m(deleteHeadshot).mockImplementation(track('headshot'));
  m(bookingsRepo.anonymise).mockImplementation(track('booking'));
  m(speakerAdminRepo.delete).mockImplementation(track('speakerAdmin'));
  m(speakersRepo.delete).mockImplementation(track('speaker'));
  send.mockImplementation(async () => {
    calls.push('cognito');
    return {};
  });
});

describe('DELETE /me', () => {
  it('rejects non-speakers and unauthenticated callers', async () => {
    expect((await handler(makeEvent(['admin']))).statusCode).toBe(403);
    expect((await handler(makeEvent(null))).statusCode).toBe(401);
    expect(send).not.toHaveBeenCalled();
  });

  it('deletes data in the designed order with Cognito last', async () => {
    const res = await handler(makeEvent(['speaker']));
    expect(res.statusCode).toBe(200);
    expect(calls).toEqual([
      'review:sub1,a1',
      'submission:sub1',
      'submission:sub2',
      'headshot:headshots/s1/abc',
      'booking:b1,user-1',
      'speakerAdmin:s1',
      'speaker:s1',
      'cognito',
    ]);
    expect(AdminDeleteUserCommand).toHaveBeenCalledWith(expect.objectContaining({ Username: 'user-1' }));
  });

  it('does not delete the Cognito user when an earlier step fails, and a retry completes', async () => {
    m(speakerAdminRepo.delete).mockRejectedValueOnce(new Error('boom'));
    const first = await handler(makeEvent(['speaker']));
    expect(first.statusCode).toBe(500);
    expect(send).not.toHaveBeenCalled();
    expect(speakersRepo.delete).not.toHaveBeenCalled();

    const retry = await handler(makeEvent(['speaker']));
    expect(retry.statusCode).toBe(200);
    expect(speakersRepo.delete).toHaveBeenCalledWith('s1');
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('still deletes the Cognito user when the profile is already gone, tolerating a missing user', async () => {
    m(speakersRepo.listByUserId).mockResolvedValue([]);
    send.mockRejectedValueOnce(Object.assign(new Error('gone'), { name: 'UserNotFoundException' }));
    const res = await handler(makeEvent(['speaker']));
    expect(res.statusCode).toBe(200);
    expect(submissionsRepo.listBySpeaker).not.toHaveBeenCalled();
  });
});
