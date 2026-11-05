'use client';

import { useState } from 'react';
import { api } from '@/lib/client/api';
import '../phone/phone.css';

export default function Login() {
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const go = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return setErr('Enter your passcode');
    setBusy(true);
    try {
      await api.login(code.trim());
      const next = new URLSearchParams(location.search).get('next') || '/phone';
      location.href = next.startsWith('/') ? next : '/phone';
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Try again');
      setBusy(false);
    }
  };

  return (
    <main className="ph" style={{ display: 'grid', placeItems: 'center' }}>
      <form onSubmit={go} style={{ width: '100%', maxWidth: 340, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h1 style={{ margin: '0 0 6px', fontSize: 34, fontWeight: 700, letterSpacing: '-0.025em' }}>Today</h1>
        <input
          className="ph-field"
          type="password"
          autoComplete="current-password"
          placeholder="Passcode"
          value={code}
          onChange={(e) => { setCode(e.target.value); setErr(''); }}
          autoFocus
        />
        {err && <p className="ph-err" style={{ margin: 0 }}>{err}</p>}
        <button className="ph-btn ph-btn-primary" disabled={busy} style={{ flex: 'none' }}>Unlock</button>
      </form>
    </main>
  );
}
