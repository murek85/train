/* „Co nowego” – skrót historii zmian dla gracza (pełna lista: CHANGELOG.md). Najnowsza wersja na górze.
   Przy podniesieniu wersji: nowa pozycja na początku listy (wersja, data, grupy z krótkimi punktami). */
(function () {
	'use strict';
	window.TrainNews = [
		{
			version: '0.27.0',
			date: '15 października 2026',
			groups: [
				['Śnieg i liście', [
					'Śnieg osiada w nieregularnych płatach z miękkimi brzegami – bez kanciastych, kwadratowych plam (błąd precyzji szumu przy dużych współrzędnych świata; poprawka obejmuje też inne wzory powierzchni).',
					'Jesienią liście głównie leżą: gęsto na trawie pod drzewami, część na peronach i ulicach, na torach tylko pojedynczo; spadających w powietrzu – niewiele.',
				]],
				['Budynki wg rodzaju', [
					'Sklepy sieci w ich barwach (z nazwą z mapy, bez logotypów): Żabka, Biedronka, Lidl, Netto, Dino, Kaufland, Aldi i inne; witryny parteru ze szprosami i drzwiami, pas firmowy, przy marketach zadaszenie nad wejściem.',
					'Stacje paliw z wiatą w barwach sieci (Orlen, BP, Shell, Lotos, Moya…), wyspami z dystrybutorami i pylonem cenowym.',
					'Komendy policji z granatowym pasem, apteki z zielonym krzyżem wysuniętym nad chodnik, urzędy i szkoły ze schodami i daszkiem nad wejściem.',
				]],
				['Drobne poprawki', [
					'ET22: dwa okna boczne kabiny (stałe i w drzwiach) zamiast jednego długiego; EN57 – węższy pług; cysterny Zacns – gładki zbiornik.',
					'Brzegi jezior i szerokich rzek bez schodków na ukosach.',
					'Generator tras: przycisk „Horyzont” – horyzont z prawdziwego terenu także dla tras wygenerowanych wcześniej.',
					'Swobodna kamera szybciej doczytuje świat wokół siebie.',
				]],
			],
		},
		{
			version: '0.26.0',
			date: '15 października 2026',
			groups: [
				['Ludzie i budynki', [
					'Ludzie w ubraniach w realistycznych, stonowanych kolorach (granat, czerń, grafit, beż, bordo, dżins) zamiast jaskrawych; różny wzrost (ok. 1,6–1,9 m) i tusza.',
					'Część osób z plecakiem albo torbą na ramię.',
					'Dachy z dachówek: rzędy dachówek z cieniem pod zakładką, odcień każdej dachówki, mech i zabrudzenia; płaskie dachy z papy w pasach; mniej niebieskawych szarości – dachówka czerwona, brązowa i grafitowa.',
					'Sosny z kształtniejszymi koronami (wcześniej spłaszczone kępy).',
				]],
			],
		},
		{
			version: '0.25.0',
			date: '15 października 2026',
			groups: [
				['Samochody', [
					'Koła, felgi, zderzaki, światła i tablice we własnych kolorach – wcześniej wszystko było w kolorze lakieru (np. fioletowe opony, pomarańczowe felgi).',
					'Szyby aut ciemne i błyszczące, z odbiciami nieba.',
					'Nadwozia mocniej zaokrąglone, zaokrąglone reflektory, światła tylne i zderzaki.',
				]],
			],
		},
		{
			version: '0.24.0',
			date: '15 października 2026',
			groups: [
				['Drzewa wg zdjęć', [
					'Korony drzew liściastych z kępek liści zamiast gładkich brył: postrzępione sylwetki, prześwity, konary w środku korony; dęby i lipy z większymi liśćmi, brzozy i topole z drobnymi.',
					'Świerki z opadających gałęzi z igłami (piętra gałęzi), sosny z pęczków igieł.',
					'Zimą drzewa liściaste bez liści – nagie gałęzie, przez które widać niebo; jesienią kolorowe kępki liści.',
					'Cienie drzew z prześwitami między liśćmi.',
				]],
			],
		},
		{
			version: '0.23.0',
			date: '15 października 2026',
			groups: [
				['Rozjazdy wg zdjęć', [
					'Napęd zwrotnicowy elektryczny: grafitowa obudowa z pokrywą na stalowej podstawie, skrzynka kablowa, drążek nastawczy i dwa drążki kontrolne do iglic (zamiast niebieskiej skrzynki).',
					'Przy rozjazdach z napędem elektrycznym szafka ogrzewania rozjazdu na nóżkach.',
					'Zwrotnik ręczny: dźwignia z kulą przeciwwagi i latarnia zwrotnicowa na słupku z białymi tarczami; rozjazdy ręczne na drewnianych podrozjazdnicach.',
				]],
			],
		},
		{
			version: '0.22.0',
			date: '15 października 2026',
			groups: [
				['Tarcze i sieć trakcyjna', [
					'Tarcze ostrzegawcze (To) przed semaforami wjazdowymi na szlakach bez samoczynnej blokady – 1000 m przed semaforem, na szarym maszcie, z komorą zieloną i pomarańczową; powtarzają sygnał semafora: Os1 (pomarańczowe – stój), Os2 (zielone), Os3 (zielone migające – 100 km/h), Os4 (pomarańczowe migające – 40/60 km/h).',
					'Przed każdą tarczą ostrzegawczą wskaźnik W 1 – biała tablica z czarną obwódką i krzyżem.',
					'Sieć trakcyjna: miejsca kotwienia z naprężaczami co ok. 24 przęsła – stosy ciężarków na prowadnicach, krążki z linkami, odciągi słupa do fundamentów.',
				]],
			],
		},
		{
			version: '0.21.0',
			date: '15 października 2026',
			groups: [
				['Perony i wiaty wg zdjęć', [
					'Nawierzchnia peronów jak na zmodernizowanych stacjach PKP PLK: szare płyty chodnikowe w rzędach przesuniętych o pół płyty (każda w trochę innym odcieniu, fugi), wzór biegnie wzdłuż toru także na łukach.',
					'Krawędź peronu: jasny krawężnik peronowy z płyt i żółty pas ostrzegawczy z wypustkami (zamiast białego pasa i cienkiej żółtej linii); płyta wierzchnia nawisa nad ścianą peronu.',
					'Wiaty na stacjach: płatwie pod dachem i rury spustowe z rynny; wiaty przystankowe: stopy słupów, rura spustowa i gablota z rozkładem jazdy na ścianie bocznej.',
				]],
			],
		},
		{
			version: '0.20.0',
			date: '15 października 2026',
			groups: [
				['Wagony wg zdjęć', [
					'Węglarka Eaos: drzwi dwuskrzydłowe w burtach z drążkami zamknięć i zawiasami, tablice z danymi wagonu.',
					'Falns: pośrodku skośne ściany lejów zbiegające się ku zsypom (burta nad wózkami pełna), tablica danych.',
					'Cysterna Zacns: kołyski i obejmy pod zbiornikiem, pomosty z barierkami na końcach, zawór spustowy, tablica danych.',
					'Kontenery na Sgns: odlewy narożne i tabliczka; Habbiins: uchwyty i zamki ścian przesuwnych.',
					'Koniec pociągu: na wagonach towarowych tarcze z czerwonymi trójkątami na uchwytach, w wagonach pasażerskich okrągłe latarnie na ścianach czołowych (na ostatnim świecą na czerwono).',
					'Szyby boczne wagonów i EZT przyciemnione – z zewnątrz wnętrze w półmroku, więcej odbić nieba.',
				]],
			],
		},
		{
			version: '0.19.0',
			date: '15 października 2026',
			groups: [
				['Lokomotywy i EZT wg zdjęć', [
					'Reflektory wreszcie mają klosze: wcześniej były niewidoczne i lampy wyglądały jak puste tuby (dotyczy wszystkich pojazdów, także świateł końcowych).',
					'EU07, ET22 i EN57: górny reflektor w toczonej obudowie na dachu nad czołem; w lokomotywach po bokach syreny – trąbki skierowane do przodu (syreny pozostałych lokomotyw też jako trąbki).',
					'EU07 i ET22: lampy czołowe ze światłem białym i czerwonym w jednej chromowanej obręczy, na wysokości tabliczki z numerem; osobne zgarniacze pod zderzakami; w EU07 wycieraczki zawieszone u góry szyb.',
					'ET22: nowa burta – w górnym rzędzie tylko okienko i kratka, niżej rząd siedmiu ciemnych żaluzji filtrów, pod dachem pas żaluzji; numer i napis PKP na wysokości okien.',
					'EN57: większe reflektory czołowe.',
				]],
			],
		},
		{
			version: '0.18.0',
			date: '15 października 2026',
			groups: [
				['Niebo i woda', [
					'Chmury wolumetryczne: kłębiaste cumulusy z jasnymi wierzchołkami i ciemnymi podstawami, przy zachmurzeniu i deszczu zwarta warstwa, o zachodzie podświetlone na różowo i pomarańczowo; cienie chmur na ziemi leżą dokładnie pod nimi.',
					'Woda z prawdziwym odbiciem: w rzekach i jeziorach odbijają się mosty, brzegi, zabudowa i niebo; fale z wiatrem, połysk słońca, im bardziej z ukosa, tym więcej odbicia.',
				]],
			],
		},
		{
			version: '0.17.0',
			date: '15 października 2026',
			groups: [
				['Horyzont', [
					'Góry w tle z prawdziwego terenu: na trasach rzeczywistych sylwetka horyzontu liczona z wysokości terenu do 60 km – na płaskim Śląsku i Kujawach prawie płaska, z Rybnika widać łagodne pasmo Beskidów; zmienia się w czasie jazdy.',
					'Bliżej – niska linia lasów zamiast drugiego pasma wzgórz; trasy bez danych mają łagodne pagórki.',
					'Generator tras liczy horyzont dla nowych tras (wysokości terenu co 4 km, Open-Meteo).',
				]],
			],
		},
		{
			version: '0.16.0',
			date: '15 października 2026',
			groups: [
				['Pory roku i pogoda', [
					'Pora roku widoczna w świecie: jesienią złote i rdzawe korony, opadłe liście na torze (gęsto na odcinkach „liście na torze”) i w trawie, liście spadające z wiatrem; zimą bezlistne drzewa i lekka pokrywa śnieżna; wiosną świeża zieleń.',
					'Nowa pogoda „burza”: ulewa, porywisty wiatr, błyskawice rozświetlające niebo i grzmot słyszany z opóźnieniem zależnym od odległości.',
				]],
				['Kabina i ekran wczytywania', [
					'Kabina w dzień nie jest już prześwietlona; zniknęła jasna okrągła plama na suficie (reflektor i odblask słońca widoczne przez dach).',
					'Ekran wczytywania pokazuje rzeczywisty postęp – pasek i procent zawsze zgodne.',
				]],
			],
		},
		{
			version: '0.15.0',
			date: '14 października 2026',
			groups: [
				['Głos zapowiedzi', [
					'Nowy silnik mowy Piper: naturalne głosy polskie (Gosia, Darkman, MC Speech), pobierane przy pierwszym użyciu (ok. 63 MB na głos) i działające potem bez internetu; mowa nie urywa się przy kliknięciu ani obracaniu kamery.',
					'Wybór głosu systemu (np. Adam, Paulina), odsłuch przykładowej zapowiedzi, tempo i wysokość mowy.',
					'Przerwana przez przeglądarkę zapowiedź głosu systemu jest dokańczana od przerwanego słowa.',
				]],
				['Jazda', [
					'Start z zahamowanym składem: nastawnik na H1, przy hamulcu zespolonym zawór na odcięciu.',
					'Dźwignia nastawnika w kabinie przesuwa się w szczelinie i stoi dokładnie przy bieżącej pozycji (przy „0” nie wygląda już na „H1”).',
				]],
			],
		},
		{
			version: '0.14.4',
			date: '14 października 2026',
			groups: [
				['Poprawki', [
					'Perony i ich zadaszenia z mapy na łukach idą za torem – długi peron nie przechodzi już przez tor na drugą stronę (np. Łaziska Górne).',
					'Plakietka z rozkazami pisemnymi pozostaje czytelna po najechaniu myszą.',
				]],
			],
		},
		{
			version: '0.14.3',
			date: '14 października 2026',
			groups: [
				['Panel jazdy', [
					'Panel z rozkładem jazdy tej samej szerokości co panel z nastawnikiem.',
					'Przycisk z rozkazami pisemnymi przeniesiony do panelu rozkładu (wiersz kilometrażu) – nie zasłania już zegara i punktów.',
				]],
			],
		},
		{
			version: '0.14.2',
			date: '14 października 2026',
			groups: [
				['Menu', [
					'Wszystkie okna menu, pauza, ustawienia, zapisy i ekran końca jazdy wyrównane do lewej, jak menu główne.',
				]],
				['Drobne zmiany', [
					'Głos zapowiedzi domyślnie na 60% głośności.',
					'Kilometraż w panelu jazdy z jednym miejscem po przecinku.',
				]],
			],
		},
		{
			version: '0.14.1',
			date: '14 października 2026',
			groups: [
				['Dźwięk', [
					'Osobne suwaki głośności w Ustawieniach: pociąg, syreny, otoczenie, sygnały i głos zapowiedzi (obok głośności ogólnej).',
					'Druga syrena – wysokotonowa – pod klawiszem J i przyciskiem „Syrena 2”; też zalicza sygnał przed przejazdem.',
				]],
				['Panel jazdy', [
					'Kilometraż pod zegarem: położenie pociągu na trasie i odległość do stacji końcowej.',
					'Komunikaty z cienką ramką w kolorze rodzaju komunikatu (jak komunikaty radiowe).',
				]],
			],
		},
		{
			version: '0.14.0',
			date: '14 października 2026',
			groups: [
				['Linie jednotorowe', [
					'Krzyżowania: na odcinkach jednotorowych (z mapy – np. Toruń – Chełmża, część Rybnik – Katowice) pociągi z przeciwka jadą po Twoim torze i mijają się z Tobą na stacjach z drugim torem.',
					'Pociąg z przeciwka czeka na mijance na torze bocznym, aż przejedziesz (dyżurny informuje, że czeka na Ciebie); gdy odcinek jest już zajęty, semafor wyjazdowy wskazuje „stój” do jego przyjazdu.',
					'Rogatki nie są opuszczone przez cały postój pociągu czekającego przed przejazdem.',
				]],
			],
		},
		{
			version: '0.13.0',
			date: '14 października 2026',
			groups: [
				['Pasażerowie', [
					'Liczba podróżnych zależy od pory dnia (szczyt poranny i popołudniowy, noc) i rodzaju stacji; pociąg osobowy jadący przed Tobą zabiera część czekających.',
					'Podróżni w pociągu zwiększają masę składu; przy pełnym składzie część zostaje na peronie.',
					'Czas postoju wynika z liczby wsiadających i wysiadających; w panelu – wsiada, wysiada, w pociągu.',
				]],
				['Zapowiedzi i tablice', [
					'Zapowiedzi z gongiem: na peronie (Twój pociąg, pociąg z przeciwka, przejazd bez zatrzymania) i w pociągu („Następna stacja…”); w Ustawieniach można włączyć czytanie głosem albo wyłączyć zapowiedzi.',
					'Tablice odjazdów na peronach dworców – najbliższe odjazdy z przewidywanym opóźnieniem.',
				]],
			],
		},
		{
			version: '0.12.0',
			date: '14 października 2026',
			groups: [
				['Scenariusze', [
					'Zadanie dnia na górze ekranu „Scenariusze”: codziennie inna trasa, skład, godzina, pogoda, pora roku, zdarzenia i cele – u wszystkich takie same.',
					'Najlepszy wynik dnia i seria dni z rzędu z ukończonym zadaniem.',
				]],
			],
		},
		{
			version: '0.11.0',
			date: '14 października 2026',
			groups: [
				['Ocena jazdy', [
					'Po każdej jeździe ocena w gwiazdkach (1–5): punktualność, zatrzymania przy W4, płynność, komfort pasażerów, energia, bezpieczeństwo – obok punktów.',
					'Wykres przejazdu: prędkość na tle dozwolonej, stacje i hamowania nagłe.',
					'Historia jazd w menu z najlepszą oceną dla trasy i składu.',
				]],
			],
		},
		{
			version: '0.10.0',
			date: '14 października 2026',
			groups: [
				['Wydajność', [
					'Płynniejsza gra: wspólne materiały świata, lżejsze modele pociągów tła i wagonów na bocznicach, rzadziej odświeżane dalekie cienie.',
					'Bez przycięć przy pojawianiu się innych pociągów (modele przygotowane na ekranie wczytywania).',
					'Jakość dobierana automatycznie przy pierwszym uruchomieniu (i przyciskiem w Ustawieniach); w czasie jazdy, gdy płynność długo spada, zmniejsza się zasięg szczegółów (opcja).',
					'Niska jakość mocniej ogranicza zasięg świata – dla laptopów z grafiką zintegrowaną.',
				]],
				['Generator tras', [
					'Kontrola trasy: pochylenia, skoki wysokości, łuki, perony, przejazdy, semafory, prędkości i przejazd automatem – raport po wygenerowaniu i przycisk „Kontrola” przy trasie.',
				]],
			],
		},
		{
			version: '0.9.0',
			date: '14 października 2026',
			groups: [
				['Jazda', [
					'Napęd wg serii (opcja w „Pomocy”): rozruch oporowy EU07, ET22, EN57 – pozycje szeregowe, równoległe i bocznikowanie, przekaźnik nadmiarowy i przegrzewanie oporników; falownik w Elfach i ED250; spalinowe SM42, ST44, SU46.',
					'Przyczepność zależna od pogody i pory roku (nowy wybór w „Warunkach”): jesienią liście na torach, zimą śliskie szyny; poślizg i blokowanie kół, piasecznica (X).',
					'Hamulec dodatkowy lokomotywy (Shift+A / Shift+Q).',
				]],
			],
		},
		{
			version: '0.8.0',
			date: '14 października 2026',
			groups: [
				['Dyżurny ruchu', [
					'Rozkazy pisemne: „O” z ograniczeniem prędkości na stacji przed odjazdem, „S” przez radiotelefon przed uszkodzonym semaforem; potwierdzenie Enterem, O – ostatni rozkaz.',
					'Uszkodzone semafory i sygnał zastępczy (białe migające, 40 km/h).',
					'Rutynowe komunikaty dyżurnego: odjazd, pociąg przed Tobą, przyjęcie na stację (opcja).',
					'Nowy scenariusz „Awaria sterowania”.',
				]],
			],
		},
		{
			version: '0.7.0',
			date: '14 października 2026',
			groups: [
				['Ruch na linii', [
					'Inne pociągi według rozkładu – przed Tobą i za Tobą na Twoim torze, z przeciwka na drugim; suwak w „Warunkach”.',
					'Blokada liniowa: semafor „stój”, gdy odcinek za nim jest zajęty.',
					'Spóźnienie zatrzymuje pociąg jadący za Tobą (opcjonalnie z karą); limit rysowanych pociągów i opcja z maszynistą i pasażerami w „Ustawieniach”.',
				]],
			],
		},
		{
			version: '0.6.0',
			date: '14 października 2026',
			groups: [
				['Hamulec i bezpieczeństwo', [
					'Hamulec zespolony (opcja w „Pomocy”): zawór maszynisty (A / Q), ciśnienie w przewodzie głównym, fala hamowania, nastawa P i G, odzysk energii w nowoczesnych EZT.',
					'SHP: 200 m przed semaforem potwierdź spacją.',
				]],
			],
		},
		{
			version: '0.5.0',
			date: '14 października 2026',
			groups: [
				['Scenariusze', [
					'Nowy ekran „Scenariusze”: samouczek „Pierwsza jazda” z instruktorem i sześć scenariuszy z celami i gwiazdkami.',
					'Zdarzenia na trasie: ograniczenia doraźne z tablicami, wydłużone postoje, zanik napięcia, zmiana pogody.',
					'Radiotelefon: komunikaty dyżurnego ruchu z sygnałem wywołania (Enter – potwierdzenie).',
					'Zdarzenia losowe w jeździe swobodnej na każdej trasie.',
				]],
			],
		},
		{
			version: '0.4.0',
			date: '14 października 2026',
			groups: [
				['Sygnalizacja', [
					'Semafory jak na PKP (S1–S13a): zapowiedź następnego semafora, ograniczenia 40 / 60 / 100 km/h z dolnym światłem i pasem świetlnym, miganie.',
					'Panel semafora z oznaczeniem sygnału i zapowiedzią, oznaczenie na ekranie w kabinie.',
				]],
			],
		},
		{
			version: '0.3.0',
			date: '13–14 października 2026',
			groups: [
				['Wydajność', [
					'Mniej obiektów do rysowania (scalanie nieruchomych części świata), lżejsze drzewa w oddali – płynniejsza gra.',
					'Bez przycięć przy pierwszym wejściu do kabiny i zmianie widoku; nakładka diagnostyczna F3.',
				]],
				['Grafika i otoczenie', [
					'Patyna, spoiny i nity na pojazdach, okluzja otoczenia, więcej detali taboru i kabiny maszynisty.',
					'Pogoda i otoczenie, przejazdy kolejowe, ruch pieszych i aut – poprawki (szczegóły w CHANGELOG).',
				]],
			],
		},
		{
			version: '0.2.0',
			date: '13 października 2026',
			groups: [
				['Gra', [
					'Zapis i odczyt gry: 5 miejsc i autozapis (odjazd ze stacji, wyjście do menu, zamknięcie okna).',
					'Okienko wczytywania przy wyborze trasy (także z Generatora tras) i przy zmianie składu.',
					'Długie składy zatrzymują się w obrębie peronu.',
					'Wycieraczki zostawiają na brzegu przetartego pola smugę zgarniętej wody albo śniegu.',
					'Długie wycieraczki się nie przecinają (jedna nad drugą, w pracy z opóźnieniem); krople na szybach bocznych spływają w czasie jazdy.',
				]],
				['Tabor', [
					'ED250 „Pendolino” oraz Elfy: EN96, EN62, EN76, 48WE i 27WE – z malowaniami i dźwiękiem napędu z falownikiem.',
				]],
				['Wydajność', [
					'Brak spadków klatek przy doczytywaniu mapy, szybsze wczytywanie tras i budowanie modeli pociągów.',
				]],
				['Trasy i otoczenie', [
					'Wszystkie trasy wygenerowane ponownie: przejazdy, semafory i mosty dokładnie przy ulicach i peronach z mapy.',
					'Wkopy drogowe (DTŚ) z murami i portalami tuneli, mury oporowe przy rampach wiaduktów.',
					'Równiejsze ulice, przejazdy na prawdziwych ulicach – auta stają przed przejazdem.',
					'Most na Wiśle w Toruniu, poprawione perony, zegary i tablice, latarnie na peronach wyspowych.',
				]],
			],
		},
		{
			version: '0.1.0',
			date: '10–12 października 2026',
			groups: [
				['Gra', [
					'Symulator pociągu w 3D: kabina maszynisty, pogoda i pora dnia, czuwak i asystent hamowania.',
					'Gra jednoosobowa: mapa, pociąg, warunki i pomoc; skład z prawdziwego taboru PKP z wyborem malowań.',
					'Wycieraczki, podnoszenie pantografów, swobodna kamera, wersja desktopowa.',
				]],
				['Trasy', [
					'Generator tras z prawdziwych danych (OpenStreetMap, model terenu GUGiK, BDOT10k, PKP PLK) – także w grze.',
					'Prawdziwe otoczenie: budynki, ulice, mosty i wiadukty, perony i zadaszenia, rozjazdy.',
					'Import i eksport tras z generatora.',
				]],
				['Grafika i dźwięk', [
					'Dokładne modele lokomotyw, zespołów i wagonów, ludzie na peronach, cienie kaskadowe.',
					'Dźwięki pociągów, zwrotnic, rogatek i otoczenia.',
				]],
			],
		},
	];
})();
