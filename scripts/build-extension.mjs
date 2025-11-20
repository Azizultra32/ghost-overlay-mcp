#!/usr/bin/env node

import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const ENTRY = path.join(ROOT, 'extension', 'content.js');
const OUTDIR = path.join(ROOT, 'extension', 'dist');
const OUTFILE = path.join(OUTDIR, 'content.js');

async function main() {
  if (!fs.existsSync(ENTRY)) {
    console.error('Missing extension entry file:', ENTRY);
    process.exit(1);
  }

  fs.mkdirSync(OUTDIR, { recursive: true });

  await build({
    entryPoints: [ENTRY],
    bundle: true,
    outfile: OUTFILE,
    format: 'iife',
    platform: 'browser',
    target: ['chrome115'],
    sourcemap: 'inline',
    logLevel: 'info'
  });

  console.log('[build-extension] Wrote bundle to', OUTFILE);
}

main().catch((err) => {
  console.error('[build-extension] Failed:', err);
  process.exit(1);
});
