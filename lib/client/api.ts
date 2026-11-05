'use client';
import type { Item, ItemInput, State } from '../types';

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
  if (!res.ok) throw new Error(data.error || 'Something went wrong');
  return data as T;
}

export const api = {
  state: () => req<State>('/api/state'),
  create: (input: ItemInput) => req<Item>('/api/items', { method: 'POST', body: JSON.stringify(input) }),
  update: (id: string, input: ItemInput) => req<Item>(`/api/items/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
  remove: (id: string) => req<{ ok: true }>(`/api/items/${id}`, { method: 'DELETE' }),
  think: (body: { text?: string; audio?: string; mime?: string; source: 'tv' | 'phone' }) =>
    req<{ transcript: string; reply: string; language: string; changed: string[] }>('/api/think', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  login: (passcode: string) => req<{ ok: true }>('/api/login', { method: 'POST', body: JSON.stringify({ passcode }) }),
};
