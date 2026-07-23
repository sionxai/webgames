import { createReadStream } from 'node:fs';
import { copyFile, mkdir, readdir, readFile, realpath, stat, writeFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import type { Plugin, ResolvedConfig } from 'vite';

interface StaticGame {
  id: string;
  dir: string;
  exclude: readonly string[];
}

const STATIC_GAMES = [
  {
    id: 'bakara',
    dir: 'games/bakara',
    exclude: ['firebase.json', 'vercel.json', 'firestore.rules', 'firestore.indexes.json']
  },
  {
    id: 'gacha',
    dir: 'games/gacha',
    exclude: [
      'functions/**',
      'node_modules/**',
      '*.md',
      'package.json',
      'package-lock.json',
      'eslint.config*',
      'test-*.js',
      '.env*'
    ]
  },
  { id: 'life-rpg', dir: 'games/life-rpg/out', exclude: [] }
] as const satisfies readonly StaticGame[];

const MIME_TYPES: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.ogg': 'audio/ogg',
  '.otf': 'font/otf',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.wasm': 'application/wasm',
  '.wav': 'audio/wav',
  '.webm': 'video/webm',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.xml': 'application/xml; charset=utf-8'
};

function isNotFound(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('code' in error)) return false;
  const code = (error as { code?: string }).code;
  return code === 'ENOENT' || code === 'ENOTDIR';
}

function isInside(root: string, candidate: string): boolean {
  return candidate === root || candidate.startsWith(`${root}${sep}`);
}

function matchesGlob(pathname: string, pattern: string): boolean {
  if (pattern.endsWith('/**')) {
    const directory = pattern.slice(0, -3);
    return pathname === directory || pathname.startsWith(`${directory}/`);
  }

  let expression = '^';
  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index];
    if (character === '*') {
      expression += '[^/]*';
    } else if ('\\^$.*+?()[]{}|'.includes(character)) {
      expression += `\\${character}`;
    } else {
      expression += character;
    }
  }
  expression += '$';
  return new RegExp(expression).test(pathname);
}

const PORTAL_NAV_TAG = '<script src="/hanpan-nav.js" defer></script>';

/**
 * 게임 HTML에 포털 복귀 버튼 스크립트를 넣는다.
 * 게임 원본 파일은 건드리지 않고 서빙·복사 시점에만 주입하므로,
 * 외부 게임을 재빌드하거나 교체해도 버튼이 유지된다.
 */
function withPortalNav(html: string): string {
  if (html.includes('/hanpan-nav.js')) return html;
  if (html.includes('</body>')) {
    return html.replace('</body>', `  ${PORTAL_NAV_TAG}\n</body>`);
  }
  return `${html}\n${PORTAL_NAV_TAG}\n`;
}

async function copyDirectory(
  sourceDirectory: string,
  targetDirectory: string,
  exclude: readonly string[],
  relativeDirectory = ''
): Promise<void> {
  await mkdir(targetDirectory, { recursive: true });
  const entries = await readdir(sourceDirectory, { withFileTypes: true });

  for (const entry of entries) {
    const relativePath = relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name;
    if (exclude.some((pattern) => matchesGlob(relativePath, pattern))) continue;

    const sourcePath = resolve(sourceDirectory, entry.name);
    const targetPath = resolve(targetDirectory, entry.name);
    if (entry.isDirectory()) {
      await copyDirectory(sourcePath, targetPath, exclude, relativePath);
    } else if (entry.isFile()) {
      if (extname(entry.name).toLowerCase() === '.html') {
        await writeFile(targetPath, withPortalNav(await readFile(sourcePath, 'utf8')), 'utf8');
      } else {
        await copyFile(sourcePath, targetPath);
      }
    }
  }
}

export function staticGamesPlugin(): Plugin {
  let resolvedConfig: ResolvedConfig;

  return {
    name: 'static-games',
    configResolved(config) {
      resolvedConfig = config;
    },
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        if (request.method !== 'GET' && request.method !== 'HEAD') {
          next();
          return;
        }

        const rawPath = (request.url ?? '').split(/[?#]/, 1)[0];
        let pathname: string;
        try {
          pathname = decodeURIComponent(rawPath);
        } catch {
          const targetsStaticGame = STATIC_GAMES.some(({ id }) => {
            const route = `/games/${id}`;
            return rawPath === route || rawPath.startsWith(`${route}/`);
          });
          if (!targetsStaticGame) {
            next();
            return;
          }
          response.statusCode = 400;
          response.end('Malformed URL');
          return;
        }

        const game = STATIC_GAMES.find(({ id }) => {
          const route = `/games/${id}`;
          return pathname === route || pathname.startsWith(`${route}/`);
        });
        if (!game) {
          next();
          return;
        }

        const route = `/games/${game.id}`;
        const relativePath = pathname === route ? '' : pathname.slice(route.length + 1);
        if (
          relativePath.includes('\\') ||
          relativePath.includes('\0') ||
          relativePath.split('/').includes('..')
        ) {
          response.statusCode = 403;
          response.end('Forbidden');
          return;
        }

        let sourceRoot: string;
        try {
          sourceRoot = await realpath(resolve(server.config.root, game.dir));
        } catch (error) {
          if (isNotFound(error)) {
            next();
            return;
          }
          next(error);
          return;
        }

        let filePath = resolve(sourceRoot, relativePath || '.');
        if (!isInside(sourceRoot, filePath)) {
          response.statusCode = 403;
          response.end('Forbidden');
          return;
        }

        try {
          let fileStats = await stat(filePath);
          if (fileStats.isDirectory()) {
            filePath = resolve(filePath, 'index.html');
            fileStats = await stat(filePath);
          }
          if (!fileStats.isFile()) {
            next();
            return;
          }

          const canonicalFilePath = await realpath(filePath);
          if (!isInside(sourceRoot, canonicalFilePath)) {
            response.statusCode = 403;
            response.end('Forbidden');
            return;
          }

          const extension = extname(canonicalFilePath).toLowerCase();
          response.statusCode = 200;
          response.setHeader(
            'Content-Type',
            MIME_TYPES[extension] ?? 'application/octet-stream'
          );

          // HTML은 포털 복귀 버튼을 주입해야 하므로 스트리밍 대신 본문을 조립한다.
          if (extension === '.html') {
            const html = withPortalNav(await readFile(canonicalFilePath, 'utf8'));
            const body = Buffer.from(html, 'utf8');
            response.setHeader('Content-Length', body.byteLength);
            response.end(request.method === 'HEAD' ? undefined : body);
            return;
          }

          response.setHeader('Content-Length', fileStats.size);
          if (request.method === 'HEAD') {
            response.end();
            return;
          }

          const stream = createReadStream(canonicalFilePath);
          stream.on('error', next);
          stream.pipe(response);
        } catch (error) {
          if (isNotFound(error)) {
            next();
            return;
          }
          next(error);
        }
      });
    },
    async closeBundle() {
      const outputRoot = resolve(resolvedConfig.root, resolvedConfig.build.outDir, 'games');

      for (const game of STATIC_GAMES) {
        const sourceDirectory = resolve(resolvedConfig.root, game.dir);
        let sourceStats;
        try {
          sourceStats = await stat(sourceDirectory);
        } catch (error) {
          if (!isNotFound(error)) throw error;
          console.warn(`[static-games] Skipping ${game.id}: source directory not found at ${sourceDirectory}`);
          continue;
        }

        if (!sourceStats.isDirectory()) {
          console.warn(`[static-games] Skipping ${game.id}: source is not a directory at ${sourceDirectory}`);
          continue;
        }

        await copyDirectory(sourceDirectory, resolve(outputRoot, game.id), game.exclude);
      }
    }
  };
}
