# RipFlow Desktop — Project Context for Claude

## Czym jest ten projekt

**RipFlow Desktop** to aplikacja desktopowa (Electron + React) automatyzująca workflow druku w środowisku produkcyjnym. Eliminuje ręczną pracę operatorów przy przygotowaniu plików do druku na maszynach PrintFactory.

**Użytkownicy:** operatorzy produkcji (nie deweloperzy)
**Platforma:** Windows (ścieżki sieciowe, backslashe)
**Język komentarzy w kodzie:** angielski

---

## Stack technologiczny

| Warstwa       | Technologia                          |
| ------------- | ------------------------------------ |
| Desktop shell | Electron 40.1.0                      |
| Frontend      | React 19.2.0 + Vite 7.2.4            |
| Routing/state | Zustand 5.0.11 (subscribeWithSelector) |
| Styling       | CSS Modules + `global.css`           |
| Animacje      | GSAP 2.1.2 + @gsap/react 2.1.2       |
| Ikony         | React Icons 5.5.0 (Lucide `Lu*`)     |
| PDF           | pdf-lib 1.17.1 (kopiowanie 1. strony)|
| Dev tooling   | ESLint 9, Concurrently, wait-on      |

---

## Struktura katalogów

```
ripflow-desktop/
├── src/
│   ├── electron/              # Proces główny Electrona (Node.js)
│   │   ├── main.js            # Entry point Electrona, frameless window, startuje zmaksymalizowana
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
│   │       ├── index.js               # Rejestracja wszystkich handlerów
│   │       ├── readFolders.js         # Skanowanie folderów, parsowanie plików
│   │       ├── submitBatch.js         # Orkiestracja submitu batcha
│   │       ├── createBatch.js         # Przenoszenie plików z rollbackiem (transakcja!)
│   │       ├── createXML.js           # Generowanie XML dla PrintFactory
│   │       ├── readPrintedFolder.js   # Odczyt historii batchy z PRINTED/
│   │       ├── batchHistoryHandlers.js # rollback, regenerateXML, deleteBatch
│   │       ├── openPreview.js
│   │       └── openInFolder.js
│   │
│   ├── ui/                    # Frontend React
│   │   ├── App.jsx            # Root komponent, routing widoków, layout
│   │   ├── index.jsx          # Mount React
│   │   ├── store/
│   │   │   └── useStore.jsx   # Zustand store — centralny stan aplikacji
│   │   ├── components/        # Wszystkie komponenty mają własny *.module.css
│   │   │   ├── TitleBar/              # Custom title bar z logo i window controls
│   │   │   ├── NavBar/                # Nawigacja boczna (Print, Batch, Logs, Settings)
│   │   │   ├── DataList/              # Lista plików do druku z checkboxami
│   │   │   ├── DataFilters/           # Filtry (tab, search, sort, print type)
│   │   │   ├── DataPrintSelection/    # Wybór drukarki + przycisk Rip
│   │   │   ├── DataOverviewSection/   # Dwie karty statystyk inbox
│   │   │   │   ├── ProductionOverviewCard/  # Ogólne statystyki + %Cottons/Poly
│   │   │   │   ├── PrintMaterialBreakdownCard/ # Top grupy per materiał
│   │   │   │   └── OthersTooltip/     # Tooltip dla "Others" w breakdown
│   │   │   ├── BatchHistory/          # Widok historii batchy (drzewo day→batch→file)
│   │   │   ├── StartupLoader/         # Progress bar przy ładowaniu
│   │   │   ├── AlertsHost/            # Toast notyfikacje (stacked, auto-dismiss 3s)
│   │   │   ├── Badge/                 # Kolorowe badges (print type, material, status)
│   │   │   ├── ContextMenu/           # Portal-based popup menu
│   │   │   └── DataDaysCounter/       # Pasek wieku pliku (NEW → X DAYS, color scale)
│   │   ├── assets/
│   │   │   └── image/
│   │   │       └── Maake_Logo.webp    # Logo wyświetlane w TitleBar
│   │   └── styles/
│   │       └── global.css             # CSS reset, zmienne, typografia
│   │
│   └── shared/
│       ├── estimatePrintLength.js  # Kalkulacja długości druku (używana w obu procesach)
│       └── printWidths.js          # Stałe wymiarów produktów i szerokości rolek
│
├── .claude/
│   └── CLAUDE.md              # Ten plik
├── changelog.md
├── README.md
├── index.html
├── package.json
├── vite.config.js             # alias @ → ./src/ui, port 5173 (fixed, strictPort)
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
5. Generuje XML dla PrintFactory do folderu workflow na ścieżce sieciowej

---

## Routing / Widoki (App.jsx)

App ma 4 widoki (`activeView` string):

| Widok       | Komponent                              | Status         |
|-------------|----------------------------------------|----------------|
| `"print"`   | DataOverviewSection + DataFilters + DataList | Zaimplementowany |
| `"batch"`   | BatchHistory                           | Zaimplementowany |
| `"logs"`    | PlaceholderView                        | Placeholder    |
| `"settings"`| PlaceholderView                        | Placeholder    |

Nawigacja przez **NavBar** (lewa kolumna). Layout: `TitleBar` (top) + `NavBar` (left) + `content` (center) + `DataPrintSelection` (right, animowany).

---

## Typy produktów i formaty nazw plików

`parseFileName.js` to najważniejszy i najbardziej złożony plik w projekcie (600+ linii).

### Obsługiwane typy:

- **LM** — Linear Meter (`ON####_name_#of#_material_qty(x)_type_XWD...._FF`)
- **FQ** — Fat Quarter (`ON312041_Hannah_Cryer_1of1_Organic Blossom Muslin Gauze_1x_Fat Quarter - 65 x 48 cm_XWD4888..._FF`)
- **SAMPLE** — Próbka (`ON311934_Andrea_Harrison_2of7_Velvet_1x_Sample Print - 20 x 20 cm_XWD52550..._FF`)
- **CUSHION** — Poduszka (`ON311945_Mariama_Janneh_21of22_Custom Square Cushion_material_ 45 x 45 cm _ Print both sides_1_FF_2327`)
- **TEA_TOWEL** — Ściereczka (`ON####_name_#of#_Custom Tea Towel_material_variant_qty_FF_internalId`)

### Parsowanie (mechanizm):
- Tokenizacja: split po `_`, merge tokenów z `(` prefixem
- Detekcja rodzaju: CUSHION (keyword), TEA_TOWEL (keyword), XWD_BASED (hex token), UNKNOWN
- Parsery: `parseCushion()`, `parseTeaTowel()`, `parseXwdBased()`

### Zwracany obiekt:

```js
{
  name, ext, fullPath, dir,             // metadane pliku
  orderId, customerName, xOfY,          // dane zamówienia
  printTypeCode, qty, material, size,   // dane produktu
  width, height,                        // wymiary w mm
  status: "READY" | "INVALID",
  errors: [], warnings: []
}
```

---

## Klasyfikacja materiałów (`getMaterialType.js`)

- `COTTON_MATERIALS`: ~34 materiałów (Cotton Slub, Panama, Organic Leve Cotton, itp.)
- `POLY_MATERIALS`: ~100+ materiałów (różne poliestrowe)
- `getMaterialType(material)` → `"Cottons"` | `"Polyesters"` | `"Unknown"`

| Typ materiału | Drukarka           |
|---------------|--------------------|
| Cottons       | **DGEN**           |
| Polyesters    | **YOKO** lub **YUMI** |
| Unknown       | plik oznaczony jako problematyczny |

---

## Ścieżki storage (`getRootPath.js`)

```
Work:   O:\SPPrintReadyArtwork           ← priorytet jeśli istnieje
Home:   C:\SPPrintReadyArtwork           ← fallback
XML:    \\192.168.0.17\Original_files\SPPrintReadyArtwork
Workflow Cotton: {ROOT}\AUTOMATION_WORKFLOW_COTTON   ← dla DGEN
Workflow Poly:   {ROOT}\AUTOMATION_WORKFLOW_POLY     ← dla YOKO/YUMI
Printed:         {ROOT}\PRINTED\DD-MM-YYYY\PRINTED_HHMMSS-GROUP-PRINTER\
```

---

## Transakcyjne przenoszenie plików (`createBatch.js`)

Przenoszenie plików jest **atomiczne z rollbackiem**:

1. **VALIDATE** — walidacja wejścia
2. **LOCK** — plik `.lock` w folderze źródła (blokada równoległych operacji)
3. **DESTINATION_STRUCTURE** — stworzenie katalogu `PRINTED/DD-MM-YYYY/PRINTED_HHMMSS-GROUP-PRINTER`
4. **COPY** — kopiowanie pliku (tylko 1. strona z PDF via pdf-lib) do katalogu tymczasowego
5. **VERIFY** — weryfikacja rozmiaru skopiowanego pliku
6. **COMMIT** — atomic rename z tmp na ostateczną lokalizację
7. **DELETE_SOURCE** — usunięcie z inbox
8. **ROLLBACK** (na fail) — przywrócenie wszystkiego + czyszczenie temp

---

## IPC API (wszystkie metody `window.api`)

Zdefiniowane w `preload.js`:

```js
// Inbox
window.api.readFolders()                      // skanuj foldery
window.api.onReadFoldersProgress(callback)    // progress { label, percent }
window.api.submitBatch(batch)                 // wyślij batch do druku

// Historia batchy
window.api.readPrintedFolder()                // odczyt PRINTED/ (batch history)
window.api.regenerateXml(batchPath)           // regeneracja XML dla batcha
window.api.rollbackBatch(batchPath)           // przenieś pliki z batcha z powrotem do inbox
window.api.rollbackFile(filePath, batchPath)  // przywróć pojedynczy plik
window.api.deleteBatch(batchPath)             // usuń pusty batch (bez PDFs)
window.api.startBatchWatcher()                // filesystem watcher na PRINTED/
window.api.stopBatchWatcher()                 // zatrzymaj watcher
window.api.onBatchUpdate(callback)            // realtime updates z watchera

// Pliki
window.api.openPreview(filePath)              // otwórz PDF
window.api.openInFolder(filePath)             // otwórz w Explorerze

// Window controls (frameless)
window.api.minimizeWindow()
window.api.maximizeWindow()
window.api.closeWindow()
```

IPC events main→renderer: `read-folders:progress` → `{ label, percent }`, `batch-update` → dane z watchera

---

## Zustand Store (`useStore.jsx`)

Stan aplikacji — `subscribeWithSelector` middleware:

```js
{
  // Filtrowanie
  activeTab: "All" | "Cottons" | "Polyesters",
  searchQuery: "",                               // szuka po orderId/customer/material
  sortOrder: null | "meters_desc" | "date_asc",
  printTypeFilter: null | "LM" | "FQ" | "SAMPLE" | "CUSHION" | "TEA_TOWEL",

  // Dane
  files: [{ printGroup, items: [...], count }],  // wszystkie grupy z inbox
  filteredFiles: [],                             // po filtrach

  // Selekcja
  selectedIds: Set(),                            // Set z ID wybranych plików

  // Status
  isRefreshingFiles: boolean,
  lastFilesRefreshAt: ISO string,

  // Alerty
  alerts: [{ id, type: "Success"|"Warning"|"Error", title, message }],
}
```

### Akcje:

| Akcja | Opis |
|-------|------|
| `setActiveTab(tab)` | Zmiana zakładki materiału + re-filtrowanie |
| `setSearchQuery(query)` | Szukanie, re-filtrowanie |
| `setSortOrder(order)` | `"meters_desc"` / `"date_asc"` / null |
| `setPrintTypeFilter(type)` | Filtr po typie produktu |
| `setFiles(files)` | Ustaw pliki + trigger re-filtrowania |
| `toggleItemSelection(id)` | Toggle z material lock (nie można mieszać Cotton/Poly) |
| `toggleGroupSelection(items)` | Toggle całej grupy |
| `toggleClearSelection()` | Wyczyść selekcję |
| `setAlert(alert)` | Dodaj alert |
| `deleteAlert(id)` | Usuń alert |
| `refreshFiles(options)` | Async load z `window.api.readFolders()` |

**Material lock:** raz zaznaczony materiał blokuje możliwość dodania plików innego typu (Cottons ↔ Polyesters).

Helper wewnętrzny: `applyFilters(files, activeTab, searchQuery, sortOrder, printTypeFilter)`.

---

## Kalkulacja długości druku (`shared/estimatePrintLength.js`)

Funkcje:
- `estimatePrintLength(files)` → `{ totalLengthMm, totalLengthM, fixedTotalLengthM, rowsCount }`
- `estimateMaterialLengthByGroups(groups, materialType)` — dla danego materiału

Algorytm:
1. Grupuje pliki po `width` (szerokość produktu)
2. Sortuje po `height` DESC w każdej grupie
3. Układa produkty w rzędy (nie przekraczając szerokości rolki)
4. Sumuje wysokości rzędów

### Szerokości rolek i marginesy (`shared/printWidths.js`):

| Materiał | Szerokość rolki | Margines |
|----------|-----------------|----------|
| COTTON   | 1420mm (główna), 1370mm, 1270mm (specjalne) | 10mm |
| POLY     | 1550mm          | 5mm      |

**Wymiary stałe produktów:**
- SAMPLE: 220×200mm
- FQ: 670×480mm
- TEA_TOWEL: 700×500mm

> ⚠️ UWAGA: szerokość bawełny to **1420mm** (nie 1450mm — stara dokumentacja była błędna)

---

## Konfiguracja okna Electron (`main.js`)

- **Frameless window** (brak natywnego title bar — własny `TitleBar` komponent)
- **Startuje zmaksymalizowana** (`win.maximize()`)
- DEV: `http://localhost:5173`, PROD: `dist/index.html`
- Context isolation + preload
- IPC: `window:minimize`, `window:maximize`, `window:close`

---

## Komponenty UI — szczegóły kluczowych

### `TitleBar`
Custom title bar z logo (`Maake_Logo.webp`) i przyciskami minimize/close. Wymagany bo okno jest frameless.

### `NavBar`
Lewa kolumna nawigacji. Ikony: Print (`LuPrinter`), Batch (`LuLayers`), Logs (`LuScrollText`) + Settings (`LuSettings`) na dole.

### `BatchHistory`
Najnowszy duży komponent. Wyświetla drzewo `day → batch → files`:
- Wczytuje z `window.api.readPrintedFolder()`
- Real-time updates przez `startBatchWatcher()` / `onBatchUpdate()`
- Filtry: search + printer toggle (DGEN, YOKO, YUMI)
- Akcje na batchu: Regenerate XML, Open in Explorer, Rollback batch
- Akcje na pliku (context menu): Preview PDF, Show in Explorer, Rollback file
- Status batcha: `active` (ma PDFs) | `rolled_back` (puste)
- GSAP animacje na nowych itemach

### `DataOverviewSection`
Container dla dwóch kart statystyk (wyświetlanych w widoku "print"):
- `ProductionOverviewCard` — łączna liczba plików, % Cottons/Poly, metry per materiał, last refresh
- `PrintMaterialBreakdownCard` — top 3 grupy per materiał + collapsible "Others"
- `OthersTooltip` — hover tooltip pokazujący pozostałe grupy

### `AlertsHost`
Toast system: max 3 widoczne, auto-dismiss po 3s, expand on hover, GSAP animations. Kolory: Error (red), Warning (yellow), Success (green).

### `DataDaysCounter`
Progress bar → wiek pliku: "NEW" (zielony) → X DAYS (żółty → pomarańczowy → czerwony) z glow effect.

### `ContextMenu`
Portal-based popup z edge detection, separator support, danger items (czerwone). Zamyka się na click, ESC, backdrop.

### `StartupLoader`
Pełnoekranowy loader przy starcie. Odbiera `read-folders:progress` i animuje pasek postępu (GSAP, 16ms interpolacja).

---

## CSS

**Zmienne globalne (`global.css`):**
```css
--navbar-width: 104px
/* Kolory: white, grey (#f1f1f1, #f7f7f7), black (#303030) */
/* Tekst: primary (#303030), secondary (#616161) */
/* Border: grey (#e5e7eb), black (#303030) */
```

Każdy komponent ma własny `*.module.css` — nie edytuj globalnie bez potrzeby.

---

## Konfiguracja deweloperska

```bash
npm run dev       # Vite (port 5173, strictPort) + Electron równolegle (concurrently + wait-on)
npm run build     # Vite build → dist/
npm run lint      # ESLint (flat config v9)
npm run preview   # Vite preview
```

ESLint: **osobne konfiguracje** dla `src/ui/` (React hooks/refresh rules) i `src/electron/` (Node.js globals). Reguła: brak unused vars z wzorcem `^[A-Z_]`.

Alias `@` w UI → `./src/ui` (np. `import { useStore } from '@/store/useStore'`).

---

## Co jest jeszcze planowane (z README)

- Integracja z PrintFactory Cloud API
- UI do zarządzania materiałami i ustawieniami (widok "settings" — placeholder)
- Real-time śledzenie produkcji (widok "logs" — placeholder)
- Multi-user synchronizacja
- Integracja z Shopify (placeholder w ContextMenu DataList)

---

## Ważne rzeczy do zapamiętania

- Projekt działa **tylko na Windows** (ścieżki sieciowe, Electron shell)
- `parseFileName.js` to serce aplikacji — zmiana wymaga dużej ostrożności
- Przenoszenie plików ma rollback — zawsze testuj ścieżki błędów przy modyfikacji `createBatch.js`
- CSS Modules — każdy komponent ma własny `*.module.css`, nie edytuj globalnie bez potrzeby
- `estimatePrintLength.js` i `printWidths.js` są w `shared/` — używane zarówno w electron jak i w UI
- Okno jest **frameless i startuje zmaksymalizowane** — nie zakładaj stałych wymiarów; TitleBar jest własnym komponentem React
- Szerokość rolki bawełny: **1420mm** (nie 1450mm)
- Material lock w selekcji: nie można mieszać Cottons i Polyesters w jednym batchu
- BatchHistory ma real-time watcher — pamiętaj o `stopBatchWatcher()` przy unmount
- Brak testów automatycznych w projekcie
