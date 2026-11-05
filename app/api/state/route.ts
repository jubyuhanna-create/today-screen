import { channelName, isAuthed, unauthorized } from '@/lib/auth';
import { store } from '@/lib/store';
import { isoDay } from '@/lib/time';
import type { State } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (!(await isAuthed())) return unauthorized();
  const s = store();
  const [items, summary] = await Promise.all([s.list(), s.getSummary()]);
  const today = isoDay();
  const body: State = {
    today,
    items,
    summary: summary && summary.date === today ? summary : null,
    channel: s.demo ? null : channelName(),
    demo: s.demo,
  };
  return Response.json(body, { headers: { 'Cache-Control': 'no-store' } });
}
