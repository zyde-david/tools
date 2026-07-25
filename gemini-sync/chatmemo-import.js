#!/usr/bin/env node
/**
 * chatmemo-import.js — Auto-import Chat Memo export zips from Downloads
 * 
 * Watches ~/Downloads for chat-memo_*.zip files, extracts conversations,
 * imports to vault, then deletes the zip.
 * 
 * Run by cron every 5 minutes or manually.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const CONFIG = {
  downloadsDir: os.homedir() + '/Downloads',
  vaultDir:    path.join(os.homedir(), '2nd-brain-local', 'vault', 'gemini-chats'),
  stateFile:   path.join(os.homedir(), '2nd-brain-local', 'vault', 'gemini-sync-state.json'),
  importLog:   path.join(os.homedir(), '2nd-brain-local', 'vault', 'chatmemo-import-log.json'),
};

function loadJSON(file, def) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return def; }
}
const state = loadJSON(CONFIG.stateFile, { lastSync: 0, knownChats: {} });
const importLog = loadJSON(CONFIG.importLog, { processedFiles: [] });
function saveJSON(file, data) { fs.writeFileSync(file, JSON.stringify(data, null, 2)); }
function slugify(str, maxLen = 60) {
  return str.replace(/[^\w\s\u0E00-\u0E7F-]/g, '').replace(/\s+/g, '-').substring(0, maxLen).toLowerCase() || 'untitled';
}

function saveState() { saveJSON(CONFIG.stateFile, state); }

function parseConversation(content, filename) {
  const lines = content.split('\n');
  const meta = {};
  let messageStart = 0;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('Title:')) meta.title = line.substring(6).trim();
    else if (line.startsWith('URL:')) meta.url = line.substring(4).trim();
    else if (line.startsWith('Platform:')) meta.platform = line.substring(9).trim();
    else if (line.startsWith('Created:')) meta.created = line.substring(8).trim();
    else if (line.startsWith('Messages:')) meta.messageCount = parseInt(line.substring(9)) || 0;
    else if (line === '' && i > 5 && Object.keys(meta).length > 2) {
      messageStart = i + 1;
      break;
    }
  }
  
  const convLines = lines.slice(messageStart).join('\n').trim();
  
  // Extract conversationId from URL
  const urlMatch = meta.url?.match(/\/([a-f0-9]{16})/);
  const chatId = slugify(meta.title || filename) + (urlMatch ? '_' + urlMatch[1].substring(0,8) : '');
  
  const output = [
    '---',
    `title: ${meta.title || filename}`,
    `url: ${meta.url || ''}`,
    `platform: Gemini`,
    `conversationId: ${chatId}`,
    `syncedAt: ${new Date().toISOString()}`,
    `createdAt: ${meta.created || ''}`,
    `messages: ${meta.messageCount || 0}`,
    `sourceFile: ${filename}`,
    '---',
    '',
    convLines,
  ].join('\n');
  
  return { meta, chatId, output, charCount: output.length, messageCount: meta.messageCount || 0 };
}

function importZip(zipPath) {
  const zipName = path.basename(zipPath);
  console.log(`\n[chatmemo-import] Processing: ${zipName}`);
  
  // Check if already processed
  if (importLog.processedFiles.includes(zipName)) {
    console.log(`[chatmemo-import] Already processed, skipping.`);
    return 0;
  }
  
  // Extract to temp dir
  const tmpDir = '/tmp/chatmemo-import-' + Date.now();
  fs.mkdirSync(tmpDir, { recursive: true });
  
  try {
    execSync(`unzip -o "${zipPath}" -d "${tmpDir}" 2>&1`, { timeout: 30000 });
  } catch (e) {
    console.error(`[chatmemo-import] Unzip failed: ${e.message}`);
    // cleanup
    try { execSync(`rm -rf "${tmpDir}"`); } catch {}
    return 0;
  }
  
  // Process .txt files (skip .json or other formats)
  const files = fs.readdirSync(tmpDir).filter(f => f.endsWith('.txt') && f.startsWith('gemini_'));
  console.log(`[chatmemo-import] Found ${files.length} conversations in zip`);
  
  let imported = 0, skipped = 0;
  
  for (const file of files) {
    const content = fs.readFileSync(path.join(tmpDir, file), 'utf8');
    const { chatId, output, charCount, messageCount, meta } = parseConversation(content, file);
    
    if (charCount < 200) { skipped++; continue; }
    
    const filePath = path.join(CONFIG.vaultDir, `${chatId}.md`);
    
    if (fs.existsSync(filePath)) {
      // Check if this is newer (by message count or file size)
      const existing = fs.statSync(filePath);
      if (existing.size >= charCount * 0.95) { skipped++; continue; }
    }
    
    fs.writeFileSync(filePath, output);
    state.knownChats[chatId] = {
      title: meta.title || file,
      lastSync: Date.now(),
      charCount,
      messageCount,
    };
    imported++;
  }
  
  // Update state
  state.lastSync = Date.now();
  saveState();
  
  // Mark as processed and delete zip
  importLog.processedFiles.push(zipName);
  saveJSON(CONFIG.importLog, importLog);
  
  // Delete the zip file
  try {
    fs.unlinkSync(zipPath);
    console.log(`[chatmemo-import] Deleted zip: ${zipName}`);
  } catch (e) {
    console.log(`[chatmemo-import] Could not delete zip: ${e.message}`);
  }
  
  // Cleanup temp dir
  try { execSync(`rm -rf "${tmpDir}"`); } catch {}
  
  console.log(`[chatmemo-import] Result — Imported: ${imported}, Skipped: ${skipped}`);
  return imported;
}

function main() {
  console.log(`[chatmemo-import] ${new Date().toISOString()}`);
  fs.mkdirSync(CONFIG.vaultDir, { recursive: true });
  
  // Find all chat-memo zip files in Downloads
  let files = [];
  try {
    files = fs.readdirSync(CONFIG.downloadsDir)
      .filter(f => /^chat-memo_.*\.zip$/i.test(f))
      .map(f => ({
        name: f,
        path: path.join(CONFIG.downloadsDir, f),
        mtime: fs.statSync(path.join(CONFIG.downloadsDir, f)).mtimeMs,
      }))
      .sort((a, b) => b.mtime - a.mtime); // newest first
  } catch (e) {
    console.error(`[chatmemo-import] Cannot read Downloads: ${e.message}`);
    process.exit(1);
  }
  
  if (files.length === 0) {
    console.log('[chatmemo-import] No chat-memo zip files found in Downloads.');
    return;
  }
  
  console.log(`[chatmemo-import] Found ${files.length} zip file(s):`);
  files.forEach(f => console.log(`  ${f.name} (${(f.mtime ? new Date(f.mtime) : 'unknown')})`));
  
  let totalImported = 0;
  for (const file of files) {
    totalImported += importZip(file.path);
  }
  
  console.log(`\n[chatmemo-import] Total imported this run: ${totalImported}`);
}

main();
