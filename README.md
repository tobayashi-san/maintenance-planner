# Wartungskalender

Wartungskalender ist eine App fuer wiederkehrende Wartungen, Erinnerungen und Team-Aufgaben. Sie bietet Kalenderansicht, Serienvorkommen, E-Mail-Erinnerungen, Outlook-/ICS-Links, PWA-Unterstuetzung und Browser-Benachrichtigungen.

## Schnellstart

Es gibt 2 sinnvolle Betriebsarten:

### 1. Einfach intern ohne HTTPS

Gut fuer einen schnellen Start im LAN.

`.env`:

```env
JWT_SECRET=bitte-einen-langen-zufalligen-schluessel-verwenden
APP_URL=http://10.0.9.120:3000
ALLOWED_ORIGIN=http://10.0.9.120:3000
INITIAL_ADMIN_NAME=Admin
INITIAL_ADMIN_EMAIL=admin@example.com
INITIAL_ADMIN_PASSWORD=use-a-long-random-password
```

Start:

```bash
docker compose pull
docker compose up -d
```

Danach ist die App unter `http://10.0.9.120:3000` erreichbar.

Wichtig:
- Das ist einfach, aber **PWA** und **Browser-Benachrichtigungen** funktionieren auf internen `http://10.x.x.x`-Adressen oft nicht.

### 2. Empfohlen: intern mit HTTPS

Das ist die beste Variante fuer:
- PWA-Installation
- Service Worker
- Browser-Benachrichtigungen

Hier braucht ihr nur **eine Compose-Datei**. Caddy erzeugt die interne CA und das Zertifikat automatisch.

#### Server

1. Internen Hostnamen festlegen, z. B. `wartungskalender.intern`
2. Diesen Namen auf euren Server zeigen lassen

Beispiel Windows `hosts`:

```text
10.0.9.120 wartungskalender.intern
```

3. `.env` anlegen:

```env
JWT_SECRET=bitte-einen-langen-zufalligen-schluessel-verwenden
INTERNAL_TLS_HOSTNAME=wartungskalender.intern
INITIAL_ADMIN_NAME=Admin
INITIAL_ADMIN_EMAIL=admin@example.com
INITIAL_ADMIN_PASSWORD=use-a-long-random-password
```

4. Starten:

```bash
docker compose -f docker-compose.internal-tls.yml pull
docker compose -f docker-compose.internal-tls.yml up -d
```

Danach laeuft die App unter:

```text
https://wartungskalender.intern
```

#### Benutzer-PC

Beim ersten Aufruf ist das Zertifikat noch nicht vertraut. Danach:

1. App oeffnen
2. `Root CA` oben in der App herunterladen
3. Zertifikat importieren
4. Browser neu starten
5. App erneut oeffnen

Direkter Download-Link:

```text
https://wartungskalender.intern/downloads/internal-root-ca.crt
```

Windows-Import:

1. `mmc` starten
2. `Datei > Snap-In hinzufuegen/entfernen`
3. `Zertifikate` fuer `Computerkonto`
4. `Vertrauenswuerdige Stammzertifizierungsstellen > Zertifikate`
5. `Importieren`
6. `internal-root-ca.crt` auswaehlen

Danach sollten funktionieren:
- HTTPS ohne Warnung
- PWA-Installation
- Browser-Benachrichtigungen

## Outlook / ICS

- Classic Outlook im selben LAN kann mit internen Links funktionieren.
- New Outlook und Outlook im Web sind mit internen IPs und Internetkalendern oft unzuverlaessig.
- Fuer den abonnierbaren Kalender gibt es einen persoenlichen ICS-Link in der App.

## Oeffentliche HTTPS-Variante

Wenn ihr spaeter doch eine oeffentliche Domain nutzen wollt:

`.env`:

```env
PUBLIC_HOSTNAME=calendar.example.com
ACME_EMAIL=ops@example.com
APP_URL=https://calendar.example.com
ALLOWED_ORIGIN=https://calendar.example.com
```

Start:

```bash
docker compose pull
docker compose -f docker-compose.yml -f docker-compose.proxy.yml up -d
```

## Wichtige Dateien

- App-Datenbank: `DB/database.sqlite`
- Uploads: `uploads/`
- Internes HTTPS: `docker-compose.internal-tls.yml`
- Oeffentliche HTTPS-Variante: `docker-compose.proxy.yml`

## Docker-Image

Standardmaessig wird dieses Image verwendet:

```text
ghcr.io/tobayashi-san/maintenance-planner:latest
```

Optional koennt ihr in `.env` ein anderes Tag setzen:

```env
WARTUNGSKALENDER_IMAGE=ghcr.io/tobayashi-san/maintenance-planner:latest
```

## Wichtige Hinweise

- `JWT_SECRET` muss gesetzt sein.
- Bei leerer Datenbank werden die Initial-Admin-Werte aus `.env` verwendet.
- Fuer internes HTTPS muss der Benutzer die Root-CA einmal vertrauen.
- Wenn die App ueber `https://wartungskalender.intern` laeuft, sollte sie nicht ueber `https://10.0.9.120` geoeffnet werden.

## Entwicklung

Voraussetzungen:
- Node.js 20+
- npm

Installation:

```bash
npm install
```

Frontend:

```bash
npm run dev
```

Backend:

```bash
npm run server
```

Beides:

```bash
npm run dev:all
```

Build:

```bash
npm run build
```

## Lizenz

Dieses Projekt steht unter der [MIT-Lizenz](LICENSE).
