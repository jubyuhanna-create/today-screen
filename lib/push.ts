import webpush from 'web-push';
import { store } from './store';

// Push notifications to the phone (the installed web app), via the browser's push service.

type Sub = webpush.PushSubscription & { added: string };

export function pushConfigured() {
  return !!(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

function setup() {
  const site = process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : 'https://example.com';
  webpush.setVapidDetails(site, process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);
}

export async function addSubscription(sub: webpush.PushSubscription) {
  const subs = (await store().getMeta<Sub[]>('push_subs')) || [];
  const rest = subs.filter((s) => s.endpoint !== sub.endpoint);
  await store().setMeta('push_subs', [...rest, { ...sub, added: new Date().toISOString() }].slice(-5));
}

export interface Note { title: string; body: string; tag?: string; url?: string }

/** Sends to every subscribed phone. Drops phones that unsubscribed. Returns how many got it. */
export async function sendPush(note: Note) {
  if (!pushConfigured()) return 0;
  setup();
  const subs = (await store().getMeta<Sub[]>('push_subs')) || [];
  let sent = 0;
  const keep: Sub[] = [];
  for (const s of subs) {
    try {
      await webpush.sendNotification(s, JSON.stringify(note), { TTL: 600, urgency: 'high' });
      sent++;
      keep.push(s);
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code !== 404 && code !== 410) keep.push(s); // 404 or 410: that phone removed the subscription
    }
  }
  if (keep.length !== subs.length) await store().setMeta('push_subs', keep);
  return sent;
}

/** Remembers what was already sent, so the every-minute check never repeats a notification. */
export async function once(keys: string[]) {
  const seen = (await store().getMeta<Record<string, number>>('notified')) || {};
  const now = Date.now();
  const fresh = keys.filter((k) => !seen[k]);
  for (const k of fresh) seen[k] = now;
  for (const k of Object.keys(seen)) if (now - seen[k] > 3 * 86400000) delete seen[k];
  if (fresh.length) await store().setMeta('notified', seen);
  return new Set(fresh);
}
