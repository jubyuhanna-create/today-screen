'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient, type RealtimeChannel } from '@supabase/supabase-js';
import { api } from './api';
import type { State } from '../types';

// Loads state, then keeps it fresh: Supabase broadcast ping first, polling as a safety net.
export function useLiveState(pollMs = 30000) {
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState<string | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const topicRef = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const s = await api.state();
      setState(s);
      setError(null);
      return s;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Offline');
      return null;
    }
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, pollMs);
    const onVis = () => document.visibilityState === 'visible' && refresh();
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('online', refresh);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('online', refresh);
    };
  }, [refresh, pollMs]);

  useEffect(() => {
    const topic = state?.channel;
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!topic || !url || !anon || topicRef.current === topic) return;
    topicRef.current = topic;
    const sb = createClient(url, anon, { auth: { persistSession: false } });
    channelRef.current = sb
      .channel(topic)
      .on('broadcast', { event: 'sync' }, () => refresh())
      .subscribe();
    return () => {
      channelRef.current?.unsubscribe();
      topicRef.current = null;
    };
  }, [state?.channel, refresh]);

  return { state, setState, refresh, error };
}

export function useNow(everyMs = 1000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), everyMs);
    return () => clearInterval(t);
  }, [everyMs]);
  return now;
}
