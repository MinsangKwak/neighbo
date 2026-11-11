#!/usr/bin/env python3
# 수용 조건(AC)마다 그 번호를 단 테스트가 있는지 센다
# 사용법: python3 scripts/check-ac.py  (저장소 루트에서. 실패로 끝나지 않는다 — 빈 곳을 보여 줄 뿐이다)
#
# 세는 것은 "번호가 적혀 있는가"다. 번호가 있다고 조건 전체를 확인한다는 보장은 아니고,
# 번호 없이 확인하는 테스트도 있을 수 있다. 빈 곳을 찾는 출발점으로 쓴다
import glob
import os
import re

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
SOURCE = re.compile(r'\.(tsx?|mjs|ya?ml|css|sql|prisma)$')
SKIP = ('node_modules', '.next', 'generated', 'spikes', 'test-results', 'playwright-report')


def spec_conditions():
    found = {}
    for path in sorted(glob.glob(os.path.join(ROOT, 'docs/features/*.md'))):
        for line in open(path, encoding='utf-8'):
            match = re.match(r'\| (AC-[A-Z]+-\d+[a-z]?) \| ([^|]*)', line)
            if match:
                found[match.group(1)] = match.group(2).strip()
    return found


def numbers_in(text):
    # "AC-PD-11, 12" · "AC-CM-23~26" 처럼 줄여 쓴 것도 푼다
    out = set()
    for match in re.finditer(r'AC-([A-Z]+)-(\d+[a-z]?)((?:\s*[,·~]\s*\d+[a-z]?)*)', text):
        prefix, previous = match.group(1), match.group(2)
        out.add(f'AC-{prefix}-{previous}')
        for separator, number in re.findall(r'([,·~])\s*(\d+[a-z]?)', match.group(3)):
            if separator == '~' and previous.isdigit() and number.isdigit():
                out.update(f'AC-{prefix}-{k:02d}' for k in range(int(previous), int(number) + 1))
            out.add(f'AC-{prefix}-{number}')
            previous = number
    return out


def main():
    spec = spec_conditions()
    tested, mentioned = set(), set()
    for path in glob.glob(os.path.join(ROOT, '**/*'), recursive=True):
        relative = os.path.relpath(path, ROOT)
        if not os.path.isfile(path) or any(part in relative.split(os.sep) for part in SKIP):
            continue
        if not SOURCE.search(relative) and 'Dockerfile' not in relative:
            continue
        numbers = numbers_in(open(path, encoding='utf-8', errors='ignore').read())
        is_test = '.test.' in relative or f'{os.sep}e2e{os.sep}' in relative
        (tested if is_test else mentioned).update(numbers)

    conditions = set(spec)
    code_only = sorted((conditions & mentioned) - tested)
    nowhere = sorted(conditions - tested - mentioned)
    covered = len(conditions & tested)
    print(f'수용 조건 {len(conditions)}개 · 번호를 단 테스트 있음 {covered}개 ({covered * 100 // max(1, len(conditions))}%)'
          f' · 코드에만 {len(code_only)}개 · 어디에도 없음 {len(nowhere)}개')
    for title, group in (('코드에만 번호가 있는 조건', code_only), ('번호가 어디에도 없는 조건', nowhere)):
        if group:
            print(f'\n{title}')
            for number in group:
                print(f'  {number}  {spec[number][:70]}')


if __name__ == '__main__':
    main()
