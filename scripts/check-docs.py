#!/usr/bin/env python3
# 저장소의 마크다운 문서를 검사한다 — 깨진 상대 링크 · 없는 앵커 · 열 수가 어긋난 표
# 사용법: python3 scripts/check-docs.py  (저장소 루트에서, 문제가 있으면 종료 코드 1)
import os
import re
import sys
import unicodedata

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
SKIP_DIRS = {'.git', 'node_modules'}


def github_slug(heading):
    # GitHub 앵커 규칙: 소문자, 글자·숫자·공백·하이픈·밑줄만 남기고 공백은 하이픈으로
    text = heading.strip().lower().replace('`', '')
    kept = ''.join(c for c in text if c in '-_ ' or unicodedata.category(c)[0] in 'LN')
    return kept.replace(' ', '-')


def markdown_files():
    for base, dirs, files in os.walk(ROOT):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        for name in files:
            if name.endswith('.md'):
                yield os.path.join(base, name)


def outside_code(lines):
    # 코드 블록 안의 줄은 건너뛰고 (줄 번호, 줄)을 돌려준다
    in_code = False
    for number, line in enumerate(lines, 1):
        if line.startswith('```'):
            in_code = not in_code
            continue
        if not in_code:
            yield number, line


def collect_anchors(path):
    anchors, seen = set(), {}
    for _, line in outside_code(open(path, encoding='utf-8').read().split('\n')):
        match = re.match(r'^#{1,6}\s+(.*)', line)
        if match:
            slug = github_slug(match.group(1))
            count = seen.get(slug, 0)
            seen[slug] = count + 1
            anchors.add(slug if count == 0 else f'{slug}-{count}')
    return anchors


def table_cell_count(line):
    # 코드 조각 안의 | 와 이스케이프된 \| 는 칸 구분자가 아니다
    line = re.sub(r'`[^`]*`', 'C', line.strip()).replace('\\|', '')
    return len(line.strip('|').split('|'))


def main():
    files = list(markdown_files())
    anchors = {path: collect_anchors(path) for path in files}
    problems = []
    for path in files:
        rel = os.path.relpath(path, ROOT)
        lines = open(path, encoding='utf-8').read().split('\n')
        header_cells = None
        for number, line in outside_code(lines):
            # 링크 검사
            for target in re.findall(r'\]\(([^)\s]+)\)', line):
                if target.startswith(('http://', 'https://', 'mailto:')):
                    continue
                file_part, _, anchor = target.partition('#')
                dest = os.path.normpath(os.path.join(os.path.dirname(path), file_part)) if file_part else path
                if not os.path.exists(dest):
                    problems.append(f'{rel}:{number} 없는 파일 → {target}')
                elif anchor and dest.endswith('.md') and anchor not in anchors.get(dest, set()):
                    problems.append(f'{rel}:{number} 없는 앵커 → {target}')
            # 표 검사 — 머리줄과 열 수가 다른 행
            if line.strip().startswith('|'):
                cells = table_cell_count(line)
                if header_cells is None:
                    header_cells = cells
                elif cells != header_cells:
                    problems.append(f'{rel}:{number} 표 열 수 {cells} (머리줄 {header_cells})')
            else:
                header_cells = None
    for problem in problems:
        print(problem)
    print(f'문서 {len(files)}개 검사 · 문제 {len(problems)}건')
    return 1 if problems else 0


if __name__ == '__main__':
    sys.exit(main())
