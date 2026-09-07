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
- po 2c-bis (`labelPrinting`): 179 passed / 15 files (+5 z `submitBatchLabelGate.test.js`,
  +5 z `labelPrintBatchGate.test.js`)
- po 2c-bis (`shopify`): 193 passed / 16 files (+14 z `openInShopify.test.js` - plik,
  ktory wczesniej nie mial ZADNEGO testu)
- po 2c-bis (`sewing`): 209 passed / 17 files (+16 z `sewingStageGate.test.js`)
- po 2b (sewing companies): 219 passed / 18 files (+10 z `shopProfileData.test.js`)

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
- [x] **2b - Szwalnie: POLOWA ODCZYTOWA** (`fb9756f`). Nazwy szwalni wychodza z kodu
      do profilu: podmenu "Send to Sewing" budowane z `sewingCompanies[]` przez nowy
      `src/ui/utils/shopProfileData.js` (`getSewingCompanies`) - PIERWSZY odczyt DANYCH
      z profilu po stronie renderera, dotad renderer czytal wylacznie `features`.
      Swiadomie osobny plik od `featureVisibility.js`: tamten odpowiada na "czy ta
      funkcja jest widoczna", ten na "co zawiera konfiguracja tego klienta"; przy 2e
      dojda tam drukarki. Zwraca `[]`, nigdy `null` - udokumentowany wyjatek od
      dyscypliny sentinela, bo to LISTA i pusta tablica legalnie znaczy "brak szwalni"
      (ten sam wybor co `getAllFabrics`). Po tym cieciu `Production.jsx` nie wnosi juz
      ZADNEJ nazwy wlasnej Alexa jako wartosci (zostala jedna w komentarzu przy `id`
      podmenu); kody drukarek DGEN/YOKO/YUMI zostaja i ida w 2e.
    - `canSew` wymaga NIEPUSTEJ listy, nie samej flagi. Bez tego klient z
      `features.sewing: true` i pusta lista dostawalby pozycje z pustym podmenu -
      dokladnie ten drugi, zly "off" opisany przy shopify (flaga on + pusty handle).
      Tam nie dalo sie tego domknac w cieciu, tu jedno miejsce wystarczylo. Przy
      NIEODCZYTANYM profilu nic sie nie zmienia wzgledem `6a615ff` - pozycje gasi juz
      sama flaga - wiec seria "cichej nieobecnosci" w ETAPIE 4 NIE rosnie o kolejny
      przypadek.
    - POLOWA ZAPISOWA (edytor) NIE jest czescia tej pozycji ani wiszacym checkboxem
      w niej - zyje jako osobne ciecie w sekcji "Edytory operacyjne (Settings)" nizej.
      Konsekwencja na dzis: liste szwalni zmienia sie edytujac wiersz profilu w bazie,
      nie w UI.
    - **ZNALEZISKO - to WLASCIWOSC, nie przeoczenie.** `SewingReceive.jsx:23`
      (`companyOf`) buduje chipy firm z `file_stages.sewing_company`, czyli z BAZY,
      a nie z profilu. Dzieki temu wiersz wyslany do firmy, ktora klient pozniej usunal
      z profilu, nadal renderuje sie poprawnie - historia nie zalezy od biezacej
      konfiguracji. NIE "poprawiac" tego na odczyt z profilu przy 2e.
    - **REGULA 6 zadzialala DRUGI raz i w PRZECIWNA strone niz przy shopify.** Tam
      test-ozdoba zostal WZMOCNIONY, tu zostal USUNIETY. Roznica jest mierzalna, nie
      uznaniowa: wejscie `["Olya","Vagabond"]` bylo scislym PODZBIOREM wejsc testow
      `mixed array` i `trims` (jedyne, w ktorym i filtr, i trim sa no-opem), wiec kazda
      wiarygodna mutacja zabijala je razem - zmierzone: `.reverse()` -> 3 padniete,
      `.slice(0,1)` -> 3 padniete - i nie dalo sie zbudowac mutacji ROZROZNIAJACEJ.
      Nie byl tez diagnostykiem, wiec wyjatek "zostaje swiadomie z komentarzem" go nie
      obejmowal. Regula ma teraz OBA precedensy: WZMOCNIC, gdy mutacja rozrozniajaca
      istnieje; USUNAC, gdy nie istnieje. Multi-kill nadal jest sygnalem do proby
      rozroznienia, nigdy od razu werdyktem.
    - Bramki renderera bez stalego straznika PIATY raz z rzedu - DANA. Okablowanie
      (`canSew`, `.map` po children, wpis w RECZNEJ tablicy deps `useMemo`) sprawdzone
      wylacznie recznie, przez prawdziwy helper; testy pokrywaja sam helper.
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
    - **Koszt tego dlugu urosl przy 2f i jest to zmiana RODZAJU, nie skali.** Do tej pory
      zasiany `DEFAULT_PROFILE` podsuwal klientowi #2 dane Alexa sterujace LINKIEM (handle
      Shopify), WIDOCZNOSCIA (flagi zakladek) albo SCIEZKA (hotfoldery). Od 2f ten sam
      zasiany wiersz niesie `scanRules`, czyli steruje STANEM PRODUKCJI: skan na stacji
      przesuwa pliki miedzy etapami wedlug regul, ktorych u tego klienta nikt nie ustawil.
      I nie jest to stan przejsciowy - wiersz jest ZAPISANY do bazy przy pierwszym
      uruchomieniu, wiec klient dostaje konfiguracje Alexa jako WLASNY, TRWALY wiersz,
      nieodrozninalny od ustawionego swiadomie. 2d, 2e i 2g dokladaja do tego samego
      wiersza hotfoldery i drukarki.
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
- [x] **2c-bis - pozostale cztery flagi** (`ripErrors`, `labelPrinting`, `shopify`, `sewing`).
      ZAMKNIETE - wszystkie cztery, kazda osobnym cieciem: `cd8b466`, `238ac1c`,
      `bc68fbe`, `6a615ff`. Pierwszy raz od dawna domyka sie CALY pod-krok, nie
      pojedyncza flaga.
      **Namiary PLIK:LINIA maja DATE WAZNOSCI.** Kazde ciecie grepowalo swiezo i wierzylo
      grepowi, nie zapisowi - hipoteza z pomiaru upadla CZTERY razy: `fabricCache`
      (2c-null-a), auto-print w `submitBatch.js` (`labelPrinting`), lens ORDERS
      (`shopify`), `QC_ACTION` jako martwy kod (`sewing`). Namiary `sewing` ponizej byly
      przesuniete o ~23 linie, a handlerow jest SZESC, nie piec.
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
    - [x] ZROBIONE (`238ac1c`). Werdykt (B): dwa niezalezne wejscia renderera bez
      wspolnego stanu, wiec kazde bierze `isFeatureEnabled` W MIEJSCU WYWOLANIA -
      nie ma nic posrodku, co dawaloby sie zabramkowac raz. Oba UKRYTE, nie
      zaszarzone. TRZY sciezki do drukarki, nie dwie:
      (1) auto-print `submitBatch.js:85` - najwazniejsza, bo bez zadnego klikniecia:
      `labelPrintMode` domysla `"automatic"`, a `labelPrinter.js` pomija `deviceName`
      przy pustym `labelPrinterName`, wiec leci na DOMYSLNA drukarke systemowa stacji.
      Bramka tylko w rendererze zostawilaby klienta bez flagi z etykieta przy kazdym
      batchu; (2) przycisk w `BatchHistory`; (3) menu w `Production`.
    - Bramka stoi w DWOCH warstwach + handlerze IPC (`label:printBatch`). Handler
      jest swiadomym odejsciem od precedensu z `cd8b466`, gdzie bramke po stronie main
      odrzucono: tamten handler tylko CZYTAL, ten wykonuje EFEKT FIZYCZNY. Kryterium
      brzmi "co sie stanie, gdy bramka renderera zniknie w przyszlym cieciu", nie "czy
      ktos dzis moze to wywolac" - 2e przerabia `Production.jsx` szeroko.
    - `BatchHistory` bramkuje W RENDERZE, celowo NIE w efekcie on-mount ustawiajacym
      `canPrintLabel`: profil rozwiazuje sie po mount, wiec fail-closed wpiety w ten
      efekt zgasilby przycisk na cala sesje.
    - **PULAPKA dla kolejnych flag:** `useMemo` budujace menu kontekstowe w
      `Production.jsx` ma RECZNE deps z `eslint-disable-line react-hooks/exhaustive-deps`.
      Kazda kolejna flaga uzyta przy budowie menu musi trafic do tej tablicy RECZNIE -
      lint tego NIE zlapie, a memo zapamietane przed rozwiazaniem `profile:get`
      pokazywaloby nieaktualna pozycje. Przy `sewing` bedzie dokladnie to samo miejsce,
      bo "Send to Sewing" zyje w tym samym menu.
    - Swiadomie odrzucone przy tym cieciu, NIE sa dlugiem: staly test dwoch wejsc
      renderera - ta sama luka i ten sam powod co przy kaflu `OverviewPanel` w
      `cd8b466` (wymagalby pierwszego w repo testu renderujacego). Test handlera
      natomiast POWSTAL (`labelPrintBatchGate.test.js`) - okazal sie tani, bo
      `toLocalBatchPath.test.js` juz mockuje `electron`, wiec wystarczylo przechwycic
      rejestrowany handler zamiast go wyrzucac.
- **Wejscia renderera bez stalego straznika DRUGI raz z rzedu** (`ripErrors`: kafel
  `OverviewPanel`; `labelPrinting`: oba wejscia) - to DANA, nie zobowiazanie.
  Harness renderujacy jest ODRZUCONY, nie odlozony: repo nie ma ANI JEDNEGO testu
  renderujacego komponent i pod 2c-bis go nie dostanie. Powody, wszystkie sprawdzalne
  za rok: zmierzona liczba awarii z braku tych testow wynosi ZERO; jedyny klient
  (Alex) ma wszystkie flagi `true`, wiec zadna z tych bramek u niego nie strzela -
  testowaloby sie sciezke, ktorej dzis nikt nie wykonuje; `Production.jsx` to 76 KB,
  dziesiatki hookow i IPC w efektach, wiec jego wyrenderowanie wymaga sciany mockow
  o koszcie nieproporcjonalnym do jednego asserta o widocznosci pozycji menu;
  budowanie tego teraz to praca pod hipotetycznego klienta #2, czyli wprost to, czego
  zabrania regula anti-over-engineering w `CLAUDE.md`; a wieksze ryzyko sprzedazowe
  niesie zablokowany ETAP 5 (brak probek nazw plikow klienta #2) niz brakujacy test
  renderera. WARUNEK powrotu, nie plan: jesli `sewing` i tak bedzie dotykal miejsca
  budujacego menu kontekstowe albo zakladki RECEIVE, wolno wyodrebnic czysta funkcje
  (`buildContextMenuItems(...)` lub odpowiednik) i przetestowac ja BEZ renderu i BEZ
  nowych zaleznosci dev, jako produkt uboczny tamtego ciecia. Osobnego ciecia "dodajmy
  testy renderera" nie otwieramy. Temat wraca wylacznie z KONKRETNA AWARIA.
  - `shopify`: `Production/Production.jsx:1375` (lens ORDERS) i `:1557` (lens BATCHES) -> `:671`;
    `DataList/DataList.jsx:413` -> `:416` -> `:147`;
    `BatchHistory/BatchHistory.jsx:1079` -> `:1083` -> `:626`; `services/fileService.js:55`
    - [x] ZROBIONE (`bc68fbe`). DWIE czesci, druga wazniejsza.
      CZESC 1 - bramka. Werdykt (B): zero wspolnego stanu, kazde wejscie bierze
      `isFeatureEnabled` W MIEJSCU WYWOLANIA, wszystkie UKRYTE, nie zaszarzone. Bramka
      takze w mainie (`openInShopify.js`), z tego samego powodu co `label:printBatch`
      w `238ac1c`: handler wykonuje EFEKT - otwiera przegladarke.
      CZESC 2 - koniec podstawiania cudzego sklepu. `getStoreHandle` siegal po
      `DEFAULT_PROFILE`, czyli literal `"fashionformulauk"`. Klient z `features.shopify`
      i bez wlasnego handle - albo dowolna stacja z NIEODCZYTANYM profilem - dostawal
      link do admina CUDZEGO sklepu. Nie strone bledu, nie pusta: cudze zamowienia.
      Martwe dopoki Alex jest jedynym klientem, zywe od drugiego. Brak handle
      (`null` / `""` / same spacje / zly typ) to teraz jawny `MISSING_STORE_HANDLE`
      w istniejacej kopercie `toIpcError`. Kolejnosc: flaga -> orderName -> handle.
      `DEFAULT_PROFILE` i `shopProfile.js` NIETKNIETE - to dwa osobne ciecia pozniej.
    - **POPRAWKA NAMIAROW.** Namiary powyzej (z `19bbb24`) sa BLEDNE w dwoch punktach,
      zweryfikowane grepem przy tym cieciu: `Production.jsx:1375` nie jest w lensie
      ORDERS tylko w galezi `if (viewMode === VIEW_MODE.RECEIVE)`; a wejsc renderera
      jest CZTERY, nie trzy - `Production.jsx` wnosi DWA niezalezne pushe w jednym
      `useMemo`. Lens ORDERS (`OrderView.jsx`) nie ma menu kontekstowego W OGOLE
      (zero `onContextMenu`/`setContextMenu`), wiec nie ma tam czego bramkowac.
    - **Namiary PLIK:LINIA w tym pliku maja DATE WAZNOSCI.** Kazde ciecie grepuje
      swiezo i wierzy grepowi, nie zapisowi - pomiar z `19bbb24` juz sie rozjechal,
      a hipoteza mentora upadla przy pomiarze po raz TRZECI (`fabricCache` w 2c-null-a,
      auto-print przy `labelPrinting`, lens ORDERS tutaj).
    - Bramki renderera bez stalego straznika TRZECI raz z rzedu - DANA. Uzasadnienie
      stoi w `50f64c8`, nie powtarzamy go.
    - **REGULA 6 zadzialala po raz pierwszy w praktyce.** Test `never substitutes the
      seeded default handle` w pierwotnym brzmieniu byl OZDOBA - nie dalo sie
      skonstruowac mutacji zabijajacej go bez zabicia testu dokladnego URL-a. Zamiast
      kasowac, zostal WZMOCNIONY: przechodzi oba przypadki (sklep z handle i sklep bez)
      i asertuje DOKLADNIE jedno `openExternal`. Po wzmocnieniu mutacja M4 (przywrocenie
      fallbacku na `"fashionformulauk"`) go zabija, a test URL-a przezywa - para jest
      realnie rozrozniajaca. Regula dziala tak, jak zostala zapisana: multi-kill to
      sygnal do mutacji rozrozniajacej, a ozdobe sie wzmacnia, nie usuwa.
  - `sewing`: `Production/Production.jsx:1618-1619` (zakladka RECEIVE) -> `:1770-1771` (render);
    `:1471` ("Send to Sewing"); handlery `:364, 381, 418, 831, 864`;
    `Production/SewingReceive.jsx:29`; `services/productionService.js:7,8`
    - [x] ZROBIONE (`6a615ff`). Flaga NIE usuwa etapu z przeplywu: `STAGE_NEXT` ma juz
      `qc -> packed`, a szwalnia to OPCJONALNA galaz. Usuwa TRACKING hand-offu do
      ZEWNETRZNEGO podwykonawcy - klient szyjacy u siebie niczego nie wysyla i nie
      odbiera. Maszyna stanow nietknieta.
      CZTERY wejscia renderera, WSZYSTKIE w `Production.jsx`: przycisk zakladki RECEIVE,
      galaz renderu, "Send to Sewing", "Receive from sewing". Pozycje menu WEWNATRZ
      galezi RECEIVE nie potrzebuja wlasnej bramki, bo `setViewMode(VIEW_MODE.RECEIVE)`
      wystepuje DOKLADNIE RAZ i stoi w zabramkowanym bloku - lens jest NIEOSIAGALNY,
      nie tylko ukryty. Do tego korekta stanu w renderze (wzorzec `App.jsx:51`), bo sam
      fallback renderu zostawialby `viewMode` na RECEIVE, a `useMemo` menu galezi po
      `viewMode`, nie po fladze: ekran pokazywalby Batches, a menu oferowalo RECEIVE.
    - Bramka w main mocniej uzasadniona niz przy poprzednich flagach: te kanaly zmieniaja
      STAN PRODUKCJI w bazie, a nie odpalaja urzadzenie. Bez niej plik parkowalby na
      `to_sewing` - w etapie, ktorego klient nie kupil - a zabramkowana sciezka odbioru
      odmawialaby go przyjac.
    - **`stage:advance` SWIADOMIE NIEbramkowany, przypiete testem.** Etap, do ktorego
      nikt nie wejdzie, jest OK; etap, z ktorego nikt nie wyjdzie, nie jest. Wiersze
      legacy na `to_sewing` zachowuja "Go back" (`STAGE_PREV[to_sewing] = qc`)
      i "Rollback", oba na niebramkowanych kanalach. Niedomknieta sciezka zgloszona,
      nie zamieciona: `undoReceiveFiles` (`Production.jsx:513`) wchodzi w `to_sewing`
      przez generyczny `stage:advance`; osiagalne tylko z lensu RECEIVE, dla pliku
      w `receivedInSession` na `packed`, czyli niemozliwe przy fladze off - zamkniecie
      wymagaloby bramkowania po stanie docelowym, co uwiezilo by wiersze legacy.
    - Refaktor `buildContextMenuItems` NIE zrobiony: memo ma ~300 linii i domyka ~20
      handlerow, czyli jest refaktorem samym w sobie, a nie produktem ubocznym dodania
      jednego boolean - warunek z `50f64c8` nie zostal spelniony.
    - Bramki renderera bez stalego straznika CZWARTY raz z rzedu - DANA.
- [ ] **2d - Nazwy hotfolderow** do profilu (`createXML.js`, `customOrderHandlers.js`, `getRootPath.js`)
- [ ] **2e - Drukarki -> `printers[]`** (NAJSZERSZY zasieg, w tym regexy widocznosci)
  - **Liczby grepa - kazda z komenda, pytaniem i JEDNOSTKA.** Zmierzone na `95ecccb`.
    Bez tych trzech rzeczy liczba nie jest pomiarem, tylko data waznosci.

    | wariant | komenda | pytanie | LINIE | WYSTAPIENIA | PLIKI |
    |---|---|---|---|---|---|
    | A | `git grep -c "DGEN\|YOKO\|YUMI" -- src/` (oraz `-o \| wc -l`, `-l \| wc -l`) | ile razy kody drukarek wystepuja w calym `src/`, RAZEM z testami | 46 | 77 | 18 |
    | B | to samo + `':!*.test.js'` | ile razy wystepuja w kodzie PRODUKCYJNYM | 28 | 56 | 13 |
    | E | to samo + `':!*.test.js' ':!src/electron/helpers/defaultProfile.js'` | ile razy wystepuja w kodzie produkcyjnym POZA seedem profilu | 25 | 53 | 12 |

    LINIE bierze `git grep -c` (liczy WIERSZE z trafieniem, nie trafienia),
    WYSTAPIENIA `git grep -o ... | wc -l`, PLIKI `git grep -l ... | wc -l`. To trzy rozne
    liczniki i mieszanie ich pod jedna etykieta "wystapienia" jest zrodlem polowy
    zamieszania ponizej.
  - **ODWOLANIE wczesniejszego zdania z tego wpisu.** Stalo tu, ze liczba "rozjechala sie
    juz drugi raz". To NIEPRAWDA. Historyczne `53/12` odtwarza sie DOKLADNIE jako wariant
    E, `46/18` jako wariant A (linie/pliki), `56/13` jako wariant B (wystapienia/pliki).
    Zadna nie byla bledna - kazda odpowiadala na inne pytanie, a czesc roznicy to po
    prostu inny LICZNIK podany pod ta sama etykieta. `53/12` bylo poprawne w czasie, gdy
    `defaultProfile.js` (3 wystapienia) jeszcze nie istnial: zmienilo sie REPO, nie pomiar.
    Namiar starzeje sie nie dlatego, ze ktos zle liczyl, tylko dlatego, ze nie zapisywano
    PYTANIA i JEDNOSTKI obok liczby. **Regula dla 2e: grepuj od nowa i zapisz komende
    obok wyniku.**
  - **Odrzucona czwarta para (20/10).** Pochodzila z `grep -rn ... | wc -l` na KOPII drzewa
    (~90 plikow, zero testow, stan `2d13c4f`) - liczy linie w podzbiorze, ktorego nie da
    sie odtworzyc z repo. Nie jest wariantem do zapisania i nie szukamy dla niej wzorca.
    Odmowa wpisania jej do trackera byla poprawna: liczba bez definicji nie wchodzi.
  - **WLASCIWY NAMIAR DLA 2e TO PONIZSZA LISTA, NIE LICZBA TRAFIEN.** "Ile razy wystepuje
    string DGEN" nie jest zakresem pracy - komentarz i tekst pomocy tez sa trafieniem, a
    siedem miejsc wiazacych zachowanie z drukarka NIE ZAWIERA tych literalow i zaden grep
    literalowy ich nie widzi. Zakresem jest: ile miejsc wiaze ZACHOWANIE z TOZSAMOSCIA
    drukarki. Policzone recznie na `95ecccb`, 2026-09-05:

    **(1) Producent sufiksu - jedno miejsce, zrodlo dla wszystkich parserow ponizej**
    - `helpers/createBatchIds.js:31` - sklada nazwe folderu
      `PRINTED_HHMMSS-GROUP-<PRINTER>`. To ONO tworzy dane, ktore cztery regexy potem
      parsuja. Nie bylo na liscie kandydatow, a jest pierwsze do zmiany: dopoki zapisuje
      kod spoza profilu, parsery musza go umiec przyjac.

    **(2) Parsery kodu z nazwy folderu - 4 definicje regexa, 7 wywolan**
    - `ipc/readPrintedFolder.js:14` (`BATCH_FOLDER_RE`, uzyte w `parseBatchFolderName`)
      - **TWARDA BRAMKA WIDOCZNOSCI**: folder z kodem spoza listy zwraca `null`, czyli
      batch NIE ISTNIEJE w BatchHistory. Najostrzejsza konsekwencja na calej liscie.
    - `helpers/db.js:44` (`PRINTER_RE`) - jedna definicja, **TRZY** wywolania:
      `:617`, `:930`, `:1169`. Wpis mowil o "db.js" jak o jednym miejscu.
    - `ipc/submitBatch.js:93` - kod na etykiete batcha (auto-print).
    - `ui/Production/Production.jsx:139` - kod dla badge'a w naglowku grupy batcha.
    - `ui/Production/Production.jsx:588` - kod dla etykiety drukowanej ponownie z menu.

    **(3) Routing i walidacja - decyduja, DOKAD idzie praca**
    - `ipc/createXML.js:59-60` - mapa kod -> hotfolder (`DGEN` -> COTTON,
      `YOKO`/`YUMI` -> POLY); `:61` rzuca `ERR_INVALID_PRINTER` dla kodu spoza mapy.
    - `ipc/createXML.js:152` - sciezka hotfoldera budowana z tej mapy.
    - `ipc/createXML.js:86` - `<Printer>` w XML: kod wychodzi do PrintFactory.
    - `ipc/customOrderHandlers.js:108-109` - straznik poly-only dla zamowien custom.
    - `ui/DataPrintSelection/DataPrintSelection.jsx:14-16` - tablica
      drukarka -> `materialType`, czyli blokada materialu przy wyborze.
    - `ui/DataPrintSelection/DataPrintSelection.jsx:47` - `Cottons` automatycznie
      wybiera `DGEN`. Zaszyty DOMYSLNY wybor, nie tylko lista.

    **(4) Kolory i listy w UI - degraduja, nie lamia, ale wszystkie ida do profilu**
    - `ui/constants/printerColors.js:2-4` - mapa `PRINTER_COLORS`.
    - **Siedem dynamicznych odczytow `PRINTER_COLORS[printer]`, NIEWIDOCZNYCH dla grepa
      literalowego** (kazdy z wlasnym szarym fallbackiem):
      `Analytics/Summary/Summary.jsx:67`, `BatchHistory/BatchRow.jsx:36`,
      `CustomOrder/CustomOrderHistory.jsx:49`, `OverviewPanel/OverviewPanel.jsx:122`,
      `Production/OrderView.jsx:31`, `Production/ProductionCard.jsx:170`,
      `Production/ProductionRollbackModal.jsx:239`. Osma jest
      `Production/Production.jsx:141` (ta ma literal, bo stoi obok regexa).
    - `ui/BatchHistory/BatchHistory.jsx:36` - lista filtra z `Object.values(PRINTER)`.
    - `ui/CustomOrder/CustomOrderCard.jsx:9` - lista poly do wyboru w karcie.
    - `ui/Analytics/Details/Details.jsx:16` - lista filtra `PRINTER_OPTIONS`.
    - `ui/Analytics/Details/Details.jsx:24-25` - **klasa materialu pozycza kolor
      drukarki** (`Cottons` bierze kolor `DGEN`, `Polyesters` kolor `YOKO`). Wiazanie
      semantyczne miedzy dwoma roznymi pojeciami; przy 2e i 2g trzeba je rozciac.

    **(5) Definicja**
    - `shared/constants.js:14-16` - `PRINTER`. Ostatnia do usuniecia, nie pierwsza.

    **NIE jest zachowaniem** (zostawione swiadomie na liscie, zeby nikt nie liczyl tego
    do zakresu):
    - `ui/Settings/views/FabricsView.jsx:347` - tekst pomocy "Cottons -> DGEN,
      Polyesters -> YOKO/YUMI". Do przepisania na neutralny przy 2h, nie przy 2e.
    - `helpers/defaultProfile.js` - 3 wystapienia to WARTOSCI seeda, czyli juz profil.
      Znikaja przy oproznieniu `DEFAULT_PROFILE` w ETAPIE 3, nie przy 2e.
  - regex na "ostatni segment po ostatnim -" + walidacja kodu `[A-Z0-9_]+`
  - test reczny: submit -> XML -> PRINTED -> BatchHistory -> Production dla KAZDEJ drukarki
  - [ ] getPrinterByCode jest case-insensitive (shopProfile.js, ETAP 1 krok 2),
        ale PRINTER.* porownuje sie scisle - ten sam kod przechodzi lookup i odbija
        sie od porownania. Przy 2e znormalizowac kod na WEJSCIU (uppercase przy
        wyciaganiu z nazwy folderu) i zaostrzyc lookup, zamiast luzowac go dalej.
- [x] **2f - `scanRules[]`** zamiast 4 galezi `workstationRole` (`2eeaa26`)
  - **Pomiar wejsciowy:** CZTERY galezie `workstationRole` w `handleScan`, z czego `cotton`
    i `polyester` IDENTYCZNE BAJT W BAJT (31/31 linii po podmianie samego literalu roli).
    Cztery galezie realizowaly DWIE reguly - `printed -> heatpress` i `heatpress -> qc` -
    zapisane czterokrotnie, w czterech roznych akumulatorach i z czterema tekstami.
  - **Co sie przenioslo: REGULY.** `from` / `to` / `notifyWhenEmpty` w `profile.scanRules[]`.
    **Co NIE: TOZSAMOSC STACJI.** `workstationRole` zostaje w electron-store i staje sie
    KLUCZEM do reguly. Dzieki temu skaner i `awaitingQc` czytaja nadal JEDNO wspolne
    zrodlo roli i nie moga sie rozjechac - gdyby rola trafila do profilu, a `awaitingQc`
    zostal na electron-store, stacja mogla by byc "qc" dla badge'a i nie-"qc" dla skanera.
  - Tablica, nie mapa: profil to wolny blob, a klucze obiektu z importu wymagalyby
    `Object.hasOwn` przeciw `constructor`/`toString` (ten sam problem, ktory `isViewEnabled`
    juz obchodzi). Tablica nie ma prototypu do przebicia. Rola `""` NIE ma wpisu - brak
    reguly JEST jej semantyka, a nie wyjatkiem w silniku.
  - **`notifyWhenEmpty` to ZAMROZONY DLUG, nie funkcja.** Istnieje wylacznie po to, zeby
    stacja QC dalej milczala przy pustym zbiorze, bo tak dziala dzis. Nikt nie wybralby
    `false` z przekonania.
    Czytany jako **`!== false`, NIE `=== true`**, i to jest nieoczywiste, wiec zapisane:
    lustro `getFeature` jest tu POWIERZCHOWNE. Tam kierunek fail-closed znaczy "nie dawaj
    funkcji"; tutaj ten sam kierunek znaczy "milcz", a cisza na skanerze jest dokladnie
    tym ryzykiem, ktore to ciecie zamyka. Tylko LITERALNE `false` wycisza stacje - string
    `"false"` z JSON round-tripu albo z importu CSV OSTRZEGA. Cisza musi byc poproszona.
  - **TRZY sciezki bez reguly, tylko jedna milczy:**
    (1) rola `""` - MILCZY, bo nigdy niczego nie przesuwala; toast na kazdym skanie stacji
    domyslnej bylby halasem o ustawieniu, ktorego nikt nie zmienial.
    (2) rola ustawiona + profil nieodczytany - OSTRZEGA ("Scan rules unavailable").
    (3) rola ustawiona + profil bez reguly dla niej - OSTRZEGA ("Role not in scan rules",
    z nazwa roli). Przypadek (3) byl CICHY w pierwszej wersji silnika i zostal poprawiony
    PRZED commitem: to ten sam ksztalt co "flaga shopify on + pusty handle" - ustawienie
    obiecujace cos, czego konfiguracja nie dowozi - tyle ze na FIZYCZNYM wejsciu operatora.
  - **JEDYNA swiadoma zmiana widoczna dla Alexa: toast na stacji rollpress.**
    stary: tytul `Advanced to QC` / tresc `N file(s) moved to QC.`
    nowy:  tytul `N files moved`   / tresc `Moved to QC`
    Czyli forma, ktorej trzy pozostale stacje juz uzywaly - tekst jest wyliczany
    z `STAGE_LABEL[to]`, bo regula to przejscie, nie ksiazka frazeologiczna. Nic wiecej
    sie nie zmienilo: oba komunikaty "Nothing to advance" i cisza stacji QC bajt w bajt.
  - Usuniete martwe pole `workstationRoles` z `defaultProfile.js` (zero czytelnikow,
    `RoleDropdown` ma wlasne `ROLE_OPTIONS`; REGULA 24). Przy `scanRules` staloby sie
    DRUGIM zrodlem prawdy o tym samym zbiorze. `git grep -n workstationRoles` -> zero.
  - **LUKA ZNANA, NIEZAMYKANA TUTAJ:** rola spoza `ROLE_OPTIONS` (`GeneralView.jsx:8-14`)
    jest nieustawialna z UI, choc `scanRules` moze ja nazwac. Domyka to edytor profilu
    w ETAPIE 3 - ten sam ksztalt co `MISSING_STORE_HANDLE` przy shopify.
  - **OGRANICZENIE DOWODU, nie zamiecione.** Trzecim argumentem `advanceStage` (gwardia
    optymistycznej wspolbieznosci, `WHERE ... AND stage = ?`) jest `f.stage`, nie
    `scanRule.from`. Rownowaznosc tych dwoch form jest PRZYPIETA TESTEM tylko od strony
    `getScanRule`: nigdy nie zwroci `from` innego niz pojedynczy niepusty string (tablica
    stagow -> `null`). Samego filtra `f.stage === scanRule.from` nie da sie przypiac bez
    harnessu renderujacego, odrzuconego w `50f64c8`. Zmierzone sonda wycinajaca silnik
    z `Production.jsx` i uruchamiajaca go na atrapach, POZA repo - sonda nie jest testem
    i nie zostala zacommitowana.
  - **Dowod okablowania per REGULA, nie hurtem** (u Alexa istnieja wszystkie cztery, wiec
    pomiar zbiorczy nic by nie dowodzil): usuniecie/zmiana JEDNEJ reguly `cotton`
    zatrzymuje wylacznie stacje cotton, `polyester` (jej bajtowy blizniak) dziala dalej.
    `notifyWhenEmpty` przypiete osobno: flip `false -> "true"` i `false -> "false"` na
    regule `qc` zapala ostrzezenie, ktore przy literalnym `false` nie leci.
  - Bramka: 243/243 testow (baseline 219, +24, ZERO modyfikacji istniejacych), lint
    czysty, golden 0/70, `Production.jsx` 1947 -> 1918 linii (-29).
  - `getScanRule` mieszka w `shopProfileData.js` obok `getSewingCompanies` - czysta
    funkcja, jedyny ksztalt tego ciecia, ktory w ogole moze niesc test bez harnessu.
    Bramki renderera bez stalego straznika PIATY raz z rzedu - DANA.
- [ ] **2g - Klasy materialu** (2 sloty, konfig etykiet+przynaleznosci) + typy produktow + wymiary
      (`productTypes[]`, dzis SAMPLE/FQ/TEA_TOWEL zaszyte)
  - **KOLEJNOSC 2g/2h ustalona po STOP-ie z rekonesansu** - poprzednia proba wzieta od
    konca (najpierw `productTypes`) uderzyla w dwie przeszkody naraz i nie dalo sie jej
    zaczac. Wlasciwa kolejnosc, od dolu:
    1. **stub goldena zna profil** - ZROBIONE, `3e47d6c`.
    2. **hydraulika parsera: konfiguracja ARGUMENTEM** - ZROBIONE, `284e38e`.
       **UWAGA - ten commit zrobil WIECEJ, niz mowi jego tytul.** Wiadomosc mowi tylko
       "take the shop config as an argument", ale diff dodatkowo OZYWIL `productTypes`:
       resolver `resolveProductDims` w `parseFileName.js` czyta je i jest ich PIERWSZYM
       konsumentem. Stalo sie tak, bo mechanizm bez konsumenta bylby czwartym martwym
       polem i nie dalo by sie przetestowac sciezki "konfiguracja przekazana => uzyta";
       `DEFAULT_PROFILE` niesie dokladnie te same liczby co `DIMS_*`, wiec no-op zostal
       zachowany. Historii nie przepisujemy - zapisane tutaj, zeby pozniejszy czytelnik
       nie szukal osobnego commita "productTypes", ktorego nie ma.
       `parsePrintFileName(fileName, { ..., shopConfig })`, siedem call-site'ow w `src/`
       plus harness. Czysty no-op: golden 0/70, 30 testow charakteryzacyjnych bez jednej
       modyfikacji.
       **Koszt tego kroku NALEZY DO ETAPU 5, nie do 2g** - nie liczyc go drugi raz jako
       ceny 2g. Kryterium ETAPU 5 brzmi "27 testow charakteryzacyjnych przechodzi BEZ
       modyfikacji", a parser siegajacy po globalne cache'e importem nie da sie wyodrebnic
       do `parsers/fashionFormula.js`, bo zabierze ze soba lancuch
       `electron`/`better-sqlite3`. Hydraulika splaca dlug, ktory i tak stal na liscie,
       i odblokowuje 2g, 2h/fabrics oraz ETAP 5 naraz.
    3. **`productTypes` jako zrodlo wymiarow** - ZROBIONE w `284e38e` (patrz wyzej).
       Zostaje wylacznie decyzja z Q8: co ma sie dziac przy profilu NIEODCZYTANYM,
       zamiast dzisiejszego cofniecia do wymiarow Alexa - to jest DLUG opisany nizej,
       domykany razem z krokiem 4.
    4. **listy klas** (`COTTON_MATERIALS_FALLBACK` / `POLY_MATERIALS`) - ZROBIONE, `0bf8aa6`.
       Usuniete obie: 33 nazwy bawelen + 88 poliestrow, 121 unikalnych. Klasa przychodzi
       z `fabrics.type`, a gdy katalog nie odpowiada - `"Unknown"`.
       `getXmlWidthFromCache` stracil argument `isPoly` i galaz `LM_XML_COTTON`, i zwraca
       `null` dla tkaniny spoza katalogu. Flaga byla liczona przez WOLAJACEGO z listy,
       o ktorej `fabricCache.js` nic nie wiedzial - to ten rozjazd pozwalal dwom sciezkom
       nie zgadzac sie na pieciu ze 132 tkanin Alexa.
       Dolozony komunikat dla operatora w `DataPrintSelection`, rozrozniajacy dwie
       przyczyny (niepelny katalog / katalog nieodczytany) - do tej pory blokada byla
       CALKOWICIE niema.
       Bramka: golden 0/70, 274 testy (261 -> 274, +13, caly przyrost w nowym pliku),
       lint czysty, zaden istniejacy plik testowy nietkniety.
       **`regenerateXmlForBatch` a `<MaterialType>Unknown</MaterialType>`** - swiadome
       ograniczenie zakresu, poparte pomiarem: wszystkie 121 nazw z usunietych list SA
       w 132-elementowym katalogu Alexa, wiec dla niego ta sciezka staje sie osiagalna
       w DOKLADNIE ZERU nowych przypadkow. Poszerza sie tylko dla tkaniny usunietej
       z katalogu PO wydruku.
    5. **wlasnosc liczb klas** (marginesy, domyslne szerokosci): profil czy
       `fabric_globals`. OSOBNE ciecie z wlasnym pomiarem - ma haczyk, ktorego oba
       warianty dotykaja: klucze `fabric_globals` (`marginCotton`/`marginPoly`) maja
       NAZWY KLAS wpisane w klucz, wiec trzecia klasa wymaga tam zmiany schematu.
       ODRZUCONE na tym etapie: "profil wygrywa, `FabricsView` przestaje edytowac" -
       odbieraloby klientowi funkcje, ktora ma dzis, i cofalo swiadoma decyzje z BUG 4.
    6. **skasowanie `printWidths.js`** - ostatnie, bo lamie ISTNIEJACY test
       (dziura (c) w bramce Etapu 2).
  - **LUKA, KTORA KROK 4 OTWORZYL, i jej domkniecie (`b06d57d`).** To NIE jest nowa
    funkcja - to zrownanie dwoch miejsc, ktore krok 4 rozjechal. Krok 4 zamienil zmyslona
    szerokosc na `null`, i to bylo poprawne W APLIKACJI: widok druku blokuje operatora
    i mowi dlaczego. W PLIKU ZADANIA dla PrintFactory ta sama uczciwosc zamienia sie
    w malformed job, bo format nie ma jak powiedziec "nie wiem".
    Zmierzone: `escapeXml` to `String(value ?? "")`, wiec `null` NIE daje slowa "null",
    tylko PUSTY element `<Width></Width>` - plik powstaje, PrintFactory go bierze,
    nikt niczego nie zauwaza.
    Dwie sciezki produkcyjne do `buildPFJobXML`, obie przez `submitBatchToPrintFactory`:
    `submitBatch.js:56` - **zabramkowana w UI** blokada na klasie `Unknown`;
    `batchHistoryHandlers.js:358` (regeneracja) - **niezabramkowana w ogole**, czyta
    nazwy plikow z dysku i nie przechodzi przez widok druku.
    Dlatego bramka stanela U ZRODLA - raz, w `buildPFJobXML` - a nie w kazdym wywolaniu.
    Blad typowany jak `ERR_INVALID_PRINTER`, nazywa PLIK i TKANINE.
    **Czesc `<Width>` regeneracji jest tym domknieta**; `<MaterialType>` NIE - patrz nizej.
  - **`<Height>` mial ten sam problem, STARSZY niz krok 4, i bramka go objela.**
    Plik LM, ktorego `qty` sie nie parsuje, wychodzi wczesnie z `applyLmDimensions`
    i zostaje z tym, co dal tekst rozmiaru - czyli `null`, gdy tekst nie niesie wymiarow.
    Nie wprowadzil tego krok 4; jest rownie malformed w pliku zadania, wiec straznik
    sprawdza oba wymiary.
    - **KOMUNIKAT bramki rozroznia teraz dwie przyczyny (`8543364`).** To domkniecie
      defektu STARSZEGO niz krok 4, nie czesc pracy nad wymiarami. `b06d57d` odmawial
      jednym zdaniem - "dodaj tkanine do katalogu" - a dla tej drugiej przyczyny jest
      to instrukcja BLEDNA, nie tylko nieprzydatna: tkanina juz tam jest.
      Zmierzone na prawdziwej nazwie pliku, nie wywnioskowane:
      `ON312819_..._Stretch Jersey_1m_Linear Meter - 1m increments_XWD..._FF.pdf`
      -> `materialType` = Polyesters (tkanina JEST w katalogu), `qty` = null (token
      "1m", nie "1x"), `width`/`height` = null, `warnings` = [].
      Bramka pyta teraz katalog o to samo, o co pyta parser: tkanina, ktora katalog
      potrafi umiescic, nie jest problemem - wtedy komunikat wskazuje nazwe pliku
      i konfiguracje typow produktu. JEDEN kod bledu dla obu, bo to ta sama odmowa
      i nic nizej sie po kodzie nie rozgalezia; roznica nalezy do komunikatu, bo
      operator jest jedynym, kto na nim dziala.
  - **OTWARTE PYTANIE DO ZADANIA PRZY REALNYM RIP-IE: czy PrintFactory przyjmuje
    `<MaterialType>Unknown</MaterialType>`?** Nie da sie tego rozstrzygnac z repo,
    i to jest pomiar, nie unik: 70 baseline-ow goldena niesie WYLACZNIE `Cottons` (142)
    i `Polyesters` (81), a slowo `Unknown` nie wystepuje w zadnym z nich. Alex nigdy
    takiego XML-a nie wyslal, wiec repo nie ma dowodu w zadna strone. Argument ZA
    zabramkowaniem: to ten sam brak wiedzy co przy szerokosci. PRZECIW: `Unknown` to
    legalny string, ktory RIP moze przyjac, a pusty `<Width>` nie jest legalna liczba.
    Do sprawdzenia jednym zadaniem testowym na prawdziwym PrintFactory, zanim cokolwiek
    tu dopiszemy.
  - **DLUG: wbudowane wymiary jako fallback podstawiaja dane ALEXA.** Zywy od `284e38e`,
    zapisany ZANIM zaczal sie krok 4, bo komentarz w kodzie na to nie wystarcza.
    Siedem call-site'ow podaje `shopConfig: getProfile()`. Gdy profil jest NIEODCZYTANY,
    `getProfile()` zwraca `null`, `resolveProductDims` schodzi do `BUILT_IN_DIMS`, czyli
    do `DIMS_SAMPLE` / `DIMS_FQ` / `DIMS_TEA_TOWEL` - **wymiarow ALEXA**. U klienta #2
    z padnietym NAS-em daloby to `<Width>`/`<Height>` innej drukarni w jego XML-u.
    **To jest DOKLADNIE ten ksztalt, ktory usunal `bc68fbe`** (`feat(shopify): gate the
    Shopify link and stop substituting another shop's store`): fallback podstawiajacy
    dane innej drukarni zamiast przyznac sie do awarii. Tam bylo `fashionformulauk`
    i cudze zamowienia, tu sa cudze wymiary w XML-u.
    Dzis nieszkodliwe - jeden klient - ale nieszkodliwosc jest wlasciwoscia LICZBY
    KLIENTOW, nie kodu.
    Komentarz nad `BUILT_IN_DIMS` w `parseFileName.js` opisuje to poprawnie i **NIE
    WYSTARCZA**: ta seria pokazala trzy razy, ze rzecz zapisana tylko w komentarzu
    przezywa dwadziescia kilka commitow (opis sentinela `getShopProfile` - 23 commity;
    `mismatches: 0`; `Eco Astra Ramie`). Dlug musi stac w trackerze.
    **Domyka to KROK 4**, nie ETAP 3: krok 4 podejmuje te sama decyzje dla klasy
    materialu, a zostawienie dwoch roznych odpowiedzi na to samo pytanie ("czego uzyc,
    gdy nie wiemy") w jednym pliku byloby gorsze niz oba warianty osobno.
    - **STATUS: polowa MATERIALOWA domknieta (`0bf8aa6`), polowa WYMIAROWA PRZENIESIONA
      DO ETAPU 5.** Nie odlozona bez terminu - przeniesiona tam, gdzie sie ja faktycznie
      placi, z uzasadnieniem z pomiaru.
    - **CO ZMIERZONE (proba implementacji, cofnieta - zadnego commita):**
      `parseFileName.js` jest JEDYNYM konsumentem `DIMS_*`
      (`git grep -n "DIMS_SAMPLE|DIMS_FQ|DIMS_TEA_TOWEL|BUILT_IN_DIMS" -- src/ scripts/`;
      trafienia w `parseFileName.test.js` to KOMENTARZE, nie kod). Trzy testy
      charakteryzacyjne asertuja te liczby WPROST - `:77-78` (FQ 670/480), `:100-101`
      (SAMPLE 220/200), `:150-151` (TEA_TOWEL 700/500) - przy wywolaniu BEZ `shopConfig`
      (helper `:29`). Sonda wierna implementacji (stale usuniete ORAZ wszystkie trzy
      call-site'y obsluguja `null`): **3 padniete testy z 30**, plik przywrocony.
      Pierwsza sonda dala 8 - byla NIEWIERNA, bo `out.width = dims.width` wywalalo sie
      na `null` zanim doszlo do asercji. Odrzucona jako wlasny blad pomiarowy.
    - **CZEGO TE TRZY TESTY NAPRAWDE BRONIA - i dlaczego `toBeNull()` to nie zamiana.**
      Nie liczby 670, tylko tego, ze dla tych typow produktu wymiar bierze sie
      z LOOKUPU, a nie z tekstu nazwy pliku. Komentarze mowia to wprost:
      `:76` "width/height come from DIMS_FQ (670 x 480), not 650 x 480",
      `:99` "width 220 (NOT 200 from the '20 x 20 cm' text)",
      `:149` "applyTeaTowelDimensions -> fixed DIMS_TEA_TOWEL 700 x 500".
      Ta charakterystyka po cieciu NADAL bylaby prawdziwa - zmienia sie tylko zawartosc
      lookupu. `toBeNull()` jej NIE zapisuje, wiec zamiana skasowalaby stara asercje
      nie stawiajac nic w zamian.
    - **DLUG NIE SIEDZI W `printWidths.js`, tylko w SIATCE CHARAKTERYZACYJNEJ.** Zapis
      z `a39c577` lokowal go w zlym pliku. Wymiary Alexa sa wpisane w testy jako
      DEFINICJA poprawnego parsowania, wiec kazde ciecie usuwajace stale musi je zlamac.
      Roznica wobec kroku 4: tam mock `getXmlWidthFromCache: () => 1420` POCHLANIAL
      zmiane, wiec testy nie mialy o niej zdania. Tutaj wymiary nie przechodza przez
      zaden mock - ida prosto ze stalych do asercji.
    - **DLACZEGO PLACI SIE GO PRZY WYODREBNIENIU PARSERA.** Gdy logika trafi do
      `parsers/fashionFormula.js`, testy charakteryzacyjne ida z nia i 670/480 sa
      w NICH poprawne, bo opisuja parser ALEXA. Warstwa wspolna nie niesie wtedy
      zadnych wymiarow produktu - i to jest domkniecie dlugu, nie obejscie.
    - **DLACZEGO TO NIE JEST ODKLADANIE W NIESKONCZONOSC.** Dlug gryzie dopiero przy
      kliencie #2, a ETAP 5 jest ZABLOKOWANY dokladnie na kliencie #2 (brak probek nazw
      plikow). Wyzwalacz i naprawa przychodza razem; nie da sie trafic w okno, w ktorym
      dlug szkodzi, a naprawa jest niedostepna.
    - **ODRZUCONE DROGI (obie rozwazone i zmierzone, zeby nie wrocily jako pomysl):**
      (A) *zamiana trzech asercji na `toBeNull()`* - kasuje charakterystyke
      "lookup wygrywa z tekstem" nie stawiajac nic w zamian, i oslabia siatke tuz przed
      ETAPEM 5, ktory na niej stoi.
      (B) *furtka `shopConfig === undefined` -> stale, `null` -> nieznany* - trzy testy
      przechodza bez dotkniecia, ale utrzymuje wymiary Alexa przy zyciu pod
      technikalium i zastawia pulapke: przyszly call-site, ktory zapomni podac
      `shopConfig`, po cichu dostanie dane Alexa. Ten sam ksztalt co `bc68fbe`
      i `0bf8aa6`.
  - **ODRZUCONE DROGI NA SKROTY** (zapisane, zeby nie wrocily jako "pomysl"):
    - *profil przez `fabricCache.js`* - lamie zakontraktowana krawedz mocka dokladnie
      tak samo jak nowy import: `vi.mock` podmienia CALY modul, wiec nowy eksport bylby
      w mocku `undefined` i 30 testow charakteryzacyjnych padloby tak czy owak.
    - *setter modulowy w parserze* - omija call-site'y kosztem ukrytego stanu globalnego,
      zostawia parser nieczystym i nie splaca nic z ETAPU 5.
  - **MARTWE POLA W PROFILU** (`git grep -n "<pole>" -- src/ scripts/`). Zmierzone na
    `297ef22` jako TRZY; po `284e38e` zostaly **DWA** - `productTypes` ma juz konsumenta. Kazde lamie REGULE 24 dokladnie tak, jak usuniete w 2f
    `workstationRoles`: pole istnieje w `defaultProfile.js` i NIKT go nie czyta.
    - `materialClasses` (`defaultProfile.js:27`) - jedno trafienie, definicja. Zero
      czytelnikow. Marginesy i domyslne szerokosci bierze dzis `fabric_globals`.
    - ~~`productTypes`~~ - **JUZ NIE MARTWE** (`284e38e`): czyta je `resolveProductDims`
      w `parseFileName.js`, przez `options.shopConfig` podane przez call-site.
    - `printers[].materialClass` (`defaultProfile.js:10,16,22`) - poza definicja tylko
      fixture testowy `shopProfile.test.js:25-26`. Zero konsumentow produkcyjnych.
      **Jego konsument to `DataPrintSelection.jsx:14-16`** - dzis zaszyta tablica
      drukarka -> klasa materialu, ktora ustawia blokade wyboru drukarki (plus `:46-47`,
      gdzie `Cottons` automatycznie wybiera DGEN). **To nalezy do 2e, nie do 2g**: pole
      opisuje DRUKARKE, nie klase. Zapisane tutaj, zeby 2e nie zaczynalo od zera.
  - `productTypes` przestaje byc martwe dopiero wtedy, gdy `parseFileName.js` je czyta.
    Warunek wstepny: dziura (d) w bramce Etapu 2 - harness goldena nie laduje profilu -
    ORAZ krawedz mocka w `parseFileName.test.js`, ktora mockuje WYLACZNIE
    `./fabricCache.js` (`:7`), zeby import parsera nie ciagnal `electron` /
    `better-sqlite3`. Import `shopProfile.js` w `parseFileName.js` otwiera DRUGA,
    niezamockowana droge do `db.js` i lamie 26 testow charakteryzacyjnych, ktorych
    modyfikowac nie wolno. Zweryfikowane empirycznie: bezposredni import
    `shopProfile.js` w golym node konczy sie
    `The requested module 'electron' does not provide an export named 'app'`.
    Wniosek: wymiarow NIE da sie wciagnac przez nowy import w parserze. Trzeba je podac
    ARGUMENTEM (wzorzec BUG 4: `estimatePrintLength(files, config)`), co dotyka
    **8 miejsc wywolania** `parsePrintFileName` w `src/` plus `harness.mjs:42` - a wiec
    jest cieciem innego rozmiaru niz "dwa miejsca w `parseFileName.js`".

### 2h + pelne czyszczenie katalogu (MUST HAVE - cel: zero nazw Alexa w kodzie)

Dopiero po Etapie 1 (fallbacki maja czytac z profilu, nie ze statycznych list).

- [ ] `defaultFabrics.js`: usunac `COTTON_NAMES` / `POLY_NAMES`
- [ ] `getMaterialType.js`: statyczne listy nazw Alexa -> czytanie klas z `profile.materialClasses`
      (fallback zwraca "Unknown", nie liste Alexa)
- [ ] `printWidths.js`: mapy `LM_ROLL_COTTON` / `LM_XML_COTTON` (per nazwa Alexa) -> profil
      **UWAGA: docelowo NIE do profilu, tylko do `fabrics` - tam juz sa.** Obie mapy maja
      po 33 wpisy, a tabela `fabrics` niesie `xml_width` i `roll_width` per wiersz dla
      wszystkich 132 tkanin. To nie jest migracja danych, tylko decyzja, co ma sie dziac
      przy NIEZALADOWANYM cache'u (patrz dziura (a) w bramce Etapu 2).
      **Rozjezdzaja sie TRZY tkaniny, nie cztery** (`xml != roll` w obrebie map):
      `Hector Linen` (xml 1420 / roll 1460), `Limani Linen` (1370 / 1420),
      `Melino Linen` (1370 / 1420). `Organic Blossom Muslin Gauze` jest NIE-DOMYSLNA,
      ale SPOJNA (1270 / 1270) - tak samo `Organic Nimbus Linen` i `Organic Stratos
      Linen` (1370 / 1370). Wczesniejsza czworka mylila "nie-domyslna" z "rozjechana".
      Komenda produkujaca te liczbe: zaladowac oba eksporty z
      `src/shared/printWidths.js` i wypisac klucze, dla ktorych
      `LM_XML_COTTON[k] !== LM_ROLL_COTTON[k]`.
- [ ] Flagi `isVelvet` / `isLinen` / `isBlossom` - **opis skorygowany po pomiarze, zakres
      jest WEZSZY niz zapisano.** `getFabricFlag` (`createXML.js:44-52`) czyta flage
      z BAZY (`getFabricByName(item.material)` -> `fabric[flagKey]`); `name.includes()`
      jest WYLACZNIE fallbackiem dla materialu spoza katalogu i dodatkowo patrzy na nazwe
      PLIKU, nie tylko materialu. Czyli 2h nie musi tego "przenosic do profilu" - pola
      `is_velvet`/`is_linen`/`is_blossom` juz sa w `fabrics`. Do zrobienia zostaje decyzja,
      co ma sie dziac dla materialu NIEZNANEGO: dzis zgadywanie ze stringu, docelowo
      prawdopodobnie `false` + ostrzezenie, tak jak `getMaterialType` ma zwracac "Unknown"
      zamiast listy Alexa. Poprzedni opis ("wywodzone przez `name.includes()`") zawyzal
      zakres i sugerowal migracje, ktora juz sie odbyla.
- [ ] Katalog FF -> `profiles/fashion-formula-fabrics.json` (juz wyeksportowany w Etapie 0)
- [ ] `getSettings.js`: domyslne sciezki `O:\SPPrintReadyArtwork` / `\\192.168.0.17\...` -> `""`
- [ ] `defaultProfile.js:43`: `integrations.shopify.storeHandle: "fashionformulauk"` -> `""`.
      Zostalo po skasowanym 2a: konsument czyta juz profil (ETAP 1), ale seed nadal wnosi
      nazwe Alexa do kodu. Uwaga na `openInShopify.js` - fallback celowo uzywa `||`, wiec
      pusty handle liczy sie jako brak i degraduje zamiast budowac zly link
- [ ] `QC_ACTION` (`shared/constants.js:87`) to MARTWY KOD - jedno trafienie w calym
      `src/`, sama definicja, ZERO konsumentow (QCModal zostal usuniety). Odkryte przy
      `sewing`, gdzie brief zakladal, ze trzeba zabramkowac `QC_ACTION.SEWING` - nie bylo
      czego. Nalezy do sprzatania katalogu, NIE do 2c-bis; usuwac razem z `REJECTED` /
      `OVERRIDDEN`, po sprawdzeniu, czy stare wiersze w bazie tego nie czytaja
- [ ] Grep kontrolny: zero `if (clientId === "...")` w logice, zero zaszytych adresow,
      zero literalu "Fashion Formula" (audyt: byl jeden; osobno `"fashionformulauk"`
      wyzej - inny string, wiec grep na "Fashion Formula" go NIE lapie).
      Grep kontrolny ma szukac TRZECH rodzin, nie jednej:
      (1) "Fashion Formula" - nazwa firmy;
      (2) "fashionformulauk" - handle Shopify; INNY string, wiec grep z (1) go NIE
          lapie (juz zapisane przy kasowaniu 2a);
      (3) "Olya" / "Vagabond" - nazwy jego PODWYKONAWCOW. Po 2b (`fb9756f`) zostaly
          w DWOCH miejscach: jako wartosc seeda w `defaultProfile.js:42` oraz
          w KOMENTARZU w `Production.jsx` przy `id` podmenu. Konsument czyta juz
          z profilu, ale nazwy nie zniknely z kodu - dokladnie ten sam ksztalt co
          `storeHandle` po ETAPIE 1.
      Bramka przechodzaca na zielono z lista kontrahentow klienta w kodzie jest
      gorsza niz jej brak - to trzeci raz, gdy grep kontrolny okazuje sie wezszy
      niz obietnica, ktora niesie.
      **Pomiar po 2f zmienia charakter tej pozycji: wszystkie ZYWE nazwy Alexa zostaly
      juz TYLKO w `defaultProfile.js`.** `git grep` na trzech rodzinach, z wylaczeniem
      testow i `defaultProfile.js`, zwraca dwa trafienia i OBA sa komentarzami:
      `openInShopify.js:6` (wyjasnia, ze fallbacku juz nie ma) i `Production.jsx:1506`
      (przyklad slugowania "Olya"/"olya"). Zadnej zywej wartosci. W testach nazwy zostaja
      celowo - `openInShopify.test.js` asertuje, ze "fashionformulauk" NIE wychodzi.
      Konsekwencja: **"grep kontrolny na zero nazw Alexa" przestaje byc osobnym cieciem**
      i staje sie NASTEPSTWEM decyzji o oproznieniu `DEFAULT_PROFILE` na rzecz importu
      w ETAPIE 3. Zostaje jako weryfikacja po tamtej zmianie, nie jako praca do wykonania.
      Trzy rodziny do sprawdzenia i wylaczenie testow zostaja w opisie - to jest wartosc
      tej pozycji, nie sam fakt odpalenia grepa.

**WYJATEK - swiadomie ZOSTAJE (nie usuwac):**

- [x] `GROUP_NAME_OVERRIDES` (`createBatchIds.js`) - to NIE jest aktywny config, tylko
      legacy shim dla HISTORYCZNYCH batchy Alexa (juz wyparty przez kolumne `alias`).
      Usuniecie zepsulo by rozwiazywanie jego starych batchy. Dla nowego klienta to
      pusta mapa, ktora nigdy nie trafia. Zostaje z komentarzem "legacy fallback".

**Bramka Etapu 2 (po kazdym pod-kroku):** golden-diff XML bajt w bajt = zero roznic
na danych Alexa; 2e dodatkowo: batch z kazdej drukarki widoczny w BatchHistory i Production.

**CZEGO SIATKA GOLDEN NIE WIDZI - cztery dziury, zmierzone przy rekonesansie 2g/2h
(`297ef22`, 2026-09-05).** Zapisane, bo "golden 0/70" bywa czytane jako "wszystko
sprawdzone", a dla czterech klas zmian nie znaczy nic:

- **(a) Sciezka ZDEGRADOWANA nie jest uruchamiana ANI RAZU.** `scripts/golden/stub-db.mjs`
  zawsze karmi `fabricCache` pelnym katalogiem z `profiles/fashion-formula-fabrics.json`,
  wiec galezie `cachedFabrics === null` nie wykonuja sie w siatce. Rozjazd loaded vs
  degraded - **5 tkanin na 132 dostawalo inny `<Width>`**, patrz sekcja o BUG 4
  w `CLAUDE.md` - byl dla goldena calkowicie niewidoczny. Dowod dla tej klasy zmian
  musi byc testem jednostkowym, nie goldenem.
  **ZMNIEJSZONA przez `0bf8aa6`, nie zamknieta - odpowiedz z pomiaru, nie z odczucia.**
  Rozjazd 5/132 ZNIKNAL, bo zniknela druga odpowiedz: `getXmlWidthFromCache` nie ma juz
  galezi `cachedFabrics === null` z mapa `LM_XML_COTTON`, wiec przy niezaladowanym
  katalogu nie ma czego porownywac - jest `null`. Dziura jako KLASA problemu zostaje:
  `stub-db.mjs` dalej zawsze karmi cache pelnym katalogiem, wiec sciezka `null` nadal nie
  wykonuje sie w siatce ANI RAZU. Pokrywa ja `materialClassSource.test.js`, i tak ma
  zostac - golden jest siatka na XML z KOMPLETNYMI danymi, nie na degradacje.
- **(b) XML zamowien custom NIE MA baseline'u W OGOLE.** `buildCustomOrderXML`
  (`customOrderHandlers.js`) nie jest w siatce. A niesie `<Width>${LM_XML_POLY}</Width>`
  (`:40`) i zaszyte `<MaterialType>Polyesters</MaterialType>` (`:43`) - obie wartosci
  ZYWE, bez odczytu cache'u. **Dotkniecie tego pliku jest dzis niezabezpieczone.**
  Nie ruszac go, dopoki nie ma wlasnego baseline'u.
- **(c) `estimatePrintLength.test.js:3` importuje stale z `printWidths.js`**
  (`LM_ROLL_POLY`, `LM_ROLL_COTTON_DEFAULT`, `MARGIN_COTTON`, `MARGIN_POLY`). Usuniecie
  tego modulu ZLAMIE ISTNIEJACY test, a bramka wymaga ZERO modyfikacji istniejacych
  testow. To jest warunek wstepny ostatniego kroku 2h, nie niespodzianka do odkrycia
  w trakcie.
- **(d) Harness goldena NIE LADUJE profilu sklepu.** `harness.mjs:22` wola
  `loadFabricCache()` i nic wiecej; `stub-db.mjs` stubuje wylacznie katalog tkanin
  (`grep -n "shopProfile" scripts/golden/stub-db.mjs` -> zero trafien). Czyli KAZDA
  zmiana, ktora kaze `parseFileName.js` albo `createXML.js` czytac cokolwiek
  z `shopProfile.js`, zobaczy w siatce `cachedProfile === null`, pojdzie sciezka
  fail-closed i wyprodukuje 70 roznic - nie dlatego, ze kod jest zly, tylko dlatego,
  ze harness nie zna profilu.
  **ZAMKNIETE commitem `3e47d6c`** (`test(golden): load the shop profile in the harness`):
  `stub-db.mjs` serwuje `getShopProfile` z `DEFAULT_PROFILE`, a `harness.mjs` wola
  `loadShopProfile()` PRZED `loadFabricCache()`, w tej samej kolejnosci co
  `ipc/index.js:170-171`. Baseline nie drgnal (0/70), bo w chwili zmiany nic na sciezce
  `createXML` nie czytalo profilu - zmierzone przed pisaniem. Commit narzedziowy poszedl
  OSOBNO i PRZED czymkolwiek funkcjonalnym, bo zmienia harness, od ktorego zalezy baseline.
  Dziury (a), (b) i (c) pozostaja otwarte.

---

## Edytory operacyjne (Settings) - poziom KLIENTA, nie wdrozeniowy

Rzeczy, ktore klient zmienia SAM, w trakcie pracy, bez Filipa - jak `fabrics`
i `reason_definitions`. Odrebne od edytora profilu z ETAPU 3, ktory jest WDROZENIOWY
(podglad read-only + import/export walizki JSON).

- [ ] **Edytor szwalni w Settings** - poziom OPERACYJNY (klient zmienia podwykonawce
      sam, jak rollback reasons), wzorzec `RollbackReasonsView.jsx`. Osobne ciecie,
      NIE czesc edytora profilu z ETAPU 3, bo tamten jest wdrozeniowy i read-only.
      To polowa ZAPISOWA 2b.
  - [ ] Bedzie DRUGIM wejsciem zapisujacym profil, wiec obowiazuje go ta sama regula
        co edytor z ETAPU 3: `shopProfile` i `shopProfileStatus` zapisywane RAZEM,
        jednym `set()`.

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
  - [ ] spojnosc: `features.shopify === true` wymaga NIEPUSTEGO
        `integrations.shopify.storeHandle`. Bez tej reguly import przechodzi, a klient
        dostaje pozycje menu, ktora przy KAZDYM kliknieciu zwraca `MISSING_STORE_HANDLE`.
        Po cieciu `bc68fbe` istnieja DWA rozne "off" i tylko pierwszy jest poprawny:
        flaga off (pozycji nie ma) oraz flaga on + pusty handle (pozycja jest i zawsze
        zawodzi). Walidacja importu jest jedynym miejscem, ktore moze ten drugi stan
        wylapac, zanim zobaczy go operator.
  - [ ] spojnosc: `features.sewing === true` wymaga NIEPUSTEJ `sewingCompanies`. Bez
        tej reguly import przechodzi, a klient nie ma jak wyslac niczego do szwalni.
        Ta sama klasa co `storeHandle` wyzej, ale skutek jest INNY: tam pozycja menu
        istnieje i zawodzi przy kazdym kliknieciu, tu `canSew` wymaga niepustej listy,
        wiec pozycja w ogole nie powstaje - operator nie dostaje nawet bledu do
        zgloszenia, po prostu nie ma funkcji. Walidacja importu jest jedynym miejscem,
        ktore ten stan wylapie.
  - [ ] `sewingCompanies` bez DUPLIKATOW i z rozsadnym limitem dlugosci nazwy.
        `getSewingCompanies` filtruje smieci (nie-stringi, puste, same spacje) i
        przycina `trim()`, ale NIE normalizuje semantyki: dwa razy "Olya" da dwie
        identyczne pozycje w podmenu (rozne `id`, ten sam efekt), a bardzo dluga nazwa
        rozwali layout karty - nazwa trafia do `file_stages.sewing_company` jako wolny
        tekst i jest renderowana (`ProductionCard.jsx:198`, chipy w `SewingReceive.jsx`).
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
    - **Koszt urosl DRUGI raz z rzedu, przy 2c-bis (`labelPrinting`).** `getFeature`
      w mainie jest fail-closed i czyta cache ladowany RAZ przy starcie, wiec baza
      niedostepna w momencie `loadShopProfile()` = BRAK ETYKIET u Alexa do konca sesji,
      nawet gdy baza wroci minute pozniej - i bez zadnego sygnalu dla operatora, bo
      auto-print jest fire-and-forget, a przy (c) baza jest ZDROWA, wiec baner nie leci.
      Progresja jest jednokierunkowa: przy `ripErrors` nieodczytany profil UKRYWAL stan
      produkcji, teraz dodatkowo WYCISZA fizyczne urzadzenie. Kazda kolejna flaga
      podnosi cene tego samego niezalatanego defektu, wiec priorytet lazy retry rosnie
      z kazdym cieciem, a nie raz na zawsze.
    - **Koszt urosl TRZECI raz, przy 2c-bis (`shopify`) - opis OD STRONY OPERATORA,
      bo tu kod myli.** Przy nieodczytanym profilu operator NIE zobaczy komunikatu
      bledu. Zobaczy BRAK POZYCJI W MENU: bramka renderera gasi "Open in Shopify",
      zanim main zdazy cokolwiek odpowiedziec. `SHOPIFY_DISABLED` dociera tylko w
      waskim oknie, gdy renderer ma juz profil, a main jeszcze nie - czyli praktycznie
      nigdy. Netto: to CZWARTA funkcja, ktora przy nieodczytanym profilu znika CICHO,
      bez sladu dla operatora - zakladki (2c), etykiety (`labelPrinting`), detekcja
      bledow RIP (`ripErrors`), a teraz link do Shopify. Wzorzec jest juz jednoznaczny:
      fail-closed w rendererze zamienia kazda awarie konfiguracji w NIEOBECNOSC, a nie
      w blad. Lazy retry przestaje byc wygoda i staje sie jedynym sposobem, zeby
      operator w ogole dowiedzial sie, ze cos jest nie tak.
    - **CZWARTY raz, przy 2c-bis (`sewing`).** Przy nieodczytanym profilu znika zakladka
      RECEIVE i obie akcje szwalni - znowu bez komunikatu, bo bramka renderera gasi je,
      zanim main zdazy odmowic. PODSUMOWANIE calej serii: fail-closed w rendererze
      zamienia KAZDA awarie konfiguracji w NIEOBECNOSC, nie w blad, i dotyczy to juz
      pieciu obszarow - zakladki (2c), detekcja bledow RIP, etykiety, link do Shopify,
      obsluga szwalni. Operator nie ma zadnego sygnalu, ze widzi okrojona aplikacje.
      To nie jest wada bramek - fail-closed jest poprawny - to jest cena za brak lazy
      retry, ktora rosla przy kazdej z czterech flag i przestala byc teoretyczna.
    - **SZOSTY obszar, przy 2f (skaner) - i PIERWSZY, ktory NIE znika cicho.** Przy
      nieodczytanym profilu skan przestaje przesuwac etapy, ale zamiast zniknac bez sladu
      MOWI operatorowi, co sie stalo ("Scan rules unavailable"), w miejscu i w momencie
      dzialania. Powod jest konkretny, nie kosmetyczny: to pierwsza bramka profilu na
      FIZYCZNYM wejsciu operatora, a skan, ktory po cichu nic nie robi, jest
      nieodrozninalny od czytnika, ktory nie zadzialal - operator zaczyna szukac awarii
      sprzetu zamiast konfiguracji. Piec wczesniejszych obszarow to elementy INTERFEJSU
      (zakladka, przycisk, badge), gdzie nieobecnosc jest przynajmniej widoczna jako
      nieobecnosc.
      **To jest wzorzec dla kazdego kolejnego wejscia FIZYCZNEGO** (czytnik, waga,
      przycisk nozny, drukarka etykiet wywolana recznie), NIE dla zakladek i pozycji menu.
      Tam cicha nieobecnosc zostaje - jeden toast na kazdy render zabramkowanego widoku
      bylby gorszy niz problem. Roznica nie polega na waznosci funkcji, tylko na tym, czy
      operator ma inna, blednna hipoteze pod reka.
      Nie zmniejsza to jednak dlugu: lazy retry dalej jest potrzebny, bo komunikat mowi
      "profil nieodczytany", a nie "sprobuje ponownie" - stacja zostaje bez regul do
      restartu aplikacji.
- [ ] **Export diagnostics** - zip: ostatnie 500 logow, `shop_profile`, wersja, sciezki
      (bez zawartosci plikow), wynik testu dostepu do hotfolderow. Bez telemetrii
- [ ] **Kreator pierwszego uruchomienia** (sciezki -> import profilu -> test zapisu do hotfoldera)
- [ ] `changelog.json` - uzywac pola `clients` per wpis zamiast "all"
- [ ] Konce linii zaleza od MASZYNY, nie od repo. Nie ma `.gitattributes`, a
      `core.autocrlf=true` pochodzi z SYSTEMOWEGO gitconfiga Git for Windows
      (`C:/Program Files/Git/etc/gitconfig`) - w `.git/config` tego wpisu NIE MA,
      w globalnym tez nie. Zweryfikowane `git config --show-origin`. Na stacji z tym
      ustawieniem git normalizuje CRLF przy porownaniu, wiec plik zapisany z innymi
      koncowkami NIE POKAZUJE SIE w `git status` - tak bylo z `defaultProfile.js` po
      mutacji recznej przy 2c-bis: 1717 -> 1769 bajtow przy identycznych 52 liniach,
      `git status` czysty. Klon na maszynie bez tego ustawienia, albo CI na Linuksie,
      te roznice zobaczy. Domkniecie to `* text=auto eol=lf` w `.gitattributes`, ale
      przepisze koncowki w CALYM repo - OSOBNY commit, nigdy w srodku etapu, i NIE
      przed 2e (rozjechalby diff najwiekszego ciecia).

---

## ETAP 5 - Parser nazw plikow (OSTATNI, osobna galaz)

`parseFileName.js` = 623 linie; testy charakteryzacyjne w `parseFileName.test.js` to
jedyna realna siatka na tym pliku.

**Liczba testow, zmierzona - i skad wzielo sie "27".** Plik nie zmienil sie od
`fc02c01`; `grep -c "  it("` daje **26** blokow statycznych, a `vitest run` **30**
przypadkow, bo jeden z nich to `it.each` z pieciu wierszami (`:404`): 25 + 5 = 30.
Zapisane wczesniej "27" nie odpowiada zadnemu z tych pomiarow - nie bylo pomiarem.
To ta sama nauka co przy 2e: liczba bez komendy i bez jednostki (bloki czy przypadki?)
jest data waznosci, nie faktem.
Podejscie: NIE przepisywac. Wyodrebnic obecna logike, potem dodac druga.

- [!] **ZABLOKOWANE: brak probek nazw plikow od realnego klienta #2**
- [x] **Pierwszy krok wyodrebnienia ZROBIONY** (`284e38e`): parser bierze konfiguracje
      sklepu ARGUMENTEM (`options.shopConfig`) zamiast siegac po nia importem, wiec
      wymiary produktow nie wiaza go juz z warstwa danych. Golden 0/70, testy
      charakteryzacyjne bez modyfikacji.
      **Co ZOSTAJE do wyodrebnienia** - zmierzone, nie oszacowane: import
      `parseFileName.js` w golym node dalej konczy sie
      `The requested module 'electron' does not provide an export named 'app'`.
      Dwa wiazania, oba o MATERIAL, nie o wymiar:
      `getXmlWidthFromCache` z `fabricCache.js` (importuje `db.js`) oraz
      `POLY_MATERIALS` z `getMaterialType.js` (importuje `fabricCache.js`).
- [x] **Drugi krok: jedno z dwoch wiazan usuniete** (`0bf8aa6`). Parser nie importuje juz
      `getMaterialType.js` w ogole - `POLY_MATERIALS` przestalo istniec. Zostaje JEDNO
      wiazanie: `getXmlWidthFromCache` z `fabricCache.js`.
      **Parser DALEJ nie jest importowalny bez lancucha electron** - zmierzone po commicie,
      w golym node: `The requested module 'electron' does not provide an export named 'app'`.
      Postep jest realny (2 wiazania -> 1), ale kryterium wyodrebnienia NIE jest spelnione.
      Domkniecie: szerokosc tkaniny musi przyjsc ARGUMENTEM, tak jak `shopConfig`, czyli
      trzecie dotkniecie tych samych siedmiu call-site'ow. To jest ostatni krok
      wyodrebnienia i pierwszy, ktory mozna zaczac bez czekania na probki klienta #2.
- [=] Wyodrebnic obecna logike -> `parsers/fashionFormula.js`.
      **KRYTERIUM: WSZYSTKIE testy charakteryzacyjne przechodza BEZ modyfikacji pliku**
      `parseFileName.test.js`. Sformulowane przez brak modyfikacji, nie przez liczbe -
      liczba rosnie przy kazdym dolozonym przypadku i zamrozona staje sie celem.
      Kontekst na dzien pomiaru (`b2bdb79`, 2026-09-07): 26 blokow `it(`, 30 przypadkow
      w runtime (`npx vitest run src/electron/helpers/parseFileName.test.js`).
      **CZESC DEFINICJI "ZROBIONE": wyodrebnienie ma ZABRAC ZE SOBA trzy asercje
      o stalych wymiarach** (`:77-78` FQ 670/480, `:100-101` SAMPLE 220/200,
      `:150-151` TEA_TOWEL 700/500) jako opis parsera ALEXA - tam sa poprawne, bo
      opisuja jego konwencje. **Warstwa wspolna nie moze niesc ZADNYCH wymiarow
      produktu**: ani `DIMS_*`, ani `BUILT_IN_DIMS`, ani zadnego fallbacku na nie.
      Tym sie placi dlug wbudowanych wymiarow (patrz 2g/2h); wyodrebnienie bez tego
      nie jest zrobione.
- [=] `parsers/index.js` - wybor po `profile.parser.profile`
- [=] Drugi parser pod konwencje klienta #2 + wlasny zestaw testow
- [=] NIE budowac generycznego "silnika regul" z UI (dwie konwencje to za malo na abstrakcje)

---

## Zamrozone do realnego klienta #2 (nie zgadywac teraz)

- [=] Etap 5 parser (patrz wyzej) - czeka na probki nazw
- [=] Zakres szwalni (`features.sewing`) - flaga pokrywa; szczegol z discovery
- [=] Trzecia klasa materialu - dzis 2 sloty; 3+ rozszerza 2g (sprawdzic w discovery)
- [=] Twarde okresy licencji (baner/karencja) - ustalic przy pierwszej realnej umowie
- [=] **Konfigurowalne etapy produkcji (`stages[]` w profilu).** Klient z wlasna szwalnia
      jest JUZ obsluzony flaga `sewing` - to nie jest ten przypadek. Realny przypadek to
      klient bez PRASY TERMICZNEJ, czyli brak etapu `heatpress` w srodku pipeline'u.
      Ksztalt, jesli kiedykolwiek: `stages[]` jako WLACZ/WYLACZ z ZAMKNIETEJ listy,
      w profilu WDROZENIOWYM (2f), NIGDY edytor etapow w Settings - operator nie moze
      przestawiac pipeline'u produkcji w trakcie pracy.
      Dlaczego to jest duze: etap NIE jest wierszem w tabelce. `printed` powstaje ze
      skanu dysku, `qc` ma trzy odrebne akcje, `to_sewing` ma dedykowane funkcje DB
      (`setSewingSent`/`setSewingReceived`) i wlasny lens, `shipped` ma retencje
      (`cleanupShippedStages`), a ikony etapow to komponenty React. Zmierzone:
      **121 wystapien `PRODUCTION_STAGE` w 9 plikach**, w tym PIEC zduplikowanych list
      kolejnosci (`Production.jsx:87,106`, `ProductionCard.jsx:15`, `groupByOrder.js:8`,
      `OverviewPanel.jsx:37`) - czyli szerzej niz 2e (46 wystapien kodow drukarek).
      Discovery ma pytac wprost: **KTORYCH ETAPOW KLIENT NIE MA** - nie "jak wyglada
      Twoj proces", bo na to kazdy odpowie opisem, a nie lista brakow.

---

## Bramka weryfikacji (PO KAZDYM etapie, bez wyjatku)

- [ ] `npm run test` - zielone, ZERO modyfikacji istniejacych testow
      (modyfikacja testu = sygnal niezamierzonej zmiany zachowania -> STOP).
      Liczby nie zamrazamy tutaj - rosnie z kazdym krokiem dokladajacym plik testowy,
      a zamrozona staje sie celem. Oczekiwana wartosc to baseline z gory tego pliku
      (ETAP 0), zmierzony PRZED startem pracy; niezmienne jest to, ze licznik moze
      tylko rosnac i nigdy przez edycje istniejacego testu.
- [ ] `npm run lint` - czysty, czyli exit 0 przy `--max-warnings 0` (`a84ab48`)
      DO 2f WLACZNIE ta bramka czytala sam exit code, a skrypt byl golym `eslint .`,
      ktory konczy sie zerem mimo ostrzezen - `react-hooks/exhaustive-deps` ma w
      `reactHooks.configs.flat.recommended` severity `warn`, wiec brakujaca zaleznosc
      byla WYPISYWANA i PRZEPUSZCZANA. Wykryte kalibracja przy 2f. Starsze "lint czysty"
      w tym pliku znaczy wiec mniej niz dzisiejsze: dowodzilo braku bledow, nie braku
      ostrzezen. Przed zaostrzeniem zmierzono 140 plikow / 0 bledow / 0 ostrzezen, wiec
      bramka nie zapala sie na wejsciu; sprawdzono tez, ze GRYZIE (usuniecie zaleznosci
      od `shopProfile` -> exit 1).
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
