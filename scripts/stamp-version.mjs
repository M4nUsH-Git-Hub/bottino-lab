// Prepara il sito per la pubblicazione: scrive docs/version.json e aggiunge la versione
// ai file in index.html, così i browser scaricano sempre i file nuovi.
// Lo esegue in automatico GitHub Actions (o Cloudflare) a ogni modifica: non serve lanciarlo a mano.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'docs');
const sha = (process.env.GITHUB_SHA || process.env.CF_PAGES_COMMIT_SHA || '').slice(0, 7);
const version = sha || Date.now().toString(36);
const built = new Date().toISOString();

writeFileSync(join(root, 'version.json'), JSON.stringify({ version, built }, null, 2) + '\n');

const file = join(root, 'index.html');
let html = readFileSync(file, 'utf8');
html = html.replace(
  /(src|href)="((?:[\w-]+\.js)|styles\.css|manifest\.webmanifest)(?:\?v=[^"]*)?"/g,
  (_, attr, name) => `${attr}="${name}?v=${version}"`
);
html = html.replace(/<meta name="app-version" content="[^"]*">/, `<meta name="app-version" content="${version}">`);
writeFileSync(file, html);

console.log(`Versione ${version} (${built})`);
