'use client';

import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/client/api';
import { useLiveState, useNow } from '@/lib/client/live';
import { eventTime, eventsOn, group, isPast, relTime, shortDay } from '@/lib/client/view';
import { Recorder } from '@/lib/client/wav';
import { addDays } from '@/lib/time';
import type { CalEvent, Item, ItemInput } from '@/lib/types';
import { speak, stopSpeaking } from '@/lib/client/speak';
import type { ThinkReply } from '@/lib/client/api';
import { keyForJsDay, nextSchoolDay, type DayKey } from '@/lib/schedule';
import { ScheduleView } from '@/components/ScheduleView';
import { WeatherView } from '@/components/WeatherView';
import { WeatherIcon } from '@/components/WeatherIcon';
import { useForecast } from '@/lib/client/forecast';
import { NotifyToggle } from '@/components/NotifyToggle';
import './phone.css';

const TZ = process.env.NEXT_PUBLIC_TZ || 'Asia/Jerusalem';

export default function Phone() {
  const { state, setState, refresh } = useLiveState(30000);
  const now = useNow(30000);
  const [editing, setEditing] = useState<Item | 'new' | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [rec, setRec] = useState<'off' | 'on' | 'sending'>('off');
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState('');
  const [schedule, setSchedule] = useState<DayKey | null>(null);
  const [weatherIdx, setWeatherIdx] = useState<number | null>(null);
  const forecast = useForecast();
  const [answer, setAnswer] = useState<{ q: string; a: string } | null>(null);

  // What happens after the AI answers, the same for typing and talking.
  const handle = (r: ThinkReply, spoken: boolean) => {
    if (r.intent === 'weather') {
      setWeatherIdx(Math.max(0, Math.min(6, r.weather_day ?? 0)));
      if (spoken) speak(r.answer);
    } else if (r.intent === 'schedule' && r.schedule_day) {
      setSchedule(r.schedule_day as DayKey);
      if (spoken) speak(r.answer);
    } else if (r.intent === 'answer' && r.answer) {
      setAnswer({ q: r.transcript, a: r.answer });
      if (spoken) speak(r.answer);
    } else {
      setToast(r.reply || 'Nothing to change');
    }
  };

  // Coming back from Google sign-in.
  useEffect(() => {
    const p = new URLSearchParams(location.search).get('google');
    if (!p) return;
    const msgs: Record<string, string> = {
      connected: 'Google Calendar connected',
      cancelled: 'Google Calendar was not connected',
      error: 'Google sign-in failed. Try again',
      'not-configured': 'Add your Google keys in Vercel first',
    };
    setToast(msgs[p] || null);
    history.replaceState(null, '', '/phone');
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(t);
  }, [toast]);

  if (!state) return <main className="ph"><div className="ph-loading" /></main>;
  const today = state.today;
  const g = group(state.items, today, now);
  const date = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'long', month: 'long', day: 'numeric' }).format(now);

  // Optimistic update, then let the server and the TV catch up.
  const patch = async (id: string, input: ItemInput) => {
    setState((s) => s && { ...s, items: s.items.map((i) => (i.id === id ? { ...i, ...input, done_at: 'done' in input ? (input.done ? new Date().toISOString() : null) : i.done_at } as Item : i)) });
    try { await api.update(id, input); } catch (e) { setToast(msg(e)); }
    refresh();
  };

  const remove = async (id: string) => {
    setState((s) => s && { ...s, items: s.items.filter((i) => i.id !== id) });
    try { await api.remove(id); setToast('Deleted'); } catch (e) { setToast(msg(e)); }
    refresh();
  };

  const submitText = async () => {
    const text = draft.trim();
    if (!text || busy) return;
    setBusy(true);
    try {
      const r = await api.think({ text, source: 'phone' });
      handle(r, false);
      setDraft('');
    } catch (e) {
      // Keep what was typed so nothing is lost; the + button still adds it by hand.
      setToast(msg(e));
    }
    setBusy(false);
    refresh();
  };

  return (
    <main className="ph">
      <header className="ph-top">
        <p className="ph-date">{date}</p>
        <div className="ph-titlebar">
          <h1>Today</h1>
          <div className="ph-top-btns">
          <button className="ph-tt" onClick={() => setWeatherIdx(0)} aria-label="Weather">
            {forecast ? <><WeatherIcon sky={forecast.now.sky} day={forecast.now.day} size="18px" />{forecast.now.temp}°</> : 'Weather'}
          </button>
          <button className="ph-tt" onClick={() => setSchedule(nextSchoolDay(new Date(), TZ))}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15" rx="3" /><path d="M3.5 10h17M8 3v4M16 3v4" /></svg>
            Timetable
          </button>
          </div>
        </div>
        {g.total > 0 && <p className="ph-count">{g.doneCount} of {g.total} done</p>}
        {state.summary && <p className="ph-summary">{state.summary.text}</p>}
        {state.demo && <p className="ph-demo">Demo data. Add your Supabase keys to go live.</p>}
      </header>

      {g.nextReminder && (
        <button className="ph-reminder" onClick={() => setEditing(g.nextReminder)}>
          <span className="ph-reminder-when">{relTime(g.nextReminder.remind_at!, now)}</span>
          <span dir="auto" className="ph-bidi">{g.nextReminder.text}</span>
        </button>
      )}

      {eventsOn(state.events, today).length > 0 && (
        <EventList events={eventsOn(state.events, today)} now={now} />
      )}

      <List items={g.todayTasks} today={today} onToggle={(i) => patch(i.id, { done: !i.done })} onOpen={setEditing} empty="Nothing for today. Type or talk below." />

      {g.tomorrowTasks.length > 0 && (
        <>
          <h2 className="ph-h2">Tomorrow</h2>
          <List items={g.tomorrowTasks} today={today} onToggle={(i) => patch(i.id, { done: true })} onOpen={setEditing} />
        </>
      )}
      {g.laterTasks.length > 0 && (
        <>
          <h2 className="ph-h2">Later</h2>
          <List items={g.laterTasks} today={today} showDay onToggle={(i) => patch(i.id, { done: true })} onOpen={setEditing} />
        </>
      )}
      {upcoming(state.events, today).length > 0 && (
        <>
          <h2 className="ph-h2">Calendar</h2>
          <EventList events={upcoming(state.events, today)} now={now} today={today} showDay />
        </>
      )}

      {g.ideas.length > 0 && (
        <>
          <h2 className="ph-h2">Ideas</h2>
          <List items={g.ideas} today={today} onOpen={setEditing} />
        </>
      )}
      {g.reminders.length > 1 && (
        <>
          <h2 className="ph-h2">Reminders</h2>
          <List items={g.reminders} today={today} onToggle={(i) => patch(i.id, { done: true })} onOpen={setEditing} />
        </>
      )}

      {state.google === 'off' && (
        <a className="ph-connect" href="/api/google/connect">
          <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15" rx="3" /><path d="M3.5 10h17M8 3v4M16 3v4" /></svg>
          Connect Google Calendar
        </a>
      )}
      {state.google === 'error' && (
        <a className="ph-connect is-error" href="/api/google/connect">Google Calendar stopped answering. Connect again</a>
      )}
      {state.google === 'connected' && (
        <p className="ph-foot">
          Google Calendar is connected.{' '}
          <button className="ph-link" onClick={async () => { await fetch('/api/google/disconnect', { method: 'POST' }); refresh(); setToast('Google Calendar disconnected'); }}>Disconnect</button>
        </p>
      )}

      <NotifyToggle onToast={setToast} />

      <div className="ph-spacer" />

      <form className="ph-compose" onSubmit={(e) => { e.preventDefault(); submitText(); }}>
        <button type="button" className="ph-plus" aria-label="New task" onClick={() => setEditing('new')}>
          <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></svg>
        </button>
        <input
          dir="auto"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Tomorrow 9:30 call the doctor"
          enterKeyHint="send"
          disabled={busy}
        />
        {draft.trim() ? (
          <button className="ph-send" type="submit" disabled={busy} aria-label="Send">
            <svg viewBox="0 0 24 24"><path d="M12 19V5M6 11l6-6 6 6" /></svg>
          </button>
        ) : (
          <button type="button" className="ph-mic" aria-label="Record" onClick={() => setRec('on')}>
            <svg viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="12" rx="3" /><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" /></svg>
          </button>
        )}
      </form>

      {rec !== 'off' && (
        <RecordSheet
          sending={rec === 'sending'}
          onCancel={() => setRec('off')}
          onDone={async (audio, mime) => {
            setRec('sending');
            try {
              const r = await api.think({ audio, mime, source: 'phone' });
              handle(r, true);
            } catch (e) {
              setToast(msg(e));
            }
            setRec('off');
            refresh();
          }}
          onError={(m) => { setRec('off'); setToast(m); }}
        />
      )}

      {editing && (
        <EditSheet
          item={editing === 'new' ? null : editing}
          today={today}
          onClose={() => setEditing(null)}
          onSave={async (input) => {
            setEditing(null);
            if (editing === 'new') {
              try { await api.create(input); setToast('Added'); } catch (e) { setToast(msg(e)); }
              refresh();
            } else {
              await patch(editing.id, input);
              setToast('Saved');
            }
          }}
          onDelete={editing === 'new' ? undefined : () => { setEditing(null); remove(editing.id); }}
        />
      )}

      {schedule && (
        <div className="ph-sheet-wrap" onClick={(e) => e.target === e.currentTarget && setSchedule(null)}>
          <div className="ph-sheet ph-sched">
            <div className="ph-sheet-bar">
              <span />
              <button className="ph-link ph-link-strong" onClick={() => setSchedule(null)}>Done</button>
            </div>
            <ScheduleView
              variant="phone"
              day={schedule}
              onDay={setSchedule}
              label={schedule === keyForJsDay(localDay()) ? 'Today' : schedule === keyForJsDay((localDay() + 1) % 7) ? 'Tomorrow' : 'Timetable'}
            />
          </div>
        </div>
      )}

      {weatherIdx !== null && (
        <div className="ph-sheet-wrap" onClick={(e) => e.target === e.currentTarget && setWeatherIdx(null)}>
          <div className="ph-sheet ph-sched">
            <div className="ph-sheet-bar">
              <span />
              <button className="ph-link ph-link-strong" onClick={() => setWeatherIdx(null)}>Done</button>
            </div>
            <WeatherView variant="phone" forecast={forecast} index={weatherIdx} onIndex={setWeatherIdx} />
          </div>
        </div>
      )}

      {answer && (
        <div className="ph-sheet-wrap" onClick={(e) => { if (e.target === e.currentTarget) { setAnswer(null); stopSpeaking(); } }}>
          <div className="ph-sheet ph-answer">
            <p className="ph-answer-q ph-bidi" dir="auto">{answer.q}</p>
            <p className="ph-answer-a ph-bidi" dir="auto">{answer.a}</p>
            <div className="ph-rec-actions">
              <button className="ph-btn" onClick={() => speak(answer.a)}>Read aloud</button>
              <button className="ph-btn ph-btn-primary" onClick={() => { setAnswer(null); stopSpeaking(); }}>Done</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="ph-toast" role="status">{toast}</div>}
    </main>
  );
}

function List({ items, today, onToggle, onOpen, empty, showDay }: {
  items: Item[]; today: string; showDay?: boolean; empty?: string;
  onToggle?: (i: Item) => void; onOpen: (i: Item) => void;
}) {
  if (!items.length) return empty ? <p className="ph-empty">{empty}</p> : null;
  return (
    <ul className="ph-list">
      {items.map((i) => {
        const overdue = !i.done && i.kind === 'task' && i.due_date && i.due_date < today;
        const meta = i.kind === 'idea' ? i.category
          : i.kind === 'reminder' && i.remind_at ? new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', weekday: 'short' }).format(new Date(i.remind_at))
          : [showDay || overdue ? shortDay(i.due_date!, today) : null, i.due_time].filter(Boolean).join(', ');
        return (
          <li key={i.id} className={`ph-row${i.done ? ' is-done' : ''}`}>
            {onToggle ? (
              <button className="ph-check" aria-label={i.done ? 'Mark as not done' : 'Mark as done'} onClick={() => onToggle(i)}>
                {i.done && <svg viewBox="0 0 24 24"><path d="M6 12.5l4 4 8-9" /></svg>}
              </button>
            ) : <span className="ph-bullet" aria-hidden="true" />}
            <button className="ph-row-body" onClick={() => onOpen(i)}>
              <span className="ph-row-text">
                {i.priority === 1 && !i.done && <b className="ph-flag">! </b>}
                <span dir="auto" className="ph-bidi">{i.text}</span>
              </span>
              {meta && <span className={`ph-meta${overdue ? ' is-late' : ''}`}>{meta}</span>}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function upcoming(events: CalEvent[], today: string) {
  const days = Array.from({ length: 14 }, (_, i) => addDays(today, i + 1));
  const seen = new Set<string>();
  const out: (CalEvent & { day: string })[] = [];
  for (const d of days) for (const e of eventsOn(events, d)) if (!seen.has(e.id)) { seen.add(e.id); out.push({ ...e, day: d }); }
  return out.slice(0, 12);
}

function EventList({ events, now, today, showDay }: { events: (CalEvent & { day?: string })[]; now: Date; today?: string; showDay?: boolean }) {
  return (
    <ul className="ph-list ph-events">
      {events.map((e) => (
        <li key={e.id} className={`ph-row${isPast(e, now) ? ' is-done' : ''}`}>
          <span className="ph-evbar" aria-hidden="true" />
          <div className="ph-row-body">
            <span className="ph-row-text"><span dir="auto" className="ph-bidi">{e.title}</span></span>
            <span className="ph-meta">
              {showDay && e.day && today ? shortDay(e.day, today) + ', ' : ''}
              {e.allDay ? 'All day' : eventTime(e).split('–')[0]}
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}

function RecordSheet({ sending, onCancel, onDone, onError }: {
  sending: boolean;
  onCancel: () => void;
  onDone: (audio: string, mime: string) => void;
  onError: (m: string) => void;
}) {
  const recRef = useRef<Recorder | null>(null);
  const [level, setLevel] = useState(0);
  const [secs, setSecs] = useState(0);

  useEffect(() => {
    const r = new Recorder();
    let alive = true;
    r.start().then(() => { if (alive) recRef.current = r; else r.cancel(); })
      .catch(() => onError('Allow the microphone for this site in your browser settings'));
    const lv = setInterval(() => recRef.current && setLevel(recRef.current.level()), 70);
    const tm = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => { alive = false; clearInterval(lv); clearInterval(tm); recRef.current?.cancel(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { if (secs >= 75) finish(); }); // hard stop at 75 seconds, keeps the upload small

  async function finish() {
    const r = recRef.current;
    if (!r) return;
    recRef.current = null;
    try {
      const { audio, mime } = await r.stop();
      onDone(audio, mime);
    } catch {
      onError('That recording did not work. Try again');
    }
  }

  return (
    <div className="ph-sheet-wrap" onClick={(e) => e.target === e.currentTarget && !sending && onCancel()}>
      <div className="ph-sheet ph-rec">
        {sending ? (
          <p className="ph-rec-status ph-shimmer">Organizing</p>
        ) : (
          <>
            <div className="ph-rec-wave" aria-hidden="true">
              {[0.35, 0.6, 0.85, 1, 0.85, 0.6, 0.35].map((b, i) => (
                <i key={i} style={{ transform: `scaleY(${0.12 + Math.min(1, level * 1.7) * b})` }} />
              ))}
            </div>
            <p className="ph-rec-status">
              {Math.floor(secs / 60)}:{String(secs % 60).padStart(2, '0')}
            </p>
            <p className="ph-rec-hint">Talk in Arabic, Hebrew or English</p>
            <div className="ph-rec-actions">
              <button className="ph-btn" onClick={onCancel}>Cancel</button>
              <button className="ph-btn ph-btn-primary" onClick={finish}>Done</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function EditSheet({ item, today, onClose, onSave, onDelete }: {
  item: Item | null; today: string;
  onClose: () => void; onSave: (i: ItemInput) => void; onDelete?: () => void;
}) {
  const [text, setText] = useState(item?.text ?? '');
  const [kind, setKind] = useState<Item['kind']>(item?.kind ?? 'task');
  const [day, setDay] = useState(item?.due_date ?? today);
  const [time, setTime] = useState(item?.kind === 'reminder' && item.remind_at ? localTime(item.remind_at) : item?.due_time ?? '');
  const [priority, setPriority] = useState<1 | 2 | 3>(item?.priority ?? 2);
  const [err, setErr] = useState('');
  const tomorrow = addDays(today, 1);

  const save = () => {
    if (!text.trim()) return setErr('Write something first');
    if (kind === 'reminder' && !time) return setErr('Reminders need a time');
    const input: ItemInput = { text: text.trim(), kind, priority };
    if (kind === 'idea') { input.due_date = null; input.due_time = null; input.remind_at = null; }
    else if (kind === 'reminder') {
      input.due_date = day; input.due_time = null;
      input.remind_at = zonedIso(day, time);
    } else { input.due_date = day; input.due_time = time || null; input.remind_at = null; }
    onSave(input);
  };

  return (
    <div className="ph-sheet-wrap" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="ph-sheet">
        <div className="ph-sheet-bar">
          <button className="ph-link" onClick={onClose}>Cancel</button>
          <strong>{item ? 'Edit' : 'New'}</strong>
          <button className="ph-link ph-link-strong" onClick={save}>{item ? 'Save' : 'Add'}</button>
        </div>

        <textarea
          dir="auto"
          className="ph-field"
          rows={2}
          value={text}
          autoFocus={!item}
          onChange={(e) => { setText(e.target.value); setErr(''); }}
          placeholder="What is it?"
        />
        {err && <p className="ph-err">{err}</p>}

        <Seg value={kind} onChange={(v) => { setKind(v); setErr(''); }} options={[['task', 'Task'], ['reminder', 'Reminder'], ['idea', 'Idea']]} />

        {kind !== 'idea' && (
          <div className="ph-group">
            <div className="ph-line">
              <span>Day</span>
              <div className="ph-chips">
                <button className={day === today ? 'on' : ''} onClick={() => setDay(today)}>Today</button>
                <button className={day === tomorrow ? 'on' : ''} onClick={() => setDay(tomorrow)}>Tomorrow</button>
                <input type="date" value={day ?? ''} onChange={(e) => setDay(e.target.value)} aria-label="Pick a date" />
              </div>
            </div>
            <label className="ph-line">
              <span>Time</span>
              <input type="time" value={time} onChange={(e) => { setTime(e.target.value); setErr(''); }} />
            </label>
          </div>
        )}

        {kind === 'task' && (
          <Seg value={String(priority)} onChange={(v) => setPriority(Number(v) as 1 | 2 | 3)} options={[['1', 'Important'], ['2', 'Normal'], ['3', 'Someday']]} />
        )}

        {onDelete && <button className="ph-delete" onClick={onDelete}>Delete</button>}
      </div>
    </div>
  );
}

function Seg<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: [T, string][] }) {
  return (
    <div className="ph-seg" role="radiogroup">
      {options.map(([v, label]) => (
        <button key={v} role="radio" aria-checked={value === v} className={value === v ? 'on' : ''} onClick={() => onChange(v)}>{label}</button>
      ))}
    </div>
  );
}

function localDay() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: TZ })).getDay();
}

function localTime(iso: string) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
}

// Day + HH:MM in the home timezone, as a real instant.
function zonedIso(day: string, time: string) {
  const guess = new Date(`${day}T${time}:00Z`);
  const asLocal = new Date(guess.toLocaleString('en-US', { timeZone: TZ }));
  const diff = asLocal.getTime() - new Date(guess.toLocaleString('en-US', { timeZone: 'UTC' })).getTime();
  return new Date(guess.getTime() - diff).toISOString();
}

function msg(e: unknown) {
  return e instanceof Error ? e.message : 'Something went wrong';
}
