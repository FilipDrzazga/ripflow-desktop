# RipFlow Desktop

Electron + React desktop app that drives the print workflow of a textile print shop
running **PrintFactory**. Operators pick artwork out of an inbox on a network share,
the app groups it into a batch, moves the files atomically into a dated `PRINTED`
folder and writes the job XML into PrintFactory's hotfolder. From there it tracks
each file through production until it ships.

**Windows only.** Paths, backslashes, drive letters and SMB behaviour are load-bearing,
not incidental. The app runs 24/7 on several workstations that share one SQLite
database over the network.

## What actually happens

```
INBOX  ->  parse file names  ->  operator selects files + printer
       ->  atomic move into PRINTED + job XML into the hotfolder
       ->  PrintFactory prints
       ->  production stages  ->  shipped
```

1. **Inbox scan** - the app reads material folders under `storagePath`
   (`AUTOMATION_WORKFLOW_COTTON` for the cotton printer, `AUTOMATION_WORKFLOW_POLY`
   for the polyester ones).
2. **Parse** - `parseFileName.js` extracts order id, customer, product type
   (LM / FQ / SAMPLE / CUSHION / TEA_TOWEL), material, quantity and dimensions from
   the PDF file name. A file that cannot be parsed is surfaced as invalid rather than
   guessed at.
3. **Batch** - the operator selects files and a printer. Mixing material classes in
   one batch is blocked.
4. **Move + XML** - `createBatch.js` locks the source folder, copies page 1 of each
   PDF, verifies, then commits by rename into
   `PRINTED\DD-MM-YYYY\PRINTED_HHMMSS-GROUP-PRINTER\`. Any failure rolls back.
   The generated XML lands in `xmlPath`.
5. **Production** - each file walks `printed -> heatpress -> qc -> packed -> shipped`,
   with a `to_sewing` branch. Barcode scans at a workstation advance whole batches
   according to that station's role.
6. **Rollback** - the only destructive action. It physically moves the file back to
   the inbox and records a reason; analytics are built from those reasons.

## Stack

| Layer | Tech |
| --- | --- |
| Shell | Electron 40, frameless window |
| UI | React 19 + Vite 7 (dev server on port 5173, strict) |
| State | Zustand 5 |
| Styling | CSS Modules + a global stylesheet |
| DB | better-sqlite3, `ripflow.db` on the **shared** network path |
| Per-machine settings | electron-store, `%APPDATA%\ripflow-desktop\config.json` |
| PDF | pdf-lib (page-1 copy), pdfjs-dist **v4** (preview - v5 breaks in Electron 40) |
| XML | hand-rolled string templates out, fast-xml-parser in (RIP error ingest) |

Plain JavaScript, no TypeScript. Tests run on Vitest.

## Repo layout

```
src/electron/     main process: window, IPC handlers, helpers (file moves, DB, parsing)
src/ui/           renderer: components, Zustand store, services (the IPC wrapper layer)
src/shared/       code used by both sides (print-length estimation, constants)
scripts/golden/   offline XML regression harness
golden/           70 anonymised baseline XML files + their inputs
profiles/         exported fabric catalogue used by the harness
```

Renderer code never calls `window.api` directly - everything goes through
`src/ui/services/`.

## Configuration model

Two tiers, and the split is deliberate:

- **electron-store** holds the machine's own **identity**: storage and XML paths,
  workstation name, workstation role, label printer. Per machine, never shared.
- **`ripflow.db`** holds the shop's **rules**: fabric catalogue, rollback reasons and
  the shop profile (printers, feature flags, scan rules, sewing companies). One row,
  read by every station.

Rules and identity join by key and are never merged. Putting the role into the shared
profile would let one row decide what a specific machine on the floor is; putting the
rules into electron-store would let every station invent its own workflow.

## Getting started

```bash
npm install
npm run rebuild     # native rebuild of better-sqlite3 against Electron
npm run dev         # Vite + Electron together
```

`npm run dev` is safe to run on a production workstation. The app detects that it is
running from the repo and relocates `userData`, storage, XML and custom-order folders
into `<home>\ripflow-sandbox`; it refuses to start if any path setting still points
outside that sandbox. Label printing and the auto-updater are no-ops there.

A local sandbox does **not** reproduce SMB's blindness to another host's writes - a
local `fs.watch` sees everything, a network one does not. Cross-station behaviour has
to be verified on real stations.

## Build

```bash
npm run build       # renderer only, into dist/
```

`npm run build:dist` builds the installer **and publishes it to GitHub Releases
immediately**. For a pilot build that goes nowhere, build by hand:

```bash
npm run build
npx dotenv -e .env -- electron-builder --win --publish never
```

## Quality gates

Run all three before shipping anything. The expected result is "green", not a number -
counts are recorded with the command that produced them in `PRODUCTIZATION.md`.

```bash
npm run test        # Vitest
npm run lint        # eslint . --max-warnings 0
ELECTRON_RUN_AS_NODE=1 ./node_modules/.bin/electron scripts/golden/compare-golden.mjs
```

The golden net renders 70 real (anonymised) batches through the production XML builder
and diffs the output byte for byte. It is offline and never opens a live database.
**Never regenerate the baseline to make a diff disappear** - a difference is a finding.
Decide fix-or-regression first, by hand, and re-capture only once the new value is
provably the correct one.

An existing test that starts failing is a stop signal, not something to edit. Test
counts may only go up, and never because an assertion was rewritten.

## Where the documentation lives

One question per file. If something belongs in two of them, the question was wrong.

| File | Answers |
| --- | --- |
| `README.md` | what this program is and how to run it |
| `.claude/CLAUDE.md` | how the code works - architecture reference |
| `PRODUCTIZATION.md` | what is left to do, and why |

Deployment procedure, per-client infrastructure and the live project state are kept
outside this repository on purpose.
