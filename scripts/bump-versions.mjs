#!/usr/bin/env node
// Bumps the ?v=N cache-busting query on style.css / main.js / experiment-theme.css / pixels.js
// in every git-tracked HTML page, setting ONE new value (max existing + 1) per asset.
//
//   node scripts/bump-versions.mjs                     # bump style.css, main.js, experiment-theme.css
//   node scripts/bump-versions.mjs style.css main.js   # bump only the named assets
//   node scripts/bump-versions.mjs --dry               # show what would change, write nothing
//
// Run it ONCE per push, after the CSS/JS edits are finished. Only tracked pages are touched,
// so untracked files (e.g. thank-you.example.html) and other worktrees are left alone.
// Files are read and written as raw text, so CRLF line endings are preserved byte for byte.

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const DEFAULT_ASSETS = ['style.css', 'main.js', 'experiment-theme.css'];
const args = process.argv.slice(2);
const dry = args.includes('--dry');
const named = args.filter((a) => !a.startsWith('--'));
const assets = named.length ? named : DEFAULT_ASSETS;

const pages = execFileSync('git', ['ls-files', '*.html'], { encoding: 'utf8' })
  .split(/\r?\n/)
  .filter(Boolean);

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const texts = new Map(pages.map((p) => [p, readFileSync(p, 'utf8')]));
let changedFiles = 0;

for (const asset of assets) {
  const re = new RegExp(`(${escape(asset)}\\?v=)(\\d+)`, 'g');
  const found = [];
  for (const text of texts.values()) for (const m of text.matchAll(re)) found.push(Number(m[2]));
  if (!found.length) {
    console.log(`${asset}: no references found, skipped`);
    continue;
  }
  const next = Math.max(...found) + 1;
  let count = 0;
  for (const [page, text] of texts) {
    const updated = text.replace(re, (_, head) => { count++; return head + next; });
    if (updated !== text) texts.set(page, updated);
  }
  console.log(`${asset}: ${found.length} references, max v=${Math.max(...found)} -> v=${next}`);
}

for (const page of pages) {
  const original = readFileSync(page, 'utf8');
  const updated = texts.get(page);
  if (updated !== original) {
    changedFiles++;
    if (!dry) writeFileSync(page, updated);
  }
}
console.log(`${dry ? '[dry run] would update' : 'updated'} ${changedFiles} file(s)`);
