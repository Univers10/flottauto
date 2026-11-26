"""Distance par la route entre deux villes de Côte d'Ivoire.

Un petit réseau des routes principales (km de route, arrondis) suffit aux convois et aux départs :
le plus court chemin donne la distance. Une ville connue mais hors réseau est estimée à vol d'oiseau
× 1,3 (détours de la route). Le résultat reste une aide : la saisie peut toujours être corrigée.
"""
from __future__ import annotations

import heapq
import math
import re
import unicodedata

# Ville → (latitude, longitude).
CITIES: dict[str, tuple[float, float]] = {
    "Abidjan": (5.345, -4.024),
    "Abobo": (5.418, -4.020),
    "Adjamé": (5.360, -4.020),
    "Yopougon": (5.340, -4.080),
    "Bingerville": (5.355, -3.885),
    "Grand-Bassam": (5.211, -3.739),
    "Dabou": (5.326, -4.377),
    "Agboville": (5.928, -4.213),
    "Adzopé": (6.107, -3.860),
    "Abengourou": (6.730, -3.496),
    "Bondoukou": (8.040, -2.800),
    "Toumodi": (6.552, -5.019),
    "Yamoussoukro": (6.827, -5.289),
    "Tiébissou": (7.157, -5.225),
    "Bouaké": (7.690, -5.030),
    "Béoumi": (7.674, -5.580),
    "Katiola": (8.137, -5.101),
    "Niakaramandougou": (8.660, -5.290),
    "Korhogo": (9.458, -5.629),
    "Ferkessédougou": (9.593, -5.197),
    "Boundiali": (9.522, -6.487),
    "Tengréla": (10.484, -6.410),
    "Madinani": (9.617, -6.950),
    "Tiémé": (9.533, -7.333),
    "Odienné": (9.505, -7.564),
    "Touba": (8.284, -7.683),
    "Séguéla": (7.961, -6.673),
    "Mankono": (8.059, -6.190),
    "Vavoua": (7.382, -6.478),
    "Bouaflé": (6.990, -5.744),
    "Daloa": (6.877, -6.450),
    "Sinfra": (6.621, -5.912),
    "Gagnoa": (6.131, -5.951),
    "Divo": (5.837, -5.357),
    "Lakota": (5.850, -5.680),
    "Soubré": (5.785, -6.594),
    "San-Pédro": (4.748, -6.636),
    "Sassandra": (4.950, -6.083),
    "Duékoué": (6.742, -7.349),
    "Guiglo": (6.544, -7.493),
    "Man": (7.412, -7.554),
    "Danané": (7.260, -8.155),
    "Biankouma": (7.739, -7.614),
}

# Routes principales : (ville, ville, km de route).
ROADS: list[tuple[str, str, int]] = [
    ("Abobo", "Adjamé", 10), ("Adjamé", "Yopougon", 12), ("Adjamé", "Abidjan", 3),
    ("Abidjan", "Bingerville", 18), ("Abidjan", "Grand-Bassam", 40), ("Yopougon", "Dabou", 40),
    ("Abobo", "Agboville", 75), ("Agboville", "Adzopé", 60), ("Abobo", "Adzopé", 95),
    ("Adzopé", "Abengourou", 130), ("Abengourou", "Bondoukou", 210),
    ("Yopougon", "Toumodi", 195), ("Toumodi", "Yamoussoukro", 40), ("Yamoussoukro", "Tiébissou", 40),
    ("Tiébissou", "Bouaké", 65), ("Bouaké", "Katiola", 55), ("Katiola", "Niakaramandougou", 60),
    ("Niakaramandougou", "Korhogo", 115), ("Korhogo", "Ferkessédougou", 55), ("Bouaké", "Bondoukou", 220),
    ("Korhogo", "Boundiali", 100), ("Boundiali", "Tengréla", 120),
    ("Boundiali", "Madinani", 55), ("Madinani", "Tiémé", 50), ("Tiémé", "Odienné", 30),
    ("Odienné", "Touba", 150), ("Touba", "Séguéla", 150), ("Touba", "Man", 120), ("Touba", "Biankouma", 95),
    ("Biankouma", "Man", 45), ("Séguéla", "Mankono", 70), ("Mankono", "Béoumi", 120), ("Béoumi", "Bouaké", 60),
    ("Séguéla", "Vavoua", 110), ("Vavoua", "Daloa", 55), ("Yamoussoukro", "Bouaflé", 60), ("Bouaflé", "Daloa", 85),
    ("Bouaflé", "Sinfra", 45), ("Sinfra", "Gagnoa", 65), ("Gagnoa", "Daloa", 90), ("Divo", "Gagnoa", 85),
    ("Dabou", "Divo", 150), ("Divo", "Lakota", 40), ("Lakota", "Soubré", 120), ("Gagnoa", "Soubré", 115),
    ("Soubré", "San-Pédro", 130), ("San-Pédro", "Sassandra", 70), ("Sassandra", "Divo", 160),
    ("Daloa", "Duékoué", 105), ("Duékoué", "Guiglo", 30), ("Duékoué", "Man", 80), ("Man", "Danané", 80),
    ("Soubré", "Duékoué", 150),
]

# Autres façons d'écrire une ville.
ALIASES = {
    "abj": "Abidjan", "plateau": "Abidjan", "treichville": "Abidjan", "cocody": "Abidjan", "marcory": "Abidjan",
    "koumassi": "Abidjan", "port bouet": "Abidjan", "yop": "Yopougon", "yamoussoukro": "Yamoussoukro", "yakro": "Yamoussoukro",
    "ferke": "Ferkessédougou", "niakara": "Niakaramandougou", "san pedro": "San-Pédro", "grand bassam": "Grand-Bassam",
    "bassam": "Grand-Bassam", "tieme": "Tiémé", "odienne": "Odienné",
}

ROAD_FACTOR = 1.3


def _norm(text: str) -> str:
    s = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode().lower()
    s = re.sub(r"[^a-z0-9]+", " ", s)
    return re.sub(r"\b(gare|routiere|ville|de|du|d|l|la|le)\b", " ", s).strip()


_KEYS = {_norm(c): c for c in CITIES} | {_norm(k): v for k, v in ALIASES.items()}


def find_city(text: str | None) -> str | None:
    """« Gare d'Abobo », « ODIENNE », « Tieme » → nom de la ville connue, sinon None."""
    if not text:
        return None
    n = _norm(text)
    if not n:
        return None
    if n in _KEYS:
        return _KEYS[n]
    # Nom de ville contenu dans le libellé (le plus long gagne : « Grand-Bassam » avant « Bassam »).
    padded = f" {n} "
    hits = [k for k in _KEYS if f" {k} " in padded]
    return _KEYS[max(hits, key=len)] if hits else None


def _haversine(a: tuple[float, float], b: tuple[float, float]) -> float:
    lat1, lon1, lat2, lon2 = map(math.radians, (*a, *b))
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    return 6371 * 2 * math.asin(math.sqrt(h))


def _graph() -> dict[str, list[tuple[str, int]]]:
    g: dict[str, list[tuple[str, int]]] = {c: [] for c in CITIES}
    for a, b, km in ROADS:
        g[a].append((b, km))
        g[b].append((a, km))
    return g


_GRAPH = _graph()


def _shortest(src: str, dst: str) -> tuple[int, list[str]] | None:
    best = {src: 0}
    prev: dict[str, str] = {}
    heap = [(0, src)]
    while heap:
        d, city = heapq.heappop(heap)
        if city == dst:
            path = [dst]
            while path[-1] != src:
                path.append(prev[path[-1]])
            return d, path[::-1]
        if d > best.get(city, math.inf):
            continue
        for nxt, km in _GRAPH[city]:
            nd = d + km
            if nd < best.get(nxt, math.inf):
                best[nxt] = nd
                prev[nxt] = city
                heapq.heappush(heap, (nd, nxt))
    return None


def road_distance(origin: str | None, destination: str | None) -> dict | None:
    """Distance par la route. None si une des deux villes est inconnue."""
    a, b = find_city(origin), find_city(destination)
    if a is None or b is None:
        return None
    if a == b:
        return {"from_city": a, "to_city": b, "km": 0, "via": [a], "method": "road"}
    found = _shortest(a, b)
    if found is not None:
        km, path = found
        return {"from_city": a, "to_city": b, "km": km, "via": path, "method": "road"}
    km = int(round(_haversine(CITIES[a], CITIES[b]) * ROAD_FACTOR / 5) * 5)
    return {"from_city": a, "to_city": b, "km": km, "via": [a, b], "method": "estimate"}


def city_names() -> list[str]:
    return sorted(CITIES, key=_norm)
