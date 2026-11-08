import type { AdminCfp } from '../services/apiTypes';
import { formatEventDate } from './eventDates';

/** Plain-text status: stored status plus the status that currently applies by date. */
export function describeCfpStatus(cfp: Pick<AdminCfp, 'status' | 'effectiveStatus'> & { closesAt?: string }): string {
  const applied = cfp.effectiveStatus ?? cfp.status;
  if (!cfp.closesAt && cfp.status === 'open' && applied === 'open') {
    return `Stored: ${cfp.status}. No close date, so it stays open until closed.`;
  }
  if (!cfp.closesAt) {
    return `Stored: ${cfp.status}. No close date, so once open it stays open until closed.`;
  }
  return `Stored: ${cfp.status}. Currently ${applied} by date.`;
}

/** Speaker-facing closing line; never renders an invalid date for a standing CFP. */
export function describeCfpCloses(closesAt?: string): string {
  return closesAt ? `Closes ${formatEventDate(closesAt)}` : 'Open until further notice';
}