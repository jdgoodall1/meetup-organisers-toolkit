// Unit tests for src/shared/repos with a mocked DynamoDB document client.

const send = jest.fn();

jest.mock('../src/shared/aws-clients', () => ({
  dynamoDocClient: { send: (cmd: unknown) => send(cmd) },
}));

jest.mock('@aws-sdk/lib-dynamodb', () => {
  const make = (name: string) =>
    class {
      readonly commandName = name;
      constructor(public input: any) {}
    };
  return {
    PutCommand: make('Put'),
    GetCommand: make('Get'),
    UpdateCommand: make('Update'),
    DeleteCommand: make('Delete'),
    QueryCommand: make('Query'),
    ScanCommand: make('Scan'),
  };
});

import { bookingsRepo, cfpsRepo, eventsRepo, speakersRepo, submissionReviewsRepo, submissionsRepo } from '../src/shared/repos';
import { config } from '../src/shared/config';

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

beforeEach(() => {
  send.mockReset();
});

describe('audit fields', () => {
  it('stamps all four audit fields on create', async () => {
    send.mockResolvedValue({});
    const created = await eventsRepo.create(
      {
        eventId: 'e1', title: 't', startDateTime: 'a', endDateTime: 'b', location: '',
        isOnline: false, description: '', format: '', status: 'draft',
      },
      'admin-1',
    );
    const cmd = send.mock.calls[0][0];
    expect(cmd.input.TableName).toBe(config.tables.events);
    expect(cmd.input.ConditionExpression).toContain('attribute_not_exists');
    expect(created.createdBy).toBe('admin-1');
    expect(created.updatedBy).toBe('admin-1');
    expect(created.createdAt).toMatch(ISO);
    expect(created.updatedAt).toBe(created.createdAt);
    expect(cmd.input.Item).toEqual(created);
  });

  it('stamps updatedAt/updatedBy on update and never touches created fields', async () => {
    send.mockResolvedValue({ Attributes: {} });
    await speakersRepo.update('s1', { name: 'New', createdBy: 'hacker' } as any, 'u1');
    const { input } = send.mock.calls[0][0];
    expect(input.ExpressionAttributeValues[':actor']).toBe('u1');
    expect(input.ExpressionAttributeValues[':now']).toMatch(ISO);
    expect(Object.values(input.ExpressionAttributeNames)).not.toContain('createdBy');
    expect(input.UpdateExpression).toContain('#updatedAt = :now');
    expect(input.UpdateExpression).toContain('#updatedBy = :actor');
  });

  it('sets createdAt only if absent on review upsert', async () => {
    send.mockResolvedValue({ Attributes: {} });
    await submissionReviewsRepo.upsert('sub1', 'admin1', { rating: 4, notes: 'ok' });
    const { input } = send.mock.calls[0][0];
    expect(input.Key).toEqual({ submissionId: 'sub1', adminUserId: 'admin1' });
    expect(input.UpdateExpression).toContain('if_not_exists(#createdAt');
    expect(input.UpdateExpression).toContain('#updatedBy = :actor');
  });
});

describe('optimistic concurrency', () => {
  it('adds an updatedAt condition on CFP updates', async () => {
    send.mockResolvedValue({ Attributes: {} });
    await cfpsRepo.update('c1', { title: 'x' }, 'u', '2025-01-01T00:00:00.000Z');
    const { input } = send.mock.calls[0][0];
    expect(input.ConditionExpression).toContain('#updatedAt = :expected');
    expect(input.ExpressionAttributeValues[':expected']).toBe('2025-01-01T00:00:00.000Z');
  });

  it('adds an updatedAt condition on submission updates', async () => {
    send.mockResolvedValue({ Attributes: {} });
    await submissionsRepo.update('s1', { talkTitle: 'x' }, 'u', '2025-01-01T00:00:00.000Z');
    const { input } = send.mock.calls[0][0];
    expect(input.ConditionExpression).toContain('#updatedAt = :expected');
  });

  it('propagates ConditionalCheckFailedException on mismatch', async () => {
    const err = Object.assign(new Error('failed'), { name: 'ConditionalCheckFailedException' });
    send.mockRejectedValue(err);
    await expect(cfpsRepo.update('c1', { title: 'x' }, 'u', 'stale')).rejects.toMatchObject({
      name: 'ConditionalCheckFailedException',
    });
  });
});

describe('GSI queries', () => {
  beforeEach(() => send.mockResolvedValue({ Items: [] }));

  const cases: Array<[string, () => Promise<unknown>, string | undefined, string, string]> = [
    ['events by status', () => eventsRepo.listByStatus('scheduled'), 'StatusDateIndex', 'status', 'scheduled'],
    ['speaker by userId', () => speakersRepo.listByUserId('u1'), 'UserIdIndex', 'userId', 'u1'],
    ['submissions by cfp', () => submissionsRepo.listByCfp('c1'), 'CfpIndex', 'cfpId', 'c1'],
    ['submissions by speaker', () => submissionsRepo.listBySpeaker('s1'), 'SpeakerIndex', 'speakerId', 's1'],
    ['bookings by event', () => bookingsRepo.listByEvent('e1'), 'EventIndex', 'eventId', 'e1'],
    ['bookings by speaker', () => bookingsRepo.listBySpeaker('s1'), 'SpeakerIndex', 'speakerId', 's1'],
    ['reviews by submission', () => submissionReviewsRepo.listBySubmission('sub1'), undefined, 'submissionId', 'sub1'],
  ];

  it.each(cases)('%s', async (_n, run, index, attr, value) => {
    await run();
    const { input } = send.mock.calls[0][0];
    expect(input.IndexName).toBe(index);
    expect(input.ExpressionAttributeNames['#k']).toBe(attr);
    expect(input.ExpressionAttributeValues[':v']).toBe(value);
  });

  it('follows pagination', async () => {
    send
      .mockResolvedValueOnce({ Items: [{ a: 1 }], LastEvaluatedKey: { k: 1 } })
      .mockResolvedValueOnce({ Items: [{ a: 2 }] });
    const items = await bookingsRepo.listByEvent('e1');
    expect(items).toHaveLength(2);
    expect(send.mock.calls[1][0].input.ExclusiveStartKey).toEqual({ k: 1 });
  });
});

describe('cfpsRepo.listByStatus (scan, not the StatusIndex GSI)', () => {
  const item = (cfpId: string, status: string, closesAt?: string) => ({ cfpId, status, ...(closesAt ? { closesAt } : {}) });

  it('scans the table so CFPs without closesAt (absent from the GSI) are still returned', async () => {
    send.mockResolvedValue({
      Items: [
        item('standing', 'open'),
        item('late', 'open', '2030-06-01T00:00:00Z'),
        item('soon', 'open', '2030-01-01T00:00:00Z'),
        item('done', 'closed', '2020-01-01T00:00:00Z'),
        item('wip', 'draft'),
      ],
    });
    const open = await cfpsRepo.listByStatus('open');
    const cmd = send.mock.calls[0][0];
    expect(cmd.input.KeyConditionExpression).toBeUndefined(); // not a Query
    expect(cmd.input.IndexName).toBeUndefined();
    // Soonest close first; standing CFPs last; other statuses filtered out.
    expect(open.map((c) => c.cfpId)).toEqual(['soon', 'late', 'standing']);
  });

  it('follows scan pagination', async () => {
    send
      .mockResolvedValueOnce({ Items: [item('a', 'open')], LastEvaluatedKey: { cfpId: 'a' } })
      .mockResolvedValueOnce({ Items: [item('b', 'open')] });
    expect((await cfpsRepo.listByStatus('open')).map((c) => c.cfpId)).toEqual(['a', 'b']);
  });

  it('removes closesAt (REMOVE) when an update clears it', async () => {
    send.mockResolvedValue({ Attributes: {} });
    await cfpsRepo.update('c1', { closesAt: undefined }, 'u', 't0');
    const { input } = send.mock.calls[0][0];
    expect(input.UpdateExpression).toMatch(/REMOVE #a0/);
    expect(input.ExpressionAttributeNames['#a0']).toBe('closesAt');
  });
});