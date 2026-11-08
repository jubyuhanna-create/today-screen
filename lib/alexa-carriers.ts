// Alexa drops the first words of what you say (the carrier phrase) and only sends the rest.
// Each carrier gets its own intent, so we know which words were dropped and can put them back.
export const CARRIERS = [
  'remind me', 'remind me to', 'set a reminder', 'set a reminder to', 'add', 'put', 'to', 'please',
  'what', "what's", 'what is', 'when', "when's", 'where', 'who', 'how', 'how much', 'how many',
  'is', 'are', 'will', 'do', 'does', 'can you', 'tell me', 'show', 'show me', 'open',
  'set', 'schedule', 'delete', 'remove', 'move', 'cancel', 'mark', 'finish', 'i', "i'm", 'i have', 'i need to',
  'my', 'about', 'for', 'that', 'the', 'call', 'buy', 'study', 'meeting', 'appointment',
];

export function intentName(carrier: string) {
  const words = carrier.replace(/'/g, '').split(/\s+/).map((w) => w[0].toUpperCase() + w.slice(1));
  return `Say${words.join('')}Intent`;
}

export const CARRIER_BY_INTENT: Record<string, string> = Object.fromEntries(CARRIERS.map((c) => [intentName(c), c]));
