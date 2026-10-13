/* „Co nowego” – skrót historii zmian dla gracza (pełna lista: CHANGELOG.md). Najnowsza wersja na górze.
   Przy podniesieniu wersji: nowa pozycja na początku listy (wersja, data, grupy z krótkimi punktami). */
(function () {
	'use strict';
	window.TrainNews = [
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
