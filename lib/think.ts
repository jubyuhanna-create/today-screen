import { ping } from './broadcast';
import { actionToInput, cleanText, think } from './gemini';
import { store } from './store';
import { createEvent, deleteEvent, isConnected, upcomingEvents, updateEvent } from './google';
import type { CalEvent } from './types';
import { forecastForPrompt, getForecast } from './weather';
import { TZ, isoDay, offset } from './time';

export interface ThinkInput { text?: string; audio?: string; mime?: string }
export interface ThinkReplyBody {
  transcript: string; language: string; reply: string; intent: string; answer: string;
  schedule_day: string | null; weather_day: number | null; changed: string[];
}
export type ThinkOutcome = { ok: true; body: ThinkReplyBody } | { ok: false; status: number; error: string; detail?: string };

/** Understands what was said, applies it, and returns what to show or say. Shared by the screens and Alexa. */
export async function runThink(body: ThinkInput, source: string, budget = 52000): Promise<ThinkOutcome> {
  const s = store();
  const items = await s.list();
  let events: CalEvent[] = [];
  let calendar = false;
  const [, weather] = await Promise.all([
    (async () => {
      try {
        calendar = await isConnected();
        if (calendar) events = await upcomingEvents();
      } catch {
        calendar = false; // calendar trouble never blocks tasks
      }
    })(),
    getForecast(budget < 20000 ? 1500 : 3000).then(forecastForPrompt).catch(() => ''), // weather is a bonus, never a blocker
  ]);
  let result;
  try {
    // The Echo speaks English only, so answers that go to Alexa must be in English.
    const text = source === 'alexa' && body.text
      ? `${body.text}\n[He said this to an Alexa speaker that can only speak English. Write answer and reply in English. Task and event text stays in the language he used.]`
      : body.text;
    result = await think({ text, audio: body.audio, mime: body.mime }, items, events, calendar, weather, budget);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('think failed:', msg);
    const why = msg.includes('GEMINI_API_KEY') ? 'Add your Gemini key in Vercel first'
      : /429|quota|RESOURCE_EXHAUSTED/i.test(msg) ? 'Gemini daily limit reached. Try again later'
      : /timeout|abort/i.test(msg) ? 'The AI took too long. Try again'
      : 'The AI did not answer: ' + msg.slice(0, 140);
    return { ok: false, status: 502, error: why, detail: msg };
  }

  console.log('think:', JSON.stringify({ intent: result.intent, transcript: result.transcript, actions: result.actions }));
  const ids = new Set(items.map((i) => i.id));
  // Weaker fallback models sometimes leave fields empty: fill what we can instead of dropping the action.
  for (const a of result.actions) {
    if (a.op !== 'add_event') continue;
    const x = a as typeof a & { title?: string; due_date?: string | null; due_time?: string | null };
    if (!a.text) a.text = x.title || result.transcript || null;
    if (!a.start && x.due_date) a.start = x.due_time ? `${x.due_date}T${x.due_time.slice(0, 5)}:00${offset()}` : x.due_date;
    if (a.text) a.text = cleanText(a.text);
  }
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
          if (!ev.title || !ev.start || ev.title.length > 120) {
            calendarError = 'Could not add the event: no time was understood. Say the day and the hour';
            continue;
          }
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

  const out: ThinkReplyBody = {
    transcript: result.transcript,
    language: result.language,
    reply: calendarError || (result.intent === 'organize' && result.actions.length > 0 && applied.length === 0 ? 'Nothing was saved. Try saying it again' : result.reply),
    intent: result.intent,
    answer: result.answer,
    schedule_day: result.intent === 'schedule' ? result.schedule_day : null,
    weather_day: result.intent === 'weather' ? Math.max(0, Math.min(6, Number(result.weather_day) || 0)) : null,
    changed: applied,
  };
  // Requests from elsewhere (Alexa) also show up on the TV.
  if (source !== 'tv' && source !== 'phone') {
    await s.setMeta('last_reply', { ...out, source, at: Date.now() });
    await ping();
  }
  return { ok: true, body: out };
}
