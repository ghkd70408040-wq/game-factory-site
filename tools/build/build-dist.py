#!/usr/bin/env python
"""build-dist.py — GitHub Pages 배포본 빌드(소스 불변).

  python tools/build/build-dist.py [--site .] [--out dist] [--include-extras] [--no-stamp] [--no-split] [--no-allowlist]

절차(Actions pages.yml 와 로컬 검증이 같은 명령을 쓴다):
  1. <out>/ 비우기
  2. 소스 트리 복사 — 제외: .git .github .claude dist tools/ *.bak.html evidence-*/ (배포 무관·용량 600MB+)
     --include-extras 를 주면 *.bak.html · evidence-*/ 도 복사(legacy 배포와 동일 집합)
  2b. **카탈로그 허용 목록**(판정판 35) — `catalog/` 는 통째로 복사하지 않는다.
      `catalog-allowlist.py` 가 「누가 부르는가」를 실측해 만든 목록에 든 파일만 복사한다:
        ① 게임 런타임(tentwin.html 주석 제거본·catalog-preload·sw.js SHELL·webmanifest·
           index.html·critical-split base64 외부화 대상)
        ② 관제탑 site/board/** + 배포되는 루트 판정 페이지 + 동적 조립(manifest.json·
           pvSrc·board-frames.json) — board/ 는 **일부러 배포한다**(판정판을 그 URL 로 본다)
        ③ publish 절대 URL 고정핀(twa-manifest PWA 아이콘)
      `_retired/` · `_superseded/` · `*.bak*` 은 근거가 있어도 무조건 제외한다.
      빌드 시점에 다시 계산하므로 커밋된 `catalog.allow.json` 이 낡아도 배포가 안 깨진다.
      `--no-allowlist` 로 끄면 옛 동작(통째 복사)으로 돌아간다.
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


def load_allowlist(site):
    u"""catalog-allowlist.py 를 모듈로 불러 허용 집합을 **빌드 시점에 다시 계산**한다.

    커밋된 catalog.allow.json 을 읽지 않는 이유: 자산을 새로 배선하고 목록 재생성을
    잊으면 배포본에서 404 가 난다. 목록은 소스에서 파생되는 값이지 손으로 지키는 장부가 아니다.
    (json 은 사람이 읽는 증거·감사용으로 따로 커밋한다.)
    """
    import importlib.util
    p = os.path.join(HERE, 'catalog-allowlist.py')
    if not os.path.isfile(p):
        sys.exit('catalog-allowlist.py 없음: %s (--no-allowlist 로 끌 수 있다)' % p)
    spec = importlib.util.spec_from_file_location('catalog_allowlist', p)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    allow, deny, stats = mod.compute(site)
    if stats.get('error'):
        sys.exit('catalog-allowlist: ' + stats['error'])
    return set(allow), set(deny), stats
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


def copy_tree(src, dst, out_abs, extras, allow=None):
    u"""소스 트리를 dst 로 복사한다. allow(집합)이 주어지면 `catalog/` 아래는 그 목록만 복사.

    돌려주는 값: (복사한 파일 수, 건너뛴 catalog 파일 수, 건너뛴 바이트)
    """
    n = skipped = skipped_b = 0
    cat_root = os.path.abspath(os.path.join(src, 'catalog'))
    for root, dirs, files in os.walk(src):
        rel = os.path.relpath(root, src)
        # dist 자기 자신·제외 폴더 가지치기
        dirs[:] = [d for d in dirs if os.path.abspath(os.path.join(root, d)) != out_abs and want(rel, d, True, extras)]
        aroot = os.path.abspath(root)
        in_catalog = allow is not None and (aroot == cat_root or aroot.startswith(cat_root + os.sep))
        tgt = os.path.join(dst, rel) if rel != '.' else dst
        os.makedirs(tgt, exist_ok=True)
        for f in files:
            sp = os.path.join(root, f)
            if in_catalog:
                key = os.path.relpath(sp, cat_root).replace('\\', '/')
                if key not in allow:
                    skipped += 1
                    try:
                        skipped_b += os.path.getsize(sp)
                    except OSError:
                        pass
                    continue
            elif not want(rel, f, False, extras):
                continue
            shutil.copy2(sp, os.path.join(tgt, f))
            n += 1
    return n, skipped, skipped_b


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--site', default='.')
    ap.add_argument('--out', default='dist')
    ap.add_argument('--include-extras', action='store_true', help='*.bak.html · evidence-*/ 도 복사(legacy 집합)')
    ap.add_argument('--no-stamp', action='store_true')
    ap.add_argument('--no-split', action='store_true', help='critical-split(이미지 외부화·JS defer·늦은 CSS 분리)을 끈다 — 단일 파일 배포본')
    ap.add_argument('--no-allowlist', action='store_true', help='카탈로그 허용 목록을 끄고 catalog/ 를 통째로 복사(옛 동작)')
    a = ap.parse_args()
    site = os.path.abspath(a.site)
    out = os.path.abspath(os.path.join(site, a.out)) if not os.path.isabs(a.out) else a.out
    src_html = os.path.join(site, 'tentwin.html')
    if not os.path.exists(src_html):
        sys.exit('tentwin.html 없음: ' + src_html)
    if os.path.isdir(out):
        shutil.rmtree(out)
    os.makedirs(out)
    # 2b. 카탈로그 허용 목록(판정판 35) — 게임 런타임·관제탑이 부르는 것만 배포한다.
    allow = astats = None
    if not a.no_allowlist:
        allow, _deny, astats = load_allowlist(site)
    n, skipped, skipped_b = copy_tree(site, out, out, a.include_extras, allow)
    if astats:
        print('build-dist 2b 카탈로그 허용 목록: 허용 %d · 제외 %d (%.2fMB 덜 실림) · 전체 %d %.2fMB' % (
            astats['allow_files'], skipped, skipped_b / 1048576.0,
            astats['total_files'], astats['total_bytes'] / 1048576.0))
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
    print('build-dist: 파일 %d 복사 · tentwin.html %d -> %d B (%.1f%%) · out=%s · extras=%s · catalog 제외 %d(%.2fMB)' % (
        n, b0, b1, 100.0 * b1 / b0, out, a.include_extras, skipped, skipped_b / 1048576.0))
    return 0


if __name__ == '__main__':
    sys.exit(main())
