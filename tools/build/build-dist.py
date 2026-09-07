#!/usr/bin/env python
"""build-dist.py — GitHub Pages 배포본 빌드(소스 불변).

  python tools/build/build-dist.py [--site .] [--out dist] [--include-extras] [--no-stamp] [--no-split]

절차(Actions pages.yml 와 로컬 검증이 같은 명령을 쓴다):
  1. <out>/ 비우기
  2. 소스 트리 복사 — 제외: .git .github .claude dist tools/ *.bak.html evidence-*/ (배포 무관·용량 600MB+)
     --include-extras 를 주면 *.bak.html · evidence-*/ 도 복사(legacy 배포와 동일 집합)
  3. tentwin.html → strip-deploy.py 로 주석·들여쓰기 제거본을 <out>/tentwin.html 에 (소스 파일은 그대로)
  3b. critical-split.py <out> (perf2-0908): 첫 화면 임계 경로 축소 — base64 이미지→catalog 참조(md5 동일),
      본체 인라인 JS→catalog/js/tw-*.js(defer, 문서 순서), 본체 뒤 CSS→루트 tw-late-*.css(compat-p1 앞 link).
      문서 2.98MB→1.14MB. 외형·동작 불변(픽셀 19컷 0, 실클릭 동일). --no-split 로 끈다.
  4. stamp.py <out> : <meta name="build"> 와 sw.js BUILD 를 HEAD 해시+커밋 시각으로(= 로컬 `stamp.py <site>` 와 같은 값)
  5. 요약(바이트 전/후·파일 수) 출력. 실패는 exit≠0.

출처: 지식 저장소 game-factory/tools/build/{strip-deploy.py, stamp.py} 사본을 같은 폴더에 둔다(site 저장소 단독 빌드용).
"""
import os, sys, shutil, subprocess, argparse, fnmatch
try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

HERE = os.path.dirname(os.path.abspath(__file__))
EXCLUDE_DIRS = {'.git', '.github', '.claude', 'tools', 'node_modules'}
EXCLUDE_GLOB_DIRS = ['evidence-*']
EXCLUDE_FILES = ['*.bak.html', '*.bak-*', '.gitignore']


def want(rel, name, is_dir, extras):
    if is_dir:
        if name in EXCLUDE_DIRS:
            return False
        if not extras and any(fnmatch.fnmatch(name, g) for g in EXCLUDE_GLOB_DIRS):
            return False
        return True
    if extras:
        return name != '.gitignore'
    return not any(fnmatch.fnmatch(name, g) for g in EXCLUDE_FILES)


def copy_tree(src, dst, out_abs, extras):
    n = 0
    for root, dirs, files in os.walk(src):
        rel = os.path.relpath(root, src)
        # dist 자기 자신·제외 폴더 가지치기
        dirs[:] = [d for d in dirs if os.path.abspath(os.path.join(root, d)) != out_abs and want(rel, d, True, extras)]
        tgt = os.path.join(dst, rel) if rel != '.' else dst
        os.makedirs(tgt, exist_ok=True)
        for f in files:
            if not want(rel, f, False, extras):
                continue
            shutil.copy2(os.path.join(root, f), os.path.join(tgt, f))
            n += 1
    return n


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--site', default='.')
    ap.add_argument('--out', default='dist')
    ap.add_argument('--include-extras', action='store_true', help='*.bak.html · evidence-*/ 도 복사(legacy 집합)')
    ap.add_argument('--no-stamp', action='store_true')
    ap.add_argument('--no-split', action='store_true', help='critical-split(이미지 외부화·JS defer·늦은 CSS 분리)을 끈다 — 단일 파일 배포본')
    a = ap.parse_args()
    site = os.path.abspath(a.site)
    out = os.path.abspath(os.path.join(site, a.out)) if not os.path.isabs(a.out) else a.out
    src_html = os.path.join(site, 'tentwin.html')
    if not os.path.exists(src_html):
        sys.exit('tentwin.html 없음: ' + src_html)
    if os.path.isdir(out):
        shutil.rmtree(out)
    os.makedirs(out)
    n = copy_tree(site, out, out, a.include_extras)
    # 3. strip
    py = sys.executable
    r = subprocess.run([py, os.path.join(HERE, 'strip-deploy.py'), src_html, os.path.join(out, 'tentwin.html')],
                       capture_output=True, text=True, encoding='utf-8', errors='replace')
    sys.stdout.write(r.stdout)
    if r.returncode != 0:
        sys.stderr.write(r.stderr); sys.exit('strip-deploy 실패 exit %d' % r.returncode)
    # 3b. critical-split (perf2-0908): base64 이미지 → catalog 참조, 본체 JS → catalog/js/*.js(defer),
    #     본체 뒤 CSS → catalog/css/tw-late-*.css. 소스 무접촉, 배포본만. --no-split 로 끈다.
    if not a.no_split:
        r = subprocess.run([py, os.path.join(HERE, 'critical-split.py'), out], capture_output=True, text=True, encoding='utf-8', errors='replace')
        sys.stdout.write(r.stdout)
        if r.returncode != 0:
            sys.stderr.write(r.stderr); sys.exit('critical-split 실패 exit %d' % r.returncode)
    # 4. stamp (dist 는 저장소 안 폴더라 git -C dist 가 HEAD 를 찾는다) — split 뒤에 찍어 최종 html 에 스탬프
    if not a.no_stamp:
        r = subprocess.run([py, os.path.join(HERE, 'stamp.py'), out], capture_output=True, text=True, encoding='utf-8', errors='replace')
        sys.stdout.write(r.stdout)
        if r.returncode != 0:
            sys.stderr.write(r.stderr); sys.exit('stamp 실패 exit %d' % r.returncode)
    b0 = os.path.getsize(src_html); b1 = os.path.getsize(os.path.join(out, 'tentwin.html'))
    print('build-dist: 파일 %d 복사 · tentwin.html %d -> %d B (%.1f%%) · out=%s · extras=%s' % (
        n, b0, b1, 100.0 * b1 / b0, out, a.include_extras))
    return 0


if __name__ == '__main__':
    sys.exit(main())
