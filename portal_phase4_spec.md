# P4 스펙 — 회원정보 관리 UI + 닉네임 (랭킹 전제)

## 1. 목표
포털에 계정 메뉴를 만들어 닉네임을 정하고 계정 상태를 관리할 수 있게 한다. 닉네임은 `portal/users/$uid`에 저장하고, 이후 랭킹·기록 표시에 그대로 쓴다.

## 2. 변경 파일 (목록 밖 수정 금지)
- 신규: `src/lib/portalProfile.ts` — 닉네임 저장/조회/중복확인
- 신규: `src/home/components/AccountPanel.tsx` — 계정 패널(모달)
- 수정: `src/home/components/AccountWidget.tsx` — 클릭 시 패널 열기, 닉네임 우선 표시
- 수정: `src/home/home.css` — 패널 스타일
- 수정: `database.rules.json` — 아래 3.4 규칙만 (기존 규칙 수정 금지)
- 금지: 게임 코드(`src/services`, `src/waitdog`, `games/**`), `portalAuth.ts`(이미 수정됨), plugins, vite.config

## 3. 계약

### 3.1 닉네임 데이터
- 경로: `portal/users/$uid` = `{ nickname: string, nicknameLower: string, updatedAt: number }`
- 중복 방지 인덱스: `portal/nicknames/$nicknameLower` = `$uid`
- 규칙: 2~12자, 한글·영문·숫자·밑줄만(`^[가-힣a-zA-Z0-9_]{2,12}$`), 앞뒤 공백 불가.
- 변경은 30일에 1회로 제한하지 말 것(초기 서비스 — 자유 변경 허용). 대신 변경 시 옛 인덱스를 지우고 새 인덱스를 쓴다.

### 3.2 portalProfile.ts API
```ts
export interface PortalProfile { nickname: string | null; updatedAt: number | null }
export function subscribeProfile(listener: (p: PortalProfile | null) => void): () => void;
export async function checkNicknameAvailable(nickname: string): Promise<'ok' | 'taken' | 'invalid' | 'error'>;
export async function setNickname(nickname: string): Promise<'ok' | 'taken' | 'invalid' | 'unauthenticated' | 'error'>;
```
- 로그인(익명 포함) 상태면 동작한다. 익명도 닉네임을 가질 수 있다(게스트 기록 표시용).
- 예약어 차단: `admin`, `운영자`, `관리자`, `한판`, `hanpan` (대소문자 무시).
- 중복 확정은 인덱스 쓰기의 성공/실패로 판정한다(사전 조회만 믿지 말 것 — 경합 방지).

### 3.3 UI
- **AccountWidget**: 닉네임이 있으면 닉네임을, 없으면 기존처럼 `게스트-<uid4>`/Google 이름 표시. 클릭하면 AccountPanel 열림(버튼 역할, 키보드 접근 가능).
- **AccountPanel**(모달, Esc·바깥 클릭으로 닫힘, 포커스 트랩):
  - 헤더: 현재 표시 이름, 계정 종류 배지 — `게스트(이 기기 전용)` / `Google 연결됨` + 이메일
  - 닉네임 섹션: 입력창 + "저장". 실시간 형식 검증 안내, 중복이면 "이미 사용 중인 닉네임입니다", 성공 시 "저장되었습니다"
  - 게스트일 때: "Google 연결" 버튼과 함께 **"지금 연결하면 다른 기기에서도 이어서 플레이할 수 있어요"** 안내
  - Google 상태일 때: 로그아웃 버튼(확인 후 실행)
  - 하단: 저장된 게임 목록은 이번 범위 아님. 넣지 말 것.
- 기존 포털 다크 테마 토큰 사용, 모바일에서 전체 폭 시트 형태로.

### 3.4 RTDB 규칙 (추가만)
```
portal/users/$uid: read auth != null / write auth.uid === $uid,
  validate: nickname 문자열 2~12자, nicknameLower 문자열, updatedAt 숫자
portal/nicknames/$name:
  read: auth != null
  write: auth != null && (!data.exists() || data.val() === auth.uid) && (!newData.exists() || newData.val() === auth.uid)
```
- 기존 `portal/saves`, gacha, life-rpg 규칙은 건드리지 말 것.

## 4. 수용 기준 (Claude 실행)
```
npm run build
npx tsc -p tsconfig.waitdog-contract.json && node .waitdog-contract-dist/scripts/waitdog-contract.js
python3 -c "import json;json.load(open('database.rules.json'));print('rules ok')"
```
- 계약검사 146개 그대로 통과(게임 로직 불변).

## 5. 금지
- 게임 코드 수정, portalAuth.ts 수정, 새 의존성, git 커밋/푸시, npm install·빌드 실행.
- 랭킹·업적 화면 구현(다음 단계). 닉네임 저장까지만.

## 완료 보고 (30줄 이내): 변경 파일 / 닉네임 검증·중복 처리 방식 / 규칙 추가분 / 가정 / 미해결.
