#!/bin/bash
# gemini-sync.sh — Main wrapper: aimemo-export → vault index → gdrive backup
# Called by cron every 30 min

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
HOME_DIR="$HOME"
VAULT_DIR="$HOME_DIR/2nd-brain-local/vault/gemini-chats"
LOG_FILE="$VAULT_DIR/gemini-sync-cron.log"
LOCK_FILE="/tmp/gemini-sync.lock"

# Prevent overlapping runs
if [ -f "$LOCK_FILE" ]; then
  PID=$(cat "$LOCK_FILE")
  if kill -0 "$PID" 2>/dev/null; then
    echo "[$(date)] Already running (PID $PID), skipping" >> "$LOG_FILE"
    exit 0
  fi
  rm -f "$LOCK_FILE"
fi
echo $$ > "$LOCK_FILE"
trap "rm -f $LOCK_FILE" EXIT

mkdir -p "$VAULT_DIR"
echo "===== [$(date '+%Y-%m-%d %H:%M:%S')] Starting gemini-sync =====" >> "$LOG_FILE"

# Step 1: Export from Chat Memo via CDP
echo "[Step 1] Exporting from Chat Memo (CDP)... " >> "$LOG_FILE"
node "$SCRIPT_DIR/aimemo-export.js" >> "$LOG_FILE" 2>&1 || echo "[Step 1] FAILED (exit $?)" >> "$LOG_FILE"

# Step 2: Update vault index
echo "[Step 2] Updating vault index..." >> "$LOG_FILE"
node "$SCRIPT_DIR/vault-writer.js" >> "$LOG_FILE" 2>&1 || echo "[Step 2] FAILED (exit $?)" >> "$LOG_FILE"

# Step 3: Backup to Google Drive
echo "[Step 3] Backing up to Google Drive..." >> "$LOG_FILE"
node "$SCRIPT_DIR/gdrive-backup.js" >> "$LOG_FILE" 2>&1 || echo "[Step 3] FAILED (exit $?)" >> "$LOG_FILE"

echo "===== [$(date '+%Y-%m-%d %H:%M:%S')] Done =====" >> "$LOG_FILE"
