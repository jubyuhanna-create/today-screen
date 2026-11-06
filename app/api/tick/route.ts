import { isConnected, upcomingEvents } from '@/lib/google';
import { once, pushConfigured, sendPush, type Note } from '@/lib/push';
import { store } from '@/lib/store';
import { TZ, isoDay } from '@/lib/time';
import { DAYS, SCHEDULE, keyForJsDay } from '@/lib/schedule';
import { SKY_WORD, getForecast } from '@/lib/weather';

export const dynamic = 'force-dynamic';

// Runs every minute (from cron-job.org). Sends what is due right now, each thing once.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const url = new URL(req.url);
  const given = url.searchParams.get('key') || req.headers.get('authorization')?.replace('Bearer ', '');
  if (secret && given !== secret) return Response.json({ error: 'Not allowed' }, { status: 401 });
  if (!pushConfigured()) return Response.json({ ok: true, skipped: 'push not configured' });

  const now = new Date();
  const t = now.getTime();
  const today = isoDay(now);
  const hm = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }).format(now);
  const s = store();
  const items = await s.list();
  const due: { key: string; note: Note }[] = [];
  const within = (ms: number, before = 5 * 60000) => ms <= t + 30000 && ms > t - before;

  // Reminders, at their time.
  for (const r of items) {
    if (r.kind === 'reminder' && !r.done && r.remind_at && within(new Date(r.remind_at).getTime())) {
      due.push({ key: `r:${r.id}:${r.remind_at}`, note: { title: 'Reminder', body: r.text, tag: r.id } });
    }
  }
  // Tasks with a time today, at that time.
  for (const k of items) {
    if (k.kind === 'task' && !k.done && k.due_date === today && k.due_time) {
      const at = zoned(today, k.due_time).getTime();
      if (within(at)) due.push({ key: `t:${k.id}:${today}:${k.due_time}`, note: { title: `Now, ${k.due_time}`, body: k.text, tag: k.id } });
    }
  }
  // Calendar events, 10 minutes before.
  try {
    if (await isConnected()) {
      for (const e of await upcomingEvents()) {
        if (e.allDay) continue;
        const start = new Date(e.start).getTime();
        if (start - t <= 10 * 60000 + 30000 && start - t > 0) {
          const time = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }).format(new Date(e.start));
          due.push({ key: `e:${e.id}:${e.start}`, note: { title: `At ${time}${e.location ? ', ' + e.location : ''}`, body: e.title, tag: e.id } });
        }
      }
    }
  } catch {
    // calendar trouble never blocks reminders
  }
  // Morning brief at 07:30.
  if (hm >= '07:30' && hm < '07:40') {
    const open = items.filter((i) => i.kind === 'task' && !i.done && (!i.due_date || i.due_date <= today));
    const key = keyForJsDay(new Date(now.toLocaleString('en-US', { timeZone: TZ })).getDay());
    const first = key ? SCHEDULE[key][0] : null;
    let wx = '';
    try {
      const f = await getForecast(3000);
      wx = `${f.days[0].max}° and ${SKY_WORD[f.days[0].sky].toLowerCase()}${f.days[0].rain >= 40 ? `, ${f.days[0].rain}% rain` : ''}. `;
    } catch {}
    const day = DAYS.find((d) => d.key === key);
    const school = first && day ? `First lesson: ${first.subjects.join(' / ')}. ` : '';
    due.push({ key: `m:${today}`, note: { title: 'Good morning', body: `${wx}${school}${open.length ? `${open.length} task${open.length > 1 ? 's' : ''} today.` : 'Nothing planned yet.'}`, tag: 'morning' } });
  }
  // Evening check at 21:30, only if something is still open today.
  if (hm >= '21:30' && hm < '21:40') {
    const left = items.filter((i) => i.kind === 'task' && !i.done && i.due_date && i.due_date <= today);
    if (left.length) {
      due.push({ key: `n:${today}`, note: { title: `${left.length} left for today`, body: left.slice(0, 3).map((i) => i.text).join('، '), tag: 'evening' } });
    }
  }

  const fresh = await once(due.map((d) => d.key));
  let sent = 0;
  for (const d of due) if (fresh.has(d.key)) sent += await sendPush({ ...d.note, url: '/phone' });
  return Response.json({ ok: true, due: due.length, sent });
}

function zoned(day: string, time: string) {
  const guess = new Date(`${day}T${time}:00Z`);
  const local = new Date(guess.toLocaleString('en-US', { timeZone: TZ }));
  const utc = new Date(guess.toLocaleString('en-US', { timeZone: 'UTC' }));
  return new Date(guess.getTime() - (local.getTime() - utc.getTime()));
}
