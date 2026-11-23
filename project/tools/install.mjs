import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error('npm --prefix project run setup으로 실행해 주세요.');

for (const [name, path] of [['공유 계약·검사 도구', '../'], ['백엔드', '../../backend-node/'], ['프론트엔드', '../../frontend-react/']]) {
  process.stdout.write(`\n${name} 의존성을 설치합니다.\n`);
  const result = spawnSync(process.execPath, [npmCli, 'ci'], {
    cwd: fileURLToPath(new URL(path, import.meta.url)),
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
