/* npm run app:check: uruchamia aplikację desktopową w trybie samosprawdzenia (electron/main.js, selfCheck) –
   wczytuje grę, rusza jazdę, wypisuje raport z błędami strony i kończy się; kod wyjścia mówi, czy działa. */
'use strict';
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const root = path.join(__dirname, '..');
const electron = require('electron');
const r = spawnSync(electron, [root], { stdio: 'inherit', env: { ...process.env, MASZYNISTA_CHECK: '1' } });
process.exit(r.status ?? 1);
