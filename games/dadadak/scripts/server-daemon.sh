#!/bin/bash
set -u

# launchd는 셸 프로필을 읽지 않는다 — PATH 명시 필수
PATH="/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"
export PATH

PORT="${DADADAK_PORT:-3500}"
export PORT

PROJECT_DIR="/Users/nohshinhee/Documents/2. coding/DADADAK"
READY_URL="http://localhost:${PORT}/"

cd "$PROJECT_DIR" || {
  echo "[daemon] failed to cd to ${PROJECT_DIR}"
  exit 1
}

STOP_FLAG="$HOME/Library/Application Support/DADADAK/server-stopped"
if [ -f "$STOP_FLAG" ]; then
  echo "[daemon] stopped by user; parked"
  while [ -f "$STOP_FLAG" ]; do
    sleep 10
  done
  echo "[daemon] resume requested; starting"
fi

echo "[daemon] $(date '+%F %T') start (port ${PORT}, dev watch mode)"

# 가디언 패턴: 다른 프로세스가 이미 서빙 중이면 종료하지 말고 대기 상주 → 내려가면 인수
if curl -fsS -o /dev/null "$READY_URL" 2>/dev/null; then
  echo "[daemon] port ${PORT} already served by another process; standing by as guardian"
  while curl -fsS -o /dev/null "$READY_URL" 2>/dev/null; do
    sleep 10
  done
  echo "[daemon] foreign server stopped; taking over"
fi

# dev 상주 모드: tsx watch + Next dev — 코드 저장 즉시 자동 반영 (빌드 단계 없음)
#
# 주의: dev 모드는 exec로 넘기면 안 된다 — tsx watch의 자식(실제 서버)이 죽어도
# tsx watch 본체는 살아있어 launchd가 장애를 감지하지 못한다 (실측: 게이트4 실패).
# 대신 데몬이 헬스 모니터로 감시하다 비정상이면 프로세스 그룹째 정리하고 exit 1
# → launchd KeepAlive가 데몬을 재기동한다.
echo "[daemon] starting dev watch server on port ${PORT}"
set -m
npm run dev &
SERVER_PID=$!

# 초기 기동 대기 (dev 첫 컴파일 감안, 최대 120초)
started=0
for _ in $(seq 1 60); do
  sleep 2
  if curl -fsS -o /dev/null "$READY_URL" 2>/dev/null; then
    started=1
    break
  fi
  kill -0 "$SERVER_PID" 2>/dev/null || break
done
if [ "$started" -ne 1 ]; then
  echo "[daemon] server failed to become ready; terminating for relaunch"
  kill -TERM -- "-$SERVER_PID" 2>/dev/null || true
  sleep 2
  kill -KILL -- "-$SERVER_PID" 2>/dev/null || true
  exit 1
fi
echo "[daemon] ready; health monitoring every 10s"

fails=0
while true; do
  sleep 10
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    echo "[daemon] server process exited; relaunching"
    exit 1
  fi
  if curl -fsS -m 3 -o /dev/null "$READY_URL" 2>/dev/null; then
    fails=0
  else
    fails=$((fails + 1))
    echo "[daemon] health check failed (${fails}/3)"
    if [ "$fails" -ge 3 ]; then
      echo "[daemon] unhealthy; killing process group for relaunch"
      kill -TERM -- "-$SERVER_PID" 2>/dev/null || true
      sleep 3
      kill -KILL -- "-$SERVER_PID" 2>/dev/null || true
      exit 1
    fi
  fi
done
