# Project:John

Browser-based IT help desk simulator for technician training.

A personal learning project: I'm building it to practise help desk
troubleshooting and to learn how a simulator works by writing one. It is
single-user and runs entirely in the browser — there are no accounts and no
server. It is not affiliated with any commercial help desk training product.

## Quick Start

```bash
pnpm install
pnpm test
pnpm lint
pnpm typecheck
pnpm build
pnpm exec vite preview --port 3001
```

Open `http://localhost:3001/?demo=1` for sample data.

The base path comes from `VITE_BASE` (default `/`). To reproduce the GitHub Pages
build locally: `VITE_BASE=/project-john/ pnpm build`, then open
`http://localhost:3001/project-john/?demo=1`.

Node: >= 22.19.0 (`engines`); CI uses Node 24 (`.nvmrc`). Node 20 cannot run the
test suite (jsdom 30 depends on undici 8, which requires Node >= 22.19).

## TypeScript Version

This project uses **TypeScript 6.0.3** (pinned in `package.json` as `"typescript": "~6.0.3"`).

**Why not TypeScript 7?**
- `@typescript-eslint/parser` and `@typescript-eslint/eslint-plugin` v8.x do not support TypeScript 7.
- Pinning to TS 6 ensures `pnpm lint` and `pnpm typecheck` use the same type checker.
- When typescript-eslint adds TS 7 support, we can bump the version.

## Project Structure

```
src/
├── app/              # Store, hooks, routes, demo data
├── features/
│   ├── auth/         # Login, auth API
│   ├── certificates/ # Certificate gallery, verification
│   ├── communication/# Chat, email
│   ├── desktop/      # WindowManager, panels (Services, EventViewer, etc.)
│   ├── layout/       # Workspace, Sidebar, TopBar
│   ├── scoring/      # RubricEditor, ScoreDashboard
│   ├── team/         # Team mode (cohorts, assignments)
│   └── tickets/      # Ticket queue, detail, API
├── shared/
│   ├── api/          # baseQuery with Zod validation
│   ├── components/   # Terminal, Toaster, Window
│   ├── middleware/   # wsMiddleware
│   └── ws/           # WebSocket client, events, slice
└── test/             # vitest setup, jest-dom types
```

## Deploying to GitHub Pages

Deployment is done by the Actions workflow `.github/workflows/pages.yml`
(`actions/upload-pages-artifact` + `actions/deploy-pages`). It does not use a
`gh-pages` branch and nothing is committed to `dist/`.

One-time repository setting: **Settings → Pages → Build and deployment →
Source → GitHub Actions**. Do not select "Deploy from a branch".

The workflow runs on pushes to `main` and on manual runs
(**Actions → Deploy to GitHub Pages → Run workflow**). Pushing other branches
does not publish. The build step sets `VITE_DEMO=1`, so the published site
starts in demo mode. The build step also sets `VITE_BASE=/<repository name>/`
(from `github.event.repository.name`), so the site is served at
`https://<owner>.github.io/<repository name>/`.

## Demo Mode

Add `?demo=1` to the URL (or set `VITE_DEMO=1`) to seed:
- 5 sample tickets
- Services panel data (6 services)
- Event Log panel data (2 events)
- Team mode (`/team?demo=1`): a 6-student cohort and a lab progress stream

Without demo mode and no backend running, the ticket queue shows an error message — this is expected.
