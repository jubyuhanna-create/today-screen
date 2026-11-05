import { isAuthed, unauthorized } from '@/lib/auth';
import { ping } from '@/lib/broadcast';
import { actionToInput, think } from '@/lib/gemini';
import { store } from '@/lib/store';
import { createEvent, deleteEvent, isConnected, upcomingEvents, updateEvent } from '@/lib/google';
import type { CalEvent } from '@/lib/types';
import { TZ, isoDay } from '@/lib/time';

export const maxDuration = 60;

export async function POST(req: Request) {
  if (!(await isAuthed())) return unauthorized();
  const body = await req.json().catch(() => null);
  const source = body?.source === 'tv' ? 'tv' : 'phone';
  if (!body || (!body.text && !body.audio)) {
    return Response.json({ error: 'Nothing was sent' }, { status: 400 });
  }

  const s = store();
  const items = await s.list();
  let events: CalEvent[] = [];
  let calendar = false;
  try {
    calendar = await isConnected();
    if (calendar) events = await upcomingEvents();
  } catch {
    calendar = false; // calendar trouble never blocks tasks
  }
  let result;
  try {
    result = await think({ text: body.text, audio: body.audio, mime: body.mime }, items, events, calendar);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('think failed:', msg);
    const why = msg.includes('GEMINI_API_KEY') ? 'Add your Gemini key in Vercel first'
      : /429|quota|RESOURCE_EXHAUSTED/i.test(msg) ? 'Gemini daily limit reached. Try again later'
      : /timeout|abort/i.test(msg) ? 'The AI took too long. Try again'
      : 'The AI did not answer: ' + msg.slice(0, 140);
    return Response.json({ error: why, detail: msg }, { status: 502 });
  }

  const ids = new Set(items.map((i) => i.id));
  const eventIds = new Set(events.map((e) => e.id));
  const applied: string[] = [];
  let calendarError = '';
  for (const a of result.actions) {
    try {
      if (a.op === 'add_event' || a.op === 'update_event' || a.op === 'delete_event') {
        if (!calendar) {
          // No calendar connected: keep the appointment as a task at that day and time instead of losing it.
          if (a.op === 'add_event' && a.text && a.start && a.text.length <= 120) {
            const when = new Date(a.start);
            const day = isNaN(when.getTime()) ? null : isoDay(when);
            const time = a.all_day || /^\d{4}-\d{2}-\d{2}$/.test(a.start) || isNaN(when.getTime())
              ? null
              : new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }).format(when);
            const it = await s.create({ kind: 'task', text: a.text, due_date: day ?? a.start.slice(0, 10), due_time: time, source });
            applied.push(it.id);
          }
          continue;
        }
        const ev = { title: a.text || undefined, start: a.start || undefined, end: a.end, allDay: !!a.all_day, location: a.location };
        if (a.op === 'add_event') {
          if (!ev.title || !ev.start || ev.title.length > 120) continue;
          applied.push((await createEvent(ev)).id);
        } else if (a.event_id && eventIds.has(a.event_id)) {
          if (a.op === 'delete_event') await deleteEvent(a.event_id);
          else await updateEvent(a.event_id, ev);
          applied.push(a.event_id);
        }
        continue;
      }
      if (a.op === 'add') {
        const input = actionToInput(a, source);
        if (!input.text || input.text.length > 120 || input.text.includes('\n')) continue;
        const it = await s.create(input);
        applied.push(it.id);
      } else if (a.id && ids.has(a.id)) {
        if (a.op === 'complete') await s.update(a.id, { done: true });
        else if (a.op === 'reopen') await s.update(a.id, { done: false });
        else if (a.op === 'delete') await s.remove(a.id);
        else if (a.op === 'update') await s.update(a.id, actionToInput(a, source));
        applied.push(a.id);
      }
    } catch (e) {
      // skip a bad action, keep the rest
      if (a.op.endsWith('_event')) calendarError = e instanceof Error ? e.message : 'Google Calendar did not answer';
    }
  }

  if (result.summary) await s.setSummary({ date: isoDay(), text: result.summary });
  await ping();

  return Response.json({
    transcript: result.transcript,
    language: result.language,
    reply: calendarError || result.reply,
    intent: result.intent,
    answer: result.answer,
    schedule_day: result.intent === 'schedule' ? result.schedule_day : null,
    changed: applied,
  });
}
