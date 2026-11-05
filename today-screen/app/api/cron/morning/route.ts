import { ping } from '@/lib/broadcast';
import { summarize } from '@/lib/gemini';
import { store } from '@/lib/store';
import { isoDay } from '@/lib/time';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) {
    return Response.json({ error: 'Not allowed' }, { status: 401 });
  }
  const s = store();
  const items = await s.list();
  let text = '';
  try {
    text = await summarize(items);
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : 'Summary failed' }, { status: 502 });
  }
  if (text) await s.setSummary({ date: isoDay(), text });
  await ping();
  return Response.json({ ok: true, summary: text });
}
