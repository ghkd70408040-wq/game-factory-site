#!/usr/bin/env python
"""빌드 스탬프 — <meta name="build"> 와 sw.js 캐시 키를 HEAD 해시+커밋 시각으로 함께 갱신한다.

사용:
  python tools/build/stamp.py <site폴더>                # 갱신(멱등: 같은 HEAD면 재실행해도 바이트 변화 0)
  python tools/build/stamp.py <site폴더> --dry-run      # 바꾸지 않고 현재/예정 값만
  python tools/build/stamp.py <site폴더> --check <URL>  # 원격 배포본의 build 메타가 로컬과 같은지(배포 확인)

스탬프 형식: <short-hash>-<YYYYMMDD-HHMM>  (시각 = HEAD 커밋 시각, 실행 시각이 아님 → 리베이스·후속 커밋 뒤 재실행하면 그 HEAD로 따라간다)
검사: 두 곳 값이 다르면 exit 2, --check 불일치는 exit 3, 원격 오류 exit 4.
"""
import re, sys, os, subprocess, argparse, urllib.request, time
try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

META_RE = re.compile(r'(<meta name="build" content=")([^"]*)(")')
SW_RE = re.compile(r"(const BUILD = ')([^']*)(';)")


def head_stamp(site):
    h = subprocess.check_output(['git', '-C', site, 'rev-parse', '--short', 'HEAD']).decode().strip()
    ci = subprocess.check_output(['git', '-C', site, 'log', '-1', '--format=%cd', '--date=format:%Y%m%d-%H%M']).decode().strip()
    return f'{h}-{ci}'


def read(p):
    b = open(p, 'rb').read()
    return b, b.decode('utf-8')


def current(site):
    html_p, sw_p = os.path.join(site, 'tentwin.html'), os.path.join(site, 'sw.js')
    _, html = read(html_p)
    _, sw = read(sw_p)
    m1, m2 = META_RE.search(html), SW_RE.search(sw)
    return (m1.group(2) if m1 else None), (m2.group(2) if m2 else None)


def apply(site, stamp, dry):
    html_p, sw_p = os.path.join(site, 'tentwin.html'), os.path.join(site, 'sw.js')
    raw_h, html = read(html_p)
    raw_s, sw = read(sw_p)
    if not META_RE.search(html):
        sys.exit('tentwin.html 에 <meta name="build"> 없음 — apply-head(출시 블록) 먼저')
    if not SW_RE.search(sw):
        sys.exit("sw.js 에 const BUILD = '…' 없음")
    new_h = META_RE.sub(lambda m: m.group(1) + stamp + m.group(3), html, count=1)
    new_s = SW_RE.sub(lambda m: m.group(1) + stamp + m.group(3), sw, count=1)
    ch_h, ch_s = new_h != html, new_s != sw
    if not dry:
        if ch_h:
            open(html_p, 'wb').write(new_h.encode('utf-8'))   # 줄바꿈·바이트 그대로(치환만)
        if ch_s:
            open(sw_p, 'wb').write(new_s.encode('utf-8'))
    return ch_h, ch_s


def fetch_remote_build(url):
    req = urllib.request.Request(url + ('&' if '?' in url else '?') + f'v={int(time.time())}',
                                 headers={'Cache-Control': 'no-cache', 'User-Agent': 'stamp-check'})
    buf = b''
    with urllib.request.urlopen(req, timeout=60) as r:
        while True:                       # </head> 까지만 읽는다(단일 HTML 이 커도 전체를 받지 않음)
            chunk = r.read(262144)
            if not chunk:
                break
            buf += chunk
            if b'</head>' in buf:
                break
    m = META_RE.search(buf.decode('utf-8', 'replace'))
    return m.group(2) if m else None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('site')
    ap.add_argument('--dry-run', action='store_true')
    ap.add_argument('--check', metavar='URL', help='배포본 tentwin.html URL — 원격 build 메타 == 로컬 확인')
    a = ap.parse_args()
    site = os.path.abspath(a.site)
    stamp = head_stamp(site)
    before = current(site)
    if a.check:
        local = before[0]
        try:
            remote = fetch_remote_build(a.check)
        except Exception as e:
            print(f'원격 오류: {e}'); sys.exit(4)
        print(f'로컬 build : {local}\n로컬 HEAD  : {stamp}\n원격 build : {remote}')
        if remote == local and local:
            print('배포 확인 PASS: 원격 = 로컬 파일 값'); sys.exit(0)
        if remote == stamp:
            # Actions 빌드(build-dist.py)는 dist 를 HEAD 해시로 스탬프한다 — 로컬 파일 값이 한 커밋 뒤여도 HEAD 와 같으면 반영 완료
            print('배포 확인 PASS: 원격 = 로컬 HEAD 스탬프(Actions 빌드)'); sys.exit(0)
        print('배포 확인 FAIL: 다름(아직 반영 전이거나 로컬이 앞섬)'); sys.exit(3)
    ch_h, ch_s = apply(site, stamp, a.dry_run)
    after = current(site) if not a.dry_run else (stamp, stamp)
    print(f'HEAD 스탬프 : {stamp}')
    print(f'meta build  : {before[0]} -> {after[0]}  ({"변경" if ch_h else "동일"})')
    print(f'sw.js BUILD : {before[1]} -> {after[1]}  ({"변경" if ch_s else "동일"})')
    if after[0] != after[1]:
        print('불일치: meta 와 sw.js 값이 다르다'); sys.exit(2)
    print('일치 검사 PASS' + (' (dry-run)' if a.dry_run else ''))


if __name__ == '__main__':
    main()
