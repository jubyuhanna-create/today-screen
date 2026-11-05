import type { CalEvent, Item } from '../types';
import { addDays } from '../time';

const byTask = (a: Item, b: Item) =>
  Number(a.done) - Number(b.done) ||
  a.priority - b.priority ||
  (a.due_time || '99').localeCompare(b.due_time || '99') ||
  a.created_at.localeCompare(b.created_at);

export function group(items: Item[], today: string, now = new Date()) {
  const tomorrow = addDays(today, 1);
  const tasks = items.filter((i) => i.kind === 'task');
  const todayTasks = tasks
    .filter((i) =>
      i.done
        ? !!i.done_at && isSameLocalDay(i.done_at, today) && (!i.due_date || i.due_date <= today)
        : !i.due_date || i.due_date <= today,
    )
    .sort(byTask);
  const tomorrowTasks = tasks.filter((i) => !i.done && i.due_date === tomorrow).sort(byTask);
  const laterTasks = tasks
    .filter((i) => !i.done && i.due_date && i.due_date > tomorrow)
    .sort((a, b) => a.due_date!.localeCompare(b.due_date!) || byTask(a, b));
  const ideas = items.filter((i) => i.kind === 'idea' && !i.done).sort((a, b) => b.created_at.localeCompare(a.created_at));
  const reminders = items
    .filter((i) => i.kind === 'reminder' && !i.done && i.remind_at)
    .sort((a, b) => a.remind_at!.localeCompare(b.remind_at!));
  const nextReminder = reminders.find((r) => new Date(r.remind_at!).getTime() > now.getTime() - 15 * 60000) || null;
  const doneCount = todayTasks.filter((t) => t.done).length;
  return { todayTasks, tomorrowTasks, laterTasks, ideas, reminders, nextReminder, doneCount, total: todayTasks.length };
}

function isSameLocalDay(iso: string, today: string) {
  const tz = process.env.NEXT_PUBLIC_TZ || 'Asia/Jerusalem';
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date(iso)) === today;
}

export function shortDay(day: string, today: string) {
  if (day === today) return 'Today';
  if (day === addDays(today, 1)) return 'Tomorrow';
  if (day === addDays(today, -1)) return 'Yesterday';
  const d = new Date(day + 'T12:00:00Z');
  const diff = (d.getTime() - new Date(today + 'T12:00:00Z').getTime()) / 86400000;
  if (diff > 0 && diff < 7) return d.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

export function relTime(iso: string, now = new Date()) {
  const mins = Math.round((new Date(iso).getTime() - now.getTime()) / 60000);
  if (mins <= 0 && mins > -15) return 'Now';
  if (mins < 0) return 'Missed';
  if (mins < 60) return `In ${mins} min`;
  const h = Math.floor(mins / 60);
  if (h < 12) return `In ${h} h ${mins % 60 ? (mins % 60) + ' min' : ''}`.trim();
  return clock(iso);
}

export function clock(iso: string) {
  const tz = process.env.NEXT_PUBLIC_TZ || 'Asia/Jerusalem';
  return new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
}

// ---------- Calendar ----------


const TZV = process.env.NEXT_PUBLIC_TZ || 'Asia/Jerusalem';

export function localDayOf(iso: string) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZV }).format(new Date(iso));
}

/** Events that happen on a given day (YYYY-MM-DD), all-day first, then by start. */
export function eventsOn(events: CalEvent[], day: string) {
  return events
    .filter((e) => (e.allDay ? e.start <= day && day < e.end : localDayOf(e.start) === day))
    .sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.start.localeCompare(b.start));
}

export function eventTime(e: CalEvent) {
  if (e.allDay) return 'All day';
  return `${clock(e.start)}–${clock(e.end)}`;
}

export function isPast(e: CalEvent, now = new Date()) {
  return !e.allDay && new Date(e.end).getTime() < now.getTime();
}

/** The next timed event today that has not started yet, or is happening now. */
export function nextEvent(events: CalEvent[], today: string, now = new Date()) {
  return eventsOn(events, today).find((e) => !e.allDay && new Date(e.end).getTime() > now.getTime()) || null;
}
