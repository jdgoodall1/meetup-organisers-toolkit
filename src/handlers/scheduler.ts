// Scheduler Lambda handler

import { SQSEvent } from 'aws-lambda';
import { validateConfig } from '../shared/config';

export const handler = async (
  event: SQSEvent
): Promise<void> => {
  try {
    validateConfig();

    console.log('Scheduler handler triggered with messages:', event.Records.length);
    
    for (const record of event.Records) {
      console.log('Processing message:', record.body);
      // Scheduling logic will be implemented in later tasks
    }
  } catch (error) {
    console.error('Scheduler handler error:', error);
    throw error;
  }
};