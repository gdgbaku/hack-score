# 🏆 Hackathon Judge Platform

A full-stack real-time hackathon management platform. Teams submit projects, organizers review submissions, judges score teams from their own devices, and results update live for everyone.

![Status](https://img.shields.io/badge/status-production--ready-brightgreen)
![Stack](https://img.shields.io/badge/stack-HTML%20%2B%20Supabase%20%2B%20Railway-blue)
![License](https://img.shields.io/badge/license-MIT-lightgrey)

---

## ✨ Features

- **Multi-hackathon support** — admin creates multiple hackathons, each with its own organizer login
- **Team project submissions** — public submission page per hackathon, no login needed for teams
- **Organizer review** — accept or reject submissions, accepted teams auto-added to team list
- **Real-time scoring** — judges score from their own phones/laptops, results sync instantly
- **Judge project view** — judges see project description, MVP photos, GitHub and demo links while scoring
- **Score validation** — enforces 1–20 range, flags missing categories before saving
- **Live leaderboard** — final scores averaged across all judges, ranked in real time
- **Bulk import** — paste all team or judge names at once, one per line
- **Role-based access** — Admin / Organizer / Judge / Team — all on the same URL

---

## 👥 User Roles

| Role | Access | Capabilities |
|---|---|---|
| **Admin** | `admin` / `admin123` | Create, edit, delete hackathons — set organizer credentials |
| **Organizer** | Username & password set by admin | Manage teams, judges, categories — review submissions — view results |
| **Judge** | No login — pick name from list | Score each team, view project details |
| **Team** | Public link `?submit=username` | Submit project info and MVP photos |

---

## 🖥️ How It Works

```
Admin                    Organizer                Teams               Judges
─────                    ─────────                ─────               ──────
Create hackathon    →    Share submission link →  Submit project  →   Pick name
Set credentials     →    Review & accept      →   (no login)          View project info
                         Add judges                                    Score 1–20 per category
                         View live results                             Real-time sync
```

---

## 🚀 Deployment Guide

### Prerequisites
- Free [Supabase](https://supabase.com) account
- Free [Railway](https://railway.app) account
- Free [GitHub](https://github.com) account

---

### Step 1 — Set up Supabase

1. Go to [supabase.com](https://supabase.com) → **New project**
2. Go to **SQL Editor** → **New query** → paste and run the following:

```sql
-- Hackathons table
create table if not exists hj_hackathons (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  username text unique not null,
  password text not null,
  teams jsonb default '[]',
  judges jsonb default '[]',
  categories jsonb default '[]',
  created_at timestamptz default now()
);

-- Scores table
create table if not exists hj_scores (
  id text primary key,
  hackathon_id uuid references hj_hackathons(id) on delete cascade,
  judge text not null,
  team text not null,
  scores jsonb not null,
  updated_at timestamptz default now()
);

-- Submissions table
create table if not exists hj_submissions (
  id uuid primary key default gen_random_uuid(),
  hackathon_id uuid references hj_hackathons(id) on delete cascade,
  team_name text not null,
  project_name text not null,
  description text not null,
  github_url text,
  shared_url text,
  photos jsonb default '[]',
  status text default 'pending',
  submitted_at timestamptz default now()
);

-- Enable row level security
alter table hj_hackathons enable row level security;
alter table hj_scores enable row level security;
alter table hj_submissions enable row level security;

-- Allow public read/write access
create policy "public_all_hackathons" on hj_hackathons
  for all to anon, authenticated using (true) with check (true);

create policy "public_all_scores" on hj_scores
  for all to anon, authenticated using (true) with check (true);

create policy "public_all_submissions" on hj_submissions
  for all to anon, authenticated using (true) with check (true);
```

3. Go to **Project Settings → API** and copy:
   - **Project URL** → `https://xxxxxxxxxxxx.supabase.co`
   - **anon public** key → the long `eyJ...` string *(never use the service_role key)*

> ⚠️ If you already have an older version of this app and the `hj_scores` table is missing the `hackathon_id` column, run this to fix it:
> ```sql
> alter table hj_scores
>   add column if not exists hackathon_id uuid references hj_hackathons(id) on delete cascade;
> update hj_scores set hackathon_id = (select id from hj_hackathons limit 1) where hackathon_id is null;
> ```

---

### Step 2 — Deploy to Railway

1. Fork this repository to your GitHub account
2. Go to [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub repo**
3. Select your forked repo — Railway detects Node.js and deploys automatically
4. Go to your project → **Settings** → copy the public URL (e.g. `https://hack-score.up.railway.app`)

---

### Step 3 — Connect Supabase in the App

1. Open your Railway app URL
2. In the **Supabase connection** section at the bottom of the login page:
   - Paste your **Project URL**
   - Paste your **anon public** key
   - Click **Save & test** — you should see "Connected!"
3. Sign in as admin: `admin` / `admin123`
4. Create your first hackathon

> Your Supabase credentials are saved in `localStorage` so you won't need to reconnect on the same device.

---

## 📖 Usage Guide

### For Admins
1. Sign in with `admin` / `admin123`
2. Click **+ New hackathon** — enter hackathon title, organizer username and password
3. Share the organizer credentials privately with the hackathon organizer
4. Edit or delete hackathons anytime from the dashboard

### For Organizers
1. Sign in with the credentials set by the admin
2. **Setup tab**
   - Edit hackathon name
   - Add judges one by one or bulk paste (one per line)
   - Edit scoring categories (5 defaults pre-loaded)
   - Copy the **team submission link** and share it with teams
3. **Submissions tab** — review incoming project submissions
   - ✓ Accept → team is automatically added to the team list
   - ✗ Reject → submission stays visible but marked as rejected
   - Re-accept anytime
4. **Judging tab** — monitor judge progress, see who has scored which teams
5. **Results tab** — live leaderboard, judge coverage, category averages

### For Teams
1. Open the submission link shared by the organizer
   - Format: `https://yourapp.up.railway.app/?submit=organizername`
2. Fill in:
   - Team name
   - Project name
   - Project description
   - GitHub repository URL *(optional)*
   - Live/demo URL *(optional)*
   - Up to 3 MVP photos *(JPG/PNG, max 1MB each)*
3. Click **Submit Project** — the organizer will review it

### For Judges
1. Open the app URL → go to **Judging tab**
2. Click your name from the judge list
3. Click any team to start scoring
4. Read the project card — description, photos, GitHub and demo links
5. Enter a score from **1 to 20** for each category
6. Click **Save scores** — syncs to all devices instantly
7. Switch to any other team using the team list
8. Come back anytime to review or edit scores

---

## 🗂️ Project Structure

```
hack-score/
├── index.html       # Entire frontend app (vanilla HTML/CSS/JS)
├── server.js        # Minimal Express server to serve index.html
├── package.json     # Node.js dependencies (express only)
├── railway.toml     # Railway deployment config
└── README.md
```

---

## 🧮 Scoring Logic

| Level | Calculation |
|---|---|
| Judge → Team | Average of all category scores given by that judge |
| Final team score | Average of all judges' team averages |
| Leaderboard | Teams sorted by final score, highest first |

**Example with 2 judges and 5 categories:**

| | Cat 1 | Cat 2 | Cat 3 | Cat 4 | Cat 5 | Judge avg |
|---|---|---|---|---|---|---|
| Judge A | 18 | 16 | 15 | 17 | 14 | **16.0** |
| Judge B | 14 | 15 | 13 | 16 | 15 | **14.6** |
| **Final score** | | | | | | **15.3 / 20** |

---

## ⚙️ Default Scoring Categories

| Category | What it measures |
|---|---|
| Problem-Solution Fit | How well the solution addresses the stated problem |
| Presentation & Storytelling | Clarity, structure, and quality of the pitch |
| Business Model & Sustainability | Viability, monetization, and long-term potential |
| Technical Execution & Integration | Code quality, architecture, and tech choices |
| Impact & Market Potential | Reach, scalability, and real-world value |

> All categories are editable per hackathon in the Setup tab — rename, remove, or add new ones.

---

## 🛠️ Local Development

```bash
# Clone
git clone https://github.com/gdgbaku/hack-score.git
cd hack-score

# Install
npm install

# Run
npm start
# Open http://localhost:3000
```

To update and redeploy:
```bash
git add .
git commit -m "describe your change"
git push
# Railway auto-redeploys within ~30 seconds
```

---

## 🔧 Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Vanilla HTML, CSS, JavaScript (single file, no build step) |
| Database | [Supabase](https://supabase.com) — PostgreSQL |
| Realtime | Supabase Realtime — WebSockets |
| Hosting | [Railway](https://railway.app) |
| Server | Node.js + Express |

---

## 🔒 Changing Admin Credentials

Default admin login is `admin` / `admin123`. To change it, edit these two lines near the top of `index.html`:

```javascript
const ADMIN_USER = "admin";
const ADMIN_PASS = "admin123";
```

Redeploy after saving.

---

## 🙋 FAQ

**Do judges need an account?**
No — judges open the app, go to the Judging tab, and pick their name from the list.

**Do teams need an account to submit?**
No — teams open the submission link and fill in the form directly.

**Can judges edit scores after saving?**
Yes — select any previously scored team to update scores at any time.

**Can I run multiple hackathons at the same time?**
Yes — each hackathon is fully isolated with its own teams, judges, scores and submissions.

**Can organizers add teams manually without the submission form?**
Yes — teams can be added manually in the Setup tab at any time.

**What if a judge hasn't scored all teams when results are needed?**
Teams are ranked using whatever scores are available. The Results tab shows coverage per judge so you can see who is missing.

**What is the photo size limit?**
Up to 3 photos per submission, max 1MB each. Photos are stored as base64 in Supabase.

**Is there a limit on teams or judges?**
No hard limit. Supabase free tier supports up to 500MB database storage.

---

## 📄 License

MIT — free to use, modify, and deploy for your own events.

---

Built with ❤️ for the hackathon community by [GDG Baku](https://github.com/gdgbaku).
