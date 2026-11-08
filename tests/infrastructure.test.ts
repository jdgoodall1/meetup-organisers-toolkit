// Infrastructure tests: assert template.yaml matches the CFP speaker toolkit design.

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

// Minimal CloudFormation tag support: each short-form tag becomes { "<Fn>": value }.
const cfnTags = ['Ref', 'GetAtt', 'Sub', 'Join', 'Select', 'Split', 'If', 'Equals', 'Not', 'FindInMap', 'ImportValue', 'GetAZs', 'Base64'];
const cfnTypes = cfnTags.flatMap((tag) => {
  const name = tag === 'Ref' ? 'Ref' : `Fn::${tag}`;
  const build = (data: unknown) => {
    if (tag === 'GetAtt' && typeof data === 'string') return { [name]: data.split('.') };
    return { [name]: data };
  };
  return (['scalar', 'sequence', 'mapping'] as const).map(
    (kind) => new yaml.Type(`!${tag}`, { kind, construct: build })
  );
});
const CFN_SCHEMA = yaml.DEFAULT_SCHEMA.extend(cfnTypes);

type Json = Record<string, any>;

const template = yaml.load(
  fs.readFileSync(path.join(__dirname, '..', 'template.yaml'), 'utf8'),
  { schema: CFN_SCHEMA }
) as Json;

const resources: Json = template.Resources;
const byType = (type: string): string[] =>
  Object.keys(resources).filter((id) => resources[id].Type === type);

const ADMIN_ONLY_TABLES = ['SpeakerAdminTable', 'SubmissionReviewsTable'];

/** Logical IDs of tables a function can reach through its SAM policies. */
function tablesReferencedByPolicies(fnId: string): string[] {
  const refs: string[] = [];
  for (const policy of resources[fnId].Properties.Policies ?? []) {
    for (const value of Object.values(policy) as Json[]) {
      const table = value?.TableName?.Ref;
      if (table) refs.push(table);
    }
  }
  return refs;
}

describe('template.yaml', () => {
  test('contains no legacy resources, parameters, env vars or outputs', () => {
    const legacyIds = [
      'ScheduledPostsTable', 'MessagesTable', 'NotificationsTable', 'SyncRecordsTable',
      'SyncConflictsTable', 'UsersTable', 'SchedulerQueue', 'SyncScheduleRule', 'PostScheduleRule',
    ];
    for (const id of legacyIds) expect(resources[id]).toBeUndefined();

    expect(byType('AWS::SQS::Queue')).toEqual([]);
    expect(byType('AWS::Events::Rule')).toEqual([]);

    const legacyFunctionPattern = /linkedin|meetup|messag|notification|social|sync|scheduler/i;
    for (const id of byType('AWS::Serverless::Function')) {
      expect(id).not.toMatch(legacyFunctionPattern);
    }

    expect(Object.keys(template.Parameters).filter((p) => /linkedin/i.test(p))).toEqual([]);

    // No legacy wording anywhere in the template (env vars, outputs, policies).
    const raw = JSON.stringify(template);
    expect(raw).not.toMatch(/linkedin|meetup\.com|SCHEDULER_QUEUE|SYNC_|SCHEDULED_POSTS|NOTIFICATIONS_TABLE|MESSAGES_TABLE|USERS_TABLE/i);

    const outputs = Object.keys(template.Outputs);
    expect(outputs).toEqual(expect.arrayContaining(['ApiGatewayUrl', 'UserPoolId', 'UserPoolClientId']));
    for (const o of outputs) expect(o).not.toMatch(/queue|linkedin|sync|scheduled/i);
  });

  test('defines the design tables and a private headshots bucket', () => {
    const expected = [
      'EventsTable', 'SpeakersTable', 'SpeakerAdminTable', 'CfpsTable',
      'QuestionTemplatesTable', 'SubmissionsTable', 'SubmissionReviewsTable', 'BookingsTable',
    ];
    expect(byType('AWS::DynamoDB::Table').sort()).toEqual([...expected].sort());

    const indexes = (id: string) =>
      (resources[id].Properties.GlobalSecondaryIndexes ?? []).map((i: Json) => i.IndexName).sort();
    expect(indexes('EventsTable')).toEqual(['StatusDateIndex']);
    expect(indexes('SpeakersTable')).toEqual(['UserIdIndex']);
    expect(indexes('CfpsTable')).toEqual(['StatusIndex']);
    expect(indexes('SubmissionsTable')).toEqual(['CfpIndex', 'SpeakerIndex']);
    expect(indexes('BookingsTable')).toEqual(['EventIndex', 'SpeakerIndex']);

    const reviewKeys = resources.SubmissionReviewsTable.Properties.KeySchema;
    expect(reviewKeys).toEqual([
      { AttributeName: 'submissionId', KeyType: 'HASH' },
      { AttributeName: 'adminUserId', KeyType: 'RANGE' },
    ]);

    const bucket = resources.HeadshotsBucket.Properties;
    expect(resources.HeadshotsBucket.Type).toBe('AWS::S3::Bucket');
    expect(bucket.PublicAccessBlockConfiguration).toEqual({
      BlockPublicAcls: true,
      BlockPublicPolicy: true,
      IgnorePublicAcls: true,
      RestrictPublicBuckets: true,
    });
    expect(bucket.CorsConfiguration.CorsRules[0].AllowedMethods).toEqual(expect.arrayContaining(['PUT', 'GET']));
  });

  test('defines Cognito groups, post-confirmation trigger and SRP-only client', () => {
    const groups = byType('AWS::Cognito::UserPoolGroup').map((id) => resources[id].Properties.GroupName);
    expect(groups.sort()).toEqual(['admin', 'speaker']);

    expect(resources.UserPool.Properties.LambdaConfig.PostConfirmation).toEqual({
      'Fn::GetAtt': ['PostConfirmationFunction', 'Arn'],
    });
    const permission = resources.PostConfirmationInvokePermission.Properties;
    expect(permission.Principal).toBe('cognito-idp.amazonaws.com');
    expect(permission.FunctionName).toEqual({ Ref: 'PostConfirmationFunction' });

    const flows = resources.UserPoolClient.Properties.ExplicitAuthFlows;
    expect(flows).not.toContain('ALLOW_USER_PASSWORD_AUTH');
    expect(flows).toEqual(expect.arrayContaining(['ALLOW_USER_SRP_AUTH', 'ALLOW_REFRESH_TOKEN_AUTH']));
  });

  test('uses the AllowedOrigin parameter for CORS instead of a wildcard', () => {
    expect(template.Parameters.AllowedOrigin).toBeDefined();
    const api = resources.ApiGateway.Properties;
    expect(JSON.stringify(api.Cors)).toContain('AllowedOrigin');
    expect(JSON.stringify(api.GatewayResponses)).toContain('AllowedOrigin');
    expect(JSON.stringify(api.Cors) + JSON.stringify(api.GatewayResponses)).not.toContain("'*'");
  });

  test('defines the expected Lambda functions', () => {
    const expected = [
      'PostConfirmationFunction', 'UsersFunction', 'EventsFunction', 'SpeakersMeFunction',
      'SpeakersAdminFunction', 'CfpsFunction', 'SubmissionsMeFunction', 'SubmissionsAdminFunction',
      'BookingsFunction',
    ];
    expect(byType('AWS::Serverless::Function').sort()).toEqual([...expected].sort());
  });

  test('EventsFunction has no CfpsTable access (CFPs are not linked to events)', () => {
    const tables = tablesReferencedByPolicies('EventsFunction');
    expect(tables).not.toContain('CfpsTable');
    expect(tables.sort()).toEqual(['BookingsTable', 'EventsTable']);
  });

  test('CfpsTable StatusIndex keys are unchanged (changing them would replace the table)', () => {
    const gsi = resources.CfpsTable.Properties.GlobalSecondaryIndexes[0];
    expect(gsi.IndexName).toBe('StatusIndex');
    expect(gsi.KeySchema).toEqual([
      { AttributeName: 'status', KeyType: 'HASH' },
      { AttributeName: 'closesAt', KeyType: 'RANGE' },
    ]);
  });

  test('every API route sits behind the Cognito authorizer', () => {
    expect(resources.ApiGateway.Properties.Auth.DefaultAuthorizer).toBe('CognitoAuthorizer');
    for (const fnId of byType('AWS::Serverless::Function')) {
      for (const [name, ev] of Object.entries(resources[fnId].Properties.Events ?? {}) as [string, Json][]) {
        expect({ fnId, name, auth: ev.Properties.Auth }).toEqual({ fnId, name, auth: undefined });
        expect(ev.Properties.RestApiId).toEqual({ Ref: 'ApiGateway' });
      }
    }
  });

  test('admin routes live only on admin-capable functions and /me routes never on *-admin functions', () => {
    for (const fnId of byType('AWS::Serverless::Function')) {
      const paths: string[] = Object.values(resources[fnId].Properties.Events ?? {}).map(
        (ev: any) => ev.Properties.Path
      );
      if (/Me(Function)$/.test(fnId)) {
        for (const p of paths) expect(p.startsWith('/me/')).toBe(true);
      }
      if (/Admin(Function)$/.test(fnId) || fnId === 'EventsFunction') {
        for (const p of paths) expect(p.startsWith('/admin/')).toBe(true);
      }
    }
  });

  test('wires the full route table from the design', () => {
    const routes = new Set<string>();
    for (const fnId of byType('AWS::Serverless::Function')) {
      for (const ev of Object.values(resources[fnId].Properties.Events ?? {}) as Json[]) {
        routes.add(`${ev.Properties.Method.toUpperCase()} ${ev.Properties.Path}`);
      }
    }
    const required = [
      'GET /me', 'DELETE /me', 'GET /me/profile', 'PUT /me/profile', 'POST /me/profile/headshot-url',
      'GET /me/cfps', 'GET /me/cfps/{id}', 'GET /me/submissions', 'POST /me/submissions',
      'GET /me/submissions/{id}', 'PUT /me/submissions/{id}', 'DELETE /me/submissions/{id}',
      'POST /me/submissions/{id}/submit', 'GET /me/bookings',
      'GET /admin/events', 'POST /admin/events', 'GET /admin/events/{id}', 'PUT /admin/events/{id}',
      'DELETE /admin/events/{id}', 'GET /admin/speakers', 'POST /admin/speakers',
      'GET /admin/speakers/{id}', 'PUT /admin/speakers/{id}', 'PUT /admin/speakers/{id}/marker',
      'PUT /admin/speakers/{id}/notes', 'POST /admin/speakers/{id}/link',
      'POST /admin/speakers/{id}/headshot-url',
      'GET /admin/cfps', 'POST /admin/cfps', 'GET /admin/cfps/{id}', 'PUT /admin/cfps/{id}',
      'DELETE /admin/cfps/{id}', 'POST /admin/cfps/{id}/duplicate', 'PUT /admin/cfps/{id}/questions',
      'GET /admin/templates', 'POST /admin/templates', 'DELETE /admin/templates/{id}',
      'POST /admin/cfps/{id}/apply-template', 'GET /admin/cfps/{id}/submissions',
      'GET /admin/submissions/{id}', 'PUT /admin/submissions/{id}/status',
      'PUT /admin/submissions/{id}/review', 'GET /admin/bookings', 'POST /admin/bookings',
      'PUT /admin/bookings/{id}', 'DELETE /admin/bookings/{id}', 'GET /admin/users',
      'POST /admin/users/invite', 'POST /admin/users/{userId}/promote',
      'POST /admin/users/{userId}/demote',
    ];
    for (const route of required) expect(routes).toContain(route);
  });

  test('*-me functions have no policy on admin-only tables', () => {
    const meFunctions = byType('AWS::Serverless::Function').filter((id) => /Me(Function)$/.test(id));
    expect(meFunctions.sort()).toEqual(['SpeakersMeFunction', 'SubmissionsMeFunction']);

    for (const fnId of meFunctions) {
      const tables = tablesReferencedByPolicies(fnId);
      for (const adminTable of ADMIN_ONLY_TABLES) expect(tables).not.toContain(adminTable);
      // No inline statements or wildcard grants that could bypass the check.
      const raw = JSON.stringify(resources[fnId].Properties.Policies);
      for (const adminTable of ADMIN_ONLY_TABLES) expect(raw).not.toContain(adminTable);
      expect(raw).not.toContain('dynamodb:*');
    }
  });

  test('SpeakersAdminFunction can manage headshots and verify accounts in the user pool only', () => {
    const props = resources.SpeakersAdminFunction.Properties;
    const policies: Json[] = props.Policies;
    expect(policies).toContainEqual({ S3CrudPolicy: { BucketName: { Ref: 'HeadshotsBucket' } } });
    expect(props.Environment.Variables.USER_POOL_ID).toEqual({ Ref: 'UserPool' });

    const cognito = policies
      .flatMap((p) => (p.Statement ?? []) as Json[])
      .filter((s) => JSON.stringify(s.Action).includes('cognito-idp'));
    expect(cognito).toHaveLength(1);
    expect(cognito[0].Action).toEqual(['cognito-idp:AdminGetUser']);
    expect(cognito[0].Resource).toEqual({ 'Fn::GetAtt': ['UserPool', 'Arn'] });
  });

  test('BookingsFunction reads submissions but never the admin-only review table', () => {
    const tables = tablesReferencedByPolicies('BookingsFunction');
    expect(tables).toContain('SubmissionsTable');
    expect(tables).not.toContain('SubmissionReviewsTable');
    const submissionsPolicy = resources.BookingsFunction.Properties.Policies.find(
      (p: Json) => p.DynamoDBReadPolicy?.TableName?.Ref === 'SubmissionsTable'
    );
    expect(submissionsPolicy).toBeDefined();
  });
});

describe('AWS clients module', () => {
  test('exports the shared clients', () => {
    const awsClients = require('../src/shared/aws-clients');
    expect('dynamoDocClient' in awsClients).toBe(true);
    expect('cognitoClient' in awsClients).toBe(true);
  });
});
