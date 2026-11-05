export const metadata = { title: 'Privacy, Today' };

export default function Privacy() {
  return (
    <main style={{ maxWidth: 640, margin: '0 auto', padding: '48px 20px', lineHeight: 1.6, fontSize: 17 }}>
      <h1 style={{ fontSize: 30, letterSpacing: '-0.02em' }}>Privacy</h1>
      <p>Today is a personal dashboard used by one person, its owner.</p>
      <p>
        When you connect Google Calendar, Today reads and changes events on your primary calendar so they can be
        shown on your screen and edited by voice. Calendar data is used only for that, is not shared with anyone,
        and is not sold.
      </p>
      <p>
        Voice recordings and typed notes are sent to Google Gemini to be understood, then the resulting tasks are
        stored in the owner&apos;s own database.
      </p>
      <p>You can disconnect Google Calendar at any time from the phone page, or from your Google account settings.</p>
    </main>
  );
}
