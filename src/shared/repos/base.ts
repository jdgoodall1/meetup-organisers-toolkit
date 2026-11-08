// Thin DynamoDB helpers shared by the table repos.
// Every write stamps audit fields. Updates may carry an optimistic
// concurrency check on updatedAt; a mismatch raises
// ConditionalCheckFailedException (mapped to Conflict by shared/http.ts).

import {
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  ScanCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { dynamoDocClient } from '../aws-clients';
import { AuditFields } from '../models';

export type Key = Record<string, string>;

const AUDIT_KEYS = ['createdAt', 'createdBy', 'updatedAt', 'updatedBy'];

export type NewItem<T extends AuditFields> = Omit<T, keyof AuditFields>;

export async function putItem<T extends AuditFields>(
  table: string,
  item: NewItem<T>,
  actor: string,
  keyAttr: string,
): Promise<T> {
  const now = new Date().toISOString();
  const full = {
    ...item,
    createdAt: now,
    createdBy: actor,
    updatedAt: now,
    updatedBy: actor,
  } as unknown as T;
  await dynamoDocClient.send(
    new PutCommand({
      TableName: table,
      Item: full,
      // Create only; never silently overwrite an existing item.
      ConditionExpression: 'attribute_not_exists(#k)',
      ExpressionAttributeNames: { '#k': keyAttr },
    }),
  );
  return full;
}

export async function getItem<T>(table: string, key: Key): Promise<T | undefined> {
  const res = await dynamoDocClient.send(new GetCommand({ TableName: table, Key: key }));
  return res.Item as T | undefined;
}

export interface UpdateOptions {
  /** When set, the write succeeds only if the stored updatedAt equals this value. */
  expectedUpdatedAt?: string;
}

export async function updateItem<T extends AuditFields>(
  table: string,
  key: Key,
  patch: Partial<Omit<T, keyof AuditFields>>,
  actor: string,
  options: UpdateOptions = {},
): Promise<T> {
  const now = new Date().toISOString();
  const names: Record<string, string> = {};
  const values: Record<string, unknown> = {};
  const sets: string[] = [];
  const removes: string[] = [];

  let i = 0;
  for (const [attr, val] of Object.entries(patch)) {
    if (AUDIT_KEYS.includes(attr) || attr in key) continue;
    const n = `#a${i}`;
    names[n] = attr;
    if (val === undefined) {
      removes.push(n);
    } else {
      const v = `:v${i}`;
      values[v] = val;
      sets.push(`${n} = ${v}`);
    }
    i++;
  }
  names['#updatedAt'] = 'updatedAt';
  names['#updatedBy'] = 'updatedBy';
  values[':now'] = now;
  values[':actor'] = actor;
  sets.push('#updatedAt = :now', '#updatedBy = :actor');

  const firstKey = Object.keys(key)[0];
  names['#pk'] = firstKey;
  // Always require the item to exist so update never creates a partial item.
  let condition = 'attribute_exists(#pk)';
  if (options.expectedUpdatedAt !== undefined) {
    values[':expected'] = options.expectedUpdatedAt;
    condition += ' AND #updatedAt = :expected';
  }

  let expr = `SET ${sets.join(', ')}`;
  if (removes.length) expr += ` REMOVE ${removes.join(', ')}`;

  const res = await dynamoDocClient.send(
    new UpdateCommand({
      TableName: table,
      Key: key,
      UpdateExpression: expr,
      ConditionExpression: condition,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
      ReturnValues: 'ALL_NEW',
    }),
  );
  return res.Attributes as T;
}

export async function deleteItem(table: string, key: Key): Promise<void> {
  await dynamoDocClient.send(new DeleteCommand({ TableName: table, Key: key }));
}

export interface QueryOptions {
  /** Sort-key direction; defaults to ascending. */
  descending?: boolean;
  limit?: number;
}

/** Query a GSI (or the table) by partition key, following pagination. */
export async function queryAll<T>(
  table: string,
  indexName: string | undefined,
  keyAttr: string,
  keyValue: string,
  options: QueryOptions = {},
): Promise<T[]> {
  const items: T[] = [];
  let startKey: Record<string, unknown> | undefined;
  do {
    const res = await dynamoDocClient.send(
      new QueryCommand({
        TableName: table,
        IndexName: indexName,
        KeyConditionExpression: '#k = :v',
        ExpressionAttributeNames: { '#k': keyAttr },
        ExpressionAttributeValues: { ':v': keyValue },
        ScanIndexForward: !options.descending,
        ExclusiveStartKey: startKey,
        Limit: options.limit ? options.limit - items.length : undefined,
      }),
    );
    items.push(...((res.Items ?? []) as T[]));
    startKey = res.LastEvaluatedKey;
  } while (startKey && (!options.limit || items.length < options.limit));
  return items;
}

export async function scanAll<T>(table: string): Promise<T[]> {
  const items: T[] = [];
  let startKey: Record<string, unknown> | undefined;
  do {
    const res = await dynamoDocClient.send(
      new ScanCommand({ TableName: table, ExclusiveStartKey: startKey }),
    );
    items.push(...((res.Items ?? []) as T[]));
    startKey = res.LastEvaluatedKey;
  } while (startKey);
  return items;
}

/**
 * Create-or-update by key. createdAt/createdBy are set only on first write;
 * updatedAt/updatedBy are always stamped.
 */
export async function upsertItem<T extends AuditFields>(
  table: string,
  key: Key,
  fields: Partial<Omit<T, keyof AuditFields>>,
  actor: string,
  /** Attribute names to remove in the same write. */
  removeAttrs: string[] = [],
): Promise<T> {
  const now = new Date().toISOString();
  const names: Record<string, string> = {
    '#createdAt': 'createdAt',
    '#createdBy': 'createdBy',
    '#updatedAt': 'updatedAt',
    '#updatedBy': 'updatedBy',
  };
  const values: Record<string, unknown> = { ':now': now, ':actor': actor };
  const sets = [
    '#createdAt = if_not_exists(#createdAt, :now)',
    '#createdBy = if_not_exists(#createdBy, :actor)',
    '#updatedAt = :now',
    '#updatedBy = :actor',
  ];
  let i = 0;
  for (const [attr, val] of Object.entries(fields)) {
    if (val === undefined || AUDIT_KEYS.includes(attr) || attr in key) continue;
    names[`#a${i}`] = attr;
    values[`:v${i}`] = val;
    sets.push(`#a${i} = :v${i}`);
    i++;
  }
  const removes: string[] = [];
  for (const attr of removeAttrs) {
    if (AUDIT_KEYS.includes(attr) || attr in key) continue;
    names[`#r${removes.length}`] = attr;
    removes.push(`#r${removes.length}`);
  }
  let expr = `SET ${sets.join(', ')}`;
  if (removes.length) expr += ` REMOVE ${removes.join(', ')}`;
  const res = await dynamoDocClient.send(
    new UpdateCommand({
      TableName: table,
      Key: key,
      UpdateExpression: expr,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
      ReturnValues: 'ALL_NEW',
    }),
  );
  return res.Attributes as T;
}
