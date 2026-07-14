import fs from "node:fs/promises";
import path from "node:path";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const outputDir = path.resolve("outputs/lir_recordings_soundcharts");
await fs.mkdir(outputDir, { recursive: true });

const workbook = Workbook.create();

const palette = {
  ink: "#1F2937",
  muted: "#6B7280",
  header: "#1F4E79",
  header2: "#0F766E",
  accent: "#F59E0B",
  lightBlue: "#EAF3F8",
  lightGreen: "#EAF7F1",
  lightAmber: "#FFF7E6",
  lightRed: "#FDECEC",
  border: "#D9E2EC",
  white: "#FFFFFF",
};

const releases = [
  ["LIR001", "What You See", "GB2LD0901972", "Single ISRC verified", 1, "Known ISRC supplied"],
  ["LIR002", "The Opening EP", "vice ISRC", "Needs track-level ISRC", "", "Multi-track release"],
  ["LIR003", "Let It Roll: Drum & Bass, Vol. 2", "vice ISRC", "Needs track-level ISRC", "", "Compilation / multi-track release"],
  ["LIR004", "Opening Show 2018", "vice ISRC", "Needs track-level ISRC", "", "Multi-track release"],
  ["LIR005", "Caliban / Giant Growth", "2 ISRC", "Needs track-level ISRC", 2, "Two-track release, ISRC values not supplied"],
  ["LIR006", "Portal Breach / No Halfsteppin'", "GB2LD1900261 / GB2LD1900262", "Single ISRC verified", 2, "Two supplied ISRCs split in Track ISRCs"],
  ["LIR007", "Opening Show 2019", "vice ISRC", "Needs track-level ISRC", "", "Multi-track release"],
  ["LIR008", "The Key", "zatim neovereno", "Unverified", 1, "Needs ISRC confirmation"],
  ["LIR009", "Nebula", "GB2LD2310228", "Single ISRC verified", 1, "Known ISRC supplied"],
  ["LIR010", "Ethereality", "zatim neovereno", "Unverified", 1, "Needs ISRC confirmation"],
  ["LIR011", "Illuminate", "zatim neovereno", "Unverified", 1, "Needs ISRC confirmation"],
  ["LIR012", "Resurrection", "zatim neovereno", "Unverified", 1, "Needs ISRC confirmation"],
  ["LIR013", "Connection", "zatim neovereno", "Unverified", 1, "Needs ISRC confirmation"],
  ["LIR014", "Lose Control", "zatim neovereno", "Unverified", 1, "Needs ISRC confirmation"],
  ["LIR015", "New Dawn EP", "vice ISRC", "Needs track-level ISRC", "", "Multi-track release"],
  ["LIR016", "Ultimatum", "GB2LD2410022", "Single ISRC verified", 1, "Known ISRC supplied"],
  ["LIR017", "Feel The Fire", "GB2LD2410566", "Single ISRC verified", 1, "Known ISRC supplied"],
  ["LIR018", "Corpo", "zatim neovereno", "Unverified", 1, "Needs ISRC confirmation"],
  ["LIR019", "Imprisoned", "zatim neovereno", "Unverified", 1, "Needs ISRC confirmation"],
  ["LIR020", "Liberation", "zatim neovereno", "Unverified", 1, "Needs ISRC confirmation"],
  ["LIR021", "The Other Side", "zatim neovereno", "Unverified", 1, "Needs ISRC confirmation"],
  ["LIR022", "Shelter", "zatim neovereno", "Unverified", 1, "Needs ISRC confirmation"],
  ["LIR023", "Glory", "zatim neovereno", "Unverified", 1, "Needs ISRC confirmation"],
  ["LIREP024", "Planetary Protocol EP", "ISRC jednotlivych 3 tracku", "Needs track-level ISRC", 3, "Add one row per track"],
  ["LIREP025", "Let It Roll Remix EP", "ISRC jednotlivych tracku", "Needs track-level ISRC", "", "Add one row per track"],
  ["LIR027", "The Power", "GB2LD2610218", "Single ISRC verified", 1, "Known ISRC supplied for Drawn Moon, Madface"],
  ["LIR028", "Redemption", "zatim verejne neovereno", "Unverified", 1, "Needs public/API confirmation"],
];

const tracks = [
  ["LIR001", "What You See", "What You See", "GB2LD0901972", "Ready for API lookup", "", "", "", ""],
  ["LIR006", "Portal Breach / No Halfsteppin'", "Portal Breach", "GB2LD1900261", "Ready for API lookup", "", "", "", ""],
  ["LIR006", "Portal Breach / No Halfsteppin'", "No Halfsteppin'", "GB2LD1900262", "Ready for API lookup", "", "", "", ""],
  ["LIR009", "Nebula", "Nebula", "GB2LD2310228", "Ready for API lookup", "", "", "", ""],
  ["LIR016", "Ultimatum", "Ultimatum", "GB2LD2410022", "Ready for API lookup", "", "", "", ""],
  ["LIR017", "Feel The Fire", "Feel The Fire", "GB2LD2410566", "Ready for API lookup", "", "", "", ""],
  ["LIR027", "The Power", "The Power", "GB2LD2610218", "Ready for API lookup", "", "", "", "Drawn Moon, Madface"],
  ["LIR005", "Caliban / Giant Growth", "Caliban", "", "Needs ISRC", "", "", "", ""],
  ["LIR005", "Caliban / Giant Growth", "Giant Growth", "", "Needs ISRC", "", "", "", ""],
  ["LIREP024", "Planetary Protocol EP", "Track 1 TBD", "", "Needs ISRC", "", "", "", ""],
  ["LIREP024", "Planetary Protocol EP", "Track 2 TBD", "", "Needs ISRC", "", "", "", ""],
  ["LIREP024", "Planetary Protocol EP", "Track 3 TBD", "", "Needs ISRC", "", "", "", ""],
];

const statusValues = ["Ready for API lookup", "Needs ISRC", "Needs track title", "Verified in Soundcharts"];

function styleTitle(sheet, range, title, subtitle = "") {
  const r = sheet.getRange(range);
  r.merge();
  r.values = [[title + (subtitle ? `\n${subtitle}` : "")]];
  r.format = {
    fill: palette.header,
    font: { bold: true, color: palette.white, size: 15 },
    wrapText: true,
    verticalAlignment: "center",
  };
  r.format.rowHeightPx = subtitle ? 54 : 34;
}

function styleHeader(range, fill = palette.header2) {
  range.format = {
    fill,
    font: { bold: true, color: palette.white },
    wrapText: true,
    horizontalAlignment: "center",
    verticalAlignment: "center",
    borders: { preset: "outside", style: "thin", color: palette.border },
  };
}

function styleBody(range) {
  range.format = {
    font: { color: palette.ink },
    verticalAlignment: "top",
    wrapText: true,
    borders: {
      insideHorizontal: { style: "thin", color: palette.border },
      top: { style: "thin", color: palette.border },
      bottom: { style: "thin", color: palette.border },
    },
  };
}

function addNoteBox(sheet, range, text) {
  const r = sheet.getRange(range);
  r.merge();
  r.values = [[text]];
  r.format = {
    fill: palette.lightAmber,
    font: { color: palette.ink },
    wrapText: true,
    borders: { preset: "outside", style: "thin", color: palette.accent },
    verticalAlignment: "top",
  };
}

// Dashboard
const dash = workbook.worksheets.add("Dashboard");
dash.showGridLines = false;
styleTitle(
  dash,
  "A1:H2",
  "Let It Roll Recordings - Soundcharts Output Tracker",
  "Working catalog, API data staging, and success scoring model"
);
dash.getRange("A4:B8").values = [
  ["Catalog releases", ""],
  ["Releases with confirmed ISRC in source list", ""],
  ["Track rows ready for API lookup", ""],
  ["Track rows needing ISRC", ""],
  ["Average success score", ""],
];
dash.getRange("B4:B8").formulas = [
  ["=COUNTA('Catalog Releases'!A3:A100)"],
  ['=COUNTIF(\'Catalog Releases\'!D2:D100,"Single ISRC verified")'],
  ['=COUNTIF(\'Track ISRCs\'!E2:E200,"Ready for API lookup")+COUNTIF(\'Track ISRCs\'!E2:E200,"Verified in Soundcharts")'],
  ['=COUNTIF(\'Track ISRCs\'!E2:E200,"Needs ISRC")'],
  ["=IFERROR(AVERAGE('Success Score'!O2:O200),0)"],
];
dash.getRange("A4:B8").format = {
  fill: palette.lightBlue,
  font: { color: palette.ink },
  borders: { preset: "outside", style: "thin", color: palette.border },
};
dash.getRange("A4:A8").format.font = { bold: true, color: palette.ink };
dash.getRange("B4:B8").format = {
  fill: palette.white,
  font: { bold: true, color: palette.header },
  numberFormat: "#,##0.0",
  horizontalAlignment: "right",
};
dash.getRange("B4:B7").format.numberFormat = "#,##0";
addNoteBox(
  dash,
  "D4:H8",
  "Workflow: 1) doplnit chybejici ISRC po jednotlivych tracich; 2) pres Soundcharts /api/v2.25/song/by-isrc/{isrc} ziskat UUID a metadata; 3) naplnit listy API - Audience, API - Charts, API - Playlists a API - Radio; 4) zkopirovat agregace do Success Score."
);
dash.getRange("A10:H10").merge();
dash.getRange("A10:H10").values = [["Primary Soundcharts endpoints to use"]];
styleHeader(dash.getRange("A10:H10"), palette.header);
dash.getRange("A10:H10").format.rowHeightPx = 28;
dash.getRange("A11:H16").values = [
  ["Purpose", "Endpoint", "Key input", "Output", "Use in workbook", "Period support", "Plan risk", "Docs"],
  ["Resolve ISRC", "/api/v2.25/song/by-isrc/{isrc}", "ISRC", "Song UUID + metadata", "Track ISRCs", "No", "Low", "https://developers.soundcharts.com/api/reference/song/get-song-by-isrc"],
  ["Audience", "/api/v2/song/{uuid}/audience/{platform}", "UUID + platform", "Streams/plays/views/counts", "API - Audience", "Yes", "Plan dependent", "https://developers.soundcharts.com/api/reference/song/get-audience"],
  ["Popularity", "/api/v2/song/{uuid}/popularity/{platform}", "UUID + platform", "Daily popularity", "Success Score", "Yes", "Plan dependent", "https://developers.soundcharts.com/api/reference/song/get-popularity"],
  ["Charts", "/api/v2/song/{uuid}/charts/ranks/{platform}", "UUID + chart platform", "Current/past ranks", "API - Charts", "Current/past", "Plan dependent", "https://developers.soundcharts.com/api/reference/song/get-chart-entries"],
  ["Playlists", "/api/v2.20/song/{uuid}/playlist/current/{platform}", "UUID + playlist platform", "Playlist positions", "API - Playlists", "Current/past", "Plan dependent", "https://developers.soundcharts.com/api/reference/song/get-playlist-entries"],
];
styleHeader(dash.getRange("A11:H11"), palette.header2);
styleBody(dash.getRange("A12:H16"));
dash.getRange("A10:H10").format.font = { bold: true, color: palette.white };
dash.freezePanes.freezeRows(11);

// Catalog releases
const cat = workbook.worksheets.add("Catalog Releases");
cat.showGridLines = false;
styleTitle(cat, "A1:F1", "Catalog Releases");
cat.getRange("A2:F2").values = [["Catalog ID", "Release / track", "ISRC raw", "Status", "Expected tracks", "Notes"]];
cat.getRange(`A3:F${2 + releases.length}`).values = releases;
styleHeader(cat.getRange("A2:F2"));
styleBody(cat.getRange(`A3:F${2 + releases.length}`));
cat.tables.add(`A2:F${2 + releases.length}`, true, "CatalogReleases");
cat.getRange(`D3:D${2 + releases.length}`).dataValidation = {
  rule: { type: "list", values: ["Single ISRC verified", "Needs track-level ISRC", "Unverified"] },
};
cat.freezePanes.freezeRows(2);

// Track ISRCs
const tr = workbook.worksheets.add("Track ISRCs");
tr.showGridLines = false;
styleTitle(tr, "A1:I1", "Track-Level ISRCs");
tr.getRange("A2:I2").values = [["Catalog ID", "Release", "Track", "ISRC", "Status", "Soundcharts UUID", "Release date", "Label from Soundcharts", "Source / note"]];
tr.getRange(`A3:I${2 + tracks.length}`).values = tracks;
styleHeader(tr.getRange("A2:I2"));
styleBody(tr.getRange(`A3:I${2 + tracks.length}`));
tr.tables.add(`A2:I${2 + tracks.length}`, true, "TrackISRCs");
tr.getRange(`E3:E${2 + tracks.length}`).dataValidation = { rule: { type: "list", values: statusValues } };
tr.getRange(`G3:G${2 + tracks.length}`).format.numberFormat = "yyyy-mm-dd";
addNoteBox(tr, "K2:N6", "Add one row per real track. For EPs/compilations, keep the release ID and release name, then enter each track title and ISRC separately. Soundcharts UUID is filled after the ISRC lookup.");
tr.freezePanes.freezeRows(2);

// API Audience
const aud = workbook.worksheets.add("API - Audience");
aud.showGridLines = false;
styleTitle(aud, "A1:J1", "Soundcharts Audience Export Staging");
aud.getRange("A2:J2").values = [["Date", "Catalog ID", "Track", "ISRC", "Soundcharts UUID", "Platform", "Metric", "Value", "Identifier", "Source URL"]];
styleHeader(aud.getRange("A2:J2"));
styleBody(aud.getRange("A3:J102"));
aud.getRange("A3:A102").format.numberFormat = "yyyy-mm-dd";
aud.getRange("H3:H102").format.numberFormat = "#,##0";
aud.tables.add("A2:J102", true, "AudienceExport");
addNoteBox(aud, "L2:O6", "One row per platform/date metric from Soundcharts audience endpoint. Examples: Spotify Streams, YouTube Views, SoundCloud Plays, Shazam Count, TikTok Video count.");
aud.freezePanes.freezeRows(2);

// API Charts
const charts = workbook.worksheets.add("API - Charts");
charts.showGridLines = false;
styleTitle(charts, "A1:L1", "Soundcharts Chart Entries Staging");
charts.getRange("A2:L2").values = [["Catalog ID", "Track", "ISRC", "UUID", "Platform", "Chart", "Country", "Position", "Old position", "Entry date", "Rank date", "Current flag"]];
styleHeader(charts.getRange("A2:L2"));
styleBody(charts.getRange("A3:L102"));
charts.getRange("H3:I102").format.numberFormat = "#,##0";
charts.getRange("J3:K102").format.numberFormat = "yyyy-mm-dd";
charts.tables.add("A2:L102", true, "ChartEntries");
charts.freezePanes.freezeRows(2);

// API Playlists
const playlists = workbook.worksheets.add("API - Playlists");
playlists.showGridLines = false;
styleTitle(playlists, "A1:N1", "Soundcharts Playlist Export Staging");
playlists.getRange("A2:N2").values = [["Catalog ID", "Track", "ISRC", "UUID", "Platform", "Playlist", "Playlist type", "Country", "Position", "Entry date", "Position date", "Subscriber count", "Reach", "Current flag"]];
styleHeader(playlists.getRange("A2:N2"));
styleBody(playlists.getRange("A3:N102"));
playlists.getRange("I3:I102").format.numberFormat = "#,##0";
playlists.getRange("J3:K102").format.numberFormat = "yyyy-mm-dd";
playlists.getRange("L3:M102").format.numberFormat = "#,##0";
playlists.tables.add("A2:N102", true, "PlaylistEntries");
playlists.freezePanes.freezeRows(2);

// API Radio
const radio = workbook.worksheets.add("API - Radio");
radio.showGridLines = false;
styleTitle(radio, "A1:J1", "Soundcharts Radio Spins Staging");
radio.getRange("A2:J2").values = [["Aired at UTC", "Catalog ID", "Track", "ISRC", "UUID", "Radio", "Country", "City", "Source URL", "Note"]];
styleHeader(radio.getRange("A2:J2"));
styleBody(radio.getRange("A3:J102"));
radio.getRange("A3:A102").format.numberFormat = "yyyy-mm-dd hh:mm";
radio.tables.add("A2:J102", true, "RadioSpins");
radio.freezePanes.freezeRows(2);

// Success Score
const score = workbook.worksheets.add("Success Score");
score.showGridLines = false;
styleTitle(score, "A1:O1", "Success Score");
score.getRange("A2:O2").values = [[
  "Catalog ID",
  "Track",
  "ISRC",
  "Spotify streams",
  "YouTube views",
  "SoundCloud plays",
  "Shazam count",
  "TikTok videos",
  "Playlist reach",
  "Playlist count",
  "Best chart position",
  "Radio spins",
  "Spotify popularity",
  "30d growth %",
  "Success score",
]];
const scoreRows = 60;
for (let r = 3; r < 3 + scoreRows; r += 1) {
  const sourceRow = r;
  score.getRange(`A${r}:C${r}`).formulas = [[
    `=IF('Track ISRCs'!A${sourceRow}="","",'Track ISRCs'!A${sourceRow})`,
    `=IF('Track ISRCs'!C${sourceRow}="","",'Track ISRCs'!C${sourceRow})`,
    `=IF('Track ISRCs'!D${sourceRow}="","",'Track ISRCs'!D${sourceRow})`,
  ]];
  score.getRange(`D${r}:N${r}`).values = [[0, 0, 0, 0, 0, 0, 0, "", 0, 0, 0]];
  score.getRange(`O${r}`).formulas = [[
    `=IF($A${r}="","",ROUND(MIN(100,MIN(35,SUM(D${r}:F${r})/1000000*35)+MIN(5,G${r}/10000*5)+MIN(5,H${r}/10000*5)+MIN(15,I${r}/500000*15)+MIN(5,J${r}/50*5)+IF(K${r}="",0,IF(K${r}>100,0,(101-K${r})/100*15))+MIN(10,L${r}/100*10)+MIN(5,M${r}/100*5)+IF(N${r}<0,0,MIN(10,N${r}*10))),1))`,
  ]];
}
styleHeader(score.getRange("A2:O2"));
styleBody(score.getRange(`A3:O${2 + scoreRows}`));
score.getRange(`D3:J${2 + scoreRows}`).format.numberFormat = "#,##0";
score.getRange(`K3:M${2 + scoreRows}`).format.numberFormat = "#,##0";
score.getRange(`N3:N${2 + scoreRows}`).format.numberFormat = "0.0%";
score.getRange(`O3:O${2 + scoreRows}`).format.numberFormat = "0.0";
score.tables.add(`A2:O${2 + scoreRows}`, true, "SuccessScores");
addNoteBox(score, "Q2:T9", "Manual aggregation area. Fill columns D:N from Soundcharts exports or final platform summaries. Score is 0-100 and currently weights: streams/plays/views, Shazam, TikTok, playlist reach/count, chart position, radio, Spotify popularity, and 30d growth.");
score.freezePanes.freezeRows(2);

// Source Notes
const notes = workbook.worksheets.add("Source Notes");
notes.showGridLines = false;
styleTitle(notes, "A1:D1", "Source Notes");
notes.getRange("A2:D2").values = [["Area", "Source", "URL", "Notes"]];
notes.getRange("A3:D10").values = [
  ["Soundcharts API landing page", "Soundcharts", "https://soundcharts.com/en/api-data-for-music-industry", "API/data coverage overview"],
  ["API docs", "Soundcharts Developers", "https://developers.soundcharts.com/api/getting-started", "Authentication, base URL, quota notes"],
  ["ISRC lookup", "Soundcharts Developers", "https://developers.soundcharts.com/api/reference/song/get-song-by-isrc", "Resolve ISRC to Soundcharts UUID"],
  ["Song metadata", "Soundcharts Developers", "https://developers.soundcharts.com/api/reference/song/get-song-metadata", "Release date, label, distributor, audio fields"],
  ["Audience", "Soundcharts Developers", "https://developers.soundcharts.com/api/reference/song/get-audience", "Streams/plays/views/counts by platform"],
  ["Charts", "Soundcharts Developers", "https://developers.soundcharts.com/api/reference/song/get-chart-entries", "Current/past chart positions"],
  ["Playlists", "Soundcharts Developers", "https://developers.soundcharts.com/api/reference/song/get-playlist-entries", "Playlist positions and subscriber count"],
  ["Radio", "Soundcharts Developers", "https://developers.soundcharts.com/api/reference/song/get-radio-spins", "Radio spin events"],
];
styleHeader(notes.getRange("A2:D2"));
styleBody(notes.getRange("A3:D10"));
notes.tables.add("A2:D10", true, "SourceNotes");
notes.freezePanes.freezeRows(2);

// Basic sizing
const widths = {
  Dashboard: [34, 12, 18, 28, 28, 22, 18, 52],
  "Catalog Releases": [12, 34, 28, 24, 16, 42],
  "Track ISRCs": [12, 34, 28, 18, 24, 38, 16, 24, 42],
  "API - Audience": [14, 12, 28, 18, 38, 16, 18, 14, 24, 45],
  "API - Charts": [12, 28, 18, 38, 16, 28, 12, 12, 12, 14, 14, 14],
  "API - Playlists": [12, 28, 18, 38, 16, 32, 18, 12, 12, 14, 14, 18, 16, 14],
  "API - Radio": [18, 12, 28, 18, 38, 26, 12, 18, 45, 32],
  "Success Score": [12, 28, 18, 16, 16, 16, 14, 14, 16, 14, 14, 14, 16, 14, 14],
  "Source Notes": [24, 24, 62, 44],
};

for (const sheet of workbook.worksheets.items) {
  const sheetWidths = widths[sheet.name] || [];
  sheetWidths.forEach((w, idx) => {
    sheet.getCell(0, idx).format.columnWidth = w;
  });
  const used = sheet.getUsedRange();
  used.format.autofitRows();
}

// Render previews for visual verification.
for (const sheetName of [
  "Dashboard",
  "Catalog Releases",
  "Track ISRCs",
  "API - Audience",
  "API - Charts",
  "API - Playlists",
  "API - Radio",
  "Success Score",
  "Source Notes",
]) {
  const preview = await workbook.render({ sheetName, autoCrop: "all", scale: 1, format: "png" });
  await fs.writeFile(
    path.join(outputDir, `${sheetName.replace(/[^a-z0-9]+/gi, "_").toLowerCase()}.png`),
    new Uint8Array(await preview.arrayBuffer())
  );
}

const summary = await workbook.inspect({
  kind: "table",
  range: "Dashboard!A4:B8",
  include: "values,formulas",
  tableMaxRows: 8,
  tableMaxCols: 3,
});
console.log(summary.ndjson);

const errors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 300 },
  summary: "final formula error scan",
});
console.log(errors.ndjson);

const xlsx = await SpreadsheetFile.exportXlsx(workbook);
const outputPath = path.join(outputDir, "LIR_Recordings_Soundcharts_Tracker.xlsx");
await xlsx.save(outputPath);
console.log(outputPath);
