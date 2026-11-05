import { isAuthed, unauthorized } from '@/lib/auth';
import { ping } from '@/lib/broadcast';
import { disconnect } from '@/lib/google';

export async function POST() {
  if (!(await isAuthed())) return unauthorized();
  await disconnect();
  await ping();
  return Response.json({ ok: true });
}
