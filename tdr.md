# SPECIFICATION TECHNIQUE & PRODUIT
# Application : **FlottAuto**

> **Nom** : FlottAuto  
> **Jeu de mot** : *Flotte* + *Auto* → « FlottAuto » (la flotte qui roule toute seule)  
> **Tagline** : *Votre flotte, pilotée en un clin d’œil*  
> **Type** : Application web SaaS de gestion de flotte automobile et de transport  
> **Version de la spécification** : 1.0  
> **Date** : Août 2026

---

## 1. Vision du produit

**FlottAuto** est un ERP vertical moderne et modulaire dédié à la gestion complète d’une flotte de véhicules et des opérations de transport.  
L’application doit permettre de :
- Centraliser toutes les données (véhicules, conducteurs, maintenance, missions, coûts)
- Réduire les coûts d’exploitation
- Augmenter la durée de vie des véhicules grâce à la maintenance préventive
- Automatiser les processus manuels
- Offrir une vision budgétaire claire par véhicule
- Faciliter la prise de décision grâce à des tableaux de bord et alertes intelligentes

**Public cible** : Entreprises de transport, loueurs de véhicules, collectivités, flottes d’entreprise (PME et ETI).

---

## 2. Stack technique recommandée

| Couche              | Technologie recommandée                                      |
|---------------------|--------------------------------------------------------------|
| **Backend / API**   | **FastAPI** (Python 3.11+) + Pydantic v2 + SQLAlchemy 2.0 ou SQLModel |
| Base de données     | PostgreSQL + Alembic (migrations)                            |
| Authentification    | JWT (python-jose / PyJWT) + passlib (bcrypt) ou Authlib      |
| Frontend            | Next.js 14+ (App Router) + TypeScript + Tailwind CSS + shadcn/ui |
| Stockage fichiers   | S3-compatible (AWS S3 / Cloudflare R2 / MinIO)               |
| Temps réel          | WebSockets natifs FastAPI ou Redis + pub/sub                 |
| Tâches asynchrones  | Celery + Redis (ou ARQ) pour les alertes et jobs             |
| Charts (frontend)   | Recharts ou Chart.js                                         |
| PDF / Export        | WeasyPrint ou ReportLab (backend) / @react-pdf (frontend)    |
| Déploiement Backend | Docker + Railway / Render / Fly.io / AWS                     |
| Déploiement Frontend| Vercel ou même conteneur Docker                              |
| Mobile (futur)      | Progressive Web App (PWA) en priorité                        |

### Architecture recommandée Backend (FastAPI)

```
backend/
├── app/
│   ├── main.py                 # Point d'entrée FastAPI
│   ├── core/
│   │   ├── config.py           # Settings (Pydantic BaseSettings)
│   │   ├── security.py         # JWT, hashing, dependencies
│   │   └── database.py         # Engine, Session, Base
│   ├── models/                 # SQLAlchemy / SQLModel models
│   ├── schemas/                # Pydantic schemas (request/response)
│   ├── api/
│   │   ├── deps.py             # Dependencies (get_db, get_current_user…)
│   │   └── v1/
│   │       ├── router.py
│   │       ├── auth.py
│   │       ├── vehicles.py
│   │       ├── drivers.py
│   │       ├── maintenance.py
│   │       ├── missions.py
│   │       ├── costs.py
│   │       └── dashboard.py
│   ├── services/               # Logique métier
│   ├── crud/                   # Opérations CRUD réutilisables
│   └── utils/
├── alembic/                    # Migrations
├── tests/
├── requirements.txt
└── Dockerfile
```

> **Important** :  
> - L’API doit être entièrement documentée via le Swagger/OpenAPI automatique de FastAPI (`/docs`).  
> - L’application frontend doit être **responsive** (desktop + tablette + mobile) et fonctionner en mode PWA.  
> - Communication Frontend ↔ Backend exclusivement via API REST (JSON) + éventuels WebSockets.

---

## 3. Rôles utilisateurs

| Rôle              | Description                                      | Permissions principales |
|-------------------|--------------------------------------------------|-------------------------|
| Super Admin       | Administrateur de la plateforme SaaS             | Tout + gestion clients  |
| Admin Entreprise  | Responsable flotte / Directeur                   | Configuration, utilisateurs, tous modules |
| Gestionnaire      | Gestionnaire de flotte                           | Véhicules, maintenance, affectations |
| Conducteur        | Chauffeur                                        | Voir ses missions, déclarer incidents, kilométrage |
| Mécanicien        | Technicien atelier                               | Ordres de travail, maintenance |
| Comptable         | Service financier                                | Coûts, factures, reporting financier |
| Lecteur           | Consultation seule                               | Lecture tableaux de bord |

---

## 4. Modules fonctionnels (architecture modulaire)

L’application est organisée en **modules indépendants** activables selon le besoin du client.

### 4.1 Module Flotte (cœur)
- Fiche véhicule complète (marque, modèle, immatriculation, VIN, date mise en circulation, type, énergie, etc.)
- Documents associés (carte grise, assurance, contrôle technique, vignette…) avec dates d’échéance
- Historique complet du véhicule
- Affectation conducteur / véhicule
- Suivi kilométrage (saisie manuelle ou import)
- Statut : Disponible / En mission / En maintenance / Hors service
- Contrats (leasing, location longue durée…)
- Photos du véhicule

### 4.2 Module Personnel / Conducteurs
- Fiche conducteur (coordonnées, permis, catégories, date d’expiration)
- Formations et habilitations
- Affectations historiques
- Suivi des infractions / sinistres
- Disponibilité
- Documents (permis, certificat médical…)

### 4.3 Module Maintenance
- **Maintenance préventive** :
  - Plans d’entretien paramétrables (par km, par mois, par heures)
  - Alertes automatiques avant échéance
  - Génération automatique d’ordres de travail
- **Maintenance curative** :
  - Déclaration d’incident / panne
  - Workflow : Ouvert → Diagnostiqué → En cours → Terminé → Validé
  - Interventions internes ou externes (garages partenaires)
- Historique des interventions par véhicule
- Coût des pièces et main-d’œuvre
- Stock de pièces (lien avec module Achats)

### 4.4 Module Transport / TMS
- Création de missions / ordres de transport
- Devis → Commande → Planification → Exécution → Facturation
- Affectation véhicule + conducteur
- Suivi en temps réel du statut de la mission
- Planification (calendrier / planning)
- Gestion des clients / destinataires
- Calcul de rentabilité par mission

### 4.5 Module Achats & Stocks
- Gestion des pièces détachées et consommables
- Seuils d’alerte stock
- Demandes d’achat et validation
- Fournisseurs
- Réception et inventaire

### 4.6 Module Finance & Coûts
- Coût total de possession (TCO) par véhicule
- Ventilation des coûts : carburant, maintenance, assurance, péages, amendes, amortissement…
- Budgets par véhicule / par centre de coût
- Tableaux de bord financiers
- Export comptable

### 4.7 Module Carburant
- Saisie des pleins (manuelle ou import carte carburant)
- Consommation moyenne (L/100km)
- Alertes surconsommation
- Comparaison par véhicule / conducteur

### 4.8 Module Alertes & Notifications
- Centre de notifications
- Alertes paramétrables :
  - Documents bientôt expirés
  - Maintenance préventive à venir
  - Dépassement budget
  - Véhicule immobilisé trop longtemps
  - Permis conducteur bientôt expiré
- Notifications in-app + email

### 4.9 Module Reporting & Tableaux de bord
- Dashboard principal personnalisable
- KPI clés :
  - Nombre de véhicules actifs
  - Taux de disponibilité flotte
  - Coût moyen au km
  - Consommation moyenne
  - Nombre d’interventions en cours
  - Échéances critiques
- Rapports exportables (PDF / Excel)
- Filtres avancés (période, véhicule, conducteur, type…)

---

## 5. Écrans principaux à développer

### Authentification
- [ ] Page de connexion
- [ ] Mot de passe oublié
- [ ] Invitation utilisateur
- [ ] Onboarding premier admin

### Dashboard
- [ ] Vue d’ensemble (KPI + graphiques + alertes prioritaires)
- [ ] Widgets configurables

### Flotte
- [ ] Liste des véhicules (filtres, recherche, statut)
- [ ] Fiche détail véhicule (onglets : Infos, Documents, Maintenance, Coûts, Historique)
- [ ] Formulaire création / édition véhicule
- [ ] Calendrier des échéances documents

### Conducteurs
- [ ] Liste des conducteurs
- [ ] Fiche conducteur
- [ ] Affectations

### Maintenance
- [ ] Liste des ordres de travail
- [ ] Création d’un OT (préventif ou curatif)
- [ ] Workflow de statut
- [ ] Planning atelier

### Missions (TMS)
- [ ] Liste des missions
- [ ] Création / édition mission
- [ ] Planning (vue calendrier / Gantt simplifié)
- [ ] Suivi d’exécution

### Finance
- [ ] Tableau des coûts par véhicule
- [ ] Analyse TCO
- [ ] Export

### Paramètres
- [ ] Gestion des utilisateurs et rôles
- [ ] Configuration des plans de maintenance
- [ ] Types de véhicules / catégories
- [ ] Préférences entreprise
- [ ] Intégrations (futures)

---

## 6. Modèle de données principal (entités)

```
User
Company
Vehicle
Driver
VehicleAssignment
Document (polymorphe : véhicule ou conducteur)
MaintenancePlan
WorkOrder
WorkOrderLine
Part
StockMovement
Mission
MissionStop
Client
FuelEntry
CostEntry
Alert
Notification
```

**Relations clés** :
- Un Vehicle appartient à une Company
- Un Driver appartient à une Company
- VehicleAssignment lie Vehicle ↔ Driver (avec dates)
- WorkOrder lié à un Vehicle
- Mission liée à un Vehicle + un Driver
- CostEntry lié à un Vehicle (et éventuellement WorkOrder ou FuelEntry)

---

## 7. Fonctionnalités transverses obligatoires

- [ ] Authentification sécurisée + gestion des rôles (RBAC)
- [ ] Multi-entreprises (architecture multi-tenant)
- [ ] Recherche globale
- [ ] Filtres avancés sur toutes les listes
- [ ] Export Excel / CSV sur les listes principales
- [ ] Génération PDF (fiches véhicule, ordres de travail, rapports)
- [ ] Système d’alertes automatiques (cron jobs)
- [ ] Journal d’activité (audit log)
- [ ] Mode sombre / clair
- [ ] Internationalisation (français par défaut, anglais en option)
- [ ] Responsive + PWA
- [ ] Gestion des pièces jointes (documents, photos)

---

## 8. Priorités de développement (MVP → V1)

### MVP (Priorité 1 – 6 à 8 semaines)
1. Authentification + multi-tenant
2. Module Flotte (CRUD véhicules + documents + échéances)
3. Module Conducteurs
4. Module Maintenance (préventif + curatif basique)
5. Dashboard avec KPI essentiels
6. Système d’alertes documents et maintenance
7. Gestion des utilisateurs et rôles

### V1 (Priorité 2)
8. Module Carburant
9. Module Finance / Coûts
10. Module Missions / TMS simplifié
11. Reporting avancé + exports
12. Stocks de pièces

### V2 (Futur)
13. Application mobile native ou PWA avancée
14. Intégration GPS / télématique
15. Intégration cartes carburant
16. Facturation automatique
17. Module Location

---

## 9. Design System & Contraintes UI/UX (niveau pro)

L’interface doit donner une impression **premium, fiable et moderne**, digne d’un outil SaaS B2B haut de gamme (inspiration : Linear, Notion, Stripe Dashboard, Fleetio, Motus).

### 9.1 Identité visuelle

| Élément              | Spécification                                                                 |
|----------------------|-------------------------------------------------------------------------------|
| Style général        | Épuré, aéré, professionnel, beaucoup d’espace blanc, coins légèrement arrondis |
| Couleur primaire     | Bleu profond `#0F4C81` ou `#1E3A5F`                                          |
| Couleur accent / CTA | Ambre / Orange `#F59E0B`                                                      |
| Succès               | Vert `#10B981`                                                                |
| Danger / Erreur      | Rouge `#EF4444`                                                               |
| Warning              | Ambre `#F59E0B`                                                               |
| Fond clair           | `#F8FAFC` (slate-50) + cartes blanches                                        |
| Fond sombre          | Support du dark mode dès le MVP (`class` strategy Tailwind)                   |
| Typographie          | **Inter** ou **Geist** (titres semi-bold, corps regular)                      |
| Icônes               | Lucide React uniquement (cohérent et léger)                                   |
| Ombres               | Subtiles (`shadow-sm` / `shadow-md`), jamais agressives                       |
| Border radius        | `rounded-lg` (8px) pour les cartes, `rounded-md` pour les boutons/inputs      |

### 9.2 Layout & Navigation

- **Sidebar** collapsible (icônes seules en mode réduit) + logo FlottAuto en haut
- **Topbar** : fil d’Ariane, barre de recherche globale, notifications, avatar utilisateur
- Largeur max du contenu principal : ~1400–1600px, centré
- Espacements cohérents (échelle Tailwind : 4 / 6 / 8 / 12)
- Grille responsive stricte (mobile-first)

### 9.3 Composants & Patterns obligatoires

| Pattern                    | Règle stricte                                                                 |
|---------------------------|-------------------------------------------------------------------------------|
| Boutons                   | Hiérarchie claire : Primary / Secondary / Ghost / Destructive. Jamais plus de 2 CTA principaux par écran |
| Formulaires               | Labels toujours visibles, placeholders uniquement en complément, validation en temps réel, messages d’erreur sous le champ |
| Tables / Listes           | En-têtes sticky, tri, filtres, recherche, pagination serveur, actions en boutons icon + tooltip |
| Cartes KPI (Dashboard)    | Valeur + tendance (↑↓) + période + icône. Hover léger                         |
| Empty states              | Illustration simple + texte clair + bouton d’action principal                 |
| États de chargement       | **Skeleton loaders** (jamais de spinner plein écran sauf premier chargement)  |
| Feedback utilisateur      | Toast (sonner ou équivalent) pour succès/erreur. Confirm dialog pour actions destructives |
| Modales / Drawers         | Drawer (panneau latéral) privilégié pour les formulaires complexes, Modal pour les confirmations |
| Badges de statut          | Couleurs sémantiques + texte (ex: Disponible = vert, En maintenance = ambre)  |
| Upload de fichiers        | Zone drag & drop + preview + progression                                      |

### 9.4 Principes UX non négociables

1. **Clarté avant tout**  
   L’utilisateur doit comprendre en < 3 secondes où il est et ce qu’il peut faire.

2. **Réduction de la charge cognitive**  
   - Maximum 5–7 éléments principaux visibles par écran  
   - Actions secondaires dans un menu « … »  
   - Grouper les informations par onglets ou sections clairement titrées

3. **Feedback immédiat**  
   Toute action (clic, soumission, suppression) doit avoir un retour visuel instantané.

4. **Prévention des erreurs**  
   - Confirmations pour les actions irréversibles  
   - Désactivation des boutons pendant les requêtes  
   - Validation avant soumission

5. **Accessibilité (a11y)**  
   - Contraste WCAG AA minimum  
   - Navigation clavier complète  
   - Attributs `aria-*` sur les composants interactifs  
   - Focus visible

6. **Responsive & Mobile**  
   - Sidebar devient drawer sur mobile  
   - Tables deviennent cartes empilées ou scroll horizontal maîtrisé  
   - Touch targets ≥ 44px

7. **Micro-interactions**  
   - Transitions courtes (150–250ms)  
   - Hover states subtils  
   - Pas d’animations superflues qui ralentissent

8. **Cohérence**  
   - Même composant = même comportement partout  
   - Même vocabulaire (pas « Supprimer » sur un écran et « Effacer » sur un autre)

### 9.5 Pages clés – attentes UI spécifiques

**Dashboard**  
- Grille de KPI en haut (4 à 6 cartes)  
- Graphiques clairs (consommation, coûts, disponibilité)  
- Liste des alertes prioritaires  
- Actions rapides (Nouveau véhicule, Nouvel OT…)

**Liste (Véhicules, Conducteurs, OT…)**  
- Barre de filtres + recherche toujours visible  
- Tableau dense mais lisible  
- Actions rapides au survol de la ligne  
- Compteur de résultats

**Fiche détail (Véhicule, Conducteur…)**  
- En-tête fort (photo/icône + titre + badges de statut + actions principales)  
- Navigation par onglets (Infos / Documents / Maintenance / Coûts / Historique)  
- Timeline pour l’historique

**Formulaires**  
- Groupés par sections logiques  
- Sauvegarde explicite + indication « modifications non enregistrées »  
- Raccourci clavier Ctrl/Cmd + S apprécié

### 9.6 Dark mode
- Support complet dès le MVP
- Variables CSS / classes Tailwind `dark:`
- Contraste et lisibilité vérifiés dans les deux thèmes

### 9.7 Inspiration visuelle recommandée
- Linear.app (densité et élégance)
- Stripe Dashboard (clarté des données)
- Notion (navigation et empty states)
- Fleetio / Motus / Samsara (références métier flotte)

---

## 10. Contraintes & bonnes pratiques techniques

### Backend (FastAPI)
- Python 3.11+ avec typage strict (mypy recommandé)
- Architecture propre (routers / services / crud / models / schemas)
- Validation systématique avec Pydantic v2
- Gestion d’erreurs centralisée (exception handlers)
- Dépendances FastAPI pour l’auth et la DB (`Depends`)
- Migrations Alembic versionnées
- Tests avec pytest + httpx (TestClient)
- Documentation OpenAPI complète et à jour
- Sécurité : JWT, hash bcrypt, vérification des permissions à chaque endpoint
- Performance : pagination, indexes PostgreSQL, requêtes optimisées (selectinload / joinedload)

### Frontend (Next.js)
- TypeScript strict
- Validation côté client (Zod ou équivalent)
- Architecture par features
- Respect strict du Design System défini en section 9
- Accessibilité (a11y) niveau AA
- Responsive + PWA
- Composants réutilisables (design system interne basé sur shadcn/ui)

### Général
- Gestion d’erreurs robuste et messages clairs pour l’utilisateur
- Commentaires sur les parties complexes
- README complet + instructions de lancement (backend + frontend)
- Variables d’environnement bien documentées (`.env.example`)
- Docker-compose pour le développement local (API + PostgreSQL + Redis)

---

## 11. Livrables attendus de l’agent IA

1. **Backend FastAPI** complet et fonctionnel (MVP au minimum)
2. Modèles SQLAlchemy / SQLModel + migrations Alembic complètes
3. Seed de données de démonstration réalistes
4. **Frontend Next.js** consommant l’API FastAPI
5. README.md avec :
   - Description
   - Installation (backend + frontend)
   - Variables d’environnement
   - Scripts de lancement
   - Architecture
   - Documentation des endpoints principaux
6. Interface soignée et responsive
7. Système d’authentification JWT opérationnel
8. Au moins les modules Flotte + Conducteurs + Maintenance + Dashboard + Alertes
9. Fichier `docker-compose.yml` pour lancer PostgreSQL (+ Redis optionnel) en local

---

## 12. Critères d’acceptation MVP

- [ ] Un admin peut créer une entreprise et inviter des utilisateurs
- [ ] CRUD complet des véhicules avec documents et dates d’échéance
- [ ] CRUD des conducteurs avec permis
- [ ] Création d’ordres de travail (préventif et curatif)
- [ ] Alertes automatiques visibles sur le dashboard
- [ ] Dashboard avec au moins 5 KPI et 2 graphiques
- [ ] Gestion des rôles (Admin, Gestionnaire, Conducteur)
- [ ] Application utilisable sur mobile (responsive)
- [ ] Seed de données permettant de démontrer toutes les fonctionnalités

---

**Fin de la spécification FlottAuto**

> Cette spécification est conçue pour être directement utilisée par un agent IA (Cursor, Claude, GPT, Windsurf, etc.) afin de générer le code de l’application de manière structurée et complète.
