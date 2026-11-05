'use client';
import type { Item, ItemInput, State } from '../types';

export interface ThinkReply {
  transcript: string;
  reply: string;
  language: string;
  intent: 'organize' | 'answer' | 'schedule';
  answer: string;
  schedule_day: string | null;
  changed: string[];
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
    credentials: 'same-origin',
    cache: 'no-store',
  });
  if (res.status === 401 && typeof window !== 'undefined' && !location.pathname.startsWith('/login')) {
    location.href = '/login?next=' + encodeURIComponent(location.pathname);
    throw new Error('Passcode needed');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || (res.status === 504 ? 'The AI took too long. Try again' : res.status === 413 ? 'That recording was too long' : `Server error ${res.status}`));
  return data as T;
}

export const api = {
  state: () => req<State>('/api/state'),
  create: (input: ItemInput) => req<Item>('/api/items', { method: 'POST', body: JSON.stringify(input) }),
  update: (id: string, input: ItemInput) => req<Item>(`/api/items/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
  remove: (id: string) => req<{ ok: true }>(`/api/items/${id}`, { method: 'DELETE' }),
  think: (body: { text?: string; audio?: string; mime?: string; source: 'tv' | 'phone' }) =>
    req<ThinkReply>('/api/think', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  login: (passcode: string) => req<{ ok: true }>('/api/login', { method: 'POST', body: JSON.stringify({ passcode }) }),
};
