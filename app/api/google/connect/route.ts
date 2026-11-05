import { randomBytes } from 'crypto';
import { isAuthed } from '@/lib/auth';
import { authUrl, googleConfigured } from '@/lib/google';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const origin = new URL(req.url).origin;
  if (!(await isAuthed())) return Response.redirect(`${origin}/login?next=/phone`, 302);
  if (!googleConfigured()) return Response.redirect(`${origin}/phone?google=not-configured`, 302);
  const state = randomBytes(16).toString('hex');
  const res = new Response(null, { status: 302, headers: { Location: authUrl(origin, state) } });
  res.headers.append('Set-Cookie', `g_state=${state}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`);
  return res;
}
