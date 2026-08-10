import { spawn, spawnSync } from 'node:child_process';
import { accessSync, constants, existsSync, unlinkSync } from 'node:fs';

const PROJECT_ID = 'demo-bonpuri';
const NAMESPACE = 'demo-bonpuri-default-rtdb';
const EMULATOR_URL = 'http://127.0.0.1:9000';
const JAVA_BIN_CANDIDATES = [
  '/opt/homebrew/opt/openjdk@21/bin',
  '/opt/homebrew/opt/openjdk/bin',
];
const DEBUG_LOG_FILES = [
  'database-debug.log',
  'firebase-debug.log',
  'ui-debug.log',
];

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const now = Math.floor(Date.now() / 1000);
const token = (uid) =>
  `${b64({ alg: 'none', kid: 'fakekid', type: 'JWT' })}.${b64({
    iss: 'https://securetoken.google.com/demo-bonpuri',
    aud: 'demo-bonpuri',
    auth_time: now,
    user_id: uid,
    sub: uid,
    iat: now,
    exp: now + 3600,
    firebase: { identities: {}, sign_in_provider: 'anonymous' },
  })}.`;

function findJavaBinDirectory() {
  for (const directory of JAVA_BIN_CANDIDATES) {
    try {
      accessSync(`${directory}/java`, constants.X_OK);
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
    'Java를 찾을 수 없습니다. Homebrew openjdk@21/openjdk를 설치하거나 java를 PATH에 추가해 주세요.',
  );
}

function shellQuote(value) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function cleanupDebugLogs() {
  const failures = [];

  for (const fileName of DEBUG_LOG_FILES) {
    const filePath = `${process.cwd()}/${fileName}`;
    if (!existsSync(filePath)) {
      continue;
    }

    try {
      unlinkSync(filePath);
    } catch (error) {
      failures.push(`${fileName}: ${error.message}`);
    }
  }

  return failures;
}

async function runWithEmulator() {
  let javaBinDirectory;

  try {
    javaBinDirectory = findJavaBinDirectory();
  } catch (error) {
    console.error(`ERROR: ${error.message}`);
    process.exitCode = 1;
    return;
  }

  console.log(
    `JDK: ${javaBinDirectory === null ? 'PATH의 java' : `${javaBinDirectory}/java`}`,
  );

  const childEnvironment = { ...process.env };
  if (javaBinDirectory !== null) {
    childEnvironment.PATH = `${javaBinDirectory}:${childEnvironment.PATH ?? ''}`;
  }

  const runCommand = `${shellQuote(process.execPath)} ${shellQuote(process.argv[1])} --run`;
  const child = spawn(
    'firebase',
    [
      'emulators:exec',
      '--only',
      'database',
      '--project',
      PROJECT_ID,
      runCommand,
    ],
    {
      env: childEnvironment,
      stdio: 'inherit',
    },
  );

  const outcome = await new Promise((resolve) => {
    let settled = false;
    const settle = (result) => {
      if (!settled) {
        settled = true;
        resolve(result);
      }
    };

    child.once('error', (error) => settle({ error }));
    child.once('exit', (code, signal) => settle({ code, signal }));
  });

  const cleanupFailures = cleanupDebugLogs();
  for (const failure of cleanupFailures) {
    console.error(`ERROR: 디버그 로그를 지우지 못했습니다 (${failure})`);
  }

  if (outcome.error) {
    console.error(`ERROR: Firebase 에뮬레이터를 실행하지 못했습니다: ${outcome.error.message}`);
    process.exitCode = 1;
    return;
  }

  if (outcome.signal) {
    console.error(`ERROR: Firebase 에뮬레이터가 ${outcome.signal} 신호로 종료되었습니다.`);
    try {
      process.kill(process.pid, outcome.signal);
    } catch {
      process.exitCode = 1;
    }
    return;
  }

  process.exitCode = outcome.code ?? 1;
  if (cleanupFailures.length > 0 && process.exitCode === 0) {
    process.exitCode = 1;
  }
}

function requestUrl(path, authToken) {
  const baseUrl = `${EMULATOR_URL}/${path}.json?ns=${NAMESPACE}`;
  return authToken === undefined
    ? baseUrl
    : `${baseUrl}&auth=${encodeURIComponent(authToken)}`;
}

async function requestStatus({ path, method, authToken, body }) {
  const init = { method };
  if (body !== undefined) {
    init.headers = { 'content-type': 'application/json' };
    init.body = JSON.stringify(body);
  }

  const response = await fetch(requestUrl(path, authToken), init);
  await response.arrayBuffer();
  return response.status;
}

function savePath(uid, gameId) {
  return `portal/saves/${uid}/${gameId}`;
}

function record(schema, payload = '{}') {
  return {
    payload,
    updatedAt: Date.now(),
    schema,
    device: 'rules001',
  };
}

async function observe(label, expected, request) {
  try {
    return {
      label,
      expected,
      actual: await requestStatus(request),
    };
  } catch (error) {
    return {
      label,
      expected,
      error: error.message,
    };
  }
}

function formatObservation(observation) {
  if (observation.error !== undefined) {
    return `${observation.label} 오류: ${observation.error}`;
  }
  if (observation.actual !== observation.expected) {
    return `${observation.label} ${observation.actual} (기대 ${observation.expected})`;
  }
  return `${observation.label} ${observation.actual}`;
}

async function runRuleChecks() {
  const ownerUid = 'bonpuri-owner';
  const otherUid = 'bonpuri-other';
  const ownerToken = token(ownerUid);
  const otherToken = token(otherUid);
  const bonpuriPath = savePath(ownerUid, 'bonpuri');

  const cases = [
    {
      name: '본인 UID · bonpuri · schema 3 쓰기',
      run: () => [
        observe('쓰기', 200, {
          path: bonpuriPath,
          method: 'PUT',
          authToken: ownerToken,
          body: record(3),
        }),
      ],
    },
    {
      name: '본인 UID · bonpuri 읽기',
      run: () => [
        observe('읽기', 200, {
          path: bonpuriPath,
          method: 'GET',
          authToken: ownerToken,
        }),
      ],
    },
    {
      name: '비로그인 · bonpuri 읽기·쓰기',
      run: () => [
        observe('읽기', 401, {
          path: bonpuriPath,
          method: 'GET',
        }),
        observe('쓰기', 401, {
          path: bonpuriPath,
          method: 'PUT',
          body: record(3),
        }),
      ],
    },
    {
      name: '타 UID · bonpuri 읽기·쓰기',
      run: () => [
        observe('읽기', 401, {
          path: bonpuriPath,
          method: 'GET',
          authToken: otherToken,
        }),
        observe('쓰기', 401, {
          path: bonpuriPath,
          method: 'PUT',
          authToken: otherToken,
          body: record(3),
        }),
      ],
    },
    {
      name: '알 수 없는 게임 ID',
      run: () => [
        observe('읽기', 401, {
          path: savePath(ownerUid, 'unknowngame'),
          method: 'GET',
          authToken: ownerToken,
        }),
        observe('쓰기', 401, {
          path: savePath(ownerUid, 'unknowngame'),
          method: 'PUT',
          authToken: ownerToken,
          body: record(3),
        }),
      ],
    },
    {
      name: '본인 UID · bonpuri · schema 2 쓰기',
      run: () => [
        observe('쓰기', 401, {
          path: bonpuriPath,
          method: 'PUT',
          authToken: ownerToken,
          body: record(2),
        }),
      ],
    },
    {
      name: '본인 UID · bonpuri · payload 199,999자',
      run: () => [
        observe('쓰기', 200, {
          path: bonpuriPath,
          method: 'PUT',
          authToken: ownerToken,
          body: record(3, 'x'.repeat(199_999)),
        }),
      ],
    },
    {
      name: '본인 UID · bonpuri · payload 200,000자',
      run: () => [
        observe('쓰기', 401, {
          path: bonpuriPath,
          method: 'PUT',
          authToken: ownerToken,
          body: record(3, 'x'.repeat(200_000)),
        }),
      ],
    },
    {
      name: '본인 UID · forge · schema 1 쓰기',
      run: () => [
        observe('쓰기', 200, {
          path: savePath(ownerUid, 'forge'),
          method: 'PUT',
          authToken: ownerToken,
          body: record(1),
        }),
      ],
    },
    {
      name: '본인 UID · waitdog · schema 2 쓰기',
      run: () => [
        observe('쓰기', 200, {
          path: savePath(ownerUid, 'waitdog'),
          method: 'PUT',
          authToken: ownerToken,
          body: record(2),
        }),
      ],
    },
  ];

  let passed = 0;

  for (const [index, testCase] of cases.entries()) {
    const observations = await Promise.all(testCase.run());
    const success = observations.every(
      (observation) =>
        observation.error === undefined && observation.actual === observation.expected,
    );
    const details = observations.map(formatObservation).join(', ');

    if (success) {
      passed += 1;
      console.log(`PASS ${index + 1}. ${testCase.name} (${details})`);
    } else {
      console.error(`FAIL ${index + 1}. ${testCase.name} (${details})`);
    }
  }

  console.log(`결과: ${passed}/${cases.length} 통과`);
  if (passed !== cases.length) {
    process.exitCode = 1;
  }
}

if (process.argv.includes('--run')) {
  await runRuleChecks();
} else {
  await runWithEmulator();
}
