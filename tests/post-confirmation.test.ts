import { AdminAddUserToGroupCommand } from '@aws-sdk/client-cognito-identity-provider';
import { cognitoClient } from '../src/shared/aws-clients';
import { handler } from '../src/handlers/post-confirmation';

jest.mock('../src/shared/aws-clients', () => ({
  cognitoClient: { send: jest.fn().mockResolvedValue({}) },
}));

const makeEvent = (triggerSource: string): any => ({
  version: '1',
  region: 'us-east-1',
  userPoolId: 'pool-1',
  userName: 'alice',
  triggerSource,
  request: { userAttributes: {} },
  response: {},
});

describe('post-confirmation handler', () => {
  beforeEach(() => {
    (cognitoClient.send as jest.Mock).mockClear();
    (AdminAddUserToGroupCommand as unknown as jest.Mock).mockClear();
  });

  it('adds self-signed-up users to the speaker group and returns the event unchanged', async () => {
    const event = makeEvent('PostConfirmation_ConfirmSignUp');
    const copy = JSON.parse(JSON.stringify(event));
    const result = await handler(event);

    expect(result).toBe(event);
    expect(result).toEqual(copy);
    expect(AdminAddUserToGroupCommand).toHaveBeenCalledWith({
      UserPoolId: 'pool-1',
      Username: 'alice',
      GroupName: 'speaker',
    });
    expect(cognitoClient.send).toHaveBeenCalledTimes(1);
  });

  it('does nothing for non sign-up confirmations', async () => {
    const event = makeEvent('PostConfirmation_ConfirmForgotPassword');
    const result = await handler(event);

    expect(result).toBe(event);
    expect(cognitoClient.send).not.toHaveBeenCalled();
  });
});
