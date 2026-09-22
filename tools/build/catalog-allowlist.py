#!/usr/bin/env python
# -*- coding: utf-8 -*-
# [LOOP-AUDIT #6] 이 파일을 고칠 때 Bash 히어독으로 파이썬/정규식을 쓰지 말 것 —
# 셸이 역슬래시 이스케이프를 먹어 정규식이 조용히 망가진다(사고 3회). Write/Edit 로 고친다.
u"""catalog-allowlist.py — 배포본에 실을 `catalog/` 파일 **허용 목록** 생성기.

왜 (판정판 35 · tentwin/notes/CATALOG-RETIRE-0910.md 「부수 발견」):
  `build-dist.py` 에는 catalog 포함/제외 목록이 없어 `site/catalog/` 549파일 34MB 를
  **통째로** 복사했다. 게임도 관제탑도 부르지 않는 파일이 GitHub Pages·itch 배포본에
  그대로 실려 나갔다. 이 도구는 「누가 부르는가」를 실측해 허용 목록을 만든다.

**포함(union) 3갈래 — 하나라도 걸리면 배포한다.** 근거는 파일마다 문자열로 남긴다.

  ① 게임 런타임 (reason `game:*`)
     · `tentwin.html` 의 **주석 제거본** 안 `catalog/…` URL·JS 문자열
       (주석은 브라우저가 한 바이트도 안 읽는다 — 롤백 「봉인」 줄과 산문이 거기 있다.
        판정 로직은 `tools/measure/components-gate.py` 의 `_blank_comments` 와 같다.)
     · `<script id="catalog-preload">` 의 데우기 목록 전개 → `catalog/<n>.webp`
     · `sw.js` SHELL 캐시 키
     · `tentwin.webmanifest` 의 icons·screenshots
     · `index.html`(랜딩) 의 og·favicon·apple-touch 를 포함한 `catalog/…`
     · `critical-split.py` 가 배포 시점에 **base64 → catalog 참조**로 바꾸는 대상
       (md5 가 같은 파일. 빠지면 404 는 아니지만 첫 화면 경량화가 되돌아간다.)

  ② 관제탑 (reason `board:*`) — `site/board/**` 는 **일부러 배포한다**(판정판을 그 URL 로 본다).
     · `site/board/**` 의 html·js·json·css 안 `catalog/…`
     · 배포되는 루트 판정·창고 페이지(BOARD.html·kit.html·FACTORY-DASHBOARD.html 등)
     · 동적 조립: `BOARD.html pvSrc()` = `catalog/<dir>/<file>`  ← `_css-previews/index.json`
       · `previews-v2/index.json`
     · 동적 조립: `'catalog/'+f.file` ← `catalog/manifest.json` · `board-data.json` ·
       `board/board-frames.json` (BOARD.html 자산 뷰가 항목마다 <img> 를 실제로 띄운다)

  ③ 바깥 배포 고정핀 (reason `publish:pin`)
     `publish/play/twa-manifest.json` 이 **배포된 절대 URL**로 PWA 아이콘을 가리킨다.
     저장소 밖 소비자라 스캔으로는 안 잡히므로 이름을 못박는다. `--publish` 를 주면
     실제로 그 목록이 핀을 벗어나지 않는지 **검사**한다(핀이 낡으면 exit 1).

**제외(무조건)** — 위 union 에 걸려도 뺀다:
  `_retired/` · `_superseded/` 아래 전부, `*.bak` · `*.bak-*` · `*.bak.*` · `*.lowres.bak`.

**참조로 치지 않는 것**(근거):
  · `board/board-candidates.js`(GF_CANDIDATES) — 자동생성 **재고 열거**다. 소비처
    `board-factory.js` 는 값을 `<option value>` 문자열로만 쓰고 HTTP 요청을 하지 않는다.
    이것을 참조로 세면 카탈로그 전량이 허용돼 목록의 뜻이 없어진다.
  · 문서(`*.md`) 산문 언급 · `*.bak.html` 옛 게임본.
  · `publish/itch/_build/` — **자기 catalog 사본**(280파일)을 들고 있다. 거기 `catalog/…`
    는 그 번들 안을 가리키지 site/catalog 를 가리키지 않는다.

사용:
  python tools/build/catalog-allowlist.py --site . --out tools/build/catalog.allow.json
  python tools/build/catalog-allowlist.py --site . --print-deny      # 제외 목록을 크기순으로
  python tools/build/catalog-allowlist.py --site . --publish ../publish   # 핀 검사까지

`build-dist.py` 는 이 파일을 **모듈로 불러** 빌드 시점에 목록을 다시 계산한다
(커밋된 json 이 낡아도 배포가 깨지지 않는다). json 은 사람이 읽는 증거·감사용이다.

종료 코드: 0 = 성공 · 1 = 핀 검사 실패 · 2 = 입력 없음.
"""
from __future__ import print_function

import argparse
import base64
import hashlib
import io
import json
import os
import re
import sys
import time

try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass

# ── 상수 ────────────────────────────────────────────────────────────────────
# 확장자를 열거하지 않는다(오디오·폰트·json·css·js 가 카탈로그에 함께 산다).
REF_RE = re.compile(r"catalog/([A-Za-z0-9_@%\-][A-Za-z0-9_@%./\-]*\.[A-Za-z0-9]{1,6})", re.I)
DATA_URL_RE = re.compile(r"url\(([\"']?)data:image/[a-z+.\-]+;base64,([A-Za-z0-9+/=]+)\1\)", re.I)
_JS_LINE_COMMENT_RE = re.compile(r"(?:^|(?<=[\s;{}()=,]))//[^\n]*", re.M)
_BLOCK_COMMENT_RE = re.compile(r"/\*.*?\*/", re.S)

# 무조건 제외 — 은퇴·밀려난 판·백업
DENY_DIRS = ('_retired', '_superseded')
DENY_FILE_RE = re.compile(r"(\.bak$|\.bak[.\-]|\.bak-)", re.I)

# 바깥(배포 URL) 소비자가 이름을 들고 있어 스캔으로 안 잡히는 것 — `publish:pin`
PUBLISH_PINS = (
    'pwa-icon-512.png',
    'pwa-icon-512-maskable.png',
)

# 관제탑으로 함께 배포되는 루트 페이지·데이터(=board 근거로 센다)
BOARD_ROOT_FILES = (
    'BOARD.html', 'kit.html', 'FACTORY-DASHBOARD.html', 'SPEC-SITE.html',
    'AUDIO-AUDITION.html', 'privacy.html',
    'board-data.json', 'usage-map.json', 'staging.json',
)
BOARD_EXTS = ('.html', '.js', '.json', '.css')
# `'catalog/'+f.file` 로 조립되는 장부 — 값이 실제 카탈로그 파일이면 허용
FILE_FIELD_JSONS = (
    ('catalog/manifest.json', 'board:manifest.json 자산 뷰 <img>'),
    ('board-data.json', 'board:board-data.json file 값'),
    ('board/board-data.json', 'board:board/board-data.json file 값'),
    ('board/board-frames.json', 'board:board-frames.json file 값'),
    ('catalog/kit-registry.json', 'board:kit-registry.json file 값'),
)
# BOARD.html pvSrc(p) = 'catalog/'+(p.dir||'_css-previews')+'/'+p.file
PREVIEW_INDEXES = (
    ('catalog/_css-previews/index.json', '_css-previews'),
    ('catalog/previews-v2/index.json', 'previews-v2'),
)


# ── 주석 제거 (components-gate.py `_blank_comments` 와 같은 상태기계) ────────
def blank_comments(text):
    u"""브라우저가 안 읽는 곳(주석)을 공백으로 지운다 — 구역을 가른 뒤에 지운다.

    <!--…--> 전역 · /*…*/ 는 <style>·<script> 안 · //… 는 <script> 안.
    문자열 안의 `/*` 같은 경계 사례는 근사이며, 근사의 방향은 「구역 밖은 안 건드리기」다.
    """
    N = len(text)
    low = text.lower()
    buf = list(text)

    def blank(a, b):
        for i in range(max(a, 0), min(b, N)):
            if buf[i] != '\n':
                buf[i] = ' '

    style_spans, script_spans = [], []
    p = 0
    while p < N:
        if low.startswith('<!--', p):
            e = low.find('-->', p + 4)
            e = N if e == -1 else e + 3
            blank(p, e); p = e; continue
        if low.startswith('<script', p) and (p + 7 >= N or not (low[p + 7].isalnum() or low[p + 7] == '-')):
            gt = low.find('>', p)
            if gt == -1:
                break
            e = low.find('</script>', gt + 1)
            script_spans.append((gt + 1, N if e == -1 else e))
            p = N if e == -1 else e + len('</script>'); continue
        if low.startswith('<style', p) and (p + 6 >= N or not (low[p + 6].isalnum() or low[p + 6] == '-')):
            gt = low.find('>', p)
            if gt == -1:
                break
            e = low.find('</style>', gt + 1)
            style_spans.append((gt + 1, N if e == -1 else e))
            p = N if e == -1 else e + len('</style>'); continue
        p += 1

    for s, e in style_spans + script_spans:
        for m in _BLOCK_COMMENT_RE.finditer(text, s, e):
            blank(m.start(), m.end())
    for s, e in script_spans:
        for m in _JS_LINE_COMMENT_RE.finditer(text, s, e):
            blank(m.start(), m.end())
    return ''.join(buf)


# ── 파일 훑기 ────────────────────────────────────────────────────────────────
def read_text(path):
    try:
        with io.open(path, 'r', encoding='utf-8', errors='replace') as f:
            return f.read()
    except (OSError, IOError):
        return ''


def norm(rel):
    return rel.replace('\\', '/').lstrip('./')


def is_denied(rel):
    r = norm(rel)
    head = r.split('/')[0]
    if head in DENY_DIRS:
        return True
    return bool(DENY_FILE_RE.search(os.path.basename(r)))


def catalog_files(catalog_dir):
    u"""site/catalog 아래 **모든** 파일의 (상대경로, 바이트)."""
    out = {}
    for root, dirs, files in os.walk(catalog_dir):
        for f in files:
            p = os.path.join(root, f)
            rel = norm(os.path.relpath(p, catalog_dir))
            try:
                out[rel] = os.path.getsize(p)
            except OSError:
                out[rel] = 0
    return out


class Allow(object):
    def __init__(self, known):
        self.known = known          # {rel: bytes}
        self.lower = {}
        for k in known:
            self.lower.setdefault(k.lower(), k)
        self.reasons = {}           # {rel: [reason, ...]}
        self.dangling = {}          # {ref: [reason, ...]}  존재하지 않는 참조

    def add(self, ref, reason):
        if not ref:
            return
        r = norm(ref)
        # `catalog/a.webp?v=8` · `catalog/a.webp#x` 꼬리 제거
        r = r.split('?')[0].split('#')[0]
        # 장부의 file 값이 이미 `catalog/…` 로 시작하는 곳이 있다(board-frames.json 등).
        # 키는 catalog 폴더 기준 상대경로 하나뿐이므로 접두사를 벗겨 정규화한다.
        while r.lower().startswith('catalog/'):
            r = r[len('catalog/'):]
        r = r.lstrip('./')
        key = self.lower.get(r.lower())
        if key is None:
            # dist 빌드가 만들어 넣는 것(js/·css/)과 존재하지 않는 이름을 갈라 기록
            self.dangling.setdefault(r, [])
            if reason not in self.dangling[r]:
                self.dangling[r].append(reason)
            return
        lst = self.reasons.setdefault(key, [])
        if reason not in lst:
            lst.append(reason)

    def scan_text(self, text, reason):
        for m in REF_RE.finditer(text or ''):
            self.add(m.group(1), reason)


# ── ① 게임 런타임 ───────────────────────────────────────────────────────────
def collect_game(site, al):
    tw = os.path.join(site, 'tentwin.html')
    raw = read_text(tw)
    if not raw:
        return None
    stripped = blank_comments(raw)
    al.scan_text(stripped, 'game:tentwin.html(주석 제거본)')

    # 데우기 목록: <script id="catalog-preload"> 안 문자열 리터럴 → catalog/<n>.webp
    low = stripped.lower()
    i = low.find('id="catalog-preload"')
    if i < 0:
        i = low.find("id='catalog-preload'")
    if i >= 0:
        gt = stripped.find('>', i)
        end = low.find('</script>', gt + 1)
        body = stripped[gt + 1: end if end > 0 else len(stripped)]
        for lit in re.findall(r'"([^"\n]*)"', body):
            for tok in lit.split(','):
                tok = tok.strip()
                if tok and re.match(r'^[A-Za-z0-9_@\-.]+$', tok) and '.' not in tok.split('@')[0][-5:]:
                    al.add('catalog/' + tok + '.webp', 'game:catalog-preload 데우기 목록')

    # sw.js SHELL · webmanifest · 랜딩
    for rel, reason in (('sw.js', 'game:sw.js SHELL 캐시 키'),
                        ('tentwin.webmanifest', 'game:webmanifest icons/screenshots'),
                        ('index.html', 'game:index.html(랜딩·og/favicon)')):
        al.scan_text(read_text(os.path.join(site, rel)), reason)
    return raw


def collect_b64(site, raw_html, al, catalog_dir):
    u"""critical-split.py 가 배포 시점에 base64 → catalog 참조로 바꾸는 대상(md5 동일)."""
    if not raw_html:
        return 0
    md5s = set()
    for m in DATA_URL_RE.finditer(raw_html):
        try:
            md5s.add(hashlib.md5(base64.b64decode(m.group(2))).hexdigest())
        except Exception:
            pass
    if not md5s:
        return 0
    hit = 0
    for root, dirs, files in os.walk(catalog_dir):
        for f in files:
            p = os.path.join(root, f)
            rel = norm(os.path.relpath(p, catalog_dir))
            if is_denied(rel):
                continue
            try:
                with open(p, 'rb') as fh:
                    h = hashlib.md5(fh.read()).hexdigest()
            except (OSError, IOError):
                continue
            if h in md5s:
                al.add('catalog/' + rel, 'game:critical-split base64 외부화(md5 동일)')
                hit += 1
    return hit


# ── ② 관제탑 ────────────────────────────────────────────────────────────────
def collect_board(site, al):
    for rel in BOARD_ROOT_FILES:
        p = os.path.join(site, rel)
        if os.path.isfile(p):
            al.scan_text(read_text(p), 'board:%s' % rel)

    bdir = os.path.join(site, 'board')
    for root, dirs, files in os.walk(bdir):
        for f in files:
            if not f.lower().endswith(BOARD_EXTS):
                continue
            if f == 'board-candidates.js':
                continue        # 자동생성 재고 열거 — <option value> 텍스트일 뿐 요청이 아니다
            rel = norm(os.path.relpath(os.path.join(root, f), site))
            al.scan_text(read_text(os.path.join(root, f)), 'board:%s' % rel)

    # `'catalog/'+f.file` 조립 장부
    for rel, reason in FILE_FIELD_JSONS:
        p = os.path.join(site, rel)
        if not os.path.isfile(p):
            continue
        try:
            data = json.loads(read_text(p))
        except ValueError:
            continue
        for v in walk_file_fields(data):
            al.add('catalog/' + v, reason)

    # BOARD.html pvSrc(p) = 'catalog/'+(p.dir||'<기본>')+'/'+p.file
    for rel, dflt in PREVIEW_INDEXES:
        p = os.path.join(site, rel)
        if not os.path.isfile(p):
            continue
        try:
            data = json.loads(read_text(p))
        except ValueError:
            continue
        for it in (data.get('items') or []):
            if isinstance(it, dict) and it.get('file'):
                al.add('catalog/%s/%s' % (it.get('dir') or dflt, it['file']),
                       'board:pvSrc(%s)' % rel)


def walk_file_fields(node, out=None):
    u"""중첩 dict/list 를 훑어 `file`·`src`·`preview_png` 값(문자열)을 모은다."""
    if out is None:
        out = []
    if isinstance(node, dict):
        for k, v in node.items():
            if k in ('file', 'src', 'preview_png') and isinstance(v, str) and v:
                out.append(norm(v).split('?')[0])
            else:
                walk_file_fields(v, out)
    elif isinstance(node, list):
        for v in node:
            walk_file_fields(v, out)
    return out


# ── ③ 바깥 배포 고정핀 ──────────────────────────────────────────────────────
def collect_pins(al):
    for name in PUBLISH_PINS:
        al.add('catalog/' + name, 'publish:pin(twa-manifest 절대 URL)')


def check_publish(publish_dir):
    u"""publish/ 가 **배포된 절대 URL**로 부르는 catalog 파일이 핀을 벗어나지 않는지."""
    miss = []
    pat = re.compile(r"game-factory-site/catalog/([A-Za-z0-9_@%./\-]+\.[A-Za-z0-9]{1,6})", re.I)
    for root, dirs, files in os.walk(publish_dir):
        if '_build' in root.replace('\\', '/').split('/'):
            continue            # itch 번들은 자기 catalog 사본을 들고 있다
        for f in files:
            if not f.lower().endswith(('.json', '.html', '.md', '.txt', '.js')):
                continue
            for m in pat.finditer(read_text(os.path.join(root, f))):
                n = os.path.basename(m.group(1))
                if n not in PUBLISH_PINS:
                    miss.append((norm(os.path.relpath(os.path.join(root, f), publish_dir)), m.group(1)))
    return miss


# ── 공개 API (build-dist.py 가 부른다) ──────────────────────────────────────
def compute(site):
    u"""site 트리를 실측해 (allow_reasons, deny_list, stats) 를 돌려준다.

    allow_reasons = {catalog 상대경로: [근거, ...]}  ·  deny_list = [상대경로, ...]
    """
    site = os.path.abspath(site)
    catalog_dir = os.path.join(site, 'catalog')
    if not os.path.isdir(catalog_dir):
        return {}, [], {'error': 'catalog 폴더 없음: %s' % catalog_dir}

    known = catalog_files(catalog_dir)
    al = Allow(known)
    raw = collect_game(site, al)
    collect_board(site, al)
    collect_pins(al)
    b64 = collect_b64(site, raw, al, catalog_dir)

    allow, deny = {}, []
    for rel in sorted(known):
        if is_denied(rel):
            deny.append(rel)
            continue
        if rel in al.reasons:
            allow[rel] = al.reasons[rel]
        else:
            deny.append(rel)

    ab = sum(known[r] for r in allow)
    db = sum(known[r] for r in deny)
    stats = {
        'total_files': len(known), 'total_bytes': sum(known.values()),
        'allow_files': len(allow), 'allow_bytes': ab,
        'deny_files': len(deny), 'deny_bytes': db,
        'b64_externalized': b64,
        'dangling_refs': sorted(al.dangling.keys()),
    }
    return allow, deny, stats


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--site', default='.')
    ap.add_argument('--out', default=os.path.join('tools', 'build', 'catalog.allow.json'))
    ap.add_argument('--publish', default='', help='publish/ 경로 — 절대 URL 핀 검사')
    ap.add_argument('--print-deny', action='store_true', help='제외 목록을 크기 내림차순으로 찍는다')
    ap.add_argument('--no-write', action='store_true')
    a = ap.parse_args()

    site = os.path.abspath(a.site)
    catalog_dir = os.path.join(site, 'catalog')
    if not os.path.isdir(catalog_dir):
        sys.stderr.write('catalog 폴더 없음: %s\n' % catalog_dir)
        return 2
    known = catalog_files(catalog_dir)
    allow, deny, stats = compute(site)

    rc = 0
    pin_miss = []
    if a.publish:
        pd = os.path.abspath(a.publish)
        if os.path.isdir(pd):
            pin_miss = check_publish(pd)
            if pin_miss:
                rc = 1

    mb = lambda b: b / 1048576.0
    print('catalog-allowlist: 전체 %d파일 %.2fMB → 허용 %d파일 %.2fMB · 제외 %d파일 %.2fMB (-%.2fMB)' % (
        stats['total_files'], mb(stats['total_bytes']),
        stats['allow_files'], mb(stats['allow_bytes']),
        stats['deny_files'], mb(stats['deny_bytes']), mb(stats['deny_bytes'])))
    print('  base64 외부화 대상(critical-split) %d장 · 존재하지 않는 참조 %d건' % (
        stats['b64_externalized'], len(stats['dangling_refs'])))
    if stats['dangling_refs']:
        for r in stats['dangling_refs'][:12]:
            print('    ? catalog/%s' % r)
    if pin_miss:
        print('  ✗ publish 핀 누락 %d건 — PUBLISH_PINS 를 갱신하라:' % len(pin_miss))
        for f, r in pin_miss[:12]:
            print('    - %s → catalog/%s' % (f, r))

    if a.print_deny:
        print('  — 제외 목록(크기 내림차순) —')
        for rel in sorted(deny, key=lambda r: -known.get(r, 0)):
            print('    %8.1fKB  catalog/%s' % (known.get(rel, 0) / 1024.0, rel))

    if not a.no_write:
        by_reason = {}
        for rel, rs in allow.items():
            for r in rs:
                by_reason[r] = by_reason.get(r, 0) + 1
        doc = {
            'generated': time.strftime('%Y-%m-%d %H:%M:%S'),
            'generator': 'tools/build/catalog-allowlist.py',
            'site': norm(os.path.relpath(site, site)) or '.',
            'note': ('배포본에 실을 catalog 파일 허용 목록. 근거 = game:* 게임 런타임 · '
                     'board:* 관제탑(site/board/** 는 일부러 배포) · publish:pin 바깥 절대 URL. '
                     'build-dist.py 는 빌드 시점에 이 스크립트를 다시 돌려 계산한다 — '
                     '이 파일은 사람이 읽는 증거·감사용이다.'),
            'stats': stats,
            'reason_counts': dict(sorted(by_reason.items(), key=lambda kv: -kv[1])),
            'allow': dict(sorted(allow.items())),
            'deny': sorted(deny),
        }
        out = a.out if os.path.isabs(a.out) else os.path.join(site, a.out)
        os.makedirs(os.path.dirname(out), exist_ok=True)
        with io.open(out, 'w', encoding='utf-8') as f:
            f.write(json.dumps(doc, ensure_ascii=False, indent=1))
            f.write(u'\n')
        print('  기록: %s' % out)
    return rc


if __name__ == '__main__':
    sys.exit(main())
