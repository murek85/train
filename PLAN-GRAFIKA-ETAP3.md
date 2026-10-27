# Plan: grafika – etap 3: tabor i kabina (gałąź `grafika-pbr`)

Zakres: materiały PBR taboru (pudła, szyby, wózki, podwozie) i kabiny maszynisty. Tylko WebGPU (WebGL nie jest
rozwijany). Modele dalej budowane w kodzie (ROADMAP – decyzja), tekstury CC0. Budżet: do −5% FPS na jakości wysokiej
w widoku z kabiny i z zewnątrz; średnia i niska bez zmian.

## Stan wyjściowy (przegląd kodu)

- **Pudła** (train.js): przekrój wyciągany (loftBody), malowanie grupami ścian – płaski kolor na grupę
  (MeshPhysicalMaterial, chropowatość 0,45, lakier bezbarwny 0,55), napisy z kanw. Wariant 'train' (nodes.js
  trainPattern): brud z szumu (pas dolny, zacieki, dach), wypukłości bez tekstury (falowanie blach, szwy co 2,7 m, nity,
  żebra dachu), AO z wypalenia wokselowego (bakeWear – aWear.x), pogoda (mokre, zacieki deszczu, krople, śnieg).
  Brak jakichkolwiek tekstur.
- **Szyby**: półprzezroczyste (0,38–0,42), gładkie, odbicie tylko z mapy otoczenia (+ SSR na wysokiej); wnętrza
  i pasażerowie widoczni.
- **Wózki, koła, podwozie, pantografy**: dużo geometrii, materiały jednolite (stal, rdza, bieżnia koła).
- **Kabina** (cab.js): bogate wyposażenie, ale materiały zwykłe (bez wariantu pogody/brudu), faktury z kanw 256 px
  (słoje, blacha ryflowana, tkanina, panel) tylko jako kolor; „światło odbite” udawane emisją; brak AO (SSAO
  wyłączone w pierwszych 3,5 m), brak cieni od elementów kabiny; słońce przez szybę bez cienia ramy i słupków.

## Kroki (każdy osobno, z akceptacją)

1. **Tekstury taboru.** ✅ Zestawy CC0 (ambientCG, 512 i 1k webp, razem 4,9 MB; tools/textures.py):
   train/paint – Metal028 (lakier proszkowy: mikro-nierówność lakieru), train/grime – Metal021 (zacieki, brud),
   train/rust – Metal053B (żelazo z rdzą: wózki, podwozie), train/steel – Metal009 (stal szczotkowana: koła,
   chrom), cab/floor – DiamondPlate009 (blacha ryflowana), cab/rubber – Rubber004, cab/plastic – Plastic012B
   (czarne tworzywo z rysami), cab/fabric – Fabric082A (tkanina fotela). Wpis w ekranie „Autorzy”.
   Uwaga: wszystkie zestawy ze spisu wczytywane od startu – ok. +100 MB pamięci karty na jakości wysokiej (1k);
   do sprawdzenia w kroku 7 (ewentualnie KTX2 albo wczytywanie dopiero w użyciu).
2. **Pudło – lakier i brud z tekstur.** ✅ (nodes.js trainPattern, rodzina tekstur 'train') Rzut na płaszczyznę
   osi dominującej normalnej w układzie wagonu (burta – z, y; dach – z, x; czoło – x, y). Lakier: nierówność
   powłoki (normalna × 0,25, także w powłoce bezbarwnej) i chropowatość z train/paint. Brud: ilość modulowana
   ciemnymi miejscami train/grime (zacieki pionowo na burtach), barwa – kolor brudu × detal tekstury, wypukłość
   rośnie z brudem. Bez wczytanych tekstur – jak dawniej.
3. **Wózki i podwozie.** ✅ Części (wariant 'train' bez paneli): metaliczne (≥ 0,5: koła, bieżnie, chrom) –
   train/steel (rysy w normalnej, chropowatość); pozostałe – train/rust tam, gdzie brudne (zabrudzenie bazowe
   i wysokość nad szyną): faktura w jasności, barwa rdzy tylko w plamach (szum), chropowatość, wżery.
   Pantografy – na razie wspólne reguły (metal / rdza), bez osobnej miedzi i grafitu.
4. **Szyby taboru.** ✅ (nodes.js – opt.glass, train.js sideGlass / cabGlass) Krycie wg Fresnela (Schlick,
   F0 0,04): pod ostrym kątem szyby prawie lustrzane (odbicie nieba i otoczenia z mapy otoczenia), na wprost
   przejrzyste jak dotąd (wnętrze, pasażerowie). Zabrudzenie przy uszczelkach pominięte (szyby bez UV).
5. **Kabina – materiały.** ✅ (nodes.js cabMaterial, cab.js cm – opcja tex; tylko WebGPU, WebGL – faktury z kanw)
   Rzut na płaszczyznę osi dominującej normalnej w układzie kabiny; kolor materiału × detal tekstury, chropowatość
   i normalna z tekstury, świecenie własne z tym samym detalem. Pulpit – lakier strukturalny (train/paint), blat
   i czarne tworzywa – cab/plastic (rysy), guma – cab/rubber, podłoga – cab/floor (blacha ryflowana), fotel –
   cab/fabric, chrom i stal – train/steel. Koszt: w granicach szumu (kabina ukryta: +0,5 FPS).
   Zużycie (wytarte krawędzie, kurz na pulpicie) – pominięte (rysy z tekstury tworzywa wystarczają).
6. **Kabina – światło.** ✅ (częściowo) Przyczyna ciemnej kabiny: bryła cienia pojazdu (train.js shadowMerge)
   obejmowała szyby – słońce nigdy nie wpadało do wnętrza (jasność udawana świeceniem własnym). Teraz szyby
   (grupy i siatki przezroczyste) i części ukryte bez cienia: słońce wpada przez okna do kabiny i wagonów, ramy,
   słupki i dach rzucają cień (widoczny na ścianie tylnej kabiny); wyposażenie kabiny rzuca cień na wnętrze
   (koszt w granicach szumu).
   - Dodatek (kabina nocą): okluzja wypalona we wnętrzu (train.js bakeWear – wspólne z taborem, przesłaniają bryły
     kabiny; nodes.js cabMaterial – świecenie własne i światło rozproszone × okluzja, siła 0,65); nocą ekrany
     przyciemnione, zegary w ciepłym podświetleniu, światło wypełniające nad pulpitem w ciepłej barwie i słabsze,
     lampa sufitowa w jeździe zgaszona.
   - Poprawione: latarnie peronowe (światła punktowe bez cieni, world.js lightPool) oświetlały wnętrze kabiny przez
     dach – jasne ściany nocą na stacji. Materiały wnętrza kabiny (WebGPU) z własnym zestawem świateł bez latarń
     (cab.js limitLights, lightsNode).
7. **Pomiar i strojenie.** ✅ Porównanie z commitem etapu 2 (osobna kopia gry obok – ten sam komputer, te same
   ustawienia: jakość wysoka, Toruń Główny – Chełmża, SM42 + 3× Bdhpumn, 12:00, pogodnie, kamera nieruchoma), FPS:
   z kabiny 31 / 30,4 → 29,4 / 28,8 (ok. −5%); z zewnątrz (widok domyślny) 29 / 31,2 → 29 / 30,2 (ok. −2%).
   W budżecie (−5%) – bez przełącznika w ustawieniach. Pamięć karty: +8 zestawów tekstur (ok. 100 MB na wysokiej)
   – zostaje; w razie problemów wczytywanie zestawów kabiny dopiero przy wejściu do kabiny albo KTX2.

## Ryzyka

- Paczki rysowania i scalanie gracza (compactPlayer – kolory w wierzchołkach, jeden materiał na rodzaj powierzchni):
  tekstury muszą działać na scalonych bryłach (rzut trójpłaszczyznowy zamiast UV).
- Limit 16 samplerów – tekstury w tablicach (jak teren i budynki).
- Cienie w kabinie: kaskada najbliższa ma ograniczoną rozdzielczość – możliwe osobne światło tylko dla kabiny.
