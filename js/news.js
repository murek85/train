/* „Co nowego” – skrót historii zmian dla gracza (pełna lista: CHANGELOG.md). Najnowsza wersja na górze.
   Przy podniesieniu wersji: nowa pozycja na początku listy (wersja, data, grupy z krótkimi punktami). */
(function () {
	'use strict';
	window.TrainNews = [
		{
			version: '0.58.69',
			date: '24 października 2026',
			groups: [
				['Nowa trasa', [
					'Władysławowo – Hel: linia 213 mierzeją Helską, między Bałtykiem a Zatoką Pucką – 34,9 km, 8 stacji i przystanków (Chałupy, Kuźnica, Jastarnia, Jurata), bez sieci trakcyjnej, skład spalinowy.',
				]],
				['Generator tras', [
					'Rozbieg przed stacją początkową według kierunku, w którym tor naprawdę wychodzi ze stacji – trasy zaczynające się na łuku (np. Władysławowo) nie gubią już pierwszej stacji.',
				]],
			],
		},
		{
			version: '0.58.68',
			date: '24 października 2026',
			groups: [
				['Nowa trasa', [
					'Jelenia Góra – Szklarska Poręba Górna: Kolej Izerska (linia 311) przez Cieplice, Sobieszów, Piechowice i Górzyniec – 31,8 km, 13 stacji i przystanków, 360 m w górę, pochylenia do 26‰, tunel pod Szklarską Porębą, prędkości 40–70 km/h.',
				]],
			],
		},
		{
			version: '0.58.67',
			date: '24 października 2026',
			groups: [
				['Trasy', [
					'Nowa trasa: Kłodzko Główne – Międzylesie (linia 276, 36 km, 10 stacji i przystanków) – doliną Nysy Kłodzkiej przez Bystrzycę Kłodzką i Długopole-Zdrój, prawie cały czas pod górę, z tunelem przed Długopolem.',
				]],
			],
		},
		{
			version: '0.58.66',
			date: '24 października 2026',
			groups: [
				['Nowa trasa', [
					'Żywiec – Zwardoń: linia 139 w górę doliną Soły przez Węgierską Górkę, Milówkę, Rajczę i Sól aż pod granicę ze Słowacją – 36,6 km, 15 stacji i przystanków, prędkości do 120 km/h, podjazd z 355 na 672 m n.p.m. (pochylenia do 24‰ za Solą).',
				]],
			],
		},
		{
			version: '0.58.65',
			date: '24 października 2026',
			groups: [
				['Trasy', [
					'Nowa trasa wbudowana: Wałbrzych Główny – Jedlina-Zdrój (linia 286, 6 km) – spalinowym składem w górę przez tunel pod Małym Wołowcem (1,6 km), po wiaduktach i w dół do Jedliny-Zdroju.',
				]],
			],
		},
		{
			version: '0.58.64',
			date: '24 października 2026',
			groups: [
				['Trasy', [
					'Nowa trasa: Szklarska Poręba Górna – Polana Jakuszycka (Kolej Izerska, linia 311) – 9,2 km górskiej jazdy szynobusem, przez ponad 7 km pod górę powyżej 20‰.',
				]],
			],
		},
		{
			version: '0.58.63',
			date: '24 października 2026',
			groups: [
				['Trasy', [
					'Nowa trasa: Bielsko-Biała Główna – Żywiec (linia 139, 20,7 km, 9 stacji i przystanków) – podjazd przez Mikuszowice i Wilkowice Bystrą pod Beskidy, zjazd przez Łodygowice do Kotliny Żywieckiej; pochylenia do 15,8‰, prędkości do 140 km/h.',
				]],
			],
		},
		{
			version: '0.58.62',
			date: '24 października 2026',
			groups: [
				['Nowa trasa', [
					'Kraków Główny – Wieliczka Rynek-Kopalnia: przebieg SKA1 torami aglomeracyjnymi przez Grzegórzki, Zabłocie, Płaszów i Bieżanów, dalej pod górę do Wieliczki – 13,8 km, 10 stacji i przystanków, ok. 20 minut jazdy.',
				]],
			],
		},
		{
			version: '0.58.61',
			date: '24 października 2026',
			groups: [
				['Grafika', [
					'Bez czarnych ścian budynków przy obracaniu kamery (błąd w okluzji otoczenia).',
				]],
			],
		},
		{
			version: '0.58.60',
			date: '23 października 2026',
			groups: [
				['Ruch na linii', [
					'Pociągi tła trzymają odstęp za poprzedzającym (także z przeciwka i za pociągiem gracza) – nie przejeżdżają już przez siebie.',
					'Mniej nagłego pojawiania się i znikania: pociąg widoczny w pobliżu zachowuje model, pociąg z przeciwka nie znika przy przerwie toru w danych mapy, a nowe pociągi ruszają z końców trasy dopiero, gdy jesteś daleko.',
				]],
			],
		},
		{
			version: '0.58.59',
			date: '23 października 2026',
			groups: [
				['Grafika', [
					'Okluzja otoczenia (cienie w zakamarkach: przy podstawach budynków, pod drzewami i wiaduktami, między wagonami) także na jakości średniej i w widoku z kabiny – mocniejsza niż dotąd.',
				]],
			],
		},
		{
			version: '0.58.58',
			date: '23 października 2026',
			groups: [
				['Grafika', [
					'Torowisko: zabrudzona podsypka – ciemniejsza między szynami, rdzawa przy szynach od pyłu z hamulców; betonowe korytka kablowe wzdłuż toru na szlaku.',
					'Promienie słońca uwzględniają chmury: gęste chmury przed słońcem je gaszą, a smugi przebijają przez prześwity i jasne brzegi chmur – także przy wyżej położonym słońcu.',
				]],
			],
		},
		{
			version: '0.58.57',
			date: '23 października 2026',
			groups: [
				['Wydajność', [
					'Wybór długiej trasy w menu i start jazdy bez zamrożenia okna: otoczenie trasy przygotowuje się w krokach z postępem w okienku – i prawie dwa razy szybciej (Poznań – Wrocław ok. 2,5 s zamiast 4,5 s).',
				]],
			],
		},
		{
			version: '0.58.56',
			date: '23 października 2026',
			groups: [
				['Nowa trasa', [
					'Poznań Główny – Wrocław Główny: linia 271 przez Luboń, Mosinę, Kościan, Leszno, Rawicz, Żmigród i Oborniki Śląskie – 163,7 km, 34 stacje i przystanki, prędkości do 160 km/h. Najdłuższa trasa w grze.',
				]],
				['Generator tras', [
					'Trasy do 180 km w linii prostej (dotąd 100 km); przejazdy tuż przed peronami przystanków nie są już pomijane.',
				]],
			],
		},
		{
			version: '0.58.55',
			date: '23 października 2026',
			groups: [
				['Otoczenie', [
					'Nasypy przy końcach wiaduktów nie przykrywają już ulic obok, mosty drogowe nad torami dostają filary także nad terenem, a tory odzyskane z danych o wiaduktach biegną płynnie, bez uskoków.',
				]],
			],
		},
		{
			version: '0.58.54',
			date: '23 października 2026',
			groups: [
				['Kontrola tras', [
					'Dokładniejsza kontrola przecięć dróg z torami innych linii – bez fałszywych alarmów na przejazdach i przy przejściach pod torami.',
				]],
			],
		},
		{
			version: '0.58.53',
			date: '23 października 2026',
			groups: [
				['Otoczenie', [
					'Tory innych linii przy mostach nie wskakują już nagle o kilka metrów w górę ani w dół – dochodzą do pomostu na jego wysokości, a tory biegnące obok naszego wiaduktu zostają na nim.',
				]],
			],
		},
		{
			version: '0.58.52',
			date: '23 października 2026',
			groups: [
				['Stacje', [
					'Perony z mapy nie zachodzą już na tory – krawędź co najmniej 1,7 m od osi toru (m.in. Gliwice, Mikołów, Katowice, Raba Wyżna, Tarnowskie Góry).',
					'Wisła Głębce: peron zaczyna się za rozjazdem, a nie na torze obok.',
				]],
			],
		},
		{
			version: '0.58.51',
			date: '23 października 2026',
			groups: [
				['Otoczenie', [
					'Wiadukty drogowe nie wiszą już nad doliną urwane w powietrzu – pomost nie jest sztucznie przedłużany nad opadającym terenem, a dalsza ulica łączy się z nim jak trzeba.',
					'Czechowice-Dziedzice – Wisła Głębce: ul. Sosnowa (km 48,5) przechodzi pod torem zamiast estakadą nad doliną; zniknęła też fałszywa estakada drogi polnej przy km 50,3.',
				]],
			],
		},
		{
			version: '0.58.50',
			date: '23 października 2026',
			groups: [
				['Otoczenie', [
					'Drogi pod mostami kolejowymi schodzą pod przęsłem tak, by zmieścił się samochód (ok. 3,5 m prześwitu, ścieżki i drogi polne 2,5 m) – dawniej bywało 0,6–2 m.',
				]],
			],
		},
		{
			version: '0.58.49',
			date: '22 października 2026',
			groups: [
				['Trasy', [
					'Brakujące przejazdy kolejowe (potwierdzone w OSM): Kraków – Zakopane km 20,3, 21,9, 28,0, 121,0, 131,8; Czechowice-Dziedzice – Wisła Głębce km 16,8, 28,7, 38,9; Toruń – Chełmża km 19,2.',
				]],
				['Generator tras', [
					'Przejazdy oznaczone w OSM tylko na drugim torze linii trafiają teraz do trasy (dawniej ich brakowało).',
				]],
			],
		},
		{
			version: '0.58.48',
			date: '22 października 2026',
			groups: [
				['Wydajność', [
					'Jezdnie i chodniki z mniejszej liczby trójkątów (ok. 15% mniej), a przy tym lepiej dopasowane do terenu – rzadziej prześwituje przez nie trawa.',
				]],
			],
		},
		{
			version: '0.58.47',
			date: '22 października 2026',
			groups: [
				['Wydajność', [
					'Lżejsze balkony bloków (o połowę mniej wierzchołków) i tylko w budynkach do 300 m od toru – w miastach detale budynków są o ok. 40% lżejsze.',
				]],
			],
		},
		{
			version: '0.58.46',
			date: '22 października 2026',
			groups: [
				['Wydajność', [
					'Płynniejsza jazda przez miasta: budowa otoczenia jest dzielona na krótsze kroki, a plany wiaduktów są zapamiętywane – mniej przycięć przy dociąganiu kolejnych kawałków świata.',
					'Sieć ulic jest przygotowywana przy wczytaniu trasy (wczytanie dużych tras trwa przez to kilka sekund dłużej).',
				]],
			],
		},
		{
			version: '0.58.45',
			date: '22 października 2026',
			groups: [
				['Generator tras', [
					'Generator od razu łączy przerwy w torach przy portalach tuneli i zamienia „wiadukty kolejowe” biegnące obok linii na zwykłe tory – nowe trasy nie potrzebują tych poprawek w grze.',
				]],
			],
		},
		{
			version: '0.58.44',
			date: '22 października 2026',
			groups: [
				['Trasy', [
					'Brakujące przejazdy kolejowe: Toruń – Chełmża (km 19,8), Rybnik – Katowice (km 41,3), Kraków – Zakopane (km 26,0, 98,7, 104,1).',
					'Tory przechodzące ukośnie pod wiaduktem nie wskakują już na pomost (Zabrze – Gliwice, Rybnik – Katowice).',
				]],
			],
		},
		{
			version: '0.58.43',
			date: '22 października 2026',
			groups: [
				['Trasy', [
					'Przy uwagach generatora i w raporcie kontroli tras linki „Mapa”, „Satelita” i „Widok ulicy” – prosto do miejsca na trasie (widok ulicy skierowany wzdłuż toru).',
				]],
			],
		},
		{
			version: '0.58.42',
			date: '22 października 2026',
			groups: [
				['Trasy', [
					'Automatyczna kontrola tras: wszystkie trasy z mapy sprawdzane jednym adresem (?audit) – filary na jezdniach i torach, ulice przerwane przy torze, skoki wysokości torów, tunele, perony na torach, budynki na torowisku – z kilometrażem i podpowiedzią poprawki.',
					'Te same uwagi w swobodnej kamerze (zakładka uwag generatora) – przycisk „Pokaż” przenosi na miejsce.',
				]],
			],
		},
		{
			version: '0.58.41',
			date: '22 października 2026',
			groups: [
				['Pogoda', [
					'Zmienna pogoda w trakcie jazdy: kilka kolejnych zmian (np. pochmurno → lekki deszcz → deszcz → przejaśnienie), każda płynnie przez ok. pół minuty.',
					'Szyny po deszczu schną stopniowo – przyczepność wraca do normy w ciągu kilku minut.',
					'Kałuże także na peronach i betonie; szadź zimą także na grubych przewodach sieci.',
				]],
				['Ruch', [
					'Na dużych stacjach pociągi innych linii przyjeżdżają, stoją i odjeżdżają przy sąsiednich peronach.',
					'Przy stacjach z torami przelotowymi co kilka minut przejeżdża pociąg towarowy.',
				]],
			],
		},
		{
			version: '0.58.40',
			date: '22 października 2026',
			groups: [
				['Nowa trasa', [
					'Czechowice-Dziedzice – Wisła Głębce: przebieg pociągów S6 przez Chybie Mnich, Skoczów, Goleszów i Ustroń, dalej górską linią 191 doliną Wisły – 51,3 km, 18 stacji i przystanków, wzniesienia do 28,6‰, Beskid Śląski na horyzoncie (Czantoria nad Ustroniem).',
				]],
			],
		},
		{
			version: '0.58.39',
			date: '22 października 2026',
			groups: [
				['Pogoda', [
					'Przy dużym zachmurzeniu i opadach dal przechodzi w ciemniejszą, szarą mgłę pasującą do nieba – bez białego pasa nad horyzontem.',
				]],
			],
		},
		{
			version: '0.58.38',
			date: '22 października 2026',
			groups: [
				['Pogoda', [
					'Nowe opady: lekki deszcz (rzadkie krople, szyny najbardziej śliskie) i ulewa (gęsty opad, słaba widoczność).',
				]],
			],
		},
		{
			version: '0.58.37',
			date: '22 października 2026',
			groups: [
				['Pogoda', [
					'Nowe stopnie zachmurzenia: pojedyncze chmury, umiarkowane zachmurzenie i duże zachmurzenie (obok słonecznie i pochmurno).',
				]],
			],
		},
		{
			version: '0.58.36',
			date: '22 października 2026',
			groups: [
				['Mosty', [
					'Filary wiaduktów drogowych ustawione jak najbardziej w poprzek pomostu – obracane w stronę torów tylko tyle, ile trzeba, by ominąć tory i drogi.',
				]],
			],
		},
		{
			version: '0.58.35',
			date: '22 października 2026',
			groups: [
				['Mosty', [
					'Filary jednego wiaduktu drogowego stoją w jednym kierunku; długie podpory pod ukośnym pomostem to rzędy słupów z oczepem zamiast pełnych ścian.',
				]],
			],
		},
		{
			version: '0.58.34',
			date: '22 października 2026',
			groups: [
				['Mosty', [
					'Wiadukty drogowe biegnące ukośnie nad torami mają zwykłe filary w poprzek jezdni zamiast długich ścian, rozstawione co najmniej 15 m (Tarnowskie Góry km 0,5).',
				]],
			],
		},
		{
			version: '0.58.33',
			date: '22 października 2026',
			groups: [
				['Przejazdy', [
					'Radzionków (Tarnowskie Góry – Katowice, km 6,2): brakujący przejazd kolejowy.',
					'Generator tras dodaje przejazd w poziomie, gdy droga przecina tor bez oznaczenia, a pomiar terenu nie pokazuje przejścia pod torami.',
				]],
			],
		},
		{
			version: '0.58.32',
			date: '22 października 2026',
			groups: [
				['Mosty', [
					'Słupy wiaduktów nie stają na ulicach przechodzących ukośnie pod torami, także na łącznikach pod samym torem (Bytom Stroszek).',
				]],
			],
		},
		{
			version: '0.58.31',
			date: '22 października 2026',
			groups: [
				['Tarnowskie Góry – Katowice', [
					'Chorzów Batory: tor zjeżdżający do linii zwrotnicą biegnie po terenie (dawniej nagle wspinał się na 7–8 m i kończył mostem, km 28,2).',
					'Most kolejowy nad linią (km 27,3): oba tory na tej samej wysokości, zjazd z mostu bez skoku.',
					'Estakada w Chorzowie (km 24,8): obie jezdnie biegną estakadą obok siebie, budynki pod nią nie przebijają jezdni.',
				]],
			],
		},
		{
			version: '0.58.30',
			date: '22 października 2026',
			groups: [
				['Tarnowskie Góry – Katowice', [
					'Chorzów Uniwersytet: prawdziwy peron wyspowy między torami (dawniej peron z gry stał na drugim torze).',
					'Filary wiaduktu nie stają na ulicy przerwanej w danych przy torze (km 20,2).',
					'Chorzów Batory: tor biegnący obok linii jest zwykłym torem, a nie „wiaduktem” leżącym przy ziemi (km 28,4).',
					'Druga jezdnia wiaduktu schodzi rampą do ulicy zamiast urywać się 7 m nad nią (km 24,7).',
				]],
				['Mosty', [
					'Nasyp toru z mapy nie zsypuje się na tory i ulice pod wiaduktem – skarpa kończy się ścianą oporową (km 32,7).',
				]],
			],
		},
		{
			version: '0.58.29',
			date: '22 października 2026',
			groups: [
				['Nowa trasa', [
					'Tarnowskie Góry – Katowice: linia 131 przez Radzionków, Bytom i Chorzów, od Chorzowa Batorego linia 137 – 33,5 km, 13 stacji i przystanków (jak pociągi S8 i S9 Kolei Śląskich), z otoczeniem, peronami i horyzontem z prawdziwego terenu.',
				]],
				['Generator tras', [
					'Stacje kolei wąskotorowej obok linii (np. Bytom Wąskotorowy) nie wypierają już prawdziwych stacji przebiegu.',
				]],
			],
		},
		{
			version: '0.58.28',
			date: '22 października 2026',
			groups: [
				['Mosty', [
					'Ulica pod mostem kolejowym z mapy bez klinów ziemi – teren i jezdnia nie wspinają się już pod przęsło (Toruń Główny).',
				]],
			],
		},
		{
			version: '0.58.27',
			date: '22 października 2026',
			groups: [
				['Mosty', [
					'Wiadukty drogowe nad wykopem łączą się z ulicą po obu stronach – bez pasa trawy między końcem pomostu a jezdnią.',
				]],
				['Przejazdy', [
					'Jezdnia na przejeździe kolejowym ma oznakowanie jak ulica: oś (przy przejeździe ciągła), linie między pasami i krawędziowe – z przerwą na torach.',
				]],
			],
		},
		{
			version: '0.58.26',
			date: '22 października 2026',
			groups: [
				['Mosty', [
					'Tory dochodzące do mostów kolejowych z mapy leżą na wysokości pomostu – nie zjeżdżają już do ulicy pod mostem (Toruń Główny).',
				]],
			],
		},
		{
			version: '0.58.25',
			date: '22 października 2026',
			groups: [
				['Mosty', [
					'Podpory estakad zawsze z kompletem słupów: przesuwane w poprzek albo wzdłuż estakady tak, by żaden nie stał na ulicy – bez pojedynczych słupów z oczepem na całą szerokość.',
				]],
			],
		},
		{
			version: '0.58.24',
			date: '22 października 2026',
			groups: [
				['Tunele', [
					'Schody z peronów podziemnych, kolumny i lampy hali mieszczą się pod stropem – nie wystają już na ulicę i trawnik nad stacją (Warszawa Centralna, Śródmieście).',
					'Pawilony wejściowe stoją na poziomie terenu nad tunelem.',
				]],
			],
		},
		{
			version: '0.58.23',
			date: '22 października 2026',
			groups: [
				['Tunele', [
					'Ulice nad płytkim tunelem leżą ponad jego stropem (z łagodnym podjazdem) – lampy i strop tunelu nie przebijają już jezdni.',
					'Strop tunelu bez szczelin na granicach kawałków świata (prześwitywało przez nie niebo).',
				]],
			],
		},
		{
			version: '0.58.22',
			date: '22 października 2026',
			groups: [
				['Mosty', [
					'Filary wysokich mostów kolejowych nad rzeką (np. most średnicowy na Wiśle) sięgają dna i brzegu – nie wiszą już nad wodą.',
				]],
			],
		},
		{
			version: '0.58.21',
			date: '22 października 2026',
			groups: [
				['Mosty', [
					'Filary wiaduktów i estakad nie stają na szerokich ulicach – brana jest prawdziwa szerokość jezdni z chodnikami, a nie typowa dla klasy drogi.',
				]],
			],
		},
		{
			version: '0.58.20',
			date: '22 października 2026',
			groups: [
				['Tunele', [
					'Budynek nad portalem tunelu stoi na jego stropie – nie wisi już kilka metrów nad wykopem i torami przed wylotem (Powiśle).',
				]],
			],
		},
		{
			version: '0.58.19',
			date: '22 października 2026',
			groups: [
				['Tunele', [
					'Przed wjazdem do tunelu tory z mapy nie urywają się już kilka metrów przed portalem (np. Powiśle przed tunelem średnicowym).',
					'Peron kończący się tuż przed tunelem nie ma pochylni wchodzącej klinami w wylot.',
				]],
			],
		},
		{
			version: '0.58.18',
			date: '22 października 2026',
			groups: [
				['Tunele', [
					'Tunel kolejowy (np. linia średnicowa w Warszawie) ma poza stacjami stałą wysokość 6 m nad szyną – strop nie faluje, mieści pociąg i sieć trakcyjną.',
				]],
			],
		},
		{
			version: '0.58.17',
			date: '21 października 2026',
			groups: [
				['Mosty', [
					'Estakady naszej linii: pomost pod wszystkimi torami biegnącymi obok na tym samym poziomie (np. linia średnicowa w Warszawie za Wisłą) i podpory w poprzek całej szerokości – słupy z oczepami, omijające ulice.',
				]],
			],
		},
		{
			version: '0.58.16',
			date: '21 października 2026',
			groups: [
				['Mosty', [
					'Most nad ulicą: przęsło nad całą jezdnią z chodnikami, przyczółki tuż za chodnikiem i widoczne z ulicy, nasyp toru nie zsypuje się na chodnik.',
				]],
			],
		},
		{
			version: '0.58.15',
			date: '21 października 2026',
			groups: [
				['Mosty', [
					'Przyczółki mostów nad ulicami nie stoją na jezdni ani chodniku – odsunięte za ulicę, przęsło dłuższe.',
				]],
			],
		},
		{
			version: '0.58.14',
			date: '21 października 2026',
			groups: [
				['Perony', [
					'Zwężający się peron z gładką, skośną krawędzią zamiast schodków.',
					'Tor z mapy za peronem nie jest już ucinany – to peron ustępuje torowi.',
				]],
			],
		},
		{
			version: '0.58.13',
			date: '21 października 2026',
			groups: [
				['Perony', [
					'Krawędź peronu co najmniej 1,72 m od osi toru – pociąg nie zahacza o peron.',
					'Peron przycięty przed sąsiednim torem: zwężający się peron wyspowy nie wchodzi na tor (także pochylnie, latarnie, barierki i perony z mapy).',
				]],
			],
		},
		{
			version: '0.58.12',
			date: '21 października 2026',
			groups: [
				['Ulice przy torach', [
					'Ulica biegnąca obok torów albo przy stacji leży poziomo na wysokości ulicy (z chodnikiem), a teren pod nią jest wyrównany – bez przechyłu ku torom.',
				]],
			],
		},
		{
			version: '0.58.11',
			date: '21 października 2026',
			groups: [
				['Przejazdy', [
					'Jezdnia przejazdu w poziomie główek szyn wszystkich torów, które przecina (także torów z mapy na innej wysokości); między torami płynnie, za torami zjazd do ulicy.',
				]],
				['Stacje', [
					'Ulice z mapy obok peronów nie znikają: strefa stacji obejmuje tylko peron z wyposażeniem (i miejsce na dworzec z gry), a nie cały pas 16 m od toru.',
				]],
			],
		},
		{
			version: '0.58.10',
			date: '21 października 2026',
			groups: [
				['Przejazdy', [
					'Bez przerwy z trawą między ulicą a przejazdem – jezdnia przejazdu sięga tam, gdzie zaczyna się ulica z mapy.',
					'Chodniki na przejeździe (gdy ulica je ma): z krawężnikiem po obu stronach jezdni, przez tory w poziomie jezdni.',
				]],
			],
		},
		{
			version: '0.58.9',
			date: '21 października 2026',
			groups: [
				['Wiadukty drogowe', [
					'Filary pod wiaduktami nad stacjami – dotąd przez błąd w wykrywaniu dróg pod pomostem długie wiadukty (np. 140 m w Gliwicach) nie miały żadnej podpory.',
					'Przyczółki ze ścianami skrzydłowymi tam, gdzie pomost wchodzi w zbocze wykopu albo kończy się nad terenem – pomost nie leży już na trawie.',
					'Oczepy na filarach, gzyms wzdłuż pomostu; betonowe balustrady tylko nad przęsłami – przy zjeździe na poziomie ulicy niski krawężnik.',
				]],
			],
		},
		{
			version: '0.58.8',
			date: '21 października 2026',
			groups: [
				['Perony', [
					'Ławki i kosze co najmniej 1 m za żółtym pasem ostrzegawczym; na wąskim peronie wyspowym jedna ławka zamiast pary, na zbyt wąskim – bez ławek.',
					'Pasażerowie czekają, spacerują i stoją w kolejce do drzwi za żółtym pasem; przechodzą przez niego tylko przy wsiadaniu, a po wysiadaniu najpierw odchodzą od krawędzi.',
				]],
			],
		},
		{
			version: '0.58.7',
			date: '21 października 2026',
			groups: [
				['Wiaty', [
					'Wiaty stacyjne mieszczą się w obrysie peronu: dach kończy się przed krawędzią od strony toru i przed tylną krawędzią, wzdłuż – co najmniej 3 m przed końcami peronu.',
				]],
			],
		},
		{
			version: '0.58.6',
			date: '21 października 2026',
			groups: [
				['Wiaty', [
					'Wiaty przystankowe: matowy pas ostrzegawczy na szybach, blenda dookoła dachu z okapnikiem, słupki na końcach ścian bocznych, kosz przy wiacie.',
					'Wiaty stacyjne: dach z blachy na rąbek stojący.',
				]],
				['Latarnie uliczne', [
					'Słup gładszy, toczony cokół, drzwiczki rewizyjne, kołnierz pod wysięgnikiem, tulejka na końcu wysięgnika.',
					'Drogi główne: opływowa oprawa LED z radiatorem; osiedlowe: kopułka z kołnierzem i iglicą.',
				]],
				['Niebo', [
					'Gwiazdy i księżyc całkiem znikają w dzień (zostawały słabe punkty).',
				]],
			],
		},
		{
			version: '0.58.5',
			date: '21 października 2026',
			groups: [
				['Przejazdy', [
					'Półrogatki: napęd przy sygnalizatorze, ramię w biało-czerwone pasy z lampkami i przeciwwagą – opadają kilka sekund po włączeniu świateł, podnoszą się po przejeździe pociągu.',
				]],
				['Budynki', [
					'Bloki mieszkalne z balkonami przy oknach (płyta i balustrada w kolorze wybranym dla bloku).',
					'Dachy dwuspadowe i kopertowe z okapem i podbitką, domy z kominami.',
				]],
				['Perony', [
					'Ławki z żeliwnymi bokami i wygiętym oparciem, kosze toczone z wywiniętym brzegiem.',
				]],
				['Niebo', [
					'Gwiazdy gasną w dzień (w trybie WebGPU było je widać w południe na błękicie).',
				]],
			],
		},
		{
			version: '0.58.4',
			date: '21 października 2026',
			groups: [
				['Ludzie', [
					'Gładsza sylwetka: tułów, biodra, uda, łydki i ręce z brył obrotowych zamiast walców.',
					'Głowa w kształcie jajka (bez wystającej żuchwy), oczy z białkami, usta, nowe włosy.',
				]],
				['Samochody', [
					'Koła z oponami o zaokrąglonym barku i felgami z pięcioma ramionami.',
					'Dostawczy: szyby tylko w kabinie, blaszana część ładunkowa z drzwiami przesuwnymi i tylnymi.',
					'Szczeliny drzwi, przetłoczenie na boku, listwa pod szybami, kierunkowskazy, światła przeciwmgłowe i cofania, wycieraczki, antena, wydech.',
				]],
			],
		},
		{
			version: '0.58.3',
			date: '21 października 2026',
			groups: [
				['EZT', [
					'ED250: nos zwężony także od dołu (sylwetka Pendolino), pod nim skośna owiewka ze zgarniaczem, sprzęg schowany pod nosem.',
					'Elf i ED250: obudowy klimatyzatorów na dachu ze skośnymi owiewkami, żaluzjami na bokach i dwoma wentylatorami.',
					'Elf: miech przegubu prawie na całą szerokość pudła, dopasowany do dachu, z gęstymi fałdami i ramami.',
					'Gęstsze fałdy miechów także w EN57 i wagonach pasażerskich.',
				]],
			],
		},
		{
			version: '0.58.2',
			date: '21 października 2026',
			groups: [
				['Tabor', [
					'Puste Eaos: wnętrze ze słupkami i podłużnicą, wytarte ściany, podłoga z blach ze spoinami, węgiel w kątach.',
					'Falns: pełne leje w środku – skośne dna od czół do zsypów i grzbiet rozdzielający leje.',
					'Habbiins: ściany przesuwne z gęstymi przetłoczeniami, szczelinami między skrzydłami, drążkami zamknięć i szynami rolek.',
					'Nowoczesne EZT (Elf, ED250) i wagony A9 / B10: hamulce tarczowe – tarcze wentylowane na osiach i zaciski zamiast klocków.',
				]],
			],
		},
		{
			version: '0.58.1',
			date: '21 października 2026',
			groups: [
				['Tabor', [
					'Wagony towarowe na wózkach Y25: prowadnice nad maźnicami z gniazdami sprężyn, łączniki Lenoir, belki hamulcowe.',
					'Węgiel w Eaos i Falns usypany w pryzmę z bryłkami.',
					'ET22, EU07 i inne lokomotywy: żaluzje boczne z pochylonymi listwami w kolorze pudła.',
					'EN57: skrzynie oporników na dachu z ocynkowanej blachy, z kratą i żaluzjami.',
				]],
			],
		},
		{
			version: '0.58.0',
			date: '21 października 2026',
			groups: [
				['Nowa trasa', [
					'Kraków Główny – Zakopane: 135,8 km, 49 stacji i przystanków, przez Skawinę, Kalwarię, Suchą Beskidzką Zamek, Chabówkę i Nowy Targ – górskie pochylenia do 29‰, Tatry na horyzoncie.',
				]],
				['Generator tras', [
					'Stacje do 100 km od siebie w linii prostej (dotąd 70 km).',
					'Kilka numerów linii po przecinku (np. „91,94,97,98,99”) – przebieg przez węzły, z łącznicami.',
					'Prędkości PKP PLK na przebiegu przez kilka linii – kilometraż każdej linii na jej odcinku.',
				]],
			],
		},
		{
			version: '0.57.7',
			date: '21 października 2026',
			groups: [
				['Interfejs', [
					'Licznik FPS w jednej linii z przyciskiem pauzy, tuż na lewo od niego.',
				]],
			],
		},
		{
			version: '0.57.6',
			date: '21 października 2026',
			groups: [
				['Trasy', [
					'Tor równoległy tuż obok naszego (Rybnik – Katowice, km 3,2–4,3) ma z powrotem szyny – w 0.57.5 zniknęły razem z podkładami; teraz szyny, podkłady i podsypka.',
				]],
			],
		},
		{
			version: '0.57.5',
			date: '21 października 2026',
			groups: [
				['Trasy', [
					'Tor równoległy leżący w danych mapy bliżej niż zwykle (np. Rybnik – Katowice, km 3,2–4,3 – tor z naprzeciwka) ma podsypkę i podkłady – dotąd same szyny na trawie (brany za rozjazd łączący się z naszym torem).',
				]],
			],
		},
		{
			version: '0.57.4',
			date: '21 października 2026',
			groups: [
				['Tabor', [
					'ST44 z dużymi szybami czołowymi, wysoko jak w prawdziwej lokomotywie (od linii okien bocznych, ok. 2,9 m nad szyną) – wcześniej małe i za nisko; kabina, okna boczne i drzwi wyżej, z kabiny widok przez szybę.',
					'Okna boczne kabin lokomotyw i zespołów: przez szybę widać wnętrze kabiny z maszynistą (wcześniej szara ściana tuż za szybą).',
					'Drzwi boczne kabin lokomotyw bez linii przez środek – spoiny blach tylko na burcie, nie na drzwiach.',
				]],
			],
		},
		{
			version: '0.57.3',
			date: '21 października 2026',
			groups: [
				['Ostrość obrazu', [
					'Szyny bez szerokich niebieskich pasów: poszerzanie szyn w oddali liczy odległość od kamery, która faktycznie rysuje obraz, nie działa w mapach cieni i jest ograniczone do kilkunastu centymetrów.',
				]],
			],
		},
		{
			version: '0.57.2',
			date: '21 października 2026',
			groups: [
				['Cienie', [
					'Cienie terenu (wzgórza, wykopy) wróciły na wysoką jakość cieni – bez utraty odbić na wodzie: niewidoczne bryły do rzucania cieni (WebGPU) nie trafiają już do obrazu ani do odbicia wody.',
				]],
			],
		},
		{
			version: '0.57.1',
			date: '21 października 2026',
			groups: [
				['Cienie', [
					'Wysoka jakość cieni na razie bez cieni terenu (wzgórz i wykopów): przy nich część tafli wody – pas wzdłuż kawałka świata – traciła odbicia. Wrócą po znalezieniu przyczyny.',
				]],
			],
		},
		{
			version: '0.57.0',
			date: '21 października 2026',
			groups: [
				['Ostrość obrazu', [
					'Szyny w oddali nie chudną poniżej ok. 1 piksela – zamiast przerywanej, migoczącej kreski ciągła, wyraźna linia toru (z bliska bez zmian).',
					'Wyostrzanie obrazu po wygładzaniu krawędzi (z efektami – jakość średnia i wysoka): przywraca ostrość cienkich linii (szyny, sieć trakcyjna), którą rozmywało wygładzanie FXAA w WebGPU; suwak „Wyostrzanie obrazu” w ustawieniach grafiki (domyślnie 35%).',
					'Rozdzielczość renderowania 125% i 150% – najostrzejszy obraz (supersampling), kosztem płynności.',
					'Filtrowanie anizotropowe 16× wszystkich tekstur – ostrzejsze pod ostrym kątem tablice, fasady i liście.',
				]],
			],
		},
		{
			version: '0.56.1',
			date: '21 października 2026',
			groups: [
				['Woda', [
					'Szerokie rzeki (np. Wisła w Toruniu) bez jasnego pasa wzdłuż środka – linia biegu rzeki nie jest już rysowana na tafli rzeki jako osobny ciek.',
					'Cała tafla szerokiej rzeki na jednym poziomie – odbicia po obu stronach, dawniej część tafli (inny poziom z zaszumionego pomiaru) bez odbić.',
				]],
			],
		},
		{
			version: '0.56.0',
			date: '21 października 2026',
			groups: [
				['Woda (etap 2 – wygląd)', [
					'Kolor wody wg głębokości: przy brzegu i na płyciznach jaśniejsza, zielonkawo-piaskowa (prześwitujące dno), na głębi ciemna; przy samym brzegu jasna, falująca linia piany; na płyciźnie słabsze odbicie.',
					'Na rzekach i potokach drobne zmarszczki płyną z nurtem (szybciej na szerszych), gładsza tafla – ostrzejszy odblask słońca na falach.',
					'Odbicie wody w WebGPU bez deszczu, śniegu, wnętrza kabiny i flary słońca (jak w WebGL).',
				]],
				['Cienie (etap 3)', [
					'Płynne przejście między kaskadami cieni (bez widocznego szwu, gdzie zmienia się ostrość cienia) i łagodne wygaszanie cieni na końcu ich zasięgu.',
					'Miękkie krawędzie cieni – dalej od kamery bardziej rozmyte; najdalsza kaskada odświeżana od razu przy szybkim ruchu kamery.',
					'Wysoka jakość cieni: wzgórza i wykopy rzucają cień; niska: budynki, perony i słupy blisko pociągu też rzucają cień (dotąd tylko pociąg).',
				]],
				['Ustawienia', [
					'Grafika: nowe ustawienia „Cienie – jakość” i „Woda – jakość” (domyślnie jak jakość ogólna) – niska / średnia / wysoka niezależnie od reszty grafiki.',
				]],
			],
		},
		{
			version: '0.55.13',
			date: '21 października 2026',
			groups: [
				['Woda (etap 1 – kształt i poziom)', [
					'Rzeki i potoki z płaskim lustrem wody zamiast wstęgi położonej na terenie: poziom liczony wzdłuż biegu (bez płynięcia pod górę, odfiltrowany szum pomiaru), w poprzek poziomo; koryto z dnem i skarpami brzegów wycięte w terenie, gęstsza siatka terenu przy potokach biegnących wzdłuż toru.',
					'Jeziora, stawy i szerokie rzeki: brzeg z gładkiego konturu zamiast schodków co 10 m, jeden wygładzony poziom dla całego zbiornika (bez schodków lustra między pasami).',
				]],
			],
		},
		{
			version: '0.55.12',
			date: '21 października 2026',
			groups: [
				['Ustawienia', [
					'Każda zmiana ustawień grafiki (rozdzielczość, wygładzanie, cienie, pociągi tła, dopasowanie szczegółów, automatyczny dobór jakości) pokazuje okno wczytywania – w menu i w pauzie, bez zawieszenia gry po jego zamknięciu.',
				]],
			],
		},
		{
			version: '0.55.11',
			date: '21 października 2026',
			groups: [
				['Ruch uliczny', [
					'Drogi gruntowe (polne, leśne – nawierzchnia gruntowa w danych z mapy) bez aut; czasem idzie nimi ktoś pieszo, skrajem drogi – najwyżej cztery osoby naraz.',
				]],
			],
		},
		{
			version: '0.55.10',
			date: '21 października 2026',
			groups: [
				['Komunikaty w czasie jazdy', [
					'Pasek komunikatów u góry (czuwak, prędkość, zdarzenia…) znów niżej – 66 px od górnej krawędzi, jak przed 0.47.0; przy radiotelefonie pod jego okienkiem.',
				]],
			],
		},
		{
			version: '0.55.9',
			date: '21 października 2026',
			groups: [
				['Ruch uliczny', [
					'Auta i autobusy nie stają na przejazdach kolejowych: wjeżdżają na przejazd tylko wtedy, gdy za torami jest miejsce na całe auto (jak w przepisach) – czekają przed linią zatrzymania, gdy tuż za przejazdem stoi kolejka albo świeci czerwone na skrzyżowaniu.',
					'Autobus pomija przystanek tuż za przejazdem, przy którym jego tył zostałby na torach.',
				]],
			],
		},
		{
			version: '0.55.8',
			date: '21 października 2026',
			groups: [
				['Komunikaty w czasie jazdy', [
					'Wszystkie komunikaty w pasku u góry (z lampką – stany pojazdu, „w porządku”, ostrzeżenia, zdarzenia i kary) w jednej linii: lampka, kategoria i treść obok siebie.',
				]],
			],
		},
		{
			version: '0.55.7',
			date: '21 października 2026',
			groups: [
				['Komunikaty w czasie jazdy', [
					'Komunikaty o stanie (czuwak, SHP, prędkość, drzwi, poślizg, pantograf…) w jednej linii: lampka, kategoria i treść obok siebie; zdarzenia i kary – jak dotąd, kategoria nad treścią.',
				]],
			],
		},
		{
			version: '0.55.6',
			date: '21 października 2026',
			groups: [
				['Komunikaty w czasie jazdy', [
					'Zapowiedź na wyświetlaczu LED przewija się dwa razy, zanim pojawi się następna.',
				]],
			],
		},
		{
			version: '0.55.5',
			date: '21 października 2026',
			groups: [
				['Komunikaty w czasie jazdy', [
					'Stany pojazdu (czuwak, SHP, przekroczenie prędkości, drzwi, poślizg, piasecznica, pantograf, hamulec, napęd) znów w pasku u góry – dymek obok pulpitu usunięty; jeden wpis na stan, odświeżany i znikający, gdy stan minie.',
				]],
			],
		},
		{
			version: '0.55.4',
			date: '21 października 2026',
			groups: [
				['Komunikaty w czasie jazdy', [
					'Potwierdzenia akcji u góry na środku – pod paskiem zdarzeń (albo w jego miejscu, gdy pusty; pod radiotelefonem, gdy nadaje), kategoria i treść wyrównane do lewej.',
				]],
			],
		},
		{
			version: '0.55.3',
			date: '21 października 2026',
			groups: [
				['Wydajność', [
					'Grafika WebGPU: zmiana trasy w menu nie zostawia już w pamięci starego świata – zużycie pamięci nie rośnie przy kolejnych zmianach (było ok. 250 MB więcej za każdym razem).',
				]],
			],
		},
		{
			version: '0.55.2',
			date: '21 października 2026',
			groups: [
				['Komunikaty w czasie jazdy', [
					'Potwierdzenia akcji (kamera, czas, wycieraczki, „Drzwi zamknięte”…) na środku, tuż nad wskazówką – zamiast w prawym górnym rogu; w samouczku nad okienkiem instruktora.',
				]],
			],
		},
		{
			version: '0.55.1',
			date: '21 października 2026',
			groups: [
				['Komunikaty w czasie jazdy', [
					'Potwierdzenia akcji w prawym górnym rogu z kategorią nad treścią – tak samo jak pasek u góry i dymek przy pulpicie (dziennik w pauzie bez zmian – kategoria w kolumnie z lewej).',
				]],
			],
		},
		{
			version: '0.55.0',
			date: '21 października 2026',
			groups: [
				['Komunikaty w czasie jazdy', [
					'Komunikaty rozdzielone według rodzaju zamiast jednego paska u góry: potwierdzenia akcji (kamera, czas, wycieraczki…) – mała linijka w prawym górnym rogu, nowa zastępuje poprzednią i znika po ok. 2 s.',
					'Stany pojazdu (czuwak, SHP, przekroczenie prędkości, drzwi, poślizg, piasecznica, pantograf, hamulec, napęd) – dymek obok pulpitu, przy lampkach; najwyżej dwa naraz, znika, gdy stan minie.',
					'Zapowiedzi – wyświetlacz pasażerski LED pod rozkładem: pomarańczowe diody, tekst przewijany jak w pociągu, kolejne po kolei.',
					'U góry zostają tylko zdarzenia i kary, ostrzeżenia, „w porządku” (odjazd, wynik zatrzymania) i warunki na linii (zanik napięcia, oblodzenie, liście).',
					'Pauza: nowa zakładka „Dziennik” – wszystkie komunikaty jazdy z godziną i kategorią, najnowsze u góry.',
				]],
			],
		},
		{
			version: '0.54.19',
			date: '21 października 2026',
			groups: [
				['Pulpit w czasie jazdy', [
					'Panel sygnalizacji (semafor, ograniczenie, profil) nie dotyka panelu przycisków: na niższym ekranie podnosi się tak, by zostało co najmniej 14 px odstępu.',
				]],
			],
		},
		{
			version: '0.54.18',
			date: '21 października 2026',
			groups: [
				['Wydajność', [
					'WebGPU: zmiana składu w menu ok. 0,8 s zamiast ok. 10 s (pierwsza zmiana na nowy tabor ok. 3,5 s), bez zawieszenia gry po zamknięciu okienka.',
				]],
			],
		},
		{
			version: '0.54.17',
			date: '20 października 2026',
			groups: [
				['Grafika', [
					'WebGPU: bez migających i przesuwających się z kamerą elementów (sieć trakcyjna, perony) po przyspieszeniu z 0.54.16.',
				]],
			],
		},
		{
			version: '0.54.16',
			date: '20 października 2026',
			groups: [
				['Wydajność', [
					'WebGPU: znacznie więcej klatek na sekundę – w nocy na trasie Rybnik – Katowice ok. 61 zamiast 28, w dzień i w deszczu o 25–60% więcej.',
				]],
				['Grafika', [
					'WebGPU: woda znów widoczna (po chwilowym błędzie rysowania odbicia potrafiła zniknąć do końca jazdy).',
				]],
			],
		},
		{
			version: '0.54.15',
			date: '20 października 2026',
			groups: [
				['Grafika', [
					'WebGPU: bez fragmentów świata rysowanych z cudzej kamery – pomniejszonej sieci trakcyjnej, peronów czy torów wiszących w powietrzu albo jadących razem z widokiem (np. po zmianie pory roku lub pogody w pauzie).',
					'WebGPU: elementy świata nie znikają już na stałe po chwilowym błędzie karty graficznej.',
				]],
			],
		},
		{
			version: '0.54.14',
			date: '20 października 2026',
			groups: [
				['Grafika', [
					'WebGPU: statyczny świat odświeżany po zmianie jakości i warunków (pogoda, pora roku) – bez zniekształconych cieni po takiej zmianie.',
				]],
			],
		},
		{
			version: '0.54.13',
			date: '20 października 2026',
			groups: [
				['Grafika', [
					'WebGPU: bez „miniatur” i przesuniętych cieni (np. sieć trakcyjna, peron i wózki pociągu w złym miejscu na ziemi) – dalsze kaskady cieni przesuwają się razem z odświeżeniem swojej mapy.',
				]],
			],
		},
		{
			version: '0.54.12',
			date: '20 października 2026',
			groups: [
				['Grafika', [
					'WebGPU: znów widać znacznik drogi hamowania H4 na torze przed pociągiem i inne półprzezroczyste elementy (zamalowywał je statyczny świat).',
				]],
			],
		},
		{
			version: '0.54.11',
			date: '20 października 2026',
			groups: [
				['Ekrany', [
					'Ekran wczytywania trasy: zamiast stałych etapów – co się naprawdę dzieje, z licznikami (budowa świata, kompilacja shaderów i odbić w wodzie, rozgrzewanie karty); procent rośnie także przy kompilacji (wcześniej stał na 90%).',
				]],
			],
		},
		{
			version: '0.54.10',
			date: '20 października 2026',
			groups: [
				['Ustawienia', [
					'Zmiana jakości grafiki (niska / średnia / wysoka) – w menu i w pauzie okienko przeładowania z etapami (przebudowa świata, kompilacja shaderów i potoków z licznikami) zamiast zatrzymanego obrazu.',
				]],
			],
		},
		{
			version: '0.54.9',
			date: '20 października 2026',
			groups: [
				['Menu', [
					'Wybór trasy (WebGPU): okienko kilka razy krótsze i bez wielosekundowych zatrzymań, z licznikiem kompilacji shaderów i potoków karty graficznej.',
				]],
			],
		},
		{
			version: '0.54.8',
			date: '20 października 2026',
			groups: [
				['Ekrany', [
					'Ekran startowy: pod paskiem postępu napis, co się właśnie wczytuje – pliki gry, karta graficzna, świat podglądu (z liczbą kawałków), shadery i potoki karty graficznej (ile z ilu).',
				]],
			],
		},
		{
			version: '0.54.7',
			date: '20 października 2026',
			groups: [
				['Ekrany', [
					'Ekran startowy (WebGPU): bez kilkusekundowych zatrzymań – tuż po starcie karty graficznej i na końcu przygotowania shaderów przed menu.',
				]],
			],
		},
		{
			version: '0.54.6',
			date: '19 października 2026',
			groups: [
				['Ekrany', [
					'Ekran startowy i ekran wczytywania trasy: animacja tła płynna także wtedy, gdy gra wczytuje świat i shadery (rysowana w osobnym wątku).',
				]],
			],
		},
		{
			version: '0.54.5',
			date: '19 października 2026',
			groups: [
				['Grafika', [
					'WebGPU: naprawione wiszące w powietrzu perony, wagony i krzywa sieć trakcyjna na niektórych trasach (np. Orzesze Jaśkowice – Mikołów).',
				]],
			],
		},
		{
			version: '0.54.4',
			date: '19 października 2026',
			groups: [
				['Grafika', [
					'WebGPU: nocą bez czerwono-pomarańczowej poświaty na drzewach i horyzoncie – mgła w oddali jak w trybie WebGL.',
					'WebGL: naprawione wczytywanie jazdy (zatrzymywało się na 90%).',
				]],
			],
		},
		{
			version: '0.54.3',
			date: '19 października 2026',
			groups: [
				['Grafika', [
					'WebGPU: koniec kilkunastosekundowego zatrzymania obrazu przy pierwszym akwenie w kadrze (odbicie w wodzie) – shadery odbić kompilują się na ekranie wczytywania; mniej przycięć przy obrocie kamery.',
					'Szybszy start gry: przed menu tylko to, co w kadrze, reszta w tle.',
				]],
			],
		},
		{
			version: '0.54.2',
			date: '19 października 2026',
			groups: [
				['Pauza', [
					'Zmiana pogody albo pory roku w pauzie pokazuje okienko z postępem (efekty pogody, przebudowa świata, kompilacja shaderów) – bez zawieszenia obrazu.',
				]],
			],
		},
		{
			version: '0.54.1',
			date: '19 października 2026',
			groups: [
				['Grafika', [
					'WebGPU: znacznie krótsze wczytywanie – start gry ok. 3 razy szybciej, wejście do jazdy ok. 3 razy szybciej (shadery wspólne dla powtarzających się obiektów, kompilacja równoległa).',
				]],
			],
		},
		{
			version: '0.54.0',
			date: '19 października 2026',
			groups: [
				['Grafika', [
					'Nowy renderer WebGPU domyślnie: fizyczne niebo, trójwymiarowe chmury z cieniami na ziemi i nowe opady. Na kartach bez WebGPU gra sama przechodzi na WebGL.',
					'Ustawienia → Grafika → Renderer: automatycznie, WebGPU albo WebGL (dla starszych kart – mniejsze obciążenie procesora).',
				]],
			],
		},
		{
			version: '0.53.0',
			date: '19 października 2026',
			groups: [
				['Grafika', [
					'Tryb WebGPU (?webgpu) kompletny: deszcz, śnieg, spadające liście, rozbryzgi kropel i śnieg wzbijany przez pociąg – wszystkie efekty zwykłego trybu, do tego nowe niebo i chmury.',
				]],
			],
		},
		{
			version: '0.52.0',
			date: '19 października 2026',
			groups: [
				['Grafika', [
					'Tryb WebGPU (?webgpu): prawdziwe chmury – trójwymiarowe cumulusy oświetlone słońcem (o zachodzie różowe, nocą srebrne od księżyca), ich ilość i wysokość wg pogody, cienie chmur przesuwające się po polach i torach.',
				]],
			],
		},
		{
			version: '0.51.0',
			date: '19 października 2026',
			groups: [
				['Grafika', [
					'Tryb WebGPU (?webgpu): nowe niebo z fizycznej atmosfery – błękit jaśniejący ku horyzontowi, prawdziwe zmierzchy i świty, gwiazdy, Droga Mleczna i księżyc z fazą; mgła w oddali w kolorze nieba. Chmur w tym trybie jeszcze nie ma.',
				]],
			],
		},
		{
			version: '0.50.0',
			date: '19 października 2026',
			groups: [
				['Grafika', [
					'Tryb WebGPU (?webgpu): efekty obrazu jak w zwykłym trybie – poświata jasnych świateł, zacienienie zakamarków, promienie słońca, mgła w dolinach i filmowa kolorystyka (jakość średnia i wysoka).',
				]],
			],
		},
		{
			version: '0.49.1',
			date: '19 października 2026',
			groups: [
				['Grafika', [
					'Tryb WebGPU (?webgpu) ponad dwa razy płynniejszy – nieruchome otoczenie rysowane z gotowych, nagranych poleceń, cienie otoczenia jedną bryłą na odcinek.',
				]],
			],
		},
		{
			version: '0.49.0',
			date: '19 października 2026',
			groups: [
				['Grafika', [
					'Tryb WebGPU do wypróbowania (w budowie): dopisz ?webgpu do adresu gry. Teren, tory, budynki, pociągi, pogoda na powierzchniach, ludzie, szyby i woda wyglądają jak dotąd; nieba, opadów i efektów obrazu jeszcze w nim nie ma, a płynność jest na razie mniejsza niż w zwykłym trybie.',
				]],
			],
		},
		{
			version: '0.48.6',
			date: '18 października 2026',
			groups: [
				['Grafika', [
					'Nowsza wersja silnika grafiki (Three.js 0.186) – pierwszy krok przed przejściem na WebGPU. Wygląd gry bez zmian. Wersja przeglądarkowa wymaga serwera (npm start) – strona otwarta prosto z dysku już się nie wczyta.',
				]],
			],
		},
		{
			version: '0.48.5',
			date: '18 października 2026',
			groups: [
				['Ruch uliczny', [
					'Auta, autobusy i piesi nad tunelem (np. linia średnicowa w Warszawie – Aleje Jerozolimskie nad tunelem) jadą po ulicy, a nie w tunelu na poziomie toru; autobus na przystanku nad tunelem stoi na ulicy. Poziom torowiska tylko na przejazdach w poziomie.',
				]],
			],
		},
		{
			version: '0.48.4',
			date: '18 października 2026',
			groups: [
				['Ruch uliczny', [
					'Auta i piesi pod mostami i wiaduktami kolejowymi jadą i idą po jezdni pod przęsłem – dotąd w pasie kilku metrów od toru podnosiło ich do poziomu szyn (nawet ok. 6 m, „wjazd” na most). Na skrzyżowaniach dwupoziomowych dróg auta trzymają się wysokości własnej jezdni (dolnej pod wiaduktem, górnej na nim).',
				]],
			],
		},
		{
			version: '0.48.3',
			date: '18 października 2026',
			groups: [
				['Menu w czasie jazdy', [
					'Raport jazdy w pauzie jak tablica odjazdów w menu: nagłówek „RAPORT” z trasą i zegarem gry, prędkość, dozwolona i kilometr na klapkach, następna stacja (albo postój) i stan rozkładu („ZGODNIE Z ROZKŁADEM” zielono, „OPÓŹNIENIE +m:ss” czerwono) na klapkach, pod spodem semafor, odległość do końca, punkty i stan składu. Klapki przeskakują przy otwarciu pauzy.',
				]],
			],
		},
		{
			version: '0.48.2',
			date: '18 października 2026',
			groups: [
				['Menu w czasie jazdy', [
					'Krótsze menu postoju: bez przycisków „Rozkład jazdy” (jest zakładka w karcie po prawej) i „Swobodna kamera” (klawisz F działa nadal).',
				]],
			],
		},
		{
			version: '0.48.1',
			date: '18 października 2026',
			groups: [
				['Ustawienia', [
					'Szersze okno ustawień – nazwy i podsumowania pięciu zakładek mieszczą się w całości; numer zakładki w rogu.',
				]],
			],
		},
		{
			version: '0.48.0',
			date: '18 października 2026',
			groups: [
				['Ustawienia', [
					'Nowe zakładki w Ustawieniach: „Sterowanie” (klawisze) i „Zasady” (zatrzymanie przy W4, drzwi, hamulec zespolony, przyczepność, rozkazy pisemne, semafory, ograniczenia) – dostępne z menu i z pauzy.',
					'Z pauzy zniknął osobny ekran „Sterowanie” – przycisk „Ustawienia” (dźwięk · obraz · sterowanie) prowadzi do tych samych zakładek; w karcie drogowej („Pomoc”) zostały opcje pomocy w jeździe i odnośnik do Ustawień.',
				]],
			],
		},
		{
			version: '0.47.8',
			date: '18 października 2026',
			groups: [
				['Pulpit w czasie jazdy', [
					'Kartka rozkazu pisemnego jak druk kolejowy: kwadratowe rogi, czerwony pasek nagłówka z numerem rozkazu, przerywana linia podpisu dyżurnego ruchu, kwadratowy znacznik „Enter – potwierdzam odbiór” (pulsuje, po potwierdzeniu zielony).',
					'Po potwierdzeniu odbioru na polu podpisu pojawia się okrągła pieczątka stacji (fioletowy tusz, przekrzywiona); przycisk z liczbą rozkazów w panelu rozkładu w tym samym stylu.',
				]],
			],
		},
		{
			version: '0.47.7',
			date: '18 października 2026',
			groups: [
				['Menu w czasie jazdy', [
					'Karta postoju dopasowuje wysokość do treści (najwyżej 480 px, dłuższy rozkład przewija się w środku), a jej górna krawędź zostaje w tym samym miejscu przy przełączaniu widoków.',
				]],
			],
		},
		{
			version: '0.47.6',
			date: '18 października 2026',
			groups: [
				['Menu w czasie jazdy', [
					'Karta postoju (raport jazdy, rozkład jazdy, rozkazy) ma stałą wysokość i nie skacze przy przełączaniu widoków; długi rozkład przewija się w środku karty cienkim pomarańczowym paskiem.',
				]],
			],
		},
		{
			version: '0.47.5',
			date: '18 października 2026',
			groups: [
				['Zapowiedzi', [
					'Godziny w zapowiedziach głosowych czytane jak na dworcu: „o godzinie szóstej siedemnaście”, „o godzinie siódmej zero pięć”, „o godzinie osiemnastej” (zamiast cyfr czytanych po kolei); tekst na ekranie zostaje z cyframi.',
				]],
			],
		},
		{
			version: '0.47.4',
			date: '18 października 2026',
			groups: [
				['Pulpit w czasie jazdy', [
					'Komunikaty i zapowiedzi pokazują się z wyraźnym odstępem pod okienkiem dyżurnego ruchu – niezależnie od tego, czy treść radiotelefonu ma jedną, czy kilka linii.',
				]],
			],
		},
		{
			version: '0.47.3',
			date: '18 października 2026',
			groups: [
				['Pulpit w czasie jazdy', [
					'Okienko radiotelefonu (komunikat dyżurnego ruchu) w stylu pulpitu: szkło, zielony pasek z lewej, nagłówek „RADIOTELEFON · DYŻURNY RUCHU …” z migającą lampką nadawania, treść pod spodem; gdy czeka na potwierdzenie – pomarańczowy pasek i znacznik „Enter – zrozumiałem”.',
				]],
			],
		},
		{
			version: '0.47.2',
			date: '18 października 2026',
			groups: [
				['Pulpit w czasie jazdy', [
					'Komunikaty u góry w dwóch rzędach: w pierwszym lampka i rodzaj komunikatu (KOMUNIKAT, UWAGA, ZAPOWIEDŹ…), w drugim treść.',
				]],
			],
		},
		{
			version: '0.47.1',
			date: '18 października 2026',
			groups: [
				['Swobodna kamera', [
					'Panel swobodnej kamery w stylu nowego menu: szkło z narożnikami, nadtytuł „Widok z trasy · symulacja stoi” i tytuł „Swobodna kamera.”, pomarańczowy przycisk „Wróć do jazdy” z klawiszem F.',
					'Położenie kamery jak raport jazdy: kilometr, odległość od toru, wysokość i najbliższa stacja w osobnych wierszach.',
					'Suwak kilometrażu z wypełnieniem, widoki jako numerowane kafelki, zakładki jak w postoju, stacje jak wykaz w rozkładzie (kilometr + nazwa, najbliższa podświetlona).',
				]],
			],
		},
		{
			version: '0.47.0',
			date: '18 października 2026',
			groups: [
				['Pulpit w czasie jazdy', [
					'Okienka pulpitu w stylu nowego menu: ciemne szkło, kwadratowe rogi, pomarańczowe narożniki, nagłówki „▸ SEMAFOR”, „▸ NASTAWNIK”… – układ bez zmian.',
					'Zegar jak na tablicy odjazdów, status rozkładu z lampką (zielona – zgodnie z rozkładem, czerwona migająca – opóźnienie), bieżąca stacja jak wiersz tablicy, rozkład z rombami stacji.',
					'Prędkościomierz jak w kabinie: zielona strefa dozwolona, czerwona ponad ograniczeniem, pomarańczowy znacznik ograniczenia na obwodzie, odczyt cyfrowy w okienku; przy przekroczeniu wskazówka i cyfry czerwienieją.',
					'Semafor z masztem w biało-czerwone pasy, tarcza ograniczenia pulsuje przy przekroczeniu; lampki CA, DRZWI, POŚL, PIAS, HAM świecą jak kontrolki na pulpicie.',
					'Sterowanie w grupach „Jazda”, „Skład”, „Widok” z klawiszem przy każdym przycisku; „Hamowanie nagłe” wyróżnione na czerwono.',
					'Komunikaty jako wąski pasek dyżurnego u góry: lampka w kolorze wagi, kategoria (UWAGA, PRĘDKOŚĆ, PANTOGRAF, ZAPOWIEDŹ…) i treść; podpowiedź nad pulpitem (np. „Wymiana pasażerów…”) w tym samym stylu.',
				]],
			],
		},
		{
			version: '0.46.1',
			date: '18 października 2026',
			groups: [
				['Menu', [
					'Przycisk „Zakończ jazdę” (i „Wyjście” w aplikacji) ma tę samą wysokość co pozostałe akcje – różni się tylko ciemniejszym tłem.',
				]],
			],
		},
		{
			version: '0.46.0',
			date: '18 października 2026',
			groups: [
				['Menu w czasie jazdy', [
					'Postój (pauza) w układzie menu głównego: „Postój.” z pomarańczową lampą, opis i akcje – „Wznów jazdę” (Esc), „Rozkład jazdy”, „Warunki na trasie”, „Swobodna kamera” (F), „Zapisz / wczytaj”, „Sterowanie”, „Ustawienia”, „Zakończ jazdę”.',
					'Karta po prawej z trzema widokami: raport jazdy, rozkład jazdy (wykaz stacji: rozkład i rzeczywiste przejazdy z opóźnieniem; przejechane wyszarzone, bieżąca podświetlona) i rozkazy pisemne tej jazdy.',
					'„Warunki na trasie” (pogoda, pora dnia, pora roku) i „Sterowanie” (klawisze i zasady) to osobne ekrany; Esc wraca z nich do postoju.',
					'„Zakończ jazdę” z potwierdzeniem w przycisku: pierwsze kliknięcie – „Na pewno? Jazda trafi do autozapisu”, drugie – wyjście do menu.',
					'Pod menu postoju gra jest rozmyta i przygaszona, a dźwięki jazdy stłumione jak za szybą (zapowiedzi i dźwięki menu wyraźne).',
				]],
			],
		},
		{
			version: '0.45.4',
			date: '18 października 2026',
			groups: [
				['Menu', [
					'Koniec migającego paska przewijania z prawej strony menu: pas światła ramy co kilka sekund wychodził poza dół ekranu, a linia światła przy otwarciu okna – poza dół okna; oba na chwilę wywoływały pasek przewijania.',
				]],
			],
		},
		{
			version: '0.45.3',
			date: '18 października 2026',
			groups: [
				['Menu', [
					'Okna menu (np. Scenariusze) otwierają się bez mignięcia: zamiast skalowania i przesunięcia – krótkie pojawienie się; miejsce na pasek przewijania jest zarezerwowane, więc okno nie zmienia szerokości, gdy pasek się pojawi.',
				]],
			],
		},
		{
			version: '0.45.2',
			date: '18 października 2026',
			groups: [
				['Menu', [
					'Podpisy na bursztynowych przyciskach (np. „Nowa trasa” w generatorze tras) są ciemne jak tytuł przycisku – jasne były nieczytelne na bursztynowym tle.',
				]],
			],
		},
		{
			version: '0.45.1',
			date: '18 października 2026',
			groups: [
				['Menu', [
					'Małe okienka wczytywania (zmiana trasy, składu, warunków, podgląd składu) w stylu nowego menu: szkło z bursztynowymi narożnikami, nadtytuł z lampą („Wczytywanie trasy · zestawianie przebiegu”, „Zmiana składu · manewry”, „Podgląd składu · hala postojowa”, „Zmiana warunków · komunikat meteo”), etap i procent, pasek z odblaskiem; po zakończeniu lampa zielona.',
					'Etapy po kolejowemu: „Zestawianie przebiegu…”, „Układanie rozkładu jazdy…”, „Budowa otoczenia linii…”, „Droga przebiegu ułożona ✓”.',
				]],
			],
		},
		{
			version: '0.45.0',
			date: '18 października 2026',
			groups: [
				['Nowe menu – etapy 2–5', [
					'Wszystkie okna menu w nowym stylu: szkło z bursztynowymi narożnikami, linia światła przy otwarciu, nadtytuł z lampą semafora i tytuł („Karta drogowa.”, „Scenariusze.”, „Ustawienia.”, „Moje trasy.”…), kwadratowe przyciski z bursztynowym podświetleniem.',
					'„Nowa jazda” to teraz „Karta drogowa.”: zakładki 01–04, lista tras z wyróżnieniem wybranej, numerowane kafelki pogody, pory dnia i roku, przycisk „Odjazd”.',
					'Suwaki z wypełnionym torem i prostokątnym uchwytem (ustawienia, karta drogowa).',
					'Pauza „Postój.” z kartą „RAPORT JAZDY” po prawej: położenie, prędkość i dozwolona, następna stacja, opóźnienie, semafor, punkty, stan składu.',
					'Koniec jazdy: „Stacja końcowa – …” z zieloną lampą albo „Jazda przerwana.” – okno zdarzenia kolejowego w czerwonych barwach.',
					'Dźwięki menu w kolejowym stylu: tyknięcie przekaźnika (najechanie), zaskok nastawnika (kliknięcie), przełożenie zwrotnicy (wybór kafelka, zakładki, trasy), zwolnienie (wstecz), przełącznik, gong po wygenerowaniu trasy. Opcja „Dźwięki menu” w ustawieniach dźwięku.',
					'Opcja „Ogranicz animacje menu” w ustawieniach grafiki (także systemowe „ogranicz ruch”).',
					'Tło menu: ujęcia kolejowe co 9–12 s – przy stacji widok z peronu, poza nią przejazd obok kamery przy torze, przelot z boku, kamera nisko przed czołem pociągu, widok z góry jak z wiaduktu.',
				]],
			],
		},
		{
			version: '0.44.0',
			date: '18 października 2026',
			groups: [
				['Nowe menu – etap 1', [
					'Nowy wygląd menu głównego: rama na cały ekran (narożniki jak oznaczenia na peronie, przesuwający się pas światła reflektora), nagłówek z logo i stopka z wersją, skrótami klawiszy i „Co nowego”.',
					'Ekran główny „Gotowy do odjazdu.”: nadtytuł z lampą semafora (skład, numer pociągu, stacja, tor), opis jazdy i akcje z podpowiedziami po prawej – „Kontynuuj jazdę” (gdy jest autozapis), „Szybki odjazd” (Enter – bieżąca trasa i skład), „Nowa jazda”, „Scenariusze”, „Wczytaj grę”, „Generator tras”, „Ustawienia”, „Historia jazd”.',
					'Tablica odjazdów po prawej: godzina, numer pociągu, peron i tor, kierunek – litery przeskakują jak na dworcowej tablicy przy zmianie trasy; stacje pośrednie (przewijane), uwagi, skład, długość i czas jazdy, warunki, zegar dworcowy.',
					'Fokus od razu na pierwszej akcji – menu można obsługiwać klawiaturą (Tab, Enter).',
				]],
			],
		},
		{
			version: '0.43.3',
			date: '17 października 2026',
			groups: [
				['Generator tras', [
					'Pasek generowania trasy w tle jest zawsze w prawym górnym rogu – w menu w tym samym miejscu i tej samej wielkości co w czasie jazdy.',
				]],
			],
		},
		{
			version: '0.43.2',
			date: '17 października 2026',
			groups: [
				['Generator tras', [
					'Przycisk „Szczegóły” na pasku generowania nazywa się teraz „Pokaż przebieg” i jest tylko w menu: otwiera ekran „Nowa trasa” z kartą postępu i wszystkimi komunikatami generatora (także po zakończeniu, np. po błędzie). W czasie jazdy był widoczny, ale nic nie robił.',
				]],
			],
		},
		{
			version: '0.43.1',
			date: '17 października 2026',
			groups: [
				['Menu', [
					'„Generator tras” w menu głównym otwiera podmenu z dwiema opcjami: „Nowa trasa” (formularz i postęp generowania) oraz „Moje trasy” (lista wygenerowanych i zaimportowanych tras z liczbą tras, wybór, kontrola, horyzont, import i eksport). Między ekranami – skróty w nagłówku; „Wróć” i Esc wracają do podmenu.',
				]],
			],
		},
		{
			version: '0.43.0',
			date: '17 października 2026',
			groups: [
				['Generator tras', [
					'Generator i lista tras są na jednym ekranie „Generator tras”: po lewej nowa trasa, po prawej „Twoje trasy” (wybór, kontrola, horyzont, import i eksport). Przycisk „Wygenerowane trasy” w menu głównym zniknął.',
					'Generowanie działa w tle, w osobnym wątku – gra się nie zacina i można w tym czasie grać. Postęp widać na pasku (w menu na dole po lewej, w czasie jazdy w prawym górnym rogu): etap, procent, czas, „Szczegóły” i „Anuluj”. Po zakończeniu – „Jedź: …” (w menu) albo komunikat w czasie jazdy.',
					'Na ekranie generatora: karta postępu i rozwijany pełny przebieg generowania.',
					'Wygenerowana trasa nie chowa się już za trasą wbudowaną w drugą stronę (np. własna Gliwice – Zabrze i wbudowana Zabrze – Gliwice) – pary kierunków tylko z tego samego źródła.',
				]],
			],
		},
		{
			version: '0.42.6',
			date: '17 października 2026',
			groups: [
				['Menu', [
					'Zmiana stacji początkowej pokazuje okienko wczytywania (przygotowanie trasy, rozkład jazdy, budowa świata – z paskiem postępu) z nazwą przebiegu, jak przy wyborze trasy. Dawniej świat budował się bez okienka i menu na chwilę zamierało.',
				]],
			],
		},
		{
			version: '0.42.5',
			date: '17 października 2026',
			groups: [
				['Menu', [
					'Stacja początkowa: zamiast siatki kafelków – schemat linii w jednym wierszu (stacje jako kropki, nazwy na przemian nad i pod linią, odcinek jazdy na bursztynowo, pominięte stacje wyszarzone). Kliknięcie kropki albo nazwy wybiera stację. Pod schematem podsumowanie: start, stacja końcowa, długość i liczba postojów po drodze.',
				]],
			],
		},
		{
			version: '0.42.4',
			date: '17 października 2026',
			groups: [
				['Menu', [
					'Przebieg w „Warunkach”: kierunek jazdy wybiera się przełącznikiem z dwoma przyciskami, a stację początkową – kafelkami stacji z kilometrem (stacja końcowa wyszarzona).',
					'Listy rozwijane w menu (napęd, hamulec, jakość grafiki, zapowiedzi…) mają jednolity ciemny wygląd ze strzałką i podświetleniem; dawniej po najechaniu myszą robiły się białe. Napęd i hamulec są wyrównane.',
				]],
			],
		},
		{
			version: '0.42.3',
			date: '17 października 2026',
			groups: [
				['Ruch uliczny', [
					'Nocą reflektory i światła tylne aut świecą – poświata widoczna także z daleka, najjaśniejsza, gdy światło świeci w stronę kamery.',
					'Wszystkie przystanki autobusowe z mapy stoją przy ulicach (np. Gliwice – Zabrze: 85 z 85).',
				]],
			],
		},
		{
			version: '0.42.2',
			date: '17 października 2026',
			groups: [
				['Ruch uliczny', [
					'Nocą auta oświetlają jezdnię: ciepła plama światła reflektorów przed autem i czerwona poświata świateł tylnych za nim (mocniejsza, gdy auto stoi).',
					'Więcej przystanków autobusowych na ulicach – także przy drogach dojazdowych (zatoki i pętle autobusowe) i na krótkich odcinkach ulic; np. Gliwice – Zabrze: 81 z 85 przystanków z mapy (wcześniej 54).',
					'Auta skręcające jednocześnie z dwóch pasów jednego wlotu nie najeżdżają na siebie.',
					'Na wąskich drogach dwukierunkowych auta mijają się z naprzeciwka powoli.',
				]],
			],
		},
		{
			version: '0.42.1',
			date: '17 października 2026',
			groups: [
				['Poprawki', [
					'Gra czasem się nie wczytywała (błąd „Cannot read properties of undefined (reading \'code\')”) po zmianie stacji początkowej albo przy wczytaniu zapisu z inną stacją początkową. Teraz świat buduje się od nowa dla wybranej stacji.',
				]],
			],
		},
		{
			version: '0.42.0',
			date: '17 października 2026',
			groups: [
				['Ruch uliczny i pieszy', [
					'Na trasach z mapy jeżdżą auta osobowe, dostawczaki, ciężarówki i autobusy. Ruch jest prawostronny, zgodny z kierunkiem ulic (jednokierunkowe tylko zgodnie z kierunkiem) i z liczbą pasów z mapy.',
					'Kierowcy stają na czerwonym (te same fazy co sygnalizatory w grze), ustępują pierwszeństwa na wlotach z A-7, na skrzyżowaniach równorzędnych przepuszczają jadących z prawej, a skręcający w lewo – jadących z naprzeciwka. Na skrzyżowanie wjeżdżają tylko wtedy, gdy za nim jest miejsce.',
					'Przed przejściami dla pieszych auta zatrzymują się, gdy pieszy jest na pasach; z sygnalizacją – według świateł.',
					'Przed przejazdem kolejowym auta czekają w kolejce, gdy nadjeżdża pociąg (Twój albo inny); po jego przejeździe ruszają.',
					'Autobusy zatrzymują się na przystankach z mapy (znak D-15 i wiata). Przy przystankach czekają pasażerowie: wsiadają do autobusu, a część wysiada i idzie chodnikiem.',
					'Piesi chodzą chodnikami, skręcają za róg na skrzyżowaniach, przechodzą przez pasy (z sygnalizacją – na zielonym, bez – gdy nic nie nadjeżdża) i przez przejazd kolejowy, czekając przy opuszczonych rogatkach. Przy stacjach jest ich więcej.',
					'Nowa opcja „Ruch uliczny” w zakładce „Warunki” (brak, mały, średni, duży). Liczba aut i pieszych oraz zasięg rosną z jakością grafiki (od ok. 15 aut i 20 pieszych do 300 m od kamery do 50 aut i 70 pieszych do 600 m).',
				]],
				['Generator tras', [
					'Trasę w drugą stronę zaznacza się teraz w generatorze: opcja „Także trasa w drugą stronę”. Przyciski „W drugą stronę” w „Warunkach” i na liście wygenerowanych tras zostały usunięte.',
					'Generator pobiera przystanki autobusowe z mapy. Wszystkie trasy wbudowane zostały przebudowane z przystankami.',
				]],
			],
		},
		{
			version: '0.41.0',
			date: '17 października 2026',
			groups: [
				['Przebieg jazdy', [
					'Nowa sekcja „Przebieg” w zakładce „Warunki”. Można w niej wybrać stację, z której rusza pociąg (każdą oprócz końcowej), i jechać od niej do końca trasy. Wybór działa w jeździe swobodnej; scenariusze zawsze zaczynają się od pierwszej stacji.',
					'Zmiana kierunku jazdy: trasa Gliwice – Zabrze ma wersję w drugą stronę (Zabrze → Gliwice), wybieraną w „Przebiegu”. Na liście map trasa jest jedna.',
					'Trasy z generatora można wygenerować w drugą stronę przyciskiem „W drugą stronę” na liście wygenerowanych tras albo w „Przebiegu”.',
				]],
			],
		},
		{
			version: '0.40.15',
			date: '17 października 2026',
			groups: [
				['Trasy z mapy – stacje podziemne', [
					'Na peronach Warszawy Śródmieście słychać zapowiedzi: gong i komunikat o wjeździe pociągu podmiejskiego (SKM, Koleje Mazowieckie) i o jego odjeździe, z nazwą przewoźnika i stacji docelowej. Zapowiedzi słychać, gdy kamera jest przy peronie – im dalej, tym ciszej (do ok. 260 m). Działają też z kamery swobodnej.',
				]],
			],
		},
		{
			version: '0.40.14',
			date: '17 października 2026',
			groups: [
				['Trasy z mapy – stacje podziemne', [
					'Warszawa Śródmieście ma wszystkie tory i perony: tor 4 i peron 3 przy dalszej ścianie tunelu. Pociągi podmiejskie zatrzymują się przy obu torach.',
					'Peron WKD Śródmieście, leżący w osobnym tunelu, nie jest już rysowany w tunelu średnicowym.',
				]],
			],
		},
		{
			version: '0.40.13',
			date: '17 października 2026',
			groups: [
				['Trasy z mapy – stacje podziemne', [
					'Na Warszawie Śródmieście zatrzymują się pociągi podmiejskie (SKM, Koleje Mazowieckie): co 1,5–3 minuty wjeżdżają na przemian z obu stron, stoją przy peronie około pół minuty i odjeżdżają w tunel.',
				]],
			],
		},
		{
			version: '0.40.12',
			date: '17 października 2026',
			groups: [
				['Trasy z mapy – stacje podziemne', [
					'Na peronach Warszawy Śródmieście i innych podziemnych peronach z mapy są pasażerowie: czekają przy krawędzi, siedzą na ławkach i spacerują wzdłuż peronu, omijając schody.',
				]],
			],
		},
		{
			version: '0.40.11',
			date: '17 października 2026',
			groups: [
				['Trasy z mapy – mosty i stacje podziemne', [
					'Tory stacji na wiadukcie mają wspólny pomost bez ścianek między torami. Wcześniej każdy tor miał osobny pomost z gzymsami, a tory nad ulicą pod wiaduktem schodziły w dół, np. Toruń Główny.',
					'Na peronach Warszawy Śródmieście są schody do wyjść i szklane pawilony wejściowe na powierzchni.',
				]],
			],
		},
		{
			version: '0.40.10',
			date: '17 października 2026',
			groups: [
				['Tunele i stacje podziemne', [
					'Na peronach w tunelu, np. Warszawa Śródmieście i Centralna, nie stoją już uliczne latarnie na słupach. Światło pada spod stropu, a na peronach Śródmieścia stoją ławki i kosze.',
					'Tunel jest jaśniejszy. Posadzka między torami nie wygląda już jak czarna dziura, a lampy na ścianach oświetlają ściany, tory i pociąg.',
				]],
			],
		},
		{
			version: '0.40.9',
			date: '17 października 2026',
			groups: [
				['Trasy z mapy – mosty i wiadukty', [
					'Filary wiaduktów i mostów naszej linii nie stoją już na ulicach ani na torach innych linii przechodzących pod spodem. Filar przesuwa się wzdłuż mostu w wolne miejsce, a gdy go nie ma, w tym miejscu jest przęsło.',
				]],
			],
		},
		{
			version: '0.40.8',
			date: '17 października 2026',
			groups: [
				['Trasy z mapy – poprawki (Toruń – Chełmża)', [
					'Ulice biegnące wzdłuż toru przy przejeździe kolejowym nie mają już przerw po obu stronach skrzyżowania.',
					'Na stacjach w wykopie teren obok torów nie jest spłaszczany do poziomu toru w szerokim pasie. Ulica na skraju wykopu leży na skarpie, a nie na „murku”, np. Toruń Miasto.',
					'Wiadukty drogowe nad torem w wykopie dochodzą do ulic na obu końcach, bez szczeliny nad skarpą.',
					'Tory stacji na wiadukcie naszej linii mają jeden poziom. Wcześniej część wznosiła się ponad nasz tor, a część schodziła w ulicę pod spodem, np. Toruń Główny.',
				]],
			],
		},
		{
			version: '0.40.7',
			date: '17 października 2026',
			groups: [
				['Trasy z mapy – poprawki', [
					'Drogi biegnące tuż obok siebie na trochę różnych wysokościach (np. dojazd wzdłuż ulicy) nie przeskakują już co kilka metrów między dwoma poziomami.',
				]],
			],
		},
		{
			version: '0.40.6',
			date: '17 października 2026',
			groups: [
				['Trasy z mapy – wiadukty innych linii', [
					'Wiadukty innych linii nad naszą mają poziomy pomost, a tory tej linii wjeżdżają na niego po nasypie (rampa ok. 3%). Wcześniej pomost wisiał nad torami, a tory dochodziły do przyczółków po ziemi, np. Gliwice – Katowice przed Katowicami.',
					'Trasy wbudowane wygenerowane ponownie z tą poprawką i z poprawką torów pod naszymi mostami.',
				]],
			],
		},
		{
			version: '0.40.5',
			date: '17 października 2026',
			groups: [
				['Trasy z mapy – poprawki', [
					'Tory innej linii przechodzące ukośnie pod mostem naszej linii biegną pod przęsłem, ok. 7 m pod naszą szyną. Wcześniej pomiar terenu na naszym nasypie wynosił je na nasz poziom, np. Gliwice – Zabrze na km 4,24.',
					'Trasa Gliwice – Zabrze wygenerowana ponownie z tą poprawką.',
				]],
			],
		},
		{
			version: '0.40.4',
			date: '17 października 2026',
			groups: [
				['Trasy wbudowane', [
					'Trasa Toruń Główny – Chełmża wygenerowana na nowo z aktualnych danych, z torami z mapy do 250 m od trasy, i z nowym horyzontem.',
				]],
			],
		},
		{
			version: '0.40.3',
			date: '17 października 2026',
			groups: [
				['Trasy z mapy – poprawki', [
					'Sygnalizatory na skrzyżowaniach i przy przejściach nie są już czasem obrócone tyłem do nadjeżdżających. Ta sama poprawka dotyczy znaków przy wlotach i przejściach (A-7, D-1, D-6).',
				]],
			],
		},
		{
			version: '0.40.2',
			date: '17 października 2026',
			groups: [
				['Trasy z mapy – szerszy pas torów', [
					'Tory z mapy sięgają do 250 m od toru pociągu, wcześniej do 110 m. Widać całe stacje towarowe, bocznice zakładów i równoległe linie dalej od trasy, razem z rozjazdami, kozłami, wagonami i siecią trakcyjną.',
					'Trasy wbudowane wygenerowane ponownie z tym zasięgiem (bez Torunia – Chełmży).',
				]],
			],
		},
		{
			version: '0.40.1',
			date: '16 października 2026',
			groups: [
				['Kamera w tunelu', [
					'Widoki zewnętrzne działają w tunelu: za pociągiem, z boku, przy torze i przy wózku. Kamera zostaje we wnętrzu tunelu, między ścianami i pod stropem, i patrzy na pociąg. Wcześniej wychodziła nad teren, na ulicę nad tunelem.',
					'Widok z boku w tunelu pokazuje skład ukośnie od ściany, bo na pełną odległość z boku nie ma miejsca.',
				]],
			],
		},
		{
			version: '0.40.0',
			date: '16 października 2026',
			groups: [
				['Trasy wbudowane – nowe i odświeżone', [
					'Nowe trasy wbudowane: Warszawa Wschodnia – Warszawa Zachodnia (tunel średnicowy, Centralna pod ziemią), Gdynia Główna – Gdańsk Główny (13 stacji i przystanków wzdłuż Trójmiasta) i Orzesze Jaśkowice – Mikołów.',
					'Trasy Gliwice – Zabrze, Gliwice – Katowice i Rybnik – Katowice wygenerowane na nowo z aktualnych danych: tory i stacje z mapy, ukształtowanie terenu, budynki, zagospodarowanie, wykaz PKP PLK i profil z RINF.',
					'Nowe trasy mają horyzont z prawdziwego terenu.',
				]],
			],
		},
		{
			version: '0.39.4',
			date: '16 października 2026',
			groups: [
				['Trasy z mapy – poprawki', [
					'Perony Warszawy Powiśle są znów widoczne. Leżały pod torami, bo ich wysokość liczona była od toru przed jego poprawieniem.',
					'Tunele są wyższe: 6–6,8 m nad szyną zamiast 5,2–6,2 m, w hali stacji 7,6 m.',
					'Budynek nad wschodnim wylotem tunelu średnicowego (przy Powiślu) nie jest już zapadnięty w teren nad tunelem.',
				]],
			],
		},
		{
			version: '0.39.3',
			date: '16 października 2026',
			groups: [
				['Trasy z mapy – tunele', [
					'Przy ulicy nad płytkim tunelem nie ma już czarnych pasów. Tam, gdzie teren obok tunelu schodzi poniżej stropu, widać betonową obudowę od zewnątrz, a nie ciemne wnętrze.',
					'Budynki nad tunelem stoją na stropie i nie zwisają w wylot. Wcześniej przy zachodnim portalu tunelu średnicowego parter budynku wisiał pod wiaduktem nad torami.',
					'Budynek przy samym portalu (np. pawilon stacji Warszawa Powiśle) stoi na poziomie ulicy nad wylotem, a nie jako zadaszenie na słupach nad torami.',
				]],
			],
		},
		{
			version: '0.39.2',
			date: '16 października 2026',
			groups: [
				['Generator tras – poprawki', [
					'Przy Warszawie Powiślu skrajny tor linii 448 nie leży już 3 m pod peronem. Biegnie na poziomie sąsiedniego toru, także na moście.',
					'Tory biegnące tuż obok innych są wyrównywane do ich poziomu, gdy pomiar terenu pokazuje różnicę ponad 1 m w dół albo w górę (np. pomiar trafił w ulicę pod wiaduktem).',
				]],
			],
		},
		{
			version: '0.39.1',
			date: '16 października 2026',
			groups: [
				['Trasy z mapy – stadiony nocą', [
					'Stadiony są nocą oświetlone. Wokół otworu w dachu świeci pierścień naświetlaczy, widoczny też z daleka, a murawa i trybuny są jasne.',
				]],
			],
		},
		{
			version: '0.39.0',
			date: '16 października 2026',
			groups: [
				['Trasy z mapy – stadiony', [
					'Stadiony mają własny model zamiast bryły z oknami: dwie kondygnacje trybun z przejściem i lożami, bandy reklamowe i dach z otworem nad boiskiem. Elewacja ma pionowe żebra.',
					'W środku jest boisko z pasami murawy, liniami (pola karne, koło środkowe) i bramkami. Wymiary i kierunek boiska pochodzą z mapy, a bez danych przyjmowane jest boisko 105 × 68 m wzdłuż osi stadionu.',
					'Stadion rozpoznawany jest po budynku oznaczonym jako stadion albo jako największy budynek w obszarze stadionu. Ma nazwę z mapy, np. PGE Narodowy przy Warszawie Stadion.',
				]],
			],
		},
		{
			version: '0.38.3',
			date: '16 października 2026',
			groups: [
				['Generator tras – poprawki', [
					'Przy Warszawie Stadion nie płynie już kanał pod peronami i ulicami. Kanał Kamionkowski biegnie tam pod ziemią, w Kolektorze Stadionowym, i nie potrzebuje mostu.',
					'Cieki i przepusty, które według BDOT10k biegną pod ziemią, nie są już rysowane jako woda na powierzchni.',
				]],
			],
		},
		{
			version: '0.38.2',
			date: '16 października 2026',
			groups: [
				['Generator tras – poprawki', [
					'Tory WKD przy Warszawie Ochocie nie leżą już na nasypie przyklejonym do torów linii 448. Biegną obok, na tym samym poziomie, a pod górę idą dopiero w stronę Zachodniej.',
					'Tory wychodzące z tunelu nie przejmują wysokości ulicy nad tunelem.',
				]],
			],
		},
		{
			version: '0.38.1',
			date: '16 października 2026',
			groups: [
				['Generator tras – poprawki', [
					'Tory w tym samym wykopie co nasza linia, nad którymi stoi przykrycie (plac, pomost), nie znikają już jako „tunel innej linii”. Na przykład peron wyspowy Warszawy Ochoty ma znów tory po obu stronach.',
				]],
			],
		},
		{
			version: '0.38.0',
			date: '16 października 2026',
			groups: [
				['Generator tras – dane PKP PLK i RINF', [
					'Przystanki innych linii są rozpoznawane według wykazu posterunków PKP PLK, a nie odległości od torów. Na przykład Ochota, Śródmieście, Stadion i Powiśle należą do linii 448, więc nie trafiają na trasę linii 2.',
					'Nowe źródło: RINF, rejestr infrastruktury Europejskiej Agencji Kolejowej (dane PKP PLK). Daje oficjalne pochylenia linii i wykaz tuneli.',
					'W tunelach i na długich mostach profil toru pochodzi z oficjalnych pochyleń. Pomiar terenu nie widzi tam toru, więc dotąd tor biegł prosto między portalami.',
					'Tunel z RINF, którego brakuje w OSM, jest dodawany z uwagą generatora. Różne położenie portali też jest zgłaszane w uwagach.',
				]],
			],
		},
		{
			version: '0.37.1',
			date: '16 października 2026',
			groups: [
				['Tunele i tory na trasach z mapy – poprawki', [
					'Otwór portalu tunelu nie jest już zasłonięty terenem (wcześniej tory wjeżdżały w płaską ścianę).',
					'Tory linii 448 przy Stadionie nie są zakopane w terenie (wysokość toru na długim „moście” nie spada pod teren).',
					'Tory osobnych tuneli obok naszego (np. WKD przy parkingu koło Centralnej, tory za zachodnim wyjazdem z tunelu) nie wychodzą na powierzchnię i nie wspinają się na poziom ulicy. Działa to także dla tras wygenerowanych wcześniej.',
				]],
			],
		},
		{
			version: '0.37.0',
			date: '16 października 2026',
			groups: [
				['Tunele na trasach z mapy', [
					'Tunel jest szerszy, ma chodnik służbowy, koryta kablowe na ścianach, lampy po obu stronach i zielone lampki ewakuacyjne. Jest też jaśniejszy.',
					'Sieć trakcyjna biegnie w tunelu pod stropem, także nad torami innych linii. Wcześniej lina nośna znikała w stropie.',
					'Semafory w tunelu wiszą na wspornikach przy ścianie, bez masztu wchodzącego w ścianę.',
					'Przy portalach teren przechodzi nad strop tuż za ścianą czołową, więc we wlocie nie widać już pochyłego terenu.',
					'Hala stacji podziemnej ma kolumny w osi peronu i podświetlane reklamy na ścianach.',
				]],
				['Trasy z mapy – tory i mosty', [
					'Tory oznaczone w danych jako most, ale bez prześwitu pod spodem (np. linia 448 przy Stadionie), nie są już zakopane w terenie. Perony przy nich są widoczne.',
					'Krótkie tory pod ziemią w tunelu (bocznice, łącznice) leżą w obudowie, a tory osobnych tuneli obok (np. WKD przy Śródmieściu) nie wychodzą na powierzchnię z kozłami.',
					'Mosty drogowe nie falują: pylony i liny mostów wantowych (np. most Świętokrzyski) nie są brane za pomost.',
				]],
			],
		},
		{
			version: '0.36.1',
			date: '16 października 2026',
			groups: [
				['Generator tras', [
					'Wygenerowane trasy mają osobny ekran: w menu przycisk „Wygenerowane trasy” obok „Generatora tras”, przejścia między nimi jednym kliknięciem. Import i eksport tras są na nowym ekranie, a przeciągnięte pliki tras też go otwierają.',
				]],
			],
		},
		{
			version: '0.36.0',
			date: '16 października 2026',
			groups: [
				['Ruch na linii', [
					'Na mijankach linii jednotorowych stoją semafory dla pociągów z przeciwka. Pokazują „stój”, a „wolną drogę”, gdy pociąg może wjechać na odcinek jednotorowy.',
					'Pociąg z przeciwka czekający na krzyżowanie z pociągiem gracza staje przed tym semaforem, a nie tuż przy zwrotnicy.',
					'Osobowy z przeciwka, który zatrzymał się przy peronie mijanki, czeka na krzyżowanie przy peronie.',
				]],
			],
		},
		{
			version: '0.35.1',
			date: '16 października 2026',
			groups: [
				['Trasy z mapy – poprawki', [
					'Budynek nad tunelem (np. hala Dworca Centralnego) jest zwykłym budynkiem ze ścianami, a nie dachem na słupach jak hala peronowa.',
					'Przystanek innej linii tuż obok naszych torów (np. Warszawa Ochota na linii 448 przy torach linii 2) jest pomijany. Jego peron stoi przy swoich torach z właściwą nazwą, zamiast wymyślonego peronu przy torze obok.',
				]],
			],
		},
		{
			version: '0.35.0',
			date: '16 października 2026',
			groups: [
				['Trasy z mapy – miasto nad tunelem', [
					'Tory innych linii pod ziemią są w tunelu: w tunelu średnicowym tory podmiejskie i dalekobieżne biegną we wspólnej obudowie na poziomie naszego toru. Wcześniej leżały na ulicy albo były przykryte terenem.',
					'Tory, które według mapy biegną pod ziemią bez znacznika tunelu (np. WKD pod Alejami Jerozolimskimi), generator rozpoznaje z pomiaru terenu. Tor w wykopie zostaje na powierzchni, przykryty znika.',
					'Perony metra nie trafiają już na trasę (wcześniej leżały na powierzchni). Perony innej linii we wspólnym tunelu, np. Warszawa Śródmieście obok Centralnej, mają halę ze świetlówkami i właściwą nazwę.',
					'Ulice biegnące wzdłuż tunelu (np. Aleje Jerozolimskie) nie mają dziury nad torem. Budynki mogą stać nad tunelem.',
					'Strop tunelu nie wystaje nad teren przy płytkim przykryciu (przy portalu). Most z pomiaru kończy się przed portalem, a nie biegnie przez cały tunel.',
					'Hala stacji podziemnej i tunel nie są już czarne w widoku z zewnątrz (wyłączone zacienianie otoczenia w tunelu).',
					'Generator: poprawiony błąd, przez który przy podaniu numeru linii znikały dane PKP PLK.',
				]],
			],
		},
		{
			version: '0.34.0',
			date: '16 października 2026',
			groups: [
				['Stacje podziemne', [
					'Stacja z peronem w tunelu (np. Warszawa Śródmieście na trasie z mapy) ma halę: jasne ściany z płytek, płaski strop i pasy świetlówek nad peronem i torem, oświetlenie także w dzień.',
					'Na peronie stacji podziemnej nie ma latarń ani wiat. Nazwa stacji jest na tablicach na ścianie hali, widocznych z pociągu.',
					'Ze stacji podziemnej prowadzą na powierzchnię schody, a nad nimi stoją przeszklone pawilony wejściowe z nazwą stacji. Wysiadający idą do schodów.',
					'W tunelu jest posadzka (bez trawy i gruntu spod tunelu).',
					'Kamera swobodna, która wjedzie portalem do tunelu, porusza się w jego wnętrzu i w hali stacji.',
				]],
			],
		},
		{
			version: '0.33.0',
			date: '15 października 2026',
			groups: [
				['Generator tras – tunele i stacje', [
					'Tunele z mapy nie znikają, gdy portal leży przy stacji (np. tunel średnicowy w Warszawie): tor biegnie pod ziemią, co najmniej ok. 7,5 m pod ulicą, a portale stoją tam, gdzie teren naprawdę przykrywa tor.',
					'Na trasę trafiają tylko stacje tej linii: bez stacji metra, kolei lekkiej (WKD) i stacji przy torach innych linii – np. Warszawa Śródmieście zamiast stacji metra „Centrum”.',
					'Wykop nie jest już brany za most: generator sprawdza teren po bokach toru.',
					'Nad tunelem ulice biegną po powierzchni (bez wiaduktów nad torem), bez fałszywych wiaduktów nad innymi tunelami; tory i perony innych linii pod ziemią nie leżą na powierzchni.',
					'W grze tunel na trasie z mapy ma betonową obudowę z lampami i portale pod terenem – miasto nad nim zostaje (dawniej sztuczne wzgórze).',
				]],
			],
		},
		{
			version: '0.32.0',
			date: '15 października 2026',
			groups: [
				['Wydajność', [
					'Płynniejsza gra: w kabinie ok. 25 % krótsza klatka, w widoku zza pociągu ok. 30 % – wyraźnie mniej pracy przy każdej klatce.',
					'Cienie pociągu liczone ze scalonej bryły – setki drobnych części nie rysują się już osobno w każdej warstwie cieni.',
					'Model pociągu gracza i pociągów tła scalony: części różniące się tylko kolorem łączone w jedną bryłę; drzwi, koła, wycieraczki i pantografy dalej się ruszają.',
					'Szyldy, znaki drogowe, studzienki i kratki ściekowe – z jednej tekstury zbiorczej zamiast setek osobnych.',
					'Wnętrze kabiny scalone: ok. 150 części → ok. 45 (dźwignie dalej się ruszają, lampki i ekrany działają jak dawniej).',
					'Pociągi tła stojące przy stacji: cienie jedną bryłą na wagon, koła scalone – pociąg 5-wagonowy rysuje się ok. 2,7 raza taniej.',
					'Koniec przycięć co kilka klatek w kabinie w słoneczny dzień (sprawdzanie, czy dach zasłania słońce, było bardzo kosztowne).',
				]],
				['Menu', [
					'Ustawienia w zakładkach: Dźwięk, Zapowiedzi i Grafika – z podsumowaniem pod nazwą, ostatnio otwarta zakładka zapamiętana.',
				]],
			],
		},
		{
			version: '0.31.0',
			date: '15 października 2026',
			groups: [
				['Zima w symulacji', [
					'Zamarznięta zwrotnica: zimą czasem semafor wjazdowy stacji pokazuje „stój” – dyżurny wywołuje przez radiotelefon, po rozmrożeniu (2–5 min) zgoda na wjazd.',
					'Oblodzona sieć trakcyjna: na niektórych odcinkach pantograf iskrzy i trzaska, a zasilanie na chwilę zanika – jedź łagodnie.',
				]],
			],
		},
		{
			version: '0.30.0',
			date: '15 października 2026',
			groups: [
				['Zima w ruchu', [
					'Pociąg wzbija śnieg leżący na torze: kłęby spod wózków i fontanna przed pługiem, tym większe, im szybciej jedzie.',
					'Szyby kabiny oszronione: nawiew szybko odmraża pole wycieraczek, w narożnikach i na szybach bocznych zostają kryształki lodu.',
					'Zaspy: wały odgarniętego śniegu wzdłuż toru i zaspy pod ścianami budynków od strony wiatru – rosną i topnieją razem z pokrywą śnieżną.',
					'Szadź na przewodach sieci trakcyjnej.',
					'Wiosną na początku jazdy leżą jeszcze resztki śniegu – topnieją przez kilka minut, ziemia mokra od roztopów.',
				]],
			],
		},
		{
			version: '0.29.0',
			date: '15 października 2026',
			groups: [
				['Noc', [
					'Latarnie oświetlają ziemię wokół siebie: jasne plamy na jezdniach, chodnikach, peronach i trawie – na śniegu wyraźnie jaśniejsze.',
					'Na mokrej nawierzchni odbicia lamp ciągną się smugami w stronę patrzącego, jak na prawdziwym asfalcie po deszczu.',
					'Nad miastem ciepła łuna przy horyzoncie, przy zachmurzeniu chmury podświetlone od spodu; w mieście mniej gwiazd.',
					'Latarnie przy głównych drogach świecą ciepłą bielą (LED), na osiedlach – pomarańczowo (lampy sodowe).',
				]],
			],
		},
		{
			version: '0.28.0',
			date: '15 października 2026',
			groups: [
				['Ulice', [
					'Znaki pionowe: „ustąp pierwszeństwa” na wlotach podporządkowanych, „droga z pierwszeństwem” przed skrzyżowaniami, „przejście dla pieszych” przy zebrach – po prawej stronie jadących.',
					'Sygnalizacja świetlna na skrzyżowaniach ważniejszych ulic i na przejściach z sygnalizacją z mapy – światła zmieniają się w cyklu (z czerwonym i żółtym przed zielonym), przed sygnalizatorem linia zatrzymania.',
					'Nowe latarnie: przy głównych drogach wysokie słupy z łukowym wysięgnikiem i płaską oprawą LED, na osiedlach niższe z oprawą kopułkową.',
				]],
				['Menu i pauza', [
					'Pora roku do zmiany w pauzie (świat przebudowuje się wokół pociągu) i jako kafelki w zakładce Warunki.',
					'Wersja przeglądarkowa do wgrania na serwer: npm run web (folder i archiwum ZIP).',
				]],
				['Śnieg', [
					'Leżący śnieg w nieregularnych płatach różnej wielkości – bez kwadratów i bez powtarzającego się wzoru.',
					'Śnieg nie osiada na ludziach.',
				]],
			],
		},
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
