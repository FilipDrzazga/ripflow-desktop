# RipFlow - Productization TODO

Cel: jeden kod, jeden build, zero zaleznosci od konkretnej drukarni. Wszystko, co
klient-specyficzne, konfigurowalne (profil w bazie), a nie zaszyte w kodzie.

Zasada nadrzedna: kazda zmiana jest no-op dla istniejacego klienta (Alex). Parytet
udowadniamy golden-diff (XML bajt w bajt) na kopii jego bazy, nie na oko.

## Legenda statusu

- `[ ]` do zrobienia
- `[~]` w trakcie
- `[x]` zrobione (zcommitowane + testy + lint + golden-diff czysty)
- `[!]` zablokowane (czeka na cos zewnetrznego)
- `[=]` swiadomie zamrozone (do realnego klienta #2)

## Decyzje ustalone (nie zmieniamy bez powodu)

- Model sprzedazy: SUBSKRYPCJA, egzekwowana lagodna degradacja funkcji dodanych,
  NIGDY zatrzymaniem produkcji.
- Onboarding: robi FILIP, przez import profilu JSON. Kreator pierwszego uruchomienia
  zostaje w Etapie 4 (nie awansuje).
- Probki nazw plikow: element rozmowy sprzedazowej (discovery), nie po podpisie.
- Pierwszy klient #2 zakladany na PrintFactory (bez nowych rip-adapterow teraz).

---

## ETAP 0 - Niezalezne bugfixy + odciecie katalogu (u samego Alexa)

Baseline przed startem: `npm run test` = 107 passed / 8 files, `npm run lint` czysty.

- [x] **BUG 1** - `clientId` przechodzi przez `settings:set`
  - `src/electron/ipc/index.js` (~:469 destrukturyzacja, ~:490 przekazanie)
  - commit: `fix(settings): pass clientId through the settings:set handler`
- [x] **BUG 3** - seed tkanin tylko gdy tabela pusta (guard `COUNT(*)===0`)
  - `src/electron/helpers/db.js` (~:273-279), idiom jak seed `fabric_globals` (~:250)
  - dowod no-op: Alex ma 132 wiersze -> guard false -> seed nie leci
  - commit: `fix(db): seed default fabrics only when the table is empty`
- [ ] **BUG 2** - kontrolka `clientId` w UI (zalezy od BUG 1)
  - `src/ui/components/Settings/views/GeneralView.jsx` (input jak "Workstation Name")
  - commit: `fix(settings): add a clientId field to the General settings view`
- [x] **Eksport katalogu Alexa do pliku** (siatka bezpieczenstwa, PRZED oproznieniem)
  - `db.getAllFabrics()` -> `profiles/fashion-formula-fabrics.json`
  - KOLEJNOSC KRYTYCZNA: eksport PRZED zmiana `DEFAULT_FABRICS`, nigdy odwrotnie
- [x] **Puste domyslne tkaniny** - `DEFAULT_FABRICS = []`
  - `src/electron/helpers/defaultFabrics.js`
  - Alex: 132 nietkniete. Nowy klient: pusta baza do wpisania w Settings > Fabrics
  - commit: `chore(fabrics): ship empty default catalog; a shop's stock is its own data`
- [x] **Eksport `buildPFJobXML`** dla siatki golden (narzedziowy, no-op dla zachowania)
  - `src/electron/ipc/createXML.js` - trailing named export, konwencja jak `parseFileName.js`
  - commit `52b268b`: `test(createXML): export buildPFJobXML for golden regression harness`
- [x] **Golden capture** (70 batchy, zanonimizowane) + skrypty capture/compare
  - `golden/` (70 XML + `_inputs.json`) + `scripts/golden/` (8 skryptow)
  - nazwiska, numery zamowien i XWD pseudonimizowane U ZRODLA; mapowanie wyprowadzone
    z posortowanych wartosci, nie losowane - re-capture odtwarza identyczny baseline
  - maskowane TYLKO: UUID w `<NestingGroup>`, ten sam UUID w `<LogisticGroup>`, root sciezki.
    Sufiks `_Nm` (metry) porownywany BAJT W BAJT - to jest cel siatki
  - uruchomienie: `ELECTRON_RUN_AS_NODE=1 ./node_modules/.bin/electron scripts/golden/compare-golden.mjs`
  - commit `9a35b33`: `test(golden): capture anonymised baseline XML for regression diffing`
- [ ] **BUG 4** - `fabricConfig` do WSZYSTKICH 7 konsumentow (najwyzsze ryzyko, ostatni)
  - main (3): `createXML.js:80`, `submitBatch.js:88`, `readPrintedFolder.js:151`
  - renderer (4): `useStore.jsx:19` (sort), `DataList.jsx:251`,
    `ProductionOverviewCard.jsx:53`, `PrintMaterialBreakdownCard.jsx:33`
  - UWAGA: `ProductionOverviewCard` NIE wola `estimatePrintLength` wprost - idzie przez
    `estimateMaterialLengthByGroups(groups, materialType, config)`, wiec config jest na
    TRZECIEJ pozycji, nie drugiej (`estimatePrintLength.js:95`)
  - helper `getEstimateConfig()` w `fabricCache.js` (null gdy cache niezaladowany - NIE `[]`)
  - ZMIANA ZACHOWANIA (zamierzona): edycja marginesu w Settings zacznie wplywac na XML
  - weryfikacja: golden-diff XML bajt w bajt na kopii bazy Alexa
  - rozwaz rozbicie na 2 commity (main / renderer) dla pewniejszego przegladu diffa
  - commit: `fix(estimate): feed DB fabric config into every print-length consumer`
- [ ] Usunac `tmp_pathcheck.js` / `tmp_sim.js` z roota repo

**Bramka Etapu 0:** 107 testow przechodzi bez modyfikacji, lint czysty, Alex ma dalej
132 tkaniny, swieza baza jest pusta, XML Alexa bajt w bajt bez zmian.

---

## ETAP 1 - Szkielet profilu drukarni (fundament, zero konsumentow)

Wzorzec kopiowany 1:1 z `fabricCache.js`. Nie wymyslamy nowego mechanizmu.

- [ ] Tabela `shop_profile` (jeden wiersz, JSON blob) w `db.js`, idempotentnie
- [ ] `db.js`: `getShopProfile()` / `setShopProfile(obj, workstation)` (bool, bez runWrite)
- [ ] `helpers/shopProfile.js`: `loadShopProfile` / `invalidateShopProfile` / `getProfile`
      / `getPrinters` / `getPrinterByCode` / `getFeature(name)`; sentinel `null`, fallback `DEFAULT_PROFILE`
- [ ] IPC `profile:get` / `profile:set` (WLASNY handler, nie doklejac do `settings:set`)
- [ ] `loadShopProfile()` w `registerIpcHandlers` PRZED `loadFabricCache()`
- [ ] `services/profileService.js` (5s/30s) + `preload.js` z `isPlainObject`
- [ ] Store: `shopProfile` + `loadShopProfile()` obok `loadFabricConfig`
- [ ] **Podpiac konsumentow OD RAZU** (inaczej powtorzymy buga martwego `fabricConfig`)
- [ ] Migracja: brak wiersza -> zbuduj profil FF ze STALYCH w kodzie (PRINTER,
      printerColors, hotfoldery, DEFAULT_FABRIC_GLOBALS, role, DIMS, Olya/Vagabond,
      SHOPIFY_STORE_HANDLE, wszystkie flagi true)
- [ ] `shopProfile.test.js` (fallbacki, sentinel null)

**Bramka Etapu 1:** FF dziala identycznie, `profile:get` zwraca kompletny profil,
golden-diff czysty.

---

## ETAP 2 - Oderwanie zachowan od kodu (rosnace ryzyko, osobny commit kazdy)

- [ ] **2a - Shopify:** `integrations.shopify.storeHandle` + flaga `features.shopify`
  - usuwa jedyny literal z nazwa klienta (`SHOPIFY_STORE_HANDLE = "fashionformulauk"`)
  - pierwszy realny efekt sprzedazowy (demo nie pokazuje sklepu Alexa)
- [ ] **2b - Szwalnie:** `sewingCompanies[]` w profilu + maly edytor (dzis: Olya/Vagabond zaszyte)
- [ ] **2c - Flagi funkcji + filtr NavBar:** `customOrders`, `analytics`, `ripErrors`,
      `labelPrinting`; `NavBar.TOP_ITEMS` filtrowany; bezpiecznik na widoku (nie tylko przycisk)
- [ ] **2d - Nazwy hotfolderow** do profilu (`createXML.js`, `customOrderHandlers.js`, `getRootPath.js`)
- [ ] **2e - Drukarki -> `printers[]`** (NAJSZERSZY zasieg, 12 miejsc, w tym regexy widocznosci)
  - regex na "ostatni segment po ostatnim -" + walidacja kodu `[A-Z0-9_]+`
  - test reczny: submit -> XML -> PRINTED -> BatchHistory -> Production dla KAZDEJ drukarki
- [ ] **2f - `scanRules[]`** zamiast 4 galezi `workstationRole` (upraszcza `Production.jsx`)
- [ ] **2g - Klasy materialu** (2 sloty, konfig etykiet+przynaleznosci) + typy produktow + wymiary
      (`productTypes[]`, dzis SAMPLE/FQ/TEA_TOWEL zaszyte)

### 2h + pelne czyszczenie katalogu (MUST HAVE - cel: zero nazw Alexa w kodzie)

Dopiero po Etapie 1 (fallbacki maja czytac z profilu, nie ze statycznych list).

- [ ] `defaultFabrics.js`: usunac `COTTON_NAMES` / `POLY_NAMES`
- [ ] `getMaterialType.js`: statyczne listy nazw Alexa -> czytanie klas z `profile.materialClasses`
      (fallback zwraca "Unknown", nie liste Alexa)
- [ ] `printWidths.js`: mapy `LM_ROLL_COTTON` / `LM_XML_COTTON` (per nazwa Alexa) -> profil
- [ ] Flagi `isVelvet` / `isLinen` / `isBlossom` wywodzone przez `name.includes()`
      (`createXML.js`) -> pola w profilu/fabrics, nie zgadywanie ze stringu (audyt #17)
- [ ] Katalog FF -> `profiles/fashion-formula-fabrics.json` (juz wyeksportowany w Etapie 0)
- [ ] `getSettings.js`: domyslne sciezki `O:\SPPrintReadyArtwork` / `\\192.168.0.17\...` -> `""`
- [ ] Grep kontrolny: zero `if (clientId === "...")` w logice, zero zaszytych adresow,
      zero literalu "Fashion Formula" (audyt: byl jeden)

**WYJATEK - swiadomie ZOSTAJE (nie usuwac):**

- [x] `GROUP_NAME_OVERRIDES` (`createBatchIds.js`) - to NIE jest aktywny config, tylko
      legacy shim dla HISTORYCZNYCH batchy Alexa (juz wyparty przez kolumne `alias`).
      Usuniecie zepsulo by rozwiazywanie jego starych batchy. Dla nowego klienta to
      pusta mapa, ktora nigdy nie trafia. Zostaje z komentarzem "legacy fallback".

**Bramka Etapu 2 (po kazdym pod-kroku):** golden-diff XML bajt w bajt = zero roznic
na danych Alexa; 2e dodatkowo: batch z kazdej drukarki widoczny w BatchHistory i Production.

---

## ETAP 3 - Walizka JSON (transport profilu)

Baza pozostaje jedynym zywym zrodlem prawdy; JSON to tylko transport na wdrozenie.

- [ ] Nowa sekcja `Shop Profile` w Settings (podglad read-only + Import/Export)
- [ ] Handler `dialog:showSaveDialog` (dzis brak - sa tylko select-folder i confirm)
- [ ] Export profilu do pliku `.json`
- [ ] Import + walidacja w kolejnosci:
  - [ ] `schemaVersion` (nowszy niz build -> odmowa; starszy -> migracja w gore)
  - [ ] ksztalt: wymagane klucze, typy, `printers` niepuste
  - [ ] kody drukarek `^[A-Z0-9_]+$` (myslnik rozwala parsowanie nazwy folderu batcha)
  - [ ] spojnosc: `printer.materialClass` w `materialClasses`; `scanRules.from/to` w `stages`
  - [ ] ostrzezenie o niezgodnosci z danymi na dysku (ile rekordow zniknie z widoku)
  - [ ] `showConfirm()` + `backupDb(true)` przed nadpisaniem
- [ ] Import NIE dotyka `fabrics` (katalog ma wlasny `setAllFabrics`)

---

## ETAP 4 - Produktyzacja (moze isc rownolegle z Etapem 2)

- [ ] **Podpis kodu** - certyfikat OV (~300-400 EUR/rok). Bez tego SmartScreen
      "Nieznany wydawca" przy kazdej instalacji i aktualizacji
- [ ] **Kanaly wydan** - `autoUpdater.channel = clientId` -> `latest-<klient>.yml`;
      ten sam `.exe`, osobne pliki kanalow; promocja = skopiowanie yml
  - [ ] naprawa gubienia `clientId` (BUG 1) to warunek wstepny
  - [ ] kolejnosc promocji: kanal testowy -> jeden pilot -> reszta
- [ ] **Semver serio:** patch = tylko fix; minor = nowa funkcja za flaga (domyslnie false
      u pozostalych); major = zmiana danych/pipeline
- [ ] **Licencja** - `license.json` (Ed25519, klucz publiczny w buildzie), walidacja
      OFFLINE. Klucz prywatny nigdy w repo/buildzie
- [ ] **Lagodna degradacja** po `validUntil`: produkcja dziala dalej (druk/batche/XML/
      rollback); gasnie tylko Analytics/auto-update + baner. Karencja przed wylaczeniem
- [ ] **Export diagnostics** - zip: ostatnie 500 logow, `shop_profile`, wersja, sciezki
      (bez zawartosci plikow), wynik testu dostepu do hotfolderow. Bez telemetrii
- [ ] **Kreator pierwszego uruchomienia** (sciezki -> import profilu -> test zapisu do hotfoldera)
- [ ] `changelog.json` - uzywac pola `clients` per wpis zamiast "all"

---

## ETAP 5 - Parser nazw plikow (OSTATNI, osobna galaz)

`parseFileName.js` = 623 linie, 27 testow charakteryzacyjnych (jedyna realna siatka).
Podejscie: NIE przepisywac. Wyodrebnic obecna logike, potem dodac druga.

- [!] **ZABLOKOWANE: brak probek nazw plikow od realnego klienta #2**
- [=] Wyodrebnic obecna logike -> `parsers/fashionFormula.js` (27 testow przechodzi BEZ modyfikacji = kryterium)
- [=] `parsers/index.js` - wybor po `profile.parser.profile`
- [=] Drugi parser pod konwencje klienta #2 + wlasny zestaw testow
- [=] NIE budowac generycznego "silnika regul" z UI (dwie konwencje to za malo na abstrakcje)

---

## Zamrozone do realnego klienta #2 (nie zgadywac teraz)

- [=] Etap 5 parser (patrz wyzej) - czeka na probki nazw
- [=] Zakres szwalni (`features.sewing`) - flaga pokrywa; szczegol z discovery
- [=] Trzecia klasa materialu - dzis 2 sloty; 3+ rozszerza 2g (sprawdzic w discovery)
- [=] Twarde okresy licencji (baner/karencja) - ustalic przy pierwszej realnej umowie

---

## Bramka weryfikacji (PO KAZDYM etapie, bez wyjatku)

- [ ] `npm run test` - 107 passed / 8 files, ZERO modyfikacji testow
      (modyfikacja testu = sygnal niezamierzonej zmiany zachowania -> STOP)
- [ ] `npm run lint` - czysty
- [ ] golden-diff: wygenerowany XML bajt w bajt vs baseline, na kopii bazy Alexa
- [ ] sciezka reczna: Inbox -> submit -> XML w xmlPath -> PRINTED -> BatchHistory
      -> skan w Production -> rollback
- [ ] surowy `git diff` przejrzany PRZED commitem (nie commitowac z opisu zmian)
- [ ] commit ASCII-only; wersja/changelog w OSOBNYM commicie

## Discovery przed pierwsza sprzedaza (odblokowuje zamrozone)

- [ ] Zebrac 30-50 probek nazw plikow klienta #2 (odblokowuje Etap 5)
- [ ] Ustalic liczbe klas materialu (2 = gotowe, 3+ = 2g rosnie)
- [ ] Szwalnia tak/nie + skanowanie kodow (zakres scanRules / lens Receive)
- [ ] Potwierdzic RIP = PrintFactory (inny = lead na pozniej)
- [ ] Liczba stacji + IT klienta + czy blokuja niepodpisane (wycena + priorytet podpisu)
