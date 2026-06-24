import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const localDenylistPath = path.join(root, '.agents', 'publication-denylist.txt');

const ignoredDirs = new Set([
  '.agents',
  '.git',
  '.gstack',
  '.vercel',
  'coverage',
  'data',
  'dist',
  'node_modules',
  'private',
  'notes',
]);

const ignoredFiles = new Set([
  'audit-publication.js',
  'package-lock.json',
]);

const checks = [
  { name: 'private key block', pattern: /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/ },
  { name: 'Mollie live key', pattern: /\blive_[A-Za-z0-9]{20,}\b/ },
  { name: 'VAPID private key', pattern: /\bVAPID_PRIVATE\b\s*=/ },
  { name: 'local home path', pattern: /\/Users\/[A-Za-z0-9._-]+\// },
  { name: 'private/vault path marker', pattern: /\b(?:vault|obsidian|brain)\b/i },
  { name: 'business/prospect marker', pattern: /\b(?:prospect|outreach|pilot pricing|market validation|customer interview|sales angle)\b/i },
  { name: 'business-facing product field', pattern: /\b(?:buyerPersona|dmAngle|pilotOffer|pilotPrice)\b/ },
];

const emailPattern = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const allowedEmailDomains = new Set(['example.com', 'example.org', 'example.net']);

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (entry.isDirectory() && ignoredDirs.has(entry.name)) continue;

    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walk(fullPath));
      continue;
    }

    if (!entry.isFile()) continue;
    if (ignoredFiles.has(entry.name)) continue;
    files.push(fullPath);
  }

  return files;
}

function rel(file) {
  return path.relative(root, file);
}

const localDenylist = await readFile(localDenylistPath, 'utf8')
  .then((content) => content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#')))
  .catch(() => []);

const findings = [];
const files = await walk(root);

for (const file of files) {
  let content;
  try {
    content = await readFile(file, 'utf8');
  } catch {
    continue;
  }

  for (const check of checks) {
    const match = check.pattern.exec(content);
    if (match) findings.push({ file: rel(file), check: check.name, match: match[0] });
  }

  const contentLower = content.toLowerCase();
  for (const term of localDenylist) {
    if (contentLower.includes(term.toLowerCase())) {
      findings.push({ file: rel(file), check: 'local denylist marker', match: term });
    }
  }

  for (const match of content.matchAll(emailPattern)) {
    const email = match[0].toLowerCase();
    const domain = email.split('@')[1];
    if (!allowedEmailDomains.has(domain)) {
      findings.push({ file: rel(file), check: 'non-example email address', match: email });
    }
  }
}

if (findings.length > 0) {
  console.error('Publication audit failed:');
  for (const finding of findings) {
    console.error(`- ${finding.file}: ${finding.check} (${finding.match})`);
  }
  process.exit(1);
}

console.log('Publication audit passed.');
