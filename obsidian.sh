#!/bin/bash
export DISPLAY=:10.0
exec /home/zyde/apps/squashfs-root/obsidian --no-sandbox "$@"
