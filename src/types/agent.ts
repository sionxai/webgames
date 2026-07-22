export const FORGE_AGENT_ACTION_ALLOWLIST = [
  'attack',
  'enhance',
  'repair',
  'sell',
  'extract',
  'ad_restore',
  'select_series',
  'wait'
] as const;

export type ForgeAgentAction = (typeof FORGE_AGENT_ACTION_ALLOWLIST)[number];
export type ForgeAgentStrategy = 'aggressive' | 'cautious' | 'balanced';
export type ForgeAgentStatus = 'idle' | 'running' | 'paused';
export type ForgeAgentSpeed = 1 | 2 | 4;
export type ForgePlayerView = 'human' | 'agent';

/** Public, serializable state prepared by App. Hidden encounter state is removed again by the bridge. */
export type ForgeAgentObservation = Readonly<{
  revision: number;
  observedAt?: number;
  [key: string]: unknown;
}>;

export interface ForgeAgentActionOption {
  readonly action: ForgeAgentAction;
  readonly enabled: boolean;
  readonly label?: string;
  readonly reason?: string;
  readonly payload?: Readonly<Record<string, unknown>>;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface ForgeAgentActionEnvelope {
  readonly actionId: string;
  readonly expectedRevision: number;
  readonly action: ForgeAgentAction;
  /** One-line public strategy summary. This is not private model reasoning. */
  readonly rationale: string;
  readonly payload?: Readonly<Record<string, unknown>>;
}

export interface ForgeAgentExecutionResult {
  readonly ok: boolean;
  readonly revision: number;
  readonly message: string;
  readonly data?: unknown;
}

export type ForgeAgentActionError =
  | 'invalid_request'
  | 'action_not_allowed'
  | 'duplicate_action_id'
  | 'stale_revision'
  | 'action_unavailable'
  | 'busy'
  | 'domain_rejected'
  | 'execution_failed';

export interface ForgeAgentActionResult {
  readonly ok: boolean;
  readonly actionId: string;
  readonly action: ForgeAgentAction | null;
  readonly expectedRevision: number | null;
  readonly revision: number | null;
  readonly rationale: string;
  readonly message: string;
  readonly error?: ForgeAgentActionError;
  readonly data?: unknown;
  readonly occurredAt: number;
}

export interface ForgeAgentDecision {
  readonly action: ForgeAgentAction;
  readonly goal: string;
  readonly rationale: string;
  readonly payload?: Readonly<Record<string, unknown>>;
}

export type ForgeAgentTraceEventKind = 'lifecycle' | 'decision' | 'action';

export interface ForgeAgentTraceEvent {
  readonly eventId: string;
  readonly sequence: number;
  readonly timestamp: number;
  readonly kind: ForgeAgentTraceEventKind;
  readonly status: ForgeAgentStatus;
  readonly message: string;
  readonly goal?: string;
  readonly action?: ForgeAgentAction;
  readonly actionId?: string;
  readonly rationale?: string;
  readonly result?: Readonly<{
    ok: boolean;
    revision: number | null;
    message: string;
    error?: ForgeAgentActionError;
  }>;
}

export interface ForgeAgentTraceExport {
  readonly schemaVersion: 1;
  readonly runId: string;
  readonly agentName: string;
  readonly strategy: ForgeAgentStrategy;
  readonly startedAt: number | null;
  readonly exportedAt: number;
  readonly events: readonly ForgeAgentTraceEvent[];
}

export interface ForgeAgentRuntimeSnapshot {
  readonly agentName: string;
  readonly strategy: ForgeAgentStrategy;
  readonly status: ForgeAgentStatus;
  readonly speed: ForgeAgentSpeed;
  readonly isExecuting: boolean;
  readonly currentGoal: string;
  readonly lastRationale: string;
  readonly lastResult: ForgeAgentActionResult | null;
  readonly events: readonly ForgeAgentTraceEvent[];
}

export interface ForgeAgentBindings {
  getObservation(): ForgeAgentObservation;
  getAvailableActions(
    observation: ForgeAgentObservation
  ): readonly ForgeAgentActionOption[];
  executeAction(
    envelope: ForgeAgentActionEnvelope
  ): ForgeAgentExecutionResult | Promise<ForgeAgentExecutionResult>;
}

export interface ForgeAgentRuntimeOptions {
  readonly agentName?: string;
  readonly strategy?: ForgeAgentStrategy;
  readonly speed?: ForgeAgentSpeed;
  readonly stepIntervalMs?: number;
  readonly maxTraceEvents?: number;
  readonly now?: () => number;
}

export type ForgeAgentRuntimeListener = (snapshot: ForgeAgentRuntimeSnapshot) => void;
