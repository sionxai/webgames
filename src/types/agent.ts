export const FORGE_AGENT_SCHEMA_VERSION = 1 as const;
export const FORGE_AGENT_PROTOCOL = 'webgames-agent' as const;
export const FORGE_AGENT_PROTOCOL_VERSION = '1.0.0' as const;
export const FORGE_AGENT_GAME_ID = 'forge' as const;
export const FORGE_AGENT_TRANSPORT_KIND = 'browser-window' as const;
export const FORGE_AGENT_BRIDGE_GLOBAL = 'window.webgamesAgent' as const;
export const FORGE_AGENT_READY_EVENT = 'webgames:agent-ready' as const;
export const FORGE_AGENT_METHODS = [
  'describe',
  'observe',
  'actions',
  'act',
  'exportTrace'
] as const;
export const FORGE_AGENT_DEFAULT_MAX_TRACE_EVENTS = 120;
export const FORGE_AGENT_MAX_RATIONALE_LENGTH = 180;
export const FORGE_AGENT_MAX_CONCURRENT_ACTIONS = 1;

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

export type ForgeAgentMethod = (typeof FORGE_AGENT_METHODS)[number];
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

export interface ForgeAgentDescription {
  readonly schemaVersion: typeof FORGE_AGENT_SCHEMA_VERSION;
  readonly protocol: typeof FORGE_AGENT_PROTOCOL;
  readonly protocolVersion: typeof FORGE_AGENT_PROTOCOL_VERSION;
  readonly gameId: typeof FORGE_AGENT_GAME_ID;
  readonly transport: Readonly<{
    kind: typeof FORGE_AGENT_TRANSPORT_KIND;
    global: typeof FORGE_AGENT_BRIDGE_GLOBAL;
    readyEvent: typeof FORGE_AGENT_READY_EVENT;
  }>;
  readonly methods: readonly ForgeAgentMethod[];
  readonly actions: readonly ForgeAgentAction[];
  readonly persistence: Readonly<{
    kind: 'browser-local';
    storage: 'localStorage';
    agentHumanSeparated: true;
    serverAuthoritative: false;
    officialRanking: false;
  }>;
  readonly limits: Readonly<{
    maxTraceEvents: number;
    maxRationaleLength: typeof FORGE_AGENT_MAX_RATIONALE_LENGTH;
    concurrentActions: typeof FORGE_AGENT_MAX_CONCURRENT_ACTIONS;
  }>;
}

export interface ForgeAgentBridge {
  describe(): ForgeAgentDescription;
  observe(): ForgeAgentObservation;
  actions(): ForgeAgentActionOption[];
  act(envelope: ForgeAgentActionEnvelope): Promise<ForgeAgentActionResult>;
  exportTrace(): ForgeAgentTraceExport;
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

declare global {
  interface Window {
    webgamesAgent?: ForgeAgentBridge;
  }

  interface WindowEventMap {
    'webgames:agent-ready': CustomEvent<ForgeAgentDescription>;
  }
}
