# CLAUDE.md — faucet-hq.github.io (marketing site)

Astro static site for **faucet-stream**. Deployed to GitHub Pages via
`.github/workflows/deploy.yml`:

- **`main`** → production root → https://faucet-hq.github.io/
- **`dev`** → `/dev/` subdirectory → https://faucet-hq.github.io/dev/ (staging preview)

The dev build uses `BASE_PATH=/dev/`, so **all asset/link paths must be
base-aware** (`import.meta.env.BASE_URL` / `${base}`), never a hardcoded `/…`,
or they break under the `/dev/` subpath.

## Branch & deploy workflow (ALWAYS follow)

**All changes land on `dev` first, then get promoted to `main` via a PR from
`dev` → `main`.** Never push a feature branch (or merge) directly into `main`.
Going `dev` → `main` on every change keeps `dev` and `main` in sync: after a
`dev` → `main` PR merges, `dev` is fast-forward-equal to `main`, and the next
change starts from a clean, synced `dev`.

The loop, every time:

1. Make the change on `dev` (or a branch off `dev`), push `dev` → it deploys to
   `/dev/` for staging review.
2. Open a PR **from `dev` to `main`** to promote to production.
3. Merge it (this deploys production and leaves `dev` == `main`).

Do **not** open feature-branch → `main` PRs; that re-diverges `dev` from `main`
and forces a later force-push to re-sync. If `dev` ever diverges from `main`
(e.g. from a past direct-to-main merge), reset it once with
`git push --force origin dev` after fast-forwarding `dev` to `main`, then resume
the `dev` → `main` flow.

## Auth

Pushed under the `PawanSikawat` account (default CLI auth is `pawan-dt`). Switch
to `PawanSikawat` before any push/PR, then back to `pawan-dt` afterwards.
