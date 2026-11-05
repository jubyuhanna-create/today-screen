import type { Item, ItemInput } from './types';
import { addDays, isoDay, nowDescription, offset } from './time';
import { scheduleForPrompt } from './schedule';

const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

export interface Action {
  op: 'add' | 'complete' | 'reopen' | 'update' | 'delete';
  id?: string | null;
  kind?: 'task' | 'idea' | 'reminder' | null;
  text?: string | null;
  priority?: number | null;
  due_date?: string | null;
  due_time?: string | null;
  remind_at?: string | null;
  category?: string | null;
}

export interface ThinkResult {
  intent: 'organize' | 'answer' | 'schedule';
  answer: string;
  schedule_day: string | null;
  transcript: string;
  language: string;
  actions: Action[];
  reply: string;
  summary: string;
}

const SYSTEM = `You are the assistant inside a personal day screen for one person, a 12th grade electronics student in Nazareth. He talks to it in Palestinian Arabic, Hebrew, English, or a mix.
You receive what he said (audio or text), his current open items, and his school timetable.

First decide intent:
- organize: he is adding, finishing, moving or changing tasks, ideas or reminders.
- schedule: he wants to SEE his school timetable for a day ("جدول بكرا", "what do I have Saturday", "מערכת של יום שלישי"). Set schedule_day to mon, tue, wed, thu, fri or sat. "Tomorrow" and "today" are relative to now; after 15:00 "the schedule" with no day means the next school day. Sunday has no school, so Sunday means Monday. Also write a one sentence answer summarizing that day.
- answer: anything else. A question, a chat, a calculation, advice, a fact. Answer it yourself like a smart friend.
One message can be organize plus a question; then do the actions and also fill answer.

answer rules: in the SAME language and dialect he used (Palestinian Arabic stays Palestinian Arabic, Hebrew stays Hebrew). Short, it is read on a TV and spoken aloud: at most 3 sentences, no markdown, no lists, no emoji. Empty string for pure organize.

Task rules:
- Write every item's text in the SAME language he spoke for that item. Arabic stays Arabic (keep his dialect words), Hebrew stays Hebrew, English stays English. Never translate. Tidy it into a short clear line, max about 10 words, no trailing period.
- text is ONLY the item itself. Never put notes, reasoning, translations or explanations in any field.
- One thought can produce several actions. "I finished X and add Y" is complete + add.
- When he refers to an existing item (finished it, move it, forget it, change it), use its exact id from the list. Match by meaning, across languages.
- kind: task = something to do. idea = a thought, no date. reminder = something that must ping him at a time.
- priority: 1 urgent or important, 2 normal, 3 someday. Default 2.
- due_date YYYY-MM-DD. Tasks with no date said go to today. Ideas have null due_date.
- due_time HH:MM 24h only if he said a time.
- remind_at: full ISO 8601 with his UTC offset, only for reminders. "in 20 minutes" is relative to now.
- category: one or two plain English words for ideas (e.g. Content, Hardware, School, Business). Null for tasks.
- update: include only the fields that change, plus id.
- If what he said contains nothing actionable, return no actions.
- transcript: what he said, verbatim, in the original language.
- language: ar, he, en, or mixed.
- reply: for organize, very short English confirmation of what you did, under 8 words, like "Added 2 tasks, moved 1 to tomorrow". Empty if nothing.
- summary: one or two calm English sentences for the top of his screen about today AFTER your changes. What matters most, anything with a time. Under 30 words. No greetings, no exclamation marks, no emoji.`;

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    intent: { type: 'STRING', enum: ['organize', 'answer', 'schedule'] },
    answer: { type: 'STRING' },
    schedule_day: { type: 'STRING', enum: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat'], nullable: true },
    transcript: { type: 'STRING' },
    language: { type: 'STRING' },
    actions: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          op: { type: 'STRING', enum: ['add', 'complete', 'reopen', 'update', 'delete'] },
          id: { type: 'STRING', nullable: true },
          kind: { type: 'STRING', enum: ['task', 'idea', 'reminder'], nullable: true },
          text: { type: 'STRING', nullable: true },
          priority: { type: 'INTEGER', nullable: true },
          due_date: { type: 'STRING', nullable: true },
          due_time: { type: 'STRING', nullable: true },
          remind_at: { type: 'STRING', nullable: true },
          category: { type: 'STRING', nullable: true },
        },
        required: ['op'],
      },
    },
    reply: { type: 'STRING' },
    summary: { type: 'STRING' },
  },
  required: ['intent', 'answer', 'transcript', 'language', 'actions', 'reply', 'summary'],
  propertyOrdering: ['transcript', 'language', 'intent', 'actions', 'answer', 'schedule_day', 'reply', 'summary'],
};

function context(items: Item[]) {
  const today = isoDay();
  const open = items
    .filter((i) => !i.done)
    .map((i) => ({
      id: i.id, kind: i.kind, text: i.text, priority: i.priority,
      due_date: i.due_date, due_time: i.due_time, remind_at: i.remind_at,
    }));
  return `Now: ${nowDescription()}. Today is ${today}, tomorrow is ${addDays(today, 1)}. UTC offset ${offset()}.
Open items:
${JSON.stringify(open)}

School timetable:
${scheduleForPrompt()}`;
}

async function call(parts: unknown[], schema: unknown, system: string) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY is not set');
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: schema,
          temperature: 0.2,
        },
      }),
    },
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Gemini ${res.status}: ${body.slice(0, 300)}`);
  }
  const data = await res.json();
  const text: string | undefined = data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('');
  if (!text) throw new Error('Gemini returned nothing');
  return JSON.parse(text);
}

export async function think(
  input: { text?: string; audio?: string; mime?: string },
  items: Item[],
): Promise<ThinkResult> {
  const parts: unknown[] = [{ text: context(items) }];
  if (input.audio) {
    parts.push({ text: 'He said (audio):' });
    parts.push({ inlineData: { mimeType: input.mime || 'audio/wav', data: input.audio } });
  } else {
    parts.push({ text: 'He typed: ' + (input.text ?? '') });
  }
  const r = (await call(parts, SCHEMA, SYSTEM)) as ThinkResult;
  r.actions = Array.isArray(r.actions) ? r.actions : [];
  r.answer = typeof r.answer === 'string' ? r.answer : '';
  if (!['organize', 'answer', 'schedule'].includes(r.intent)) r.intent = r.actions.length ? 'organize' : 'answer';
  return r;
}

export async function summarize(items: Item[]) {
  const r = await call(
    [{ text: context(items) + '\nWrite only the morning summary for today. Nothing was said; return no actions, empty transcript.' }],
    SCHEMA,
    SYSTEM,
  );
  return String(r.summary || '');
}

export function actionToInput(a: Action, source: string): ItemInput {
  const out: ItemInput = {};
  if (a.kind) out.kind = a.kind;
  if (a.text) out.text = a.text;
  if (a.priority && [1, 2, 3].includes(a.priority)) out.priority = a.priority as 1 | 2 | 3;
  if (a.due_date !== undefined && (a.due_date === null || /^\d{4}-\d{2}-\d{2}$/.test(a.due_date))) out.due_date = a.due_date;
  if (a.due_time !== undefined && (a.due_time === null || /^\d{1,2}:\d{2}/.test(a.due_time))) out.due_time = a.due_time;
  if (a.remind_at !== undefined && (a.remind_at === null || !isNaN(Date.parse(a.remind_at)))) out.remind_at = a.remind_at;
  if (a.category !== undefined) out.category = a.category;
  if (a.op === 'add') {
    out.source = source;
    if (!out.kind) out.kind = 'task';
    if (out.kind === 'task' && out.due_date === undefined) out.due_date = isoDay();
    if (out.kind === 'reminder' && !out.due_date && out.remind_at) out.due_date = isoDay(new Date(out.remind_at));
  }
  return out;
}
