# W9 — PC(가로/데스크톱) 레이아웃 설계 시안

작성 2026-08-20 · **설계 문서다. 이 파도에서 tentwin.html 은 한 줄도 고치지 않았다.**
시안 4장은 헤드리스 msedge 로 실제 게임을 띄운 뒤 **런타임에 CSS/DOM 만 얹어** 찍은 것이라,
아래 치수는 상상값이 아니라 브라우저가 실제로 계산한 `getBoundingClientRect()` 값이다.

- 증거: `31-pc-design-menu.png` / `-map.png` / `-game.png` / `-battle.png` / `-all.png`
- 기존 증거: `25-pc-map-1280.png` (맵 붕괴 원본)

---

## 0. 한 줄 진단 — 왜 깨지나

**게임은 폭에만 반응하고 비율에는 반응하지 않는다.**

```
:root  --app-max   480px → 620px(≥700w) → 760px(≥1000w & ≥720h)
       --board-max 460px → 600px        → 720px
#app   width:100%; max-width:var(--app-max); min-height:100dvh; margin:0 auto
```

`@media (orientation:…)` 은 **0건**. `min-aspect-ratio` 는 메뉴·스플래시·캐릭터 패널에만
붙어 있고 `#screen-map` / `#screen-game` 에는 **한 줄도 없다**.

결과: 데스크톱에서 화면은 **760 × 뷰포트높이** 짜리 세로 기둥이 된다.
- 1280×800 → 760×800 (비율 0.95)
- 1920×1080 → 760×1080 (비율 0.70)

폰 기준 390×844(0.462) 대비 **폭만 1.95배**로 부풀고 높이는 그대로다.
그리고 맵 바는 `cqw`(= `#screen-map` 폭의 1%)로 잡혀 있으므로 **폭 배율을 그대로 먹는다**.

---

## 1. 화면별 진단 (1줄)

| 화면 | 진단 |
|---|---|
| **메뉴** | 가로 분기는 이미 있으나(`min-aspect-ratio:1/1 and min-width:700px` → `-w` 판 교체) `#app` 이 760px 로 잘려 **좌우 580px씩 빈 베이지 + 1100×892 판이 0.70 비율 상자에 cover 되어 세로로 63% 잘림**. |
| **맵** | `#screen-map` 이 곧 컨테이너라 `1cqw = app폭의 1%` → 760px 열에서 상단바 `20cqw=152px` + 하단바 `25.61cqw=195px` = **347px 가 바**(1280×800 에선 화면의 **43%**, 1920×1080 에선 32%). 1920 실측 노드 11개 중 **6개 잘림·3개 바 뒤 침범**. |
| **인게임 보드** | 보드는 cqw 가 아니라 JS px 계산(`layout()`)인데 `--board-max:720` 을 그대로 먹어 **타일 80px = 폰(40px)의 정확히 2배**. 깨지진 않지만 좌우 580px씩이 완전 낭비이고 화면이 "확대된 폰"으로 보인다. |
| **전투** | 최악. 1280×800 에서 `#duel-hud` 245 + `#topbar` 48 + 콤보 30 + 액션바 111 = **434px(54%)가 크롬** → 남은 보드 **270×309, 타일 36px**(하한 `TILE_MIN=34` 코앞). `#duel-hud` 는 `container-type:inline-size; aspect-ratio:1536/500` 이라 **폭이 커질수록 세로로도 커져 보드를 짓누른다**. |

### 실측표 (현행)

| 화면 | 1280×800 | 1920×1080 |
|---|---|---|
| `#app` | 760×800 | 760×1080 |
| `#map-top` / `#map-bot` | 152 / 195 | 152 / 195 |
| 맵 노드 잘림 / 바 뒤 침범 | 1 / 4 | 6 / 3 |
| `#board` (엔들리스) | 382×547, 타일 52px | 578×827, **타일 80px** |
| `#board` (전투) | **270×309, 타일 36px** | 515×589, 타일 71px |
| `#duel-hud` | 752×245 | 752×245 |

---

## 2. 설계안 (시안 4장에 대응)

공통 분기점 — **비율로 켠다**:

```css
@media (min-aspect-ratio: 1/1) and (min-width: 900px) { … }
```

`min-width:900px` 을 함께 두는 이유: 844×390 같은 **가로 폰**은 기존 세로 레이아웃이
그대로 도는 편이 안전하다(이미 8893/8934/8969 줄에서 테스트된 뷰포트다).
900px 미만 가로 화면은 지금 동작을 유지한다.

### ① 메뉴 — `31-pc-design-menu.png`

```css
#app          { max-width: none; }                      /* 760 캡 해제 */
#screen-menu  { align-items: flex-start;
                padding-left: max(7vw, 84px); }
/* 배경은 이미 있는 규칙(7464줄)이 --art-menu-day-w / -night-w 로 교체해 준다.
   #app 캡만 풀면 1100×892 판이 1920 폭에 full-bleed cover 로 깔린다. */
.menu-stack   { width: 380px; }                          /* 폰과 같은 실치수 */
```

- 로고+버튼 스택 **380px**, 좌측 앵커 `max(7vw, 84px)`.
- 배경: `--art-menu-day-w` / `-night-w` (1100×892) full-bleed `cover`.
  16:9 에서 세로로 약 30% 잘리지만, 구도상 나무 밑동이 잘리는 쪽이라 무해하다.
- 신규 에셋 **0**.

### ② 맵 — `31-pc-design-map.png`

사용자 확정 방침대로 **맵은 세로 유지**(캔디크러쉬 PC 웹 방식).

```css
#app         { max-width: none; position: relative; z-index: 1; background: none; }
#pc-bg       { position: fixed; inset: 0; z-index: 0;      /* 새 요소 1개 */
               background: var(--art-map-bg) center/cover;
               filter: blur(18px) saturate(.92) brightness(.60);
               transform: scale(1.12); }
#screen-map  { width: 480px; max-width: 480px; margin: 0 auto;
               position: relative; z-index: 1;
               box-shadow: 0 0 0 5px rgba(255,255,255,.55),
                           0 28px 80px rgba(20,10,40,.45); }
```

| 항목 | 값 | 근거 |
|---|---|---|
| 중앙 세로 패널 | **480px** | `--app-max` 폰 티어와 동일 → `1cqw = 4.8px` |
| 상단바 | 96px (`20cqw`) | 152 → 96 (-37%) |
| 하단바 | 123px (`25.61cqw + safe`) | 195 → 123 (-37%) |
| 좌·우 날개 | 각 720px @1920 | `art-map-bg` **2600×1271, 이미 가로 원판** 재활용 |

- 바가 폰 비율로 복귀 → 크롬이 화면의 43% → **20%**.
- 드래그 맵(`#map-layer`, `aspect-ratio:2600/1272`, `translate3d(--mx,0,0)`)과
  노드 `%` 좌표계는 **한 줄도 건드리지 않는다**. 폰과 완전히 같은 코드가 돈다.
- 신규 에셋 **0**.

> **함께 고쳐야 할 상수**: `#map-layer { --map-bar: clamp(48px,13.1vh,110px) }` (10229줄)이
> 아직 옛 하단바 높이다. 실제 `25.61cqw` 와 어긋나 1번 노드가 13px 잠긴다.
> → `--map-bar: calc(25.61cqw + var(--safe-b))` 로 동기화.

> **대안(B안, 이번 파도 밖)**: 바만 480px 래퍼에 `container-type` 을 옮기면
> `#map-view` 를 1100px 까지 넓혀 노드를 한 번에 더 보여줄 수 있다.
> 원판이 2.05:1 가로라 그림은 이미 충분하다. 다만 DOM 한 겹 추가 + 드래그 재보정이
> 필요하므로 A안(480 고정)을 먼저 낸다.

### ③ 인게임 보드 — `31-pc-design-game.png`

```css
:root         { --board-max: 520px; }
#app          { max-width: none; }
#screen-game  { display: grid;
                grid-template-columns: 264px 520px 264px;
                grid-template-rows: auto 1fr;
                grid-template-areas: "top  top   top"
                                     "left board right";
                column-gap: 28px; row-gap: 10px;
                width: 1100px; margin: 0 auto; height: 100dvh; }
#topbar       { grid-area: top; }
#topbar #tb-stats { max-width: 660px; margin: 0 auto; }   /* 스탯 늘어짐 방지 */
#board-scroll { grid-area: board; }
#pc-left      { grid-area: left;  }   /* 새 요소 */
#pc-right     { grid-area: right; }   /* 새 요소 */
#pc-right #actionbar { flex-direction: column; width: 100%; }
#pc-right #actionbar .act { flex: 0 0 auto; width: 100%; min-height: 72px; }
```

| 항목 | 값 |
|---|---|
| 콘텐츠 클러스터 | **1100px** (264 + 28 + 520 + 28 + 264) |
| 보드 | `--board-max: 520px` → **타일 71px** (7열, gap 3) |
| 좌 날개 | **264px** — 캐릭터(`#hero-slot` `scale(2.6)`) / 콤보·피버(`#combo-wrap`) / 미션(`#hud-row`) |
| 우 날개 | **264px** — 액션 4종(추가·힌트·되돌리기·섞기) 세로. `#actionbar` 를 통째로 옮겨 재사용 |
| 상단바 | 폭 1100 캡, `#tb-stats` 660 캡 |
| 배경 | `--art-menu-day-w` full-bleed + `blur(20px)` |

- 1280×800 에서도 1100px 클러스터가 좌우 90px 여백으로 들어간다.
- 신규 에셋 **0**.

### ④ 전투 — `31-pc-design-battle.png`

```css
:root         { --board-max: 520px; }
#screen-game  { display: grid;
                grid-template-columns: 264px 520px 264px;
                grid-template-rows: auto auto 1fr;
                grid-template-areas: "top  top   top"
                                     "hud  hud   hud"
                                     "left board right";
                width: 1100px; margin: 0 auto; height: 100dvh; }
#duel-hud     { grid-area: hud; width: 860px; margin: 0 auto; }
```

| 항목 | 값 |
|---|---|
| `#duel-hud` | **max-width 860px** → `aspect-ratio:1536/500` 에 의해 높이 **280px** |
| 보드 | 520px / **타일 71px** (현행 1280 의 36px 대비 **약 2배**) |
| 우 날개 | 264px — 스킬 메달 4종 세로, 각 **86px** |
| 좌 날개 | 264px — 콤보·피버 / 보스 상태·목표 |
| 배경 | `art-map-bg` `blur(20px) brightness(.42)` |

- **핵심**: 메달을 하단 액션바에서 **우 날개로 빼면 세로 예산이 111px 돌아온다**.
  HUD 280 + 상단 48 = 328 만 쓰고 나머지 752px 을 보드가 갖는다.
- `#duel-hud` 의 `container-type: inline-size` 는 **그대로 둔다** — 폭만 캡하면
  안쪽 `%`·`cqw` 좌표계(아바타·HP바·타이머 글라스)는 무손상으로 함께 축소된다.
- 신규 에셋 **0**.

---

## 3. 구현 전략

### 3.1 분기점

```css
@media (min-aspect-ratio: 1/1) and (min-width: 900px) { … }
```

- 세로(폰·태블릿 세로·itch 420×880 임베드) → **현행 그대로, 부수효과 0**.
- 가로 폰(844×390 등) → `min-width:900px` 미만이라 **현행 유지**.
- PC 브라우저(1280×800 이상) → PC 레이아웃.
- 창을 리사이즈해 비율이 넘나들면 `mapFit()` / `layout()` 이 이미 `resize`
  리스너에 물려 있으므로(34279–34280줄) 자동 재계산된다.

### 3.2 cqw 좌표계와의 공존 — **재사용 가능하다**

이 설계의 전제이자 가장 중요한 판단이다.

| 컨테이너 | 소비자 | PC 처리 |
|---|---|---|
| `#screen-map` (`container-type:inline-size`) | 맵 상·하단바 50개 `cqw` 좌표 | **폭을 480px 로 캡** → `1cqw = 4.8px`, 폰(390px→3.9px)과 같은 급. 좌표 수정 0줄 |
| `#app.battle #duel-hud` (`inline-size`, `aspect 1536/500`) | 전투 HUD 폰트·아바타·HP바 | **폭을 860px 로 캡** → 안쪽 `%` 전부 동반 축소. 좌표 수정 0줄 |

즉 **"컨테이너 폭에 캡을 씌우는" 방식이면 기존 cqw 자산 전부가 그대로 산다.**
반대로 `#screen-map` 을 1920 로 넓히는 순간 `20cqw = 384px` 이 되어 전부 붕괴한다 —
**컨테이너를 넓히는 설계는 금지**로 못 박는다.

보드는 애초에 cqw 가 아니라 JS px(`layout()`, `boardMaxPx()`)이므로
`--board-max` 값 하나만 바꾸면 되고, CSS 주입 후 `Game.layout(); Game.render();`
한 번이면 타일이 재계산된다(시안 캡처에서 실증).

### 3.3 필요 신규 에셋 — **0장** (재고 대조 완료)

| 용도 | 재고 | 크기 | 판정 |
|---|---|---|---|
| 메뉴 가로 배경 | `--art-menu-day-w` / `--art-menu-night-w` | 1100×892 | **있음**. 16:9 cover 시 세로 30% 크롭, 구도상 무해 |
| 맵 좌우 날개 | `--art-map-bg` | **2600×1271 (2.05:1 가로 원판)** | **있음**. 흐림 확장으로 그대로 사용 |
| 인게임 좌우 날개 | `--art-menu-day-w` | 1100×892 | **있음** |
| 전투 좌우 날개 | `--art-map-bg` | 2600×1271 | **있음** |
| 스킬 메달 | `catalog/duel-medal-{attack,special,pet,awaken}.webp` | — | **있음**. 세로 배치는 CSS 만 |

`-w` 접미 에셋은 파일 전체에 위 2종뿐이고(`-w2`·`-wide` 없음), 그 2종으로 충분하다.

**선택 항목(필수 아님)**: 진짜 16:9 메뉴 원판(1920×1080)을 새로 발주하면 크롭이 사라진다.
품질 욕심이 나면 그때 1장. 이번 파도 착수 조건은 아니다.

### 3.4 예상 파도 규모

| 단계 | 내용 | 규모 |
|---|---|---|
| W9-1 | PC 분기 스타일 블록 신설 `<style id="pc-landscape">` — 메뉴 + 맵 | CSS 약 60줄, DOM 신규 1개(`#pc-bg`) |
| W9-2 | `--map-bar` 상수 동기화 (10229줄) | 1줄 |
| W9-3 | 인게임 3열 그리드 + 날개 2개 | CSS 약 70줄, DOM 신규 2개(`#pc-left`/`#pc-right`) + 이동 배선 |
| W9-4 | 전투 그리드 + `#duel-hud` 폭 캡 + 메달 우측 | CSS 약 40줄 |
| W9-5 | 회귀 — 390×844 / 420×880(itch) / 844×390 / 1280×800 / 1920×1080 5종 캡처 비교 | 캡처 10장 |

**총 CSS 약 170줄 + DOM 신규 3개.** 기존 규칙 삭제는 없고 전부 미디어쿼리 안 추가라
**롤백 밸브는 `<style id="pc-landscape">` 블록 통째 삭제** 한 번이면 된다
(36937줄 `sian-stage-map` 과 같은 방식).

날개 요소(`#pc-left`/`#pc-right`)는 세로 모드에서 `display:none` 이 아니라
**아예 생성하지 않거나**, 생성하되 세로에선 자식을 원위치로 되돌리는 편이 안전하다.
→ **권고: DOM 은 항상 만들고, 자식 이동을 `matchMedia` 리스너에서 양방향으로 처리.**
이 게임은 이미 `resize`/`orientationchange` 훅을 갖고 있으므로 붙일 자리가 있다.

---

## 4. 게시 관문

레퍼런스 나란히 비교가 게시 관문이다. `31-pc-design-all.png` 4분할과
각 시안 우하단의 **현행 인셋**(빨간 테두리)이 그 비교본이다.
