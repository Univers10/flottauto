# Pont FlottAuto ↔ ITTS Gestion — contrat d'interface (v1)

Deux applications de la même société (ITTS-SARL) :

- **ITTS Gestion** (dépôt `tocar`, API NestJS `/v1`) : ventes, départs numérotés, caisse, contrôle à la porte.
- **FlottAuto** (ce dépôt, API FastAPI `/api/v1`) : états des lieux, autorisation de départ, maintenance.

Règle métier : **aucun car ne quitte la gare sans bon de sortie FlottAuto valide.**

## 1. Signature des appels (les deux sens)

Secret partagé : `FLOTTAUTO_SHARED_SECRET` (ITTS) = `ITTS_SHARED_SECRET` (FlottAuto), **32 caractères au minimum** (FlottAuto refuse de démarrer sinon). À générer aléatoirement, jamais journalisé.

En-têtes de chaque requête :

| En-tête | Valeur |
|---|---|
| `X-Itts-Timestamp` | Secondes Unix (UTC) au moment de l'envoi |
| `X-Itts-Signature` | `hex(HMAC-SHA256(secret, "<timestamp>.<METHOD>.<chemin + requête>.<corps brut>"))` |

- `<chemin + requête>` : tel qu'envoyé, sans schéma ni hôte, par ex. `/api/v1/integrations/itts/events`.
- `<corps brut>` : les octets exacts du corps (chaîne vide pour un GET).
- Le destinataire refuse (401) si la signature est fausse ou si l'horodatage s'écarte de plus de **300 s** de son horloge.
- Comparaison en temps constant.
- Corps limité à **256 Kio** côté FlottAuto (413 au-delà ; ITTS garde 64 Kio pour les événements de départ). Appels uniquement en HTTPS en production.

## 2. ITTS → FlottAuto : événements de départ

`POST {FLOTTAUTO_URL}/api/v1/integrations/itts/events` — `Content-Type: application/json`

```json
{
  "id": "0192f1c4-7a3e-7cc1-9a51-3c1d2f0b8e11",
  "type": "departure.upserted",
  "occurred_at": "2026-10-28T11:40:00.000Z",
  "departure": {
    "id": "0192f1c4-6b10-7d2a-8b0e-0f5a3c9d1e22",
    "number": 3,
    "service_date": "2026-10-28",
    "departure_at": "2026-10-28T13:00:00.000Z",
    "status": "PROGRAMME",
    "mode": "HEURE_FIXE",
    "route": { "from": "Abidjan-Abobo", "to": "Odienné" },
    "station": { "id": "…", "code": "ABO", "name": "Abidjan-Abobo" },
    "bus": { "id": "…", "plate": "AB-586-CI", "number": "586" },
    "driver": { "id": "…", "name": "SEIDOU SYNAYOKO", "phone": "0700000000" },
    "conveyor": { "id": "…", "name": "Awa Koné", "phone": null },
    "departed_at": null
  }
}
```

- `id` : identifiant unique de l'événement (uuid v7). FlottAuto ne traite **qu'une fois** un même `id`.
- `type` :
  - `departure.upserted` : création, changement de car, d'équipage ou d'horaire ;
  - `departure.cancelled` : départ annulé ;
  - `departure.departed` : le départ est passé à `PARTI` dans ITTS (`departed_at` renseigné).
- Dates : ISO 8601 UTC. `driver` / `conveyor` peuvent être `null`.
- Réponse `200` : `{"status": "processed" | "duplicate" | "pending_mapping"}`.
  - `pending_mapping` : n'est plus renvoyé depuis la synchronisation des cars (un car inconnu est créé automatiquement) ; les événements restés dans cet état sont rejoués à la synchronisation suivante. **ITTS ne doit pas renvoyer** l'événement.
- `409` ou `422` : événement rejeté définitivement (mal formé ou incohérent) — **pas de nouvel essai**, ITTS le journalise.
- Toute autre réponse (autre 4xx, 5xx, délai dépassé) : ITTS réessaie avec un délai croissant. En cas d'erreur de traitement (5xx), FlottAuto conserve l'événement en statut `error` pour l'administrateur.
- Ordre : FlottAuto compare `occurred_at` ; un `departure.upserted` plus ancien que le dernier événement traité pour ce départ est ignoré (réponse `processed`). `occurred_at` doit donc être l'heure du changement dans ITTS, pas l'heure d'envoi.

### 2 bis. Référentiel : `fleet.snapshot`

Même adresse, même signature. ITTS envoie la liste **complète** des cars, gares et personnel d'une société : au démarrage de son API, toutes les 6 h et après chaque création ou modification d'un car, d'une gare ou d'un membre du personnel. Rien n'est à ressaisir dans FlottAuto.

```json
{
  "id": "0192f1c4-…", "type": "fleet.snapshot", "occurred_at": "2026-10-29T10:00:00.000Z",
  "fleet": {
    "buses":    [{ "id": "…", "plate": "ITTS-530", "number": "530", "capacity": 63, "active": true }],
    "stations": [{ "id": "…", "code": "ABO", "name": "Abidjan-Abobo", "city": "Abidjan", "active": true }],
    "staff":    [{ "id": "…", "name": "SEIDOU SYNAYOKO", "phone": "07…", "role": "CHAUFFEUR", "active": true }]
  }
}
```

- FlottAuto crée ce qui manque et met à jour le reste ; il ne supprime jamais un élément absent de la liste et applique `active` (un car inactif n'est pas créé).
- Un instantané plus ancien (`occurred_at`) que le dernier appliqué est ignoré. Réponse `200 {"status": "processed" | "duplicate"}`.
- ITTS fait foi pour le **numéro de parc** (`number`) et le nombre de places ; FlottAuto garde son immatriculation et ses données techniques.

## 3. ITTS → FlottAuto : autorisation de départ

`GET {FLOTTAUTO_URL}/api/v1/integrations/itts/departures/{itts_departure_id}/authorization?bus_id={Bus.id}` (signé, corps vide ; la requête `?bus_id=…` fait partie du texte signé)

```json
{
  "authorized": false,
  "status": "red",
  "reason": "Assurance : Expiré le 09/10/2026 (19 j)",
  "exit_pass_number": null,
  "valid_until": null,
  "url": "https://flottauto.babicash.ci/departures/42"
}
```

- `bus_id` (obligatoire, 422 sinon) : le car qui va réellement sortir. Si ce n'est pas celui du bon de sortie FlottAuto (changement de car non encore reçu ou en attente de correspondance), la réponse est `authorized = false`, `status = red`.
- `authorized = true` seulement si le bon de sortie est émis, non expiré, que la check-list n'est pas devenue rouge depuis, et que le car correspond. Un départ déjà marqué « parti » dans FlottAuto avec un bon valide au moment de la sortie reste `authorized = true`.
- `status` : `green` | `orange` | `red` | `unknown` (départ inconnu de FlottAuto, `authorized = false`).
- ITTS appelle cette route **juste avant** de passer un départ à `PARTI` (chef de gare ou contrôleur), avec un délai maximal de 4 s.

## 4. Mode du contrôle côté ITTS

`FLOTTAUTO_GATE_MODE` :

| Mode | Comportement |
|---|---|
| `off` | Aucun appel. |
| `warn` | Appel ; si refusé ou injoignable, le départ passe quand même et un événement d'audit `DEPARTURE_GATE_WARNING` est enregistré. **Mode de rodage.** |
| `enforce` | Refusé ou injoignable : le départ est **refusé** avec l'erreur `DEPARTURE_NOT_AUTHORIZED` (409) et le motif FlottAuto. |

## 5. Correspondance des données (côté FlottAuto)

| ITTS | FlottAuto | Règle |
|---|---|---|
| `Bus.id` / `number` / `plate` | `Vehicle.itts_bus_id` / `fleet_number` / `registration` | Par `itts_bus_id`, sinon par numéro de parc (« 530 » = « N°0530 »), sinon par immatriculation normalisée. Car inconnu → **créé automatiquement** (type car, modèle « N°530 »). Le numéro de parc est ensuite repris d'ITTS à chaque synchronisation. |
| `Staff.id` | `Driver.itts_staff_id` | Sinon même nom (sans accents ni ordre : « KONE Awa » = « Awa Koné »), sinon création automatique (chauffeur ou convoyeur). |
| `Station.id` | `Station.itts_station_id` | Sinon par code, sinon création automatique ; nom et ville repris d'ITTS. |
| `Departure.id` | `Departure.itts_departure_id` | Clé du départ. |
