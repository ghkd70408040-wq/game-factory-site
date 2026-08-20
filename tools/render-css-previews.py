# -*- coding: utf-8 -*-
# render-css-previews.py — 관제탑의 "코드 구현(css)" 부품에 **실물 그림**을 붙인다.
#
#   문제: 코드로 그린 부품(젤리 캡슐·컷인·콤보 배너·설정 토글 …)은 카탈로그에 파일이
#   없어서 관제탑 카드가 "코드·CSS" 라는 글자 한 줄뿐이었다 — 무엇인지 볼 수가 없다.
#
#   원칙: **CSS 재현 금지**. 관제탑 안에서 비슷하게 다시 그리지 않는다. 실제
#   tentwin.html 을 http 로 띄우고, 이미 있는 ?screen= 훅으로 그 화면까지 몰고 간 뒤,
#   요소를 그 자리에서 잘라 찍는다. 그래서 나오는 그림은 언제나 게임의 현재 모습이다.
#
#   출력: site/catalog/_css-previews/<id>.png  +  같은 폴더의 index.json
#         (index.json 의 names[] 가 board-data.json 의 항목 이름과 짝지어진다)
#
#   ⚠ tentwin.html 은 **읽기 전용**이다. 이 스크립트는 한 바이트도 쓰지 않는다.
#   ⚠ msedge 는 동시 1개, try/finally 로 반드시 닫는다.
#
#   실행:  python site/tools/render-css-previews.py
#          python site/tools/render-css-previews.py --probe   (찍지 않고 셀렉터만 점검)
import io
import json
import os
import shutil
import sys
import threading
import functools
import http.server
import socketserver
from datetime import datetime

from playwright.sync_api import sync_playwright

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

HERE = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.dirname(HERE)
OUTDIR = os.path.join(SITE, "catalog", "_css-previews")
INDEX = os.path.join(OUTDIR, "index.json")
PORT = 8753
VIEW = {"width": 390, "height": 844}

# ── 촬영 목록 ────────────────────────────────────────────────────────────────
#   (id, screen, selector, label, [board-data 항목 이름들], prep-js)
#   screen  : tentwin.html 의 ?screen= 훅 키. ""(빈칸)이면 스플래시 그대로.
#   names   : board-data.json 의 상태 css 항목 이름 — 관제탑이 이 이름으로 그림을 찾는다.
#   prep-js : 그 부품이 "떠 있는 상태"를 만들어야 할 때만. 게임 함수는 건드리지 않고
#             DOM 클래스/속성만 세운다(연출은 애니메이션을 정지 프레임으로 얼린다).
#   ⚠ 연출 3종(콤보 배너·공격 배너·컷인)은 `forwards` 로 끝 프레임을 붙잡는 애니메이션
#     이라 "다 끝난 상태 = 투명"이다. 그래서 애니메이션만 끄고 **정지 상태의 모습**을
#     인라인으로 세운다 — 색·외곽선·그림자는 전부 게임 CSS 가 그대로 그린다.
REST = ("function R(el,tf){if(!el)return;el.style.animation='none';el.style.opacity='1';"
        "if(tf)el.style.transform=tf;}")

SHOTS = [
    # ── 스플래시 ──────────────────────────────────────────────────────────
    ("splash-scrim", "", ".splash-tap", "스플래시 스크림 판", ["스크림 판"], None),
    ("splash-tap", "", ".splash-tap-t", "터치 문구(숨쉬기)", ["터치 문구 + 숨쉬기"], None),
    # ── 메뉴 ──────────────────────────────────────────────────────────────
    ("menu-tagline", "menu", "#screen-menu .tagline", "규칙 말풍선", ["규칙 말풍선"], None),
    ("menu-btnlabels", "menu", "#screen-menu .menu-stack", "메뉴 버튼 글자 4종",
     ["버튼 글자 4종"], None),
    ("menu-best", "menu", "#menu-best", "메뉴 하단 최고기록 줄", [], None),
    # ── 플레이(모드 시트) ────────────────────────────────────────────────
    ("mode-title", "play", "#mode-h", "제목 「플레이」(그라데이션 글자)",
     ["제목 「플레이」 (리본 폐기)"], None),
    # ── 캐릭터 선택 ──────────────────────────────────────────────────────
    ("char-sky", "character", ".cp-sky", "캐릭터 무대 배경", ["배경 — 캐릭터 무대"], None),
    ("char-info", "character", "#cp-info", "스탯창 카드", ["스탯창 카드", "패시브 띠"], None),
    ("char-skinbtn", "character", "#cp-skin", "스킨 버튼", ["스킨 버튼"], None),
    # ── 스킨 창 ──────────────────────────────────────────────────────────
    ("skin-panel", "skin", "#modal-skin .sheet", "스킨 창 판·헤드", ["판·헤드"], None),
    ("skin-list", "skin", "#sk-list", "스킨 목록 카드", ["스킨 목록 카드"], None),
    ("skin-close", "skin", "#sk-close", "스킨 창 닫기", ["닫기"], None),
    # ── 설정 ─────────────────────────────────────────────────────────────
    ("set-panel", "settings", "#modal-settings .sheet", "설정 판 기본 틀", ["판 기본 틀"], None),
    ("set-sound", "settings", "#st-sound", "소리 행+토글", ["소리 행+토글"], None),
    ("set-vibe", "settings", "#st-vibe", "진동 행+토글", ["진동 행+토글"], None),
    ("set-theme", "settings", "#st-theme", "테마 행+토글", ["테마 행+토글"], None),
    ("set-lang", "settings", "#st-lang", "언어 행+토글", ["언어 행+토글"], None),
    ("set-rank", "settings", "#st-rank", "기록 버튼", ["기록 버튼"], None),
    ("set-gallery", "settings", "#st-gallery", "스토리 갤러리 버튼", ["스토리 갤러리 버튼"],
     "var e=document.getElementById('st-gallery');if(e){e.hidden=false;e.style.display='';}"),
    ("set-howto", "settings", "#st-howto", "게임방법 버튼", ["게임방법 버튼"], None),
    ("set-credits", "settings", "#st-credits", "제작진 버튼", ["제작진 버튼"], None),
    ("set-close", "settings", "#st-close", "설정 닫기", ["닫기"], None),
    # ── 기록 창 ──────────────────────────────────────────────────────────
    ("rank-panel", "records", "#modal-rank .sheet", "기록 창 판·헤드", ["판·헤드"], None),
    ("rank-tabs", "records", "#rank-tabs", "기록 탭 3종", ["탭 3종"], None),
    ("rank-hint", "records", "#rank-hint", "기록 힌트 줄", ["힌트 줄"], None),
    ("rank-close", "records", "#rank-close", "기록 창 닫기", ["닫기"], None),
    # ── 게임방법 ─────────────────────────────────────────────────────────
    ("howto-panel", "howto", "#modal-howto .sheet", "게임방법 판·단계 그림",
     ["게임방법 판·단계 그림"], None),
    ("howto-dots", "howto", "#howto-dots", "진행 점 3개·건너뛰기", ["진행 점 3개·건너뛰기"], None),
    # ── 스테이지 정보 창 ─────────────────────────────────────────────────
    ("node-panel", "stageinfo", "#modal-node .sheet", "스테이지 정보 판·리본 헤드·닫기",
     ["판·리본 헤드·닫기"], None),
    ("node-boss", "stageinfo", "#node-boss", "보스 사전공개 블록",
     ["보스 사전공개 블록", "벡터 보스 아바타"],
     "var g=window.Game;if(g&&g.store)g.store.advMax=10;"
     "if(g&&g.openNodeCard)g.openNodeCard(10);"),
    ("node-mission", "stageinfo", "#node-mission", "미션 줄+추천 캐릭터 썸네일",
     ["미션 줄+추천 캐릭터 썸네일"], None),
    ("node-mates", "stageinfo", "#node-mates", "동료 줄(아바타 토글)", ["동료 줄(아바타 토글)"], None),
    ("node-ad", "stageinfo", "#node-ad", "광고 자리(보상형: 하트)", ["광고 자리(보상형: 하트)"],
     "var e=document.getElementById('node-ad');if(e){e.hidden=false;e.style.display='';}"),
    ("node-hand", "stageinfo", "#node-hand", "하트 잔량 줄", ["하트 잔량 줄"], None),
    # ── 인게임 ───────────────────────────────────────────────────────────
    ("game-pause", "game", "#btn-pause", "일시정지 버튼", ["일시정지 버튼"], None),
    ("game-stats", "game", "#tb-stats", "점수판(단계·점수·최고)", ["점수판(단계·점수·최고)"],
     "var e=document.getElementById('tb-stats');if(e)e.style.display='flex';"),
    ("game-moves", "game", "#stat-moves", "남은 짝", ["남은 짝"],
     "var e=document.getElementById('tb-stats');if(e)e.style.display='flex';"),
    ("game-hudrow", "game", "#hud-row", "목표 판·미션 판", ["목표 판·미션 판"], None),
    ("battle-hp-foe", "game", "#duel-hud .dh-foe", "전투 HUD — 악당 HP바",
     ["전투 HUD — 악당 HP바(코드 임시)", "HP바 틀 — 악당(자주 유리)"], None),
    ("battle-hp-me", "game", "#duel-hud .dh-me", "전투 HUD — 내 HP바",
     ["전투 HUD — 내 HP바(코드 임시)", "HP바 틀 — 아군(하늘 유리)"], None),
    ("battle-timer", "game", "#duel-timer", "전투 타이머 젤리 캡슐",
     ["전투 타이머 젤리 캡슐(코드 임시)", "타이머 유리판"], None),
    ("battle-timer-danger", "game", "#duel-timer", "전투 타이머 — 막판 10초(danger)",
     [], "document.getElementById('app').classList.add('danger');"),
    ("battle-timer-chill", "game", "#duel-timer", "전투 타이머 — 얼음(시간 정지)",
     [], "document.getElementById('app').classList.add('chill');"),
    ("game-toast", "game", "#toast", "토스트 알림 띠", ["토스트 알림 띠"],
     "var t=document.getElementById('toast');t.textContent='토스트 알림 띠';"
     "t.classList.add('show');"),
    ("game-combo", "game", "#combo-banner", "콤보 팝(배너)", ["콤보 팝"],
     REST + "document.getElementById('cb-num').textContent='12 COMBO!!';"
     "document.getElementById('cb-word').textContent='ULTRA';"
     "R(document.getElementById('combo-banner'),'translate(-50%,-50%) scale(1)');"),
    ("game-cutin", "game", "#cutin .cut-txt", "필살기 컷인 — 기술명", ["필살기 발동 연출(코드)"],
     REST + "var e=document.getElementById('cutin');e.hidden=false;e.className='go';"
     "document.getElementById('cutin-sub').textContent='필살기';"
     "document.getElementById('cutin-name').textContent='젤리 브레이크';"
     "R(e.querySelector('.cut-txt'),'translate(0,-50%)');"),
    ("game-bang", "game", "#bang-card", "공격 자동 발동 연출", ["공격 자동 발동 연출(코드)"],
     REST + "var e=document.getElementById('bang');e.hidden=false;e.className='go';"
     "document.getElementById('bang-n').textContent='STAGE 1';"
     "document.getElementById('bang-big').textContent='9 짝 만들기';"
     "document.getElementById('bang-sub').textContent='보너스 미션 — 콤보 8';"
     "R(document.getElementById('bang-card'),'translate(-50%,-50%)');"
     "R(document.getElementById('bang-dim'),'');"),
    ("game-tile-sel", "game", "#board .tile", "과일 타일 — 선택·연결 하이라이트",
     ["선택·연결 하이라이트"],
     "var t=document.querySelector('#board .tile');if(t)t.classList.add('sel');"),
    # ── 일시정지 / 결과 ──────────────────────────────────────────────────
    ("pause-panel", "pause", "#modal-pause .sheet", "일시정지 창",
     ["일시정지 창(소리·진동·테마·언어·게임방법·재시작·메뉴·이어하기)"], None),
    ("adv-panel", "clear", "#modal-adv .sheet", "모험 결과 창",
     ["모험 결과 창(성공·실패 겸용: 별·점수·하트·재도전·지도)"], None),
    # ── 스토리 ───────────────────────────────────────────────────────────
    ("story-bar", "story", "#cut-bar", "대사 띠·넘기기·건너뛰기", ["대사 띠·넘기기·건너뛰기"], None),
]


def serve():
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=SITE)

    class Q(socketserver.TCPServer):
        allow_reuse_address = True

    httpd = Q(("127.0.0.1", PORT), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd


def by_screen(shots):
    order, groups = [], {}
    for s in shots:
        if s[1] not in groups:
            order.append(s[1])
            groups[s[1]] = []
        groups[s[1]].append(s)
    return [(k, groups[k]) for k in order]


def goto(pg, screen):
    url = "http://127.0.0.1:%d/tentwin.html" % PORT
    if screen:
        url += "?screen=" + screen
    pg.goto(url, wait_until="load")
    pg.wait_for_timeout(400)
    if not screen:
        pg.wait_for_timeout(900)
        return True
    # ?screen= 훅은 최대 8초까지 되풀이한다 — 그 창을 그대로 기다린다.
    for _ in range(40):
        pg.wait_for_timeout(250)
        try:
            done = pg.evaluate(
                "(function(k){var m={menu:'screen-menu',play:'modal-mode',character:'charpanel',"
                "skin:'modal-skin',settings:'modal-settings',records:'modal-rank',howto:'modal-howto',"
                "story:'screen-story',map:'screen-map',stageinfo:'modal-node',game:'screen-game',"
                "pause:'modal-pause',clear:'modal-adv',over:'modal-adv'};"
                "var e=document.getElementById(m[k]||'');if(!e)return false;"
                "return e.classList.contains('screen')?e.classList.contains('active'):!e.hidden;})",
                screen)
        except Exception:
            done = False
        if done:
            pg.wait_for_timeout(700)
            return True
    return False


MAXPX = 760      # 관제탑 썸네일·라이트박스에 충분한 상한 (2x 캡처를 여기서 재운다)


def shrink(path):
    """저장소에 들어가는 그림이므로 크기를 재운다 — 긴 변 MAXPX, PNG 최적화."""
    try:
        from PIL import Image
    except Exception:
        return
    with Image.open(path) as im:
        im = im.convert("RGBA")
        w, h = im.size
        f = min(1.0, MAXPX / float(max(w, h)))
        if f < 1.0:
            im = im.resize((max(1, int(w * f)), max(1, int(h * f))), Image.LANCZOS)
        im.save(path, "PNG", optimize=True)


def shoot(pg, sid, selector, prep, probe):
    if prep:
        try:
            pg.evaluate("()=>{%s}" % prep)
        except Exception as e:
            return None, "prep 실패: %s" % str(e)[:60]
        pg.wait_for_timeout(260)
    el = None
    for one in selector.split(", "):
        try:
            el = pg.query_selector(one)
        except Exception:
            el = None
        if el:
            selector = one
            break
    if not el:
        return None, "셀렉터 없음"
    box = el.bounding_box()
    if not box or box["width"] < 6 or box["height"] < 6:
        return None, "화면에 없음(크기 0)"
    pad = 5
    clip = {
        "x": max(0, box["x"] - pad),
        "y": max(0, box["y"] - pad),
        "width": min(VIEW["width"], box["width"] + pad * 2),
        "height": min(VIEW["height"], box["height"] + pad * 2),
    }
    clip["width"] = min(clip["width"], VIEW["width"] - clip["x"])
    clip["height"] = min(clip["height"], VIEW["height"] - clip["y"])
    if clip["width"] < 6 or clip["height"] < 6:
        return None, "뷰포트 밖"
    if probe:
        return {"px": "%d×%d" % (round(box["width"]), round(box["height"])),
                "selector": selector}, None
    path = os.path.join(OUTDIR, sid + ".png")
    pg.screenshot(path=path, clip=clip, animations="allow")
    shrink(path)
    return {"file": sid + ".png",
            "px": "%d×%d" % (round(box["width"]), round(box["height"])),
            "kb": round(os.path.getsize(path) / 1024),
            "selector": selector}, None


def main():
    probe = "--probe" in sys.argv
    if not probe:
        if os.path.isdir(OUTDIR):
            shutil.rmtree(OUTDIR)
        os.makedirs(OUTDIR)

    httpd = serve()
    items, skipped, errs = [], [], []
    pw = sync_playwright().start()
    br = None
    try:
        br = pw.chromium.launch(channel="msedge", headless=True)
        ctx = br.new_context(viewport=VIEW, device_scale_factor=2,
                             reduced_motion="reduce", has_touch=True, is_mobile=True)
        pg = ctx.new_page()
        pg.on("pageerror", lambda e: errs.append(str(e)[:120]))
        pg.on("console", lambda m: errs.append(m.text[:120]) if m.type == "error" else None)

        for screen, group in by_screen(SHOTS):
            ok = goto(pg, screen) or goto(pg, screen)   # 훅이 8초 안에 못 서면 한 번 더
            label = screen or "(스플래시)"
            if not ok:
                for s in group:
                    skipped.append({"id": s[0], "label": s[3], "reason": "화면 진입 실패(%s)" % label})
                print("  ✗ %-10s 화면 진입 실패 — %d건 건너뜀" % (label, len(group)))
                continue
            print("  · %s" % label)
            reload_needed = False
            for sid, _, sel, lab, names, prep in group:
                if reload_needed:
                    goto(pg, screen)
                    reload_needed = False
                res, why = shoot(pg, sid, sel, prep, probe)
                if prep:
                    reload_needed = True        # 상태를 세웠으면 다음 컷을 위해 되돌린다
                if why:
                    skipped.append({"id": sid, "label": lab, "reason": why})
                    print("      ✗ %-22s %s" % (sid, why))
                    continue
                rec = {"id": sid, "label": lab, "screen": screen, "names": names}
                rec.update(res)
                items.append(rec)
                print("      ✓ %-22s %s" % (sid, res["px"]))
    finally:
        if br:
            br.close()
        pw.stop()
        httpd.shutdown()

    print("\n생성 %d개 · 건너뜀 %d개" % (len(items), len(skipped)))
    for s in skipped:
        print("  건너뜀: %s (%s) — %s" % (s["label"], s["id"], s["reason"]))
    if errs:
        print("  ⚠ 게임 콘솔 %d건: %s" % (len(errs), errs[:3]))
    if probe:
        print("(probe: 파일을 쓰지 않았습니다)")
        return
    out = {"generated": datetime.now().strftime("%Y-%m-%d %H:%M"),
           "source": "tentwin.html", "viewport": "390×844@2x",
           "items": items, "skipped": skipped}
    with io.open(INDEX, "w", encoding="utf-8", newline="\n") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print("완료: %s" % INDEX)


if __name__ == "__main__":
    main()
