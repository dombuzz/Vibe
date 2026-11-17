# Ohrmarkenabfrage

Web-App zur Abfrage von Ohrmarkennummern (Foto oder manuelle Eingabe).

## Gemeinsame Namensliste

`namen.txt` enthält die Zuordnung (`nummer;name;datum`). Geschrieben wird sie vom Worker in `worker/`
(Cloudflare Worker, Secret `GITHUB_TOKEN` mit Contents-Schreibrecht nur für dieses Repo).
Nach dem Deployen die Worker-URL in `index.html` bei `const API` eintragen.
