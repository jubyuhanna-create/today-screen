import { isAuthed, unauthorized } from '@/lib/auth';
import { runThink } from '@/lib/think';

export const maxDuration = 60;

export async function POST(req: Request) {
  if (!(await isAuthed())) return unauthorized();
  const body = await req.json().catch(() => null);
  const source = body?.source === 'tv' ? 'tv' : 'phone';
  if (!body || (!body.text && !body.audio)) {
    return Response.json({ error: 'Nothing was sent' }, { status: 400 });
  }
  const r = await runThink({ text: body.text, audio: body.audio, mime: body.mime }, source);
  if (!r.ok) return Response.json({ error: r.error, detail: r.detail }, { status: r.status });
  return Response.json(r.body);
}
