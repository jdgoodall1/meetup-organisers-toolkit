// Must match the backend limits in src/shared/validation.ts.
export const HEADSHOT_MAX_BYTES = 5 * 1024 * 1024;
export const HEADSHOT_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/** Returns an error message, or undefined when the file is acceptable. */
export function checkHeadshotFile(file: { type: string; size: number }): string | undefined {
  if (!HEADSHOT_CONTENT_TYPES.includes(file.type.toLowerCase())) {
    return 'Headshot must be a JPEG, PNG or WebP image';
  }
  if (file.size <= 0) return 'Headshot file is empty';
  if (file.size > HEADSHOT_MAX_BYTES) return 'Headshot must be 5 MB or smaller';
  return undefined;
}

