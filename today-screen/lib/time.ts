export const TZ = process.env.NEXT_PUBLIC_TZ || 'Asia/Jerusalem';

function parts(d: Date, tz = TZ) {
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', weekday: 'long', hour12: false,
  });
  const o: Record<string, string> = {};
  for (const p of f.formatToParts(d)) o[p.type] = p.value;
  return o;
}

export function isoDay(d = new Date(), tz = TZ) {
  const p = parts(d, tz);
  return `${p.year}-${p.month}-${p.day}`;
}

export function addDays(day: string, n: number) {
  const d = new Date(day + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function nowDescription(tz = TZ) {
  const d = new Date();
  const p = parts(d, tz);
  const hour = p.hour === '24' ? '00' : p.hour;
  return `${p.weekday} ${p.year}-${p.month}-${p.day}, ${hour}:${p.minute} (${tz}, UTC offset ${offset(d, tz)})`;
}

export function offset(d = new Date(), tz = TZ) {
  const local = new Date(d.toLocaleString('en-US', { timeZone: tz }));
  const utc = new Date(d.toLocaleString('en-US', { timeZone: 'UTC' }));
  const mins = Math.round((local.getTime() - utc.getTime()) / 60000);
  const sign = mins >= 0 ? '+' : '-';
  const a = Math.abs(mins);
  return `${sign}${String(Math.floor(a / 60)).padStart(2, '0')}:${String(a % 60).padStart(2, '0')}`;
}
