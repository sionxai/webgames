# Quest Reference

## 개요
- 총 45개 퀘스트(daily/weekly/milestone/chain) 적용.
- 목표 유형: `single`(카테고리+분), `multi`(여러 카테고리별 요구 분).
- 해금 조건: 다른 퀘스트 완료 횟수, 스탯/레벨 요구 등. 조건(streak/시간대)은 현재 표기만 하고 기본 완료 판정은 목표 분량 충족 기준.

## 진행/완료/수령
- 액션 종료 시 해당 카테고리의 시간(분)을 퀘스트 진행도에 누적.
- `single`: 요구 분량 이상이면 완료, `multi`: 모든 카테고리 요구량 충족 시 완료.
- 완료 + 해금 상태이면 “보상 수령” 버튼 활성화, 대시보드 배너로 알람 노출.
- 수령 시 보상 지급(머니는 `money = targetMinutes × 0.33 × difficulty`를 기본으로 계산하며 JSON 값이 있으면 병합) 후 `questClaims/questCompletions` 업데이트.

## 저장/로드
- RTDB 경로: `artifacts/{appId}/users/{uid}/data/game_state`에 `questProgress`, `questMultiProgress`, `questClaims`, `questCompletions`를 저장/로드.

## UI
- 퀘스트 탭: 잠금/완료/진행률, 보상, 플래버텍스트, 해금 이유 표시. 멀티 목표는 카테고리별 진행도 표시.
- 대시보드: 수령 가능한 퀘스트 개수 배너 + 퀘스트 탭 이동 버튼.

## 밸런스 노트
- 머니 기본식: `money = targetMinutes × 0.33 × difficulty` (JSON의 money는 참고값).
- 추가 스탯 보상은 각 퀘스트 reward 필드 참고.
- unlockCondition 종류: `questComplete`, `statRequirement`, `level`.

## 확장 아이디어
- 조건(streak/시간대) 실제 판정 구현, 일일/주간 리셋.
- 보상 다양화(소모품/패스/스킨), 반복 수령 쿨다운, 정렬/필터 강화.
