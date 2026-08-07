# FlottAuto

ERP vertical SaaS de gestion de flotte automobile et de transport.

## Architecture

- **Backend** : FastAPI + SQLAlchemy + PostgreSQL
- **Frontend** : Next.js 14 + TypeScript + Tailwind CSS + shadcn/ui
- **Base de données** : PostgreSQL (via Docker)

## Démarrage rapide

### Prérequis

- Python 3.11+
- Node.js 18+
- Docker + Docker Compose
- PostgreSQL (ou utiliser le docker-compose fourni)

### 1. Lancer PostgreSQL et Redis

```bash
docker compose up -d
```

### 2. Configurer le backend

```bash
cd backend
python -m venv .venv
# Windows PowerShell
.\.venv\Scripts\Activate.ps1
# macOS/Linux
source .venv/bin/activate

pip install -r requirements.txt
cp ..\.env.example .env
```

Editer `backend/.env` si nécessaire :

```env
DATABASE_URL=postgresql+psycopg2://flottauto:flottauto@localhost:5432/flottauto
SECRET_KEY=change-me-in-production-use-a-64-char-random-string
```

### 3. Initialiser la base et les données de démo

```bash
cd backend
python seed.py
```

### 4. Lancer le backend

```bash
cd backend
uvicorn app.main:app --reload --port 8000
```

La documentation Swagger est disponible sur http://localhost:8000/docs

### 5. Configurer le frontend

```bash
cd frontend
npm install
cp ..\.env.example .env.local
npm run dev
```

Le frontend sera accessible sur http://localhost:3000

## Comptes de démonstration

- **Admin** : `admin@flottauto.com` / `admin123`
- **Manager** : `manager@flottauto.com` / `manager123`

## Modules MVP

- Authentification JWT + multi-tenant
- Module Flotte (véhicules + documents + échéances)
- Module Conducteurs
- Module Maintenance (préventif + curatif)
- Dashboard avec KPI et alertes
- Gestion des rôles

## Structure du backend

```
backend/
├── app/
│   ├── main.py
│   ├── core/           # config, database, security
│   ├── models/         # SQLAlchemy models
│   ├── schemas/        # Pydantic schemas
│   ├── crud/           # Opérations CRUD
│   ├── services/       # Logique métier (dashboard, alerts)
│   ├── api/            # Routes API
│   │   └── v1/
│   └── utils/
├── alembic/            # Migrations (à initialiser)
├── seed.py
├── requirements.txt
└── Dockerfile
```

## Tests

```bash
cd backend
pytest
```

## Licence

Propriétaire — FlottAuto.
