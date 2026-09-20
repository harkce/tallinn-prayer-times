# Tallinn Prayer Times

Phone-first PWA showing **next prayer** and **today’s times** for Tallinn, Estonia. Offline-capable via a service worker and a last-known-times cache.

**Live (GitHub Pages):** https://harkce.github.io/tallinn-prayer-times/

## Calculation source

Prayer times are computed with the same logic as [Eesti Islamikeskus](https://www.eestiislamikeskus.org/) (`app.js`):

- Tallinn coordinates `59.4370, 24.7536`, timezone `Europe/Tallinn`
- Fajr / Isha angle **15°**, Asr shadow factor **1**
- High-latitude Fajr night-portion guard
- **Isha month rules:** May–August → Maghrib + 90 minutes; other months prefer 15° with Maghrib+90 fallback when extreme
- Same rounding (Fajr round, Dhuhr/Asr/Maghrib/Isha ceil)

Do not replace `js/prayer-calc.js` with a third-party library if you want times to keep matching the mosque site.

## Local run

Any static server from the repo root (modules require HTTP, not `file://`):

```bash
python3 -m http.server 8080
# open http://localhost:8080/
```

Or:

```bash
npx serve .
```

## PWA

- `manifest.webmanifest` + icons under `icons/`
- `sw.js` precaches the app shell and calc module so the UI and times work offline
- Home also keeps today’s schedule in `localStorage` and shows an **offline** pill when the network is down

## GitHub Pages

Project site URL: `https://harkce.github.io/tallinn-prayer-times/`

### Enable Pages

1. Repo **Settings → Pages**
2. Source: **Deploy from a branch**
3. Branch: `main` / folder `/ (root)`  
   — or use the included GitHub Actions workflow (`.github/workflows/pages.yml`)

Assets use relative paths, so the project base path works without a bundler.

### Private repository note

Publishing GitHub Pages from a **private** repo requires **GitHub Pro** (or an org plan with Pages). On a free private repo, Pages may refuse to enable; the site is still fully buildable/servable locally or from any static host. Making the repo public also enables Pages on the free plan.

Enable via API (when allowed):

```bash
gh api -X POST repos/harkce/tallinn-prayer-times/pages \
  -f build_type=legacy \
  -f source[branch]=main \
  -f source[path]=/
```

## Pages

| Path | Content |
|------|---------|
| `index.html` | Today — next prayer hero + list |
| `month.html` | Sticky-header month grid |

No settings or city picker in v1.
