# Let It Roll Recordings Dashboard

Dashboard pro sledovani tracku Let It Roll Recordings pres Soundcharts API.

## Lokalni spusteni

1. Vytvor nebo uprav `.env` podle `.env.example`.
2. Spust dashboard:

```powershell
cd "C:\Users\Dozikur\Documents\LIR Recordings_charts"
.\run-dashboard.ps1
```

3. Otevri `http://127.0.0.1:5178`.

## Obnoveni dat

```powershell
npm run sync
```

## GitHub Pages

Repozitar umi publikovat staticky dashboard pres GitHub Actions.

V GitHub repozitari nastav:

- `Settings -> Secrets and variables -> Actions -> New repository secret`
- `SOUNDCHARTS_APP_ID`
- `SOUNDCHARTS_API_KEY`
- volitelne pro SoundCloud plays:
  - `SOUNDCLOUD_CLIENT_ID`
  - `SOUNDCLOUD_CLIENT_SECRET`

Pak zapni Pages:

- `Settings -> Pages`
- Source: `GitHub Actions`

Workflow `Publish Dashboard` se spousti jen rucne pres `workflow_dispatch`.

Pro rucni obnoveni dat:

1. Otevri GitHub repozitar.
2. Jdi do `Actions`.
3. Vyber `Publish Dashboard`.
4. Klikni `Run workflow`.

Takhle se Soundcharts requesty pouziji jen pri rucni aktualizaci.

### SoundCloud plays

SoundCloud data se tahaji jen pri workflow `sync_data=true`. Bez SoundCloud secrets dashboard normalne bezi dal, jen zustane `SoundCloud` na nule.

Pro presne parovani tracku muzes doplnit soubor:

```text
data/soundcloud-links.json
```

Format:

```json
{
  "GB2LD2410566": "https://soundcloud.com/artist/track",
  "GB2LD2310228": 123456789
}
```

Kdyz odkaz nebo ID neni doplneny, sync zkusi SoundCloud search podle nazvu tracku a interpreta.

## Manualni insights snapshot

Dashboard umi zobrazit i rucne doplnena data z Transparency nebo Songstats exportu bez dalsiho API volani.

Soubor:

```text
data/external-insights.json
```

Podporovane sekce:

- `topTracks`
- `trendingTracks`
- `playlistSources`

Po uprave souboru spust GitHub Pages workflow se `sync_data=false`. Nasadi se jen novy snapshot a vzhled, Soundcharts sync se nepusti.
