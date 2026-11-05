// School timetable, class 12/2, from 19.10.2026.
// A period with several subjects means the class splits into groups.
// Edit MINE to the subjects that are yours, so they stand out on the screen.

export type DayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat';

export interface Lesson {
  from: number; // first period
  to: number; // last period (same as from for a single period)
  subjects: string[];
  teachers: string[];
}

export const MINE = ['الكترونيكا Arduino'];

// Optional bell times, period number -> 'HH:MM'. Fill in when you know them.
export const BELLS: Record<number, string> = {};

export const DAYS: { key: DayKey; en: string; ar: string; js: number }[] = [
  { key: 'mon', en: 'Monday', ar: 'الاثنين', js: 1 },
  { key: 'tue', en: 'Tuesday', ar: 'الثلاثاء', js: 2 },
  { key: 'wed', en: 'Wednesday', ar: 'الأربعاء', js: 3 },
  { key: 'thu', en: 'Thursday', ar: 'الخميس', js: 4 },
  { key: 'fri', en: 'Friday', ar: 'الجمعة', js: 5 },
  { key: 'sat', en: 'Saturday', ar: 'السبت', js: 6 },
];

const ENGLISH_T = ['وفاء بولص (4 وحدات)', 'ميساء دويري (4+ وحدات)', 'لمار عواد أبو داهود (5 وحدات)'];
const ARDUINO = { subjects: ['الكترونيكا Arduino'], teachers: ['أشرف خوريّة'] };

export const SCHEDULE: Record<DayKey, Lesson[]> = {
  mon: [
    { from: 1, to: 2, subjects: ['اللغة العربية'], teachers: ['حنان أبو خضرة'] },
    { from: 3, to: 3, subjects: ['اللغة الإنجليزية'], teachers: ENGLISH_T },
    { from: 4, to: 4, subjects: ['اللغة العبرية'], teachers: ['كلوديا بولص'] },
    { from: 5, to: 5, subjects: ['المدنيات'], teachers: ['لورين ارملي'] },
    { from: 6, to: 7, subjects: ['التربية البدنية'], teachers: ['بشارة بشارة', 'ريم حلو'] },
    { from: 10, to: 10, ...ARDUINO },
  ],
  tue: [
    { from: 1, to: 1, subjects: ['الكيمياء', 'إعلام نظري', 'علم البيئة'], teachers: ['كترين مرجيه', 'افروديت اسبنيولي', 'هديل صفوري'] },
    { from: 2, to: 2, subjects: ['الرياضيات', 'إعلام نظري'], teachers: ['بسام صفوري', 'سامر حنا', 'افروديت اسبنيولي'] },
    { from: 3, to: 3, subjects: ['الرياضيات'], teachers: ['سامر حنا', 'بسام صفوري', 'رماح زهر عبود'] },
    { from: 4, to: 4, subjects: ['اللغة العبرية'], teachers: ['كلوديا بولص'] },
    { from: 5, to: 5, subjects: ['اللغة العربية'], teachers: ['حنان أبو خضرة'] },
    { from: 10, to: 10, ...ARDUINO },
  ],
  wed: [
    { from: 1, to: 1, subjects: ['التربية'], teachers: ['كلوديا بولص'] },
    { from: 2, to: 2, subjects: ['اللغة الإنجليزية'], teachers: ENGLISH_T },
    { from: 3, to: 4, subjects: ['الرياضيات'], teachers: ['رماح زهر عبود', 'سامر حنا', 'بسام صفوري'] },
    { from: 5, to: 6, subjects: ['الفيزياء', 'إعلام نظري', 'الكترونيكا Arduino'], teachers: ['عدنان صالح ناصر', 'افروديت اسبنيولي', 'أشرف خوريّة'] },
    { from: 7, to: 8, subjects: ['إعلام عملي', 'الكترونيكا Arduino'], teachers: ['رنين نواطحة', 'أشرف خوريّة'] },
    { from: 9, to: 10, ...ARDUINO },
  ],
  thu: [
    { from: 1, to: 1, subjects: ['الرياضيات'], teachers: ['بسام صفوري', 'سامر حنا'] },
    { from: 2, to: 2, subjects: ['الرياضيات'], teachers: ['سامر حنا', 'بسام صفوري', 'رماح زهر عبود'] },
    { from: 3, to: 3, subjects: ['العبرية المحكية', 'حوسبة', 'اللغة العربية'], teachers: ['كلوديا بولص', 'بسمة سلمان', 'حنان أبو خضرة'] },
    { from: 4, to: 4, subjects: ['اللغة العربية', 'اللغة العبرية', 'حوسبة'], teachers: ['حنان أبو خضرة', 'كلوديا بولص', 'بسمة سلمان'] },
    { from: 5, to: 6, subjects: ['حوسبة', 'اللغة الإنجليزية'], teachers: ['بسمة سلمان', 'ميساء دويري', 'وفاء بولص', 'لمار عواد أبو داهود'] },
    { from: 7, to: 7, subjects: ['الكيمياء', 'إعلام نظري', 'علم البيئة'], teachers: ['كترين مرجيه', 'افروديت اسبنيولي', 'هديل صفوري'] },
    { from: 8, to: 8, subjects: ['الكيمياء', 'إعلام نظري'], teachers: ['كترين مرجيه', 'افروديت اسبنيولي'] },
    { from: 10, to: 10, ...ARDUINO },
  ],
  fri: [
    { from: 1, to: 2, subjects: ['الفيزياء', 'الكيمياء', 'إعلام عملي', 'علم البيئة'], teachers: ['عدنان صالح ناصر', 'كترين مرجيه', 'رنين نواطحة', 'هديل صفوري'] },
    { from: 3, to: 3, subjects: ['المدنيات'], teachers: ['لورين ارملي'] },
    { from: 4, to: 4, subjects: ['اللغة الإنجليزية'], teachers: ENGLISH_T },
    { from: 5, to: 5, subjects: ['اللغة العبرية'], teachers: ['كلوديا بولص'] },
    { from: 6, to: 6, subjects: ['إعلام عملي', 'علم البيئة', 'الكترونيكا Arduino'], teachers: ['رنين نواطحة', 'هديل صفوري', 'أشرف خوريّة'] },
    { from: 7, to: 7, subjects: ['الكترونيكا Arduino', 'إعلام عملي'], teachers: ['أشرف خوريّة', 'رنين نواطحة'] },
    { from: 10, to: 10, ...ARDUINO },
  ],
  sat: [
    { from: 4, to: 5, subjects: ['الفيزياء'], teachers: ['عدنان صالح ناصر'] },
    { from: 7, to: 10, ...ARDUINO },
  ],
};

export function dayByKey(k: string) {
  return DAYS.find((d) => d.key === k) ?? null;
}

/** Monday..Saturday key for a JS weekday (0 = Sunday has no school). */
export function keyForJsDay(js: number): DayKey | null {
  return DAYS.find((d) => d.js === js)?.key ?? null;
}

/** The school day worth showing now: today until 15:00, otherwise the next school day. */
export function nextSchoolDay(now: Date, tz: string): DayKey {
  const wd = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(now);
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', hour12: false }).format(now));
  let js = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(wd);
  if (hour >= 15 || js === 0) js = (js + 1) % 7;
  if (js === 0) js = 1;
  return keyForJsDay(js)!;
}

/** Periods 1..last with lessons and the free gaps between them. */
export function dayRows(key: DayKey) {
  const lessons = SCHEDULE[key];
  const rows: (Lesson & { free?: boolean })[] = [];
  let p = 1;
  for (const l of lessons) {
    if (l.from > p) rows.push({ from: p, to: l.from - 1, subjects: [], teachers: [], free: true });
    rows.push(l);
    p = l.to + 1;
  }
  return rows;
}

/** Compact text version for the AI. */
export function scheduleForPrompt() {
  return DAYS.map((d) =>
    `${d.en} (${d.ar}): ` +
    SCHEDULE[d.key].map((l) => `periods ${l.from}${l.to > l.from ? '-' + l.to : ''}: ${l.subjects.join(' / ')} [${l.teachers.join(', ')}]`).join('; '),
  ).join('\n') + `\nNo school on Sunday. He studies electronics (Arduino); where the class splits, Arduino is his group.`;
}
