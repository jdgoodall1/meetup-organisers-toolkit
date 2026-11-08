/** Choices for the fixed talk fields on the submission form. Values match the backend. */

export interface Choice {
  /** What is sent to the API (as a number). */
  value: number;
  label: string;
}

/** Length bands; the stored value is the upper bound of the band, in minutes. */
export const DURATION_OPTIONS: Choice[] = [
  { value: 15, label: 'Under 15 minutes' },
  { value: 30, label: '15 to 30 minutes' },
  { value: 45, label: '30 to 45 minutes' },
  { value: 60, label: '45 to 60 minutes' },
];

/** Talk levels: 100 is introductory, 500 is expert. */
export const LEVEL_OPTIONS: Choice[] = [100, 200, 300, 400, 500].map((n) => ({ value: n, label: String(n) }));

/** Readable duration for any stored value, including older free-form minutes. */
export function formatDuration(minutes: number | undefined | null): string {
  if (!minutes || minutes <= 0) return 'Not set';
  return DURATION_OPTIONS.find((o) => o.value === minutes)?.label ?? `${minutes} minutes`;
}

export function formatLevel(level: number | undefined | null): string {
  return level ? `Level ${level}` : 'Not set';
}
