import { config } from '../config';
import { QuestionTemplate } from '../models';
import { deleteItem, getItem, NewItem, putItem, scanAll, updateItem } from './base';

const table = () => config.tables.questionTemplates;
const key = (templateId: string) => ({ templateId });

export const questionTemplatesRepo = {
  create: (item: NewItem<QuestionTemplate>, actor: string) =>
    putItem<QuestionTemplate>(table(), item, actor, 'templateId'),
  get: (templateId: string) => getItem<QuestionTemplate>(table(), key(templateId)),
  update: (
    templateId: string,
    patch: Partial<NewItem<QuestionTemplate>>,
    actor: string,
    expectedUpdatedAt?: string,
  ) => updateItem<QuestionTemplate>(table(), key(templateId), patch, actor, { expectedUpdatedAt }),
  delete: (templateId: string) => deleteItem(table(), key(templateId)),
  listAll: () => scanAll<QuestionTemplate>(table()),
};
