import { cookies } from 'next/headers';
import { isAuthed } from '@/lib/auth';
import { ping } from '@/lib/broadcast';
import { exchangeCode } from '@/lib/google';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const origin = url.origin;
  const back = (status: string) => Response.redirect(`${origin}/phone?google=${status}`, 302);
  if (!(await isAuthed())) return Response.redirect(`${origin}/login?next=/phone`, 302);
  if (url.searchParams.get('error')) return back('cancelled');
  const state = (await cookies()).get('g_state')?.value;
  if (!state || state !== url.searchParams.get('state')) return back('error');
  try {
    await exchangeCode(url.searchParams.get('code') || '', origin);
  } catch {
    return back('error');
  }
  await ping();
  return back('connected');
}
