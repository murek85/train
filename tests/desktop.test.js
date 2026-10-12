// Aplikacja desktopowa: pliki gry dla protokołu app:// (electron/assets.js), pośrednicy generatora tras
// (electron/proxy.js – wspólni z server.js) i ustawienia pakowania.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { resolveAsset, mimeOf } = require('../electron/assets');
const { proxyTarget, allowedDirect, NMPT } = require('../electron/proxy');
const ROOT = path.join(__dirname, '..');

test('ścieżki app:// trafiają do folderu gry i nigdy poza niego', () => {
	assert.equal(resolveAsset(ROOT, '/'), path.join(ROOT, 'index.html'));
	assert.equal(resolveAsset(ROOT, '/js/3d/train.js'), path.join(ROOT, 'js', '3d', 'train.js'));
	assert.equal(resolveAsset(ROOT, '/routes/a%20b.js'), path.join(ROOT, 'routes', 'a b.js'));
	for (const bad of ['/../package.json', '/%2e%2e/secret', '/..%5c..%5cwindows', '/a/../../x', '/%E0%A4%A', '/x\0y']) assert.equal(resolveAsset(ROOT, bad), null, bad);
	assert.match(mimeOf('a.js'), /javascript/);
	assert.match(mimeOf('a.HTML'), /text\/html/);
	assert.equal(mimeOf('x.unknown'), 'application/octet-stream');
});

test('każdy plik wczytywany przez stronę ma znany typ', () => {
	const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
	const refs = [...html.matchAll(/(?:src|href)="([^"#?:]+)"/g)].map((m) => m[1]);
	assert.ok(refs.length > 20);
	for (const ref of refs) {
		const file = resolveAsset(ROOT, '/' + ref.replace(/^\.\//, ''));
		assert.ok(file && fs.existsSync(file), ref);
		assert.notEqual(mimeOf(file), 'application/octet-stream', ref);
	}
});

test('pośrednicy: tylko ścieżki z listy do stałych adresów usług', () => {
	assert.equal(proxyTarget('/gugik/nmpt?SERVICE=WCS&X=1'), NMPT + '?SERVICE=WCS&X=1');
	assert.equal(proxyTarget('/proxy/opendata/bdot10k/schemat2021/24/2466_GML.zip'), 'https://opendata.geoportal.gov.pl/bdot10k/schemat2021/24/2466_GML.zip');
	assert.equal(proxyTarget('/proxy/opendata/../etc/passwd'), false);
	assert.equal(proxyTarget('/proxy/opendata/inne/plik.zip'), false);
	assert.equal(proxyTarget('/proxy/plk/files/public/user_upload/pdf/Reg_przydzielania_tras/zal_2.6.xlsx'), 'https://www.plk-sa.pl/files/public/user_upload/pdf/Reg_przydzielania_tras/zal_2.6.xlsx');
	assert.equal(proxyTarget('/proxy/plk/admin'), false);
	assert.equal(proxyTarget('/js/main.js'), null);
	assert.ok(allowedDirect(NMPT + '?SERVICE=WCS'));
	assert.ok(!allowedDirect('https://example.com/?x'));
	assert.ok(!allowedDirect(NMPT + '.evil.com/?x'));
});

test('pakowanie: główny plik aplikacji, ikona, bez narzędzi i testów', () => {
	const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
	assert.equal(pkg.main, 'electron/main.js');
	assert.ok(fs.existsSync(path.join(ROOT, pkg.main)));
	assert.ok(fs.existsSync(path.join(ROOT, 'electron', 'preload.js')));
	assert.equal(pkg.build.win.icon, 'build/icon.png');
	for (const ex of ['!tests/**', '!tools/**', '!dist/**', '!server.js']) assert.ok(pkg.build.files.includes(ex), ex);
});
