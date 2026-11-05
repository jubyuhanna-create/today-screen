'use client';

import { BELLS, DAYS, MINE, dayRows, type DayKey } from '@/lib/schedule';
import './schedule.css';

export function ScheduleView({ day, onDay, label, variant }: {
  day: DayKey;
  onDay: (d: DayKey) => void;
  label?: string; // Today, Tomorrow
  variant: 'tv' | 'phone';
}) {
  const info = DAYS.find((d) => d.key === day)!;
  const rows = dayRows(day);
  const last = rows.length ? rows[rows.length - 1].to : 1;

  return (
    <section className={`sch sch-${variant}`} aria-label={`${info.en} timetable`}>
      <header className="sch-head">
        <div>
          <p className="sch-label">{label ?? 'Timetable'}</p>
          <h2 className="sch-day">{info.en} <span lang="ar">{info.ar}</span></h2>
        </div>
        <nav className="sch-days" aria-label="Days">
          {DAYS.map((d) => (
            <button key={d.key} className={d.key === day ? 'on' : ''} onClick={() => onDay(d.key)} aria-pressed={d.key === day}>
              {d.en.slice(0, 3)}
            </button>
          ))}
        </nav>
      </header>

      <ol className="sch-grid" style={{ gridTemplateRows: `repeat(${last}, var(--sch-unit))` }}>
        {rows.map((l) => {
          const span = `${l.from}${l.to > l.from ? '–' + l.to : ''}`;
          const mine = l.subjects.some((s) => MINE.includes(s));
          const only = l.subjects.length === 1;
          return (
            <li
              key={l.from}
              className={`sch-block${l.free ? ' is-free' : ''}${mine && only ? ' is-mine' : ''}`}
              style={{ gridRow: `${l.from} / ${l.to + 1}` }}
            >
              <span className="sch-num">
                {span}
                {BELLS[l.from] && <small>{BELLS[l.from]}</small>}
              </span>
              {l.free ? (
                <span className="sch-free">Free</span>
              ) : (
                <span className="sch-body" lang="ar" dir="rtl">
                  {only ? (
                    <span className="sch-subject">{l.subjects[0]}</span>
                  ) : (
                    <span className="sch-options">
                      {l.subjects.map((s) => (
                        <span key={s} className={`sch-opt${MINE.includes(s) ? ' is-mine' : ''}`}>{s}</span>
                      ))}
                    </span>
                  )}
                  <span className="sch-teachers">{l.teachers.join('، ')}</span>
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
