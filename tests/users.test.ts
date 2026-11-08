import {
  AdminAddUserToGroupCommand,
  AdminCreateUserCommand,
  AdminRemoveUserFromGroupCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { cognitoClient } from '../src/shared/aws-clients';
import { handler } from '../src/handlers/users';

jest.mock('../src/shared/aws-clients', () => ({
  cognitoClient: { send: jest.fn() },
}));

const send = cognitoClient.send as jest.Mock;

const makeEvent = (
  method: string,
  path: string,
  groups: string[] | null,
  body?: unknown,
  sub = 'admin-sub'
): any => ({
  httpMethod: method,
  path,
  body: body === undefined ? null : JSON.stringify(body),
  isBase64Encoded: false,
  requestContext: {
    authorizer: groups
      ? { claims: { sub, email: 'me@example.com', 'cognito:groups': groups } }
      : { claims: {} },
  },
});

const parse = (r: any) => JSON.parse(r.body);

describe('users handler', () => {
  beforeEach(() => {
    send.mockReset();
    send.mockResolvedValue({});
    (AdminAddUserToGroupCommand as unknown as jest.Mock).mockClear();
    (AdminCreateUserCommand as unknown as jest.Mock).mockClear();
    (AdminRemoveUserFromGroupCommand as unknown as jest.Mock).mockClear();
  });

  describe('GET /me', () => {
    it('returns identity and admin role from claims', async () => {
      const res = await handler(makeEvent('GET', '/me', ['admin', 'speaker']));
      expect(res.statusCode).toBe(200);
      expect(parse(res)).toMatchObject({ userId: 'admin-sub', email: 'me@example.com', role: 'admin' });
    });

    it('returns speaker role for speakers', async () => {
      const res = await handler(makeEvent('GET', '/me', ['speaker']));
      expect(parse(res).role).toBe('speaker');
    });

    it('returns 401 without claims', async () => {
      const res = await handler(makeEvent('GET', '/me', null));
      expect(res.statusCode).toBe(401);
    });
  });

  describe('admin routes reject speaker tokens with 403', () => {
    const cases: [string, string, unknown][] = [
      ['GET', '/admin/users', undefined],
      ['POST', '/admin/users/invite', { email: 'a@b.co' }],
      ['POST', '/admin/users/u1/promote', undefined],
      ['POST', '/admin/users/u1/demote', undefined],
    ];
    it.each(cases)('%s %s', async (method, path, body) => {
      const res = await handler(makeEvent(method, path, ['speaker'], body));
      expect(res.statusCode).toBe(403);
      expect(send).not.toHaveBeenCalled();
    });
  });

  describe('GET /admin/users', () => {
    it('lists users with their groups', async () => {
      send
        .mockResolvedValueOnce({
          Users: [{ Username: 'u1', Attributes: [{ Name: 'sub', Value: 'u1' }, { Name: 'email', Value: 'x@y.co' }] }],
        })
        .mockResolvedValueOnce({ Groups: [{ GroupName: 'admin' }] });
      const res = await handler(makeEvent('GET', '/admin/users', ['admin']));
      expect(res.statusCode).toBe(200);
      expect(parse(res).users).toEqual([
        expect.objectContaining({ userId: 'u1', email: 'x@y.co', groups: ['admin'] }),
      ]);
    });
  });

  describe('POST /admin/users/invite', () => {
    it('creates the user then adds to admin group', async () => {
      send.mockResolvedValue({ User: { Username: 'new@x.co', Attributes: [{ Name: 'sub', Value: 's-1' }] } });
      const res = await handler(makeEvent('POST', '/admin/users/invite', ['admin'], { email: ' New@X.co ' }));
      expect(res.statusCode).toBe(201);
      expect(AdminCreateUserCommand).toHaveBeenCalledWith(
        expect.objectContaining({ Username: 'new@x.co' })
      );
      expect(AdminAddUserToGroupCommand).toHaveBeenCalledWith(
        expect.objectContaining({ Username: 'new@x.co', GroupName: 'admin' })
      );
      expect(send).toHaveBeenCalledTimes(2);
      expect(parse(res).userId).toBe('s-1');
    });

    it.each(['', 'nope', 'a@b', 42])('rejects invalid email %p', async (email) => {
      const res = await handler(makeEvent('POST', '/admin/users/invite', ['admin'], { email }));
      expect(res.statusCode).toBe(400);
      expect(parse(res).error.fields.email).toBeDefined();
      expect(send).not.toHaveBeenCalled();
    });
  });

  describe('promote / demote', () => {
    it('promotes a user to admin', async () => {
      const res = await handler(makeEvent('POST', '/admin/users/u1/promote', ['admin']));
      expect(res.statusCode).toBe(200);
      expect(AdminAddUserToGroupCommand).toHaveBeenCalledWith(
        expect.objectContaining({ Username: 'u1', GroupName: 'admin' })
      );
    });

    it('demotes another admin', async () => {
      const res = await handler(makeEvent('POST', '/admin/users/u1/demote', ['admin']));
      expect(res.statusCode).toBe(200);
      expect(AdminRemoveUserFromGroupCommand).toHaveBeenCalledWith(
        expect.objectContaining({ Username: 'u1', GroupName: 'admin' })
      );
    });

    it('blocks self-demotion', async () => {
      const res = await handler(makeEvent('POST', '/admin/users/admin-sub/demote', ['admin']));
      expect(res.statusCode).toBe(400);
      expect(parse(res).error.code).toBe('VALIDATION_ERROR');
      expect(send).not.toHaveBeenCalled();
    });
  });
});
