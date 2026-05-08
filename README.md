# 🐾 PawTracker — Dog Care Business Manager

A full-stack web app for tracking dog boarding/daycare bookings, revenue, expenses, and taxes. Sign in with your Google/Gmail account.

---

## Deploy in ~15 minutes (all free)

### Step 1 — Create your database (Supabase)

1. Go to [supabase.com](https://supabase.com) → **Start your project** → sign in with GitHub
2. Click **New project**, give it a name (e.g. "pawtracker"), set a database password, click **Create**
3. Wait ~2 min for it to provision
4. Go to **SQL Editor** (left sidebar) → **New query**
5. Paste the contents of `supabase-schema.sql` → click **Run**
6. Go to **Project Settings → API**, copy:
   - **Project URL** (e.g. `https://abcxyz.supabase.co`)
   - **anon public** key (long string starting with `eyJ…`)

### Step 2 — Enable Google sign-in (Supabase)

1. In your Supabase project, go to **Authentication → Providers → Google**
2. Toggle it **on** — you'll need a Google OAuth Client ID and Secret
3. To get those:
   - Go to [console.cloud.google.com](https://console.cloud.google.com)
   - Create a new project (or use an existing one)
   - Go to **APIs & Services → Credentials → Create Credentials → OAuth Client ID**
   - Application type: **Web application**
   - Add **Authorized redirect URI**: `https://YOUR-SUPABASE-PROJECT-ID.supabase.co/auth/v1/callback`
   - Copy the **Client ID** and **Client Secret** back into Supabase
4. Save

### Step 3 — Deploy to Vercel

1. Go to [github.com](https://github.com) → create a new repo called `pawtracker`
2. Upload all files from this zip to that repo
3. Go to [vercel.com](https://vercel.com) → **Add New Project** → import your GitHub repo
4. Add these **Environment Variables**:
   - `NEXT_PUBLIC_SUPABASE_URL` → your Supabase Project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` → your Supabase anon key
5. Click **Deploy**

### Step 4 — Add your Vercel URL back to Supabase

1. Copy your live Vercel URL (e.g. `https://pawtracker-yourname.vercel.app`)
2. In Supabase → **Authentication → URL Configuration**:
   - **Site URL**: `https://pawtracker-yourname.vercel.app`
   - **Redirect URLs**: add `https://pawtracker-yourname.vercel.app/**`
3. Also add this URL to your Google OAuth **Authorized JavaScript origins**

Your app is live! Visit the URL and click **Sign in with Google** 🎉

---

## Local development

```bash
npm install
cp .env.local.example .env.local
# Fill in your Supabase keys in .env.local
npm run dev
```

---

## Features

- **Gmail/Google sign-in** — no passwords to remember
- **Bookings** — dog-day calculations, cross-month revenue splitting, payment tracking
- **Revenue Dashboard** — Rover vs Venmo, monthly/quarterly/yearly views
- **Expenses** — tax deductibility and business use % tracking
- **Reports** — 6 report types, all CSV exportable
- **Import CSV** — bulk import from your existing spreadsheet
- **Synced data** — everything saves to Supabase, accessible from any device
- **Private** — Row Level Security means only you can see your data
