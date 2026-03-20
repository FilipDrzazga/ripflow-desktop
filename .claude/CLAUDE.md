# RipFlow Desktop — Project Context for Claude

## Czym jest ten projekt

**RipFlow Desktop** to aplikacja desktopowa (Electron + React) automatyzująca workflow druku w środowisku produkcyjnym. Eliminuje ręczną pracę operatorów przy przygotowaniu plików do druku na maszynach PrintFactory.

**Użytkownicy:** operatorzy produkcji (nie deweloperzy)
**Platforma:** Windows (ścieżki sieciowe, backslashe)
**Język komentarzy w kodzie:** angielski

---

## Stack technologiczny

| Warstwa       | Technologia                     |
| ------------- | ------------------------------- |
| Desktop shell | Electron 40.1.0                 |
| Frontend      | React 19.2.0 + Vite 7.2.4       |
| Routing/state | Zustand 5.0.11                  |
| Styling       | CSS Modules + `global.css`      |
| Animacje      | GSAP 2.1.2                      |
| Ikony         | React Icons 5.5.0               |
| Dev tooling   | ESLint 9, Concurrently, wait-on |

---

## Struktura katalogów

```
ripflow-desktop/
├── src/
│   ├── electron/              # Proces główny Electrona (Node.js)
│   │   ├── main.js            # Entry point Electrona, okno 1600x1300, non-resizable
│   │   ├── preload.js         # Bezpieczny most IPC → window.api
│   │   ├── helpers/           # Funkcje pomocnicze (pure logic)
│   │   │   ├── parseFileName.js       # Parsowanie nazw plików (600+ linii, główna logika!)
│   │   │   ├── getMaterialType.js     # Klasyfikacja materiału (bawełna/poliester)
│   │   │   ├── getRootPath.js         # Rozwiązywanie ścieżek storage
│   │   │   ├── createBatchIds.js      # Generowanie ID batcha
│   │   │   ├── getFileAgeInDays.js
│   │   │   ├── isPDF.js
│   │   │   └── validateStoragePath.js
│   │   └── ipc/               # Handlery IPC (komunikacja main ↔ renderer)
│   │       ├── index.js               # Rejestracja handlerów
│   │       ├── readFolders.js         # Skanowanie folderów, parsowanie plików
│   │       ├── submitBatch.js         # Orkiestracja submitu batcha
│   │       ├── createBatch.js         # Przenoszenie plików z rollbackiem (transakcja!)
│   │       ├── createXML.js           # Generowanie XML dla PrintFactory
│   │       ├── openPreview.js
│   │       └── openInFolder.js
│   │
│   ├── ui/                    # Frontend React
│   │   ├── App.jsx            # Root komponent
│   │   ├── index.jsx          # Mount React
│   │   ├── store/
│   │   │   └── useStore.jsx   # Zustand store — centralny stan aplikacji
│   │   ├── components/        # Wszystkie komponenty mają własny *.module.css
│   │   │   ├── DataList/
│   │   │   ├── DataFilters/
│   │   │   ├── DataPrintSelection/
│   │   │   ├── DataOverviewSection/
│   │   │   ├── StartupLoader/
│   │   │   ├── AlertsHost/
│   │   │   ├── Badge/
│   │   │   ├── ContextMenu/
│   │   │   └── DataDaysCounter/
│   │   └── styles/
│   │       └── global.css
│   │
│   └── shared/
│       └── estimatePrintLength.js  # Kalkulacja długości druku (używana w obu procesach)
│
├── .claude/
│   └── CLAUDE.md              # Ten plik
├── index.html
├── package.json
├── vite.config.js             # alias @ → ./src/ui, port 5173 (fixed)
└── eslint.config.js           # osobne reguły dla ui/ i electron/
```

---

## Główny przepływ pracy (Workflow)

```
INBOX → PARSING FILES NAME → DISPLAY UI → SELECTING JOBS/PRINTER → CREATING BATCH/XML → CREATING FOLDERS → TAKING XML FILE BY WORKFLOW PRINTFACTORY → PRINT
```

1. Aplikacja skanuje folder `O:\SPPrintReadyArtwork` (fallback: `C:\SPPrintReadyArtwork`)
2. Parsuje nazwy plików PDF → wyciąga metadane (typ produktu, materiał, ilość, wymiary)
3. Operator wybiera pliki + drukarkę → submit batcha
4. Aplikacja przenosi pliki atomicznie (temp dir → rename) z rollbackiem przy błędzie
5. Generuje XML dla PrintFactory do ścieżki sieciowej `\\192.168.0.17\...`

---

## Typy produktów i formaty nazw plików

`parseFileName.js` to najważniejszy i najbardziej złożony plik w projekcie (600+ linii).

### Obsługiwane typy:

- **LM** — Linear Meter (`ON####_name_#of#_material_qty(x)_type_XWD...._FF`)
- **FQ** — Fat Quarter (`ON312041_Hannah_Cryer_1of1_Organic Blossom Muslin Gauze_1x_Fat Quarter - 65 x 48 cm_XWD4888154804514bdf919231e37c82e6b3_FF`)
- **SAMPLE** — Próbka (`ON311934_Andrea_Harrison_2of7_Velvet_1x_Sample Print - 20 x 20 cm_XWD52550d4ff9cf4dae9cca78e09c843322_FF`)
- **CUSHION** — Poduszka (`ON311945_Mariama_Janneh_21of22_Custom Square Cushion_Organic Leve Cotton Panama Natural _ 45 x 45 cm _ Print both sides_1_FF_2327`)
- **TEA_TOWEL** — Ściereczka (`ON####_name_#of#_Custom Tea Towel_material_variant_qty_FF_internalId`)

### Zwracany obiekt:

```js
{
  name, ext, fullPath, dir,           // metadane pliku
  orderId, customerName, xOfY,        // dane zamówienia
  printTypeCode, qty, material, size, // dane produktu
  width, height,                      // wymiary w mm
  status: "READY" | "INVALID",
  errors: [], warnings: []
}
```

---

## Klasyfikacja materiałów

`getMaterialType.js` zawiera ~70 materiałów bawełnianych i ~130 poliestrowych.

- **Cottons** → drukarka **DGEN**
- **Polyesters** → drukarka **YOKO** lub **YUMI**
- **Unknown** → plik oznaczony jako problematyczny

---

## Ścieżki storage (getRootPath.js)

```
Work:   O:\SPPrintReadyArtwork
Home:   C:\SPPrintReadyArtwork
XML:    \\192.168.0.17\Original_files\SPPrintReadyArtwork
```

---

## Transakcyjne przenoszenie plików (createBatch.js)

Przenoszenie plików jest **atomiczne z rollbackiem**:

1. Walidacja wejścia
2. Lock pliku (blokada równoległych operacji)
3. Stworzenie katalogu tymczasowego
4. Kopiowanie + weryfikacja
5. Atomic rename do lokalizacji docelowej
6. Usunięcie źródeł

Docelowy katalog: `PRINTED/DD-MM-YYYY/PRINTED_HHMMSS-GROUP-PRINTER/`

---

## IPC API (window.api w renderer)

```js
window.api.readFolders(); // skanuj foldery
window.api.onReadFoldersProgress(callback); // progress updates
window.api.submitBatch(batch); // wyślij batch do druku
window.api.openPreview(filePath); // otwórz PDF
window.api.openInFolder(filePath); // otwórz Explorer
```

IPC events main→renderer: `read-folders:progress` → `{ label, percent }`

---

## Zustand Store (useStore.jsx)

Główny stan aplikacji:

- `files` — wszystkie pliki zgrupowane po `printGroup`
- `filteredFiles` — pliki przefiltrowane po aktywnej zakładce materiału
- `selectedIds` — Set wybranych ID plików
- `alerts` — toast notyfikacje
- `activeTab` — "All" | "Cottons" | "Polyesters"
- `isRefreshingFiles` — stan ładowania
- `lastFilesRefreshAt` — timestamp ostatniego odświeżenia

---

## Kalkulacja długości druku (estimatePrintLength.js)

Używana w obu procesach (shared/). Oblicza metry materiału potrzebne do batcha:

- Bawełna: szerokość 1450mm, margines 10mm
- Poliester: szerokość 1550mm, margines 5mm
- Zwraca metry z dokładnością do 2 miejsc

---

## Konfiguracja deweloperska

```bash
npm run dev       # Vite (port 5173) + Electron równolegle
npm run build     # Vite build → dist/
npm run lint      # ESLint
```

ESLint ma **osobne konfiguracje** dla `src/ui/` (React rules) i `src/electron/` (Node rules).

Alias `@` w UI → `./src/ui` (np. `import { useStore } from '@/store/useStore'`).

---

## Co jest jeszcze planowane (z README)

- Integracja z PrintFactory Cloud API
- UI do zarządzania materiałami i ustawieniami
- Real-time śledzenie produkcji
- Multi-user synchronizacja
- Integracja z Shopify (placeholder już w UI — ContextMenu)

---

## Ważne rzeczy do zapamiętania

- Projekt działa **tylko na Windows** (ścieżki sieciowe, Electron shell)
- `parseFileName.js` to serce aplikacji — zmiana wymaga dużej ostrożności
- Przenoszenie plików ma rollback — zawsze testuj ścieżki błędów przy modyfikacji `createBatch.js`
- CSS Modules — każdy komponent ma własny `*.module.css`, nie edytuj globalnie bez potrzeby
- `estimatePrintLength.js` jest w `shared/` — używana zarówno w electron jak i w UI
- Okno aplikacji jest **non-resizable** (1600x1300) — nie projektuj UI dla innych rozmiarów
