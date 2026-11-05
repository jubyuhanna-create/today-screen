'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/client/api';
import { useLiveState, useNow } from '@/lib/client/live';
import { eventTime, eventsOn, group, isPast, nextEvent, relTime, shortDay } from '@/lib/client/view';
import { Recorder } from '@/lib/client/wav';
import { addDays } from '@/lib/time';
import { speak, stopSpeaking } from '@/lib/client/speak';
import { DAYS, keyForJsDay, nextSchoolDay, type DayKey } from '@/lib/schedule';
import type { CalEvent, Item } from '@/lib/types';
import { ScheduleView } from '@/components/ScheduleView';
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
  | { s: 'answer'; transcript: string; answer: string }
  | { s: 'error'; message: string };

declare global {
  interface Window {
    __today?: {
      listening: () => void;
      level: (n: number) => void;
      audio: (b64: string, mime?: string) => void;
      cancel: () => void;
      error: (msg: string) => void;
      back: () => void;
    };
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
  const { state, refresh, error } = useLiveState(20000, true);
  const now = useNow(1000);
  const [voice, setVoice] = useState<Voice>({ s: 'idle' });
  const [level, setLevel] = useState(0);
  const weather = useWeather();
  const recRef = useRef<Recorder | null>(null);
  const hideRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [schedule, setSchedule] = useState<DayKey | null>(null);
  const [schedTouch, setSchedTouch] = useState(0);

  const openSchedule = useCallback((d: DayKey) => { setSchedule(d); setSchedTouch(Date.now()); }, []);
  const closeAll = useCallback(() => {
    setSchedule(null);
    setVoice((v) => (v.s === 'answer' || v.s === 'done' || v.s === 'error' ? { s: 'idle' } : v));
    stopSpeaking();
  }, []);

  const send = useCallback(async (audio: string, mime = 'audio/wav') => {
    setVoice({ s: 'thinking' });
    try {
      const r = await api.think({ audio, mime, source: 'tv' });
      refresh();
      if (r.intent === 'schedule' && r.schedule_day) {
        openSchedule(r.schedule_day as DayKey);
        setVoice({ s: 'idle' });
        speak(r.answer);
      } else if (r.intent === 'answer' && r.answer) {
        setVoice({ s: 'answer', transcript: r.transcript, answer: r.answer });
        speak(r.answer);
      } else {
        setVoice({ s: 'done', transcript: r.transcript, reply: r.reply || 'Nothing to change' });
        if (r.answer) speak(r.answer);
      }
    } catch (e) {
      setVoice({ s: 'error', message: e instanceof Error ? e.message : 'Try again' });
    }
  }, [refresh, openSchedule]);

  // Hooks the Android TV app calls into.
  useEffect(() => {
    window.__today = {
      listening: () => setVoice({ s: 'listening' }),
      level: (n) => setLevel(n),
      audio: (b64, mime) => send(b64, mime),
      cancel: () => setVoice({ s: 'idle' }),
      error: (message) => setVoice({ s: 'error', message }),
      back: closeAll,
    };
    return () => { delete window.__today; };
  }, [send, closeAll]);

  // Remote arrows: right opens the timetable, left and right change the day, Back closes.
  useEffect(() => {
    const order = DAYS.map((d) => d.key);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        setSchedTouch(Date.now());
        setSchedule((cur) => {
          if (!cur) return nextSchoolDay(new Date(), TZ);
          const i = order.indexOf(cur) + (e.key === 'ArrowRight' ? 1 : -1);
          return order[(i + order.length) % order.length];
        });
      } else if (e.key === 'Escape' || e.key === 'Backspace' || e.key === 'GoBack') {
        closeAll();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [closeAll]);

  // The timetable closes itself after a minute and a half untouched.
  useEffect(() => {
    if (!schedule) return;
    const t = setTimeout(() => setSchedule(null), 90000);
    return () => clearTimeout(t);
  }, [schedule, schedTouch]);

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
    if (voice.s === 'done' || voice.s === 'error' || voice.s === 'answer') {
      const ms = voice.s === 'answer' ? 25000 : voice.s === 'done' ? 6000 : 5000;
      hideRef.current = setTimeout(() => setVoice({ s: 'idle' }), ms);
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

  const todayKey = keyForJsDay(new Date(now.toLocaleString('en-US', { timeZone: TZ })).getDay());
  const tomorrowKey = keyForJsDay((new Date(now.toLocaleString('en-US', { timeZone: TZ })).getDay() + 1) % 7);
  const schedLabel = schedule === todayKey ? 'Today' : schedule === tomorrowKey ? 'Tomorrow' : 'Timetable';

  const evToday = state && today ? eventsOn(state.events, today) : [];
  const evTomorrow = state && today ? eventsOn(state.events, addDays(today, 1)) : [];
  const upNext = state && today ? nextEvent(state.events, today, now) : null;
  const room = Math.max(2, 7 - evToday.length);
  const visible = g ? g.todayTasks.slice(0, room) : [];
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

        {upNext && (
          <div className={`tv-reminder tv-next${relTime(upNext.start, now) === 'Now' || new Date(upNext.start) <= now ? ' is-now' : ''}`}>
            <span className="tv-reminder-when">{new Date(upNext.start) <= now ? 'Happening now' : relTime(upNext.start, now)}, {eventTime(upNext)}</span>
            <span className="tv-reminder-text" dir="auto">{upNext.title}</span>
          </div>
        )}

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
          {evToday.map((e) => <EventRow key={e.id} e={e} now={now} />)}
          {visible.map((t) => <Row key={t.id} item={t} today={today!} now={now} />)}
          {g && g.total === 0 && evToday.length === 0 && <li className="tv-empty">Your day is clear.</li>}
        </ul>
        {hidden > 0 && <p className="tv-more">{hidden} more on your phone</p>}

        <div className="tv-bottom">
          <div>
            <h2>Tomorrow</h2>
            {g && (g.tomorrowTasks.length > 0 || evTomorrow.length > 0) ? (
              <ul className="tv-mini">
                {evTomorrow.slice(0, 3).map((e) => (
                  <li key={e.id} className="is-event">
                    <i className="tv-mini-bar" aria-hidden="true" />
                    <span dir="auto" className="tv-bidi">{e.title}</span>
                    <time>{e.allDay ? 'All day' : eventTime(e).split('–')[0]}</time>
                  </li>
                ))}
                {g.tomorrowTasks.slice(0, Math.max(0, 3 - evTomorrow.length)).map((t) => (
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

      {schedule && (
        <div className="tv-sched">
          <ScheduleView variant="tv" day={schedule} label={schedLabel} onDay={openSchedule} />
          <p className="tv-sched-hint">Left and right change the day. Back closes.</p>
        </div>
      )}

      <VoiceBar voice={voice} level={level} />
      {error && <div className="tv-offline">Reconnecting</div>}
      {state?.demo && <div className="tv-demo">Demo data. Add your Supabase keys to go live.</div>}
    </main>
  );
}

function EventRow({ e, now }: { e: CalEvent; now: Date }) {
  const past = isPast(e, now);
  const live = !e.allDay && !past && new Date(e.start) <= now;
  return (
    <li className={`tv-row tv-event${past ? ' is-done' : ''}${live ? ' is-live' : ''}`}>
      <span className="tv-ev-bar" aria-hidden="true" />
      <span className="tv-text tv-bidi" dir="auto">{e.title}</span>
      <time className="tv-meta">{eventTime(e)}</time>
    </li>
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
    return <div className="tv-hint">OK to talk, right arrow for your timetable</div>;
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
      {voice.s === 'answer' && (
        <span className="tv-answer">
          <span className="tv-answer-q tv-bidi" dir="auto">{voice.transcript}</span>
          <span className="tv-answer-a tv-bidi" dir="auto">{voice.answer}</span>
        </span>
      )}
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

