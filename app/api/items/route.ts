import { isAuthed, unauthorized } from '@/lib/auth';
import { ping } from '@/lib/broadcast';
import { store } from '@/lib/store';

export async function POST(req: Request) {
  if (!(await isAuthed())) return unauthorized();
  const body = await req.json().catch(() => null);
  if (!body?.text || !String(body.text).trim()) {
    return Response.json({ error: 'Write something first' }, { status: 400 });
  }
  const item = await store().create({ source: 'phone', ...body });
  await ping();
  return Response.json(item);
}
