#!/usr/bin/env python3
"""critical-split.py — 배포본(dist) tentwin.html 의 첫 화면 임계 경로를 줄인다. 소스는 건드리지 않는다.

  python tools/build/critical-split.py <dist_dir> [--no-images] [--no-js] [--no-css] [--css-min-bytes 3000]

무엇을 하나 (외형·동작 불변 — 바이트는 같은 자산, 실행 순서는 defer 로 문서 순서 그대로):
  A. CSS 안 base64 이미지(data:image/*)를 catalog/ 의 **바이트 동일** 파일 참조로 바꾼다
     (md5 일치할 때만). 문서 크기에서 압축 안 되는 base64 가 빠져 첫 화면 바이트가 준다.
  B. <body> 의 인라인 <script> 블록을 각각 catalog/js/tw-<n>-<hash>.js 로 빼고
     <script defer src=…> 로 바꾼다. 블록 하나 = 파일 하나라 스코프·strict 의미가 같고,
     defer 는 문서 순서로 파싱 뒤 실행한다(원래도 스플래시 마크업은 스크립트 **뒤**에 있어
     핸들러는 DOM 이후에 걸렸다). <head> 의 진단·SW 등록 스크립트는 그대로 둔다.
  C. 스크립트 뒤의 큰 <style> 블록(첫 화면 미사용 비중이 큼)을 catalog/css/tw-late-<hash>.css
     하나로 모아 마지막 인라인 블록(compat-p1) **바로 앞**에 <link rel=stylesheet> 로 둔다 —
     캐스케이드 순서 보존. <head> 에 <link rel=preload as=style> 을 넣어 일찍 받되 렌더는
     막지 않는다. 제외: tokens-semantic·compat-p1·sian-menu-sprites·작은 블록.
  catalog/ 아래에 두는 이유: sw.js 가 '/catalog/' 를 cache-first 로 다뤄 오프라인·재방문 캐시가
  그대로 통하고, 파일명에 해시가 있어 새 빌드는 새 이름을 부른다(옛 캐시는 BUILD 키로 정리).
"""
import os, re, sys, base64, hashlib, argparse

def sha8(b): return hashlib.sha1(b).hexdigest()[:8]

def block_map(h):
    """상위 <style>/<script> 블록(HTML 주석 안은 건너뜀) → dict 목록(tag, open_start, body_start, body_end, close_end, attrs)"""
    i = 0; out = []
    tag_re = re.compile(r'<(style|script)(\s[^>]*)?>', re.I)
    while True:
        c = h.find('<!--', i); m = tag_re.search(h, i)
        if not m and c < 0: break
        if c >= 0 and (not m or c < m.start()):
            e = h.find('-->', c + 4); i = e + 3 if e >= 0 else len(h); continue
        tag = m.group(1).lower(); attrs = m.group(2) or ''
        end = h.find('</%s>' % tag, m.end()); end = len(h) if end < 0 else end
        out.append({'tag': tag, 'open_start': m.start(), 'body_start': m.end(), 'body_end': end,
                    'close_end': end + len(tag) + 3, 'attrs': attrs})
        i = end + len(tag) + 3
    return out

def attr(attrs, name):
    m = re.search(r'\b%s="([^"]*)"' % name, attrs); return m.group(1) if m else None

def externalize_images(h, catalog):
    idx = {}
    for root, _, files in os.walk(catalog):
        for f in files:
            if f.lower().endswith(('.webp', '.png', '.jpg', '.jpeg', '.gif', '.svg')):
                p = os.path.join(root, f)
                idx[hashlib.md5(open(p, 'rb').read()).hexdigest()] = os.path.relpath(p, os.path.dirname(catalog)).replace('\\', '/')
    rep = []; miss = []
    def sub(m):
        q, mime, b64 = m.group(1), m.group(2), m.group(3)
        try: raw = base64.b64decode(b64)
        except Exception: return m.group(0)
        f = idx.get(hashlib.md5(raw).hexdigest())
        if not f: miss.append((mime, len(b64))); return m.group(0)
        rep.append((f, len(b64)))
        return 'url(%s%s%s)' % (q, f, q)
    h2 = re.sub(r'url\((["\']?)data:(image/[a-z+.-]+);base64,([A-Za-z0-9+/=]+)\1\)', sub, h)
    return h2, rep, miss

def externalize_js(h, out_dir, rel_dir='catalog/js'):
    body = h.find('<body'); blocks = [b for b in block_map(h) if b['tag'] == 'script' and b['open_start'] > body]
    os.makedirs(os.path.join(out_dir, rel_dir), exist_ok=True)
    pieces = []; last = 0; made = []
    for n, b in enumerate(blocks):
        ty = attr(b['attrs'], 'type')
        if ty and ty not in ('text/javascript', 'application/javascript', 'module'): continue
        if attr(b['attrs'], 'src'): continue
        code = h[b['body_start']:b['body_end']]
        if not code.strip(): continue
        name = 'tw-%02d-%s.js' % (n, sha8(code.encode('utf-8')))
        with open(os.path.join(out_dir, rel_dir, name), 'w', encoding='utf-8', newline='') as f: f.write(code)
        bid = attr(b['attrs'], 'id'); ida = (' id="%s"' % bid) if bid else ''
        pieces.append(h[last:b['open_start']]); pieces.append('<script defer src="%s/%s"%s></script>' % (rel_dir, name, ida))
        last = b['close_end']; made.append((name, len(code.encode('utf-8'))))
    pieces.append(h[last:])
    return ''.join(pieces), made

KEEP_CSS_IDS = {'tokens-semantic', 'compat-p1', 'sian-menu-sprites'}
def defer_css(h, out_dir, min_bytes, rel_dir='catalog/css'):
    body = h.find('<body'); blocks = block_map(h)
    scripts = [b for b in blocks if b['tag'] == 'script' and b['open_start'] > body]
    if not scripts: return h, [], None
    big = max(scripts, key=lambda b: b['body_end'] - b['body_start'])   # 게임 본체(가장 큰 블록) 뒤부터가 '늦은 CSS'
    after = big['close_end']
    styles = [b for b in blocks if b['tag'] == 'style' and b['open_start'] > after]
    anchor = next((b for b in styles if attr(b['attrs'], 'id') == 'compat-p1'), None)
    if not anchor: return h, [], None
    picks = [b for b in styles if b['open_start'] < anchor['open_start'] and (attr(b['attrs'], 'id') not in KEEP_CSS_IDS)
             and (b['body_end'] - b['body_start']) >= min_bytes]
    if not picks: return h, [], None
    css = '\n'.join('/* == %s == */\n%s' % (attr(b['attrs'], 'id') or '(no id)', h[b['body_start']:b['body_end']]) for b in picks)
    # 파일은 문서와 **같은 폴더**(루트)에 둔다: 인라인 CSS 의 상대 url(catalog/…)은 물론, <head> 에 선언된
    # 커스텀 속성(--ch-*-thumb: url(catalog/…))을 var() 로 **소비하는 규칙**도 Chrome 은 소비 시트 기준으로
    # 주소를 푼다 — 하위 폴더에 두면 catalog/css/catalog/… 404 가 난다(실측). 루트면 url() 을 한 글자도 안 바꾼다.
    # sw.js 는 catalog/ 밖 파일을 network-first + 캐시 폴백으로 다루므로 오프라인 재방문도 그대로 통한다.
    name = 'tw-late-%s.css' % sha8(css.encode('utf-8'))
    with open(os.path.join(out_dir, name), 'w', encoding='utf-8', newline='') as f: f.write(css)
    href = name
    pieces = []; last = 0
    for b in picks:
        pieces.append(h[last:b['open_start']]); last = b['close_end']
    pieces.append(h[last:anchor['open_start']]); pieces.append('<link rel="stylesheet" href="%s">\n' % href); pieces.append(h[anchor['open_start']:])
    h2 = ''.join(pieces)
    # head preload (렌더 비차단, 일찍 받기)
    he = h2.find('</head>')
    if he > 0: h2 = h2[:he] + '<link rel="preload" as="style" href="%s">\n' % href + h2[he:]
    return h2, [(attr(b['attrs'], 'id') or '(no id)', b['body_end'] - b['body_start']) for b in picks], (name, len(css.encode('utf-8')))

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('dist'); ap.add_argument('--no-images', action='store_true'); ap.add_argument('--no-js', action='store_true')
    ap.add_argument('--no-css', action='store_true'); ap.add_argument('--css-min-bytes', type=int, default=0)
    a = ap.parse_args()
    dist = os.path.abspath(a.dist); path = os.path.join(dist, 'tentwin.html'); catalog = os.path.join(dist, 'catalog')
    raw = open(path, 'rb').read(); nl = '\r\n' if b'\r\n' in raw[:20000] else '\n'
    h = raw.decode('utf-8'); n0 = len(raw)
    if not a.no_images:
        h, rep, miss = externalize_images(h, catalog)
        print('A 이미지 외부화: %d건 %s' % (len(rep), ', '.join('%s(%dK)' % (f.split('/')[-1], n // 1024) for f, n in rep)))
        if miss: print('   catalog 동일본 없음(그대로): %s' % miss)
    if not a.no_css:   # C 를 B 보다 먼저: 스크립트 크기로 '본체 뒤' 경계를 잡는다
        h, picks, made = defer_css(h, dist, a.css_min_bytes)
        if made: print('C 지연 CSS: %d블록 %d B → catalog/css/%s (%s)' % (len(picks), made[1], made[0], ', '.join(i for i, _ in picks)))
        else: print('C 지연 CSS: 대상 없음')
    if not a.no_js:
        h, made = externalize_js(h, dist)
        print('B JS 외부화: %d파일 %d B → catalog/js/' % (len(made), sum(n for _, n in made)))
    out = h.encode('utf-8')
    if nl == '\r\n' and b'\r\n' not in out[:20000]: out = out.replace(b'\n', b'\r\n')
    open(path, 'wb').write(out)
    print('critical-split: tentwin.html %d -> %d B (%.1f%%)' % (n0, len(out), 100.0 * len(out) / n0))

if __name__ == '__main__': main()
