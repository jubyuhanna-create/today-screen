import { channelName } from './auth';

// Tell every open screen that something changed. They refetch /api/state.
export async function ping() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return;
  try {
    await fetch(`${url}/realtime/v1/api/broadcast`, {
      method: 'POST',
      signal: AbortSignal.timeout(3000),
      // New sb_secret_ keys go in apikey only. Old JWT service_role keys also need Authorization.
      headers: {
        apikey: key,
        ...(key.startsWith('eyJ') ? { Authorization: `Bearer ${key}` } : {}),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ messages: [{ topic: channelName(), event: 'sync', payload: { at: Date.now() } }] }),
    });
  } catch {
    // Screens also poll, so a missed ping only delays the update.
  }
}
