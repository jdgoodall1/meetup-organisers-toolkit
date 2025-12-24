// Shared utility functions

import { v4 as uuidv4 } from 'uuid';
import { ApiResponse } from './types';

/**
 * Generate a unique ID
 */
export function generateId(): string {
  return uuidv4();
}

/**
 * Create a standardized API response
 */
export function createResponse<T>(
  statusCode: number,
  data?: T,
  headers?: Record<string, string>
): { statusCode: number; body: string; headers: Record<string, string> } {
  const response: ApiResponse<T> = {
    success: statusCode >= 200 && statusCode < 300,
    data,
  };

  return {
    statusCode,
    body: JSON.stringify(response),
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
      ...headers,
    },
  };
}

/**
 * Handle errors and create error responses
 */
export function handleError(error: unknown): { statusCode: number; body: string; headers: Record<string, string> } {
  console.error('Error:', error);
  
  const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
  
  // Determine status code based on error type
  let statusCode = 500;
  if (errorMessage.includes('authorization') || errorMessage.includes('token') || errorMessage.includes('auth')) {
    statusCode = 401;
  } else if (errorMessage.includes('not found')) {
    statusCode = 404;
  } else if (errorMessage.includes('validation') || errorMessage.includes('invalid') || errorMessage.includes('required')) {
    statusCode = 400;
  }

  const response: ApiResponse = {
    success: false,
    error: errorMessage,
  };

  return {
    statusCode,
    body: JSON.stringify(response),
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    },
  };
}

/**
 * Parse and validate date strings
 */
export function parseDate(dateString: string): Date {
  const date = new Date(dateString);
  if (isNaN(date.getTime())) {
    throw new Error(`Invalid date format: ${dateString}`);
  }
  return date;
}

/**
 * Format date for DynamoDB storage (ISO string)
 */
export function formatDateForStorage(date: Date): string {
  return date.toISOString();
}

/**
 * Calculate scheduled post times based on event date
 */
export function calculatePostSchedule(eventDate: Date, scheduleInDays: number[]): Date[] {
  return scheduleInDays.map(days => {
    const postDate = new Date(eventDate);
    postDate.setDate(postDate.getDate() - days);
    return postDate;
  });
}

/**
 * Validate email format
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Sanitize string input
 */
export function sanitizeString(input: string): string {
  return input.trim().replace(/[<>]/g, '');
}

/**
 * Check if a date is in the future
 */
export function isFutureDate(date: Date): boolean {
  return date.getTime() > Date.now();
}

/**
 * Retry function with exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  let lastError: Error;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      
      if (attempt === maxRetries) {
        break;
      }

      const delay = baseDelay * Math.pow(2, attempt);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError!;
}

/**
 * Deep clone an object
 */
export function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}