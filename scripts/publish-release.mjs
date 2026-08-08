import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

const token = process.env.NPM_TOKEN;
if (!token) {
  console.error('[fail] NPM_TOKEN is not set.');
  process.exit(1);
}

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const npmConfigPath = join(mkdtempSync(join(tmpdir(), 'asyncraft-npm-config-XXXXXX')), '.npmrc');

try {
  writeFileSync(npmConfigPath, `//registry.npmjs.org/:_authToken=${token}\nstrict-ssl=true\n`);
  execSync('npm publish --access public', {
    stdio: 'inherit',
    env: {
      ...process.env,
      NPM_CONFIG_USERCONFIG: npmConfigPath,
    },
  });
  console.log(`[publish-release] published ${pkg.name}@${pkg.version}`);
} catch (error) {
  console.error('[publish-release] failed:', error.message || String(error));
  process.exit(1);
} finally {
  try {
    rmSync(npmConfigPath, { force: true });
  } catch {
    // ignore cleanup failures
  }
}
