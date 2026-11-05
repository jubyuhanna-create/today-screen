# Today

An always-on day screen for the Mi Box, with a phone page to edit it from anywhere.
Talk in Arabic, Hebrew or English. Gemini turns it into tasks, ideas and reminders,
each kept in the language you spoke. The screen updates the moment anything changes.

- `/tv` the TV screen. Calm colors by day (blue morning, green afternoon, violet evening), black and white from 23:00 to 07:00.
- `/phone` edit, check off, reschedule, type or record from outside. Install it from Chrome: menu, Install app.
- `android-tv/` the Mi Box app. Opens the screen on boot, OK on the remote talks.

## 1. Supabase
1. New project at supabase.com.
2. SQL editor: run `supabase/schema.sql`.
3. Project settings, API: copy the URL, the anon key and the service role key.

## 2. Vercel
1. Upload this folder to a new GitHub repo, import it in Vercel.
2. Environment variables, from `.env.example`:
   `APP_PASSCODE`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`.
3. Deploy. Open `/phone` on your phone and enter the passcode.

Without Supabase keys the site runs on demo data, handy for trying the design.

## 3. The Mi Box app
1. In the GitHub repo: Settings, Secrets and variables, Actions, new secret
   `DASHBOARD_URL` = `https://YOUR-APP.vercel.app/tv?key=YOUR_PASSCODE`
2. Actions tab, Build TV app, Run workflow. Download `today-tv` when it finishes.
3. Install it on the Mi Box, one of:
   - Phone: install the Send Files to TV app on both, send the APK.
   - PC: turn on Developer options and USB debugging on the Mi Box, then
     `adb connect MIBOX_IP` and `adb install today-tv.apk`.
4. Open Today once, allow the microphone. From then on it opens by itself on boot.

Remote: OK starts talking, it stops by itself when you go quiet (or press OK again).
Back cancels. Menu reloads.

The Mi Box S remote mic is meant for Google Assistant. On most units apps can use it,
on some they cannot; the screen will say so, and the phone recording does the same job.

## Morning summary
Vercel runs `/api/cron/morning` every day at 04:00 UTC (06:00 or 07:00 in Israel)
and writes a fresh summary at the top of the screen.
