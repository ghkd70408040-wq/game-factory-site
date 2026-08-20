# -*- coding: utf-8 -*-
# build-usage-map.py — tentwin.html 을 **실측**해 "게임이 지금 실제로 쓰는 배경"을
#   site/usage-map.json 으로 굽는다. 관제탑(BOARD.html)이 이 파일을 읽어 배경 카드에
#   "✅ 현재 게임 배경 — 메뉴(낮)" 배지를 단다.
#
#   왜 필요한가: 카탈로그에는 art-map-bg 와 stage-bg 처럼 **같은 자리를 노리는 두 장**
#   이 나란히 들어 있는데, 어느 쪽이 실제로 배선돼 있는지는 35,000줄짜리 tentwin.html
#   안에서만 알 수 있었다. 손으로 적어 두면 곧 거짓말이 되므로 매 파도마다 다시 굽는다.
#
#   읽기 전용이다 — tentwin.html 은 한 바이트도 건드리지 않는다.
#
#   실측 경로 3가지
#     ① CSS 배경 슬롯 : <style> 블록을 브레이스 단위로 훑어 background/background-image
#                       선언의 var(--art-*) · url("catalog/*.webp") 를 잡는다.
#     ② 스토리 컷 표  : JS 의 컷 정의 배열 ['o1', '--art-menu-day', ...] 을 센다.
#     ③ 지도 노드 표  : MAP_ANCHORS 의 '--art-nNN' 원반 배정을 센다.
#
#   실행:  python site/tools/build-usage-map.py
#          python site/tools/build-usage-map.py --dry-run
import io
import json
import os
import re
import sys
from datetime import datetime

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

HERE = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.dirname(HERE)
GAME = os.path.join(SITE, "tentwin.html")
MAN = os.path.join(SITE, "catalog", "manifest.json")
OUT = os.path.join(SITE, "usage-map.json")

# ── 배경 슬롯 정본 ────────────────────────────────────────────────────────────
#   (정규화된 셀렉터, 슬롯 id, 사람이 읽는 이름, 종류)
#   kind: bg  = 화면을 덮는 배경      → "✅ 현재 게임 배경 — <이름>"
#         art = 배경은 아닌 배선 그림 → "✅ 게임 배선 — <이름>"
SLOTS = [
    ("#screen-menu::before",             "menu-day",     "메뉴(낮)",           "bg"),
    ("#screen-menu.is-night::before",    "menu-night",   "메뉴(밤)",           "bg"),
    ("#splash",                          "splash-day",   "스플래시(낮)",       "bg"),
    ("#screen-menu.is-night ~ #splash",  "splash-night", "스플래시(밤)",       "bg"),
    ("#map-layer",                       "map",          "스테이지 지도",      "bg"),
    ("#app.battle #screen-game",         "battle",       "인게임 전투 배경",   "bg"),
    (".cp-sky",                          "charstage",    "캐릭터 선택 무대",   "bg"),
    ("#hurry-cast::before",              "hurrycast",    "시간압박 컷인 감옥", "art"),
    (".logo-img",                        "logo-menu",    "메뉴 로고",          "art"),
    (".splash-logo",                     "logo-splash",  "스플래시 로고",      "art"),
]
SLOT_BY_SEL = {s[0]: s for s in SLOTS}

DATA_URL_RE = re.compile(r'url\(\s*"data:[^"]*"\s*\)')
COMMENT_RE = re.compile(r"/\*.*?\*/", re.S)
STYLE_RE = re.compile(r"<style\b[^>]*>(.*?)</style>", re.S | re.I)
BG_PROP = ("background", "background-image")
VAR_RE = re.compile(r"var\(\s*(--art-[a-z0-9-]+)")
URL_RE = re.compile(r'url\(\s*"catalog/([A-Za-z0-9_.-]+?)\.(?:webp|png|jpg|jpeg)')


def read(path):
    with io.open(path, encoding="utf-8") as f:
        return f.read()


def line_of(text, pos):
    return text.count("\n", 0, pos) + 1


def blank(m):
    """주석을 지우되 **줄 수는 보존**한다 — 안 그러면 보고되는 줄 번호가 틀어진다."""
    return re.sub(r"[^\n]", " ", m.group(0))


def scrub(css):
    """base64 데이터 URI 를 먼저 치워 놓고 주석을 지운다.
       (base64 알파벳에 '/' 가 있어서 순서를 바꾸면 '/*' 가 우연히 생긴다.)"""
    css = DATA_URL_RE.sub('url("data:")', css)      # 한 줄짜리라 줄 수 불변
    return COMMENT_RE.sub(blank, css)


def norm_sel(s):
    s = re.sub(r"\s+", " ", s).strip()
    s = re.sub(r"\s*([>~+,])\s*", r" \1 ", s)      # 결합자 좌우 한 칸
    s = re.sub(r"\s*,\s*", ", ", s)
    return re.sub(r"\s+", " ", s).strip()


def walk_css(css, base_line):
    """(selector, prop, value, line, media) 를 뱉는 아주 작은 CSS 워커."""
    stack = []            # [(kind, text)] kind: 'sel' | 'at'
    buf = []
    i, n = 0, len(css)
    while i < n:
        c = css[i]
        if c == "{":
            head = "".join(buf).strip()
            buf = []
            stack.append(("at", head) if head.startswith("@") else ("sel", norm_sel(head)))
        elif c == "}":
            buf = []
            if stack:
                stack.pop()
        elif c == ";":
            decl = "".join(buf).strip()
            buf = []
            if ":" in decl and stack and stack[-1][0] == "sel":
                prop, _, val = decl.partition(":")
                prop = prop.strip().lower()
                if prop in BG_PROP:
                    media = " ".join(t for k, t in stack[:-1] if k == "at")
                    yield stack[-1][1], prop, val.strip(), base_line + css.count("\n", 0, i), media
        else:
            buf.append(c)
        i += 1


def css_slots(raw):
    """CSS 에서 배경 슬롯을 실측한다. 같은 슬롯이 여러 번 나오면 **뒤가 이긴다**
       (미디어쿼리 분기는 조건을 이름에 달아 따로 남긴다)."""
    found = {}
    order = []
    for m in STYLE_RE.finditer(raw):
        block = m.group(1)
        base = line_of(raw, m.start(1))
        for sel, prop, val, ln, media in walk_css(scrub(block), base):
            for one in sel.split(", "):
                slot = SLOT_BY_SEL.get(one)
                if not slot:
                    continue
                keys = VAR_RE.findall(val)
                keys = [k[2:] for k in keys]                  # --art-menu-day -> art-menu-day
                keys += URL_RE.findall(val)
                if not keys:
                    continue
                cond = ""
                mm = re.search(r"\(([^)]*)\)", media or "")
                if media:
                    cond = "가로·데스크톱" if "aspect-ratio" in media else (mm.group(1) if mm else media)
                sid = slot[1] + ("@" + re.sub(r"[^0-9a-z]+", "-", cond.lower()).strip("-") if cond else "")
                rec = {
                    "id": sid,
                    "slot": slot[1],
                    "label": slot[2] + ((" · " + cond) if cond else ""),
                    "kind": slot[3],
                    "key": keys[-1],
                    "keys": keys,
                    "selector": one,
                    "line": ln,
                    "media": media or "",
                }
                if sid not in found:
                    order.append(sid)
                found[sid] = rec
    return [found[k] for k in order]


def js_extras(raw):
    """CSS 밖에서 배선되는 그림 둘 — 스토리 컷 배경표와 지도 노드 원반표."""
    out = []
    body = COMMENT_RE.sub(blank, DATA_URL_RE.sub('url("data:")', raw))

    cuts = {}
    for m in re.finditer(r"\[\s*'([a-z]+\d+[a-z]?)'\s*,\s*'(--art-[a-z0-9-]+)'", body):
        cuts.setdefault(m.group(2)[2:], []).append(m.group(1))
    for key, ids in cuts.items():
        uniq = sorted(set(ids))
        out.append({
            "id": "cut-" + key, "slot": "cut", "kind": "cut",
            "label": "스토리 컷 배경 %d컷" % len(uniq),
            "cuts": uniq,
            "key": key, "keys": [key], "selector": "CUTS 표(JS)", "line": 0, "media": "",
        })

    nodes = {}
    for m in re.finditer(r"'(--art-n\d+)'", body):
        nodes[m.group(1)[2:]] = nodes.get(m.group(1)[2:], 0) + 1
    for key, cnt in nodes.items():
        out.append({
            "id": "node-" + key, "slot": "mapnode", "kind": "art",
            "label": "스테이지 지도 노드 원반 %d칸" % cnt,
            "key": key, "keys": [key], "selector": "MAP_ANCHORS 표(JS)", "line": 0, "media": "",
        })
    return out


def build():
    raw = read(GAME)
    slots = css_slots(raw)
    extras = js_extras(raw)
    allrec = slots + extras

    by_key = {}
    for r in allrec:
        by_key.setdefault(r["key"], []).append(r["label"])

    backgrounds = {}
    for r in slots:
        backgrounds.setdefault(r["slot"], r["key"])

    man = {}
    if os.path.exists(MAN):
        with io.open(MAN, encoding="utf-8-sig") as f:
            man = json.load(f)
    missing = sorted(k for k in by_key if k not in man)

    return {
        "generated": datetime.now().strftime("%Y-%m-%d %H:%M"),
        "source": "tentwin.html",
        "backgrounds": backgrounds,
        "slots": slots,
        "extras": extras,
        "byKey": by_key,
        "notInCatalog": missing,
    }


def main():
    out = build()
    print("배경 슬롯 %d개 · 부가 배선 %d개 · 배선된 에셋 키 %d개"
          % (len(out["slots"]), len(out["extras"]), len(out["byKey"])))
    for r in out["slots"]:
        print("  %-28s %-24s <- %s  (line %d)" % (r["label"], r["selector"], r["key"], r["line"]))
    if out["notInCatalog"]:
        print("  ⚠ 카탈로그에 없는 키: " + ", ".join(out["notInCatalog"]))
    if "--dry-run" in sys.argv:
        print("(dry-run: 파일을 쓰지 않았습니다)")
        return
    with io.open(OUT, "w", encoding="utf-8", newline="\n") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print("완료: %s" % OUT)


if __name__ == "__main__":
    main()
