import { COOKIE, expectedToken, tokenFor } from '@/lib/auth';

export async function POST(req: Request) {
  const { passcode } = await req.json().catch(() => ({ passcode: '' }));
  const want = expectedToken();
  if (want && tokenFor(String(passcode ?? '')) !== want) {
    return Response.json({ error: 'That passcode is wrong' }, { status: 401 });
  }
  const res = Response.json({ ok: true, token: want });
  if (want) {
    res.headers.append(
      'Set-Cookie',
      `${COOKIE}=${want}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${60 * 60 * 24 * 400}`,
    );
  }
  return res;
}
