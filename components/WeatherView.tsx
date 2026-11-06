'use client';

import { CITY, SKY_WORD, type Forecast } from '@/lib/weather';
import { WeatherIcon } from './WeatherIcon';
import './weather.css';

const TZ = process.env.NEXT_PUBLIC_TZ || 'Asia/Jerusalem';

function dayName(date: string, today: string, short = false) {
  if (date === today) return 'Today';
  const d = new Date(date + 'T12:00:00Z');
  return d.toLocaleDateString('en-US', { weekday: short ? 'short' : 'long', timeZone: 'UTC' });
}

export function WeatherView({ forecast, index, onIndex, variant }: {
  forecast: Forecast | null;
  index: number;
  onIndex: (i: number) => void;
  variant: 'tv' | 'phone';
}) {
  if (!forecast) return <section className={`wx wx-${variant}`}><p className="wx-loading">Loading the forecast</p></section>;
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
  const day = forecast.days[Math.min(index, forecast.days.length - 1)];
  const isToday = day.date === today;

  // Hours to draw: today from this hour on (next 24), other days the whole day.
  const nowKey = new Intl.DateTimeFormat('sv-SE', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit' })
    .format(new Date()).replace(' ', 'T').slice(0, 13);
  const all = forecast.hours;
  const start = isToday ? Math.max(0, all.findIndex((h) => h.time.slice(0, 13) >= nowKey)) : all.findIndex((h) => h.time.startsWith(day.date));
  const step = variant === 'tv' ? 2 : 3;
  const hours = all.slice(start, start + 24).filter((_, i) => i % step === 0);

  const temps = hours.map((h) => h.temp);
  const hi = Math.max(...temps), lo = Math.min(...temps);
  const W = 100, H = 46;
  const y = (t: number) => (hi === lo ? H / 2 : 6 + (1 - (t - lo) / (hi - lo)) * (H - 12));
  const pts = hours.map((h, i) => `${i * W + W / 2},${y(h.temp)}`).join(' ');

  return (
    <section className={`wx wx-${variant}`} aria-label="Weather">
      <header className="wx-head">
        <div className="wx-now">
          <WeatherIcon sky={isToday ? forecast.now.sky : day.sky} day={isToday ? forecast.now.day : true} size="1em" />
          <div>
            <p className="wx-label">{dayName(day.date, today)} in {CITY}</p>
            <p className="wx-big">
              {isToday ? `${forecast.now.temp}°` : `${day.max}°`}
              <span>{isToday ? `${SKY_WORD[forecast.now.sky]}, feels ${forecast.now.feels}°` : `${SKY_WORD[day.sky]}, low ${day.min}°`}</span>
            </p>
          </div>
        </div>
        <dl className="wx-facts">
          <div><dt>High and low</dt><dd>{day.max}° / {day.min}°</dd></div>
          <div><dt>Rain</dt><dd>{day.rain}%{day.rainMm ? `, ${day.rainMm} mm` : ''}</dd></div>
          <div><dt>Wind</dt><dd>{day.wind} km/h</dd></div>
          <div><dt>Sun</dt><dd>{day.sunrise} to {day.sunset}</dd></div>
        </dl>
      </header>

      <div className="wx-hours" style={{ gridTemplateColumns: `repeat(${hours.length}, minmax(0, 1fr))` }}>
        <svg className="wx-line" viewBox={`0 0 ${hours.length * W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
          <polyline points={pts} fill="none" vectorEffect="non-scaling-stroke" />
        </svg>
        {hours.map((h, i) => (
          <div key={h.time} className="wx-hour">
            <span className="wx-htemp" style={{ top: `calc(var(--wx-chart) * ${(y(h.temp) / H).toFixed(3)})` }}><b>{h.temp}°</b></span>
            <span className="wx-dot" style={{ top: `calc(var(--wx-chart) * ${(y(h.temp) / H).toFixed(3)})` }} />
            <WeatherIcon sky={h.sky} day={h.day} size="1.6em" />
            <span className="wx-rain">{h.rain >= 20 ? `${h.rain}%` : ''}</span>
            <span className="wx-time">{i === 0 && isToday ? 'Now' : h.time.slice(11, 13)}</span>
          </div>
        ))}
      </div>

      <ol className="wx-days">
        {forecast.days.map((d, i) => (
          <li key={d.date}>
            <button className={i === index ? 'on' : ''} onClick={() => onIndex(i)} aria-pressed={i === index}>
              <span className="wx-dname">{dayName(d.date, today, true)}</span>
              <WeatherIcon sky={d.sky} size="1.7em" />
              <span className="wx-range"><b>{d.max}°</b> {d.min}°</span>
              <span className="wx-drain">{d.rain >= 20 ? `${d.rain}%` : ' '}</span>
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}
