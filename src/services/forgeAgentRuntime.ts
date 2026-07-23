import {
  FORGE_AGENT_ACTION_ALLOWLIST,
  FORGE_AGENT_BRIDGE_GLOBAL,
  FORGE_AGENT_DEFAULT_MAX_TRACE_EVENTS,
  FORGE_AGENT_GAME_ID,
  FORGE_AGENT_MAX_CONCURRENT_ACTIONS,
  FORGE_AGENT_MAX_RATIONALE_LENGTH,
  FORGE_AGENT_METHODS,
  FORGE_AGENT_PROTOCOL,
  FORGE_AGENT_PROTOCOL_VERSION,
  FORGE_AGENT_READY_EVENT,
  FORGE_AGENT_SCHEMA_VERSION,
  FORGE_AGENT_TRANSPORT_KIND,
  ForgeAgentAction,
  ForgeAgentActionEnvelope,
  ForgeAgentActionError,
  ForgeAgentActionOption,
  ForgeAgentActionResult,
  ForgeAgentBindings,
  ForgeAgentDecision,
  ForgeAgentDescription,
  ForgeAgentExecutionResult,
  ForgeAgentObservation,
  ForgeAgentRuntimeListener,
  ForgeAgentRuntimeOptions,
  ForgeAgentRuntimeSnapshot,
  ForgeAgentSpeed,
  ForgeAgentStatus,
  ForgeAgentStrategy,
  ForgeAgentTraceEvent,
  ForgeAgentTraceExport
} from '../types/agent';

const ACTION_SET = new Set<string>(FORGE_AGENT_ACTION_ALLOWLIST);
const RESOURCE_SHORTAGE_PATTERN = /gold|charge|cost|resource|골드|충전|비용|재화/i;
const DEFAULT_STEP_INTERVAL_MS = 1200;

let runtimeSequence = 0;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isAllowedAction(value: unknown): value is ForgeAgentAction {
  return typeof value === 'string' && ACTION_SET.has(value);
}

function cloneUnknown(
  value: unknown,
  hiddenKeys: ReadonlySet<string> = new Set(),
  seen = new WeakMap<object, unknown>()
): unknown {
  if (value === null || typeof value !== 'object') return value;

  const existing = seen.get(value);
  if (existing !== undefined) return existing;

  if (value instanceof Date) return new Date(value.getTime());
  if (Array.isArray(value)) {
    const clone: unknown[] = [];
    seen.set(value, clone);
    value.forEach(item => clone.push(cloneUnknown(item, hiddenKeys, seen)));
    return clone;
  }

  const clone: Record<string, unknown> = {};
  seen.set(value, clone);
  Object.entries(value).forEach(([key, item]) => {
    if (!hiddenKeys.has(key)) clone[key] = cloneUnknown(item, hiddenKeys, seen);
  });
  return clone;
}

function sanitizeRationale(value: unknown, fallback = '다음 안전한 행동을 선택합니다.'): string {
  if (typeof value !== 'string') return fallback;
  const oneLine = value.replace(/\s+/g, ' ').trim();
  return oneLine.length > 0 ? oneLine.slice(0, FORGE_AGENT_MAX_RATIONALE_LENGTH) : fallback;
}

function createDescription(maxTraceEvents: number): ForgeAgentDescription {
  return {
    schemaVersion: FORGE_AGENT_SCHEMA_VERSION,
    protocol: FORGE_AGENT_PROTOCOL,
    protocolVersion: FORGE_AGENT_PROTOCOL_VERSION,
    gameId: FORGE_AGENT_GAME_ID,
    transport: {
      kind: FORGE_AGENT_TRANSPORT_KIND,
      global: FORGE_AGENT_BRIDGE_GLOBAL,
      readyEvent: FORGE_AGENT_READY_EVENT
    },
    methods: [...FORGE_AGENT_METHODS],
    actions: [...FORGE_AGENT_ACTION_ALLOWLIST],
    persistence: {
      kind: 'browser-local',
      storage: 'localStorage',
      agentHumanSeparated: true,
      serverAuthoritative: false,
      officialRanking: false
    },
    limits: {
      maxTraceEvents,
      maxRationaleLength: FORGE_AGENT_MAX_RATIONALE_LENGTH,
      concurrentActions: FORGE_AGENT_MAX_CONCURRENT_ACTIONS
    }
  };
}

function readPath(root: unknown, path: readonly string[]): unknown {
  let current = root;
  for (const key of path) {
    if (!isRecord(current)) return undefined;
    current = current[key];
  }
  return current;
}

function readFirstNumber(root: unknown, paths: readonly (readonly string[])[]): number | undefined {
  for (const path of paths) {
    const value = readPath(root, path);
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  return undefined;
}

function readFirstBoolean(root: unknown, paths: readonly (readonly string[])[]): boolean | undefined {
  for (const path of paths) {
    const value = readPath(root, path);
    if (typeof value === 'boolean') return value;
  }
  return undefined;
}

function actionGoal(action: ForgeAgentAction): string {
  const labels: Record<ForgeAgentAction, string> = {
    attack: '전투 보상 확보',
    enhance: '다음 강화 단계 도전',
    repair: '검의 균열 복구',
    sell: '검을 매각해 골드 확보',
    extract: '정수를 추출하고 새 런 준비',
    ad_restore: '파괴된 검 복구',
    select_series: '새 검 계열 선택',
    wait: '다음 행동 조건 대기'
  };
  return labels[action];
}

function cloneActionOption(option: ForgeAgentActionOption): ForgeAgentActionOption {
  return {
    action: option.action,
    enabled: option.enabled,
    ...(option.label ? { label: option.label } : {}),
    ...(option.reason ? { reason: option.reason } : {}),
    ...(option.payload ? { payload: cloneUnknown(option.payload) as Record<string, unknown> } : {}),
    ...(option.metadata ? { metadata: cloneUnknown(option.metadata) as Record<string, unknown> } : {})
  };
}

function cloneActionResult(result: ForgeAgentActionResult): ForgeAgentActionResult {
  return {
    ...result,
    ...(result.data !== undefined ? { data: cloneUnknown(result.data) } : {})
  };
}

function cloneTraceEvent(event: ForgeAgentTraceEvent): ForgeAgentTraceEvent {
  return {
    ...event,
    ...(event.result ? { result: { ...event.result } } : {})
  };
}

function selectDecision(
  option: ForgeAgentActionOption,
  rationale: string
): ForgeAgentDecision {
  return {
    action: option.action,
    goal: actionGoal(option.action),
    rationale: sanitizeRationale(rationale),
    ...(option.payload ? { payload: cloneUnknown(option.payload) as Record<string, unknown> } : {})
  };
}

/**
 * Deterministic demo policy. It only uses the public observation and actions supplied by App;
 * it does not call an external model and does not expose private chain-of-thought.
 */
export function decideNextForgeAgentAction(
  strategy: ForgeAgentStrategy,
  observation: ForgeAgentObservation,
  availableActions: readonly ForgeAgentActionOption[]
): ForgeAgentDecision | null {
  const enabled = new Map<ForgeAgentAction, ForgeAgentActionOption>();
  availableActions.forEach(option => {
    if (option.enabled && !enabled.has(option.action)) enabled.set(option.action, option);
  });

  const choose = (action: ForgeAgentAction, rationale: string): ForgeAgentDecision | null => {
    const option = enabled.get(action);
    return option ? selectDecision(option, rationale) : null;
  };
  const chooseFirst = (
    candidates: readonly [ForgeAgentAction, string][]
  ): ForgeAgentDecision | null => {
    for (const [action, rationale] of candidates) {
      const decision = choose(action, rationale);
      if (decision) return decision;
    }
    return null;
  };

  const level = readFirstNumber(observation, [
    ['profile', 'currentLevel'],
    ['weapon', 'level'],
    ['currentLevel'],
    ['level']
  ]) ?? 0;
  const crackCount = readFirstNumber(observation, [
    ['profile', 'currentCrackCount'],
    ['weapon', 'crackCount'],
    ['currentCrackCount'],
    ['crackCount']
  ]) ?? 0;
  const gold = readFirstNumber(observation, [
    ['profile', 'gold'],
    ['resources', 'gold'],
    ['gold']
  ]);
  const enhanceCost = readFirstNumber(observation, [
    ['enhance', 'cost'],
    ['enhanceCost'],
    ['nextEnhanceCost']
  ]);
  const explicitDestroyed = readFirstBoolean(observation, [
    ['profile', 'isDestroyed'],
    ['weapon', 'isDestroyed'],
    ['weapon', 'destroyed'],
    ['isDestroyed'],
    ['destroyed']
  ]);
  const destroyed = explicitDestroyed ?? level < 0;

  if (destroyed) {
    if (strategy === 'cautious') {
      return chooseFirst([
        ['extract', '파괴 손실을 제한하기 위해 남은 가치를 먼저 정수로 회수합니다.'],
        ['ad_restore', '정수 회수가 불가능해 로컬 데모 복구로 런을 이어갑니다.'],
        ['wait', '파괴 상태를 처리할 수 있는 행동이 열리기를 기다립니다.']
      ]);
    }
    return chooseFirst([
      ['ad_restore', '진행 속도를 유지하기 위해 로컬 데모 복구로 검을 되살립니다.'],
      ['extract', '복구할 수 없어 남은 가치를 회수하고 새 런을 준비합니다.'],
      ['wait', '파괴 상태를 처리할 수 있는 행동이 열리기를 기다립니다.']
    ]);
  }

  const enhanceOption = availableActions.find(option => option.action === 'enhance');
  const canAfford = readFirstBoolean(observation, [
    ['enhance', 'canAfford'],
    ['canAffordEnhance']
  ]);
  const hasCharge = readFirstBoolean(observation, [
    ['enhance', 'hasRequiredCharge'],
    ['enhance', 'chargeReady'],
    ['hasRequiredCharge']
  ]);
  const blockedReason = enhanceOption?.reason ?? '';
  const resourceBlocked = Boolean(
    enhanceOption
    && !enhanceOption.enabled
    && (
      RESOURCE_SHORTAGE_PATTERN.test(blockedReason)
      || canAfford === false
      || hasCharge === false
      || (gold !== undefined && enhanceCost !== undefined && gold < enhanceCost)
    )
  );

  if (resourceBlocked) {
    return chooseFirst([
      ['attack', '강화에 필요한 골드나 충전을 확보하기 위해 전투를 계속합니다.'],
      ['wait', '강화 자원이 부족해 다음 보상 기회를 기다립니다.']
    ]);
  }

  const seriesDecision = choose(
    'select_series',
    strategy === 'aggressive'
      ? '공격 성장을 우선하는 해금 계열로 새 검을 준비합니다.'
      : strategy === 'cautious'
        ? '안정 보너스를 우선하는 해금 계열로 새 검을 준비합니다.'
        : '성장과 안정의 균형이 맞는 해금 계열로 새 검을 준비합니다.'
  );
  if (seriesDecision) return seriesDecision;

  if (strategy === 'aggressive') {
    return chooseFirst([
      ['enhance', '위험을 감수하고 가능한 즉시 다음 강화 단계에 도전합니다.'],
      ['attack', '다음 강화 기회를 만들기 위해 전투 보상을 빠르게 모읍니다.'],
      ['sell', '강화가 막혀 검을 매각하고 다음 공격적 성장 자금을 확보합니다.'],
      ['extract', '더 진행할 수 없어 정수를 회수하고 새 런으로 전환합니다.'],
      ['repair', '다른 진행 수단이 없어 균열을 수리합니다.'],
      ['wait', '실행 가능한 성장 행동이 열리기를 기다립니다.']
    ]);
  }

  if (strategy === 'cautious') {
    if (crackCount > 0) {
      const repair = choose('repair', '추가 파괴 위험을 낮추기 위해 강화 전에 균열을 수리합니다.');
      if (repair) return repair;
    }
    if (level >= 8) {
      const extract = choose('extract', '확보한 고단계 가치를 지키기 위해 정수를 추출합니다.');
      if (extract) return extract;
    }
    if (level >= 5) {
      const sell = choose('sell', '현재 검의 골드 가치를 확정해 다음 시도의 안전 자금을 만듭니다.');
      if (sell) return sell;
    }
    return chooseFirst([
      ['enhance', '균열과 자원을 확인했고 허용된 범위에서 한 단계 강화합니다.'],
      ['attack', '안전한 강화 자금을 더 확보하기 위해 전투를 이어갑니다.'],
      ['extract', '강화 대신 현재 가치를 정수로 확정합니다.'],
      ['sell', '강화 대신 현재 가치를 골드로 확정합니다.'],
      ['wait', '안전한 행동 조건이 열리기를 기다립니다.']
    ]);
  }

  if (crackCount >= 2) {
    const repair = choose('repair', '누적 균열이 커져 다음 강화 전에 위험을 낮춥니다.');
    if (repair) return repair;
  }
  if (level >= 15) {
    const extract = choose('extract', '충분한 진행 가치를 확보해 정수로 전환합니다.');
    if (extract) return extract;
  }
  return chooseFirst([
    ['enhance', '자원과 위험을 확인해 균형 있게 다음 강화 단계에 도전합니다.'],
    ['attack', '강화 조건을 보완하기 위해 전투 보상을 확보합니다.'],
    ['repair', '강화 전에 수리 가능한 균열을 정리합니다.'],
    ['sell', '현재 검을 매각해 다음 성장 자금을 확보합니다.'],
    ['extract', '현재 진행을 정수로 확정하고 새 런을 준비합니다.'],
    ['wait', '다음 유효 행동이 열리기를 기다립니다.']
  ]);
}

export class ForgeAgentRuntime {
  private readonly bindings: ForgeAgentBindings;
  private readonly now: () => number;
  private readonly stepIntervalMs: number;
  private readonly maxTraceEvents: number;
  private readonly description: ForgeAgentDescription;
  private readonly listeners = new Set<ForgeAgentRuntimeListener>();
  private readonly usedActionIds = new Set<string>();
  private timerId: ReturnType<typeof setTimeout> | null = null;
  private generation = 0;
  private disposed = false;
  private eventSequence = 0;
  private actionSequence = 0;
  private runId: string;
  private startedAt: number | null = null;
  private status: ForgeAgentStatus = 'idle';
  private strategy: ForgeAgentStrategy;
  private speed: ForgeAgentSpeed;
  private isExecuting = false;
  private currentGoal = '시작 대기';
  private lastRationale = '데모 정책을 시작하면 공개 전략 요약이 표시됩니다.';
  private lastResult: ForgeAgentActionResult | null = null;
  private events: ForgeAgentTraceEvent[] = [];

  public readonly agentName: string;

  constructor(bindings: ForgeAgentBindings, options: ForgeAgentRuntimeOptions = {}) {
    this.bindings = bindings;
    this.now = options.now ?? Date.now;
    this.agentName = options.agentName?.trim() || 'Forge Demo Agent';
    this.strategy = options.strategy ?? 'balanced';
    this.speed = options.speed ?? 1;
    this.stepIntervalMs = Math.max(10, Math.floor(options.stepIntervalMs ?? DEFAULT_STEP_INTERVAL_MS));
    this.maxTraceEvents = Math.max(
      10,
      Math.floor(options.maxTraceEvents ?? FORGE_AGENT_DEFAULT_MAX_TRACE_EVENTS)
    );
    this.description = createDescription(this.maxTraceEvents);
    this.runId = this.createRunId();
  }

  public describe(): ForgeAgentDescription {
    return cloneUnknown(this.description) as ForgeAgentDescription;
  }

  public observe(): ForgeAgentObservation {
    const observation = cloneUnknown(
      this.bindings.getObservation(),
      new Set(['bossSlot'])
    );
    if (!isRecord(observation) || !Number.isSafeInteger(observation.revision) || (observation.revision as number) < 0) {
      throw new Error('ForgeAgent observation must include a non-negative integer revision.');
    }
    return observation as ForgeAgentObservation;
  }

  public actions(): ForgeAgentActionOption[] {
    return this.readAvailableActions(this.observe()).map(cloneActionOption);
  }

  public async act(envelope: ForgeAgentActionEnvelope): Promise<ForgeAgentActionResult> {
    const candidate = envelope as unknown;
    if (!isRecord(candidate)) {
      return this.reject(null, null, null, '', 'invalid_request', '행동 요청 형식이 올바르지 않습니다.');
    }

    const actionId = typeof candidate.actionId === 'string' ? candidate.actionId.trim() : '';
    const expectedRevision = Number.isSafeInteger(candidate.expectedRevision)
      ? candidate.expectedRevision as number
      : null;
    const action = isAllowedAction(candidate.action) ? candidate.action : null;
    const rationale = sanitizeRationale(candidate.rationale);

    if (!actionId || expectedRevision === null) {
      return this.reject(
        actionId,
        action,
        expectedRevision,
        rationale,
        'invalid_request',
        'actionId와 expectedRevision이 필요합니다.'
      );
    }
    if (!action) {
      return this.reject(
        actionId,
        null,
        expectedRevision,
        rationale,
        'action_not_allowed',
        '허용 목록에 없는 행동입니다.'
      );
    }
    if (this.usedActionIds.has(actionId)) {
      return this.reject(
        actionId,
        action,
        expectedRevision,
        rationale,
        'duplicate_action_id',
        '이미 처리한 actionId입니다.'
      );
    }
    if (this.isExecuting) {
      return this.reject(actionId, action, expectedRevision, rationale, 'busy', '이전 행동을 처리 중입니다.');
    }

    let observation: ForgeAgentObservation;
    try {
      observation = this.observe();
    } catch (error: unknown) {
      return this.reject(
        actionId,
        action,
        expectedRevision,
        rationale,
        'execution_failed',
        error instanceof Error ? error.message : '관찰 상태를 읽지 못했습니다.'
      );
    }

    if (observation.revision !== expectedRevision) {
      return this.reject(
        actionId,
        action,
        expectedRevision,
        rationale,
        'stale_revision',
        '관찰 이후 상태가 변경되어 행동을 거부했습니다.',
        observation.revision
      );
    }

    let available: ForgeAgentActionOption[];
    try {
      available = this.readAvailableActions(observation);
    } catch (error: unknown) {
      return this.reject(
        actionId,
        action,
        expectedRevision,
        rationale,
        'execution_failed',
        error instanceof Error ? error.message : '가능한 행동 목록을 읽지 못했습니다.',
        observation.revision
      );
    }
    if (!available.some(option => option.action === action && option.enabled)) {
      return this.reject(
        actionId,
        action,
        expectedRevision,
        rationale,
        'action_unavailable',
        '현재 상태에서 실행할 수 없는 행동입니다.',
        observation.revision
      );
    }

    const safeEnvelope: ForgeAgentActionEnvelope = {
      actionId,
      expectedRevision,
      action,
      rationale,
      ...(isRecord(candidate.payload)
        ? { payload: cloneUnknown(candidate.payload) as Record<string, unknown> }
        : {})
    };

    this.usedActionIds.add(actionId);
    this.isExecuting = true;
    this.lastRationale = rationale;
    this.notify();

    let result: ForgeAgentActionResult;
    try {
      const execution = await this.bindings.executeAction(
        cloneUnknown(safeEnvelope) as ForgeAgentActionEnvelope
      );
      result = this.normalizeExecutionResult(safeEnvelope, execution);
    } catch (error: unknown) {
      result = {
        ok: false,
        actionId,
        action,
        expectedRevision,
        revision: observation.revision,
        rationale,
        message: error instanceof Error ? error.message : '행동 실행 중 오류가 발생했습니다.',
        error: 'execution_failed',
        occurredAt: this.now()
      };
    } finally {
      this.isExecuting = false;
    }

    this.lastResult = cloneActionResult(result);
    this.appendActionEvent(result);
    this.notify();
    return cloneActionResult(result);
  }

  public exportTrace(): ForgeAgentTraceExport {
    return {
      schemaVersion: 1,
      runId: this.runId,
      agentName: this.agentName,
      strategy: this.strategy,
      startedAt: this.startedAt,
      exportedAt: this.now(),
      events: this.events.map(cloneTraceEvent)
    };
  }

  public getSnapshot(): ForgeAgentRuntimeSnapshot {
    return {
      agentName: this.agentName,
      strategy: this.strategy,
      status: this.status,
      speed: this.speed,
      isExecuting: this.isExecuting,
      currentGoal: this.currentGoal,
      lastRationale: this.lastRationale,
      lastResult: this.lastResult ? cloneActionResult(this.lastResult) : null,
      events: this.events.map(cloneTraceEvent)
    };
  }

  public subscribe(listener: ForgeAgentRuntimeListener): () => void {
    this.assertActive();
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public start(): void {
    this.assertActive();
    if (this.status === 'running') return;
    if (this.status === 'idle') {
      this.runId = this.createRunId();
      this.startedAt = this.now();
      this.events = [];
      this.eventSequence = 0;
      this.actionSequence = 0;
      this.lastResult = null;
    }
    this.generation += 1;
    this.status = 'running';
    this.currentGoal = '공개 상태 관찰';
    this.appendLifecycleEvent('데모 정책 실행을 시작했습니다.');
    this.notify();
    this.scheduleNext(0, this.generation);
  }

  public pause(): void {
    this.assertActive();
    if (this.status !== 'running') return;
    this.generation += 1;
    this.clearTimer();
    this.status = 'paused';
    this.currentGoal = '일시정지';
    this.appendLifecycleEvent('데모 정책 실행을 일시정지했습니다.');
    this.notify();
  }

  public stop(): void {
    this.assertActive();
    this.stopInternal('데모 정책 실행을 중지했습니다.');
  }

  public setSpeed(speed: ForgeAgentSpeed): void {
    this.assertActive();
    if (speed !== 1 && speed !== 2 && speed !== 4) {
      throw new Error('ForgeAgent speed must be 1, 2, or 4.');
    }
    if (this.speed === speed) return;
    this.speed = speed;
    this.generation += 1;
    this.clearTimer();
    this.appendLifecycleEvent(`${speed}배속으로 변경했습니다.`);
    this.notify();
    if (this.status === 'running') this.scheduleNext(this.stepDelay(), this.generation);
  }

  public setStrategy(strategy: ForgeAgentStrategy): void {
    this.assertActive();
    if (strategy !== 'aggressive' && strategy !== 'cautious' && strategy !== 'balanced') {
      throw new Error('Unknown ForgeAgent strategy.');
    }
    if (this.strategy === strategy) return;
    this.strategy = strategy;
    this.appendLifecycleEvent('데모 전략을 변경했습니다.');
    this.notify();
  }

  public dispose(): void {
    if (this.disposed) return;
    this.generation += 1;
    this.clearTimer();
    this.status = 'idle';
    this.disposed = true;
    this.listeners.clear();
  }

  private readAvailableActions(observation: ForgeAgentObservation): ForgeAgentActionOption[] {
    const rawOptions = this.bindings.getAvailableActions(
      cloneUnknown(observation, new Set(['bossSlot'])) as ForgeAgentObservation
    );
    if (!Array.isArray(rawOptions)) return [];

    const seen = new Set<ForgeAgentAction>();
    const options: ForgeAgentActionOption[] = [];
    rawOptions.forEach(raw => {
      if (!isRecord(raw) || !isAllowedAction(raw.action) || seen.has(raw.action)) return;
      seen.add(raw.action);
      options.push({
        action: raw.action,
        enabled: raw.enabled === true,
        ...(typeof raw.label === 'string' ? { label: raw.label } : {}),
        ...(typeof raw.reason === 'string' ? { reason: raw.reason } : {}),
        ...(isRecord(raw.payload) ? { payload: cloneUnknown(raw.payload) as Record<string, unknown> } : {}),
        ...(isRecord(raw.metadata) ? { metadata: cloneUnknown(raw.metadata) as Record<string, unknown> } : {})
      });
    });
    return options;
  }

  private normalizeExecutionResult(
    envelope: ForgeAgentActionEnvelope,
    execution: ForgeAgentExecutionResult
  ): ForgeAgentActionResult {
    if (!isRecord(execution) || typeof execution.ok !== 'boolean') {
      return {
        ok: false,
        actionId: envelope.actionId,
        action: envelope.action,
        expectedRevision: envelope.expectedRevision,
        revision: envelope.expectedRevision,
        rationale: envelope.rationale,
        message: '도메인 실행기가 올바른 결과를 반환하지 않았습니다.',
        error: 'execution_failed',
        occurredAt: this.now()
      };
    }

    const revision = Number.isSafeInteger(execution.revision)
      ? execution.revision as number
      : envelope.expectedRevision;
    const message = typeof execution.message === 'string' && execution.message.trim()
      ? execution.message.trim()
      : execution.ok ? '행동을 실행했습니다.' : '도메인 규칙이 행동을 거부했습니다.';
    return {
      ok: execution.ok,
      actionId: envelope.actionId,
      action: envelope.action,
      expectedRevision: envelope.expectedRevision,
      revision,
      rationale: envelope.rationale,
      message,
      ...(!execution.ok ? { error: 'domain_rejected' as const } : {}),
      ...(execution.data !== undefined ? { data: cloneUnknown(execution.data) } : {}),
      occurredAt: this.now()
    };
  }

  private reject(
    actionId: string | null,
    action: ForgeAgentAction | null,
    expectedRevision: number | null,
    rationale: string,
    error: ForgeAgentActionError,
    message: string,
    revision: number | null = null
  ): ForgeAgentActionResult {
    const result: ForgeAgentActionResult = {
      ok: false,
      actionId: actionId ?? '',
      action,
      expectedRevision,
      revision,
      rationale: sanitizeRationale(rationale),
      message,
      error,
      occurredAt: this.now()
    };
    this.lastResult = cloneActionResult(result);
    this.appendActionEvent(result);
    this.notify();
    return cloneActionResult(result);
  }

  private stopInternal(message: string): void {
    this.generation += 1;
    this.clearTimer();
    if (this.status === 'idle') return;
    this.status = 'idle';
    this.currentGoal = '중지됨';
    this.appendLifecycleEvent(message);
    this.notify();
  }

  private async runStep(generation: number): Promise<void> {
    this.timerId = null;
    if (this.disposed || this.status !== 'running' || generation !== this.generation) return;
    if (this.isExecuting) {
      this.scheduleNext(this.stepDelay(), this.generation);
      return;
    }

    try {
      const observation = this.observe();
      const actions = this.readAvailableActions(observation);
      const decision = decideNextForgeAgentAction(this.strategy, observation, actions);
      if (!decision) {
        this.currentGoal = '가능한 행동 대기';
        this.lastRationale = '현재 실행 가능한 허용 행동이 없어 상태 변화를 기다립니다.';
        this.appendDecisionEvent(this.lastRationale);
        this.notify();
      } else {
        this.currentGoal = decision.goal;
        this.lastRationale = decision.rationale;
        this.notify();
        await this.act({
          actionId: `${this.runId}-action-${++this.actionSequence}`,
          expectedRevision: observation.revision,
          action: decision.action,
          rationale: decision.rationale,
          ...(decision.payload ? { payload: decision.payload } : {})
        });
      }
    } catch (error: unknown) {
      this.currentGoal = '브리지 상태 확인';
      this.lastRationale = '공개 상태를 읽지 못해 이번 주기의 행동을 건너뜁니다.';
      this.appendDecisionEvent(
        error instanceof Error ? error.message : '데모 정책 주기를 실행하지 못했습니다.'
      );
      this.notify();
    } finally {
      if (!this.disposed && this.status === 'running') {
        this.scheduleNext(this.stepDelay(), this.generation);
      }
    }
  }

  private scheduleNext(delay: number, generation: number): void {
    this.clearTimer();
    if (this.disposed || this.status !== 'running') return;
    this.timerId = globalThis.setTimeout(() => {
      void this.runStep(generation);
    }, delay);
  }

  private clearTimer(): void {
    if (this.timerId === null) return;
    globalThis.clearTimeout(this.timerId);
    this.timerId = null;
  }

  private stepDelay(): number {
    return Math.max(1, Math.floor(this.stepIntervalMs / this.speed));
  }

  private appendLifecycleEvent(message: string): void {
    this.appendEvent({ kind: 'lifecycle', message });
  }

  private appendDecisionEvent(message: string): void {
    this.appendEvent({
      kind: 'decision',
      message,
      goal: this.currentGoal,
      rationale: this.lastRationale
    });
  }

  private appendActionEvent(result: ForgeAgentActionResult): void {
    this.appendEvent({
      kind: 'action',
      message: result.message,
      goal: this.currentGoal,
      ...(result.action ? { action: result.action } : {}),
      ...(result.actionId ? { actionId: result.actionId } : {}),
      rationale: result.rationale,
      result: {
        ok: result.ok,
        revision: result.revision,
        message: result.message,
        ...(result.error ? { error: result.error } : {})
      }
    });
  }

  private appendEvent(
    event: Omit<ForgeAgentTraceEvent, 'eventId' | 'sequence' | 'timestamp' | 'status'>
  ): void {
    const sequence = ++this.eventSequence;
    this.events.push({
      ...event,
      eventId: `${this.runId}-event-${sequence}`,
      sequence,
      timestamp: this.now(),
      status: this.status
    });
    if (this.events.length > this.maxTraceEvents) {
      this.events.splice(0, this.events.length - this.maxTraceEvents);
    }
  }

  private notify(): void {
    const snapshot = this.getSnapshot();
    this.listeners.forEach(listener => listener(snapshot));
  }

  private createRunId(): string {
    runtimeSequence += 1;
    return `forge-agent-${this.now().toString(36)}-${runtimeSequence.toString(36)}`;
  }

  private assertActive(): void {
    if (this.disposed) throw new Error('ForgeAgentRuntime has been disposed.');
  }
}

export function createForgeAgentRuntime(
  bindings: ForgeAgentBindings,
  options: ForgeAgentRuntimeOptions = {}
): ForgeAgentRuntime {
  return new ForgeAgentRuntime(bindings, options);
}
