'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/client/api';
import { useLiveState, useNow } from '@/lib/client/live';
import { group, relTime, shortDay } from '@/lib/client/view';
import { Recorder } from '@/lib/client/wav';
import type { Item } from '@/lib/types';
import './tv.css';

const TZ = process.env.NEXT_PUBLIC_TZ || 'Asia/Jerusalem';
const CITY = process.env.NEXT_PUBLIC_CITY || 'Nazareth';
const LAT = process.env.NEXT_PUBLIC_LAT || '32.70';
const LON = process.env.NEXT_PUBLIC_LON || '35.30';

type Voice =
  | { s: 'idle' }
  | { s: 'listening' }
  | { s: 'thinking' }
  | { s: 'done'; transcript: string; reply: string }
  | { s: 'error'; message: string };

declare global {
  interface Window {
    __today?: {
      listening: () => void;
      level: (n: number) => void;
      audio: (b64: string, mime?: string) => void;
      cancel: () => void;
      error: (msg: string) => void;
    };
    TodayNative?: { toggle: () => void };
  }
}

export default function TV() {
  const [ready, setReady] = useState(false);

  // /tv?key=PASSCODE logs the TV in once, then the cookie keeps it.
  useEffect(() => {
    const key = new URLSearchParams(location.search).get('key');
    if (!key) return setReady(true);
    api.login(key).catch(() => {}).finally(() => {
      history.replaceState(null, '', '/tv');
      setReady(true);
    });
  }, []);

  useEffect(() => {
    document.documentElement.classList.add('tv-html');
    return () => document.documentElement.classList.remove('tv-html');
  }, []);

  if (!ready) return <main className="tv" />;
  return <Screen />;
}

function Screen() {
  const { state, refresh, error } = useLiveState(20000);
  const now = useNow(1000);
  const [voice, setVoice] = useState<Voice>({ s: 'idle' });
  const [level, setLevel] = useState(0);
  const weather = useWeather();
  const recRef = useRef<Recorder | null>(null);
  const hideRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const send = useCallback(async (audio: string, mime = 'audio/wav') => {
    setVoice({ s: 'thinking' });
    try {
      const r = await api.think({ audio, mime, source: 'tv' });
      await refresh();
      setVoice({ s: 'done', transcript: r.transcript, reply: r.reply || 'Nothing to change' });
    } catch (e) {
      setVoice({ s: 'error', message: e instanceof Error ? e.message : 'Try again' });
    }
  }, [refresh]);

  // Hooks the Android TV app calls into.
  useEffect(() => {
    window.__today = {
      listening: () => setVoice({ s: 'listening' }),
      level: (n) => setLevel(n),
      audio: (b64, mime) => send(b64, mime),
      cancel: () => setVoice({ s: 'idle' }),
      error: (message) => setVoice({ s: 'error', message }),
    };
    return () => { delete window.__today; };
  }, [send]);

  // In a normal browser (testing on a laptop), Enter or Space records with the browser mic.
  useEffect(() => {
    if (window.TodayNative) return;
    const onKey = async (e: KeyboardEvent) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      if (!recRef.current) {
        try {
          const r = new Recorder();
          await r.start();
          recRef.current = r;
          setVoice({ s: 'listening' });
        } catch {
          setVoice({ s: 'error', message: 'Microphone is blocked' });
        }
      } else {
        const r = recRef.current;
        recRef.current = null;
        const { audio, mime } = await r.stop();
        send(audio, mime);
      }
    };
    window.addEventListener('keydown', onKey);
    const t = setInterval(() => recRef.current && setLevel(recRef.current.level()), 80);
    return () => { window.removeEventListener('keydown', onKey); clearInterval(t); };
  }, [send]);

  useEffect(() => {
    if (hideRef.current) clearTimeout(hideRef.current);
    if (voice.s === 'done' || voice.s === 'error') {
      hideRef.current = setTimeout(() => setVoice({ s: 'idle' }), voice.s === 'done' ? 6000 : 5000);
    }
  }, [voice]);

  const today = state?.today;
  const g = state && today ? group(state.items, today, now) : null;
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', hour12: false }).format(now));
  const phase = hour >= 23 || hour < 7 ? 'night' : hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
  const forced = typeof window !== 'undefined' ? new URLSearchParams(location.search).get('phase') : null;
  const shown = forced || phase;
  const time = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }).format(now);
  const date = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'long', month: 'long', day: 'numeric' }).format(now);

  const visible = g ? g.todayTasks.slice(0, 7) : [];
  const hidden = g ? g.todayTasks.length - visible.length : 0;
  const reminder = g?.nextReminder;
  const reminderLabel = reminder ? relTime(reminder.remind_at!, now) : '';

  return (
    <main className={`tv tv-${shown}`}>
      <section className="tv-left">
        <div className="tv-time" aria-label={time}>{time}</div>
        <div className="tv-date">
          {date}
          {weather && <span className="tv-weather">{weather.temp}° {weather.word} in {CITY}</span>}
        </div>

        <p className="tv-summary" key={state?.summary?.text}>
          {state?.summary?.text ?? (g && g.total === 0 ? 'Nothing planned yet. Press OK and say what is on your mind.' : '')}
        </p>

        {reminder && (
          <div className={`tv-reminder${reminderLabel === 'Now' ? ' is-now' : ''}`}>
            <span className="tv-reminder-when">{reminderLabel}</span>
            <span className="tv-reminder-text" dir="auto">{reminder.text}</span>
          </div>
        )}
      </section>

      <section className="tv-right">
        <header className="tv-head">
          <h1>Today</h1>
          {g && g.total > 0 && <span>{g.doneCount} of {g.total} done</span>}
        </header>

        <ul className="tv-list">
          {visible.map((t) => <Row key={t.id} item={t} today={today!} now={now} />)}
          {g && g.total === 0 && <li className="tv-empty">Your day is clear.</li>}
        </ul>
        {hidden > 0 && <p className="tv-more">{hidden} more on your phone</p>}

        <div className="tv-bottom">
          <div>
            <h2>Tomorrow</h2>
            {g && g.tomorrowTasks.length > 0 ? (
              <ul className="tv-mini">
                {g.tomorrowTasks.slice(0, 3).map((t) => (
                  <li key={t.id}>
                    <span dir="auto" className="tv-bidi">{t.text}</span>
                    {t.due_time && <time>{t.due_time}</time>}
                  </li>
                ))}
              </ul>
            ) : <p className="tv-quiet">Nothing yet</p>}
          </div>
          <div>
            <h2>Ideas</h2>
            {g && g.ideas.length > 0 ? (
              <ul className="tv-mini">
                {g.ideas.slice(0, 3).map((t) => (
                  <li key={t.id}>
                    <span dir="auto" className="tv-bidi">{t.text}</span>
                    {t.category && <em>{t.category}</em>}
                  </li>
                ))}
              </ul>
            ) : <p className="tv-quiet">Nothing yet</p>}
          </div>
        </div>
      </section>

      <VoiceBar voice={voice} level={level} />
      {error && <div className="tv-offline">Reconnecting</div>}
      {state?.demo && <div className="tv-demo">Demo data. Add your Supabase keys to go live.</div>}
    </main>
  );
}

function Row({ item, today, now }: { item: Item; today: string; now: Date }) {
  const fresh = now.getTime() - new Date(item.updated_at).getTime() < 8000;
  const overdue = !item.done && item.due_date && item.due_date < today;
  return (
    <li className={`tv-row${item.done ? ' is-done' : ''}${fresh ? ' is-fresh' : ''}`}>
      <span className="tv-check" aria-hidden="true">
        {item.done && <svg viewBox="0 0 24 24"><path d="M6 12.5l4 4 8-9" /></svg>}
      </span>
      {item.priority === 1 && !item.done && <span className="tv-flag">!</span>}
      <span className="tv-text tv-bidi" dir="auto">{item.text}</span>
      {overdue && <span className="tv-meta">{shortDay(item.due_date!, today)}</span>}
      {item.due_time && !item.done && <time className="tv-meta">{item.due_time}</time>}
    </li>
  );
}

function VoiceBar({ voice, level }: { voice: Voice; level: number }) {
  if (voice.s === 'idle') {
    return <div className="tv-hint">Press OK to talk</div>;
  }
  return (
    <div className={`tv-voice is-${voice.s}`} role="status">
      {voice.s === 'listening' && (
        <>
          <Wave level={level} />
          <span>Listening. Press OK when you are done.</span>
        </>
      )}
      {voice.s === 'thinking' && <span className="tv-thinking">Organizing</span>}
      {voice.s === 'done' && (
        <>
          {voice.transcript && <span className="tv-said tv-bidi" dir="auto">{voice.transcript}</span>}
          <span className="tv-reply">{voice.reply}</span>
        </>
      )}
      {voice.s === 'error' && <span>{voice.message}</span>}
    </div>
  );
}

function Wave({ level }: { level: number }) {
  const bars = [0.5, 0.8, 1, 0.7, 0.4];
  return (
    <span className="tv-wave" aria-hidden="true">
      {bars.map((b, i) => (
        <i key={i} style={{ transform: `scaleY(${0.15 + Math.min(1, level * 1.6) * b})` }} />
      ))}
    </span>
  );
}

function useWeather() {
  const [w, setW] = useState<{ temp: number; word: string } | null>(null);
  useEffect(() => {
    const load = () =>
      fetch(`https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}&current=temperature_2m,weather_code`)
        .then((r) => r.json())
        .then((d) => setW({ temp: Math.round(d.current.temperature_2m), word: weatherWord(d.current.weather_code) }))
        .catch(() => {});
    load();
    const t = setInterval(load, 30 * 60000);
    return () => clearInterval(t);
  }, []);
  return w;
}

function weatherWord(c: number) {
  if (c === 0) return 'clear';
  if (c <= 2) return 'partly cloudy';
  if (c === 3) return 'cloudy';
  if (c <= 48) return 'fog';
  if (c <= 67 || (c >= 80 && c <= 82)) return 'rain';
  if (c <= 77) return 'snow';
  return 'storms';
}

