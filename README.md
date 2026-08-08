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
cp .env.example .env
```

Editer `backend/.env` si nécessaire (remplacer les valeurs par vos propres secrets) :

```env
DATABASE_URL=postgresql+psycopg2://<user>:<password>@localhost:5432/flottauto
SECRET_KEY=<générez-une-chaîne-aléatoire-de-64-caractères>
```

### 3. Initialiser la base et les données de démo

```bash
cd backend
FLOTTAUTO_ADMIN_PASSWORD=<mot-de-passe-admin> \
FLOTTAUTO_MANAGER_PASSWORD=<mot-de-passe-manager> \
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
cp .env.example .env.local
npm run dev
```

Le frontend sera accessible sur http://localhost:3000

## Comptes

Les comptes administrateur et manager sont créés par le script de seed avec les mots de passe fournis via les variables d'environnement `FLOTTAUTO_ADMIN_PASSWORD` et `FLOTTAUTO_MANAGER_PASSWORD` (aucun mot de passe n'est stocké dans le code).

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
