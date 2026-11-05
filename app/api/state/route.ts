import { channelName, isAuthed, unauthorized } from '@/lib/auth';
import { store } from '@/lib/store';
import { isoDay } from '@/lib/time';
import type { CalEvent, State } from '@/lib/types';
import { googleConfigured, isConnected, upcomingEvents } from '@/lib/google';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (!(await isAuthed())) return unauthorized();
  const s = store();
  const [items, summary] = await Promise.all([s.list(), s.getSummary()]);
  const today = isoDay();
  let events: CalEvent[] = [];
  let google: State['google'] = googleConfigured() ? 'off' : 'not-configured';
  try {
    if (googleConfigured() ? await isConnected() : s.demo) {
      events = await upcomingEvents();
      google = googleConfigured() ? 'connected' : 'not-configured';
    }
  } catch {
    google = 'error'; // the dashboard still works without the calendar
  }
  const body: State = {
    today,
    items,
    events,
    google,
    summary: summary && summary.date === today ? summary : null,
    channel: s.demo ? null : channelName(),
    version: process.env.VERCEL_DEPLOYMENT_ID || process.env.VERCEL_GIT_COMMIT_SHA || 'dev',
    demo: s.demo,
  };
  return Response.json(body, { headers: { 'Cache-Control': 'no-store' } });
}
