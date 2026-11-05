import { isAuthed, unauthorized } from '@/lib/auth';
import { ping } from '@/lib/broadcast';
import { actionToInput, think } from '@/lib/gemini';
import { store } from '@/lib/store';
import { isoDay } from '@/lib/time';

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
  let result;
  try {
    result = await think({ text: body.text, audio: body.audio, mime: body.mime }, items);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json({ error: msg.includes('GEMINI_API_KEY') ? 'Add your Gemini key in Vercel first' : 'The AI did not answer. Try again' , detail: msg }, { status: 502 });
  }

  const ids = new Set(items.map((i) => i.id));
  const applied: string[] = [];
  for (const a of result.actions) {
    try {
      if (a.op === 'add') {
        const input = actionToInput(a, source);
        if (!input.text) continue;
        const it = await s.create(input);
        applied.push(it.id);
      } else if (a.id && ids.has(a.id)) {
        if (a.op === 'complete') await s.update(a.id, { done: true });
        else if (a.op === 'reopen') await s.update(a.id, { done: false });
        else if (a.op === 'delete') await s.remove(a.id);
        else if (a.op === 'update') await s.update(a.id, actionToInput(a, source));
        applied.push(a.id);
      }
    } catch {
      // skip a bad action, keep the rest
    }
  }

  if (result.summary) await s.setSummary({ date: isoDay(), text: result.summary });
  await ping();

  return Response.json({
    transcript: result.transcript,
    language: result.language,
    reply: result.reply,
    changed: applied,
  });
}
