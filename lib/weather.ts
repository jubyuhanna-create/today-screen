// Weather from Open-Meteo: free, no key, real forecast models.
// Used by the TV and phone in the browser, and by the AI on the server.

export const LAT = process.env.NEXT_PUBLIC_LAT || '32.70';
export const LON = process.env.NEXT_PUBLIC_LON || '35.30';
export const CITY = process.env.NEXT_PUBLIC_CITY || 'Nazareth';
const TZW = process.env.NEXT_PUBLIC_TZ || 'Asia/Jerusalem';

export type Sky = 'clear' | 'partly' | 'cloudy' | 'fog' | 'drizzle' | 'rain' | 'snow' | 'storm';

export interface Hour {
  time: string; // local "YYYY-MM-DDTHH:MM"
  temp: number;
  feels: number;
  rain: number; // chance, %
  sky: Sky;
  day: boolean;
}

export interface Day {
  date: string; // YYYY-MM-DD
  max: number;
  min: number;
  rain: number; // max chance, %
  rainMm: number;
  sky: Sky;
  wind: number; // km/h, max
  uv: number;
  sunrise: string;
  sunset: string;
}

export interface Forecast {
  now: { temp: number; feels: number; sky: Sky; day: boolean; wind: number; humidity: number };
  days: Day[];
  hours: Hour[];
}

export function skyOf(code: number): Sky {
  if (code === 0) return 'clear';
  if (code <= 2) return 'partly';
  if (code === 3) return 'cloudy';
  if (code <= 48) return 'fog';
  if (code <= 57) return 'drizzle';
  if (code <= 67 || (code >= 80 && code <= 82)) return 'rain';
  if (code <= 77 || code === 85 || code === 86) return 'snow';
  return 'storm';
}

export const SKY_WORD: Record<Sky, string> = {
  clear: 'Clear', partly: 'Partly cloudy', cloudy: 'Cloudy', fog: 'Fog',
  drizzle: 'Drizzle', rain: 'Rain', snow: 'Snow', storm: 'Thunderstorms',
};

export function forecastUrl() {
  const p = new URLSearchParams({
    latitude: LAT,
    longitude: LON,
    timezone: TZW,
    forecast_days: '7',
    current: 'temperature_2m,apparent_temperature,weather_code,is_day,wind_speed_10m,relative_humidity_2m',
    hourly: 'temperature_2m,apparent_temperature,precipitation_probability,weather_code,is_day',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,wind_speed_10m_max,uv_index_max,sunrise,sunset',
  });
  return `https://api.open-meteo.com/v1/forecast?${p}`;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export function parseForecast(d: any): Forecast {
  const r = Math.round;
  return {
    now: {
      temp: r(d.current.temperature_2m),
      feels: r(d.current.apparent_temperature),
      sky: skyOf(d.current.weather_code),
      day: !!d.current.is_day,
      wind: r(d.current.wind_speed_10m),
      humidity: r(d.current.relative_humidity_2m),
    },
    days: d.daily.time.map((date: string, i: number) => ({
      date,
      max: r(d.daily.temperature_2m_max[i]),
      min: r(d.daily.temperature_2m_min[i]),
      rain: r(d.daily.precipitation_probability_max[i] ?? 0),
      rainMm: Math.round((d.daily.precipitation_sum[i] ?? 0) * 10) / 10,
      sky: skyOf(d.daily.weather_code[i]),
      wind: r(d.daily.wind_speed_10m_max[i]),
      uv: Math.round(d.daily.uv_index_max[i] ?? 0),
      sunrise: String(d.daily.sunrise[i]).slice(11, 16),
      sunset: String(d.daily.sunset[i]).slice(11, 16),
    })),
    hours: d.hourly.time.map((time: string, i: number) => ({
      time,
      temp: r(d.hourly.temperature_2m[i]),
      feels: r(d.hourly.apparent_temperature[i]),
      rain: r(d.hourly.precipitation_probability[i] ?? 0),
      sky: skyOf(d.hourly.weather_code[i]),
      day: !!d.hourly.is_day[i],
    })),
  };
}

export async function getForecast(timeoutMs = 4000): Promise<Forecast> {
  const res = await fetch(forecastUrl(), { signal: AbortSignal.timeout(timeoutMs), cache: 'no-store' });
  if (!res.ok) throw new Error(`Weather ${res.status}`);
  return parseForecast(await res.json());
}

/** Short text for the AI: one line per day. */
export function forecastForPrompt(f: Forecast) {
  return `Now ${f.now.temp}°C, ${SKY_WORD[f.now.sky]}, feels ${f.now.feels}°C.\n` +
    f.days.map((d) => `${d.date}: ${SKY_WORD[d.sky]}, ${d.min} to ${d.max}°C, rain chance ${d.rain}%${d.rainMm ? ` (${d.rainMm} mm)` : ''}, wind up to ${d.wind} km/h, UV ${d.uv}`).join('\n');
}
