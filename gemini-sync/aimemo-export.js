#!/usr/bin/env node
/**
 * aimemo-export.js — Read Gemini conversations from Chat Memo's IndexedDB via CDP
 * 
 * Connects to Chat Memo popup iframe (extension origin) and reads IndexedDB directly.
 * Run by cron every 30 min.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const CONFIG = {
  vaultDir:    path.join(os.homedir(), '2nd-brain-local', 'vault', 'gemini-chats'),
  stateFile:   path.join(os.homedir(), '2nd-brain-local', 'vault', 'gemini-sync-state.json'),
  cdpPort:     9222,
  dbName:      'KeepAIMemoryDB',
  storeName:   'conversations',
  minSize:     200,
};

function ensureDir(p) { fs.mkdirSync(p, { recursive: true }); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function loadState() {
  try { return JSON.parse(fs.readFileSync(CONFIG.stateFile, 'utf8')); }
  catch { return { lastSync: 0, knownChats: {} }; }
}
function saveState(s) { fs.writeFileSync(CONFIG.stateFile, JSON.stringify(s, null, 2)); }
function slugify(str, maxLen = 60) {
  return str.replace(/[^\w\s\u0E00-\u0E7F-]/g, '').replace(/\s+/g, '-').substring(0, maxLen).toLowerCase() || 'untitled';
}
function formatDate(iso) {
  try { const d = new Date(iso); const p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  } catch { return 'unknown'; }
}
function formatConversation(conv) {
  const L = ['---', `title: ${conv.title || 'Untitled'}`, `url: ${conv.link || ''}`, `platform: Gemini`,
    `conversationId: ${conv.conversationId}`, `syncedAt: ${new Date().toISOString()}`,
    `createdAt: ${conv.createdAt || ''}`, `messages: ${conv.messages?.length || 0}`, '---', ''];
  if (conv.messages?.length) {
    conv.messages.forEach(msg => {
      const sender = msg.sender === 'user' ? 'User' : 'AI';
      let ts = msg.createdAt || msg.timestamp || '';
      try { if (ts) ts = formatDate(ts); } catch {}
      L.push(`**${sender}${ts ? ' ['+ts+']' : ''}**`);
      if (sender === 'AI' && msg.thinking) { L.push('', '> *Thinking:*', `> ${msg.thinking.replace(/\n/g, '\n> ')}`, ''); }
      L.push(msg.content || '', '', '---', '');
    });
  }
  return L.join('\n');
}

function httpGet(url) {
  return new Promise((resolve, reject) => {
    http.get(url, res => { let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(d)); }).on('error', reject);
  });
}

function createWS(url) {
  return new Promise((resolve, reject) => {
    const { WebSocket } = require('ws');
    const ws = new WebSocket(url);
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
  });
}

class CDP {
  constructor(ws) { this.ws = ws; this._id = 0; this._pending = new Map();
    this.ws.on('message', data => { const m = JSON.parse(data); if (m.id != null && this._pending.has(m.id)) {
      const {resolve, reject} = this._pending.get(m.id); this._pending.delete(m.id);
      m.error ? reject(new Error(m.error.message)) : resolve(m.result); }});
  }
  send(method, params={}) { return new Promise((resolve, reject) => {
    const id = ++this._id; this._pending.set(id, {resolve, reject});
    this.ws.send(JSON.stringify({id, method, params}));
    setTimeout(() => { if (this._pending.has(id)) { this._pending.delete(id); reject(new Error(`Timeout: ${method}`)); }}, 30000);
  });}
  close() { try { this.ws.close(); } catch {} }
}

async function main() {
  const state = loadState();
  ensureDir(CONFIG.vaultDir);

  // 1. Find Chat Memo popup
  const list = JSON.parse(await httpGet(`http://127.0.0.1:${CONFIG.cdpPort}/json/list`));
  const popup = list.find(t => t.url.includes('memnnheiikbfdcobfkghhfihnegkfici') && t.url.includes('popup'));
  const geminiPage = list.find(t => t.type === 'page' && t.url.includes('gemini.google.com'));

  if (!popup) {
    // Popup not open — try opening it by navigating Gemini page to trigger it
    if (!geminiPage) {
      console.log('[aimemo-export] ERROR: No Gemini page and no Chat Memo popup found.');
      process.exit(1);
    }
    
    console.log('[aimemo-export] Chat Memo popup not found. Opening via CDP...');
    
    const ws = await createWS(geminiPage.webSocketDebuggerUrl);
    const cdp = new CDP(ws);
    try {
      // Click the Chat Memo extension icon by dispatching a click on the floating button
      // The floating button is injected into the page by Chat Memo's content script
      const findBtn = await cdp.send('Runtime.evaluate', {
        expression: `
          (function() {
            // Chat Memo floating button — look for common selectors
            const selectors = [
              '[class*="chat-memo"]',
              '[class*="chatmemo"]', 
              '[class*="ChatMemo"]',
              '[class*="aimemo"]',
              '[class*="keep-ai"]',
              '[data-testid*="chat-memo"]',
              'button[class*="float"]',
              '[class*="floating"]',
            ];
            for (const sel of selectors) {
              const el = document.querySelector(sel);
              if (el) return 'found: ' + sel + ' -> ' + el.outerHTML.substring(0, 200);
            }
            // Also check iframes
            const iframes = Array.from(document.querySelectorAll('iframe'));
            for (const iframe of iframes) {
              try {
                for (const sel of selectors) {
                  const el = iframe.contentDocument?.querySelector(sel);
                  if (el) return 'found in iframe: ' + sel;
                }
              } catch(e) {}
            }
            return 'not found. Page iframes: ' + iframes.map(f => f.src).join(', ');
          })()
        `,
        returnByValue: true,
      });
      console.log('[aimemo-export] Floating button search:', findBtn.result?.value);
      
      // Try to open popup by finding and clicking the sidebar trigger
      const clickResult = await cdp.send('Runtime.evaluate', {
        expression: `
          (function() {
            // Chat Memo sidebar elements
            const allEls = Array.from(document.querySelectorAll('[class*="memo"], [class*="chat-memo"], [class*="panel"]'));
            const info = allEls.map(e => e.tagName + '.' + e.className?.substring(0,50) || '').join(' | ');
            return info.substring(0, 500);
          })()
        `,
        returnByValue: true,
      });
      console.log('[aimemo-export] Chat Memo elements:', clickResult.result?.value);
      
    } finally {
      cdp.close();
    }
    
    console.log('[aimemo-export] Cannot open Chat Memo popup automatically.');
    console.log('[aimemo-export] Please click Chat Memo floating icon on Gemini page to open popup, then re-run.');
    process.exit(1);
  }

  // 2. Connect to popup and read IndexedDB
  const ws = await createWS(popup.webSocketDebuggerUrl);
  const cdp = new CDP(ws);

  try {
    const dbScript = `
      (async () => {
        return new Promise((resolve, reject) => {
          try {
            const req = indexedDB.open('${CONFIG.dbName}');
            req.onerror = () => reject(new Error('Cannot open DB: ' + req.error));
            req.onsuccess = () => {
              const db = req.result;
              const stores = Array.from(db.objectStoreNames);
              if (!stores.includes('${CONFIG.storeName}')) {
                return resolve(JSON.stringify({stores, count: 0, data: []}));
              }
              const tx = db.transaction('${CONFIG.storeName}', 'readonly');
              const store = tx.objectStore('${CONFIG.storeName}');
              const all = store.getAll();
              all.onerror = () => reject(new Error('Read failed: ' + all.error));
              all.onsuccess = () => resolve(JSON.stringify({stores, count: all.result.length, data: all.result}));
            };
          } catch(e) { reject(e); }
        });
      })()
    `;

    const dbResult = await cdp.send('Runtime.evaluate', {
      expression: dbScript,
      awaitPromise: true,
      returnByValue: true,
    });

    if (dbResult.exceptionDetails) {
      console.error('[aimemo-export] DB error:', dbResult.exceptionDetails.exception?.message);
      process.exit(1);
    }

    const dbData = JSON.parse(dbResult.result?.value || '{}');
    console.log(`[aimemo-export] DB stores: ${dbData.stores?.join(', ')}, conversations: ${dbData.count}`);

    if (!dbData.count) {
      console.log('[aimemo-export] No conversations in DB.');
      process.exit(0);
    }

    // 3. Process entries
    let newChats = 0, updatedChats = 0, skippedChats = 0;

    for (const conv of dbData.data) {
      if (conv.platform && conv.platform !== 'gemini') { skippedChats++; continue; }

      const title = conv.title || 'Untitled';
      const chatId = conv.conversationId || slugify(title);
      const filePath = path.join(CONFIG.vaultDir, `${chatId}.md`);

      if (!conv.messages?.length) { skippedChats++; continue; }

      const existingCharCount = state.knownChats[chatId]?.charCount || 0;
      const newCharCount = JSON.stringify(conv.messages).length;
      const isNew = !fs.existsSync(filePath);
      const isUpdated = !isNew && newCharCount !== existingCharCount;

      if (!isNew && !isUpdated) { skippedChats++; continue; }

      const content = formatConversation(conv);
      if (content.length < CONFIG.minSize) { skippedChats++; continue; }

      fs.writeFileSync(filePath, content);

      if (isNew) {
        console.log(`  NEW: ${title} (${newCharCount}c, ${conv.messages.length}msgs)`);
        newChats++;
      } else {
        console.log(`  UPDATED: ${title} (${existingCharCount}→${newCharCount}c)`);
        updatedChats++;
      }

      state.knownChats[chatId] = {
        title,
        lastSync: Date.now(),
        charCount: newCharCount,
        messageCount: conv.messages.length,
      };
    }

    state.lastSync = Date.now();
    saveState(state);

    console.log(`[aimemo-export] Done — New:${newChats} Updated:${updatedChats} Skip:${skippedChats} Total:${dbData.count}`);

  } finally {
    cdp.close();
  }
}

main().catch(err => { console.error(`[aimemo-export] FATAL: ${err.message}`); process.exit(1); });
