// Cognito PostConfirmation trigger: puts self-signed-up users in the `speaker` group.
import type { PostConfirmationTriggerEvent } from 'aws-lambda';
import { AdminAddUserToGroupCommand } from '@aws-sdk/client-cognito-identity-provider';
import { cognitoClient } from '../shared/aws-clients';

const SPEAKER_GROUP = 'speaker';

export const handler = async (
  event: PostConfirmationTriggerEvent
): Promise<PostConfirmationTriggerEvent> => {
  // Only self sign-up; admin-created users and forgot-password confirmations are left alone.
  if (event.triggerSource !== 'PostConfirmation_ConfirmSignUp') {
    return event;
  }

  // The group is a constant, so no sign-up path can yield `admin`.
  await cognitoClient.send(
    new AdminAddUserToGroupCommand({
      UserPoolId: event.userPoolId,
      Username: event.userName,
      GroupName: SPEAKER_GROUP,
    })
  );

  return event;
};
