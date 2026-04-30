# Wartungskalender

Wartungskalender ist eine React-, Vite- und Node.js-Anwendung zur Planung, Verwaltung und Erinnerung von Wartungsaufgaben. Die App kombiniert ein modernes Frontend mit einem Express-Backend, speichert Daten in SQLite und unterstützt wiederkehrende Aufgaben, Benachrichtigungen und Kalender-Feeds.

## Highlights

- Kalenderansicht für Wartungsaufgaben und Serienvorkommen
- Wiederkehrende Aufgaben mit Verschieben, Überspringen und Abschluss je Vorkommen
- Rollenbasiertes Benutzerkonzept mit `admin` und `user`
- Kategorien, Vorlagen und zentrale App-Konfiguration
- SMTP-Versand für Einladungen und Erinnerungen
- In-App- und Browser-Benachrichtigungen
- ICS-Export und abonnierbarer Kalenderlink für Outlook
- PWA-Unterstützung für Installation im Browser

## Tech Stack

- Frontend: React 19, TypeScript, Vite, Zustand
- Backend: Node.js, Express
- Datenbank: SQLite
- Mail: Nodemailer
- Authentifizierung: JWT

## Rollenmodell

- `admin`: verwaltet Benutzer, Kategorien, Vorlagen, SMTP-Einstellungen und Aufgabenserien
- `user`: sieht zugewiesene Aufgaben, pflegt Serienvorkommen und kann sein Passwort ändern

## Projektstruktur

```text
src/       Frontend mit Seiten, Komponenten, Context und Store
server/    Express-API und Datenbankzugriff
DB/        SQLite-Datenbankdatei
public/    Statische Assets und PWA-Dateien
uploads/   Hochgeladene Anhänge
```

## Lokale Entwicklung

### Voraussetzungen

- Node.js 20+
- npm

### Installation

```bash
npm install
```

### Entwicklungsmodus

Frontend starten:

```bash
npm run dev
```

Backend starten:

```bash
npm run server
```

Beides parallel:

```bash
npm run dev:all
```

## Build

```bash
npm run build
```

## Umgebungsvariablen

Die Anwendung liest Konfiguration aus `.env`.

Beispiel:

```env
PORT=3000
JWT_SECRET=bitte-einen-langen-zufalligen-schluessel-verwenden
APP_URL=http://localhost:3000
ALLOWED_ORIGIN=http://localhost:5173
```

### `.env` per Copy-Paste erzeugen

```bash
cat > .env <<'EOF'
PORT=3000
JWT_SECRET=change-me-to-a-long-random-secret
APP_URL=http://localhost:3000
ALLOWED_ORIGIN=http://localhost:5173
EOF
```

## Docker

### Internes Deployment im Netzwerk

Wenn die App **nur intern im Netzwerk** laufen soll, reicht das normale `docker-compose.yml`.

Beispiel fuer `.env`:

```env
JWT_SECRET=bitte-einen-langen-zufalligen-schluessel-verwenden
APP_URL=http://10.0.9.120:3000
ALLOWED_ORIGIN=http://10.0.9.120:3000
INITIAL_ADMIN_NAME=Admin
INITIAL_ADMIN_EMAIL=admin@example.com
INITIAL_ADMIN_PASSWORD=use-a-long-random-password
```

Dann starten:

```bash
docker compose up -d --build
```

Die App ist danach intern unter `http://10.0.9.120:3000` erreichbar.

Hinweis zu Outlook:

- **Classic Outlook im selben LAN** kann mit internen `http://`- oder privaten IP-Links funktionieren.
- **New Outlook** und **Outlook on the web / Microsoft 365** sind mit internen IPs und Internetkalendern oft unzuverlaessig oder koennen gar nicht darauf zugreifen.

### Empfohlene interne HTTPS-Variante fuer PWA und Web-Benachrichtigungen

Wenn ihr **PWA-Installation**, **Service Worker** und **Browser-Benachrichtigungen** im internen Netzverlaesslich nutzen wollt, ist die beste Variante eine **interne HTTPS-Domain mit lokal vertrautem Zertifikat**.

Diese Repo-Konfiguration ist dafuer vorbereitet:

- Compose-Datei: `docker-compose.internal-tls.yml`
- Proxy-Konfiguration: `Caddyfile.internal-tls`
- Zertifikate im Repo-Pfad: `certs/internal.crt` und `certs/internal.key`

#### Schnellstart

1. Namen waehlen, z. B. `wartungskalender.intern`
2. Diesen Namen intern auf euren Server zeigen lassen
3. Vertrauenswuerdiges Zertifikat fuer genau diesen Namen erzeugen
4. Zertifikat nach `certs/internal.crt` und `certs/internal.key` legen
5. `INTERNAL_TLS_HOSTNAME` in `.env` setzen
6. Mit `docker compose -f docker-compose.yml -f docker-compose.internal-tls.yml up -d --build` starten
7. Im Browser `https://wartungskalender.intern` aufrufen

#### Schritt fuer Schritt

Empfohlener Ablauf:

1. Interne DNS- oder Hosts-Aufloesung einrichten, z. B.:
   `wartungskalender.intern -> 10.0.9.120`
   Falls ihr keinen internen DNS-Eintrag habt, koennt ihr zum Testen auf Windows in
   `C:\Windows\System32\drivers\etc\hosts`
   eine Zeile wie diese eintragen:

```text
10.0.9.120 wartungskalender.intern
```

2. Ein lokal vertrautes Zertifikat fuer diesen Hostnamen ausstellen.
   Das kann ueber eure interne CA oder z. B. mit `mkcert` passieren.
   Beispiel mit `mkcert` auf dem Host:

```bash
mkcert -install
mkcert -cert-file certs/internal.crt -key-file certs/internal.key wartungskalender.intern
```
3. Zertifikat und Key hier ablegen:
   - `certs/internal.crt`
   - `certs/internal.key`
4. In `.env` den internen Hostnamen setzen:

```env
JWT_SECRET=bitte-einen-langen-zufalligen-schluessel-verwenden
INTERNAL_TLS_HOSTNAME=wartungskalender.intern
INITIAL_ADMIN_NAME=Admin
INITIAL_ADMIN_EMAIL=admin@example.com
INITIAL_ADMIN_PASSWORD=use-a-long-random-password
```

5. Dann starten:

```bash
docker compose -f docker-compose.yml -f docker-compose.internal-tls.yml up -d --build
```

Danach ist die App intern ueber `https://wartungskalender.intern` erreichbar.

#### Was du danach pruefen solltest

1. `https://wartungskalender.intern` oeffnet **ohne Zertifikatswarnung**
2. Im Browser ist beim Schloss-Symbol kein Zertifikatsfehler sichtbar
3. Der Install-Button bzw. die PWA-Installation erscheint
4. Browser-Benachrichtigungen lassen sich aktivieren
5. In der App unter `Admin > App Links` ist dieselbe HTTPS-URL hinterlegt

Wichtig:

- Das Zertifikat muss auf den Benutzergeraeten als **vertrauenswuerdig** gelten.
- Ein nur selbstsigniertes, **nicht vertrautes** Zertifikat fuehrt weiter zu Browser-Warnungen und ist fuer PWA/Notifications deutlich unzuverlaessiger.
- Wenn der Browser die App vorher schon ueber `http://10.x.x.x` gesehen hat, lohnt sich nach dem Umstieg ein neues Tab oder einmaliges Leeren der Website-Daten.
- `INTERNAL_TLS_HOSTNAME` muss zum Zertifikat passen. Wenn das Zertifikat fuer `wartungskalender.intern` ausgestellt ist, darf die App nicht ueber `https://10.0.9.120` geoeffnet werden.

#### Typische Fehler

- **Browser zeigt Zertifikatswarnung**:
  Das Zertifikat ist nicht vertraut oder passt nicht zum Hostnamen.
- **PWA-Install fehlt**:
  Meist ist die Seite noch nicht in einem echten Secure Context oder der Browser hat alte Daten vom HTTP-Aufruf gecacht.
- **Benachrichtigungen bleiben blockiert**:
  Erst HTTPS sauber machen, dann die Website-Berechtigung im Browser neu erlauben.

### Optionale oeffentliche HTTPS-Variante fuer Outlook / OWA

Wenn du spaeter doch eine **oeffentliche HTTPS-Domain** willst, kannst du zusaetzlich die Proxy-Datei verwenden:

```text
https://calendar.example.com
```

Diese Zusatzkonfiguration nutzt **Caddy als Reverse Proxy** und holt automatisch TLS-Zertifikate, wenn:

- `PUBLIC_HOSTNAME` auf eine oeffentliche Domain gesetzt ist
- DNS auf deinen Server zeigt
- Port `80` und `443` aus dem Internet erreichbar sind

Zusatzwerte in `.env`:

```env
PUBLIC_HOSTNAME=calendar.example.com
ACME_EMAIL=ops@example.com
APP_URL=https://calendar.example.com
ALLOWED_ORIGIN=https://calendar.example.com
```

Danach starten:

```bash
docker compose -f docker-compose.yml -f docker-compose.proxy.yml up -d --build
```

Die App ist dann ueber `https://calendar.example.com` erreichbar und kann daraus Outlook-kompatible `webcal://`-Links erzeugen.

### Docker Image bauen

```bash
docker build -t wartungskalender .
```

### Container starten

```bash
docker run -p 3000:3000 \
  -e NODE_ENV=production \
  -e JWT_SECRET=bitte-einen-langen-zufalligen-schluessel-verwenden \
  -e APP_URL=http://localhost:3000 \
  wartungskalender
```

### Mit Docker Compose

```bash
docker compose up --build
```

Die Anwendung ist danach standardmaessig direkt auf Port `3000` erreichbar.

### `docker-compose.yml` per Copy-Paste erzeugen

```bash
cat > docker-compose.yml <<'EOF'
services:
  wartungskalender:
    image: ghcr.io/tobayashi-san/maintenance-planner:latest
    container_name: wartungskalender
    ports:
      - "3000:3000"
    env_file:
      - .env
    volumes:
      - ./DB:/app/DB
      - ./uploads:/app/uploads
    restart: unless-stopped
EOF
```

Danach starten:

```bash
docker compose up -d
```

## GitHub Container Registry

Das Repository ist für ein Container-Image über GitHub Actions vorbereitet. Bei jedem Push auf `main` und bei Tags wie `v1.0.0` wird automatisch ein Image nach `ghcr.io` veröffentlicht.

Beispiel:

```bash
docker pull ghcr.io/tobayashi-san/maintenance-planner:latest
```

## Datenhaltung

- SQLite-Datei: `DB/database.sqlite`
- Uploads: `uploads/`

Diese Verzeichnisse werden im `docker-compose.yml` als Volumes eingebunden, damit Daten erhalten bleiben.

## Wichtige API-Endpunkte

- `POST /api/auth/login`
- `GET /api/auth/me`
- `GET /api/tasks`
- `GET /api/tasks/occurrences`
- `PUT /api/tasks/:id/occurrences`
- `GET /api/calendar.ics?token=...`
- `GET /api/health`

## Sicherheitshinweise

- Vor produktivem Einsatz muss `JWT_SECRET` gesetzt werden.
- Die initiale Admin-Erstellung sollte vor einem öffentlichen Deployment geprüft werden.
- `.env`, Datenbankdateien und Uploads sind absichtlich nicht versioniert.

## Bekannte Grenzen

- Einzelne Serien-Ausnahmen können in externen Kalendern eingeschränkt dargestellt werden.
- Es gibt aktuell noch keine automatisierten Tests.

## Lizenz

Dieses Projekt steht unter der [MIT-Lizenz](LICENSE).
