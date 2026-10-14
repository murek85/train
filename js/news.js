/* „Co nowego” – skrót historii zmian dla gracza (pełna lista: CHANGELOG.md). Najnowsza wersja na górze.
   Przy podniesieniu wersji: nowa pozycja na początku listy (wersja, data, grupy z krótkimi punktami). */
(function () {
	'use strict';
	window.TrainNews = [
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
