# PulseChat

A responsive realtime chat app built with HTML, CSS, vanilla JavaScript, Supabase Auth, Supabase Postgres, and Supabase Realtime.

## Supabase Setup

1. Create a Supabase project at `https://supabase.com/dashboard`.
2. Open the SQL Editor and run `supabase-schema.sql`. Run it again after updates to add media columns, storage buckets, and policies.
3. Go to Project Settings > API and copy your Project URL and anon public key.
4. Replace the placeholders in `js/supabase.js`.
5. In Authentication > Providers, make sure Email is enabled.
6. In Database > Replication, confirm `profiles` and `messages` are enabled for Realtime.

## Local Run

Because the app uses ES modules, run it from a local server:

```bash
npx serve .
```

Then open the shown local URL in your browser.

## Deploy

Supabase provides the auth and database backend. Deploy this static frontend to Vercel, Netlify, GitHub Pages, Supabase Storage static hosting, or any other static hosting provider.
