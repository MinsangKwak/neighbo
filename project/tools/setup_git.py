#!/usr/bin/env python3
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
START = '# neighbo managed ignore begin'
END = '# neighbo managed ignore end'
RULES = '''node_modules/
.env
.env.*
!.env.example
.next/
out/
dist/
coverage/
*.tsbuildinfo
next-env.d.ts
__pycache__/
backend-node/src/generated/
backend-node/.data/
project/tests/frontend-react/test-results/
project/tests/frontend-react/playwright-report/'''


def main():
    result = subprocess.run(['git', 'rev-parse', '--git-path', 'info/exclude'], cwd=ROOT, check=True, capture_output=True, text=True)
    path = Path(result.stdout.strip())
    if not path.is_absolute():
        path = ROOT / path
    previous = path.read_text() if path.exists() else ''
    if (START in previous) != (END in previous):
        raise SystemExit('기존 neighbo 제외 블록의 시작·끝을 확인해 주세요.')
    block = f'{START}\n{RULES}\n{END}'
    if START in previous:
        updated = re.sub(re.escape(START) + r'.*?' + re.escape(END), lambda _: block, previous, flags=re.S)
    else:
        updated = previous.rstrip() + '\n\n' + block + '\n'
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(updated)
    print('Git 제외 규칙을 활성화했습니다. 기존 제외 규칙과 hooks 설정은 유지합니다.')


if __name__ == '__main__':
    main()
