/* Pośrednicy dla generatora tras: usługi bez nagłówków CORS (przeglądarka nie może pytać wprost). Przekazują
   wyłącznie ścieżki z listy do stałych adresów usług – nie są otwartymi pośrednikami. Wspólne dla server.js (gra
   w przeglądarce) i aplikacji desktopowej (protokół app://, electron/main.js):
     /gugik/nmpt?…               – NMPT GUGiK (WCS)
     /proxy/opendata/bdot10k/…   – paczki BDOT10k (GUGiK)
     /proxy/plk/…                – Regulamin sieci PKP PLK (strona i załączniki) */
'use strict';
const UA = 'maszynista-route-generator/0.1';
const NMPT = 'https://mapy.geoportal.gov.pl/wss/service/PZGIK/NMPT/GRID1/WCS/DigitalSurfaceModel';
const ROUTES = [
	{ prefix: '/proxy/opendata/', target: 'https://opendata.geoportal.gov.pl/', allow: /^bdot10k\/[\w/.-]+\.zip$/ },
	{ prefix: '/proxy/plk/', target: 'https://www.plk-sa.pl/', allow: /^(klienci-i-kontrahenci\/warunki-udostepniania-infrastruktury-i-regulaminy\/regulamin-sieci\/[\w/.-]+|files\/public\/user_upload\/pdf\/Reg_przydzielania_tras\/[\w/.%-]+\.xlsx)$/ },
];

// adres usługi dla ścieżki strony (z zapytaniem); false – ścieżka pośrednika spoza listy; null – zwykły plik gry
function proxyTarget(url) {
	if (url.startsWith('/gugik/nmpt')) {
		const q = url.indexOf('?') >= 0 ? url.slice(url.indexOf('?')) : '';
		return NMPT + q;
	}
	for (const r of ROUTES) {
		if (!url.startsWith(r.prefix)) continue;
		const rest = url.slice(r.prefix.length).split('?')[0];
		return r.allow.test(rest) ? r.target + rest : false;
	}
	return null;
}

// adresy, które aplikacja desktopowa pobiera dla strony przez proces główny (window.desktop.fetchText) – tylko NMPT
function allowedDirect(url) {
	return typeof url === 'string' && url.startsWith(NMPT + '?');
}

module.exports = { UA, NMPT, ROUTES, proxyTarget, allowedDirect };
