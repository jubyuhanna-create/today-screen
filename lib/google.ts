import type { CalEvent } from './types';
import { store } from './store';
import { TZ, addDays, isoDay } from './time';

// Google Calendar, read and write, on your primary calendar.
// The refresh token lives in the meta table (server only, never sent to the browser).

const SCOPE = 'https://www.googleapis.com/auth/calendar.events';
const API = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';

interface Saved { refresh_token: string; connected_at: string }

const g = globalThis as unknown as {
  __gAccess?: { token: string; exp: number };
  __gEvents?: { at: number; key: string; events: CalEvent[] };
};

export function googleConfigured() {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function redirectUri(origin: string) {
  return process.env.GOOGLE_REDIRECT_URI || `${origin}/api/google/callback`;
}

export function authUrl(origin: string, state: string) {
  const p = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri(origin),
    response_type: 'code',
    scope: SCOPE,
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

export async function exchangeCode(code: string, origin: string) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    signal: AbortSignal.timeout(10000),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: redirectUri(origin),
      grant_type: 'authorization_code',
    }),
  });
  const data = await res.json();
  if (!res.ok || !data.refresh_token) throw new Error(data.error_description || data.error || 'No refresh token from Google');
  await store().setMeta('google', { refresh_token: data.refresh_token, connected_at: new Date().toISOString() } satisfies Saved);
  g.__gAccess = { token: data.access_token, exp: Date.now() + (data.expires_in - 60) * 1000 };
  g.__gEvents = undefined;
}

export async function disconnect() {
  await store().setMeta('google', null);
  g.__gAccess = undefined;
  g.__gEvents = undefined;
}

export async function isConnected() {
  return !!(await store().getMeta<Saved>('google'))?.refresh_token;
}

async function accessToken() {
  if (g.__gAccess && g.__gAccess.exp > Date.now()) return g.__gAccess.token;
  const saved = await store().getMeta<Saved>('google');
  if (!saved?.refresh_token) throw new Error('Google Calendar is not connected');
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    signal: AbortSignal.timeout(8000),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: saved.refresh_token,
      grant_type: 'refresh_token',
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error('Google sign-in expired. Connect Google Calendar again');
  g.__gAccess = { token: data.access_token, exp: Date.now() + (data.expires_in - 60) * 1000 };
  return data.access_token as string;
}

async function call(path: string, init: RequestInit = {}) {
  const token = await accessToken();
  const res = await fetch(`${API}${path}`, {
    ...init,
    signal: AbortSignal.timeout(8000),
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error?.message || `Google Calendar ${res.status}`);
  return data;
}

type GEvent = {
  id: string; summary?: string; location?: string; status?: string;
  start: { dateTime?: string; date?: string }; end: { dateTime?: string; date?: string };
};

function toCal(e: GEvent): CalEvent {
  const allDay = !e.start.dateTime;
  return {
    id: e.id,
    title: e.summary || '(No title)',
    start: e.start.dateTime || e.start.date!,
    end: e.end.dateTime || e.end.date!,
    allDay,
    location: e.location || null,
  };
}

/** Events from yesterday to two weeks ahead, cached for a minute. */
export async function upcomingEvents(): Promise<CalEvent[]> {
  const today = isoDay();
  const key = today;
  if (g.__gEvents && g.__gEvents.key === key && Date.now() - g.__gEvents.at < 60000) return g.__gEvents.events;
  if (store().demo && !googleConfigured()) return demoEvents(today);
  const from = new Date(`${addDays(today, -1)}T00:00:00Z`).toISOString();
  const to = new Date(`${addDays(today, 15)}T00:00:00Z`).toISOString();
  const q = new URLSearchParams({ timeMin: from, timeMax: to, singleEvents: 'true', orderBy: 'startTime', maxResults: '100', timeZone: TZ });
  const data = await call(`?${q}`);
  const events = ((data?.items as GEvent[]) || []).filter((e) => e.status !== 'cancelled').map(toCal);
  g.__gEvents = { at: Date.now(), key, events };
  return events;
}

export interface EventInput { title?: string; start?: string; end?: string | null; allDay?: boolean; location?: string | null }

function body(e: EventInput, existing?: CalEvent) {
  const out: Record<string, unknown> = {};
  if (e.title) out.summary = e.title;
  if (e.location !== undefined) out.location = e.location || '';
  if (e.start) {
    if (e.allDay || /^\d{4}-\d{2}-\d{2}$/.test(e.start)) {
      const day = e.start.slice(0, 10);
      out.start = { date: day };
      out.end = { date: e.end && /^\d{4}-\d{2}-\d{2}$/.test(e.end) ? e.end : addDays(day, 1) };
    } else {
      const start = new Date(e.start);
      const dur = existing && !existing.allDay ? new Date(existing.end).getTime() - new Date(existing.start).getTime() : 3600000;
      const end = e.end ? new Date(e.end) : new Date(start.getTime() + dur);
      out.start = { dateTime: start.toISOString(), timeZone: TZ };
      out.end = { dateTime: end.toISOString(), timeZone: TZ };
    }
  }
  return out;
}

export async function createEvent(e: EventInput) {
  if (!e.title || !e.start) throw new Error('An event needs a title and a time');
  const data = await call('', { method: 'POST', body: JSON.stringify(body(e)) });
  g.__gEvents = undefined;
  return toCal(data as GEvent);
}

export async function updateEvent(id: string, e: EventInput) {
  const existing = g.__gEvents?.events.find((x) => x.id === id);
  const data = await call(`/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(body(e, existing)) });
  g.__gEvents = undefined;
  return toCal(data as GEvent);
}

export async function deleteEvent(id: string) {
  await call(`/${encodeURIComponent(id)}`, { method: 'DELETE' });
  g.__gEvents = undefined;
}

function demoEvents(today: string): CalEvent[] {
  const at = (day: string, hm: string) => new Date(`${day}T${hm}:00+02:00`).toISOString();
  const t1 = addDays(today, 1);
  return [
    { id: 'd1', title: 'موعد عند طبيب الأسنان', start: at(today, '17:30'), end: at(today, '18:15'), allDay: false, location: 'الناصرة' },
    { id: 'd2', title: 'Robotics club', start: at(today, '20:00'), end: at(today, '21:30'), allDay: false, location: null },
    { id: 'd3', title: 'יום הולדת לסבתא', start: t1, end: addDays(t1, 1), allDay: true, location: null },
    { id: 'd4', title: 'تدريب', start: at(t1, '18:00'), end: at(t1, '19:30'), allDay: false, location: null },
  ];
}
