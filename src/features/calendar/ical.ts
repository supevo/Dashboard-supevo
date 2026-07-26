import 'server-only';

export interface IcalEvent {
  uid: string;
  date: string; // YYYY-MM-DD
  endDate?: string; // exclusive end for multi-day all-day events
  startTime?: string | null; // HH:MM
  endTime?: string | null;
  summary: string;
  description?: string | null;
  location?: string | null;
}

function esc(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

function d(iso: string): string {
  return iso.replace(/-/g, '');
}
function addDay(iso: string): string {
  const dt = new Date(`${iso}T00:00:00Z`);
  dt.setUTCDate(dt.getUTCDate() + 1);
  return dt.toISOString().slice(0, 10);
}

/** Builds a VCALENDAR (iCal) document from events. CRLF line endings. */
export function buildIcal(name: string, events: IcalEvent[]): string {
  const stamp =
    new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Supevo//Dashboard//DE',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${esc(name)}`,
    'X-WR-TIMEZONE:Europe/Berlin',
  ];

  for (const e of events) {
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${e.uid}`);
    lines.push(`DTSTAMP:${stamp}`);
    if (e.startTime) {
      const t = e.startTime.replace(':', '') + '00';
      lines.push(`DTSTART:${d(e.date)}T${t}`);
      const endT = (e.endTime || e.startTime).replace(':', '') + '00';
      lines.push(`DTEND:${d(e.date)}T${endT}`);
    } else {
      lines.push(`DTSTART;VALUE=DATE:${d(e.date)}`);
      lines.push(`DTEND;VALUE=DATE:${d(e.endDate ?? addDay(e.date))}`);
    }
    lines.push(`SUMMARY:${esc(e.summary)}`);
    if (e.description) lines.push(`DESCRIPTION:${esc(e.description)}`);
    if (e.location) lines.push(`LOCATION:${esc(e.location)}`);
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}
