export type Kind = 'task' | 'idea' | 'reminder';

export interface Item {
  id: string;
  kind: Kind;
  text: string;
  priority: 1 | 2 | 3;
  due_date: string | null; // YYYY-MM-DD
  due_time: string | null; // HH:MM
  remind_at: string | null; // ISO
  category: string | null;
  done: boolean;
  done_at: string | null;
  source: string | null;
  created_at: string;
  updated_at: string;
}

export type ItemInput = Partial<Omit<Item, 'id' | 'created_at' | 'updated_at'>> & { text?: string };

export interface Summary {
  date: string;
  text: string;
}

export interface State {
  today: string;
  items: Item[];
  summary: Summary | null;
  channel: string | null;
  demo: boolean;
}
