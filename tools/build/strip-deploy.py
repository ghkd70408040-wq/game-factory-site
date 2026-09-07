"""strip-deploy.py — 배포본 경량화(주석·들여쓰기 제거). **소스는 건드리지 않는다.**

적용 상태(0908): **GitHub Actions Pages 빌드에서 적용** — site/.github/workflows/pages.yml → tools/build/build-dist.py 가
  소스 tentwin.html → dist/tentwin.html 로 이 스크립트를 돌린다(소스 저장소는 무변). site 저장소에 동일 사본
  (site/tools/build/strip-deploy.py) 을 둔다 — 원본은 여기(지식 저장소). 검증 0908: 4,900,608→2,982,025 B(−39.1%),
  node --check 9/9, m3 PASS, 픽셀 diff 0(18장), ==ART:BEGIN/END== 마커 보존.

사용:
  python tools/build/strip-deploy.py <src.html> <out.html> [--keep-indent] [--report]

규칙(보수적 — 동작 동일이 최우선):
  - <style> 안: 통줄 `/* … */` 주석(줄 시작이 `/*`)만 제거. `/*!` 와 `==XXX:BEGIN==`/`==XXX:END==`
    마커를 담은 주석은 보존(도구가 읽는 표식). 줄 안에 코드와 섞인 주석은 손대지 않는다.
  - <script> 안: 통줄 `// ` 주석(`//` 뒤에 공백·탭·한글이 오는 줄)과 통줄 `/* … */` 블록만 제거.
    base64 data URI 는 `*` 를 쓰지 않고 `//` 뒤에 공백이 올 수 없으므로 안전하다.
    `//` 뒤에 바로 문자가 붙는 줄(예: `//x`)은 건드리지 않는다(URL·정규식·데이터 오탐 방지).
  - 들여쓰기: <style>/<script> 안 줄 앞 공백·탭 제거(--keep-indent 로 끄기). 템플릿 리터럴(백틱)
    안은 줄 앞 공백이 값이 될 수 있어 **백틱 홀수 상태의 줄은 건드리지 않는다.**
  - 마크업(<style>/<script> 밖)은 무접촉(pre·textarea·공백 의미 보존).
  - 줄바꿈 종류(CRLF/LF)는 입력을 따른다.

검증(권장): 산출본으로 m3 게이트·콘솔 0·픽셀 diff 0, 그리고 각 <script> 를 node --check.
"""
import sys, re, io, os

KEEP_MARK = re.compile(r'/\*!|==[A-Z0-9_-]+:(BEGIN|END)==')
LINE_COMMENT = re.compile(r'^\s*//(?=[ \tㄱ-힝]|$)')   # `// `, `//\t`, `//한글`, `//` 단독
BLOCK_OPEN = re.compile(r'^\s*/\*')
BLOCK_CLOSE = re.compile(r'\*/\s*$')

def strip_block(lines, kind, keep_indent):
    """lines: 블록 안 줄 목록(줄바꿈 없음). kind: 'style'|'script'."""
    out = []
    in_block = False      # 통줄 블록 주석 진행 중
    keep_block = False    # 보존 대상 블록 주석
    tick_odd = False      # 백틱 홀수(템플릿 리터럴 안)
    removed = 0
    for ln in lines:
        if in_block:
            if keep_block:
                out.append(ln)
            else:
                removed += 1
            if BLOCK_CLOSE.search(ln) or '*/' in ln:
                in_block = False; keep_block = False
            continue
        s = ln.strip()
        if BLOCK_OPEN.match(ln) and not tick_odd:
            # 한 줄에 닫히는가
            closes = '*/' in ln[ln.find('/*') + 2:]
            keep = bool(KEEP_MARK.search(ln))
            if closes:
                if keep or ln[ln.find('*/') + 2:].strip():   # 주석 뒤에 코드가 붙으면 보존
                    out.append(ln)
                else:
                    removed += 1
                continue
            in_block = True; keep_block = keep
            if keep: out.append(ln)
            else: removed += 1
            continue
        if kind == 'script' and not tick_odd and LINE_COMMENT.match(ln):
            if KEEP_MARK.search(ln):          # `// ==ART:BEGIN==` 같은 표식 줄은 보존
                out.append(ln); continue
            removed += 1
            continue
        if s == '':
            removed += 1
            continue
        if keep_indent or tick_odd:
            out.append(ln)
        else:
            out.append(s if kind == 'style' else ln.lstrip())
        if kind == 'script':
            # 백틱 개수(이스케이프 제외)로 템플릿 리터럴 상태 추적 — 보수적
            n = len(re.findall(r'(?<!\\)`', ln))
            if n % 2 == 1: tick_odd = not tick_odd
    return out, removed

def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    keep_indent = '--keep-indent' in sys.argv
    report = '--report' in sys.argv
    if len(args) < 2:
        print(__doc__); return 2
    src, dst = args
    raw = io.open(src, 'rb').read()
    nl = '\r\n' if b'\r\n' in raw else '\n'
    text = raw.decode('utf-8')
    lines = text.split(nl)
    out = []
    i = 0; n = len(lines)
    total_removed = {'style': 0, 'script': 0}
    open_re = re.compile(r'<(style|script)\b[^>]*>', re.I)
    while i < n:
        ln = lines[i]
        m = open_re.search(ln)
        # 블록 시작 태그가 줄 끝에 있고 내용이 다음 줄부터 시작하는 경우만 처리(인라인 한 줄 블록은 무접촉)
        if m and ln.rstrip().endswith('>') and ('</%s>' % m.group(1).lower()) not in ln.lower():
            kind = m.group(1).lower()
            close_tag = '</%s>' % kind
            out.append(ln); i += 1
            body = []
            while i < n and close_tag not in lines[i].lower():
                body.append(lines[i]); i += 1
            # JSON/데이터 스크립트는 무접촉
            if kind == 'script' and re.search(r'type\s*=\s*["\'](application/json|text/template|text/x-)', ln, re.I):
                out.extend(body)
            else:
                stripped, removed = strip_block(body, kind, keep_indent)
                total_removed[kind] += removed
                out.extend(stripped)
            continue
        out.append(ln); i += 1
    res = nl.join(out)
    io.open(dst, 'wb').write(res.encode('utf-8'))
    if report or True:
        print('strip-deploy: %s -> %s' % (src, dst))
        print('  bytes %d -> %d (-%d, %.1f%%)' % (len(raw), len(res.encode('utf-8')), len(raw) - len(res.encode('utf-8')),
              100.0 * (len(raw) - len(res.encode('utf-8'))) / max(1, len(raw))))
        print('  removed lines: style %d · script %d · newline %s' % (total_removed['style'], total_removed['script'], 'CRLF' if nl == '\r\n' else 'LF'))
    return 0

if __name__ == '__main__':
    sys.exit(main())
