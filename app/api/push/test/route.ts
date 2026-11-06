import { isAuthed, unauthorized } from '@/lib/auth';
import { sendPush } from '@/lib/push';

export async function POST() {
  if (!(await isAuthed())) return unauthorized();
  const sent = await sendPush({ title: 'Today', body: 'Notifications work. You will get reminders here.', tag: 'test' });
  if (!sent) return Response.json({ error: 'No phone is subscribed yet' }, { status: 400 });
  return Response.json({ ok: true });
}
