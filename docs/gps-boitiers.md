# Suivi GPS : boîtiers et branchement

FlottAuto est prêt à recevoir les positions des cars (menu **Suivi GPS**) : position en direct, trajets et arrêts moteur de la journée, kilométrage du car mis à jour tout seul. Il reste à choisir et poser les boîtiers.

## 1. Quel boîtier ?

Un boîtier « télématique » fixe, branché sur le car (12/24 V), avec carte SIM data. Pour des cars de ligne, on conseille la marque **Teltonika**, très répandue en Afrique de l'Ouest, compatible avec le serveur gratuit Traccar et facile à trouver chez les installateurs :

| Besoin | Modèle conseillé | Ce qu'il donne |
|--------|------------------|----------------|
| Cars récents avec bus CAN / FMS (la plupart des Yutong, Higer, King Long récents) | **Teltonika FMC650** (poids lourds, FMS) ou **FMC150** | Position, vitesse, contact, **compteur réel du car**, **niveau et litres consommés** lus dans le calculateur |
| Cars plus anciens, sans CAN exploitable | **Teltonika FMC130** + **sonde de niveau de carburant capacitive** (dans le réservoir) | Position, vitesse, contact moteur, niveau du réservoir (détection des siphonnages) |
| Essai sans boîtier | Téléphone ou TPE Android avec l'app gratuite **Traccar Client** | Position et vitesse seulement (pas de contact moteur ni de carburant) |

Points à vérifier avec l'installateur :
- **4G avec repli 2G** (zones rurales du Nord).
- Le fil du **contact (ACC)** est bien branché : c'est lui qui donne « moteur allumé / coupé » et les arrêts moteur.
- **Batterie de secours** dans le boîtier et alerte de débranchement.
- Réglages d'envoi : toutes les **30 s en roulant**, toutes les **5 min à l'arrêt**, et à chaque virage (15°) ou 100 m. Consommation data : quelques Mo par mois et par car (carte SIM M2M Orange ou MTN).

## 2. Comment les positions arrivent dans FlottAuto

Les boîtiers Teltonika parlent leur propre langage (pas du web). On installe donc **Traccar** (serveur libre et gratuit) sur le serveur, qui reçoit les boîtiers et transmet chaque position à FlottAuto.

1. FlottAuto → **Suivi GPS → Boîtiers** : « Ajouter un boîtier » pour chaque car, avec l'**IMEI** écrit sur le boîtier.
2. « **Clé du serveur Traccar** » : FlottAuto affiche la clé et les deux lignes à copier.
3. Sur le serveur Traccar (`traccar.xml`) :
   ```xml
   <entry key='forward.enable'>true</entry>
   <entry key='forward.json'>true</entry>
   <entry key='forward.url'>https://flottauto.babicash.ci/api/v1/gps/traccar</entry>
   <entry key='forward.header'>X-Gps-Key: (clé du relais)</entry>
   ```
4. Dans chaque boîtier (logiciel Teltonika Configurator) : adresse du serveur Traccar, port **5027** (Teltonika), protocole TCP.

Un IMEI inconnu de FlottAuto est ignoré. Le compteur et le carburant envoyés par le boîtier (CAN ou sonde) sont repris tels quels.

## 3. Essayer dès maintenant avec un téléphone

1. FlottAuto → Suivi GPS → Boîtiers → « Ajouter un boîtier » (modèle : « Téléphone »). Noter la **clé** affichée.
2. Installer **Traccar Client** (Android ou iPhone).
3. Dans l'app : *Identifiant de l'appareil* = la clé ; *Adresse du serveur* = `https://flottauto.babicash.ci/api/v1/gps/osmand` ; fréquence 30 s ; activer le suivi.
4. Le car apparaît sur la carte de FlottAuto en moins d'une minute.

## 4. Pour un développeur (envoi direct)

`POST /api/v1/gps/ingest`, en-tête `X-Gps-Key: <clé du boîtier>` :

```json
{ "positions": [
  { "recorded_at": "2026-11-21T08:00:00Z", "lat": 5.356, "lng": -4.021, "speed_kmh": 72,
    "heading": 310, "odometer_km": 412345.6, "ignition": true, "fuel_level_pct": 64, "fuel_used_l": 18234.5 }
] }
```

Jusqu'à 500 positions par envoi (un boîtier resté sans réseau envoie son historique au retour). Positions de plus de 30 jours, dans le futur, ou déjà reçues : ignorées. Sans compteur fourni, FlottAuto ajoute au car la distance entre deux points (les sauts impossibles, au-delà de 160 km/h, ne comptent pas).
