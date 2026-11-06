'use client';
import { useEffect, useState } from 'react';
import { forecastUrl, parseForecast, type Forecast } from '../weather';

/** The 7 day forecast, refreshed every 30 minutes. Fetched straight from Open-Meteo by the browser. */
export function useForecast() {
  const [f, setF] = useState<Forecast | null>(null);
  useEffect(() => {
    const load = () =>
      fetch(forecastUrl())
        .then((r) => r.json())
        .then((d) => setF(parseForecast(d)))
        .catch(() => {});
    load();
    const t = setInterval(load, 30 * 60000);
    return () => clearInterval(t);
  }, []);
  return f;
}
