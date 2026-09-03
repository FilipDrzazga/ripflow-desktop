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

Baseline testow - to JEST punkt odniesienia bramki, `CLAUDE.md` i sekcja "Bramka
weryfikacji" na dole kieruja tutaj zamiast zamrazac liczbe u siebie. Dopisuj kolejny
wiersz, nie nadpisuj poprzednich - rosnacy licznik przy zerowej liczbie modyfikacji
istniejacych testow jest sam w sobie dowodem, ze zadne ciecie nie poszlo na skroty.
`npm run lint` czysty na kazdym z nich.

- przed startem: 107 passed / 8 files
- po ETAPIE 1: 125 passed / 9 files (+18 z `shopProfile.test.js`)
- po 2c: 142 passed / 10 files (+17 z `featureVisibility.test.js`)
- po 2c-null: 155 passed / 12 files
- po 2c-bis (`ripErrors`): 169 passed / 13 files (+14 z `isFeatureEnabled.test.js`)

- [x] **BUG 1** - `clientId` przechodzi przez `settings:set`
  - `src/electron/ipc/index.js` (~:469 destrukturyzacja, ~:490 przekazanie)
  - commit: `fix(settings): pass clientId through the settings:set handler`
- [x] **BUG 3** - seed tkanin tylko gdy tabela pusta (guard `COUNT(*)===0`)
  - `src/electron/helpers/db.js` (~:273-279), idiom jak seed `fabric_globals` (~:250)
  - dowod no-op: Alex ma 132 wiersze -> guard false -> seed nie leci
  - commit: `fix(db): seed default fabrics only when the table is empty`
- [x] **BUG 2** - kontrolka `clientId` w UI (zalezy od BUG 1)
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
- [x] **BUG 4** - `fabricConfig` do WSZYSTKICH 7 konsumentow (najwyzsze ryzyko, ostatni)
  - main (4): `createXML.js:80`, `submitBatch.js:89`, `readPrintedFolder.js:152`,
    `batchHistoryHandlers.js:117,221`
  - renderer (4): `useStore.jsx:19` (sort), `DataList.jsx:251`,
    `ProductionOverviewCard.jsx:53`, `PrintMaterialBreakdownCard.jsx:33`
  - UWAGA: `ProductionOverviewCard` NIE wola `estimatePrintLength` wprost - idzie przez
    `estimateMaterialLengthByGroups(groups, materialType, config)`, wiec config jest na
    TRZECIEJ pozycji, nie drugiej (`estimatePrintLength.js:95`)
  - helper `getEstimateConfig()` w `fabricCache.js` (null gdy cache niezaladowany - NIE `[]`)
  - ZMIANA ZACHOWANIA (zamierzona): edycja marginesu w Settings zacznie wplywac na XML
  - ZNANY KSZTALT (`Eco Astra Ramie`): bawelna obecna w bazie, ale NIEOBECNA w mapie
    `LM_ROLL_COTTON` (`printWidths.js`). Dzis nieszkodliwa - baza ma dla niej 1420, czyli
    dokladnie to, co zwraca fallback `LM_ROLL_COTTON_DEFAULT`, wiec oba tryby licza tak
    samo. Gdy ktos wpisze jej w Settings niestandardowy rollWidth, tryb normalny (config
    z bazy) i awaryjny (cache niezaladowany) zaczna sie rozjezdzac. Golden-diff to zlapie.
    Domyka to Etap 2h (mapy z `printWidths.js` do profilu)
  - weryfikacja: golden-diff XML bajt w bajt na kopii bazy Alexa
  - rozwaz rozbicie na 2 commity (main / renderer) dla pewniejszego przegladu diffa
  - commit: `fix(estimate): feed DB fabric config into every print-length consumer`
- [x] Usunac `tmp_pathcheck.js` / `tmp_sim.js` z roota repo

**Bramka Etapu 0:** 107 testow przechodzi bez modyfikacji, lint czysty, Alex ma dalej
132 tkaniny, swieza baza jest pusta, XML Alexa bajt w bajt bez zmian.

---

## ETAP 1 - Szkielet profilu drukarni (fundament, zero konsumentow)

Wzorzec kopiowany 1:1 z `fabricCache.js`. Nie wymyslamy nowego mechanizmu.

- [x] Tabela `shop_profile` (jeden wiersz, JSON blob) w `db.js`, idempotentnie
- [x] `db.js`: `getShopProfile()` / `setShopProfile(obj, workstation)` (bool, bez runWrite)
- [x] `helpers/shopProfile.js`: `loadShopProfile` / `invalidateShopProfile` / `getProfile`
      / `getPrinters` / `getPrinterByCode` / `getFeature(name)`; sentinel `null`, fallback `DEFAULT_PROFILE`
- [x] IPC `profile:get` / `profile:set` (WLASNY handler, nie doklejac do `settings:set`)
- [x] `loadShopProfile()` w `registerIpcHandlers` PRZED `loadFabricCache()`
- [x] `services/profileService.js` (5s/30s) + `preload.js` z `isPlainObject`
- [x] Store: `shopProfile` + `loadShopProfile()` obok `loadFabricConfig`
- [x] **Podpiac konsumentow OD RAZU** (inaczej powtorzymy buga martwego `fabricConfig`)
- [x] Migracja: brak wiersza -> zbuduj profil FF ze STALYCH w kodzie (PRINTER,
      printerColors, hotfoldery, DEFAULT_FABRIC_GLOBALS, role, DIMS, Olya/Vagabond,
      SHOPIFY_STORE_HANDLE, wszystkie flagi true)
- [x] `shopProfile.test.js` (fallbacki, sentinel null)

**Bramka Etapu 1:** FF dziala identycznie, `profile:get` zwraca kompletny profil,
golden-diff czysty.

---

## ETAP 2 - Oderwanie zachowan od kodu (rosnace ryzyko, osobny commit kazdy)

- 2a - Shopify: pozycja usunieta, obie polowy zrobione gdzie indziej. `storeHandle`
  wszedl w ETAPIE 1 (`d7b93db`, `openInShopify.js` czyta profil, `shopifyConfig.js`
  skasowany), a flaga `features.shopify` jest w 2c-bis nizej. UWAGA: trzecia obietnica
  tej pozycji NIE jest spelniona - literal `"fashionformulauk"` zyje dalej w
  `defaultProfile.js:43` jako wartosc seeda; przestal byc stala konsumenta, ale nie
  zniknal z kodu. To nalezy do 2h ("zero nazw Alexa w kodzie"), nie tutaj.
- [ ] **2b - Szwalnie:** `sewingCompanies[]` w profilu + maly edytor (dzis: Olya/Vagabond zaszyte)
- [x] **2c - Flagi funkcji + filtr NavBar (zakres ZAWEZONY do nawigacji):** `customOrders`
      i `analytics`. `src/ui/utils/featureVisibility.js` - czysta `isViewEnabled(viewId, profile)`,
      swiadome lustro `getFeature` (main-only, nie wystawiony po IPC), fail-closed przy
      `null`, scisle `=== true`. `NavBar.TOP_ITEMS` filtrowany + Analytics z `nav_bottom`
      bramkowany osobno (jest poza tablica; divider idzie razem z nim). Bezpiecznik na
      widoku: guardy przy obu bramkowanych galeziach renderu ORAZ korekta `activeView`
      na `"print"` pisana w trakcie renderu, nie w efekcie (`react-hooks/set-state-in-effect`
      to blad w tym configu; `"print"` nie jest w `VIEW_FEATURE`, wiec petla renderow
      nie powstaje - przypiete testem `VIEW_FEATURE toEqual`). Osobny baner pod `db_banner`,
      bramkowany `!isLoading` - `shopProfile` jest `null` przez caly start, wiec baner
      bez tej bramki krzyczalby przy kazdym normalnym uruchomieniu.
      Dowod okablowania (nie tylko testy jednostkowe): trzy mutacje `shopProfile` w `App.jsx`
      na zywej aplikacji - `{customOrders:false, analytics:false}` -> 5 pozycji + divider
      znika + baner milczy; `null` -> 5 pozycji + baner; wejscie w Custom Orders, potem
      `customOrders:false` przez HMR -> aplikacja sama wraca na Print, `main` pelny, zero
      "Too many re-renders". Mutacje cofniete, baza produkcyjna nietkniete.
- [x] **2c-null-a - `db.js` sygnalizuje brak bazy zamiast braku wiersza** (jednoplikowa
      zmiana w `db.js`, wykonana PO 2c i PRZED 2e)
  - `getShopProfile` mial trzy galezie, nie dwie: `if (!db) return null`, brak wiersza ->
    `null`, oraz throw. `loadShopProfile` mapuje `null` na `DEFAULT_PROFILE`, wiec przy
    martwym NAS-ie klient dostawal AKTYWNA konfiguracje Alexa, a nie sentinel: `getPrinters()`
    zwracalo DGEN/YOKO/YUMI, hotfoldery `AUTOMATION_WORKFLOW_COTTON`/`_POLY`, klasy materialu
    i `storeHandle "fashionformulauk"`. Straznik `!db` rzuca teraz zwyklym `Error`.
  - **Zmienil sie producent sygnalu, nie konsument.** `shopProfile.js` bez zmian: jego
    `catch` (`:16-19`) juz mapowal throw na `cachedProfile = null`, a `?? DEFAULT_PROFILE`
    (`:15`) juz obslugiwal brak wiersza. Obie galezie byly poprawne i nieosiagalne dla
    najczestszego trybu awarii, bo `db.js` nie dotrzymywal kontraktu, ktory `shopProfile.js`
    opisal w komentarzu. Rowniez powierzchnia importow `shopProfile.js` bez zmian, wiec
    `shopProfile.test.js` (`vi.mock("./db.js")`) nietkniety.
  - **Wzorzec `fabricCache` NIE dal sie tu przeniesc, i to jest ustalenie, nie wymowka.**
    `getAllFabrics` zwija `!db` i `catch` do jednego `null`, i wolno mu, bo czyta LISTE -
    ma zapasowa wartosc na "legalnie pusto" (`[]`). `getShopProfile` czyta JEDEN WIERSZ,
    wiec `null` jest juz zajete przez "brak wiersza" i zapasowej wartosci nie ma.
    Skopiowanie `getAllFabrics` linia w linie nie naprawiloby niczego - to jest dokladnie
    to, co ta funkcja juz robila. Wspolna jest ZASADA (awaria i pustka nie moga dzielic
    jednej wartosci), nie mechanizm.
  - **Rozmiar wzorca: 16 z 17 sciezek odczytu w `db.js` zwija "brak bazy" do wartosci
    wygladajacej jak poprawny pusty wynik.** `getAllFabrics` jest JEDYNA, ktora rozroznia.
    Ta naprawa podnosi licznik 1/17 na 2/17 i NIE zmniejsza dlugu. Reszta jest dzis
    nieszkodliwa, bo karmi liczniki i listy (`getRollbackStats` -> zerowe Analytics,
    `getOpenReprintRequests`/`getReprintRequests`/`getRollbackDetails` -> puste listy,
    dziesiec straznikow `if (!stmtX)` -> `[]`/`null`). Staje sie szkodliwa, gdy ktoras
    zacznie sterowac zachowaniem - czyli w 2e i 2f.
  - **Skutek uboczny dla dlugu "seed vs migracja" (a2cbc30):** po tej naprawie galaz
    `?? DEFAULT_PROFILE` w `shopProfile.js` staje sie prawie martwa, bo `initDb` zasiewa
    wiersz przy pierwszym uruchomieniu (`db.js:299-304`), a `loadShopProfile` biegnie po
    `initDb` (`ipc/index.js:159` potem `:170`). Dzis obslugiwala niemal wylacznie martwa
    baze; po naprawie zostaje tym, czym miala byc - obsluga swiezej instalacji, ktorej
    seed nie zdazyl wykonac. `DEFAULT_PROFILE` to nadal dane Alexa udajace neutralny stan
    domyslny, dokladnie jak `DEFAULT_FABRICS` przed ETAPEM 0; ta zmiana jest plastrem,
    oproznienie `DEFAULT_PROFILE` na rzecz importu to ETAP 3.
  - **`openInShopify` mial fallback na `DEFAULT_PROFILE` napisany w ETAPIE 1 pod scenariusz
    "cache jest null" (`openInShopify.js:12-14`), i ta naprawa po raz pierwszy sprawia, ze
    ten fallback naprawde sie uruchamia.** Dotad byl martwym kodem, bo cache nigdy nie
    bywal `null` przy martwej bazie. URL dla Alexa bajt w bajt ten sam.
  - Harness: `db.shopProfile.test.js` - PRAWDZIWY `db.js`, trzy `vi.mock` (`electron`,
    `./getRootPath.js`, `better-sqlite3`). To test PRZEPLYWU STEROWANIA na atrapie
    sterownika, nie test na prawdziwym SQLite - zastrzezenie stoi w naglowku pliku.
    Golden i `scripts/` nie mogly tego pokryc: `stub-db.mjs` PODMIENIA caly `db.js`,
    wiec ma te sama slepote co `vi.mock("./db.js")`.
  - Bramka: 142/142, lint czysto, golden 0/70. Zdrowy NAS - 7 zakladek, zero banerow,
    Custom Orders i Analytics otwieraja sie: czysty no-op. Martwy NAS (`storagePath` na
    nieistniejacy dysk, zmiana USTAWIENIA, nie kodu) - 5 zakladek, dwa banery w kolejnosci
    "Database unavailable" -> "Shop profile could not be loaded", zadnego innego wyjatku
    w konsoli main poza zamierzonym lancuchem `initDb failed` -> `loadShopProfile failed`;
    Print/Batch/Production renderuja sie zdegradowane, ale spojne. Ustawienie przywrocone,
    7 zakladek wrocilo.
- [x] **2c-null-b - `status: "loading" | "loaded" | "failed"` w storze** (renderer)
  - **Warunek banera przestal byc proxy czasowym.** Bylo:
    `!isLoading && shopProfile === null`, czyli zgadywanie "ladowanie sie skonczylo" po
    tym, ze zamknal sie StartupLoader. Jest: `shopProfileStatus === PROFILE_STATUS.FAILED`,
    czyli odczyt zapisanej odpowiedzi. Stan poczatkowy to `LOADING`, wiec start nie
    wyglada juz jak awaria i `!isLoading` bylo zbedne.
  - `resolveProfileResult` w `utils/profileStatus.js` - czysta funkcja, wzorzec z 2c
    (`featureVisibility.js`), fail-closed w te sama strone co `getFeature`: cokolwiek
    niezrozumiale to `FAILED`. Wymaga `success === true` (scisle) ORAZ uzytecznego
    profilu. `shopProfile` nadal nigdy nie dostaje obiektu udajacego wczytany.
  - **`data === null` znaczy teraz jednoznacznie AWARIA** i to jest bezposredni zysk z
    2c-null-a: straznik `!db` rzuca, a faktycznie brakujacy wiersz nadal daje
    `DEFAULT_PROFILE`, wiec jedyna droga do nulla z maina jest nieodczytanie bazy.
    Zapisane w komentarzu w pliku, zeby ktos za pol roku nie "naprawil" tego z powrotem.
  - **Pusty obiekt `{}` liczy sie jako awaria, nie jako wczytany profil bez pol.** Nie
    niesie zadnej konfiguracji, wiec uznanie go za wczytany chowaloby bramkowane zakladki
    (`isViewEnabled` fail-closes bez bloku `features`) i JEDNOCZESNIE gasilo baner, ktory
    to tlumaczy - mniej zakladek i zadnego powodu. Sprawdzenie jest celowo mechaniczne
    (zwykly obiekt z co najmniej jednym kluczem); walidacja pol to praca schematu, nie
    mappera statusu.
  - Timeout nie przechodzi przez mapper: `withTimeout` (`ipcWithTimeout.js:5-15`) RZUCA,
    wiec 5-sekundowy deadline `profile:get` laduje w `catch` w storze, ktory ustawia te
    sama pare `{ shopProfile: null, status: FAILED }`. Oba pola jednym `set()` - render,
    ktory zobaczylby status `LOADED` obok nullowego profilu, czytalby stan, ktory nigdy
    nie istnial.
  - **Decyzja o DWOCH banerach jest swiadoma i NIE jest dlugiem do naprawy.** Przy martwym
    NAS-ie operator widzi "Database unavailable" oraz "Shop profile could not be loaded":
    to dwie rozne konsekwencje jednej przyczyny i obie sa operacyjnie istotne (pierwsza
    mowi, ze zapisy przepadaja; druga, ze czesc funkcji jest ukryta). Zero kodu na ich
    laczenie - nie wpisywac tego ponownie jako TODO.
  - `isViewEnabled`, `VIEW_FEATURE` i `featureVisibility.test.js` nietkniete.
  - Bramka: 155/155, lint czysto, golden 0/70. Zdrowy NAS - 7 zakladek i ZERO banerow na
    **wszystkich 14 klatkach** startu (detekcja po pikselach `#b91c1c`, detektor
    zwalidowany kontrolnie: 57 wierszy na znanym obrazie z dwoma banerami, 0 na czystym);
    baner nie miga mimo zdjecia `!isLoading`. Martwy NAS - 5 zakladek, dwa banery na
    kazdej klatce, plus toast "Invalid root folder". Mutacja okablowania (wymuszony
    `"failed"` przy zdrowym NAS-ie) - baner profilu SAM, bez banera bazy, a 7 zakladek
    zostaje: dowod, ze baner czyta `shopProfileStatus`, a zakladki niezaleznie
    `shopProfile`. Konsola renderera tym razem odczytana (DevTools zadokowane): tylko
    podpowiedz React DevTools i ostrzezenie CSP Electrona, zero bledow Reacta - domyka
    ograniczenie zgloszone przy 2c-null-a.
- [~] **2c-bis - pozostale cztery flagi** (`ripErrors`, `labelPrinting`, `shopify`, `sewing`).
      `ripErrors` zamkniete; zostaja trzy, kazda osobnym cieciem.
      Swiadomie NIE w 2c: kazda ma 3-6 wejsc UI rozsianych po kilku plikach, wiec filtr
      w NavBarze ich nie domyka. Wejscia zmierzone grepem, nie oszacowane:
  - `ripErrors`: `Production/ProductionCard.jsx:137` (badge) + `:140` (klik);
    `Production/Production.jsx:1302` (prop), `:1855` (popover), `:224` (store);
    `BatchHistory/FileRow.jsx:64,67`; `BatchHistory/BatchRow.jsx:68-70` (licznik naglowka),
    `:44-45`, `:152`; `BatchHistory/BatchHistory.jsx:1034` (popover);
    `Production/SewingReceive.jsx:43,269`; `OverviewPanel/OverviewPanel.jsx:46,54,87` (kafel);
    poll `App.jsx:32,68,98`
    - [x] ZROBIONE. Bramka NIE stanela w kazdym z tych wejsc, tylko u zrodla:
      `loadRipErrors` jest jedynym pisarzem `store.ripErrors` (zweryfikowane grepem
      na klucz w wiekszym obiekcie, spread/merge i listenery IPC - kanalu push dla
      RIP nie ma, preload wystawia same `invoke`), wiec bramkowanie jego jednego
      efektu w `App.jsx` zostawia mape pusta, a wszystkie badge, licznik naglowka
      i popovery renderuja przy pustej mapie nic. Wyjatkiem jest kafel w
      `OverviewPanel`, ktory renderuje sie takze przy zerze - dostal wlasne
      `isFeatureEnabled` w miejscu wywolania.
    - **PULAPKA dla kolejnych flag:** pusta `ripErrors` nie JEST bramka, tylko tak
      wyglada. Jedna wartosc niesie trzy znaczenia - "feature off", "profil
      nieodczytany" i "zero bledow teraz" - czyli dokladnie ten sam falszywy sentinel
      co `null` vs `[]`. Kazde NOWE wejscie UI renderujace sie przy zerze (licznik,
      kafel, przygaszona pigulka, zakladka filtra, linia empty-state) musi wziac
      wlasne `isFeatureEnabled` w miejscu wywolania. Kafel w `OverviewPanel` jest
      tego precedensem, nie wyjatkiem. Ostrzezenie stoi przy efekcie w `App.jsx`.
    - Swiadomie odrzucone przy tym cieciu, NIE sa dlugiem: staly test na bramke
      kafla (trup udowodniony recznie, ale straznika nie zostawiono - wymagalby
      pierwszego w repo testu renderujacego) oraz bramka po stronie main
      (`scanRipErrors` / `rip-errors:*` nietkniete - przy wylaczonej fladze nikt
      tam nie dzwoni).
  - `labelPrinting`: `Production/Production.jsx:1525` ("Reprint Label") -> `:1530` -> `:531,543`;
    `BatchHistory/BatchHistory.jsx:97`; `services/productionService.js:9`
  - `shopify`: `Production/Production.jsx:1375` (lens ORDERS) i `:1557` (lens BATCHES) -> `:671`;
    `DataList/DataList.jsx:413` -> `:416` -> `:147`;
    `BatchHistory/BatchHistory.jsx:1079` -> `:1083` -> `:626`; `services/fileService.js:55`
  - `sewing`: `Production/Production.jsx:1618-1619` (zakladka RECEIVE) -> `:1770-1771` (render);
    `:1471` ("Send to Sewing"); handlery `:364, 381, 418, 831, 864`;
    `Production/SewingReceive.jsx:29`; `services/productionService.js:7,8`
- [ ] **2d - Nazwy hotfolderow** do profilu (`createXML.js`, `customOrderHandlers.js`, `getRootPath.js`)
- [ ] **2e - Drukarki -> `printers[]`** (NAJSZERSZY zasieg, 53 wystapienia w 12 plikach,
      w tym regexy widocznosci - zmierzone grepem, nie oszacowane)
  - regex na "ostatni segment po ostatnim -" + walidacja kodu `[A-Z0-9_]+`
  - test reczny: submit -> XML -> PRINTED -> BatchHistory -> Production dla KAZDEJ drukarki
  - [ ] getPrinterByCode jest case-insensitive (shopProfile.js, ETAP 1 krok 2),
        ale PRINTER.* porownuje sie scisle - ten sam kod przechodzi lookup i odbija
        sie od porownania. Przy 2e znormalizowac kod na WEJSCIU (uppercase przy
        wyciaganiu z nazwy folderu) i zaostrzyc lookup, zamiast luzowac go dalej.
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
- [ ] `defaultProfile.js:43`: `integrations.shopify.storeHandle: "fashionformulauk"` -> `""`.
      Zostalo po skasowanym 2a: konsument czyta juz profil (ETAP 1), ale seed nadal wnosi
      nazwe Alexa do kodu. Uwaga na `openInShopify.js` - fallback celowo uzywa `||`, wiec
      pusty handle liczy sie jako brak i degraduje zamiast budowac zly link
- [ ] Grep kontrolny: zero `if (clientId === "...")` w logice, zero zaszytych adresow,
      zero literalu "Fashion Formula" (audyt: byl jeden; osobno `"fashionformulauk"`
      wyzej - inny string, wiec grep na "Fashion Formula" go NIE lapie)

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
  - **Edytor profilu MUSI zapisywac `shopProfile` i `shopProfileStatus` RAZEM, jednym
    `set()`.** Dzis zgodnosc tych dwoch pol gwarantuje wylacznie fakt, ze pisze je jedna
    funkcja (`loadShopProfile`, dwa `set()`, kazdy z obiema wartosciami) - nic tego nie
    wymusza, ani test, ani lint. Drugie wejscie zapisujace tylko `shopProfile` przywroci
    dokladnie ten rodzaj dlugu, ktory 2c-null-b usunal: jedna prawda w dwoch miejscach,
    ktore moga sie rozjechac.
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
- [ ] Seed vs migracja: DEFAULT_PROFILE dzis seeduje KAZDA nowa baze danymi FF
      (db.js, ETAP 1 krok 1). Po zbudowaniu importu rozstrzygnac: albo pusty
      profil-szkielet dla nowej instalacji, albo swiadomie zostawic FF jako
      "demo do nadpisania importem". Dzis nieszkodliwe - Alex ma juz wiersz.

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
- [ ] Cache nie wstaje po odzyskaniu bazy: shopProfile i fabricCache laduja sie
      raz na starcie; jesli baza byla nieosiagalna, oba zostaja na sentinelu null
      do restartu aplikacji, nawet gdy NAS wroci minute pozniej. Dzis maskowane
      fallbackami (literal Shopify, printWidths.js), ale przy rosnacej liczbie
      konsumentow profilu roznica miedzy "profil z bazy" a "fallback z kodu"
      bedzie coraz wieksza. Rozwazyc lazy retry przy odczycie albo ponowna probe
      przy odzyskaniu polaczenia. Jeden mechanizm dla obu cache, nie dwa.
  - [ ] Przycisk ponownego wczytania ma odswiezac `shopProfile` I `fabricCache` JEDNYM
        mechanizmem. Swiadomie pominiety w 2c - tam byloby to drugie, konkurencyjne
        rozwiazanie tego samego problemu.
  - [ ] Razem z tym przyciskiem, nie wczesniej: `loadShopProfile` nie ustawia
        `PROFILE_STATUS.LOADING` na wejsciu. Dzis bez znaczenia - jest wolany raz przy
        starcie, a stan poczatkowy w storze jest juz poprawny. Przy retry status
        zostalby na `FAILED` przez caly czas trwania proby, wiec baner nie zniknalby do
        chwili odpowiedzi. Jedna linia do dodania.
  - [ ] Przypadek (c) z pomiaru przy 2c: `withTimeout(profile:get, 5s)` odrzuca przy
        ZDROWEJ bazie (main zablokowany synchronicznym better-sqlite3 + `sweepOrphanTemps`
        + `backupDb` na SMB). `dbDegraded` zostaje wtedy `false`, wiec baner o bazie nie
        leci, a `shopProfile` jest `null` do konca sesji. Dzis nie ma z tego innego
        wyjscia niz restart aplikacji. Asymetria do naprawy przy okazji: `getDbDegraded`
        (`systemService.js:24`) nie ma `withTimeout` i doczeka sie odpowiedzi, `profile:get`
        ma 5s i sie poddaje.
    - **Koszt przypadku (c) urosl przy 2c-bis (ripErrors).** Do tej pory nieodczytany
      profil kosztowal ukryte zakladki i literalowy fallback Shopify - rzeczy widoczne
      od razu. Teraz `shopProfile === null` znaczy takze: skan bledow RIP nie odpala sie
      ANI RAZU przez cala sesje (bramka jest fail-closed, wiec brak profilu = feature
      off). Operator nie zobaczy zadnego badge'a, licznika w naglowku batcha ani kafla
      na przegladzie - i nic mu tego nie zasygnalizuje, bo przy (c) baza jest ZDROWA,
      wiec baner o bazie nie leci. To pierwszy przypadek, w ktorym nieodczytany profil
      ukrywa nie funkcje aplikacji, lecz **stan produkcji** - blad RIP, ktory faktycznie
      wystapil. Jest to swiadomie zaakceptowane (fail-closed bije falszywy sygnal
      "zero bledow" u klienta bez tej funkcji), ale podnosi priorytet lazy retry
      i przycisku ponownego wczytania powyzej wczesniejszego "wygoda".
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

- [ ] `npm run test` - zielone, ZERO modyfikacji istniejacych testow
      (modyfikacja testu = sygnal niezamierzonej zmiany zachowania -> STOP).
      Liczby nie zamrazamy tutaj - rosnie z kazdym krokiem dokladajacym plik testowy,
      a zamrozona staje sie celem. Oczekiwana wartosc to baseline z gory tego pliku
      (ETAP 0), zmierzony PRZED startem pracy; niezmienne jest to, ze licznik moze
      tylko rosnac i nigdy przez edycje istniejacego testu.
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
