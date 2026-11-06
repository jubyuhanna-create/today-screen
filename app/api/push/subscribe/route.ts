import { isAuthed, unauthorized } from '@/lib/auth';
import { addSubscription, pushConfigured } from '@/lib/push';

export async function POST(req: Request) {
  if (!(await isAuthed())) return unauthorized();
  if (!pushConfigured()) return Response.json({ error: 'Add the notification keys in Vercel first' }, { status: 400 });
  const sub = await req.json().catch(() => null);
  if (!sub?.endpoint || !sub?.keys?.p256dh) return Response.json({ error: 'That subscription is not valid' }, { status: 400 });
  await addSubscription(sub);
  return Response.json({ ok: true });
}
