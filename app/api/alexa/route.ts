import { after } from 'next/server';
import { runThink } from '@/lib/think';

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

  const query = intent.slots?.query?.value?.trim();
  if (!query) return say('What should I do?', false, 'Tell me a task, a reminder, or a question.');

  // Alexa waits at most 8 seconds. If the AI is not done in about 6, Alexa says so
  // and the work carries on in the background: it is still saved and shows on the screen.
  const work = runThink({ text: query }, 'alexa', 30000);
  const r = await Promise.race([work, new Promise<null>((ok) => setTimeout(() => ok(null), 6200))]);
  if (!r) {
    after(async () => { await work.catch(() => {}); });
    return say('Got it. I am still working on it, check your screen.');
  }
  if (!r.ok) return say(/limit/i.test(r.error) ? 'The AI is out of requests for today.' : 'The AI took too long. Try again.');
  const b = r.body;
  const spoken = b.answer || b.reply || 'Done.';
  return say(spoken);
}
