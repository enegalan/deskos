import type { DateFormat, SystemSettings } from './kernel';

/**
 * Format the date portion of the dock clock.
 *
 * @param date - Instant to format
 * @param dateFormat - Chosen date layout
 * @param timeZone - IANA timezone
 */
function formatDockDate(date: Date, dateFormat: DateFormat, timeZone: string): string {
  switch (dateFormat) {
    case 'long':
      return new Intl.DateTimeFormat('en-US', {
        timeZone,
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }).format(date);
    case 'iso':
      return new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(date);
    case 'dmy':
      return new Intl.DateTimeFormat('en-GB', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(date);
    case 'mdy':
      return new Intl.DateTimeFormat('en-US', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(date);
    case 'medium':
    default:
      return new Intl.DateTimeFormat('en-US', {
        timeZone,
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      }).format(date);
  }
}

/**
 * Format the dock tray clock from system settings.
 *
 * @param date - Instant to format
 * @param settings - Time/date display settings
 * @returns Localized dock clock string
 */
export function formatDockClock(date: Date, settings: SystemSettings): string {
  const timeOptions: Intl.DateTimeFormatOptions = {
    timeZone: settings.timezone,
    hour12: settings.timeFormat === '12h',
    hour: '2-digit',
    minute: '2-digit',
  };
  if (settings.showSeconds) {
    timeOptions.second = '2-digit';
  }

  const time = new Intl.DateTimeFormat('en-US', timeOptions).format(date);
  if (!settings.showDate) {
    return time;
  }

  const datePart = formatDockDate(date, settings.dateFormat, settings.timezone);
  return `${datePart} ${time}`;
}
