import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const previous = process.env.VERCEL_GIT_PREVIOUS_SHA;
if (!previous || !/^[a-f0-9]{40}$/i.test(previous)) process.exit(1);

const cwd = fileURLToPath(new URL('../../', import.meta.url));
const run = (args) => spawnSync('git', args, { cwd, stdio: 'ignore' });
if (run(['cat-file', '-e', `${previous}^{commit}`]).status !== 0) process.exit(1);

const paths = [
  'frontend-react',
  'project/shared-schema',
  'project/package.json',
  'project/package-lock.json',
  'project/tsconfig.base.json',
  'project/.nvmrc',
  'project/tools/vercel-ignore.mjs',
];
process.exit(run(['diff', '--quiet', previous, 'HEAD', '--', ...paths]).status === 0 ? 0 : 1);
