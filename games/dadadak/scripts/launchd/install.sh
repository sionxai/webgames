#!/bin/bash
set -eu

PROJECT_DIR="/Users/nohshinhee/Documents/2. coding/DADADAK"
PLIST_NAME="com.dadadak.server.plist"
PLIST_SRC="${PROJECT_DIR}/scripts/launchd/${PLIST_NAME}"
PLIST_DST="${HOME}/Library/LaunchAgents/${PLIST_NAME}"
READY_URL="http://localhost:3500/"
UID_NUM="$(id -u)"

echo "Booting out any existing com.dadadak.server LaunchAgent..."
launchctl bootout "gui/${UID_NUM}/com.dadadak.server" 2>/dev/null || true
# bootout은 비동기 — 완전히 내려갈 때까지 대기 (건너뛰면 bootstrap이 Input/output error)
for _ in {1..30}; do
  launchctl print "gui/${UID_NUM}/com.dadadak.server" >/dev/null 2>&1 || break
  sleep 1
done

mkdir -p "${HOME}/Library/Logs/DADADAK" "${HOME}/Library/LaunchAgents"

echo "Installing ${PLIST_NAME} to ${HOME}/Library/LaunchAgents/..."
cp "$PLIST_SRC" "${HOME}/Library/LaunchAgents/"

echo "Bootstrapping com.dadadak.server..."
launchctl bootstrap "gui/${UID_NUM}" "$PLIST_DST"

echo "Waiting for DADADAK at ${READY_URL}..."
for _ in {1..90}; do
  if curl -fsS -o /dev/null "$READY_URL" 2>/dev/null; then
    echo "READY"
    exit 0
  fi
  sleep 2
done

echo "Timed out waiting for DADADAK ready check."
exit 1
