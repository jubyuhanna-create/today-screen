import { createHash } from 'crypto';
import { cookies, headers } from 'next/headers';

export const COOKIE = 'today_key';

export function tokenFor(passcode: string) {
  return createHash('sha256').update('today-screen:' + passcode).digest('hex');
}

export function expectedToken() {
  const pass = process.env.APP_PASSCODE;
  if (!pass) return null; // no passcode set: demo / local only
  return tokenFor(pass);
}

export async function isAuthed() {
  const want = expectedToken();
  if (!want) return process.env.NODE_ENV !== 'production';
  const c = (await cookies()).get(COOKIE)?.value;
  const h = (await headers()).get('x-today-key');
  return c === want || h === want;
}

export function channelName() {
  const pass = process.env.APP_PASSCODE || 'demo';
  return 'today-' + createHash('sha256').update('rt:' + pass).digest('hex').slice(0, 20);
}

export function unauthorized() {
  return Response.json({ error: 'Passcode needed' }, { status: 401 });
}
