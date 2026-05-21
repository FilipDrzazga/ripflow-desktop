-use context7

# RipFlow Desktop — Project Context for Claude

## Czym jest ten projekt

**RipFlow Desktop** to aplikacja desktopowa (Electron + React) automatyzująca workflow druku w środowisku produkcyjnym. Eliminuje ręczną pracę operatorów przy przygotowaniu plików do druku na maszynach PrintFactory.

**Użytkownicy:** operatorzy produkcji (nie deweloperzy)
**Platforma:** Windows (ścieżki sieciowe, backslashe)
**Język komentarzy w kodzie:** angielski

---

## Stack technologiczny

| Warstwa       | Technologia                                   |
| ------------- | --------------------------------------------- |
| Desktop shell | Electron 40.1.0                               |
| Frontend      | React 19.2.0 + Vite 7.2.4                     |
| Routing/state | Zustand 5.0.11 (subscribeWithSelector)        |
| Styling       | CSS Modules + `global.css`                    |
| Animacje      | GSAP 2.1.2 + @gsap/react 2.1.2                |
| Ikony         | React Icons 5.5.0 (Lucide `Lu*`)              |
| PDF           | pdf-lib 1.17.1 (kopiowanie 1. strony)         |
| PDF preview   | pdfjs-dist **v4** (renderowanie 1. strony do canvas → base64 JPEG) |
| Ustawienia    | electron-store (persystentne JSON w userData) |
| Baza danych   | better-sqlite3 (logi + held files, plik w storagePath) |
| Dev tooling   | ESLint 9, Concurrently, wait-on               |

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
│   │   │   ├── getSettings.js         # Odczyt/zapis ustawień przez electron-store (storagePath, xmlPath, workstationName)
│   │   │   ├── getRootPath.js         # Rozwiązywanie ścieżek storage (czyta z getSettings)
│   │   │   ├── db.js                  # SQLite (better-sqlite3): logi sesji + held_files; plik ripflow.db w storagePath
│   │   │   ├── createBatchIds.js      # Generowanie ID batcha
│   │   │   ├── ipcError.js            # Shared helper: toIpcError(err, stage, title)
│   │   │   ├── getFileAgeInDays.js
│   │   │   ├── isPDF.js
│   │   │   └── validateStoragePath.js # assertStorageFilePath — walidacja ścieżek vs storage root
│   │   └── ipc/               # Handlery IPC (komunikacja main ↔ renderer)
│   │       ├── index.js               # Rejestracja wszystkich handlerów; zawiera też file:read-buffer
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
│   │   ├── hooks/
│   │   │   └── usePdfPreview.js       # Hook: renderowanie PDF → JPEG przez pdfjs-dist, cache w Map, nawigacja
│   │   ├── constants/
│   │   │   └── printerColors.js       # PRINTER_COLORS: { DGEN, YOKO, YUMI } → { bg, color }
│   │   ├── utils/
│   │   │   └── notify.js              # Centralny helper: alert + log entry jednocześnie
│   │   ├── components/        # Wszystkie komponenty mają własny *.module.css
│   │   │   ├── PdfPreviewModal/       # Modal podglądu PDF (portal, blur backdrop, GSAP fade, nawigacja ←→)
│   │   │   ├── TitleBar/              # Custom title bar z logo i window controls
│   │   │   ├── NavBar/                # Nawigacja boczna (Print, Batch, Logs, Settings)
│   │   │   ├── DataList/              # Lista plików do druku z checkboxami
│   │   │   ├── DataFilters/           # Filtry (tab, search, sort, print type)
│   │   │   ├── DataPrintSelection/    # Wybór drukarki + przycisk Rip
│   │   │   ├── DataOverviewSection/   # Trzy karty statystyk inbox (widok "print")
│   │   │   │   ├── ProductionOverviewCard/  # Ogólne statystyki + %Cottons/Poly
│   │   │   │   ├── PrintMaterialBreakdownCard/ # Top grupy per materiał
│   │   │   │   └── OthersTooltip/     # Tooltip dla "Others" w breakdown
│   │   │   ├── LastBatchCard/         # Karta ostatniego batcha (renderowana przez DataOverviewSection)
│   │   │   ├── BatchHistory/          # Widok historii batchy (drzewo day→batch→file)
│   │   │   ├── SessionLogs/           # Widok logów sesji (search, type filter, expand/collapse)
│   │   │   ├── Settings/              # Widok ustawień — wybór ścieżek storage i XML
│   │   │   ├── StartupLoader/         # Progress bar przy ładowaniu
│   │   │   ├── AlertsHost/            # Toast notyfikacje (stacked, auto-dismiss 3s)
│   │   │   ├── Badge/                 # Kolorowe badges — komponent istnieje, ale aktualnie nieużywany w DataList
│   │   │   └── ContextMenu/           # Portal-based popup menu
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

1. Aplikacja skanuje folder ustawiony w electron-store (domyślnie `O:\SPPrintReadyArtwork`)
2. Parsuje nazwy plików PDF → wyciąga metadane (typ produktu, materiał, ilość, wymiary)
3. Operator wybiera pliki + drukarkę → submit batcha
4. Aplikacja przenosi pliki atomicznie (temp dir → rename) z rollbackiem przy błędzie
5. Generuje XML dla PrintFactory do folderu workflow na ścieżce sieciowej

---

## Routing / Widoki (App.jsx)

App ma 4 widoki (`activeView` string):

| Widok        | Komponent                                    | Status           |
| ------------ | -------------------------------------------- | ---------------- |
| `"print"`    | DataOverviewSection + DataFilters + DataList | Zaimplementowany |
| `"batch"`    | BatchHistory                                 | Zaimplementowany |
| `"logs"`     | SessionLogs                                  | Zaimplementowany |
| `"settings"` | Settings                                     | Zaimplementowany |

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
  file: { name, ext, dir, fullPath },   // metadane pliku — UWAGA: zagnieżdżone pod `file`, nie na top-level
  orderId, customerName, xOfY,          // dane zamówienia
  printTypeCode, printType,             // kod ("LM","FQ","SAMPLE","TEA_TOWEL","CUSHION") + label ("Linear Meter" itd.)
  qty, material, size,                  // dane produktu
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

| Typ materiału | Drukarka                           |
| ------------- | ---------------------------------- |
| Cottons       | **DGEN**                           |
| Polyesters    | **YOKO** lub **YUMI**              |
| Unknown       | plik oznaczony jako problematyczny |

---

## Ścieżki storage (`getRootPath.js` + `getSettings.js`)

Ścieżki są **persystowane przez electron-store** (`src/electron/helpers/getSettings.js`) i edytowalne przez użytkownika w widoku Settings. `getRootPath.js` czyta je z `getSettings()` — brak hardkodowanych stałych.

**Domyślne wartości:**

```
storagePath:      O:\SPPrintReadyArtwork
xmlPath:          \\192.168.0.17\Original_files\SPPrintReadyArtwork
workstationName:  os.hostname()  ← automatycznie przy pierwszym uruchomieniu
```

**Pochodne ścieżki (wyliczane w kodzie):**

```
Workflow Cotton: {storagePath}\AUTOMATION_WORKFLOW_COTTON   ← dla DGEN
Workflow Poly:   {storagePath}\AUTOMATION_WORKFLOW_POLY     ← dla YOKO/YUMI
Printed:         {storagePath}\PRINTED\DD-MM-YYYY\PRINTED_HHMMSS-GROUP-PRINTER\
```

Dane są zapisywane w `%APPDATA%\ripflow-desktop\config.json` (Electron userData).

---

## Baza danych SQLite (`helpers/db.js`)

Persystencja logów i held files między sesjami. Plik `ripflow.db` leży w `getStorageRootPath()` (nie w userData).

**Eksportowane funkcje:**

| Funkcja               | Opis                                                         |
| --------------------- | ------------------------------------------------------------ |
| `initDb()`            | Inicjalizacja DB, CREATE TABLE, ALTER TABLE (migracja kolumn)|
| `insertLog(log)`      | Wstawia wpis do tabeli `logs`                                |
| `getAllLogs()`         | Zwraca wszystkie logi posortowane timestamp DESC             |
| `clearAllLogs()`      | Usuwa wszystkie wpisy z `logs`                               |
| `holdFile(fileId)`    | Dodaje fileId do `held_files`                                |
| `unholdFile(fileId)`  | Usuwa fileId z `held_files`                                  |
| `getHeldFiles()`      | Zwraca `Set<string>` z wstrzymanymi ID plików                |

**Schemat tabeli `logs`:**

```sql
CREATE TABLE IF NOT EXISTS logs (
  id TEXT PRIMARY KEY,
  timestamp TEXT,
  type TEXT,
  stage TEXT,
  code TEXT,
  message TEXT,
  detail TEXT,       -- JSON stringified lub null
  workstation TEXT   -- os.hostname() stacji roboczej; NULL w starych logach
)
```

**Schemat tabeli `held_files`:**

```sql
CREATE TABLE IF NOT EXISTS held_files (
  file_id TEXT PRIMARY KEY
)
```

**Migracja schematu:** `initDb()` po CREATE TABLE wykonuje `ALTER TABLE logs ADD COLUMN workstation TEXT` w try/catch — bezpieczne dla istniejących baz (błąd "column already exists" jest ignorowany).

**Wołany przez:** `ipc/index.js` → `registerIpcHandlers()` wywołuje `initDb()` jako pierwsze. Wszystkie handlery `submit-batch`, `regenerate-xml`, `rollback-batch-history`, `rollback-file-history`, `delete-batch` zapisują log przez `insertLog()` z polem `workstation: getSettings().workstationName`.

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
window.api.readFolders(); // skanuj foldery
window.api.onReadFoldersProgress(callback); // progress { label, percent }
window.api.submitBatch(batch); // wyślij batch do druku

// Historia batchy
window.api.readPrintedFolder(); // odczyt PRINTED/ (batch history)
window.api.regenerateXml(batchPath); // regeneracja XML dla batcha
window.api.rollbackBatch(batchPath); // przenieś pliki z batcha z powrotem do inbox
window.api.rollbackFile(filePath, batchPath); // przywróć pojedynczy plik
window.api.deleteBatch(batchPath); // usuń pusty batch (bez PDFs)
window.api.startBatchWatcher(); // filesystem watcher na PRINTED/
window.api.stopBatchWatcher(); // zatrzymaj watcher
window.api.onBatchUpdate(callback); // realtime updates z watchera

// Ustawienia
window.api.getSettings(); // zwraca { success, settings: { storagePath, xmlPath, workstationName } }
window.api.setSettings({ storagePath, xmlPath, workstationName? }); // zapisuje po async walidacji fs.promises.access (paths only); zwraca { success, error? }
window.api.selectFolder(); // natywny dialog wyboru folderu; zwraca { success, canceled, path }

// Logi (SQLite)
window.api.getLogs();    // zwraca { success, data: log[] } — wszystkie logi z DB
window.api.clearLogs();  // usuwa wszystkie logi z DB

// Held files (SQLite)
window.api.getHeldFiles();       // zwraca { success, data: fileId[] }
window.api.holdFile(fileId);     // dodaje fileId do held_files
window.api.unholdFile(fileId);   // usuwa fileId z held_files

// Pliki — odczyt bufora (używane przez usePdfPreview)
window.api.readFileBuffer(filePath); // zwraca { success, data: base64string } — czyta plik przez main process

// Dialogi
window.api.showConfirm(message); // natywny dialog potwierdzenia Electrona; zwraca boolean

// Pliki
window.api.openPreview(filePath); // otwórz PDF
window.api.openInFolder(filePath); // otwórz w Explorerze

// Window controls (frameless)
window.api.minimizeWindow();
window.api.maximizeWindow(); // wyeksponowane w API, ale nie podpięte do przycisku UI — okno startuje zmaksymalizowane przez win.maximize()
window.api.closeWindow();
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

  // Dane inbox
  files: [{ printGroup, items: [...], count }],  // wszystkie grupy z inbox
  filteredFiles: [],                             // po filtrach

  // Selekcja
  selectedIds: Set(),                            // Set z ID wybranych plików

  // Status
  isRefreshingFiles: boolean,
  lastFilesRefreshAt: ISO string,

  // Historia batchy
  batchDays: [],                                 // dane z PRINTED/ (tree day→batch→files)
  isBatchSubmitting: boolean,                    // true podczas submit batcha (używane w LastBatchCard)

  // Logi sesji
  logs: [{ id, timestamp, type, stage, code, message, detail, workstation }],

  // Held files (pliki wstrzymane przez operatora)
  heldIds: Set(),                                // Set z ID wstrzymanych plików

  // Alerty
  alerts: [{ id, type: "Success"|"Warning"|"Error", title, message }],
}
```

### Akcje:

| Akcja                         | Opis                                                   |
| ----------------------------- | ------------------------------------------------------ |
| `setActiveTab(tab)`           | Zmiana zakładki materiału + re-filtrowanie             |
| `setSearchQuery(query)`       | Szukanie, re-filtrowanie                               |
| `setSortOrder(order)`         | `"meters_desc"` / `"date_asc"` / null                  |
| `setPrintTypeFilter(type)`    | Filtr po typie produktu                                |
| `setFiles(files)`             | Ustaw pliki + trigger re-filtrowania                   |
| `toggleItemSelection(id)`     | Toggle z material lock (nie można mieszać Cotton/Poly) |
| `toggleGroupSelection(items)` | Toggle całej grupy                                     |
| `toggleClearSelection()`      | Wyczyść selekcję                                       |
| `setAlert(alert)`             | Dodaj alert                                            |
| `deleteAlert(id)`             | Usuń alert                                             |
| `refreshFiles(options)`       | Async load z `window.api.readFolders()`                |
| `setBatchDays(days)`          | Ustaw dane historii batchy                             |
| `refreshBatchDays()`          | Async load z `window.api.readPrintedFolder()`          |
| `setIsBatchSubmitting(val)`   | Flaga submitu (pokazuje spinner w LastBatchCard)       |
| `addLog(log)`                 | Dodaj wpis do logów sesji (tylko in-memory)            |
| `clearLogs()`                 | Wyczyść logi in-memory + wywołaj `window.api.clearLogs()` |
| `loadLogsFromDb()`            | Wczytaj logi z SQLite do store (przy starcie)          |
| `loadHeldFiles()`             | Wczytaj held file IDs z SQLite do `heldIds`            |
| `toggleHold(fileId)`          | Hold/unhold pliku — sync z SQLite i lokalnym Set       |

**Material lock:** raz zaznaczony materiał blokuje możliwość dodania plików innego typu (Cottons ↔ Polyesters).

**Eksportowany helper:** `getLastBatch(batchDays)` — zwraca `{ batch, day }` dla ostatniego aktywnego batcha (lub ostatniego rolled_back jeśli brak aktywnych); używany przez `LastBatchCard`.

Helper wewnętrzny: `applyFilters(files, activeTab, searchQuery, sortOrder, printTypeFilter)`.

---

## `notify.js` — centralny helper notyfikacji

`src/ui/utils/notify.js` — używany przez `DataPrintSelection`, `BatchHistory`, `Settings`, `DataList`.

```js
notify({ type, title, message }, { stage, code, detail });
```

Jednym wywołaniem: dodaje **alert** (toast) do store ORAZ **log entry** do SessionLogs. Zawsze używaj `notify()` zamiast `setAlert()` bezpośrednio — inaczej błędy nie trafią do widoku "logs".

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

| Materiał | Szerokość rolki (estymacja)                 | Margines |
| -------- | ------------------------------------------- | -------- |
| COTTON   | 1420mm (główna), 1370mm, 1270mm (specjalne) | 10mm     |
| POLY     | 1550mm                                      | 5mm      |

> ⚠️ **Uwaga na dwie różne szerokości dla POLY:**
>
> - `LM_ROLL_POLY = 1550mm` — szerokość rolki używana do **kalkulacji długości druku** (estymacja)
> - `LM_XML_POLY = 1420mm` — wartość wpisywana do **XML dla PrintFactory** (`<Width>`) = szerokość tkaniny
>   Te wartości są różne celowo. Nie zamieniaj ich miejscami.

**Wymiary stałe produktów:**

- SAMPLE: 220×200mm
- FQ: 670×480mm
- TEA_TOWEL: 700×500mm

> ⚠️ UWAGA: szerokość rolki bawełny do estymacji to **1420mm** (nie 1450mm — stara dokumentacja była błędna)

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

Wyświetla drzewo `day → batch → files`:

- Wczytuje z `window.api.readPrintedFolder()`
- Real-time updates przez `startBatchWatcher()` / `onBatchUpdate()` (debounce 200ms)
- Filtry: search + printer toggle (DGEN, YOKO, YUMI)
- Akcje na batchu: Regenerate XML, Open in Explorer, Rollback batch
- Akcje na pliku (context menu): Preview PDF, Show in Explorer, Rollback file
- Status batcha: `active` (ma PDFs) | `rolled_back` (puste)
- GSAP animacje na nowych itemach
- Po rollbacku **całego batcha** watcher wysyła `"removed"` event (nie trzeba ręcznego loadData). Po rollbacku **pojedynczego pliku** watcher nie emituje eventu → loadData() wymagane.

### `DataOverviewSection`

Container dla **trzech kart statystyk** (wyświetlanych w widoku "print"):

- `ProductionOverviewCard` — łączna liczba plików, % Cottons/Poly, metry per materiał, last refresh
- `PrintMaterialBreakdownCard` — top 3 grupy per materiał + collapsible "Others"
- `LastBatchCard` — ostatni batch (plik: `src/ui/components/LastBatchCard/`, nie wewnątrz `DataOverviewSection/`)
- `OthersTooltip` — hover tooltip pokazujący pozostałe grupy (wewnątrz `PrintMaterialBreakdownCard/`)

### `SessionLogs`

Widok logów sesji (`src/ui/components/SessionLogs/`):

- Wyświetla wszystkie wpisy z `logs` w Zustand store
- Filtry: search (message/code) + type filter (All/Error/Warning/Success/Info)
- Klik na wpis → expand z JSON detailami
- Przycisk "Clear session" czyści wszystkie logi
- Logi są zapisywane przez akcje `addLog()` w store oraz przez `notify()` helper
- Każdy wpis wyświetla `workstation_pill` (obok `stage_pill`) gdy pole `workstation` jest niepuste

### `AlertsHost`

Toast system: max 3 widoczne, auto-dismiss po 3s, expand on hover, GSAP animations. Kolory: Error (red), Warning (yellow), Success (green).

### `DataList`

Lista plików inbox z checkboxami. Każdy wiersz renderuje pięć tagów o **stałej szerokości** (wyrównanie kolumnowe):

| Slot | Klasa CSS | Szerokość | Treść |
|------|-----------|-----------|-------|
| Wiek | `tag_age` | 54px | `LuClock` + "New" / "Xd" |
| Rozmiar | `tag_size` | 74px | `LuFile` + "X.X MB" |
| Typ druku | `tag_type` | 82px | ikona + skrót |
| Materiał | `tag_material` | 100px | ikona + nazwa |
| Status | `tag_status` | 38px | sama ikona |

Każdy slot jest zawsze renderowany (pusty gdy brak danych) — gwarantuje wyrównanie między wierszami. Zawartość wyśrodkowana (`justify-content: center`).

**Skale kolorów tagu wieku** (`item.diffDays`):
- 0–1 dni → `#3B6D11` (zielony)
- 2 dni → `#D4860E` (jasny pomarańcz)
- 3 dni → `#C05208` (ciemniejszy pomarańcz)
- 4+ dni → `#A32D2D` (czerwony)

**Lookup tables (module-level constants):**
- `PRINT_TYPE_MAP`: `LM → LuRuler`, `FQ → LuScissors`, `SAMPLE → LuFlaskConical`, `TEA_TOWEL → LuUtensils`, `CUSHION → LuSofa`
- `MATERIAL_MAP`: `Cottons → LuLeaf`, `Polyesters → PiPolygon` (react-icons/pi), `Unknown → LuCircleHelp`
- `STATUS_MAP`: `READY → LuCircleCheck`, `INVALID → LuCircleX`, `WARNING → LuTriangleAlert`

**Warianty wiersza:** `list_item_invalid` (czerwony border + muted filename), `list_item_warning` (amber border), `list_item_held` (czerwone tło).

**Dane z `item`:** `item.diffDays`, `item.fileSizeBytes`, `item.printTypeCode`, `item.materialType`, `item.status`, `item.file.name`, `item.file.fullPath`.

### `ContextMenu`

Portal-based popup z edge detection, separator support, danger items (czerwone). Zamyka się na click, ESC, backdrop.

### `Settings`

Widok ustawień (zakładka "settings" w NavBar). Dwie osobne karty z osobnymi przyciskami Save:

**Karta "Storage Paths":**
- **Storage Path (INBOX)** — lokalny folder skanowany przez `readFolders`
- **XML Workflow Path** — ścieżka sieciowa do której trafiają pliki XML dla PrintFactory
- Przycisk Browse otwiera natywny dialog (`dialog:select-folder`)
- Save waliduje oba pola przez `fs.promises.access` (async) po stronie main procesu przed zapisem

**Karta "Workstation":**
- **Workstation Name** — identyfikator tego komputera w logach współdzielonych
- Domyślna wartość: `os.hostname()` (ustawiana przy pierwszym uruchomieniu przez electron-store)
- Save wywołuje `window.api.setSettings({ storagePath, xmlPath, workstationName })` — przekazuje aktualne wartości obu ścieżek aby nie nadpisać ich nullem
- `workstationName` nie podlega walidacji `fs.promises.access` (to nie jest ścieżka)

Wynik obu kart przez `notify()` (Success/Error toast).

### `StartupLoader`

Pełnoekranowy loader przy starcie. Odbiera `read-folders:progress` i animuje pasek postępu (GSAP).

---

## CSS

**Zmienne globalne (`global.css`):**

```css
--navbar-width: 104px /* Kolory: white, grey (#f1f1f1, #f7f7f7), black (#303030) */
  /* Tekst: primary (#303030), secondary (#616161) */ /* Border: grey (#e5e7eb), black (#303030) */;
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
- UI do zarządzania materiałami (widok "settings" — częściowo zaimplementowany)
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
- Szerokość rolki bawełny (estymacja): **1420mm** (nie 1450mm — stara dokumentacja była błędna)
- `LM_XML_POLY = 1420mm` (XML dla PrintFactory) ≠ `LM_ROLL_POLY = 1550mm` (estymacja długości) — różne celowo
- Material lock w selekcji: nie można mieszać Cottons i Polyesters w jednym batchu
- BatchHistory ma real-time watcher — pamiętaj o `stopBatchWatcher()` przy unmount
- Ścieżki storage są w **electron-store** (`getSettings.js`) — nigdy nie hardkoduj ich ponownie w `getRootPath.js`
- `settings:set` waliduje ścieżki przez `fs.promises.access` (async) — sieciowa ścieżka XML musi być dostępna w momencie zapisu
- Wszystkie operacje na ścieżkach z batchHistoryHandlers używają `assertStorageFilePath` — upewnij się że batchPath i filePath przechodzą walidację przed jakimikolwiek operacjami na plikach
- Zawsze używaj `notify()` zamiast `setAlert()` bezpośrednio — inaczej zdarzenia nie trafiają do SessionLogs
- `db.js` → plik `ripflow.db` jest w `storagePath` (nie w Electron userData) — jeśli storagePath jest niedostępny, `initDb()` może failować; aplikacja działa dalej (wszystkie funkcje db są zabezpieczone `if (!stmt) return`)
- `workstationName` jest trzecim polem ustawień — przy wywołaniu `setSettings()` z UI zawsze przekazuj wszystkie trzy wartości (`storagePath`, `xmlPath`, `workstationName`), żeby nie nadpisać któregoś nullem
- Pole `workstation` w tabeli `logs` może być NULL (stare logi sprzed migracji) — `SessionLogs` renderuje pill warunkowo tylko gdy wartość jest niepusta
- `heldIds` w store to `Set<string>` — synchronizowany z SQLite przez `loadHeldFiles()` przy starcie i `toggleHold()` przy zmianie
- Brak testów automatycznych w projekcie
- **pdfjs-dist musi być w wersji 4.x** — v5 używa `Map.prototype.getOrInsertComputed` niedostępnego w Chromium bundlowanym z Electron 40; nie upgraduj bez weryfikacji
- **pdf.js w Electron:** renderer nie może ładować plików przez `file://` URI (contextIsolation blokuje dostęp). Zamiast tego `usePdfPreview` czyta plik przez IPC (`window.api.readFileBuffer`) → base64 → `Uint8Array` → `pdfjsLib.getDocument({ data })`. Nie zmieniaj tego na podejście URI.
- `usePdfPreview` hook: module-level `Map` cache (klucz: filePath) — po pierwszym renderze kolejne otwarcia są natychmiastowe. Zwraca `{ openPreview, closePreview, navigate, isOpen, isLoading, imgSrc, error, currentPath, currentIndex, fileList }`
- `PdfPreviewModal`: przyjmuje `fileList` (array `{ path, name }`) do nawigacji ←→ między plikami w tej samej grupie/batchu. W `BatchHistory` pomija pliki ze statusem `rolled_back` przy budowaniu listy nawigacji.
- W `BatchHistory` hook jest destructurowany z prefixami (`isPreviewLoading`, `isPreviewOpen` itd.) żeby uniknąć konfliktu z lokalnym stanem `isLoading`.
- **Przed usunięciem jakiegokolwiek kodu — zawsze zrób grep po całym projekcie.** Raporty audytu mogą przeoczyć importy lub użycia w nieoczywistych miejscach. Lepiej poświęcić 10 sekund na grep niż usunąć coś używanego.
- `DataDaysCounter` komponent został usunięty — wiek pliku renderowany jest inline w `DataList` jako tag z ikoną `LuClock`; nie odtwarzaj `DataDaysCounter`.
- `Badge` komponent istnieje w katalogu, ale **nie jest używany** w `DataList` — print type, materiał i status renderowane są jako inline tagi z ikonami Lu* / PiPolygon.
- `parseFileName` zwraca dane pliku zagnieżdżone pod `file: { name, ext, dir, fullPath }` — dostęp przez `item.file.name`, nie `item.name`.
