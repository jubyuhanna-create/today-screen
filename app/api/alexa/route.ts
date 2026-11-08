import { after } from 'next/server';
import { runThink } from '@/lib/think';
import { CITY, SKY_WORD, getForecast } from '@/lib/weather';
import { store } from '@/lib/store';
import { ping } from '@/lib/broadcast';
import { TZ } from '@/lib/time';
import { CARRIER_BY_INTENT } from '@/lib/alexa-carriers';

export const maxDuration = 40;

// Alexa custom skill endpoint. "Alexa, ask Katia to ..." lands here as text.
// Only requests from your own skill are accepted (ALEXA_SKILL_ID), and only fresh ones.

type AlexaReq = {
  session?: { application?: { applicationId?: string } };
  context?: { System?: { application?: { applicationId?: string } } };
  request: {
    type: string;
    timestamp?: string;
    intent?: { name: string; slots?: Record<string, { value?: string }> };
  };
};

function say(text: string, end = true, reprompt?: string) {
  const clean = text.replace(/[<>&]/g, ' ').slice(0, 7000);
  return Response.json({
    version: '1.0',
    response: {
      outputSpeech: { type: 'PlainText', text: clean },
      ...(reprompt ? { reprompt: { outputSpeech: { type: 'PlainText', text: reprompt } } } : {}),
      shouldEndSession: end,
    },
  });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as AlexaReq | null;
  if (!body?.request) return Response.json({ error: 'Not an Alexa request' }, { status: 400 });

  const want = process.env.ALEXA_SKILL_ID;
  const appId = body.session?.application?.applicationId || body.context?.System?.application?.applicationId;
  if (!want || appId !== want) return Response.json({ error: 'Unknown skill' }, { status: 403 });
  const ts = body.request.timestamp ? Date.parse(body.request.timestamp) : 0;
  if (!ts || Math.abs(Date.now() - ts) > 150000) return Response.json({ error: 'Old request' }, { status: 400 });

  const { type, intent } = body.request;
  if (type === 'LaunchRequest') return say('Hi, it is Katia. What do you need?', false, 'Tell me a task, a reminder, or a question.');
  if (type === 'SessionEndedRequest') return Response.json({ version: '1.0', response: {} });
  if (type !== 'IntentRequest' || !intent) return say('Sorry, I did not get that.');

  if (intent.name === 'AMAZON.StopIntent' || intent.name === 'AMAZON.CancelIntent') return say('Okay.');
  if (intent.name === 'AMAZON.HelpIntent') {
    return say('Say things like: add tidy my room today, remind me in ten minutes to call dad, what is my schedule tomorrow, or what is the weather on Sunday.', false, 'What do you need?');
  }

  // Put back the words Alexa cut off, so "remind me ..." stays a reminder.
  const rest = intent.slots?.query?.value?.trim();
  const carrier = CARRIER_BY_INTENT[intent.name];
  const query = rest ? (carrier && carrier !== 'to' && carrier !== 'please' ? `${carrier} ${rest}` : rest) : undefined;
  if (!query) return say('What should I do?', false, 'Tell me a task, a reminder, or a question.');

  // Weather is answered straight from the forecast, no AI: instant and always works.
  if (/\b(weather|rain|raining|temperature|forecast|hot|cold|sunny|degrees)\b/i.test(query)) {
    const quick = await weatherAnswer(query).catch(() => null);
    if (quick) return say(quick);
  }

  // Alexa waits at most 8 seconds, and a cold start can eat 2 of them. If the AI is not done in about 6, Alexa says so
  // and the work carries on in the background: it is still saved and shows on the screen.
  const work = runThink({ text: query }, 'alexa', 30000);
  const r = await Promise.race([work, new Promise<null>((ok) => setTimeout(() => ok(null), 4500))]);
  if (!r) {
    after(async () => { await work.catch(() => {}); });
    return say('Got it. I am still working on it, check your screen.');
  }
  if (!r.ok) return say(/limit/i.test(r.error) ? 'The AI is out of requests for today.' : 'The AI took too long. Try again.');
  const b = r.body;
  const spoken = b.answer || b.reply || 'Done.';
  return say(spoken);
}

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

async function weatherAnswer(query: string) {
  const q = query.toLowerCase();
  const todayJs = new Date(new Date().toLocaleString('en-US', { timeZone: TZ })).getDay();
  let day = 0;
  if (/tomorrow/.test(q)) day = 1;
  else if (/week/.test(q)) day = -1;
  else {
    const w = WEEKDAYS.findIndex((d) => q.includes(d));
    if (w >= 0) day = (w - todayJs + 7) % 7;
  }
  const f = await getForecast(2500);
  let text: string;
  if (day === -1) {
    const rainy = f.days.filter((d) => d.rain >= 50).map((d) => new Date(d.date + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' }));
    const hi = Math.max(...f.days.map((d) => d.max)), lo = Math.min(...f.days.map((d) => d.min));
    text = `This week in ${CITY}: between ${lo} and ${hi} degrees. ${rainy.length ? `Rain is likely on ${rainy.join(' and ')}.` : 'No real rain expected.'}`;
    day = 0;
  } else {
    const d = f.days[Math.min(day, f.days.length - 1)];
    const name = day === 0 ? 'Today' : day === 1 ? 'Tomorrow' : new Date(d.date + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
    const now = day === 0 ? ` It is ${f.now.temp} degrees now.` : '';
    text = `${name} in ${CITY}: ${SKY_WORD[d.sky].toLowerCase()}, ${d.min} to ${d.max} degrees, ${d.rain} percent chance of rain.${now}`;
  }
  // Open the weather screen on the TV too.
  await store().setMeta('last_reply', {
    at: Date.now(), source: 'alexa', transcript: query, reply: '', intent: 'weather', answer: text, schedule_day: null, weather_day: day,
  });
  await ping();
  return text;
}
