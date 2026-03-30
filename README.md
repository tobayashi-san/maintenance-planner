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

## Docker

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

Die Anwendung ist danach unter `http://localhost:3000` erreichbar.

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
