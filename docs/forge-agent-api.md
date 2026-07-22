# Forge browser agent bridge v1

Forge exposes a provider-neutral browser bridge for agents that already control a browser. The runner opens `/games/forge/`, waits for the bridge in that same page context, and calls `window.webgamesAgent`. The page does not connect directly to an external model API, MCP server, or remote REST agent service.

Discovery metadata is available at `/.well-known/webgames-agent.json`. Its `entryPath` is `/games/forge/`; protocol version `1.0.0` is exposed both in the manifest and by `describe()`.

## Connect from a browser-control runner

Install the ready-event listener before navigation when possible. A runner attached after initialization must check the global because the ready event is not replayed. Treat the event as an idempotent readiness hint: a development remount may emit it more than once.

```js
async function getForgeBridge() {
  if (window.webgamesAgent) return window.webgamesAgent;

  return new Promise((resolve) => {
    window.addEventListener('webgames:agent-ready', () => {
      resolve(window.webgamesAgent);
    }, { once: true });
  });
}

const bridge = await getForgeBridge();
const description = bridge.describe();
const observation = bridge.observe();
const candidate = bridge.actions().find((option) => option.enabled);

if (candidate) {
  const result = await bridge.act({
    actionId: crypto.randomUUID(),
    expectedRevision: observation.revision,
    action: candidate.action,
    rationale: '현재 공개 상태에서 실행 가능한 행동을 선택합니다.',
    ...(candidate.payload ? { payload: candidate.payload } : {})
  });

  if (!result.ok && result.error === 'stale_revision') {
    // Observe again, recalculate the action, and use a new actionId.
    const latest = bridge.observe();
    console.info('State changed before the action.', latest.revision);
  }
}

const trace = bridge.exportTrace();
```

The normal loop is `observe()` → `actions()` → `act()` and, when needed, `exportTrace()`. Call `describe()` during discovery rather than assuming a version, action set, or limit.

## Public methods

| Method | Purpose |
| --- | --- |
| `describe()` | Returns a JSON-serializable, defensive copy of protocol, transport, action, persistence, and limit metadata. |
| `observe()` | Returns the current public state and integer `revision`. Hidden boss shuffle positions are omitted. |
| `actions()` | Returns allowlisted actions with current `enabled`, reason, and optional public payload metadata. |
| `act(envelope)` | Attempts one allowlisted action and resolves to a structured success or rejection result. |
| `exportTrace()` | Returns the local demo trace, capped at the advertised event count. |

## Action envelope rules

- `actionId` must be non-empty and unique for every attempted action. Never reuse an ID after a processed action; use a fresh ID when retrying.
- `expectedRevision` must equal the `revision` from the observation used to choose the action. On `stale_revision`, observe and plan again.
- `action` must come from the allowlist and should be selected from the current `actions()` result. Disabled actions are rejected without changing game state.
- `rationale` is a public, one-line strategy summary, not private chain-of-thought. It is normalized and limited to 180 characters.
- Only one action may execute at a time. Wait for `act()` to settle before sending another request.
- If an action option includes a `payload`, send only the currently advertised payload. Domain validation still applies after bridge validation.

Rejected stale, duplicate, unknown, unavailable, busy, or domain-invalid actions do not intentionally advance game state. Re-observe after every successful state-changing action.

## Persistence and trust limits

Forge v1 stores state in browser `localStorage`. Human and agent saves are separated, but the browser remains the authority: there is no account-backed server save, server-authoritative anti-cheat, or official ranking. Clearing site data removes local progress.

The bridge is an in-page browser contract only. It does not provide remote MCP or REST access, does not include an external model, and does not manage model credentials or provider billing. A browser-control runner owns navigation, model-provider integration, retries, and policy. The local trace contains public strategy summaries rather than hidden model reasoning.
