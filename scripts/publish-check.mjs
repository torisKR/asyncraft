import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const canonical = 'https://github.com/torisKR/asyncraft';
const checks = [];
const log = [];
const npmConfigPath = join(mkdtempSync(join(tmpdir(), 'asyncraft-npm-config-XXXXXX')), '.npmrc');

function expect(condition, message) {
  if (condition) {
    log.push(`[ok] ${message}`);
    return;
  }
  checks.push(`[fail] ${message}`);
}

function runNpm(cmd, extraEnv = {}) {
  return execSync(`npm ${cmd}`, {
    encoding: 'utf8',
    env: {
      ...process.env,
      NPM_CONFIG_USERCONFIG: npmConfigPath,
      ...extraEnv,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function withTempNpmConfig(token, fn) {
  try {
    writeFileSync(npmConfigPath, `//registry.npmjs.org/:_authToken=${token}\nstrict-ssl=true\n`);
    return fn();
  } finally {
    try {
      rmSync(npmConfigPath, { force: true });
    } catch (error) {
      // best effort cleanup
    }
  }
}

expect(
  pkg.repository?.url === `git+${canonical}.git`,
  `repository.url is canonical (got ${pkg.repository?.url})`,
);
expect(pkg.bugs?.url === `${canonical}/issues`, `bugs.url is canonical (got ${pkg.bugs?.url})`);
expect(pkg.homepage === `${canonical}#readme`, `homepage is canonical (got ${pkg.homepage})`);

const token = process.env.NPM_TOKEN;
expect(!!token, 'NPM_TOKEN is set');

if (token) {
  withTempNpmConfig(token, () => {
    try {
      const username = runNpm('whoami');
      log.push(`[ok] npm token resolves to ${username}`);

      if (pkg.name) {
        try {
          const latest = runNpm(`view ${pkg.name} dist-tags.latest --json`);
          log.push(`[ok] npm latest tag is ${latest}`);
        } catch (e) {
          checks.push(`[fail] cannot read npm dist-tags for ${pkg.name}`);
        }

        try {
          const collaborators = runNpm(`access ls-collaborators ${pkg.name} --json`);
          const parsed = JSON.parse(collaborators);
          const hasTokenUser = Object.keys(parsed).some((name) => name === username);
          expect(hasTokenUser, `token user has collaborator access to ${pkg.name}`);
        } catch (e) {
          log.push(
            `[warn] collaborator check unavailable for ${pkg.name} (skipping publish entitlement check)`,
          );
        }

        try {
          const version = runNpm(`view ${pkg.name}@${pkg.version} version --json`);
          if (version.includes(pkg.version)) {
            checks.push(
              `[fail] version ${pkg.version} already exists on npm registry (${pkg.name})`,
            );
          }
        } catch (e) {
          log.push(`[ok] version ${pkg.version} does not yet exist on npm`);
        }
      }
    } catch (error) {
      checks.push(`[fail] npm token verification command failed: ${error.message}`);
    }
  });
}

for (const row of log) {
  console.log(row);
}
for (const row of checks) {
  console.error(row);
}

if (checks.length > 0) {
  console.error(`[publish-check] failed with ${checks.length} issue(s).`);
  process.exit(1);
}

console.log('[publish-check] ready to publish.');
