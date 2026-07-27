#!/bin/bash
set -eu

PLIST_NAME="com.dadadak.server.plist"
PLIST_DST="${HOME}/Library/LaunchAgents/${PLIST_NAME}"
UID_NUM="$(id -u)"

echo "Booting out com.dadadak.server LaunchAgent if loaded..."
if launchctl bootout "gui/${UID_NUM}/com.dadadak.server" 2>/dev/null; then
  echo "LaunchAgent booted out."
else
  echo "LaunchAgent was not loaded or already removed."
fi

echo "Removing ${PLIST_DST} if present..."
rm -f "$PLIST_DST"

echo "기존 수동 실행 방식(npm run dev)으로 복귀 가능"
exit 0
