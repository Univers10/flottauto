#!/bin/sh
# Sauvegarde quotidienne de FlottAuto : base PostgreSQL (une copie par jour, 30 jours gardés)
# et fichiers envoyés (photos, factures, documents), copiés sans jamais supprimer.
set -eu
DEST=/root/flottauto-backups
APP=/root/flottauto/backend
KEEP_DAYS=30
mkdir -p "$DEST/daily" "$DEST/files"

STAMP=$(date -u +%Y%m%d-%H%M)
TMP="$DEST/daily/.flottauto-$STAMP.sql.gz"
docker exec flottauto-postgres pg_dump -U flottauto -d flottauto | gzip > "$TMP"
# Une sauvegarde vide ou tronquée ne doit pas remplacer les bonnes.
[ "$(gzip -dc "$TMP" | tail -c 200 | grep -c 'PostgreSQL database dump complete')" -ge 1 ] || { rm -f "$TMP"; echo "pg_dump incomplet" >&2; exit 1; }
mv "$TMP" "$DEST/daily/flottauto-$STAMP.sql.gz"

for dir in uploads private_uploads; do
  [ -d "$APP/$dir" ] && rsync -a "$APP/$dir/" "$DEST/files/$dir/"
done

find "$DEST/daily" -name 'flottauto-*.sql.gz' -mtime +$KEEP_DAYS -delete
echo "Sauvegarde OK : $DEST/daily/flottauto-$STAMP.sql.gz ($(du -h "$DEST/daily/flottauto-$STAMP.sql.gz" | cut -f1))"
