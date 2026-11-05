import { isAuthed, unauthorized } from '@/lib/auth';
import { ping } from '@/lib/broadcast';
import { store } from '@/lib/store';

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  if (!(await isAuthed())) return unauthorized();
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const item = await store().update(id, body);
  if (!item) return Response.json({ error: 'That item no longer exists' }, { status: 404 });
  await ping();
  return Response.json(item);
}

export async function DELETE(_req: Request, ctx: Ctx) {
  if (!(await isAuthed())) return unauthorized();
  const { id } = await ctx.params;
  await store().remove(id);
  await ping();
  return Response.json({ ok: true });
}
