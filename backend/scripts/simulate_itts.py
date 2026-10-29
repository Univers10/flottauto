"""Simulateur d'ITTS Gestion pour tester le pont en local (contrat : docs/integration-itts.md).

Joue le rôle de l'app de gare : envoie les événements de départ signés et demande l'autorisation
avant de passer un départ à « parti », exactement comme le fait ITTS Gestion.

Le secret est lu dans ITTS_SHARED_SECRET, sinon dans backend/.env (celui du backend lancé).

    python scripts/simulate_itts.py programmer --depart T1 --plaque 586
    python scripts/simulate_itts.py programmer --depart T1 --plaque 586 --chauffeur "KONE Ibrahim"
    python scripts/simulate_itts.py autoriser  --depart T1
    python scripts/simulate_itts.py partir     --depart T1 [--mode warn]
    python scripts/simulate_itts.py annuler    --depart T1
"""
import argparse
import hashlib
import hmac
import json
import os
import pathlib
import sys
import time
import urllib.error
import urllib.request
import uuid
from datetime import datetime, timedelta, timezone

EVENTS = "/api/v1/integrations/itts/events"
STATE = pathlib.Path(__file__).with_name(".simulate_itts_state.json")  # dernier état de chaque départ simulé


def _env_file_secret() -> str | None:
    """Secret de backend/.env (dev local), pour ne pas avoir à le recopier."""
    env = pathlib.Path(__file__).resolve().parent.parent / ".env"
    if env.exists():
        for line in env.read_text(encoding="utf-8").splitlines():
            if line.startswith("ITTS_SHARED_SECRET="):
                return line.split("=", 1)[1].strip()
    return None


def _secret(args) -> str:
    secret = os.environ.get("ITTS_SHARED_SECRET") or _env_file_secret()
    if args.secret_file:
        secret = pathlib.Path(args.secret_file).read_text(encoding="utf-8").strip()
    if not secret:
        sys.exit("Secret manquant : définissez ITTS_SHARED_SECRET ou passez --secret-file.")
    return secret


def _request(args, method: str, path: str, body: bytes = b""):
    ts = str(int(time.time()))
    signature = hmac.new(_secret(args).encode(), f"{ts}.{method}.{path}.".encode() + body, hashlib.sha256).hexdigest()
    headers = {"X-Itts-Timestamp": ts, "X-Itts-Signature": signature, "Content-Type": "application/json"}
    req = urllib.request.Request(args.url.rstrip("/") + path, data=body or None, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=4) as res:
            return res.status, json.loads(res.read() or b"{}")
    except urllib.error.HTTPError as exc:
        return exc.code, exc.read().decode(errors="replace")
    except OSError as exc:
        return None, str(exc)


def _load() -> dict:
    return json.loads(STATE.read_text(encoding="utf-8")) if STATE.exists() else {}


def _departure(args) -> dict:
    """Départ simulé : reprend le dernier état connu, modifié par les options passées."""
    state = _load().get(args.depart)
    if state is None:
        if not args.plaque:
            sys.exit(f"Départ {args.depart} inconnu du simulateur : lancez d'abord « programmer --plaque … ».")
        state = {
            "id": f"itts-{args.depart}",
            "number": 1,
            "departure_at": (datetime.now(timezone.utc) + timedelta(hours=2)).isoformat(),
            "status": "PROGRAMME",
            "mode": "HEURE_FIXE",
            "route": {"from": "Abidjan-Abobo", "to": "Odienné"},
            "station": {"id": "st-abo", "code": "ABO", "name": "Abidjan-Abobo"},
            "driver": {"id": "drv-seidou", "name": "SEIDOU SYNAYOKO", "phone": "0700000000"},
            "conveyor": {"id": "cvy-awa", "name": "KONE Awa", "phone": None},
            "departed_at": None,
        }
    if args.plaque:
        state["bus"] = {"id": f"bus-{args.plaque}", "plate": args.plaque, "number": args.plaque}
    if args.chauffeur:
        state["driver"] = {"id": f"drv-{args.chauffeur.lower().replace(' ', '-')}", "name": args.chauffeur, "phone": None}
    if args.heure:
        hour, minute = (int(x) for x in args.heure.split(":"))
        state["departure_at"] = datetime.now(timezone.utc).replace(hour=hour, minute=minute, second=0, microsecond=0).isoformat()
    state["service_date"] = state["departure_at"][:10]
    return state


def _send(args, etype: str, dep: dict) -> None:
    event = {"id": str(uuid.uuid4()), "type": etype, "occurred_at": datetime.now(timezone.utc).isoformat(), "departure": dep}
    status, body = _request(args, "POST", EVENTS, json.dumps(event).encode())
    print(f"→ {etype} : HTTP {status} {body}")
    if status == 200:
        states = _load()
        states[args.depart] = dep
        STATE.write_text(json.dumps(states, indent=2, ensure_ascii=False), encoding="utf-8")
        if isinstance(body, dict) and body.get("status") == "pending_mapping":
            print("  Car inconnu de FlottAuto : associez-le dans Paramètres → Intégration ITTS.")


def _authorize(args, dep: dict) -> dict | None:
    path = f"/api/v1/integrations/itts/departures/{dep['id']}/authorization?bus_id={dep['bus']['id']}"
    status, body = _request(args, "GET", path)
    if status != 200 or not isinstance(body, dict):
        print(f"→ autorisation : FlottAuto injoignable ou refus technique (HTTP {status} {body})")
        return None
    verdict = "AUTORISÉ" if body["authorized"] else "REFUSÉ"
    print(f"→ autorisation : {verdict} · statut {body['status']}")
    if body.get("exit_pass_number"):
        print(f"  Bon de sortie {body['exit_pass_number']}, valable jusqu'à {body['valid_until']}")
    if body.get("reason"):
        print(f"  Motif : {body['reason']}")
    if body.get("url"):
        print(f"  Fiche : {body['url']}")
    return body


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")  # console Windows
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("action", choices=["programmer", "autoriser", "partir", "annuler"])
    parser.add_argument("--depart", default="T1", help="nom court du départ simulé (défaut : T1)")
    parser.add_argument("--plaque", help="immatriculation du car (ex. 586)")
    parser.add_argument("--chauffeur", help="nom du chauffeur, ex. « KONE Ibrahim » (changement d'équipage)")
    parser.add_argument("--heure", help="heure de départ HH:MM (UTC = heure d'Abidjan)")
    parser.add_argument("--mode", choices=["warn", "enforce"], default="enforce", help="mode du contrôle côté ITTS (défaut : enforce)")
    parser.add_argument("--url", default="http://127.0.0.1:8000")
    parser.add_argument("--secret-file", help="fichier contenant le secret partagé")
    args = parser.parse_args()

    dep = _departure(args)
    if args.action == "programmer":
        _send(args, "departure.upserted", dep)
    elif args.action == "autoriser":
        _authorize(args, dep)
    elif args.action == "annuler":
        _send(args, "departure.cancelled", {**dep, "status": "ANNULE"})
    else:  # partir : contrôle du bon de sortie, puis passage à PARTI selon le mode
        result = _authorize(args, dep)
        if not (result and result["authorized"]):
            if args.mode == "enforce":
                print("✗ ITTS refuse le départ : DEPARTURE_NOT_AUTHORIZED (le car ne part pas).")
                return
            print("! Mode warn : le car part quand même (audit DEPARTURE_GATE_WARNING côté ITTS).")
        _send(args, "departure.departed", {**dep, "status": "PARTI", "departed_at": datetime.now(timezone.utc).isoformat()})


if __name__ == "__main__":
    main()
