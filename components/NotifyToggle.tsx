'use client';

import { useEffect, useState } from 'react';

const KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '';

function keyBytes(b64: string) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

type St = 'loading' | 'unsupported' | 'no-keys' | 'off' | 'on' | 'blocked';

/** Turns on phone notifications: registers the service worker and sends the subscription to the server. */
export function NotifyToggle({ onToast }: { onToast: (m: string) => void }) {
  const [st, setSt] = useState<St>('loading');

  useEffect(() => {
    (async () => {
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return setSt('unsupported');
      if (!KEY) return setSt('no-keys');
      const reg = await navigator.serviceWorker.register('/sw.js');
      if (Notification.permission === 'denied') return setSt('blocked');
      const sub = await reg.pushManager.getSubscription();
      if (sub && Notification.permission === 'granted') {
        // Send it again every visit, so the server always has a working one.
        fetch('/api/push/subscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(sub) }).catch(() => {});
        setSt('on');
      } else setSt('off');
    })().catch(() => setSt('unsupported'));
  }, []);

  const turnOn = async () => {
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') { setSt(perm === 'denied' ? 'blocked' : 'off'); return; }
      const reg = await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ||
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(KEY) }));
      const res = await fetch('/api/push/subscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(sub) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Could not turn on notifications');
      setSt('on');
      onToast('Notifications are on');
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'Could not turn on notifications');
    }
  };

  const test = async () => {
    const res = await fetch('/api/push/test', { method: 'POST' });
    onToast(res.ok ? 'Test sent. It should arrive in a few seconds' : (await res.json().catch(() => ({}))).error || 'Test failed');
  };

  if (st === 'loading' || st === 'unsupported') return null;
  if (st === 'no-keys') return <p className="ph-foot">Notifications need the two notification keys in Vercel.</p>;
  if (st === 'blocked') return <p className="ph-foot">Notifications are blocked. Allow them for this site in Chrome settings, then come back.</p>;
  if (st === 'off') {
    return (
      <button className="ph-connect" onClick={turnOn}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15L6 16zM10 20a2 2 0 0 0 4 0" /></svg>
        Turn on notifications
      </button>
    );
  }
  return (
    <p className="ph-foot">
      Notifications are on.{' '}
      <button className="ph-link" onClick={test}>Send a test</button>
    </p>
  );
}
