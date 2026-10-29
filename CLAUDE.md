# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

FlottAuto — multi-tenant SaaS ERP for vehicle fleet management (vehicles, drivers, maintenance, fuel/toll expenses, alerts, dashboard). UI text, comments, and docs are in French. The full product spec is `tdr.md` (roadmap: missions, costs, S3 storage, Celery jobs, PWA — most not implemented yet). `point_entretien_des_cars.csv` is real maintenance data imported by `backend/seed_real_data.py`.

Note: `README.md` is partly outdated (says Next.js 14 / Postgres-only; the frontend is actually Next.js 16 and local dev currently runs on SQLite).

## Commands

Backend (from `backend/`, venv in `backend/.venv`):
```bash
.\.venv\Scripts\Activate.ps1                       # Windows
uvicorn app.main:app --reload --port 8000          # API, Swagger at /docs
FLOTTAUTO_ADMIN_PASSWORD=... FLOTTAUTO_MANAGER_PASSWORD=... python seed.py            # DROPS all tables, then demo data
FLOTTAUTO_ADMIN_PASSWORD=... FLOTTAUTO_MANAGER_PASSWORD=... python seed_real_data.py  # DROPS all tables, then imports the CSV
alembic revision --autogenerate -m "..."           # new migration
alembic upgrade head
```
There is no `tests/` directory yet, although `pytest` is in requirements.

Frontend (from `frontend/`):
```bash
npm run dev     # http://localhost:3000
npm run build
npm run lint
```

Infra: `docker compose up -d` at repo root starts Postgres 16 + Redis (Redis is not used by code yet).

## Configuration

- `backend/.env` (pydantic-settings, `app/core/config.py`): `DATABASE_URL` (required; currently `sqlite:` → `backend/flottauto_test.db`, Postgres in prod), `SECRET_KEY` (required), `ALGORITHM`, `ACCESS_TOKEN_EXPIRE_MINUTES`.
- `frontend/.env.local`: `NEXT_PUBLIC_API_URL`. Fallback in `src/lib/api.ts` is `http://localhost:8001/api/v1` (port 8001, not 8000) — keep the env var set.
- Alembic reads the DB URL from app settings (`alembic/env.py`), not `alembic.ini`.

## Backend architecture (FastAPI + SQLAlchemy 2.0, sync)

- `app/main.py`: lifespan runs `Base.metadata.create_all` on startup (so new tables appear without migrations; new *columns* on existing tables still need an Alembic migration). Mounts `/uploads` as static files; CORS is wide open.
- `app/api/v1/router.py`: all routers under `/api/v1` — `auth`, `vehicles`, `drivers`, `maintenance` (work orders + intervention/invoice circuit), `dashboard`, `alerts`, `tolls`, `fuel`, `stations`, `settings`, `inspections`, `needs`, `departures` (+ public `exit-passes`), `convoys`, `reports`, `integrations` (ITTS bridge). Role restrictions per router are deny-lists defined at the top of `router.py`.
- Single-file layers, each re-exported by its package `__init__.py`:
  - `app/models/models.py` — all ORM models + str enums (`Role`, `VehicleStatus`, `WorkOrderStatus`, `AlertType`, `FuelType`…).
  - `app/schemas/schemas.py` — all Pydantic v2 schemas (`XCreate` / `XUpdate` / `XRead`, list params).
  - `app/crud/crud.py` — plain functions (`create_vehicle`, `list_vehicles`…); routes call `crud.*` and `models.*` / `schemas.*` via the package namespaces. Adding a model/schema/crud function means also exporting it in the matching `__init__.py`.
  - `app/services/` — business logic: `alerts.py` (document-expiry/maintenance/missing-invoice alerts, dedup by existing alert), `dashboard.py` (KPIs), `inspections.py`, `needs.py`, `departures.py` (checklist + exit pass), `convoys.py` (account, contract), `interventions.py` (quote → supervisor approval → done → invoice → closure; 5 % gap rule), `reports.py` (weekly/monthly summary), `itts_bridge.py`.
- **Multi-tenancy**: every business row has `company_id`. Routes derive it from the JWT user (`_company_id(current_user)` helper in each router) and every crud query must filter on it. Never trust a `company_id` from the request body.
- Auth: OAuth2 password flow at `POST /api/v1/auth/login` (form-encoded `username`/`password`) → JWT with `sub` = user id. Dependencies in `app/api/deps.py`: `get_current_user`, `require_role(*roles)`, `get_current_active_company`.
- File uploads (vehicle photos, driver documents, work-order photos) are written to `backend/uploads/<company_id>/` with random-suffixed names and served from `/uploads/...`. `uploads/` and `*.db` are gitignored.
- Paginated list endpoints return `{items, total, page, size}`.

## Frontend architecture (Next.js 16 App Router, React 19, Tailwind v4, shadcn/ui on @base-ui)

- **Read `frontend/AGENTS.md`**: this Next.js version has breaking changes vs. training data; consult `frontend/node_modules/next/dist/docs/` before using Next APIs.
- Pages in `src/app/<module>/` (`page.tsx`, `new/page.tsx`, `[id]/page.tsx`) are client components (`"use client"`) wrapped in `AppShell` (`src/components/layout/app-shell.tsx`), which fetches `/auth/me` and redirects to `/` (login page) if unauthenticated.
- All HTTP goes through `src/lib/api.ts` (`api.get/post/put/delete`, `uploadFile` for FormData, typed helpers). JWT is stored in `localStorage` under `flottauto_token`; a 401 clears it and redirects to `/`.
- Shared TS types mirror backend schemas in `src/types/index.ts` — keep them in sync when changing `schemas.py` (enum values are the lowercase strings, e.g. `in_maintenance`).
- UI primitives in `src/components/ui/` (shadcn), toasts via `sonner`, charts via `recharts`, theming via `next-themes`. Path alias `@/` → `src/`.
