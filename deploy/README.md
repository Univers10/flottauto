# Tâches planifiées (serveur de production)

| Minuteur | Heure (UTC = Abidjan) | Rôle |
|---|---|---|
| `flottauto-nightly.timer` | 00:10 | `python -m app.jobs nightly` : alertes papiers, permis, entretiens, factures absentes à minuit |
| `flottauto-backup.timer` | 02:30 | `flottauto-backup.sh` : dump PostgreSQL (30 jours) dans `/root/flottauto-backups/daily`, copie des fichiers envoyés dans `/root/flottauto-backups/files` |

Installation ou mise à jour :

```bash
cp /root/flottauto/deploy/flottauto-*.service /root/flottauto/deploy/flottauto-*.timer /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now flottauto-nightly.timer flottauto-backup.timer
```

Contrôle : `systemctl list-timers 'flottauto-*'`, journaux : `journalctl -u flottauto-nightly -u flottauto-backup`.

Restaurer la base : `gzip -dc <fichier>.sql.gz | docker exec -i flottauto-postgres psql -U flottauto -d flottauto` (sur une base vide).

Les sauvegardes restent sur le même serveur : copier régulièrement `/root/flottauto-backups` ailleurs.
