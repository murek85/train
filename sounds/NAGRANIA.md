# Nagrania do Maszynisty (D1)

Wszystkie z **Freesound** z licencją **Creative Commons 0** (w wyszukiwarce: filtr *License → Creative Commons 0*).
Format dowolny (WAV, FLAC, OGG, MP3) – przytnę, zapętlę i wyrównam głośność w grze (`sounds/sounds.json`).
Pliki wrzuć do tego folderu (`sounds/`) pod dowolnymi nazwami i daj znać, który jest który (albo nazwij jak w kolumnie „Klucz”).
Przy każdym pliku zanotuj **link do strony nagrania** (autor i źródło trafią do „Co nowego” / CHANGELOG – CC0 tego
nie wymaga, ale warto).

Limit całości: ok. **30 MB**. Wystarczą fragmenty 10–40 s (pętle) i pojedyncze uderzenia; dłuższe przytnę.
Najlepiej nagrania „czyste” (bez rozmów, muzyki, zapowiedzi), stały poziom głośności w wybranym fragmencie.

| Klucz | Co | Długość | Czego szukać (Freesound) | Uwagi |
|---|---|---|---|---|
| `roll` | toczenie składu z zewnątrz, stała prędkość | 15–40 s | `train passing rolling`, `train wheels rails`, `pociąg przejazd` | najlepiej ok. 60–100 km/h, bez syreny; zapisz przybliżoną prędkość |
| `roll_cab` | toczenie słyszane w kabinie / wnętrzu wagonu | 20–40 s | `train interior`, `train cab ride`, `inside train moving`, `wnętrze pociągu` | bez rozmów i zapowiedzi |
| `clack1`…`clack4` | uderzenia kół na złączach szyn (pojedyncze „ta-tam”) | po 0,3–1 s | `rail joint clack`, `train wheels clickety`, `stukot kół` | wytnę z jednego dłuższego nagrania, jeśli są wyraźne |
| `flange` | pisk obręczy na łuku | 5–20 s | `train wheel squeal`, `flange squeal curve`, `tram squeal` | |
| `motor_dc` | lokomotywa elektryczna prądu stałego – wycie silników/przekładni (EU07, ET22 albo podobna) | 10–30 s | `EU07`, `electric locomotive`, `locomotive traction motor`, `lokomotywa elektryczna` | stała prędkość; zapisz przybliżoną prędkość |
| `motor_emu` | EZT prądu stałego (EN57 albo podobny) – napęd przy jeździe | 10–30 s | `EN57`, `electric multiple unit`, `EMU interior`, `kibel EN57` | |
| `motor_ac` | nowoczesny EZT z falownikiem („śpiewające” silniki) | 10–30 s | `inverter train`, `VVVF`, `EMU acceleration`, `Elf`, `Impuls` | może być ruszanie – wybiorę fragment |
| `diesel_idle` | spalinowóz na biegu jałowym (SM42 albo podobny) | 10–30 s | `diesel locomotive idle`, `SM42`, `spalinowóz` | |
| `diesel_run` | spalinowóz pod obciążeniem (wysokie obroty) | 10–30 s | `diesel locomotive accelerating`, `diesel engine full power` | |
| `blower` | wentylatory/dmuchawy lokomotywy elektrycznej | 10–20 s | `locomotive blower`, `traction motor fans`, `electric locomotive standing` | może być postój z pracującymi wentylatorami |
| `compressor` | sprężarka lokomotywy/EZT | 10–20 s | `train compressor`, `locomotive air compressor`, `sprężarka` | |
| `brake_squeal` | pisk hamulców przy dohamowaniu | 3–10 s | `train brakes squeal`, `train stopping brake` | |
| `air_hiss` | syk powietrza (luzowanie hamulca, upust) | 2–8 s | `train air brake release`, `pneumatic hiss train` | |
| `horn_lo` | syrena lokomotywy (niski, dwutonowy „tyfon”) | 2–6 s (ciągły ton) | `train horn Poland`, `locomotive horn`, `EU07 horn`, `syrena pociągu` | potrzebny fragment ze stałym tonem – zrobię z niego pętlę |
| `horn_hi` | druga, wysoka syrena | 2–6 s | `train whistle high`, `locomotive high horn` | |
| `wind` | wiatr (bez szumu ruchu drogowego) | 30–60 s | `wind field`, `wind ambience`, `wiatr` | |
| `rain` | deszcz z zewnątrz | 30–60 s | `rain ambience`, `rain on grass`, `deszcz` | |
| `rain_cab` | deszcz o dach/szybę (z wnętrza) | 30–60 s | `rain on roof`, `rain on car roof`, `rain window` | |
| `birds` | ptaki w dzień (wieś, łąka, las) | 30–60 s | `birds meadow`, `birds forest Poland`, `ptaki` | bez ruchu drogowego |
| `city` | gwar przy stacji / miasto w tle | 30–60 s | `train station ambience`, `city ambience distant`, `dworzec` | bez wyraźnych zapowiedzi |
| `crickets` | świerszcze wieczorem | 20–40 s | `crickets night`, `świerszcze` | |
| `bell` | dzwon na przejeździe kolejowym | 5–15 s | `railway crossing bell`, `level crossing bell`, `przejazd kolejowy` | najlepiej polski (szybkie uderzenia) |

Nie musisz zdobyć wszystkich – każdy brakujący dźwięk zostaje z syntezy.
