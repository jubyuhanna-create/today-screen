import type { Sky } from '@/lib/weather';

// Simple line icons that take the text color.
export function WeatherIcon({ sky, day = true, size = '1em' }: { sky: Sky; day?: boolean; size?: string }) {
  const cloud = 'M7 18h10.5a3.5 3.5 0 0 0 .4-6.98A5 5 0 0 0 8.2 9.6 3.9 3.9 0 0 0 7 18z';
  const sun = (
    <g>
      <circle cx="12" cy="12" r="4" />
      {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
        <line key={a} x1="12" y1="3" x2="12" y2="5" transform={`rotate(${a} 12 12)`} />
      ))}
    </g>
  );
  const moon = <path d="M16.5 14.5A6.5 6.5 0 0 1 9.5 5a6.5 6.5 0 1 0 7 9.5z" />;
  let body;
  switch (sky) {
    case 'clear':
      body = day ? sun : moon;
      break;
    case 'partly':
      body = (
        <g>
          <g transform="translate(-3.5 -3.5) scale(0.75)">{day ? sun : moon}</g>
          <path d="M9 19h8.5a3 3 0 0 0 .3-5.98A4.3 4.3 0 0 0 9.9 11.8 3.4 3.4 0 0 0 9 19z" />
        </g>
      );
      break;
    case 'cloudy':
      body = <path d={cloud} />;
      break;
    case 'fog':
      body = <g><path d="M7 12h10.5a3 3 0 0 0 .3-5.98A4.5 4.5 0 0 0 8.2 5.2 3.4 3.4 0 0 0 7 12z" /><line x1="4" y1="16" x2="20" y2="16" /><line x1="6" y1="20" x2="18" y2="20" /></g>;
      break;
    case 'drizzle':
    case 'rain':
      body = (
        <g>
          <path d="M7 14h10.5a3.5 3.5 0 0 0 .4-6.98A5 5 0 0 0 8.2 5.6 3.9 3.9 0 0 0 7 14z" />
          <line x1="9" y1="17" x2="8" y2="20" />
          <line x1="13" y1="17" x2="12" y2="20" />
          {sky === 'rain' && <line x1="17" y1="17" x2="16" y2="20" />}
        </g>
      );
      break;
    case 'snow':
      body = <g><path d="M7 14h10.5a3.5 3.5 0 0 0 .4-6.98A5 5 0 0 0 8.2 5.6 3.9 3.9 0 0 0 7 14z" /><circle cx="9" cy="18" r=".6" /><circle cx="13" cy="19" r=".6" /><circle cx="16.5" cy="17.5" r=".6" /></g>;
      break;
    default:
      body = <g><path d="M7 14h10.5a3.5 3.5 0 0 0 .4-6.98A5 5 0 0 0 8.2 5.6 3.9 3.9 0 0 0 7 14z" /><path d="M12.5 15l-2 3.5h3l-2 3.5" /></g>;
  }
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {body}
    </svg>
  );
}
