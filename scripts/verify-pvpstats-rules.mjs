import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  accessSync,
  constants,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

const PROJECT_ID = 'demo-pvpstats-rules';
const NAMESPACE = `${PROJECT_ID}-default-rtdb`;
const EMULATOR_URL = 'http://127.0.0.1:9000';
const SCRIPT_PATH = fileURLToPath(import.meta.url);
const REPO_ROOT = dirname(dirname(SCRIPT_PATH));
const ROOT_RULES_PATH = join(REPO_ROOT, 'database.rules.json');
const GACHA_RULES_PATH = join(REPO_ROOT, 'games/gacha/database.rules.json');
const EMULATOR_TIMEOUT_MS = 45_000;
const JAVA_BIN_CANDIDATES = [
  '/opt/homebrew/opt/openjdk@21/bin',
  '/opt/homebrew/opt/openjdk/bin'
];

const b64 = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
const nowSeconds = Math.floor(Date.now() / 1000);
const token = (uid) =>
  `${b64({ alg: 'none', kid: 'fakekid', type: 'JWT' })}.${b64({
    iss: `https://securetoken.google.com/${PROJECT_ID}`,
    aud: PROJECT_ID,
    auth_time: nowSeconds,
    user_id: uid,
    sub: uid,
    iat: nowSeconds,
    exp: nowSeconds + 3600,
    firebase: { identities: {}, sign_in_provider: 'anonymous' }
  })}.`;

function sha256File(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

function readRules(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function pvpStatsBlock(rules) {
  return rules?.rules?.users?.$uid?.pvpStats;
}

function findJavaBinDirectory() {
  for (const directory of JAVA_BIN_CANDIDATES) {
    try {
      accessSync(join(directory, 'java'), constants.X_OK);
      return directory;
    } catch {
      // Try the next known Homebrew JDK location.
    }
  }

  const pathJava = spawnSync('java', ['-version'], { stdio: 'ignore' });
  if (!pathJava.error && pathJava.status === 0) {
    return null;
  }

  throw new Error(
    'JDK를 찾을 수 없습니다. Homebrew openjdk@21/openjdk를 설치하거나 java를 PATH에 추가해 주세요.'
  );
}

function shellQuote(value) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function requestUrl(path, authToken) {
  const normalizedPath = path ? `/${path}` : '/';
  const authQuery = authToken === 'owner' ? '' : `&auth=${encodeURIComponent(authToken)}`;
  return `${EMULATOR_URL}${normalizedPath}.json?ns=${NAMESPACE}${authQuery}`;
}

async function requestStatus({ path, method, authToken, body }) {
  const init = { method };
  const headers = {};
  if (authToken === 'owner') {
    headers.Authorization = 'Bearer owner';
  }
  if (body !== undefined) {
    headers['content-type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  if (Object.keys(headers).length > 0) {
    init.headers = headers;
  }
  const response = await fetch(requestUrl(path, authToken), init);
  await response.arrayBuffer();
  return response.status;
}

function history(count, prefix) {
  return Array.from({ length: count }, (_, index) => ({
    opponent: `${prefix}-${index}`,
    opponentName: `${prefix} ${index}`,
    result: index % 2 === 0 ? 'win' : 'loss',
    turns: index + 1,
    timestamp: 1_700_000_000_000 + index
  }));
}

function stats(wins, losses, draws, historyCount, prefix) {
  return {
    wins,
    losses,
    draws,
    history: history(historyCount, prefix)
  };
}

const actorUid = 'pvp-actor';
const targetUid = 'pvp-target';
const ownerUid = 'pvp-owner';
const adminUid = 'pvp-admin';
const baseStats = stats(5, 3, 2, 2, 'base');

const cases = [
  {
    number: 1,
    name: 'owner arbitrary write',
    actor: ownerUid,
    users: {
      [ownerUid]: { role: 'user', pvpStats: baseStats }
    },
    target: ownerUid,
    body: stats(0, 0, 0, 0, 'owner-reset'),
    candidateExpected: 200
  },
  {
    number: 2,
    name: 'database role admin resets another user',
    actor: adminUid,
    users: {
      [adminUid]: { role: 'admin' },
      [targetUid]: { role: 'user', pvpStats: baseStats }
    },
    target: targetUid,
    body: stats(0, 0, 0, 0, 'admin-reset'),
    candidateExpected: 200
  },
  {
    number: 3,
    name: 'other user increments existing total by one',
    actor: actorUid,
    users: {
      [actorUid]: { role: 'user' },
      [targetUid]: { role: 'user', pvpStats: baseStats }
    },
    target: targetUid,
    body: stats(6, 3, 2, 3, 'case3'),
    candidateExpected: 200
  },
  {
    number: 4,
    name: 'other user total plus two',
    actor: actorUid,
    users: {
      [actorUid]: { role: 'user' },
      [targetUid]: { role: 'user', pvpStats: baseStats }
    },
    target: targetUid,
    body: stats(7, 3, 2, 3, 'case4'),
    baselineExpected: 200,
    candidateExpected: 401
  },
  {
    number: 5,
    name: 'other user sets wins to 999',
    actor: actorUid,
    users: {
      [actorUid]: { role: 'user' },
      [targetUid]: { role: 'user', pvpStats: baseStats }
    },
    target: targetUid,
    body: stats(999, 3, 2, 3, 'case5'),
    baselineExpected: 200,
    candidateExpected: 401
  },
  {
    number: 6,
    name: 'other user decreases one counter while total increases by one',
    actor: actorUid,
    users: {
      [actorUid]: { role: 'user' },
      [targetUid]: { role: 'user', pvpStats: baseStats }
    },
    target: targetUid,
    body: stats(4, 5, 2, 3, 'case6'),
    baselineExpected: 200,
    candidateExpected: 401
  },
  {
    number: 7,
    name: 'other user creates missing pvpStats',
    actor: actorUid,
    users: {
      [actorUid]: { role: 'user' },
      [targetUid]: { role: 'user' }
    },
    target: targetUid,
    body: stats(1, 0, 0, 1, 'case7'),
    candidateExpected: 200
  },
  {
    number: 8,
    name: 'other user creates missing pvpStats with total five',
    actor: actorUid,
    users: {
      [actorUid]: { role: 'user' },
      [targetUid]: { role: 'user' }
    },
    target: targetUid,
    body: stats(5, 0, 0, 1, 'case8'),
    baselineExpected: 200,
    candidateExpected: 401
  }
];

async function seedCase(testCase) {
  const clearStatus = await requestStatus({
    path: '',
    method: 'DELETE',
    authToken: 'owner'
  });
  if (clearStatus !== 200) {
    throw new Error(`fixture clear HTTP ${clearStatus} (expected 200)`);
  }

  const seedStatus = await requestStatus({
    path: '',
    method: 'PUT',
    authToken: 'owner',
    body: { users: testCase.users }
  });
  if (seedStatus !== 200) {
    throw new Error(`fixture seed HTTP ${seedStatus} (expected 200)`);
  }
}

async function runRuleChecks(mode) {
  const selectedCases =
    mode === 'baseline'
      ? cases.filter((testCase) => testCase.baselineExpected !== undefined)
      : mode === 'candidate'
        ? cases
        : [];
  if (selectedCases.length === 0) {
    console.error(`ERROR: 알 수 없는 검증 모드입니다: ${mode}`);
    process.exitCode = 1;
    return;
  }

  let passed = 0;
  for (const testCase of selectedCases) {
    const expected =
      mode === 'baseline' ? testCase.baselineExpected : testCase.candidateExpected;
    try {
      await seedCase(testCase);
      const actual = await requestStatus({
        path: `users/${testCase.target}/pvpStats`,
        method: 'PUT',
        authToken: token(testCase.actor),
        body: testCase.body
      });
      if (actual === expected) {
        passed += 1;
        console.log(
          `PASS ${testCase.number}. ${testCase.name} (HTTP ${actual}, expected ${expected})`
        );
      } else {
        console.error(
          `FAIL ${testCase.number}. ${testCase.name} (HTTP ${actual}, expected ${expected})`
        );
      }
    } catch (error) {
      console.error(`FAIL ${testCase.number}. ${testCase.name} (${error.message})`);
    }
  }

  console.log(`${mode}: ${passed}/${selectedCases.length} passed`);
  process.exitCode = passed === selectedCases.length ? 0 : 1;
}

function materializeVariant(tempRoot, name, rulesText) {
  const variantDirectory = join(tempRoot, name);
  mkdirSync(variantDirectory);
  const rulesPath = join(variantDirectory, 'database.rules.json');
  const configPath = join(variantDirectory, 'firebase.json');
  writeFileSync(rulesPath, rulesText);
  writeFileSync(
    configPath,
    `${JSON.stringify(
      {
        database: { rules: 'database.rules.json' },
        emulators: {
          database: { host: '127.0.0.1', port: 9000 },
          ui: { enabled: false },
          singleProjectMode: true
        }
      },
      null,
      2
    )}\n`
  );
  return { variantDirectory, configPath, rulesPath };
}

async function runEmulatorVariant(name, materialized, javaBinDirectory) {
  const runCommand = `${shellQuote(process.execPath)} ${shellQuote(SCRIPT_PATH)} --run ${shellQuote(
    name
  )}`;
  const childEnvironment = {
    ...process.env,
    CI: '1',
    FIREBASE_CLI_DISABLE_UPDATE_CHECK: 'true'
  };
  if (javaBinDirectory !== null) {
    childEnvironment.PATH = `${javaBinDirectory}:${childEnvironment.PATH ?? ''}`;
  }

  console.log(
    `${name} loaded config: ${materialized.configPath} (rules ${materialized.rulesPath}, ${EMULATOR_URL}, project ${PROJECT_ID})`
  );
  const child = spawn(
    'firebase',
    [
      'emulators:exec',
      '--only',
      'database',
      '--project',
      PROJECT_ID,
      '--config',
      materialized.configPath,
      runCommand
    ],
    {
      cwd: materialized.variantDirectory,
      env: childEnvironment,
      stdio: 'inherit'
    }
  );

  return await new Promise((resolve) => {
    let settled = false;
    let timedOut = false;
    let forceKillTimer;
    const settle = (outcome) => {
      if (!settled) {
        settled = true;
        clearTimeout(timeoutTimer);
        if (forceKillTimer !== undefined) clearTimeout(forceKillTimer);
        resolve({ ...outcome, timedOut });
      }
    };
    const timeoutTimer = setTimeout(() => {
      timedOut = true;
      console.error(`ERROR: ${name} Firebase emulator가 ${EMULATOR_TIMEOUT_MS}ms 내 종료되지 않았습니다.`);
      child.kill('SIGTERM');
      forceKillTimer = setTimeout(() => child.kill('SIGKILL'), 5_000);
    }, EMULATOR_TIMEOUT_MS);
    child.once('error', (error) => settle({ error }));
    child.once('close', (code, signal) => settle({ code, signal }));
  });
}

async function runVerifier() {
  const startHashes = {
    root: sha256File(ROOT_RULES_PATH),
    gacha: sha256File(GACHA_RULES_PATH)
  };
  console.log(`START SHA-256 database.rules.json ${startHashes.root}`);
  console.log(`START SHA-256 games/gacha/database.rules.json ${startHashes.gacha}`);

  let tempRoot;
  let failed = false;
  try {
    const rootRulesText = readFileSync(ROOT_RULES_PATH, 'utf8');
    const rootRules = JSON.parse(rootRulesText);
    const gachaRules = readRules(GACHA_RULES_PATH);
    const rootBlock = pvpStatsBlock(rootRules);
    const gachaBlock = pvpStatsBlock(gachaRules);
    if (!rootBlock || !gachaBlock || !isDeepStrictEqual(rootBlock, gachaBlock)) {
      throw new Error('두 rules 파일의 pvpStats block이 deep-equal하지 않습니다.');
    }
    console.log('PASS preflight: pvpStats blocks are deep-equal');

    const baselineRules = JSON.parse(rootRulesText);
    baselineRules.rules.users.$uid.pvpStats['.write'] = 'auth != null';
    tempRoot = mkdtempSync(join(tmpdir(), 'pvpstats-rules-'));
    const baseline = materializeVariant(
      tempRoot,
      'baseline',
      `${JSON.stringify(baselineRules, null, 2)}\n`
    );
    const candidate = materializeVariant(tempRoot, 'candidate', rootRulesText);
    const javaBinDirectory = findJavaBinDirectory();
    console.log(
      `JDK: ${javaBinDirectory === null ? 'PATH java' : join(javaBinDirectory, 'java')}`
    );
    console.log(`candidate source: ${ROOT_RULES_PATH} (SHA-256 ${startHashes.root})`);

    for (const [name, materialized] of [
      ['baseline', baseline],
      ['candidate', candidate]
    ]) {
      const outcome = await runEmulatorVariant(name, materialized, javaBinDirectory);
      if (outcome.timedOut) {
        failed = true;
        break;
      }
      if (outcome.error) {
        console.error(`ERROR: ${name} Firebase emulator 실행 실패: ${outcome.error.message}`);
        failed = true;
        break;
      }
      if (outcome.signal) {
        console.error(`ERROR: ${name} Firebase emulator가 ${outcome.signal} 신호로 종료되었습니다.`);
        failed = true;
        break;
      }
      if (outcome.code !== 0) {
        console.error(`ERROR: ${name} 검증 프로세스 exit ${outcome.code ?? 'unknown'}`);
        failed = true;
      }
    }
  } catch (error) {
    console.error(`ERROR: ${error.message}`);
    failed = true;
  } finally {
    if (tempRoot !== undefined) {
      try {
        rmSync(tempRoot, { recursive: true, force: true });
        console.log(`PASS cleanup: removed ${tempRoot}`);
      } catch (error) {
        console.error(`ERROR: verifier 임시 디렉터리 정리 실패: ${error.message}`);
        failed = true;
      }
    }

    try {
      const endHashes = {
        root: sha256File(ROOT_RULES_PATH),
        gacha: sha256File(GACHA_RULES_PATH)
      };
      console.log(`END SHA-256 database.rules.json ${endHashes.root}`);
      console.log(`END SHA-256 games/gacha/database.rules.json ${endHashes.gacha}`);
      if (endHashes.root !== startHashes.root || endHashes.gacha !== startHashes.gacha) {
        console.error('ERROR: 검증 중 tracked rules 파일의 SHA-256이 변경되었습니다.');
        failed = true;
      } else {
        console.log('PASS integrity: tracked rules hashes unchanged');
      }
    } catch (error) {
      console.error(`ERROR: 종료 SHA-256 확인 실패: ${error.message}`);
      failed = true;
    }
  }

  process.exitCode = failed ? 1 : 0;
}

const runIndex = process.argv.indexOf('--run');
if (runIndex >= 0) {
  await runRuleChecks(process.argv[runIndex + 1]);
} else {
  await runVerifier();
}
