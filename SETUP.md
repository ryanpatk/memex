# memex (EX_P02) Setup Instructions

## Overview

memex is a personal working-memory system built with React and Supabase. The app currently ships its **Links module** — a bookmark workbench / new-tab launchpage — with Notes, Tasks, and Spaces modules to follow per `VISION.md`. This document covers local development setup.

## Prerequisites

- Node.js 18+
- npm
- A Supabase account and project

## Initial Setup

1. **Clone and Install Dependencies**
   ```bash
   npm install
   ```

2. **Environment Configuration**
   Create a `.env` file in the project root with your Supabase credentials:
   ```env
   VITE_SUPABASE_URL=your_supabase_project_url
   VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
   # Optional: memex-scraper worker URL (see scraper/README.md).
   # Enables real titles/descriptions/preview images at link capture.
   VITE_SCRAPER_URL=https://memex-scraper.your-account.workers.dev
   ```

3. **Database Setup**
   Apply the schema via Supabase CLI migrations — see `docs/database-migrations.md`. (The legacy `supabase-schema.sql` bootstrap is superseded by the migrations workflow.)

4. **GitHub OAuth (optional)**
   Follow `docs/GITHUB_OAUTH_SETUP.md` to enable GitHub sign-in.

5. **Development Server**
   ```bash
   npm run dev
   ```

## Project Structure

```
src/
├── components/         # UI components (omnibar, rails, list rows, modals)
├── constants/          # Canvas color swatches
├── context/            # SessionContext (Supabase session)
├── hooks/              # Data hooks (useLinks, useProfiles, useTags, ...)
├── pages/              # Page components
│   ├── auth/           # Sign in / sign up
│   └── DashboardPage.tsx   # Links module — canonical surface
├── router/             # React Router config + AuthProtectedRoute
├── store/              # Zustand state
├── supabase/           # Supabase client
├── types/              # Database + app types
└── utils/              # Canvas theming, URL parsing, helpers
```

## What's Implemented

- **Authentication**: Email/password and GitHub OAuth via Supabase Auth, protected routes
- **Links module**: Omnibar search + URL-detecting capture, virtualized frosted-glass list, open-in-background-tab
- **Filtering**: Profile (→ space) rail and tag rail; bulk tag/profile assignment with optimistic toasts
- **Super favorites**: Favicon shortcuts in the header toolbar
- **Theming**: User-selected canvas swatch drives interactive color; first-class dark mode (`data-theme`)
- **Responsive**: Desktop three-column grid; mobile slide-over rails

## Database Schema (current)

All tables user-scoped with Row Level Security:

- **links** — URLs with metadata (title, description, favicon, preview image), ordering, super-favorite flag
- **tags** / **link_tags** — shared tag vocabulary, many-to-many
- **profiles** / **profile_links** — link groupings (become **spaces** in the memex vision)
- **projects** — legacy, slated for retirement

Planned additions (per `VISION.md`): **notes** (markdown body), **tasks**, and per-primitive space/tag join tables.

## Development Commands

```bash
npm run dev         # Start development server
npm run build       # Build for production (TypeScript check + Vite build)
npm run lint        # Run ESLint
npm run preview     # Preview production build
```

## Next Steps (per VISION.md phasing)

1. App shell (left sidebar) + profiles → spaces rename
2. Tasks module
3. Notes module (markdown editing with auto-save)
4. Spaces module (composes notes, links, tasks); retire legacy projects
5. Cross-primitive search, note encryption, mobile polish

## Secrets and backups

- Env files (`.env`, `.env.*`, `.dev.vars`) are gitignored everywhere; only `.env.example` templates are committed.
- CI runs gitleaks over the full history on every push and PR (`.github/workflows/secret-scan.yml`, config `.gitleaks.toml`). Run the same scan locally before pushing anything that touched config or docs:

  ```bash
  brew install gitleaks
  gitleaks git --redact --log-opts="--all" .   # every commit on every branch
  gitleaks dir --redact .                      # working tree, including uncommitted files
  ```

- Back up production before any migration: `scripts/backup-supabase.sh` (details and restore steps in `docs/backups.md`).

## Troubleshooting

1. **Build issues**: Ensure all environment variables are set correctly
2. **Database errors**: Verify Supabase credentials and that migrations have been applied
3. **Auth issues**: Check Supabase Auth configuration and RLS policies

## Contributing

Follow existing code patterns and TypeScript compliance (ESLint enforced). Every new UI surface uses the `--bookmark-*` design tokens and the component vocabulary documented in `DESIGN.md`.
