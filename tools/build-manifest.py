# build-manifest.py — catalog 폴더를 스캔해 catalog/manifest.json 을 재생성한다.
#
#   기존 스키마 { "키": {"file": "...", "kb": 0} } 는 그대로 유지하고(게임 tentwin.html
#   과 관제탑 BOARD.html 이 이미 읽는 필드라 형식 불변), 각 항목에 px("W×H") 를 더한다.
#   추가로 최상위 "_superseded" 블록에 catalog/_superseded/ 의 구판 파일을 싣는다
#   (브라우저는 폴더 리스팅을 못 하므로 manifest 가 유일한 목록 출처).
#
#   키 순서: 기존 manifest 순서를 그대로 보존하고, 미등재 신규 파일만 이름순으로 뒤에 붙인다.
#   실행:  python site/tools/build-manifest.py            (manifest 재생성 + staging.json 시딩)
#          python site/tools/build-manifest.py --dry-run  (쓰지 않고 결과만 출력)
import io
import json
import os
import re
import sys
from datetime import datetime

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.dirname(HERE)
CATALOG = os.path.join(SITE, "catalog")
SUPER = os.path.join(CATALOG, "_superseded")
MAN = os.path.join(CATALOG, "manifest.json")
STAGING = os.path.join(SITE, "staging.json")

IMG_EXT = (".webp", ".png", ".jpg", ".jpeg", ".gif")

# _superseded 파일명 규약: <현행스템>-<판구분>.webp
SUFFIX_RE = re.compile(r"^(.+?)-((?:flat-)?v\d+|sep|halo\d+|rim\d+|wm\d+)$")

# 검수탭 시딩: 신규 32파일. tmr 11개는 이미 게임에 배선(W4)되어 "적용",
# 나머지 21개는 사용자 승인 대기.
SEED_APPLIED = ["tmr-%d" % i for i in range(10)] + ["tmr-colon"]
SEED_PENDING = (
    ["ch-%s-%s" % (c, p)
     for c in ("pudding", "sodawitch", "mongle", "churup")
     for p in ("face", "full", "portrait", "thumb")]
    + ["cut-free-1", "cut-free-2"]
    + ["duel-demon-full-straw", "duel-demon-full-soda", "duel-demon-full-grape"]
)
SEED_NOTE = {
    "face": "표정 컷 — 대사·컷인용 얼굴",
    "full": "전신 — 캐릭터 선택·소개용",
    "portrait": "반신 — HUD·패널 초상",
    "thumb": "썸네일 — 목록 아이콘",
    "cut-free-1": "컷신 — 해방 연출 1",
    "cut-free-2": "컷신 — 해방 연출 2",
    "duel-demon-full-straw": "보스 전신 — 딸기 속성 변형",
    "duel-demon-full-soda": "보스 전신 — 소다 속성 변형",
    "duel-demon-full-grape": "보스 전신 — 포도 속성 변형",
}


def load_json(path):
    if not os.path.exists(path):
        return None
    with io.open(path, encoding="utf-8-sig") as f:
        return json.load(f)


def kb_of(path):
    return round(os.path.getsize(path) / 1024)


def px_of(path):
    try:
        with Image.open(path) as im:
            return "%d×%d" % im.size
    except Exception:
        return ""


def mtime_of(path):
    return datetime.fromtimestamp(os.path.getmtime(path)).strftime("%Y-%m-%d %H:%M")


def scan(folder):
    if not os.path.isdir(folder):
        return []
    return sorted(f for f in os.listdir(folder)
                  if f.lower().endswith(IMG_EXT)
                  and os.path.isfile(os.path.join(folder, f)))


def stem_of(name):
    """구판 파일명 -> (현행 스템, 판구분). 규약에 맞지 않으면 (None, None)."""
    base = os.path.splitext(name)[0]
    m = SUFFIX_RE.match(base)
    if not m:
        return None, None
    return m.group(1), m.group(2)


def build():
    old = load_json(MAN) or {}
    old_order = [k for k in old.keys() if not k.startswith("_")]

    files = scan(CATALOG)
    by_key = {os.path.splitext(f)[0]: f for f in files}

    ordered = [k for k in old_order if k in by_key]
    added = sorted(k for k in by_key if k not in set(ordered))
    ordered += added
    dropped = [k for k in old_order if k not in by_key]

    out = {}
    for k in ordered:
        p = os.path.join(CATALOG, by_key[k])
        out[k] = {"file": by_key[k], "kb": kb_of(p), "px": px_of(p)}

    sup = {}
    for f in scan(SUPER):
        p = os.path.join(SUPER, f)
        stem, ver = stem_of(f)
        sup[f] = {"kb": kb_of(p), "px": px_of(p), "mtime": mtime_of(p)}
        if stem in out:
            sup[f]["stem"] = stem
            sup[f]["ver"] = ver
    out["_superseded"] = sup
    return out, added, dropped, sup


def seed_staging(man):
    """staging.json 이 없을 때만 만든다(사용자 승인 기록이므로 덮어쓰지 않는다)."""
    if os.path.exists(STAGING):
        return None
    today = datetime.now().strftime("%Y-%m-%d")
    st = {}
    for k in SEED_APPLIED:
        if k in man:
            st[k] = {"state": "적용", "note": "타임러시 숫자 글리프 — W4 배선 완료", "t": today}
    for k in SEED_PENDING:
        if k not in man:
            continue
        note = SEED_NOTE.get(k) or SEED_NOTE.get(k.rsplit("-", 1)[-1], "신규 에셋 — 검수 대기")
        st[k] = {"state": "대기", "note": note, "t": today}
    return st


def write_json(path, obj):
    with io.open(path, "w", encoding="utf-8", newline="\n") as f:
        json.dump(obj, f, ensure_ascii=False, indent=2)
        f.write("\n")


def main():
    dry = "--dry-run" in sys.argv
    man, added, dropped, sup = build()
    n = len(man) - 1
    print("catalog 항목 %d개 (신규 편입 %d, 사라진 항목 %d)" % (n, len(added), len(dropped)))
    if added:
        print("  + " + ", ".join(added))
    if dropped:
        print("  - " + ", ".join(dropped))
    matched = sum(1 for v in sup.values() if "stem" in v)
    print("_superseded %d개 (현행 스템 매칭 %d)" % (len(sup), matched))

    st = seed_staging(man)
    if st is not None:
        cnt = {}
        for v in st.values():
            cnt[v["state"]] = cnt.get(v["state"], 0) + 1
        print("staging.json 시딩 %d건 %s" % (len(st), cnt))
    else:
        print("staging.json 이미 있음 — 보존")

    if dry:
        print("(dry-run: 파일을 쓰지 않았습니다)")
        return
    write_json(MAN, man)
    if st is not None:
        write_json(STAGING, st)
    print("완료: %s" % MAN)


if __name__ == "__main__":
    main()
