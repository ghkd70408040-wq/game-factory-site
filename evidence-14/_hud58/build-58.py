# -*- coding: utf-8 -*-
"""58-hud.png — 인게임 HUD(RES 젤리 아이콘 + STAT 에너지바) 3자 비교 시트.

  1배율 3열  [시안 | 게임 실화면 | 코드 부품]
  · 판정 배율 규약(DESIGN-KNOWLEDGE §3.28): 390px 폭 · DPR3 = 1 CSS px → 3 image px.
    세 열을 전부 그 배율로 정규화한다(시안 768px = 390 CSS → ×1.5234).
  · 확대는 200% 인셋 1곳(원인 분석용)에만 쓴다.
"""
import os
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = r"C:\workspace\game-factory"
OUT  = os.path.join(ROOT, "site", "evidence-14", "58-hud.png")

F  = lambda s, b=False: ImageFont.truetype(
        r"C:\Windows\Fonts\malgunbd.ttf" if b else r"C:\Windows\Fonts\malgun.ttf", s)

BG      = (34, 26, 40)
PANEL   = (48, 38, 56)
LINE    = (92, 76, 104)
INK     = (238, 232, 244)
DIM     = (170, 158, 184)
OK      = (109, 221, 167)
NG      = (241, 122, 122)
WARN    = (255, 211, 74)
ACC     = (255, 210, 160)

DPR = 3
SCALE_SIAN = DPR * 390 / 768.0          # 시안 768px 폭 = 390 CSS px

def load(p):
    return Image.open(os.path.join(HERE, p)).convert("RGB")

def sian(box):
    im = Image.open(os.path.join(
        ROOT, "tentwin", "assets", "art", "incoming", "mockup",
        "gm-classic-target.jpg")).convert("RGB").crop(box)
    w = int(round(im.width * SCALE_SIAN)); h = int(round(im.height * SCALE_SIAN))
    return im.resize((w, h), Image.LANCZOS)

# ── 소재 ────────────────────────────────────────────────────────────────
sian_ico  = sian((18, 140, 762, 194))
sian_bar  = sian((18, 188, 762, 232))
game_top  = load("game-hud-top.png")
game_gau  = load("game-gauge.png")
code_ico  = load("x-lab-res-all.png")
code_gau  = load("x-lab-gauge-steps.png")
code_jc   = load("x-lab-jelly-circle.png")
code_jb   = load("x-lab-jelly-bar.png")

COL = 1170                              # 열 폭 = 390 CSS px @DPR3
GAP = 34
PAD = 40
W   = PAD * 2 + COL * 3 + GAP * 2

def fit(im, w=COL):
    """열 폭을 넘으면 줄이고, 모자라면 그대로 둔다(확대 금지 — 1배율 규약)."""
    if im.width <= w:
        return im
    return im.resize((w, int(round(im.height * w / im.width))), Image.LANCZOS)

sian_ico, sian_bar = fit(sian_ico), fit(sian_bar)
game_top, game_gau = fit(game_top), fit(game_gau)
code_ico, code_gau = fit(code_ico), fit(code_gau)
code_jc,  code_jb  = fit(code_jc),  fit(code_jb)

# ── 역할 대조표 (§0-B) ──────────────────────────────────────────────────
ROLES = [
    # 역할, 시안이 한 방식, 우리 현행, 킷 보유, 채택, 사유
    ("RES", "글리프+값 칩 (◎목표 · ◆재화)", "없음 — 텍스트 스탯만",
     "lib-glyph 12종 🟡", "도입", "픽셀 비교로는 안 보이던 빈칸"),
    ("STAT", "유리판에 잠긴 캡슐 게이지 3개", "콤보·피버·보스HP 3개(납작 띠)",
     "bar 🟡 / .kit-jelly 🟢", "혼합", "구조는 시안, 색·질감은 우리 토큰"),
    ("STATE", "게이지 색만으로 위험 표시", "#app.hurry 전역 클래스",
     "chip 🟡", "우리 유지", "전역 연출이 더 강하다 — 시각 분해 제외"),
    ("DESC", "목표 문구 («5번 세로줄 싹 비우기»)", "#mission-badge 텍스트",
     "pill 🟡", "우리 유지", "현행이 이미 코드·i18n"),
    ("NAV", "좌상단 일시정지 알약", "#btn-pause icon-btn", "button 🟢",
     "우리 유지", "동률 — 뜯지 않는다"),
    ("FOCUS", "타이머 캡슐 (2:00 대형)", "#stat-timer 텍스트", "없음",
     "보류", "타이머 글리프는 별건(tmr-*.webp 존재)"),
    ("AMB", "유리판·하늘 배경", "--lib-hud-bar 9슬라이스 띠", "overlay 🟡",
     "우리 유지", "L0 — 애초에 킷으로 덮는 종류가 아니다"),
]

# ── 캔버스 ──────────────────────────────────────────────────────────────
H = 7200
sheet = Image.new("RGB", (W, H), BG)
d = ImageDraw.Draw(sheet)

def text(x, y, s, size=26, bold=False, fill=INK):
    d.text((x, y), s, font=F(size, bold), fill=fill)
    return y + int(size * 1.5)

def panel(x, y, w, h, c=PANEL):
    d.rounded_rectangle([x, y, x + w, y + h], 16, fill=c, outline=LINE, width=2)

def colhead(x, y, n, s, c):
    d.rounded_rectangle([x, y, x + COL, y + 52], 10, fill=c)
    d.text((x + 18, y + 11), f"{n}  {s}", font=F(27, True), fill=(24, 18, 28))
    return y + 66

def place(im, x, y, cap=None):
    d.rectangle([x - 2, y - 2, x + im.width + 1, y + im.height + 1], outline=LINE, width=2)
    sheet.paste(im, (x, y))
    yy = y + im.height + 8
    if cap:
        d.text((x, yy), cap, font=F(21), fill=DIM)
        yy += 32
    return yy

y = PAD
y = text(PAD, y, "58 · 인게임 HUD 기준 부품 — RES 젤리 아이콘 + STAT 에너지바", 46, True)
y = text(PAD, y, "시안  tentwin/assets/art/incoming/mockup/gm-classic-target.jpg  (768×1187 · 2026-08-20 · 클래식 플레이 화면 = 후보 5장 중 최신)", 24, False, ACC)
y = text(PAD, y, "대조 후보(불채택)  gm-ingame-battle-hd.png / -v2 / gm-ingame-battle.png (2026-08-19 · 전투 모드) · gm-play-popup.png (팝업)", 22, False, DIM)
y = text(PAD, y, "판정 배율  1배율 = 390px 폭 · DPR3 (DESIGN-KNOWLEDGE §3.28).  세 열 모두 1 CSS px = 3 image px 로 정규화.  확대는 §D 200% 인셋 1곳뿐.", 22, False, DIM)
y = text(PAD, y, "구현  site/catalog/ui-kit-hud.css (신규) · 실험대 site/catalog/hud-lab.html (신규).  ui-kit.css · kit-lab.html · tentwin.html 무접촉.", 22, False, DIM)
y += 14

# ═══ A. 역할 대조표 ═════════════════════════════════════════════════════
y = text(PAD, y, "A. 역할 대조표 (F층 · 닫힌 어휘 11종)  — 시각 분해보다 먼저 낸다", 32, True)
tw = [110, 560, 520, 400, 200, 780]
th = 58
tx = PAD
ty = y
panel(PAD - 8, ty - 8, sum(tw) + 16, th * (len(ROLES) + 1) + 16)
hdr = ("역할", "시안이 한 방식", "우리 현행", "킷 보유", "채택", "사유")
cx = tx
for i, hcell in enumerate(hdr):
    d.text((cx + 12, ty + 16), hcell, font=F(24, True), fill=WARN)
    cx += tw[i]
ty += th
d.line([tx, ty - 4, tx + sum(tw), ty - 4], fill=LINE, width=2)
for r in ROLES:
    cx = tx
    for i, cell in enumerate(r):
        col = INK
        if i == 0:
            col = OK
        if i == 2 and cell.startswith("없음"):
            col = NG
        if i == 4:
            col = {"도입": OK, "혼합": WARN, "우리 유지": DIM, "보류": DIM}.get(cell, INK)
        d.text((cx + 12, ty + 15), cell, font=F(23, i in (0, 4)), fill=col)
        cx += tw[i]
    ty += th
    d.line([tx, ty - 4, tx + sum(tw), ty - 4], fill=(66, 54, 76), width=1)

y = ty + 24
y = text(PAD, y, "역할 7개 / 킷으로 덮이는 역할 5개  →  재사용률 71.4%   (🟢 정본만 세면 2/7 = 28.6% — 병목은 부품 제작이 아니라 승인이다)", 26, True, OK)
y = text(PAD, y, "상한  AMB(L0 배경)·FOCUS(그림 글리프)는 애초에 킷으로 덮는 종류가 아니다 → 구조적 상한 5/7 = 71.4%.  즉 이번 사이클은 상한에 도달했다.", 22, False, DIM)
y = text(PAD, y, "시각 분해 제외(우리 유지) 3개  ·  우리에 없던 역할 1개(RES) ← 역할 분해가 아니었으면 빈칸으로도 안 보였을 것", 22, False, DIM)
y += 22

# ═══ B. 3열 — 아이콘 ════════════════════════════════════════════════════
y = text(PAD, y, "B. RES 재화·상태 아이콘 — 1배율 3열", 32, True)
cx0, cx1, cx2 = PAD, PAD + COL + GAP, PAD + (COL + GAP) * 2
yb = y
y0 = colhead(cx0, yb, "①", "시안 (gm-classic-target)", (150, 200, 235))
y1 = colhead(cx1, yb, "②", "게임 실화면 (tentwin 아케이드)", (235, 190, 150))
y2 = colhead(cx2, yb, "③", "코드 부품 (.kit-res)", (170, 235, 190))

ya = place(sian_ico, cx0, y0, "◎ 0/1 (목표) · ◆ 0/34980 (재화). 글리프 + 흰 글자 + 딥 아웃라인.")
yb2 = place(game_top, cx1, y1, "상단바 전체. 재화 아이콘 0개 — Stage/Score/Best/남은팩 전부 텍스트.")
yc = place(code_ico, cx2, y2, "위 2줄 = 기본(맨 글리프 · 시안 방식) 8종 / 3줄 = --disc(젤리판+실루엣) / 아래 = 크기·상태")
y = max(ya, yb2, yc) + 6
y = text(PAD, y, "판정  게임 현행에는 재화/상태 아이콘이 **하나도 없다**(빈칸). 시안의 «글리프+값» 문법을 도입하되 글리프는 전량 도서관 재고를 쓴다 — 신규 발주 0건.", 24, False, WARN)
y += 20

# ═══ C. 3열 — 에너지바 ══════════════════════════════════════════════════
y = text(PAD, y, "C. STAT 에너지바 — 1배율 3열 · 채움 0 / 40 / 100 / 초과 4단계 전량", 32, True)
yb = y
y0 = colhead(cx0, yb, "①", "시안 — 유리판에 잠긴 캡슐 3개", (150, 200, 235))
y1 = colhead(cx1, yb, "②", "게임 실화면 — 게이지 3종 강제 점등", (235, 190, 150))
y2 = colhead(cx2, yb, "③", "코드 부품 (.kit-gauge) 4단계", (170, 235, 190))
ya = place(sian_bar, cx0, y0, "빈 트랙 #6E85BB · 위 눌린 테 #4E679D · 가운데만 채움(하늘 #A4DAE8 + 상단 하이라이트 #CCECFF)")
d.text((cx0, ya), "틀=유리판 / 트랙=파인 홈 / 필=캡슐 / 라벨=칩 위 흰 글자  →  4조각 전부 따로 있다", font=F(21), fill=DIM); ya += 34
yb2 = place(game_gau, cx1, y1, "위→아래  #mission-badge(게이지 아님·텍스트 카운터) / #boss-hp 72% / #combo-fill 62% +x7 / #fever-fill 45%")
d.text((cx1, yb2), "현행은 «납작한 2톤 띠 + 회색 트랙». 홈(inset)·림·젤리 없음. 피버는 수치 라벨 자체가 없다.", font=F(21), fill=DIM); yb2 += 34
yc = place(code_gau, cx2, y2, "0% / 40% / 100% / 130%(초과). 필은 width 계산 하나로 늘어난다 — 비트맵 늘리기 0.")
d.text((cx2, yc), "틀 .kit-gauge / 트랙 __track / 필 __fill / 초과 __over / 라벨 __label — 5조각 분리", font=F(21), fill=DIM); yc += 34
y = max(ya, yb2, yc) + 6
y = text(PAD, y, "판정  구조(4분할·홈·초과층)는 시안 채택, 색은 실측 토큰(#6E85BB/#4E679D/#A4DAE8/#CCECFF), 값은 --gauge-v 하나. 초과분은 별도 층이라 색·연출을 따로 준다.", 24, False, WARN)
y += 20

# ═══ D. .kit-jelly 재사용 판정 ══════════════════════════════════════════
y = text(PAD, y, "D. .kit-jelly 오버레이 재사용 판정 — 같은 오버레이 하나를 «원형»과 «캡슐»에 그대로 얹었다", 32, True)
yj = y
d.rounded_rectangle([PAD, yj, PAD + COL, yj + 52], 10, fill=(170, 235, 190))
d.text((PAD + 18, yj + 11), "① 원형 아이콘 — off / on 쌍", font=F(27, True), fill=(24, 18, 28))
d.rounded_rectangle([PAD + COL + GAP, yj, PAD + COL * 2 + GAP, yj + 52], 10, fill=(240, 170, 170))
d.text((PAD + COL + GAP + 18, yj + 11), "② 캡슐(바) — off / on 쌍 + --jelly-h 스윕", font=F(27, True), fill=(24, 18, 28))
yj += 66
ya = place(code_jc, cx0, yj, "22 off/on · 28 off/on · 56 off/on — 1배율에서 림·하단 발광·스페큘러가 또렷하다")
yb2 = place(code_jb, cx1, yj, "14 off/on · 28 off/on · 극소3% · h×1.0/1.8/2.6/4.0 스윕 · 기본값(rim·band·spec 전부 1)")

# 200% 인셋 (원인 분석 전용)
ins_x = cx2
d.rounded_rectangle([ins_x, y + 0, ins_x + COL, y + 52], 10, fill=(255, 211, 74))
d.text((ins_x + 18, y + 11), "③ 200% 인셋 — 원인 분석 전용(합격 판정 아님)", font=F(26, True), fill=(24, 18, 28))
iy = y + 66
z1 = code_jc.crop((0, 0, min(560, code_jc.width), code_jc.height))
z1 = z1.resize((z1.width * 2, z1.height * 2), Image.NEAREST)
z1 = fit(z1)
iy = place(z1, ins_x, iy, "원형 200% — 흰 림 한 바퀴 + 하단 내부 발광 + 우하단 물방울이 전부 보인다  ⇒ 통과")
z2 = code_jb.crop((0, 0, min(560, code_jb.width), 210))
z2 = z2.resize((z2.width * 2, z2.height * 2), Image.NEAREST)
z2 = fit(z2)
iy = place(z2, ins_x, iy, "캡슐 200% — off/on 차이가 상단 1px 미만의 미광뿐  ⇒ 미달")
y = max(ya, yb2, iy) + 10

VER = [
    ("원형 아이콘 (22 / 28 / 56px)", "통과", OK,
     "림·하단 발광·우하단 스페큘러가 1배율에서 그대로 읽힌다. JELLY-SPEC §6 «원형 통과 확인됨» 재확인."),
    ("캡슐 게이지 필 (14 / 18 / 28px)", "미달", NG,
     "오버레이는 실제로 그려진다(off/on 픽셀 차 max 82 · 변화 화소 6.5%)지만 1배율 육안으로는 거의 안 보인다."),
]
for name, verd, c, why in VER:
    d.text((PAD, y), "•", font=F(26, True), fill=c)
    d.text((PAD + 26, y), name, font=F(26, True), fill=INK)
    d.text((PAD + 640, y), verd, font=F(26, True), fill=c)
    d.text((PAD + 780, y), why, font=F(24), fill=DIM)
    y += 42
y += 8
y = text(PAD, y, "미달 원인 3중 (자체 수정하지 않았다 — ui-kit.css 는 병행 작업 중이라 읽기 전용)", 27, True, NG)
for line in [
  "① 전 성분이 --jelly-h 비례다.  바 높이 14px → 림 spread .048×14 = 0.67px · blur .014×14 = 0.20px → **서브픽셀**. 원형(56px)에서 2.7px 이던 것이 4분의 1로 준다.",
  "② --jelly-h 를 4배(56px)로 올려도 안 살아난다.  진짜 벽은 **밑판 밝기**다. 흰 α .31 은 L*49~58 짜리 버튼 면색에서 실측한 값인데, 게이지 채움 #A4DAE8 은 L*≈85 라 흰 위에 흰이라 대비가 남지 않는다.",
  "③ JELLY-SPEC §9 의 게이지 권장(--jelly-rim .4 · band 0 · spec 0)이 남은 유일한 성분마저 절반으로 깎는다.  band·spec 을 끄면 «절대 크기를 가진» 성분이 하나도 안 남는다.",
  "   ⇒ 설계 결함이라기보다 **적용 범위의 한계**다. 오버레이는 «색이 진하고 높이가 24px 이상인 판»을 전제로 실측됐다. 게이지처럼 밝고 얇은 판을 덮으려면",
  "      성분 알파를 밑판 명도에 연동하거나(예: 밝은 판에서는 검 알파 쪽으로 전환), 절대 하한(min 1px)을 두는 토큰이 추가로 필요하다.  ← ui-kit.css 소유자에게 이관.",
]:
    y = text(PAD, y, line, 23, False, DIM if line.startswith("   ") or line.startswith("      ") else INK)
y += 16

# ═══ E. 재고 대조 ═══════════════════════════════════════════════════════
y = text(PAD, y, "E. 아이콘 글리프 재고 대조 — 신규 발주 0건", 32, True)
GL = [
    ("heart",       "--lib-glyph-heart",      "재사용", OK),
    ("coin(재화)",  "--lib-glyph-score",      "재사용", OK),
    ("star",        "--lib-star-gold",        "재사용", OK),
    ("star(빈)",    "--lib-glyph-star-empty", "재사용", OK),
    ("target(목표)","--lib-glyph-target",     "재사용", OK),
    ("clock",       "--lib-glyph-clock",      "재사용", OK),
    ("crown",       "--lib-glyph-crown",      "재사용", OK),
    ("lock",        "--lib-glyph-lock",       "재사용", OK),
    ("infinity",    "--lib-glyph-inf",        "재사용", OK),
    ("flag/gear/cal/back", "--lib-glyph-*",   "재고 있음(이 화면 미사용)", DIM),
    ("gem(다이아)", "— 없음",                 "격차 1건", NG),
    ("에너지/번개", "— 없음",                 "격차 1건", NG),
]
gx, gy = PAD, y
for i, (n, v, s, c) in enumerate(GL):
    col = i % 3
    row = i // 3
    X = PAD + col * 1130
    Y = gy + row * 46
    d.text((X, Y), f"· {n}", font=F(24, True), fill=INK)
    d.text((X + 300, Y), v, font=F(23), fill=DIM)
    d.text((X + 760, Y), s, font=F(23, True), fill=c)
y = gy + ((len(GL) + 2) // 3) * 46 + 14
y = text(PAD, y, "재사용 9 / 격차 2  (격차는 시안의 노란 마름모 젬 1종 + 피버·에너지용 번개 1종).  격차는 **보고만** 한다 — 이모지·기본 도형으로 때우지 않았다(과거 반려 사례).", 24, False, WARN)
y += 18

# ═══ F. 실사용 조립 ═════════════════════════════════════════════════════
y = text(PAD, y, "F. 실사용 조립 — 게임 390px 폭 그대로", 32, True)
asm = fit(load("x-lab-hud-assembly.png"))
y = place(asm, PAD, y, "윗줄 = RES 4종 한 줄 / 아랫줄 = 시계 칩 + 콤보 게이지(라벨 겹침 배치). #topbar 예산 안에 든다.")
y += 6

# ═══ 꼬리 ══════════════════════════════════════════════════════════════
y = text(PAD, y, "규율 확인", 28, True)
for line in [
  "· 판정 배율 1배율(390·DPR3). 확대는 §D 200% 인셋 1곳뿐 — 합격 판정에 쓰지 않았다.",
  "· 구조 불일치 5% 관문은 쫓지 않았다 — 바닥값 ≈6.5%(§2.28)로 도달 불가 판정된 폐기 기준이다. 이 시트의 판정은 전량 1배율 육안이다.",
  "· 필은 코드로 늘어난다(width 계산). 비트맵 늘리기 0건.  L4(값)는 전량 코드 — 글자 구운 그림 0건.",
  "· 신규 파일 2개(site/catalog/ui-kit-hud.css · hud-lab.html)만 썼다.  ui-kit.css · kit-lab.html · tentwin.html 무수정.",
  "· 승인(🟢) 전이므로 tentwin.html 에 배선하지 않았다.",
]:
    y = text(PAD, y, line, 23, False, DIM)

sheet.crop((0, 0, W, min(H, y + 40))).save(OUT)
print("saved", OUT, Image.open(OUT).size)
