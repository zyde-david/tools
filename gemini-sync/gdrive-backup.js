#!/usr/bin/env node
/**
 * gdrive-backup.js — Sync gemini-chats vault to Google Drive via rclone
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const VAULT_DIR = path.join(os.homedir(), '2nd-brain-local', 'vault', 'gemini-chats');
const RCLONE_REMOTE = 'gdrive';
const DRIVE_DIR = '2nd Brain/Gemini Backups';
const LOG_FILE = path.join(VAULT_DIR, 'gdrive-sync.log');

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

function main() {
  if (!fs.existsSync(VAULT_DIR)) {
    log('[gdrive-backup] Vault dir not found, skipping');
    process.exit(0);
  }

  try {
    const remotes = execSync('rclone listremotes', { encoding: 'utf8' });
    if (!remotes.includes(RCLONE_REMOTE + ':')) {
      log(`[gdrive-backup] ERROR: rclone remote "${RCLONE_REMOTE}" not configured`);
      process.exit(1);
    }

    const vaultSize = execSync(`du -sh "${VAULT_DIR}"`, { encoding: 'utf8' }).trim();
    log(`[gdrive-backup] Vault size: ${vaultSize}`);

    const result = execSync(
      `rclone sync "${VAULT_DIR}" "${RCLONE_REMOTE}:${DRIVE_DIR}" --transfers 4 --progress --log-file="${LOG_FILE}" --log-level INFO 2>&1`,
      { encoding: 'utf8', timeout: 120000 }
    );

    log('[gdrive-backup] Upload complete');

    const fileCount = fs.readdirSync(VAULT_DIR).filter(f => f.endsWith('.md')).length;
    log(`[gdrive-backup] ${fileCount} chat files synced to Drive`);

  } catch (err) {
    log(`[gdrive-backup] ERROR: ${err.message}`);
    process.exit(1);
  }
}

main();
