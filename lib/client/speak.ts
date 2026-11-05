'use client';

declare global {
  interface Window {
    TodayNative?: { toggle: () => void; speak?: (text: string) => void; stopSpeaking?: () => void };
  }
}

function langOf(text: string) {
  if (/[؀-ۿ]/.test(text)) return 'ar';
  if (/[֐-׿]/.test(text)) return 'he';
  return 'en-US';
}

/** Reads the answer out loud: Android TV's own voice in the app, the browser voice elsewhere. */
export function speak(text: string) {
  if (!text) return;
  if (window.TodayNative?.speak) return window.TodayNative.speak(text);
  if (!('speechSynthesis' in window)) return;
  const lang = langOf(text);
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang;
  const voice = speechSynthesis.getVoices().find((v) => v.lang.toLowerCase().startsWith(lang.slice(0, 2)));
  if (voice) u.voice = voice;
  speechSynthesis.cancel();
  speechSynthesis.speak(u);
}

export function stopSpeaking() {
  if (window.TodayNative?.stopSpeaking) return window.TodayNative.stopSpeaking();
  if ('speechSynthesis' in window) speechSynthesis.cancel();
}
