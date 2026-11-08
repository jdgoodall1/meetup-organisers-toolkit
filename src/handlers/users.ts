// Users handler: /me identity and admin user management (invite, promote, demote).
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import {
  AdminAddUserToGroupCommand,
  AdminCreateUserCommand,
  AdminDeleteUserCommand,
  AdminListGroupsForUserCommand,
  AdminRemoveUserFromGroupCommand,
  ListUsersCommand,
  type UserType,
} from '@aws-sdk/client-cognito-identity-provider';
import { cognitoClient } from '../shared/aws-clients';
import { config } from '../shared/config';
import { getAuth, isAdmin, requireAdmin, requireSpeaker } from '../shared/auth';
import { deleteHeadshot } from '../shared/headshots';
import {
  bookingsRepo,
  speakerAdminRepo,
  speakersRepo,
  submissionReviewsRepo,
  submissionsRepo,
} from '../shared/repos';
import {
  Route,
  ValidationError,
  created,
  dispatch,
  ok,
  parseJsonBody,
} from '../shared/http';

const ADMIN_GROUP = 'admin';
// Pragmatic email check; Cognito performs the authoritative validation.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const poolId = (): string => process.env.USER_POOL_ID || config.cognito.userPoolId;

function attr(user: UserType, name: string): string | undefined {
  return user.Attributes?.find((a) => a.Name === name)?.Value;
}

function toUser(user: UserType, groups: string[]) {
  return {
    userId: attr(user, 'sub') ?? user.Username ?? '',
    username: user.Username ?? '',
    email: attr(user, 'email') ?? '',
    status: user.UserStatus,
    enabled: user.Enabled,
    groups,
    createdAt: user.UserCreateDate?.toISOString?.(),
  };
}

async function groupsFor(username: string): Promise<string[]> {
  const res = await cognitoClient.send(
    new AdminListGroupsForUserCommand({ UserPoolId: poolId(), Username: username })
  );
  return (res.Groups ?? []).map((g) => g.GroupName).filter((g): g is string => !!g);
}

/**
 * Delete a speaker's account and data in a fixed order. Every step is
 * idempotent and the Cognito user is removed last, so a retry after a partial
 * failure (the caller's token stays valid until then) resumes safely.
 */
async function deleteAccount(userId: string): Promise<void> {
  const profiles = await speakersRepo.listByUserId(userId);

  for (const profile of profiles) {
    const { speakerId } = profile;

    // 1. Submissions and their review items (reviews first, so a retry still finds the submission).
    for (const submission of await submissionsRepo.listBySpeaker(speakerId)) {
      for (const review of await submissionReviewsRepo.listBySubmission(submission.submissionId)) {
        await submissionReviewsRepo.delete(review.submissionId, review.adminUserId);
      }
      await submissionsRepo.delete(submission.submissionId);
    }

    // 2. Headshot object.
    if (profile.headshotKey) await deleteHeadshot(profile.headshotKey);

    // 3. Anonymise bookings, keeping event history.
    for (const booking of await bookingsRepo.listBySpeaker(speakerId)) {
      await bookingsRepo.anonymise(booking.bookingId, userId);
    }

    // 4. Profile items. The speaker item goes last: it is how a retry finds the rest.
    await speakerAdminRepo.delete(speakerId);
    await speakersRepo.delete(speakerId);
  }

  // 5. Cognito user last. Already gone means a previous attempt finished.
  try {
    await cognitoClient.send(
      new AdminDeleteUserCommand({ UserPoolId: poolId(), Username: userId })
    );
  } catch (err) {
    if ((err as { name?: string }).name !== 'UserNotFoundException') throw err;
  }
}

type Ctx = APIGatewayProxyEvent;

const routes: Route<Ctx>[] = [
  {
    method: 'GET',
    path: '/me',
    handler: (event) => {
      const auth = getAuth(event);
      return ok({
        userId: auth.userId,
        email: auth.email,
        groups: auth.groups,
        role: isAdmin(auth) ? 'admin' : 'speaker',
      });
    },
  },
  {
    // Account deletion (Req 11.5). Lives here rather than in speakers-me so the
    // speaker-facing functions never need access to admin-only tables.
    method: 'DELETE',
    path: '/me',
    handler: async (event) => {
      const auth = requireSpeaker(event);
      await deleteAccount(auth.userId);
      return ok({ deleted: true });
    },
  },
  {
    method: 'GET',
    path: '/admin/users',
    handler: async (event) => {
      requireAdmin(event);
      const users: UserType[] = [];
      let token: string | undefined;
      do {
        const res = await cognitoClient.send(
          new ListUsersCommand({ UserPoolId: poolId(), PaginationToken: token })
        );
        users.push(...(res.Users ?? []));
        token = res.PaginationToken;
      } while (token);

      const items = await Promise.all(
        users.map(async (u) => toUser(u, await groupsFor(u.Username ?? '')))
      );
      return ok({ users: items });
    },
  },
  {
    method: 'POST',
    path: '/admin/users/invite',
    handler: async (event) => {
      requireAdmin(event);
      const body = parseJsonBody<{ email?: unknown }>(event.body, event.isBase64Encoded);
      const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
      if (!EMAIL_RE.test(email) || email.length > 254) {
        throw new ValidationError({ email: 'A valid email address is required' });
      }

      const res = await cognitoClient.send(
        new AdminCreateUserCommand({
          UserPoolId: poolId(),
          Username: email,
          UserAttributes: [
            { Name: 'email', Value: email },
            { Name: 'email_verified', Value: 'true' },
          ],
          DesiredDeliveryMediums: ['EMAIL'],
        })
      );
      const username = res.User?.Username ?? email;
      await cognitoClient.send(
        new AdminAddUserToGroupCommand({
          UserPoolId: poolId(),
          Username: username,
          GroupName: ADMIN_GROUP,
        })
      );
      return created({
        userId: res.User ? attr(res.User, 'sub') ?? username : username,
        username,
        email,
        groups: [ADMIN_GROUP],
      });
    },
  },
  {
    method: 'POST',
    path: '/admin/users/{userId}/promote',
    handler: async (event, params) => {
      requireAdmin(event);
      await cognitoClient.send(
        new AdminAddUserToGroupCommand({
          UserPoolId: poolId(),
          Username: params.userId,
          GroupName: ADMIN_GROUP,
        })
      );
      return ok({ userId: params.userId, role: 'admin' });
    },
  },
  {
    method: 'POST',
    path: '/admin/users/{userId}/demote',
    handler: async (event, params) => {
      const auth = requireAdmin(event);
      const target = params.userId;
      // Block self-demotion so the admin group can never be emptied by its last member.
      if (
        target === auth.userId ||
        (auth.email !== '' && target.toLowerCase() === auth.email.toLowerCase())
      ) {
        throw new ValidationError({ userId: 'You cannot demote yourself' }, 'You cannot demote yourself');
      }
      await cognitoClient.send(
        new AdminRemoveUserFromGroupCommand({
          UserPoolId: poolId(),
          Username: target,
          GroupName: ADMIN_GROUP,
        })
      );
      return ok({ userId: target, role: 'speaker' });
    },
  },
];

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> =>
  dispatch(routes, event.httpMethod, event.path, event);
