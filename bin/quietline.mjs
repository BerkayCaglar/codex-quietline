#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { metadata, upstream } from '../lib/config.mjs';
import { ensureInstalled } from '../lib/install.mjs';
import { activate, deactivate } from '../lib/activate.mjs';
import { launch } from '../lib/launch.mjs';
import { upgrade } from '../lib/upgrade.mjs';

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  if (command === 'setup') {
    const { values } = parseArgs({ args: rest, options: { archive: { type: 'string' }, sha256: { type: 'string' }, 'download-only': { type: 'boolean' } } });
    await ensureInstalled(values);
    if (values['download-only']) return;
    await activate();
    console.log('Quietline is installed as codex. Restart your terminal application to refresh PATH.');
  } else if (command === 'deactivate') {
    await deactivate();
    console.log('Quietline PATH activation removed. The original Codex installation was not changed.');
  } else if (command === 'upgrade') {
    await upgrade();
  } else if (command === '--quietline-version') {
    console.log(`Quietline ${metadata.version} · Codex ${upstream.version}`);
  } else if (command === '--quietline-help') {
    console.log('codex-quietline setup [--archive FILE --sha256 HASH]\ncodex-quietline deactivate\ncodex-quietline upgrade\ncodex-quietline --quietline-version\n\nAll other arguments are passed unchanged to native Codex.');
  } else await launch(process.argv.slice(2));
}
main().catch(error => { console.error(`quietline: ${error.message}`); process.exitCode = 1; });
