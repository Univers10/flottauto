# FlottAuto — Design system

Interface d'outil métier : sobre, dense, lisible. La couleur porte du **sens** (statut, action principale), jamais de la décoration.

## Fondations

- **Tokens** dans `src/app/globals.css` (clair + `.dark`). N'utiliser que les classes issues des tokens :
  - Surfaces : `bg-background`, `bg-card`, `bg-surface-sunken` (en-têtes de tableau, zones en creux), `bg-muted`, `bg-accent` (survol).
  - Texte : `text-foreground`, `text-muted-foreground` (secondaire), `text-subtle-foreground` (placeholder, icônes discrètes).
  - Bordures : `border` (défaut), `border-border-strong` (survol), `border-input` (champs).
  - Marque : `bg-primary`, `text-primary`, `bg-primary-subtle`.
  - Statuts : `success | warning | danger | info | neutral`, chacun en `text-*`, `bg-*-subtle`, `border-*-border`.
  - Graphiques : `var(--chart-1..5)` dans cet ordre, `var(--chart-grid)`, `var(--chart-axis)`.
- **Interdit** : couleurs Tailwind brutes (`bg-emerald-50`, `text-blue-700`, `bg-slate-100`…), dégradés (`bg-gradient-*`), ombres colorées (`shadow-primary/…`), `rounded-2xl/3xl` sur les cartes, `text-3xl font-bold` pour les titres. Elles cassent le mode sombre et la cohérence.
- **Typo** : Geist (sans) et Geist Mono. Titre de page `text-2xl font-semibold tracking-tight` (via `PageHeader`). Titre de section `text-[0.9375rem] font-semibold`. Corps `text-sm`. Libellés de champ `text-[13px] font-medium`. Chiffres : classe `tabular`.
- **Rayons** : `rounded-lg` (champs, boutons), `rounded-xl` (cartes/panneaux), `rounded-md` (badges).
- **Ombres** : `shadow-xs` (champs, boutons), `shadow-card` (panneaux), `shadow-pop` (menus, survol de carte cliquable).
- **Icônes** : lucide, `size-4` dans les boutons et tableaux, `size-[18px]` dans la navigation.

## Composants (`src/components/app/primitives.tsx`)

| Composant | Usage |
|---|---|
| `PageHeader` | En-tête de chaque page : `title`, `description`, `actions`, `breadcrumb` (pages de détail / création). |
| `Panel` | Carte de section avec en-tête optionnel. `flush` pour un tableau ou une liste collée aux bords. |
| `StatCard` | Indicateur chiffré (libellé, valeur, `hint`, icône, `tone`, `href`). |
| `StatusBadge` | Statut = pastille + libellé, ton issu de `lib/labels.ts`. Jamais de couleur sans libellé. |
| `Plate` | Plaque d'immatriculation (mono, majuscules). Partout où une immatriculation est affichée. |
| `EmptyState` | État vide avec icône, titre, description, action. |
| `DetailList` | Liste libellé/valeur (fiches). |
| `Field` | Libellé + champ + aide. `required` ajoute l'astérisque. |
| `FormSection` | Bloc de formulaire « titre à gauche, champs à droite » (grille 2 colonnes). |
| `Toolbar` | Barre filtres/recherche en haut d'un `Panel flush`. |
| `toneSurface(tone)` / `toneText(tone)` | Classes de couleur d'un ton pour une pastille d'icône ou un texte. |

Primitives shadcn dans `src/components/ui/` (Button, Input, Select, Table, Dialog, Tabs, Badge…) déjà alignées sur les tokens : ne pas leur repasser de classes de taille/rayon/couleur sauf besoin réel.

- Lien qui a l'air d'un bouton : `<Link href="…" className={buttonVariants({ variant: "outline" })}>` (pas `<Button render={<Link/>}>`).
- Boutons : `default` pour l'action principale (une seule par zone), `outline` pour les secondaires, `ghost` pour les icônes, `destructive` pour supprimer.

## Données

- Libellés et tons : `src/lib/labels.ts` (`vehicleStatus`, `workOrderStatus`, `workOrderType`, `alertSeverity`, `vehicleTypeLabels`, `energyLabels`, `fuelLabels`, `tollMethodLabels`, `documentTypeLabels`). Ne pas redéfinir ces tables dans les pages.
- Formatage : `src/lib/format.ts` — `formatMoney` (FCFA), `formatNumber(v, "km")`, `formatDate`, `formatRelativeDays`, `fullName`, `initials`.
- Fichiers servis par le backend : `assetUrl(path)` depuis `src/lib/api.ts`.
- **Jamais de données inventées** dans l'interface (tendances, séries de démonstration).

## Patrons de page

- **Liste** : `PageHeader` (+ actions Exporter / Nouveau) → `Panel flush` → `Toolbar` (filtres segmentés avec compteurs + recherche) → `Table` (ligne cliquable, chevron à droite) ou `EmptyState`. Chargement : `Skeleton` de la hauteur d'une ligne.
- **Détail** : `PageHeader` avec `breadcrumb`, titre = nom de l'objet, `StatusBadge` + actions à droite. Corps en grille `xl:grid-cols-3` : contenu principal sur 2 colonnes, `Panel` latéraux avec `DetailList`.
- **Création / édition** : `PageHeader` avec `breadcrumb`, un `Panel` contenant des `FormSection` séparées par `divide-y`, barre d'actions en bas à droite (Annuler en `outline`, Enregistrer en `default`).
- Graphiques recharts : une seule série = pas de légende ; grille horizontale `var(--chart-grid)`, axes sans trait, ticks `var(--chart-axis)` 12px, barres `radius={[4,4,0,0]}`, tooltip personnalisé (`bg-popover`, `shadow-pop`).
