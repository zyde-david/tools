#!/usr/bin/env node
/**
 * vault-writer.js — Read gemini-chats, update INDEX.md for vault
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const VAULT_DIR = path.join(os.homedir(), '2nd-brain-local', 'vault', 'gemini-chats');
const INDEX_FILE = path.join(VAULT_DIR, 'INDEX.md');

function main() {
  if (!fs.existsSync(VAULT_DIR)) {
    console.log('[vault-writer] Vault dir not found, skipping');
    process.exit(0);
  }

  const files = fs.readdirSync(VAULT_DIR)
    .filter(f => f.endsWith('.md') && f !== 'INDEX.md')
    .sort();

  const entries = [];

  for (const file of files) {
    const content = fs.readFileSync(path.join(VAULT_DIR, file), 'utf8');
    const meta = {};

    const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (fmMatch) {
      fmMatch[1].split('\n').forEach(line => {
        const [k, ...vParts] = line.split(':');
        if (k && vParts.length) meta[k.trim()] = vParts.join(':').trim();
      });
    }

    const bodyContent = content.replace(/^---[\s\S]*?---\n*/, '');
    const preview = bodyContent.split('\n').find(l => l.trim().length > 10)?.trim().substring(0, 120) || '';

    entries.push({
      file,
      title: meta.title || file.replace('.md', ''),
      syncedAt: meta.syncedAt || 'unknown',
      messages: meta.messages || '?',
      preview,
    });
  }

  const lines = [
    '# Gemini Chats Index',
    '',
    `Last updated: ${new Date().toISOString()}`,
    `Total chats: ${entries.length}`,
    '',
  ];

  entries.forEach((e, i) => {
    const safePreview = e.preview.replace(/\|/g, '/').replace(/\n/g, ' ');
    lines.push(`${i + 1}. **[${e.title}](${e.file})**`);
    lines.push(`   Synced: ${e.syncedAt.substring(0, 10)} | Messages: ${e.messages}`);
    if (safePreview) lines.push(`   Preview: ${safePreview}`);
    lines.push('');
  });

  fs.writeFileSync(INDEX_FILE, lines.join('\n'));
  console.log(`[vault-writer] Indexed ${entries.length} chats → INDEX.md`);
}

main();
