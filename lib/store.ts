import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Item, ItemInput, Summary } from './types';
import { addDays, isoDay } from './time';

const FIELDS = ['kind', 'text', 'priority', 'due_date', 'due_time', 'remind_at', 'category', 'done', 'source'] as const;

function clean(input: ItemInput): Partial<Item> {
  const out: Record<string, unknown> = {};
  for (const f of FIELDS) if (f in input) out[f] = (input as Record<string, unknown>)[f];
  if (typeof out.text === 'string') out.text = (out.text as string).trim();
  if (out.due_time === '') out.due_time = null;
  if (out.due_date === '') out.due_date = null;
  if (typeof out.due_time === 'string') out.due_time = (out.due_time as string).slice(0, 5);
  if ('done' in out) out.done_at = out.done ? new Date().toISOString() : null;
  return out as Partial<Item>;
}

export interface Store {
  demo: boolean;
  list(): Promise<Item[]>;
  create(input: ItemInput): Promise<Item>;
  update(id: string, input: ItemInput): Promise<Item | null>;
  remove(id: string): Promise<void>;
  getSummary(): Promise<Summary | null>;
  setSummary(s: Summary): Promise<void>;
  getMeta<T>(key: string): Promise<T | null>;
  setMeta(key: string, value: unknown): Promise<void>;
}

// ---------- Supabase ----------

class SupaStore implements Store {
  demo = false;
  constructor(private db: SupabaseClient) {}

  async list() {
    const since = addDays(isoDay(), -1) + 'T00:00:00Z';
    const { data, error } = await this.db
      .from('items')
      .select('*')
      .or(`done.eq.false,done_at.gte.${since}`)
      .order('created_at', { ascending: true })
      .limit(400);
    if (error) throw error;
    return (data as Item[]).map(normalize);
  }

  async create(input: ItemInput) {
    const row = { kind: 'task', priority: 2, ...clean(input) };
    const { data, error } = await this.db.from('items').insert(row).select().single();
    if (error) throw error;
    return normalize(data as Item);
  }

  async update(id: string, input: ItemInput) {
    const { data, error } = await this.db
      .from('items')
      .update({ ...clean(input), updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .maybeSingle();
    if (error) throw error;
    return data ? normalize(data as Item) : null;
  }

  async remove(id: string) {
    const { error } = await this.db.from('items').delete().eq('id', id);
    if (error) throw error;
  }

  async getSummary() {
    return this.getMeta<Summary>('summary');
  }

  async setSummary(s: Summary) {
    await this.setMeta('summary', s);
  }

  async getMeta<T>(key: string) {
    const { data } = await this.db.from('meta').select('value').eq('key', key).maybeSingle();
    return (data?.value as T) ?? null;
  }

  async setMeta(key: string, value: unknown) {
    if (value === null) {
      await this.db.from('meta').delete().eq('key', key);
      return;
    }
    await this.db.from('meta').upsert({ key, value, updated_at: new Date().toISOString() });
  }
}

function normalize(i: Item): Item {
  return { ...i, due_time: i.due_time ? i.due_time.slice(0, 5) : null };
}

// ---------- In-memory demo (no Supabase keys yet) ----------

class MemoryStore implements Store {
  demo = true;
  items: Item[] = [];
  summary: Summary | null = null;

  constructor() {
    const t = isoDay();
    const now = Date.now();
    const mk = (p: Partial<Item>, minsAgo: number): Item => ({
      id: Math.random().toString(36).slice(2),
      kind: 'task', text: '', priority: 2, due_date: t, due_time: null, remind_at: null,
      category: null, done: false, done_at: null, source: 'demo',
      created_at: new Date(now - minsAgo * 60000).toISOString(),
      updated_at: new Date(now - minsAgo * 60000).toISOString(),
      ...p,
    });
    this.items = [
      mk({ text: 'أخلص تصميم شاشة الداشبورد', priority: 1, due_time: '21:00' }, 300),
      mk({ text: 'ללמוד פיזיקה לבגרות, פרק חשמל' }, 280),
      mk({ text: 'أرد على صاحب المحل بخصوص كروت التقييم' }, 260),
      mk({ text: 'Clean up the Roblox map', priority: 3 }, 240),
      mk({ text: 'לקנות כבל HDMI', done: true, done_at: new Date(now - 3600000).toISOString() }, 400),
      mk({ text: 'أتصل بالدكتور', due_date: addDays(t, 1), due_time: '09:30' }, 200),
      mk({ text: 'Send the bagrut site draft to Ameer', due_date: addDays(t, 3) }, 190),
      mk({ kind: 'idea', due_date: null, text: 'فيديو شورتس عن الشاشة هاي', category: 'Content' }, 150),
      mk({ kind: 'idea', due_date: null, text: 'להוסיף מזג אוויר של מחר', category: 'This project' }, 120),
      mk({ kind: 'idea', due_date: null, text: 'ESP32 button that marks the top task done', category: 'Hardware' }, 100),
      mk({ kind: 'reminder', due_date: t, text: 'أطلع لأبوي', remind_at: new Date(now + 45 * 60000).toISOString() }, 60),
    ];
    this.summary = { date: t, text: 'Finish the dashboard design before nine. The doctor call moved to tomorrow morning.' };
  }

  async list() { return [...this.items]; }

  async create(input: ItemInput) {
    const t = new Date().toISOString();
    const item: Item = {
      id: Math.random().toString(36).slice(2), kind: 'task', text: '', priority: 2, due_date: null,
      due_time: null, remind_at: null, category: null, done: false, done_at: null, source: null,
      created_at: t, updated_at: t, ...clean(input),
    } as Item;
    this.items.push(item);
    return item;
  }

  async update(id: string, input: ItemInput) {
    const i = this.items.findIndex((x) => x.id === id);
    if (i < 0) return null;
    this.items[i] = { ...this.items[i], ...clean(input), updated_at: new Date().toISOString() } as Item;
    return this.items[i];
  }

  async remove(id: string) { this.items = this.items.filter((x) => x.id !== id); }
  meta: Record<string, unknown> = {};
  async getSummary() { return this.summary; }
  async setSummary(s: Summary) { this.summary = s; }
  async getMeta<T>(key: string) { return (this.meta[key] as T) ?? null; }
  async setMeta(key: string, value: unknown) { if (value === null) delete this.meta[key]; else this.meta[key] = value; }
}

const g = globalThis as unknown as { __todayStore?: Store };

export function store(): Store {
  if (g.__todayStore) return g.__todayStore;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  g.__todayStore = url && key
    ? new SupaStore(createClient(url, key, { auth: { persistSession: false } }))
    : new MemoryStore();
  return g.__todayStore;
}
