
// TenTwin — game state, rules, seeded board generation, rendering and screen flow (window.Game).
(function () {
'use strict';
var COLS = 7;
var GAP = 3;
var TILE_MIN = 34;            // never smaller than this unless width forces it
var TILE_MAX = 100;           // = floor((720 - GAP×(COLS-1)) / COLS), 7열 기준
var BOARD_MAX = COLS * TILE_MAX + (COLS - 1) * GAP;   // 7×100 + 6×3 = 718
var BOARD_MAX_FALLBACK = 720;
var COMBO_MS = 5000;
var COMBO_MAX = 99;
var COMBO_TIER_AT = [8, 12, 16, 20];
var COMBO_EXP_FROM = 8;
var COMBO_EXP_BASE = 1.18;
var COMBO_MULT_CAP = 400;
var COMBO_MULT_CAP_ADV = 40;
var LS_KEY = 'tentwin.v74p';
var SCHEMA_VERSION = 3;   /* P3 — 코인·뽑기·광고 상한·특가 칸(가법) */
var LS_BAK_PREFIX = LS_KEY + '.bak-';
var ROWGO_STAGGER = 35;   // ms per column, left -> right
var DEAL_STAGGER = 30;    // ms per new tile...
var DEAL_TOTAL_MS = 700;  // whole deal-in sequence, however many tiles
var DEAL_TICKS = 14;      // most deal sfx plays per Add, spread over the tail
var FALL_MS = 420;
var POP_MS = 260;
var FRUIT_TILES = true;
function fruitOf(v) { return FRUIT_TILES ? (v | 0) : 0; }
var TILE_RASTER = true;
var TILE_RASTER_VARS = [
'--tile-img-1', '--tile-img-2', '--tile-img-3',
'--tile-img-4', '--tile-img-5', '--tile-img-6',
'--tile-img-7', '--tile-img-8', '--tile-img-9'
];
function tileRasterReady() {
if (!TILE_RASTER || !FRUIT_TILES) return false;
try {
var cs = getComputedStyle(document.documentElement);
for (var i = 0; i < TILE_RASTER_VARS.length; i++) {
var v = (cs.getPropertyValue(TILE_RASTER_VARS[i]) || '').trim();
if (v.slice(0, 4) !== 'url(') return false;
}
return TILE_RASTER_VARS.length === 9;
} catch (e) { return false; }
}
var PALETTE = ['#34C6E8',  /* 1 소다     */ '#8C9BF5',  /* 2 블루베리 */
'#C77CF0',  /* 3 포도     */ '#FA8BB8',  /* 4 복숭아   */
'#FFA23C',  /* 5 귤       */ '#4BD99A',  /* 6 라임     */
'#9CE061',  /* 7 청포도   */ '#F5D84A',  /* 8 레몬     */
'#FF7A6B']; /* 9 딸기     */
// Combo text colour temperature: yellow -> orange -> pink.
var COMBO_COLORS = ['#F5D84A', '#FFC63C', '#FFA23C', '#FF8A5C',
'#FF7A6B', '#FA7FA6', '#FA8BB8', '#DE8CF2',
'#C77CF0', '#9CA6F5', '#5CD2EE', '#7DF0C8'];
var GRID_EMOJI = ['🟥', '🟧', '🟨', '🟩', '🟦', '🟪', '🟫', '⬛', '⬜'];
var DIRS = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
var SP_DENSITY = 0.07;        // endless target share of living cells
var SP_DENSITY_RUSH = 0.12;   // rush: genuinely denser, right at the ceiling
var SP_BOMB = 0.05;           // Add-tail bomb chance (doubled in rush)
var SP_MAX_RATIO = 0.12;      // hard ceiling on total specials per board
var SP_STAGE_MIN = 2;         // endless: the full density mix starts at stage 2
var SP_ICE_STAGE = 3;         // endless: ice from stage 3 (was 4)
var SP_BOMB_STAGE = 3;        // endless: generated bombs from stage 3 (was 6)
var SP_ICE_ADV = 11;          // adv: 얼음은 챕터2부터
var SP_BOMB_ADV = 51;         // adv: 폭탄은 챕터6부터
var SP_WILD_ADV = 61;         // adv: 와일드는 챕터7부터
var SP_W_WILD = 3, SP_W_GOLD = 6, SP_W_ICE = 4, SP_W_BOMB = 4;
var GOLD_MULT = 3;            // gold match score multiplier
var ICE_BREAK_SCORE = 5;      // × stage, awarded when only ice shattered
var BOMB_KILL_SCORE = 15;     // × stage × cells destroyed by a bomb
var BOMB_COMBO_EXTEND = 1500; // ms of extra combo window per explosion
// Fever
var FEVER_COMBO = 5;          // combo level that ignites fever
var FEVER_MS = 10000;         // initial duration
var FEVER_MAX_MS = 20000;     // remaining-time ceiling
var FEVER_STEP_MS = 1000;     // +1s per match while fevered
var FEVER_MULT = 2;           // all score ×2 during fever
var FEVER_CD_MS = 8000;       // re-entry lockout: fever must stay an event
// Time Rush
var RUSH_MS = 90000;
var RUSH_MATCH_MS = 2000;
var RUSH_ROW_MS = 5000;
var RUSH_ADD_CD = 8000;       // Add is unlimited but rate-limited
var RUSH_DANGER_MS = 10000;   // heartbeat + red edge pulse window
var RUSH_DECAY_AFTER = 60000; // after this much of a run, matches buy less time
var RUSH_MATCH_LATE_MS = 1200;// review #4: a strong player never ran out at 2.0s/match
var RUSH_LEFT_CAP_MS = 45000; // hard ceiling on REMAINING time bought by play
var MISSION_GOALS = {
sum10:   function (n) { return Math.max(4, Math.round(n * 0.155)); },
same:    function (n) { return Math.max(6, Math.round(n * 0.26)); },
rows:    function (n) { return Math.max(3, Math.round(n / COLS * 0.7)); },
noadd:   function (n) { return Math.max(8, Math.round(n * 0.30)); },
special: function (n) {
return clamp(Math.round(Math.round(n * SP_DENSITY) * 0.4), 2, 3);
},
fever:   function ()  { return 1; },
bomb:    function ()  { return 2; },
combo5:  function ()  { return 1; },
sprint:  function (n) { return Math.max(5, Math.round(n * 0.14)); },
col:     function (n, r) {
var wide = Math.min(COLS, n) - 1;            // last existing column index
if (wide > 5) wide = 5;                      // 7열: 맨 오른쪽 열은 지목하지 않는다
if (wide < 0) wide = 0;
var pick = r ? ((r() * (wide + 1)) | 0) : 0;
return clamp(pick, 0, wide) + 1;             // 1-based for display
}
};
var MISSION_SCORE = 200;
var MISSION_COMBO = 5;          // combo level the `combo5` mission asks for
var MISSION_SPRINT_MS = 30000;  // rolling window for the `sprint` mission
// Cumulative-match milestones (DESIGN 9-FUN E)
var MILESTONES = [100, 500, 1000, 5000];
var MILESTONE_REWARD = { 100: 5, 500: 5, 1000: 5, 5000: 5 };
var DAILY_QUESTS = [
{ id: 'm10',    goal: [15, 25, 40],       ico: '--lib-glyph-target' },
{ id: 'combo',  goal: [5, 8, 12],         ico: '--lib-glyph-flag' },
{ id: 'pet',    goal: [1, 2, 3],          ico: '--lib-glyph-heart' },
{ id: 'awaken', goal: [1, 2, 3],          ico: '--lib-glyph-inf' },
{ id: 'clear',  goal: [1, 2, 3],          ico: '--lib-glyph-crown' },
{ id: 'daily',  goal: [1, 1, 1],  fix: 1, ico: '--lib-glyph-cal' },
{ id: 'duel',   goal: [1, 1, 1],  fix: 2, ico: '--lib-badge-a' },
{ id: 'star2',  goal: [1, 1, 1],  fix: 2, ico: '--lib-star-gold' },
{ id: 'rush',   goal: [1000, 2000, 3500], ico: '--lib-glyph-clock' },
{ id: 'item',   goal: [1, 1, 1],  fix: 1, ico: '--lib-slot-ic-item' }, /* P3 — 코인이 화폐가 되어 원반은 코인 전용 */
{ id: 'match',  goal: [30, 60, 100],      ico: '--lib-glyph-target' },
{ id: 'chain',  goal: [3, 5, 8],          ico: '--lib-glyph-flag' }
];
var DQ_REWARD = [0, 3, 5, 8];
var DQ_BONUS_HEART = 1;          // 셋 다 «수령»하면 하루 1회
var WEEKLY_QUESTS = [
{ id: 'wclear', goal: 15,  v: 15, ico: '--lib-glyph-crown' },
{ id: 'wstar',  goal: 20,  v: 20, ico: '--lib-star-gold' },
{ id: 'wmis',   goal: 10,  v: 15, ico: '--lib-glyph-cal' },
{ id: 'wmatch', goal: 300, v: 20, ico: '--lib-glyph-target' }
];
var WQ_PICK = 3;
var ACHV = [
{ id: 'first',     ax: 'match',  goal: 1,    v: 5,  ico: '--lib-glyph-target' },
{ id: 'match100',  ax: 'match',  goal: 100,  v: 5,  ico: '--lib-glyph-target' },
{ id: 'match1000', ax: 'match',  goal: 1000, v: 10, ico: '--lib-medal-bronze' },
{ id: 'match5000', ax: 'match',  goal: 5000, v: 20, ico: '--lib-medal-gold' },
{ id: 'combo5',    ax: 'combo',  goal: 5,    v: 5,  ico: '--lib-glyph-flag' },
{ id: 'combo10',   ax: 'combo',  goal: 10,   v: 10, ico: '--lib-glyph-flag' },
{ id: 'combo20',   ax: 'combo',  goal: 20,   v: 20, ico: '--lib-badge-s' },
{ id: 'pet1',      ax: 'pet',    goal: 1,    v: 5,  ico: '--lib-glyph-heart' },
{ id: 'pet3',      ax: 'pet',    goal: 3,    v: 10, ico: '--lib-glyph-heart' },
{ id: 'petall',    ax: 'pet',    goal: 0,    v: 20, ico: '--lib-badge-s' },
{ id: 'chap1',     ax: 'chap',   goal: 1,    v: 5,  ico: '--lib-glyph-crown' },
{ id: 'chap3',     ax: 'chap',   goal: 3,    v: 10, ico: '--lib-glyph-crown' },
{ id: 'star30',    ax: 'star',   goal: 30,   v: 5,  ico: '--lib-star-gold' },
{ id: 'star60',    ax: 'star',   goal: 60,   v: 10, ico: '--lib-star-gold' },
{ id: 'streak3',   ax: 'streak', goal: 3,    v: 5,  ico: '--lib-glyph-cal' },
{ id: 'streak7',   ax: 'streak', goal: 7,    v: 10, ico: '--lib-glyph-cal' },
{ id: 'streak14',  ax: 'streak', goal: 14,   v: 20, ico: '--lib-medal-gold' },
{ id: 'duel1',     ax: 'duel',   goal: 1,    v: 5,  ico: '--lib-badge-a' },
{ id: 'duel10',    ax: 'duel',   goal: 10,   v: 10, ico: '--lib-medal-silver' },
{ id: 'awaken50',  ax: 'awaken', goal: 50,   v: 10, ico: '--lib-glyph-inf' }
];
var STREAK_REWARD = [
{ day: 3,  heart: 1 },
{ day: 7,  jstar: 10 },
{ day: 14, jstar: 25 }
];
var ADD_FLOOR_STAGE = 16;
var MOVES_LOW = 3;
var SHUFFLES_PER_STAGE = 1;
var HEART_MAX = 5;                 // 회복이 멈추는 천장 (보너스 하트는 넘을 수 있다)
var HEART_MS = 30 * 60 * 1000;     // 30분에 1개 (V3 §7)
var JEWEL_MAX = 1e9;               // 잔액 상한. statLv 가 STAT_LV_MAX 에서 자르는 방식 그대로
var JEWEL_COST = {
heartsFull: 50,                  // §20.3 하트 즉시 회복 (0 → 5)
heartOne:   12,                  // §20.3 하트 1개
continue2:  40,                  // §20.3 · §21 ① 계속하기 2회차부터
skin:      100                   // §20.3 스킨 (젬리별 25 × 「1★ ≈ 4💎」)
};                                 /* 74 — 확정 파편 팩(shardPack 60💎 · 고른 색 30알)은 파편 경제와 함께 은퇴했다 */
var JEWEL_PACKS = [
{ sku: 'jewel_s_60',   tier: 's',  krw: 1200,  n: 60 },
{ sku: 'jewel_m_180',  tier: 'm',  krw: 3300,  n: 180 },
{ sku: 'jewel_l_330',  tier: 'l',  krw: 5500,  n: 330 },
{ sku: 'jewel_xl_720', tier: 'xl', krw: 11000, n: 720 }
];
var START_PACK = { sku: 'jewel_start', krw: 1200, n: 60, hearts: 5, jstar: 3 };   /* 74 — 옛 파편 30알 = 10:1 로 젤리별 3 */
var DAILY_FREE_MS = 24 * 60 * 60 * 1000;   // §20.4 24h 잠금
var DAILY_FREE_JEWEL = 5;                  // §20.4 「신규 5💎」
var DAILY_FREE_HEART = 1;
var IAP_KEYS = ['noads'];
var ADV_CHAPTER = 10;              // 10탄 = 1챕터
var ADV_CHAPTERS = 3;              // 테마가 한 바퀴 도는 주기 (청포도→소다→딸기)
var ADV_HAND_RATIO = 0.10;         // 핸디캡 타일이 판에서 차지할 수 있는 최대 비율
var ADV_RELIEF_FAILS = 4;          // 이만큼 연속 실패하면 숨은 완화가 붙는다
var ADV_RELIEF_PCT = 3;            // 완화폭 +3%p (표시하지 않는다 — V3 §6)
var ADV_WAVE_PCT = 2.5;            // 페이싱 사인파의 진폭(%p)
var ADV_WAVE_PERIOD = 4;           // 주기 4탄 → 어려운 쪽 극점이 연속될 수 없다
var ADV_PAR_K = 79;
var ADV_PAR_SEC = 2.0;
var ADV_STAR_EARLY = 3;            // 온보딩 완화가 걸리는 마지막 탄
var ADV_STAR2_K = [
0.75, 0.70, 0.80, 0.65, 0.63, 0.67, 0.62, 0.58, 0.67, 0.91,   /* 1~10탄 */
0.57, 0.59, 0.59, 0.58, 0.51, 0.57, 0.52, 0.55, 0.55, 0.66,   /* 11~20탄 */
0.57, 0.49, 0.54, 0.58, 0.61, 0.53, 0.52, 0.55, 0.53, 0.62,   /* 21~30탄 */
0.61, 0.65, 0.66, 0.60, 0.69, 0.71, 0.62, 0.71, 0.62, 0.79,   /* 31~40탄 */
0.67, 0.66, 0.66, 0.66, 0.70, 0.72, 0.81, 0.72, 0.67, 0.35,   /* 41~50탄 */
0.57, 0.58, 0.68, 0.69, 0.65, 0.64, 0.63, 0.61, 0.62, 0.49,   /* 51~60탄 */
0.60, 0.59, 0.58, 0.59, 0.63, 0.59, 0.54, 0.60, 0.57, 0.67,   /* 61~70탄 */
0.61, 0.56, 0.58, 0.59, 0.55, 0.69, 0.52, 0.59, 0.59, 0.60,   /* 71~80탄 */
0.51, 0.49, 0.55, 0.52, 0.52, 0.52, 0.52, 0.52, 0.52, 0.59,   /* 81~90탄 */
0.51, 0.63, 0.48, 0.52, 0.48, 0.55, 0.49, 0.52, 0.54, 0.57    /* 91~100탄 */
];
var ADV_STAR3_K = [
1.09, 1.06, 1.04, 1.17, 1.16, 1.20, 1.19, 1.16, 1.17, 1.49,   /* 1~10탄 */
0.99, 1.00, 1.03, 1.00, 1.00, 1.06, 1.00, 1.02, 1.03, 1.14,   /* 11~20탄 */
0.95, 0.92, 0.96, 0.98, 0.96, 0.95, 0.97, 0.93, 0.97, 1.25,   /* 21~30탄 */
1.07, 1.12, 1.10, 1.10, 1.10, 1.08, 1.10, 1.11, 1.08, 1.28,   /* 31~40탄 */
1.09, 1.11, 1.09, 1.14, 1.12, 1.20, 1.11, 1.13, 1.16, 0.52,   /* 41~50탄 */
1.00, 0.98, 0.99, 0.97, 1.02, 0.96, 0.99, 0.99, 1.01, 0.88,   /* 51~60탄 */
0.97, 0.95, 0.96, 0.93, 0.95, 0.94, 0.97, 0.94, 0.95, 0.88,   /* 61~70탄 */
0.83, 0.81, 0.85, 0.83, 0.84, 0.85, 0.86, 0.87, 0.84, 0.76,   /* 71~80탄 */
0.79, 0.84, 0.79, 0.79, 0.77, 0.80, 0.78, 0.86, 0.77, 0.97,   /* 81~90탄 */
0.85, 0.83, 0.81, 0.84, 0.79, 0.86, 0.81, 0.84, 0.82, 1.01    /* 91~100탄 */
];
var ADV_STAR2_FALLBACK = 0.52;
var ADV_STAR3_FALLBACK = 0.84;
var ADV_STAR3_TEN = 0.10;
var ADV_MISSION_MS = 45000;        // 스테이지 미션의 제한시간
var ADV_MISSION_WARN_MS = 10000;   // 남은 시간이 이 아래면 타이머 대형화 + 빨간 펄스
var ADV_MISSION_MULT = 1.25;       // 미션 성공 뒤 그 판의 모든 매치에 붙는 배수
var ADV_BANG_MS = 1500;            // "빡!" 미션 배너 (타임스톱 포함)
var ADV_BOSS_HEART = 1;            // 보스탄 클리어 보상
var ADV_SEED_SALT = 0x51ED270B;    // 탄 번호 → 판 시드. 고정이어야 재도전이 같은 판이다
var ADV_HAND_SALT = 0x3C6EF35F;    // 핸디캡 배치용 두 번째 스트림
var SKILL_MAX = 100;
var SKILL_BASE = 1.5;
var SKILL_COMBO = 0.18;
var SKILL_COMBO_CAP = 20;
var AWAKEN_GAIN_K = 2;
var SKILL_CUTIN_MS = 2000;         // 전면 컷인 (타임스톱 포함, 탭으로 스킵)
var SKILL_CUTIN_MIN_MS = 260;      // 이보다 일찍은 스킵되지 않는다 (오폭 방지)
var SKILL_CUTIN_REDUCED_MS = 1000;
var SKILL_MS = { ten: 7500, twin: 7500, jelly: 10000, pudding: 8750, sodawitch: 8125 };
var SKILL_TW_HEAD = 5;
var BOSS_TIME_K = 1.5;
var BOSS_ULT_K = 0.30;
var BOSS_ULT_NEED = 5;             // 필살기(확정) 5회 = HP 100% (챕터1 기준값)
var BOSS_ULT_NEED_CH = [5, 6, 7, 8, 9, 10, 11, 13, 14, 16];
var BOSS_ULT_SELF = 0.5;           // 게이지로 스스로 쓴 필살기는 절반
var BOSS_CHIP = 0.25;
var BOSS_CHIP_CAP = 0.12;          // 한 매치의 칩 상한 = 필살기 1회의 12%
var BOSS_ATK_MS = 15000;           // 반격 주기
var BOSS_TELL_MS = 1800;           // 예고 → 실제 투하까지. 이유 없는 방해는 좌절 장치다
var BOSS_ATK_BLK = 2;              // 반격 1회에 떨어지는 블로커 수
var BOSS_ATK_SALT = 0x2545F491;    // 반격 위치의 시드 스트림 (재도전 재현성)
var BOSS_MISSION_MS = 15000;       // 보스3 미션 사슬의 미션당 제한시간
var BOSS_SPRINT_MS = 10000;        // 보스3 첫 미션의 창 = 스펙의 "10초 5매치"
var DUEL_ATK_K = 0.10;
var DUEL_SP_MULT = 2;              // spMax = atkMax × 2, 필살기 위력도 같은 배수
var DUEL_FOE_HP_K = 0.65;
var DUEL_NEED_CH      = [11, 10, 10, 13, 14, 13, 14, 13, 13, 14];   /* 74 — 수치안 §7-1: 옛 표 × 장비 티어 보정 G(1–3챕 1.00 · 4–6 1.10 · 7–8 1.15 · 9–10 1.20) 반올림 */
var DUEL_NEED_BOSS_CH = [12, 10, 11, 12, 12, 10, 10, 10, 13, 13];
var DUEL_ME_HP = 100;
var DUEL_FOE_ATK_MAX = 100;
var DUEL_MISS_GAIN = 12;           // ① 매치 불가 탭   (~8회면 만땅)
var DUEL_BREAK_GAIN = 5;           // ② 콤보 끊김      (소량)
var DUEL_IDLE_MS = 6000;           // ③ 무매치 방치의 적립 주기 (반복)
var DUEL_IDLE_GAIN = 8;
var DUEL_HIT_BASE = 0.18;
var DUEL_HIT_STEP = 0.004;
var DUEL_HIT_CAP = 35;
var DUEL_SKILL_MS = BOSS_ATK_MS;   // 방해 스킬 케이던스 — 반격 주기(15초) 재사용
var DUEL_SKILL_BLK = 2;
var DUEL_SKILL_MASK = 4;           // mask — 숫자를 가리는 칸 수
var DUEL_SKILL_MASK_MS = 15000;    // mask — 자동 해제까지
var DUEL_SKILL_QUAKE = 2;          // quake — 왼쪽으로 한 칸 미는 행 수
var DUEL_SKILL_CYCLE_MS = 30000;   // cocoa 'cycle' — 기술이 갈리는 주기
var DUEL_COND_HIT = 0.3;
var DUEL_COND_MAX = 3;
var DUEL_PET_MAX = 2;              // 펫 스킬 판당 횟수 (단계 3에서 소비)
var DUEL_PET_POP = 4;              // 삐약 "쪼아먹기" — 한 번에 지우는 산 칸 수
var DUEL_PET_FREEZE_MS = 8000;     // 뭉치 「말랑 방패」 — 74: 레버 실효 7.8초를 굳혀 8초(스펙 §E-3)
var DUEL_BEAM_MAX = 4;             // 자동공격 1회가 쏘는 광선 최대 개수
var DUEL_BEAM_GAP_MS = 45;         // 광선 사이 간격 — 이보다 짧으면 동시로 읽힌다
var DUEL_MG_WIN        = 2200;     // 진입 카운트 창
var DUEL_MG_ENTER      = 2;        // 그 창 안 발사 수 >= 이면 폭주 진입
var DUEL_MG_GRACE      = 2000;     // 마지막 발사 후 이만큼 조용하면 해제
var DUEL_MG_TIER2      = 3;        // 2단 문턱(발사 수)
var DUEL_MG_TIER2_WIN  = 3000;     // 2단 판정 창(더 넓다)
var DUEL_MG_BEAM_MAX   = 6;        // 2단에서만 빔 상한 4 -> 6 (신 파티클 0)
var DUEL_SCRIPT_HP     = 0.60;
var DUEL_SCRIPT_STAGE  = 50;       // 각본은 이 한 탄뿐이다(100탄 재대결은 이기는 판)
var HOWTO_ULT_PCT = 30;
var CLASSIC_STUCK_MS = 900;
var DUEL_FINISH_MS     = 10000;
var FINISH_SPRINT_FAST = 8000;
var HITSTOP_LIGHT_MS = 110;        // 작은 사건 — 적 스킬 착탄·방패
var HITSTOP_MS = 140;              // 보통 — 펫 발동
var HITSTOP_HEAVY_MS = 180;        // 필살기 착탄. 여기가 이 게임에서 가장 무거운 한 방이다
var DUEL_MONGLE_FREEZE_MS = 4000;  // (다음 파도 예약) 몽글 "시간 웅덩이" — 뭉치의 짧은 변주
var DUEL_CHURUP_ROWS = 1;          // (다음 파도 예약) 츄릅 "한 입 재굴림" — 다시 굴릴 행 수
var DUEL_TIKTOK_FREEZE_MS = 6000;  // 째깍이 "타임스톱" — 시계 정지 길이(§4.4)
var DUEL_PPYAK_FREELINK_MS = 8000; // 삐약 "자유 연결" — 연결 판정 완화 창(§4.6 ⓑ)
var DUEL_MUKMUL_REPAINT = 5;       // 먹물이 "먹물 발사" — 같은 값으로 덮는 칸 수(§3.5)
var DUEL_KKULTTEOK_GOLD = 2;       // 꿀떡이 "황금 열매 소환" — 골드 스탬프 수(§16-B #6)
var DUEL_BANGUL_CLEAN = 2;         // 방울이 "거품 정화" — 지우는 방해 타일 수(§16-B #5)
// ==PURE:BEGIN==
function idxToRC(i) {
return { r: (i / COLS) | 0, c: i % COLS };
}
function isAlive(cells, i) {
var c = cells[i];
return !!c && !c.dead;
}
function canMatch(cells, a, b) {
if (a === b) return false;
if (!isAlive(cells, a) || !isAlive(cells, b)) return false;
var va = cells[a].v, vb = cells[b].v;
return va === vb || va + vb === 10;
}
function isReadingConnected(cells, a, b) {
if (a === b) return false;
var lo = a < b ? a : b;
var hi = a < b ? b : a;
for (var i = lo + 1; i < hi; i++) {
if (isAlive(cells, i)) return false;
}
return true;
}
function isLineConnected(cells, a, b) {
if (a === b) return false;
var A = idxToRC(a), B = idxToRC(b);
var dr = B.r - A.r, dc = B.c - A.c;
if (!(dr === 0 || dc === 0 || Math.abs(dr) === Math.abs(dc))) return false;
var steps = Math.max(Math.abs(dr), Math.abs(dc));
if (steps === 0) return false;
var sr = dr === 0 ? 0 : (dr > 0 ? 1 : -1);
var sc = dc === 0 ? 0 : (dc > 0 ? 1 : -1);
for (var k = 1; k < steps; k++) {
var r = A.r + sr * k;
var c = A.c + sc * k;
if (c < 0 || c >= COLS || r < 0) return false; // impossible geometry, bail safely
if (isAlive(cells, r * COLS + c)) return false;
}
return true;
}
function isConnected(cells, a, b) {
return isReadingConnected(cells, a, b) || isLineConnected(cells, a, b);
}
function isValidPair(cells, a, b) {
return canMatch(cells, a, b) && isConnected(cells, a, b);
}
function connectCandidates(cells, a) {
var out = [];
var i, cell;
for (i = a + 1; i < cells.length; i++) {
cell = cells[i];
if (cell) {
if (!cell.dead) { out.push(i); break; }
}
}
var A = idxToRC(a);
for (var d = 0; d < DIRS.length; d++) {
var dr = DIRS[d][0], dc = DIRS[d][1];
var r = A.r + dr, c = A.c + dc;
while (r >= 0 && c >= 0 && c < COLS) {
var idx = r * COLS + c;
if (idx >= cells.length) {
if (dr > 0) break;      // walked past the end of the board
r += dr; c += dc; continue;
}
if (isAlive(cells, idx)) { out.push(idx); break; }
r += dr; c += dc;
}
}
return out;
}
function findAnyPair(cells) {
for (var a = 0; a < cells.length; a++) {
if (!isAlive(cells, a)) continue;
var cand = connectCandidates(cells, a);
for (var k = 0; k < cand.length; k++) {
var b = cand[k];
if (isValidPair(cells, a, b)) return a < b ? [a, b] : [b, a];
}
}
return null;
}
function countPairs(cells) {
var seen = Object.create(null);
var n = 0;
for (var a = 0; a < cells.length; a++) {
if (!isAlive(cells, a)) continue;
var cand = connectCandidates(cells, a);
for (var k = 0; k < cand.length; k++) {
var b = cand[k];
if (!isValidPair(cells, a, b)) continue;
var lo = a < b ? a : b, hi = a < b ? b : a;
var key = lo + ':' + hi;
if (!seen[key]) { seen[key] = 1; n++; }
}
}
return n;
}
function findFullDeadRows(cells) {
var rows = Math.ceil(cells.length / COLS);
var out = [];
for (var r = 0; r < rows; r++) {
var any = false, allDead = true;
for (var c = 0; c < COLS; c++) {
var cell = cells[r * COLS + c];
if (!cell) continue;
any = true;
if (!cell.dead) { allDead = false; break; }
}
if (any && allDead) out.push(r);
}
return out;
}
function collapseRows(cells, rows) {
var kill = Object.create(null);
for (var i = 0; i < rows.length; i++) kill[rows[i]] = 1;
var out = [];
for (var j = 0; j < cells.length; j++) {
if (kill[(j / COLS) | 0]) continue;
out.push(cells[j]);
}
return out;
}
function buildAddCells(cells) {
var out = cells.slice();
for (var i = 0; i < cells.length; i++) {
var c = cells[i];
if (c && !c.dead) out.push({ v: c.v, dead: false });
}
return out;
}
function mulberry32(seed) {
var t = seed >>> 0;
return function () {
t = (t + 0x6D2B79F5) >>> 0;
var x = t;
x = Math.imul(x ^ (x >>> 15), 1 | x);
x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
};
}
function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
function genBoard(stage, seed) {
var N = clamp(25 + stage * 2, 25, 45) | 0;
var p = clamp(0.55 - (stage - 1) * 0.022, 0.35, 0.55);
var minPairs = Math.max(3, Math.floor(N * 0.08));
var s = seed >>> 0;
var cells = null;
for (var attempt = 0; attempt < 40; attempt++) {
var rng = mulberry32(s);
var vals = [];
while (vals.length < N) {
if (rng() < p && vals.length <= N - 2) {
var v = 1 + ((rng() * 9) | 0);
if (v > 9) v = 9;
var partner = rng() < 0.5 ? v : 10 - v;
if (partner < 1 || partner > 9) partner = v;
vals.push(v);
vals.push(partner);
} else {
var w = 1 + ((rng() * 9) | 0);
if (w > 9) w = 9;
vals.push(w);
}
}
vals.length = N;
cells = [];
for (var i = 0; i < N; i++) cells.push({ v: vals[i], dead: false });
if (countPairs(cells) >= minPairs) return { cells: cells, seed: s };
s = (s + 1) >>> 0;
}
return { cells: cells, seed: s };
}
// ==PURE:END==
// ==EXT:BEGIN== special-tile rules. Calls PURE, never modifies it.
function spOf(cells, i) {
var c = cells[i];
return (c && c.sp) ? c.sp : '';
}
function iceOf(cells, i) {
var c = cells[i];
return (c && c.sp === 'ice') ? (c.ice | 0) : 0;
}
function isWild(cells, i) {
return isAlive(cells, i) && spOf(cells, i) === 'wild';
}
function isBlocker(cells, i) {
return isAlive(cells, i) && spOf(cells, i) === 'block';
}
function canMatchEx(cells, a, b) {
// 좁히는 규칙이 먼저다: 와일드라도 블로커와는 짝이 되지 않는다.
if (isBlocker(cells, a) || isBlocker(cells, b)) return false;
if (canMatch(cells, a, b)) return true;
return a !== b && isAlive(cells, a) && isAlive(cells, b) &&
(isWild(cells, a) || isWild(cells, b));
}
function connFreeOn() {
var d = S && S.duel;
return !!(d && d.freeLinkUntil > 0 && now() < d.freeLinkUntil);
}
function allAliveEx(cells, a) {
var out = [];
for (var i = 0; i < cells.length; i++) {
if (i !== a && isAlive(cells, i)) out.push(i);
}
return out;
}
function isValidPairEx(cells, a, b) {
return canMatchEx(cells, a, b) &&
((a !== b && connFreeOn()) || isConnected(cells, a, b));
}
function findAnyPairEx(cells) {
for (var a = 0; a < cells.length; a++) {
if (!isAlive(cells, a)) continue;
var cand = connFreeOn() ? allAliveEx(cells, a) : connectCandidates(cells, a);
for (var k = 0; k < cand.length; k++) {
var b = cand[k];
if (isValidPairEx(cells, a, b)) return a < b ? [a, b] : [b, a];
}
}
return null;
}
function countPairsEx(cells) {
var seen = Object.create(null);
var n = 0;
for (var a = 0; a < cells.length; a++) {
if (!isAlive(cells, a)) continue;
var cand = connectCandidates(cells, a);
for (var k = 0; k < cand.length; k++) {
var b = cand[k];
if (!isValidPairEx(cells, a, b)) continue;
var lo = a < b ? a : b, hi = a < b ? b : a;
var key = lo + ':' + hi;
if (!seen[key]) { seen[key] = 1; n++; }
}
}
return n;
}
function bombTargets(cells, i) {
var out = [];
if (!cells[i]) return out;
var A = idxToRC(i);
for (var dr = -1; dr <= 1; dr++) {
for (var dc = -1; dc <= 1; dc++) {
if (dr === 0 && dc === 0) continue;
var r = A.r + dr, c = A.c + dc;
if (r < 0 || c < 0 || c >= COLS) continue;   // no wrap, no negative rows
var idx = r * COLS + c;
if (idx < 0 || idx >= cells.length) continue;
if (isAlive(cells, idx)) out.push(idx);
}
}
return out;
}
function releaseBlockers(cells, seeds) {
var freed = [];
var touched = Object.create(null);
for (var s = 0; s < seeds.length; s++) {
var tg = bombTargets(cells, seeds[s]);
for (var k = 0; k < tg.length; k++) {
var i = tg[k];
if (touched[i]) continue;             // 한 매치는 한 겹만 벗긴다
if (!isBlocker(cells, i)) continue;
touched[i] = 1;
var c = cells[i];
c.blk = (c.blk | 0) - 1;
if (c.blk <= 0) { c.sp = ''; c.blk = 0; freed.push(i); }
}
}
return freed;
}
function crumbleBlockers(cells) {
var freed = [];
for (var i = 0; i < cells.length; i++) {
if (!isBlocker(cells, i)) continue;
cells[i].sp = ''; cells[i].blk = 0;
freed.push(i);
}
return freed;
}
function applyHandicaps(cells, blk, lock, rng) {
if (typeof rng !== 'function') return cells;
var want = (blk | 0) + (lock | 0);
if (want <= 0) return cells;
var live = [];
for (var i = 0; i < cells.length; i++) {
if (cells[i] && !cells[i].dead && !cells[i].sp) live.push(i);
}
if (!live.length) return cells;
shuffleSeeded(live, rng);
var cap = Math.floor(cells.length * ADV_HAND_RATIO);
if (want > cap) want = cap;
if (want > live.length) want = live.length;
var nb = Math.min(blk | 0, want);
var nl = Math.min(lock | 0, want - nb);
var k = 0;
for (; k < nb; k++) { cells[live[k]].sp = 'block'; cells[live[k]].blk = 1; }
for (; k < nb + nl; k++) { cells[live[k]].sp = 'ice'; cells[live[k]].ice = 1; }
return cells;
}
function countSpecials(cells) {
var n = 0;
for (var i = 0; i < cells.length; i++) {
if (cells[i] && !cells[i].dead && cells[i].sp) n++;
}
return n;
}
function shuffleSeeded(arr, rng) {
for (var i = arr.length - 1; i > 0; i--) {
var j = (rng() * (i + 1)) | 0;
if (j > i) j = i;
var tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
}
return arr;
}
function specialKinds(stage, mode) {
var rush = mode === 'rush';
var adv = mode === 'adv';
return {
wild: adv ? (stage >= SP_WILD_ADV) : true,
gold: true,
ice: rush ? (stage >= SP_STAGE_MIN)
: (adv ? (stage >= SP_ICE_ADV) : (stage >= SP_ICE_STAGE)),
bomb: rush ? (stage >= SP_STAGE_MIN)
: (adv ? (stage >= SP_BOMB_ADV) : (stage >= SP_BOMB_STAGE))
};
}
function applySpecials(cells, stage, mode, rng) {
if (mode === 'daily' || typeof rng !== 'function') return cells;
var rush = mode === 'rush';
// Below the density gate, stage 1 still earns its single gold tile.
if (!rush && stage < SP_STAGE_MIN) return applyStage1Gold(cells, rng);
// 1. every living, still-plain cell is a candidate
var live = [];
for (var i = 0; i < cells.length; i++) {
if (cells[i] && !cells[i].dead && !cells[i].sp) live.push(i);
}
if (!live.length) return cells;
// 2. target count first, then clamp to the 12% board ceiling
var density = Math.min(rush ? SP_DENSITY_RUSH : SP_DENSITY, SP_MAX_RATIO);
var room = Math.floor(cells.length * SP_MAX_RATIO) - countSpecials(cells);
var target = Math.round(live.length * density);
if (target > room) target = room;
if (target > live.length) target = live.length;
if (target <= 0) return cells;
// 3. spread them across the whole board, not just the part scanned first
shuffleSeeded(live, rng);
// 4. roll each chosen cell's kind against the weight table
var allow = specialKinds(stage, mode);
var wWild = SP_W_WILD;
var wGold = SP_W_GOLD + (allow.ice ? 0 : SP_W_ICE);  // ice's share -> gold
var wIce = allow.ice ? SP_W_ICE : 0;
var wBomb = allow.bomb ? SP_W_BOMB : 0;
var total = wWild + wGold + wIce + wBomb;
for (var k = 0; k < target; k++) {
var c = cells[live[k]];
var r = rng() * total;
if (r < wWild) { c.sp = 'wild'; }
else if (r < wWild + wGold) { c.sp = 'gold'; }
else if (r < wWild + wGold + wIce) { c.sp = 'ice'; c.ice = 1; }
else { c.sp = 'bomb'; }
}
return cells;
}
function applyBombs(cells, from, mode, rng) {
if (mode === 'daily' || typeof rng !== 'function') return cells;
var p = SP_BOMB * (mode === 'rush' ? 2 : 1);
var cap = Math.floor(cells.length * SP_MAX_RATIO);
var used = countSpecials(cells);
for (var i = from; i < cells.length; i++) {
var c = cells[i];
if (!c || c.dead) continue;
var r = rng();
if (used >= cap) continue;
if (c.sp) continue;
if (r < p) { c.sp = 'bomb'; used++; }
}
return cells;
}
var EB_ROWS0 = 10;         // rows on stage 1 -> 70 cells (7열)
var EB_ROWS_MAX = 13;      // cap -> 91 cells, reached at stage 10 (was 12 / stage 7)
var EB_STAGE_STEP = 3;     // stages per extra row
var EB_RETRIES = 40;       // genBoardExt's own re-seed budget (PURE's number)
function extRows(stage) {
var st = (stage | 0) < 1 ? 1 : (stage | 0);
var r = EB_ROWS0 + (((st - 1) / EB_STAGE_STEP) | 0);
return r > EB_ROWS_MAX ? EB_ROWS_MAX : r;
}
function extBoardSize(stage) { return extRows(stage) * COLS; }
var GB_ATTEMPTS = 40;      // hard cap on re-seeds; the walk is deterministic
var GB_BAND = 0.15;        // ±15% acceptance band, per the contract
var GB_EXIT = 0.75;        // stop early once an attempt is this close, in pairs
var GB_D0 = 0.90;          // stage-1 target, in valid pairs per living cell
var GB_DSTEP = 0.03;       // ...falling this much per stage
var GB_DMIN = 0.60;        // ...down to this floor (reached at stage 11)
var GB_WALK = 0x9E3779B1;  // golden-ratio step for the seed walk
var EB_P_A = 0.73;         // measured density of a board with no planting at all
var EB_P_B = 0.59;         // measured density gained per unit of planting p
var EB_P_MAX = 0.55;       // PURE's own stage-1 p, kept as the ceiling
var EB_P_MIN = 0.20;       // 0826: 텐 편향 최소 심기 확률 (데일리 제외). 0.25는 후반 짝밀도 이탈 0.16 → 0.20 = 텐비 1.45·이탈 0.11 (심 136판 실측)
function pairDensityTarget(stage) {
var st = (stage | 0) < 1 ? 1 : (stage | 0);
var d = GB_D0 - (st - 1) * GB_DSTEP;
return d < GB_DMIN ? GB_DMIN : d;
}
function extFillP(stage, density, legacy) {
var d = (typeof density === 'number' && isFinite(density))
? density : pairDensityTarget(stage);
var p = clamp((d - EB_P_A) / EB_P_B, 0, EB_P_MAX);
if (legacy) return p;
return p < EB_P_MIN ? EB_P_MIN : p;
}
function genBoardExt(stage, seed, density, legacy) {
var N = extBoardSize(stage);
var p = extFillP(stage, density, legacy);
var minPairs = Math.max(3, Math.floor(N * 0.08));
var s = seed >>> 0;
var cells = null;
for (var attempt = 0; attempt < EB_RETRIES; attempt++) {
var rng = mulberry32(s);
var vals = [];
while (vals.length < N) {
if (rng() < p && vals.length <= N - 2) {
var v = 1 + ((rng() * 9) | 0);
if (v > 9) v = 9;
var partner = legacy ? (rng() < 0.5 ? v : 10 - v) : (10 - v);
if (partner < 1 || partner > 9) partner = v;
vals.push(v);
vals.push(partner);
} else {
var w = 1 + ((rng() * 9) | 0);
if (w > 9) w = 9;
vals.push(w);
}
}
vals.length = N;
cells = [];
for (var i = 0; i < N; i++) cells.push({ v: vals[i], dead: false });
if (countPairs(cells) >= minPairs) return { cells: cells, seed: s };
s = (s + 1) >>> 0;
}
return { cells: cells, seed: s };
}
function genBoardBanded(stage, seed, wantDensity, legacy) {
var s = seed >>> 0;
var best = null, bestDist = Infinity;
var loose = null;                       // fallback if every attempt is degenerate
var density = (typeof wantDensity === 'number' && isFinite(wantDensity))
? wantDensity : pairDensityTarget(stage);
for (var attempt = 0; attempt < GB_ATTEMPTS; attempt++) {
var g = genBoardExt(stage, s, density, legacy);
var cells = g.cells || [];
var n = countPairs(cells);
if (!loose) loose = g;
// The generator's own floor. Below it, g.seed is the post-increment seed
// and does not regenerate g.cells, so such a board can never be a winner.
var floorPairs = Math.max(3, Math.floor(cells.length * 0.08));
s = (g.seed + GB_WALK) >>> 0;         // deterministic walk, seed-derived only
if (n < floorPairs) continue;
var dist = Math.abs(n - density * cells.length);
if (dist < bestDist) { bestDist = dist; best = g; }
if (bestDist <= GB_EXIT) break;       // nothing closer is worth the search
}
if (best) return { cells: best.cells, seed: best.seed };
return loose ? { cells: loose.cells, seed: loose.seed }
: genBoardExt(stage, seed >>> 0, density, legacy);
}
var SP_STAGE1_GOLD = 1;     // exactly one, to keep stage 1 legible
var SP_STAGE1_ZONE = 0.5;   // confined to the last 50% of the board
function applyStage1Gold(cells, rng) {
if (typeof rng !== 'function') return cells;
var live = [];
var i;
var start = Math.floor(cells.length * SP_STAGE1_ZONE);
for (i = start; i < cells.length; i++) {
if (cells[i] && !cells[i].dead && !cells[i].sp) live.push(i);
}
if (!live.length) {                     // tiny/odd board: fall back to all of it
for (i = 0; i < cells.length; i++) {
if (cells[i] && !cells[i].dead && !cells[i].sp) live.push(i);
}
}
if (!live.length) return cells;
shuffleSeeded(live, rng);
var n = Math.min(SP_STAGE1_GOLD, live.length);
for (i = 0; i < n; i++) cells[live[i]].sp = 'gold';
return cells;
}
function cloneCells(cells) {
var out = [];
for (var i = 0; i < (cells ? cells.length : 0); i++) {
var c = cells[i];
if (!c) { out.push(c); continue; }
var o = { v: c.v, dead: !!c.dead };
if (c.sp) o.sp = c.sp;
if (c.ice) o.ice = c.ice | 0;
if (c.mk) o.mk = c.mk;
if (c.mkItem) o.mkItem = c.mkItem;
if (c.mkTier) o.mkTier = c.mkTier;
out.push(o);
}
return out;
}
var SHUF_SALT = 0x85EBCA6B;   // odd 32-bit constant; mixes the ordinal in
var SHUF_STRIDE = 97;         // separates the retry stream of one shuffle from the next
var SHUF_TRIES = 24;          // re-arrangement attempts before we admit defeat
function shuffleSeedFor(seed, n) {
return (((seed >>> 0) + Math.imul(n >>> 0, SHUF_SALT)) >>> 0);
}
function shuffleCellsEx(cells, rng) {
var idx = [], pay = [], i;
for (i = 0; i < cells.length; i++) {
if (cells[i] && !cells[i].dead) {
idx.push(i);
pay.push({ v: cells[i].v, sp: cells[i].sp || '', ice: cells[i].ice | 0 });
}
}
shuffleSeeded(pay, rng);
for (i = 0; i < idx.length; i++) {
var c = cells[idx[i]], p = pay[i];
c.v = p.v;
if (p.sp) {
c.sp = p.sp;
if (p.sp === 'ice') c.ice = p.ice; else if ('ice' in c) delete c.ice;
} else {
if ('sp' in c) delete c.sp;
if ('ice' in c) delete c.ice;
}
}
return cells;
}
function shuffleBoardEx(cells, seed, shuffleCount, tries) {
var max = tries | 0; if (max < 1) max = 1;
var base = ((shuffleCount | 0) * SHUF_STRIDE) >>> 0;
for (var k = 0; k < max; k++) {
shuffleCellsEx(cells, mulberry32(shuffleSeedFor(seed, (base + k) >>> 0)));
if (countPairsEx(cells) > 0) return { ok: true, tries: k + 1 };
}
return { ok: false, tries: max };
}
function blockersBetween(cells, a, b, cap) {
var lim = (cap | 0) > 0 ? (cap | 0) : 4;
var out = [], k, r, c, idx, i;
if (a === b) return out;
var A = idxToRC(a), B = idxToRC(b);
var dr = B.r - A.r, dc = B.c - A.c;
if (dr === 0 || dc === 0 || Math.abs(dr) === Math.abs(dc)) {
var steps = Math.max(Math.abs(dr), Math.abs(dc));
var sr = dr === 0 ? 0 : (dr > 0 ? 1 : -1);
var sc = dc === 0 ? 0 : (dc > 0 ? 1 : -1);
for (k = 1; k < steps && out.length < lim; k++) {
r = A.r + sr * k; c = A.c + sc * k;
if (c < 0 || c >= COLS || r < 0) break;
idx = r * COLS + c;
if (isAlive(cells, idx)) out.push(idx);
}
if (out.length) return out;          // the straight line is the clearer story
}
var lo = a < b ? a : b, hi = a < b ? b : a;
for (i = lo + 1; i < hi && out.length < lim; i++) {
if (isAlive(cells, i)) out.push(i);
}
return out;
}
function rejectReason(cells, a, b) {
if (!canMatchEx(cells, a, b)) return 'value';
var A = idxToRC(a), B = idxToRC(b);
var dr = B.r - A.r, dc = B.c - A.c;
var aligned = (dr === 0 || dc === 0 || Math.abs(dr) === Math.abs(dc));
return aligned ? 'blocked' : 'notaligned';
}
// ==EXT:END==
function $(id) {
return (typeof document === 'undefined') ? null : document.getElementById(id);
}
function on(el, ev, fn, opts) {
if (el && el.addEventListener) el.addEventListener(ev, fn, opts);
}
function setIcon(el, name) {
if (!el || !el.querySelector) return;
var u = el.querySelector("use");
if (!u) return;
try { u.setAttribute("href", "#ic-" + name); } catch (e) { /* ignore */ }
}
function isCapsuleHead(el) {
try {
return !!(el && el.matches &&
el.matches('.modal-v2 .mv2-sheet > h2, .modal-v2 .mv2-head > h2, #modal-node .r10-ribbon > h2, #modal-drops .r10-ribbon > h2, #sh-sign > h2, #modal-clear .sheet > h2, #modal-adv:not(.is-advfinish) .sheet > h2, #modal-gear #gear-h, #modal-gear-info #gi-h, #modal-minimap .r10-ribbon > h2, #modal-theater .r10-ribbon > h2, #modal-quest .sheet > h2, #modal-soon .sheet > h2, #modal-invite .sheet > h2, #modal-confirm .sheet > h2, #modal-playground .sheet > h2, #modal-odds .sheet > h2, #modal-daily .sheet > h2, #modal-shop .r10-ribbon > h2'));   /* [Task 8b2] 장비 두 창 제목 = CSS 레터링(지휘자 판정 2-4) · [Task 129] 챕터 · 스토리 극장 제목도 */
} catch (e) { return false; }
}
function headText(el, s) {
if (!el) return;
if (!isCapsuleHead(el)) { if (el.textContent !== s) el.textContent = s; return; }
var sp = el.firstElementChild;
if (!sp || sp.className !== 'mvh-title' || el.childNodes.length !== 1) {
el.textContent = '';
sp = document.createElement('span');
sp.className = 'mvh-title';
el.appendChild(sp);
}
if (sp.textContent !== s) sp.textContent = s;
fitHead(el);      // [E14-0902] 제목을 갈아 쓰는 세 경로가 전부 여기를 지난다
}
var MVH_FS_MIN = .060;
function mvhBase(h) {
// 기본값은 CSS 가 준다(ko .128 / en .098). 인라인 값을 지우고 다시 읽는다.
h.style.removeProperty('--mvh-fs');
var v = parseFloat(getComputedStyle(h).getPropertyValue('--mvh-fs'));
return (v > 0) ? v : .128;
}
function mvhNeed(sp) {
var cs = getComputedStyle(sp);
var m = document.createElement('span');
m.textContent = sp.textContent || '';
m.style.cssText = 'position:absolute;left:-9999px;top:0;white-space:nowrap;'
+ 'max-width:none;overflow:visible;visibility:hidden;pointer-events:none;';
m.style.fontFamily = cs.fontFamily;
m.style.fontSize = cs.fontSize;
m.style.fontWeight = cs.fontWeight;
m.style.fontStyle = cs.fontStyle;
m.style.letterSpacing = cs.letterSpacing;
m.style.textTransform = cs.textTransform;
document.body.appendChild(m);
var w = m.getBoundingClientRect().width;
document.body.removeChild(m);
return w;
}
function fitHead(h) {
if (!h || !h.getBoundingClientRect) return;
var sp = h.querySelector ? h.querySelector('.mvh-title') : null;
if (!sp) return;
var base = mvhBase(h);
var cs = getComputedStyle(h);
var avail = h.clientWidth
- (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0);
if (!(avail > 0)) return;                     // 창이 안 떠 있으면 잰 값이 0 이다
var need = mvhNeed(sp);
if (!(need > 0) || need <= avail) return;     // 짧은 제목 — 승인값 그대로
// 글자 폭은 크기에 비례한다(자간도 em 이라 같이 준다). 한 번에 맞고,
// 웹폰트 힌팅이 남길 수 있는 잔차만 두 번째 회전으로 닫는다.
var k = base * (avail / need);
for (var i = 0; i < 2 && k > MVH_FS_MIN; i++) {
h.style.setProperty('--mvh-fs', String(Math.round(k * 1e5) / 1e5));
var n2 = mvhNeed(sp);
if (n2 <= avail) break;
k = k * (avail / n2);
}
if (k < MVH_FS_MIN) k = MVH_FS_MIN;
k = k * 0.995;                                // 0.5% 여유
if (k < MVH_FS_MIN) k = MVH_FS_MIN;
h.style.setProperty('--mvh-fs', String(Math.round(k * 1e5) / 1e5));
}
function fitHeads(root) {
var list = (root || document).querySelectorAll(
'.modal-v2 .mv2-sheet > h2, .modal-v2 .mv2-head > h2, #modal-node .r10-ribbon > h2, #modal-drops .r10-ribbon > h2, #sh-sign > h2, #modal-clear .sheet > h2, #modal-adv:not(.is-advfinish) .sheet > h2, #modal-gear #gear-h, #modal-gear-info #gi-h, #modal-minimap .r10-ribbon > h2, #modal-theater .r10-ribbon > h2, #modal-quest .sheet > h2, #modal-soon .sheet > h2, #modal-invite .sheet > h2, #modal-confirm .sheet > h2, #modal-playground .sheet > h2, #modal-odds .sheet > h2, #modal-daily .sheet > h2, #modal-shop .r10-ribbon > h2');   /* [Task 8b2] 레터링 제목 셋째 목록 — isCapsuleHead · healHeads 와 같은 줄 */
for (var i = 0; i < list.length; i++) fitHead(list[i]);
}
try {
var _mvhT = 0;
window.addEventListener('resize', function () {
clearTimeout(_mvhT);
_mvhT = setTimeout(function () { fitHeads(document); }, 120);
});
if (window.MutationObserver) {
var _mo = new MutationObserver(function (recs) {
for (var i = 0; i < recs.length; i++) {
var t = recs[i].target;
if (t && !t.hidden) { healHeads(t); }
}
});
var _ms = document.querySelectorAll('.modal, #charpanel');
for (var mi = 0; mi < _ms.length; mi++) {
_mo.observe(_ms[mi], { attributes: true, attributeFilter: ['hidden'] });
}
}
if (document.fonts && document.fonts.ready && document.fonts.ready.then) {
document.fonts.ready.then(function () { fitHeads(document); });
}
} catch (e) { /* 재보기는 부가 기능이다 — 실패해도 제목은 CSS 기본값으로 선다 */ }
function healHeads(root) {
var list = (root || document).querySelectorAll(
'.modal-v2 .mv2-sheet > h2, .modal-v2 .mv2-head > h2, #modal-node .r10-ribbon > h2, #modal-drops .r10-ribbon > h2, #sh-sign > h2, #modal-clear .sheet > h2, #modal-adv:not(.is-advfinish) .sheet > h2, #modal-gear #gear-h, #modal-gear-info #gi-h, #modal-minimap .r10-ribbon > h2, #modal-theater .r10-ribbon > h2, #modal-quest .sheet > h2, #modal-soon .sheet > h2, #modal-invite .sheet > h2, #modal-confirm .sheet > h2, #modal-playground .sheet > h2, #modal-odds .sheet > h2, #modal-daily .sheet > h2, #modal-shop .r10-ribbon > h2');
for (var i = 0; i < list.length; i++) {
var h = list[i];
if (h.firstElementChild && h.firstElementChild.className === 'mvh-title'
&& h.childNodes.length === 1) continue;
headText(h, (h.textContent || '').trim());
}
fitHeads(root);   // [E14-0902] 살린 뒤 곧바로 캡슐 안폭에 맞춘다
}
function setText(id, txt) {
var el = $(id);
if (el) headText(el, String(txt));
}
function noop() {}
// window.Juice stub — every documented method resolves to a no-op if absent.
// J.bgm is seeded here too: it is an OBJECT, not a function, so the JUICE_FNS
// loop below cannot build it and an un-seeded J.bgm.start() would throw before
// bindJuice() has ever run.
var J = { sfx: {}, bgm: { start: noop, stop: noop, setFever: noop, setIntensity: noop,
setPanic: noop, scene: noop, mainStart: noop, mainStop: noop,
setNight: noop } };
var JUICE_FNS = ['init', 'setSound', 'setVibrate', 'resumeAudio',
'unlockAudio', 'burst', 'beam',
'sweep', 'confetti', 'floatText', 'screenPulse', 'vignette',
'vibrate', 'clear',
// v2 additions (contract §7) — absent methods stay no-ops
'shockwave', 'feverAura',
// v3 additions (CONTRACT-V3 §3) — same no-op guarantee
'brokenLink', 'feverEnter', 'duck',
'lineGuide'];
var JUICE_SFX = ['select', 'match', 'fail', 'rowClear', 'combo', 'deal', 'win', 'lose', 'ui',
// v2 additions (contract §7)
'feverOn', 'feverOff', 'bomb', 'gold', 'ice', 'mission',
'heartbeat', 'grade', 'milestone',
// v7: the mascot's voice. Absent juice.js -> silent mascot, nothing else.
'cheer',
'voice', 'tierUp',
'jackpot',
'hurry', 'cry',
'spBlast', 'petBell', 'foeStab',
'awakenMax',
'reward',
'starGet'];
var UI_SFX_MERGE_MS = 60;
var UI_SFX_TAP_MAX_MS = 1500;
var UI_TAP_COALESCE_MS = 40;    // 같은 한 번의 눌림에서 겹쳐 오는 이벤트를 합치는 창
var uiTapSeq = 0;               // 발급된 표 번호
var uiTapMarkAt = 0;            // 마지막 발급 시각
var uiTapPlayedSeq = -1;        // 소리로 바뀐 마지막 표 번호
var uiSfxLastAt = 0;            // 마지막 재생 시각 (bindJuice 재바인딩과 무관하게 산다)
function uiTapMark() {
var t = (typeof Date !== 'undefined' && Date.now) ? Date.now() : 0;
if (t && (t - uiTapMarkAt) < UI_TAP_COALESCE_MS) return;   // 같은 눌림의 형제 이벤트
uiTapMarkAt = t;
uiTapSeq++;
}
if (typeof document !== 'undefined' && document.addEventListener) {
var UI_TAP_DOWN = ['pointerdown', 'touchstart', 'keydown'];
for (var utd = 0; utd < UI_TAP_DOWN.length; utd++) {
document.addEventListener(UI_TAP_DOWN[utd], uiTapMark, { capture: true, passive: true });
}
}
function bindJuice() {
var src = (typeof window !== 'undefined' && window.Juice) ? window.Juice : {};
var s = src.sfx || {};
JUICE_FNS.forEach(function (n) {
J[n] = (typeof src[n] === 'function') ? src[n].bind(src) : noop;
});
JUICE_SFX.forEach(function (n) {
J.sfx[n] = (typeof s[n] === 'function') ? s[n].bind(s) : noop;
});
var rawUi = J.sfx.ui;
J.sfx.ui = function () {
var nowMs = (typeof Date !== 'undefined' && Date.now) ? Date.now() : 0;
if (uiTapSeq && uiTapSeq === uiTapPlayedSeq &&
nowMs && (nowMs - uiSfxLastAt) < UI_SFX_TAP_MAX_MS) return;
if (nowMs && (nowMs - uiSfxLastAt) < UI_SFX_MERGE_MS) return;
uiTapPlayedSeq = uiTapSeq;
uiSfxLastAt = nowMs;
return rawUi.apply(null, arguments);
};
// Juice.bgm is an OBJECT, not a function, so it needs its own no-op shim.
// Each method is bound and probed independently: a juice.js that ships only
// part of the trio still contributes the part it has.
var b = src.bgm || {};
J.bgm = {
start:    (typeof b.start === 'function') ? b.start.bind(b) : noop,
stop:     (typeof b.stop === 'function') ? b.stop.bind(b) : noop,
setFever: (typeof b.setFever === 'function') ? b.setFever.bind(b) : noop,
// v7: layer count 0-3. An older juice.js without it keeps its single layer.
setIntensity: (typeof b.setIntensity === 'function') ? b.setIntensity.bind(b) : noop,
// v8: TIME RUSH last-10s tempo lift. An older juice.js simply stays at 132 BPM.
setPanic: (typeof b.setPanic === 'function') ? b.setPanic.bind(b) : noop,
scene:     (typeof b.scene === 'function') ? b.scene.bind(b) : noop,
mainStart: (typeof b.mainStart === 'function') ? b.mainStart.bind(b) : noop,
mainStop:  (typeof b.mainStop === 'function') ? b.mainStop.bind(b) : noop,
setNight:  (typeof b.setNight === 'function') ? b.setNight.bind(b) : noop,
mainInfo:  (typeof b.mainInfo === 'function') ? b.mainInfo.bind(b) : function () { return null; }
};
}
bindJuice(); // pre-bind to no-ops so nothing can throw before init()
// Tracked timers so nothing leaks between stages / screens.
var timers = [];
var popLive = 0;
var popGen = 0;
var popBurstAt = 0;
var POP_BURST_MS = POP_MS * 2;
var fallGen = 0;
var awkStreak = 0;
var stdyRun = 0;
var statAgil = false;
var multFxTier = 0;
var lastGainRec = { gainPre: 0, gain: 0, bombPre: 0, bombGain: 0, aw: 1, fx: 1, st: 1, tw: 1, im: 1, mm: 1 };   /* 74 — 스모크 손잡이(게임 코드는 안 읽는다). 미리 만든 한 객체의 필드만 매치마다 고친다 — 게임 중 객체 생성 0(점검 R5) */
var AWK_LEFT_ARG = { n: 0 };
var awkBadgeSec = -1, awkBadgeLang = '', awkBadgeTxt = '';
var multFxAt = 0;
var MULT_FX_MIN_MS = 1500;
function later(fn, ms) {
var id = setTimeout(function () {
var k = timers.indexOf(id);
if (k >= 0) timers.splice(k, 1);
try { fn(); } catch (e) { /* never break the loop */ }
}, ms);
timers.push(id);
return id;
}
function clearTimers() {
for (var i = 0; i < timers.length; i++) clearTimeout(timers[i]);
timers.length = 0;
popLive = 0;
popGen = 0;
popBurstAt = 0;
fallGen = 0;
awkStreak = 0;
stdyRun = 0;
statAgil = false;
multFxTier = 0;
multFxAt = 0;
multFxUntil = 0;
}
function now() {
return (typeof performance !== 'undefined' && performance.now)
? performance.now() : Date.now();
}
var store = {
schemaVersion: SCHEMA_VERSION,
best: 0, bestStage: 1, sound: true, vibrate: true,
streak: 0, lastDailyDate: '', dailyBest: null, save: null,
streakClaimed: {},
lang: '',  // '' = follow navigator; 'en' / 'ko' = explicit user choice
bestClassic: 0,          // 클래식 아케이드 최고 점수
bestClassicStage: 1,     // 클래식 아케이드 최고 단계
bestClassicRush: 0,      // 클래식 타임러시 최고 점수
classicDailyBest: null,  // 클래식 데일리 오늘 결과 (일반 dailyBest 와 별개)
saveClassic: null,       // 클래식 전용 진행 저장 슬롯
classicSkills: false,
// --- v2 (contract §9). Older saves simply lack these; defaults apply. ---
bestRush: 0,        // Time Rush high score, kept apart from `best`
totalMatches: 0,    // lifetime matches, drives the milestone toasts
milestones: [],     // milestone values already celebrated
// --- v3 ---
lastMissionId: '',  // previous stage's mission, so it is never repeated
tutorialDone: false,// first-run tutorial seen (or skipped) at least once
tutorialCleared: false,
theme: '',
rushSeen: false,
rushHintShown: false,
ranks: { endless: [], rush: [], daily: [] },
charId: 'ten',
mateId: '',
advMax: 1,
advStars: {},
advFails: {},
advBest: {},
hearts: HEART_MAX,
heartAt: 0,
gauge: 0,
jellyOn: false,
skins: [],
equipped: {},
jstar: 0,
invited: {},
introSeen: {},
statLv: {},
shards: { power: 0, steady: 0, agility: 0, luck: 0 },
shardDry: { power: 0, steady: 0, agility: 0, luck: 0 },
shardEver: { power: 0, steady: 0, agility: 0, luck: 0 },
items: { own: {}, eq: {}, src: {} },
giftNoItem: 0,
pets: [{ id: 'ppyak', lv: 1, evo: 0, up: { pwr: 0, std: 0, agi: 0, luk: 0 } },
{ id: 'mungchi', lv: 1, evo: 0, up: { pwr: 0, std: 0, agi: 0, luk: 0 } }],
petsVer: 2,
tenTotal: 0,
shardDailyDate: '',
awkChainMax: 0,
noDelayMax: 0,
bossNoHit: 0,
seenCuts: {},
seenHowto: {},
tipsSeen: {},
arcadeBest: {},
bestArcade: 0,
v74: null, gearEver: 0, arcadeBestLegacy: {},
kingdom: { unlocked: [], zones: [], deco: {}, lastVisit: 0, tapToday: 0 },
jewel: 0,
iap: {},
dailyFreeAt: 0,
firstBuy: false,
quests: null,
achv: {},
comboMax: 0,      // 계정 최고 콤보 (에픽 combo5/10/20)
duelWins: 0,      // 아케이드 대전 누적 승 (에픽 duel1/10 · 일일 duel)
awkTotal: 0,      // 각성 누적 발동 (에픽 awaken50 · 일일 awaken)
coin: 0,
p3: null,
gacha: null,
adCaps: null,
deals: null,
coinCaps: null
};
function loadStore() {
readStore();
reconcileRanks();
ensureArcadeBest();     // 아케이드 대전 기록판 — 위 reconcile 과 같은 이유로 무조건
p3Ensure();       // P3 — 새 설치에도 뽑기·광고·특가 칸이 선다
storeLoaded = true;
}
var V74_NUM_CAP = 999999;   /* 옛 파편 소독 상한 SHARD_HOLD_MAX 와 같은 값의 리터럴(초기화 순서와 무관하게) */
var V74_SHARD_PER_LV = 30;
var V74_SHARD_PER_JSTAR = 10;
var V74_LV_MAX = 12;        /* 옛 ITEM_LV_MAX */
var V74_LEVER_MAX = 10;     /* 옛 PET_UP_LV_MAX */
var V74_STATS = ['power', 'steady', 'agility', 'luck'];
var V74_COMMON = { power: 'flint', steady: 'softcushion', agility: 'windribbon', luck: 'rabbitfoot' };
var V74_LEVER = { pwr: 'power', std: 'steady', agi: 'agility', luk: 'luck' };
var V74_WEAPONS = ['flint', 'fizzjelly', 'flamescepter', 'heatshard'];
var V74_PETS = ['ppyak', 'mungchi', 'mongle', 'churup', 'mukmul', 'tiktok', 'kkultteok', 'bangul', 'sseokssak', 'banjjak'];   /* = MATE_IDS(옛 readStore 가 인정한 펫 id) */
function v74Int(v, lo, hi, dflt) { return (typeof v === 'number' && isFinite(v)) ? Math.min(hi, Math.max(lo, v | 0)) : dflt; }
function v74LeverShards(lv) { var n = v74Int(lv, 0, V74_LEVER_MAX, 0); return 2 * n * n + 10 * n; }
function v1to2(o) {
var i, k, bal = {}, refund = {}, gear = {}, ev = {}, rest = 0, lvSum = 0, ever = 0;
var sh = (o.shards && typeof o.shards === 'object') ? o.shards : {};
for (i = 0; i < V74_STATS.length; i++) { k = V74_STATS[i]; bal[k] = v74Int(sh[k], 0, V74_NUM_CAP, 0); refund[k] = 0; }
if (Array.isArray(o.pets)) {
var petSeen = {};
for (i = 0; i < o.pets.length; i++) {
var pe = o.pets[i];
var pid = (typeof pe === 'string') ? pe : ((pe && typeof pe === 'object') ? pe.id : null);
if (typeof pid !== 'string' || V74_PETS.indexOf(pid) < 0 || petSeen[pid]) continue;   /* 아는 id 의 첫 줄만(옛 readStore) */
petSeen[pid] = 1;
if (!pe || typeof pe !== 'object' || !pe.up || typeof pe.up !== 'object') continue;
for (var lk in V74_LEVER) {
if (Object.prototype.hasOwnProperty.call(V74_LEVER, lk)) refund[V74_LEVER[lk]] += v74LeverShards(pe.up[lk]);
}
}
}
if (!o.items || typeof o.items !== 'object') o.items = {};
if (!o.items.own || typeof o.items.own !== 'object') o.items.own = {};
if (!o.items.src || typeof o.items.src !== 'object') o.items.src = {};
for (i = 0; i < V74_STATS.length; i++) {
k = V74_STATS[i];
var total = bal[k] + refund[k], id = V74_COMMON[k];
var had = v74Int(o.items.own[id], 1, V74_LV_MAX, 0);
var nl = Math.min(V74_LV_MAX, had + Math.floor(total / V74_SHARD_PER_LV));
if (nl > had) { o.items.own[id] = nl; gear[id] = nl - had; lvSum += nl - had; if (!had) o.items.src[id] = 'farm'; }
rest += total - (nl - had) * V74_SHARD_PER_LV;
}
var se = (o.shardEver && typeof o.shardEver === 'object') ? o.shardEver : {};
for (i = 0; i < V74_STATS.length; i++) {
k = V74_STATS[i];
ev[k] = Math.max(v74Int(se[k], 0, V74_NUM_CAP, 0), bal[k]);   /* ⑦ 누적 바닥 — 잔액을 0 으로 만들기 전에 */
ever += ev[k];
}
o.shardEver = ev;
o.gearEver = Math.floor(ever / 10);
o.shards = { power: 0, steady: 0, agility: 0, luck: 0 };
if (o.items.eq && typeof o.items.eq === 'object') {
for (var ck in o.items.eq) {
if (!Object.prototype.hasOwnProperty.call(o.items.eq, ck) || !Array.isArray(o.items.eq[ck])) continue;
var lst = o.items.eq[ck], otherW = false, seenW = false, keep = [];
for (var q = 0; q < lst.length; q++) {
if (lst[q] !== 'heatshard' && V74_WEAPONS.indexOf(lst[q]) >= 0 && v74Int(o.items.own[lst[q]], 1, V74_LV_MAX, 0) > 0) otherW = true;
}
for (q = 0; q < lst.length; q++) {
var iid = lst[q];
if (iid === 'heatshard' && otherW) continue;   /* ⑤ 무기 칸이 차 있다 — 열의 조각은 장착만 푼다 */
if (V74_WEAPONS.indexOf(iid) >= 0 && v74Int(o.items.own[iid], 1, V74_LV_MAX, 0) > 0) { if (seenW) continue; seenW = true; }
keep.push(iid);
}
o.items.eq[ck] = keep;
}
}
var moved = false;
if (o.arcadeBest && typeof o.arcadeBest === 'object' && o.arcadeBest['arc-dmg']) {
o.arcadeBestLegacy = { 'arc-dmg': o.arcadeBest['arc-dmg'] };
delete o.arcadeBest['arc-dmg'];
moved = true;
}
o.v74 = { shards: bal, refund: refund, gear: gear, jstar: Math.ceil(rest / V74_SHARD_PER_JSTAR),
lv: lvSum, arcdmg: moved, shown: 0, shownArc: 0, paid: 0 };
return o;
}
function v2to3(o) {
if (typeof o.coin !== 'number' || !isFinite(o.coin)) o.coin = 0;
if (!o.p3 || typeof o.p3 !== 'object') o.p3 = { shown: 0 };
return o;
}
var SCHEMA_MIGRATIONS = [
function v0to1(o) { return o; },
v1to2,
v2to3
];
var persistReadOnly = false;   // 미래 버전 저장을 만나면 true — 덮어쓰지 않는다
var storeLoaded = false;       // [F7.1-0925 fix1 M1] loadStore() 가 끝까지 돌면 true
var saveROWarned = false;      // final-fix I-4 — 세션당 1회만 아래 토스트(실제로 띄운 순간 쓴다 — 출시 전 A)
var saveROPending = false;     // 출시 전 A — 스플래시 밑에서 불려 아직 못 알린 알림(걷힌 뒤 saveROFlush 가 띄운다)
function noteSaveReadOnly() {
persistReadOnly = true;
if (saveROWarned) return;
saveROPending = true;
if (splashDone) saveROFlush();
}
function saveROFlush() {
if (!saveROPending || saveROWarned) return;
saveROPending = false; saveROWarned = true;
try { toast(t('toast.savero')); } catch (e) { /* 알림 때문에 부팅이 죽지 않는다 */ }
}
function saveROHoldMs() {
if (!saveROPending || saveROWarned) return 0;
try { return toastMs(t('toast.savero'), 2); } catch (e) { return 0; }
}
function backupRaw(tag, raw) {
try { window.localStorage.setItem(LS_BAK_PREFIX + tag, raw); } catch (e) { /* quota/private: ignore */ }
}
function backupRawStamped(raw) {
try {
var prefix = LS_KEY + '.bak.';
window.localStorage.setItem(prefix + Date.now(), raw);
var keys = [];
for (var i = 0; i < window.localStorage.length; i++) {
var k = window.localStorage.key(i);
if (k && k.indexOf(prefix) === 0 && /^[0-9]+$/.test(k.slice(prefix.length))) keys.push(k);
}
keys.sort(function (a, b) { return parseInt(a.slice(prefix.length), 10) - parseInt(b.slice(prefix.length), 10); });
while (keys.length > 2) { try { window.localStorage.removeItem(keys.shift()); } catch (e2) {} }
} catch (e) { /* quota/private: ignore */ }
}
function migrateStore(o, raw) {
var from = (typeof o.schemaVersion === 'number' && isFinite(o.schemaVersion)) ? (o.schemaVersion | 0) : 0;
if (from > SCHEMA_VERSION) {
backupRaw(String(from), raw);
noteSaveReadOnly();
try { console.warn('[tentwin] save schema v' + from + ' > v' + SCHEMA_VERSION + ': read-only, backup ' + LS_BAK_PREFIX + from); } catch (e) {}
return o;
}
for (var v = from; v < SCHEMA_VERSION; v++) {
try { o = SCHEMA_MIGRATIONS[v](o) || o; }
catch (e) {
backupRaw(String(from), raw);
noteSaveReadOnly();
try { console.warn('[tentwin] save migration v' + v + ' -> v' + (v + 1) + ' failed: read-only, backup ' + LS_BAK_PREFIX + from); } catch (e2) {}
try { return JSON.parse(raw); } catch (e3) { return o; }
}
}
return o;
}
function readStore(rawIn) {
try {
var raw = rawIn || window.localStorage.getItem(LS_KEY);
if (!raw) return;
var o;
try { o = JSON.parse(raw); }
catch (pe) {
backupRaw('corrupt', raw);
backupRawStamped(raw);
return;
}
if (o && typeof o === 'object') o = migrateStore(o, raw);
if (o && typeof o === 'object') {
if (typeof o.best === 'number') store.best = o.best;
if (typeof o.bestStage === 'number') store.bestStage = o.bestStage;
if (typeof o.sound === 'boolean') store.sound = o.sound;
if (typeof o.vibrate === 'boolean') store.vibrate = o.vibrate;
if (typeof o.streak === 'number') store.streak = o.streak;
if (o.streakClaimed && typeof o.streakClaimed === 'object') {
store.streakClaimed = {};
for (var sck in o.streakClaimed) {
if (!Object.prototype.hasOwnProperty.call(o.streakClaimed, sck)) continue;
if (o.streakClaimed[sck]) store.streakClaimed[sck] = 1;
}
}
if (o.invited && typeof o.invited === 'object') {
store.invited = {};
for (var ivk in o.invited) {
if (!Object.prototype.hasOwnProperty.call(o.invited, ivk)) continue;
if (o.invited[ivk]) store.invited[ivk] = 1;
}
}
if (o.introSeen && typeof o.introSeen === 'object') {
store.introSeen = {};
for (var isk in o.introSeen) {
if (!Object.prototype.hasOwnProperty.call(o.introSeen, isk)) continue;
if (o.introSeen[isk]) store.introSeen[isk] = 1;
}
}
if (typeof o.lastDailyDate === 'string') store.lastDailyDate = o.lastDailyDate;
if (typeof o.lang === 'string') store.lang = o.lang;
if (o.dailyBest) store.dailyBest = o.dailyBest;
if (o.save && Array.isArray(o.save.cells)) store.save = o.save;
if (o.saveClassic && Array.isArray(o.saveClassic.cells)) store.saveClassic = o.saveClassic;
if (typeof o.bestClassic === 'number' && isFinite(o.bestClassic)) store.bestClassic = o.bestClassic;
if (typeof o.bestClassicStage === 'number' && isFinite(o.bestClassicStage)) {
store.bestClassicStage = o.bestClassicStage;
}
if (typeof o.bestClassicRush === 'number' && isFinite(o.bestClassicRush)) {
store.bestClassicRush = o.bestClassicRush;
}
if (o.classicDailyBest) store.classicDailyBest = o.classicDailyBest;
if (typeof o.classicSkills === 'boolean') store.classicSkills = o.classicSkills;
// v2 fields — a pre-v2 save just leaves the defaults in place.
if (typeof o.bestRush === 'number' && isFinite(o.bestRush)) store.bestRush = o.bestRush;
if (typeof o.totalMatches === 'number' && isFinite(o.totalMatches)) {
store.totalMatches = o.totalMatches;
}
if (Array.isArray(o.milestones)) {
store.milestones = o.milestones.filter(function (m) { return typeof m === 'number'; });
}
// v3 field — a pre-v3 save has no mission history, '' just means
// "nothing to avoid", which is exactly the right starting state.
if (typeof o.lastMissionId === 'string') store.lastMissionId = o.lastMissionId;
if (typeof o.charId === 'string') {
if (HERO_IDS.indexOf(o.charId) >= 0) {
store.charId = o.charId;
} else if (MATE_IDS.indexOf(o.charId) >= 0) {
store.charId = CHAR_DEFAULT;
store.mateId = o.charId;
}
}
if (typeof o.mateId === 'string' &&
(o.mateId === '' || MATE_IDS.indexOf(o.mateId) >= 0)) {
store.mateId = o.mateId;
}
// Absent -> stays false -> an existing player meets the tutorial once and
// can skip it. That is intended: the connection rule was never taught
// (review #2), so even a returning player has not actually seen it.
if (typeof o.tutorialDone === 'boolean') store.tutorialDone = o.tutorialDone;
if (typeof o.tutorialCleared === 'boolean') store.tutorialCleared = o.tutorialCleared;
// Only the three legal values are accepted; anything else (including a
// pre-v3 save with no field at all) falls back to "follow the OS".
if (o.theme === 'dark' || o.theme === 'light' || o.theme === '') store.theme = o.theme;
// v4 fields — absent in every pre-v4 save, which is exactly the state of a
// player who has not met Time Rush yet, so the defaults are the right answer.
if (typeof o.rushSeen === 'boolean') store.rushSeen = o.rushSeen;
if (typeof o.rushHintShown === 'boolean') store.rushHintShown = o.rushHintShown;
if (o.ranks && typeof o.ranks === 'object') {
for (var ri = 0; ri < RANK_MODES.length; ri++) {
var rm = RANK_MODES[ri];
if (Array.isArray(o.ranks[rm])) store.ranks[rm] = o.ranks[rm];
}
}
if (o.arcadeBest && typeof o.arcadeBest === 'object') {
store.arcadeBest = {};
for (var abk in o.arcadeBest) {
if (!Object.prototype.hasOwnProperty.call(o.arcadeBest, abk)) continue;
var abe = o.arcadeBest[abk];
if (!abe || typeof abe !== 'object') continue;
if (typeof abe.value !== 'number' || !isFinite(abe.value)) continue;
store.arcadeBest[abk] = abe;
}
}
if (typeof o.advMax === 'number' && isFinite(o.advMax)) {
store.advMax = Math.max(1, o.advMax | 0);
}
store.advStars = sanitizeCountMap(o.advStars, 3);
store.advFails = sanitizeCountMap(o.advFails, 99);
if (o.advBest && typeof o.advBest === 'object') {
for (var abk in o.advBest) {
if (!Object.prototype.hasOwnProperty.call(o.advBest, abk)) continue;
var abv = o.advBest[abk];
if (typeof abv === 'number' && isFinite(abv) && abv > 0) {
store.advBest[abk] = Math.round(abv);
}
}
}
if (typeof o.hearts === 'number' && isFinite(o.hearts)) {
store.hearts = Math.max(0, o.hearts | 0);
}
if (typeof o.heartAt === 'number' && isFinite(o.heartAt)) {
store.heartAt = Math.max(0, o.heartAt | 0);
}
if (typeof o.gauge === 'number' && isFinite(o.gauge)) {
store.gauge = clamp(o.gauge, 0, SKILL_MAX);
}
if (Array.isArray(o.skins)) {
for (var si = 0; si < o.skins.length; si++) {
if (typeof o.skins[si] === 'string' && skinById(o.skins[si]) &&
store.skins.indexOf(o.skins[si]) < 0) store.skins.push(o.skins[si]);
}
}
if (o.equipped && typeof o.equipped === 'object') {
for (var ek in o.equipped) {
if (!Object.prototype.hasOwnProperty.call(o.equipped, ek)) continue;
var ev = o.equipped[ek];
if (typeof ev === 'string' && skinById(ev)) store.equipped[ek] = ev;
}
}
if (typeof o.jstar === 'number' && isFinite(o.jstar)) {
store.jstar = clamp(Math.floor(Number(o.jstar) || 0), 0, STAR_MAX);   /* P3 T1 수정 1회차 M3 — starGrant 와 같은 상한(STAR_MAX) */
} else {
store.jstar = advStarsTotalOf(store.advStars);
}
if (o.v74 && typeof o.v74 === 'object' && !o.v74.paid) {
store.jstar = (store.jstar | 0) + Math.max(0, o.v74.jstar | 0);
o.v74.paid = 1;
}
if (o.quests && typeof o.quests === 'object') store.quests = o.quests;
if (o.achv && typeof o.achv === 'object') {
store.achv = {};
for (var qak in o.achv) {
if (!Object.prototype.hasOwnProperty.call(o.achv, qak)) continue;
var qav = o.achv[qak];
if (!qav) continue;
if (typeof qav === 'string') { store.achv[qak] = { date: qav, claimed: 0 }; continue; }
if (typeof qav === 'object') {
store.achv[qak] = { date: String(qav.date || ''), claimed: qav.claimed ? 1 : 0 };
}
}
}
if (typeof o.comboMax === 'number' && isFinite(o.comboMax)) store.comboMax = Math.max(0, o.comboMax | 0);
if (typeof o.duelWins === 'number' && isFinite(o.duelWins)) store.duelWins = Math.max(0, o.duelWins | 0);
if (typeof o.awkTotal === 'number' && isFinite(o.awkTotal)) store.awkTotal = Math.max(0, o.awkTotal | 0);
if (o.seenHowto && typeof o.seenHowto === 'object') {
for (var hk in o.seenHowto) {
if (!Object.prototype.hasOwnProperty.call(o.seenHowto, hk)) continue;
if (typeof hk === 'string' && hk.length <= 16 && o.seenHowto[hk]) store.seenHowto[hk] = 1;
}
}
if (o.seenCuts && typeof o.seenCuts === 'object') {
for (var ck in o.seenCuts) {
if (!Object.prototype.hasOwnProperty.call(o.seenCuts, ck)) continue;
if (typeof ck === 'string' && ck.length <= 16 && o.seenCuts[ck]) store.seenCuts[ck] = 1;
}
}
if (o.tipsSeen && typeof o.tipsSeen === 'object') {
for (var tk in o.tipsSeen) {
if (!Object.prototype.hasOwnProperty.call(o.tipsSeen, tk)) continue;
if (typeof tk === 'string' && tk.length <= 16 && o.tipsSeen[tk]) store.tipsSeen[tk] = 1;
}
}
if (o.statLv && typeof o.statLv === 'object') {
for (var hi = 0; hi < HERO_IDS.length; hi++) {
var hid = HERO_IDS[hi];
var src = o.statLv[hid];
if (!src || typeof src !== 'object') continue;
var dst = null;
for (var ski = 0; ski < STAT_KEYS.length; ski++) {
var sk = STAT_KEYS[ski];
var sv = src[sk];
if (typeof sv !== 'number' || !isFinite(sv)) continue;
sv = sv | 0;
if (sv < 0) sv = 0;
if (sv > STAT_LV_MAX) sv = STAT_LV_MAX;
if (!dst) dst = {};
dst[sk] = sv;
}
if (dst) store.statLv[hid] = dst;
}
}
if (o.kingdom && typeof o.kingdom === 'object') {
var kdo = o.kingdom;
if (Array.isArray(kdo.unlocked)) {
for (var kui = 0; kui < kdo.unlocked.length; kui++) {
var kuid = kdo.unlocked[kui];
if (typeof kuid !== 'string' || !kdBuilding(kuid)) continue;
if (store.kingdom.unlocked.indexOf(kuid) < 0) store.kingdom.unlocked.push(kuid);
}
}
if (Array.isArray(kdo.zones)) {
for (var kzi = 0; kzi < kdo.zones.length; kzi++) {
var kzid = kdo.zones[kzi];
if (typeof kzid !== 'string' || !kdZone(kzid)) continue;
if (store.kingdom.zones.indexOf(kzid) < 0) store.kingdom.zones.push(kzid);
}
}
if (kdo.deco && typeof kdo.deco === 'object') {
for (var kdk in kdo.deco) {
if (!Object.prototype.hasOwnProperty.call(kdo.deco, kdk)) continue;
var kslot = parseInt(kdk, 10);
if (!isFinite(kslot) || kslot < 0 || kslot >= KD_DECO_SLOTS) continue;
var kdid = kdo.deco[kdk];
if (typeof kdid !== 'string' || !kdDeco(kdid)) continue;
store.kingdom.deco[String(kslot)] = kdid;
}
}
if (typeof kdo.lastVisit === 'number' && isFinite(kdo.lastVisit)) {
var kdlv = Math.max(0, Math.floor(kdo.lastVisit));
if (kdlv <= Date.now() + 86400000) store.kingdom.lastVisit = kdlv;
}
if (typeof kdo.tapToday === 'number' && isFinite(kdo.tapToday)) {
store.kingdom.tapToday = clamp(kdo.tapToday | 0, 0, KD_TAP_CAP);
}
}
if (typeof o.jewel === 'number' && isFinite(o.jewel)) {
store.jewel = Math.max(0, Math.min(JEWEL_MAX, Math.floor(o.jewel))) | 0;
}
if (o.iap && typeof o.iap === 'object') {
for (var iapi = 0; iapi < IAP_KEYS.length; iapi++) {
var iapk = IAP_KEYS[iapi];
if (!Object.prototype.hasOwnProperty.call(o.iap, iapk)) continue;
store.iap[iapk] = !!o.iap[iapk];
}
}
if (typeof o.dailyFreeAt === 'number' && isFinite(o.dailyFreeAt)) {
var dfa = Math.max(0, Math.floor(o.dailyFreeAt));
if (dfa <= Date.now() + DAILY_FREE_MS) store.dailyFreeAt = dfa;
}
if (typeof o.firstBuy === 'boolean') store.firstBuy = o.firstBuy;
if (o.shards && typeof o.shards === 'object') {
for (var wsi = 0; wsi < STAT_KEYS.length; wsi++) {
var wsk = STAT_KEYS[wsi], wsv = o.shards[wsk];
if (typeof wsv !== 'number' || !isFinite(wsv)) continue;
store.shards[wsk] = clamp(wsv | 0, 0, SHARD_HOLD_MAX);
}
}
if (o.shardDry && typeof o.shardDry === 'object') {
for (var wdi = 0; wdi < STAT_KEYS.length; wdi++) {
var wdk = STAT_KEYS[wdi], wdv = o.shardDry[wdk];
if (typeof wdv !== 'number' || !isFinite(wdv)) continue;
store.shardDry[wdk] = clamp(wdv | 0, 0, SHARD_PITY);
}
}
for (var evi = 0; evi < STAT_KEYS.length; evi++) {
var evk = STAT_KEYS[evi];
var evv = (o.shardEver && typeof o.shardEver === 'object') ? o.shardEver[evk] : null;
var evn = (typeof evv === 'number' && isFinite(evv))
? clamp(evv | 0, 0, SHARD_HOLD_MAX) : 0;
store.shardEver[evk] = Math.max(evn, store.shards[evk] | 0);
}
if (o.items && typeof o.items === 'object') {
var iown = o.items.own;
if (iown && typeof iown === 'object') {
for (var iok in iown) {
if (!Object.prototype.hasOwnProperty.call(iown, iok)) continue;
if (!itemById(iok)) continue;
var iov = iown[iok];
if (typeof iov !== 'number' || !isFinite(iov)) continue;
store.items.own[iok] = clamp(iov | 0, 1, ITEM_LV_MAX);
}
}
var ieq = o.items.eq;
if (ieq && typeof ieq === 'object') {
for (var ihi = 0; ihi < HERO_IDS.length; ihi++) {
var ihd = HERO_IDS[ihi], isrc = ieq[ihd];
if (!Array.isArray(isrc)) continue;
var ilist = [];
for (var iei = 0; iei < isrc.length; iei++) {
var iid = isrc[iei];
if (typeof iid !== 'string' || !itemById(iid)) continue;
if (!store.items.own[iid]) continue;
if (ilist.indexOf(iid) < 0) ilist.push(iid);
}
if (ilist.length) store.items.eq[ihd] = ilist.slice(0, ITEM_SLOTS.length);
}
}
store.items.src = {};
var srcIn = (o.items && o.items.src && typeof o.items.src === 'object') ? o.items.src : {};
for (var isk in srcIn) {
if (!Object.prototype.hasOwnProperty.call(srcIn, isk) || !itemById(isk) || !store.items.own[isk]) continue;
store.items.src[isk] = itemSrcOf(srcIn[isk]);
}
}
if (typeof o.giftNoItem === 'number' && isFinite(o.giftNoItem)) {
store.giftNoItem = clamp(o.giftNoItem | 0, 0, GACHA_PITY);
}
if (Array.isArray(o.pets)) {
var plist = [], pseen = {};
for (var ppi = 0; ppi < o.pets.length; ppi++) {
var praw = o.pets[ppi];
var pid = (typeof praw === 'string')
? praw
: (praw && typeof praw === 'object' ? praw.id : null);
if (typeof pid !== 'string' || MATE_IDS.indexOf(pid) < 0) continue;
if (pseen[pid]) continue;
pseen[pid] = 1;
plist.push(makePetEntry(pid, praw));
}
for (var pfi = 0; pfi < PET_FREE.length; pfi++) {
if (!pseen[PET_FREE[pfi]]) {
pseen[PET_FREE[pfi]] = 1;
plist.push(makePetEntry(PET_FREE[pfi], null));
}
}
store.pets = plist;
} else {
store.pets = [];
for (var pmi = 0; pmi < PET_LEGACY_ALL.length; pmi++) {
store.pets.push(makePetEntry(PET_LEGACY_ALL[pmi], null));
}
}
store.petsVer = 2;
if (typeof o.tenTotal === 'number' && isFinite(o.tenTotal)) {
store.tenTotal = Math.max(0, o.tenTotal | 0);
}
if (typeof o.shardDailyDate === 'string' && /^[0-9]{8}$/.test(o.shardDailyDate)) {
store.shardDailyDate = o.shardDailyDate;
}
if (typeof o.awkChainMax === 'number' && isFinite(o.awkChainMax)) {
store.awkChainMax = Math.max(0, o.awkChainMax | 0);
}
if (typeof o.noDelayMax === 'number' && isFinite(o.noDelayMax)) {
store.noDelayMax = Math.max(0, o.noDelayMax | 0);
}
if (typeof o.bossNoHit === 'number' && isFinite(o.bossNoHit)) {
store.bossNoHit = Math.max(0, o.bossNoHit | 0);
}
if (o.jellyOn === true) store.jellyOn = true;
else if (o.charId === 'jelly') store.jellyOn = true;
else if (typeof o.advMax === 'number' && (o.advMax | 0) > ADV_CHAPTER) {
store.jellyOn = true;
}
if (o.v74 && typeof o.v74 === 'object') store.v74 = o.v74;
if (typeof o.gearEver === 'number' && isFinite(o.gearEver)) store.gearEver = Math.max(0, o.gearEver | 0);
if (o.arcadeBestLegacy && typeof o.arcadeBestLegacy === 'object') store.arcadeBestLegacy = o.arcadeBestLegacy;
store.coin = clamp(Math.floor(Number(o.coin) || 0), 0, COIN_MAX);
if (o.p3 && typeof o.p3 === 'object') store.p3 = { shown: o.p3.shown ? 1 : 0 };
store.gacha = gachaStateFrom(o.gacha);
store.adCaps = adCapsFrom(o.adCaps);
store.deals = dealsFrom(o.deals);
store.coinCaps = coinCapsFrom(o.coinCaps);   /* 판정판 102 ① — 반복 코인 하루 셈 */
}
} catch (e) {
if (raw) backupRawStamped(raw);
noteSaveReadOnly();   // final-fix I-4
}
}
function sanitizeCountMap(o, cap) {
var out = {};
if (!o || typeof o !== 'object') return out;
for (var k in o) {
if (!Object.prototype.hasOwnProperty.call(o, k)) continue;
var n = parseInt(k, 10);
if (!isFinite(n) || n < 1 || String(n) !== String(k)) continue;
var v = o[k];
if (typeof v !== 'number' || !isFinite(v)) continue;
v = v | 0;
if (v < 0) continue;
out[String(n)] = v > cap ? cap : v;
}
return out;
}
var saveFailWarned = false;
function persist() {
if (persistReadOnly) return;   // 미래 버전 저장 보호 (migrateStore)
store.schemaVersion = SCHEMA_VERSION;
var raw = JSON.stringify(store);
try {
window.localStorage.setItem(LS_KEY, raw);
} catch (e) {
if (!saveFailWarned) {
saveFailWarned = true;
try { toast(t('toast.savefail')); } catch (e2) { /* 알림 때문에 저장 경로가 죽지 않는다 */ }
}
}
}
function saveProgress() {
if (!S.running) return;
// Time Rush is a 90-second session: resuming it later would be meaningless.
if (isRush() || S.mode === 'adv') { persist(); return; }
store[saveSlot()] = {
mode: S.mode, stage: S.stage, seed: S.seed,
cells: cloneCells(S.cells),
score: S.score, adds: S.adds, addsV: 2, hints: S.hints, startedAt: S.startedAt,
matches: S.matches, maxCombo: S.maxCombo, gridSeed: S.gridSeed,
addSeq: S.addSeq,
runCoin: S.coinRunAt === S.startedAt ? (S.runCoin | 0) : 0, x2Done: S.x2Done | 0, x2Token: S.x2Token | 0,
shuffles: S.shuffles, shuffleCount: S.shuffleCount,
lastMission: store.lastMissionId || '',
mission: S.mission ? {
id: S.mission.id, goal: S.mission.goal,
prog: S.mission.prog, done: !!S.mission.done
} : null
};
persist();
}
function dropProgress() {
store[saveSlot()] = null;
persist();
}
var RANK_MODES = ['endless', 'rush', 'daily', 'classic', 'classic-rush', 'classic-daily'];
var RANK_CAP = 5;
var RANK_SHAPE = {
endless: 'endless', rush: 'rush', daily: 'daily',
classic: 'endless', 'classic-rush': 'rush', 'classic-daily': 'daily'
};
function rankShape(mode) { return RANK_SHAPE[mode] || 'endless'; }
var RANK_FIELDS = {
endless: ['score', 'stage', 'date'],
rush:    ['score', 'matches', 'date'],
daily:   ['timeSec', 'n', 'matches', 'maxCombo', 'grade', 'date']
};
function rankInt(v) {
if (typeof v !== 'number' || !isFinite(v)) return null;
var n = Math.floor(v);
return n < 0 ? 0 : n;
}
function sanitizeRankEntry(mode, e) {
if (!e || typeof e !== 'object') return null;
// The primary metric is the one the mode is ranked by; an entry without a
// usable one cannot be placed at all and is dropped rather than guessed at.
var sh = rankShape(mode);   // W7.5 - 이름이 아니라 모양으로 가른다
var prim = (sh === 'daily') ? rankInt(e.timeSec) : rankInt(e.score);
if (prim === null) return null;
if (sh === 'daily') {
e.timeSec = prim;
e.n = rankInt(e.n) || 0;
e.matches = rankInt(e.matches) || 0;
e.maxCombo = rankInt(e.maxCombo) || 0;
e.grade = (typeof e.grade === 'string') ? e.grade : '';
} else if (sh === 'rush') {
e.score = prim;
e.matches = rankInt(e.matches) || 0;
} else {
e.score = prim;
// Stage is 1-based everywhere else in the game; 0 would render as "Stage 0".
e.stage = rankInt(e.stage) || 1;
}
e.date = (typeof e.date === 'string') ? e.date : '';
var keep = RANK_FIELDS[sh], k;
for (k in e) {
if (Object.prototype.hasOwnProperty.call(e, k) && keep.indexOf(k) < 0) delete e[k];
}
return e;
}
function cmpRankDate(a, b) {
var x = String(a || ''), y = String(b || '');
return x < y ? -1 : (x > y ? 1 : 0);
}
function cmpRankScore(a, b) {
if (b.score !== a.score) return b.score - a.score;
return cmpRankDate(a.date, b.date);
}
function cmpRankTime(a, b) {
if (a.timeSec !== b.timeSec) return a.timeSec - b.timeSec;
return cmpRankDate(a.date, b.date);
}
function rankCmpFor(mode) {
return (rankShape(mode) === 'daily') ? cmpRankTime : cmpRankScore;
}
function stableRankSort(arr, cmp) {
var i, dec = [], out = [];
for (i = 0; i < arr.length; i++) dec.push({ e: arr[i], i: i });
dec.sort(function (a, b) {
var d = cmp(a.e, b.e);
return d !== 0 ? d : (a.i - b.i);
});
for (i = 0; i < dec.length; i++) out.push(dec[i].e);
return out;
}
function rankHasScoreAtLeast(arr, v) {
for (var i = 0; i < arr.length; i++) if (arr[i].score >= v) return true;
return false;
}
function rankHasDate(arr, d) {
for (var i = 0; i < arr.length; i++) if (arr[i].date === d) return true;
return false;
}
function ensureRankArrays() {
if (!store.ranks || typeof store.ranks !== 'object') {
store.ranks = {};
}
for (var i = 0; i < RANK_MODES.length; i++) {
if (!Array.isArray(store.ranks[RANK_MODES[i]])) store.ranks[RANK_MODES[i]] = [];
}
}
function ensureArcadeBest() {
if (!store.arcadeBest || typeof store.arcadeBest !== 'object') store.arcadeBest = {};
}
function reconcileRanks() {
var i, mode, raw, clean, e;
ensureRankArrays();
var R = store.ranks;
// --- 1. sanitize -------------------------------------------------------
for (i = 0; i < RANK_MODES.length; i++) {
mode = RANK_MODES[i];
raw = R[mode];
clean = [];
for (var j = 0; j < raw.length; j++) {
e = sanitizeRankEntry(mode, raw[j]);
if (e) clean.push(e);
}
R[mode] = clean;
}
if (typeof store.best === 'number' && isFinite(store.best) && store.best > 0 &&
!rankHasScoreAtLeast(R.endless, store.best)) {
e = sanitizeRankEntry('endless', {
score: store.best, stage: store.bestStage, date: ''
});
if (e) R.endless.push(e);
}
if (typeof store.bestRush === 'number' && isFinite(store.bestRush) && store.bestRush > 0 &&
!rankHasScoreAtLeast(R.rush, store.bestRush)) {
e = sanitizeRankEntry('rush', { score: store.bestRush, matches: 0, date: '' });
if (e) R.rush.push(e);
}
var db = store.dailyBest;
if (db && typeof db === 'object' && typeof db.timeSec === 'number' && isFinite(db.timeSec) &&
!rankHasDate(R.daily, typeof db.date === 'string' ? db.date : '')) {
e = sanitizeRankEntry('daily', {
timeSec: db.timeSec, n: db.n, matches: db.matches,
maxCombo: db.maxCombo, grade: db.grade, date: db.date
});
if (e) R.daily.push(e);
}
// --- 3. sort, then truncate to the cap --------------------------------
for (i = 0; i < RANK_MODES.length; i++) {
mode = RANK_MODES[i];
R[mode] = stableRankSort(R[mode], rankCmpFor(mode)).slice(0, RANK_CAP);
}
// --- 4. derive the mirrors (see the section header for why not bestStage) ---
store.best = R.endless[0] ? R.endless[0].score : 0;
store.bestRush = R.rush[0] ? R.rush[0].score : 0;
store.bestClassic = R.classic[0] ? R.classic[0].score : 0;
store.bestClassicRush = R['classic-rush'][0] ? R['classic-rush'][0].score : 0;
}
function submitRank(mode, entry) {
if (RANK_MODES.indexOf(mode) < 0) return 0;
ensureRankArrays();
var e = sanitizeRankEntry(mode, entry);
if (!e) return 0;
if (!e.date) e.date = todayKey();
var arr = store.ranks[mode], i;
if (mode === 'daily') {
for (i = 0; i < arr.length; i++) {
if (arr[i].date !== e.date) continue;
if (e.timeSec >= arr[i].timeSec) { reconcileRanks(); persist(); return 0; }
arr.splice(i, 1);
break;
}
}
arr.push(e);
reconcileRanks();
persist();
// Identity, not value: two entries can be genuinely identical, and only the
// sanitizer's in-place contract can tell which one of them is ours.
arr = store.ranks[mode];
for (i = 0; i < arr.length; i++) if (arr[i] === e) return i + 1;
return 0;
}
var I18N = {
en: {
'menu.tagline': 'Match pairs that are equal or sum to 10.',
'menu.play': 'Play',
'menu.continue': 'Classic',
'menu.daily': 'Daily',
'menu.howto': 'How to play',
'menu.best': 'Best {score} · Stage {stage}',
'menu.bestclassic': 'Classic {score}',
'splash.tap': 'Tap anywhere to start',
'load.tip1': 'Clear pairs that make 10, or match twins.',
'load.tip2': 'One heart refills every 30 minutes.',
'load.tip3': 'Pop a gear fruit to collect that gear.',
'load.tip4': 'Tap the ⓘ next to a stat to read it.',
'load.tip5': 'Skill fires once the gauge is full.',
'load.tip6': 'Pet skills can turn a battle around.',
'load.tip7': 'The daily puzzle builds your streak.',
'load.tip8': 'Stuck? Shuffle makes new pairs.',
'aria.logo': 'Ten Twin Jelly Pang World',
'aria.play': 'Play Endless mode',
'aria.howto': 'How to play',
'aria.sound': 'Sound',
'aria.classicSkills': 'Toggle skills and pets',
'aria.vibe': 'Vibration',
'aria.lang': 'Language',
'aria.pause': 'Pause',
'howto.title': 'How to play',
'howto.p1': 'Tap two tiles showing the <b>same number</b>.',
'howto.p2': '&hellip;or two tiles that <b>add up to 10</b>.',
'howto.p3': 'The two tiles must sit on a <b>straight line</b>. Any of the 8 directions works.',
'howto.p4': '…or be <b>neighbors in reading order</b>. The end of a row wraps to the start of the next.',
'howto.p5': 'Empty a whole row and it <b>collapses</b>. Everything above drops down.',
'howto.prev': 'Prev',
'howto.next': 'Next',
'howto.close': 'Got it',
'aria.howtoPrev': 'Previous panel',
'aria.howtoNext': 'Next panel',
'aria.howtoClose': 'Close how to play',
'hud.stage': 'Stage',
'hud.score': 'Score',
'hud.best': 'Best',
'hud.time': 'Time',
'act.add': 'Add',
'act.hint': 'Hint',
'act.undo': 'Undo',
'aria.add': 'Add remaining numbers to the board',
'aria.hint': 'Show a hint',
'aria.undo': 'Undo last match',
'pause.title': 'Paused',
'pause.lang': 'Language: English',
'pause.howto': 'How to play',
'pause.restart': 'Restart stage',
'pause.menu': 'Main menu',
'pause.resume': 'Resume',
'aria.pzSound': 'Toggle sound',
'aria.pzVibe': 'Toggle vibration',
'aria.pzLang': 'Change language',
'aria.pzHowto': 'How to play',
'aria.pzRestart': 'Restart this stage',
'aria.pzMenu': 'Back to main menu',
'aria.pzResume': 'Resume game',
'clear.title': 'Stage {stage} clear!',
'clear.matches': 'Matches',
'clear.combo': 'Best combo',
'clear.adds': 'Adds left × 30',
'harvest.bonus': 'Harvest bonus +{n}',
'clear.total': 'Total',
'clear.next': 'Next stage',
'aria.next': 'Go to next stage',
'rw.starfruit': 'Skill fruit',
'rw.petfruit': 'Pet fruit',
'rw.awkfruit': 'Awakening fruit',
'rw.gem': 'Stars',
'rw.coin': 'Coins',
'rw.heart': 'Hearts',
'mk.gift': 'Gift box!',
'pet.get': '{n} joined you!',
'cp.items': 'Items',
'char.ten.passname': "Prince's Blessing",
'char.twin.passname': 'Twin Oath',
'char.jelly.passname': 'Jelly Time',
'char.pudding.passname': 'Pudding Shield',
'char.sodawitch.passname': 'Soda Spell',
'char.ppyak.passname': 'Free Link',
'char.mungchi.passname': 'Squishy Shield',
'char.mongle.passname': 'Time Puddle',
'char.churup.passname': 'Big Bite',
'char.mukmul.passname': 'Ink Splash',
'char.tiktok.passname': 'Time Stop',
'char.kkultteok.passname': 'Golden Call',
'char.bangul.passname': 'Bubble Wave',
'char.sseokssak.passname': 'Clean Sweep',
'char.banjjak.passname': 'Spark Charge',
'cp.sk.head': '[Skill]',
'cp.sk.skill': 'Skill',
'cp.sk.none': 'Going solo. No pet skill this run.',
'cp.pet.empty': 'Pick a pet and their skill shows up here. {free} are with you from the very first round.',
'cp.pet.sep': ' and ',
'cp.sk.lock': 'Locked',
'aria.loadout': 'Loadout',
'pet.axis.link': 'Link',
'pet.axis.time': 'Time',
'pet.axis.cleanse': 'Cleanse',
'pet.axis.layout': 'Layout',
'pet.axis.value': 'Value',
'pet.axis.count': 'Harvest',
'pet.axis.sweep': 'Sweep',
'pet.axis.awaken': 'Skill',
'item.flint.nm': 'Spark Flint',
'item.flint.fl': 'One small ember is enough to trigger a skill.',
'item.fizzjelly.nm': 'Firework Jelly',
'item.fizzjelly.fl': 'A jelly that knows when to burst.',
'item.flamescepter.nm': 'Flame Scepter',
'item.flamescepter.fl': 'A scepter holding the royal skill.',
'item.softcushion.nm': 'Squishy Cushion',
'item.softcushion.fl': 'So it never hurts, even without a rest.',
'item.puddingarmor.nm': 'Pudding Armor',
'item.puddingarmor.fl': 'A wobble that takes every miss for you.',
'item.turtleshield.nm': 'Turtle Shell Shield',
'item.turtleshield.fl': 'A thousand hits and it never wavers.',
'item.windribbon.nm': 'Wind Ribbon',
'item.windribbon.fl': 'Half a beat ahead of the fall.',
'item.sodaboots.nm': 'Fizz Boots',
'item.sodaboots.fl': 'A step with a tingle in it.',
'item.boltshoes.nm': 'Bolt Sneakers',
'item.boltshoes.fl': 'Already on the next tile, mid-pop.',
'item.rabbitfoot.nm': "Rabbit's Foot Charm",
'item.rabbitfoot.fl': 'The hind foot of a jelly rabbit.',
'item.luckybell.nm': 'Lucky Bell',
'item.luckybell.fl': 'Ring it and the odds smile back.',
'item.goldclover.nm': 'Golden Four-Leaf Clover',
'item.goldclover.fl': 'The fourth leaf is always a jackpot.',
'item.heatshard.nm': 'Heat Shard',
'item.heatshard.fl': 'A splinter of the Heart. Thumbnail-sized, and your palm still burns.',
'item.twinmirror.nm': 'Twin Mirror',
'item.twinmirror.fl': 'Look in and someone your own age looks back.',
'item.crossnecklace.nm': 'Crossing Necklace',
'item.crossnecklace.fl': 'The princes split it as children. One half alone has no power.',
'item.chainbracelet.nm': 'Chain Bracelet',
'item.chainbracelet.fl': 'It only rattles while the run is still going.',
'item.firstcharm.nm': 'First-Move Charm',
'item.firstcharm.fl': 'The first move decides the shape of the whole board.',
'item.lastcharm.nm': 'Last-Second Charm',
'item.lastcharm.fl': 'Some people do better once they panic. This is for them.',
'item.awakecatalyst.nm': 'Skill Catalyst',
'item.awakecatalyst.fl': 'It does not shine itself. It only brings the shining forward.',
'item.puddingcharm.nm': 'Pudding Charm',
'item.puddingcharm.fl': 'A piece the Pudding Knight handed over, saying he did not need it.',
'item.soon': 'Coming soon',
'gear.slot.weapon': 'Weapon',
'gear.slot.aux': 'Guard',
'gear.slot.trinket': 'Charm',
'gear.title.list': 'Gear List',
'gear.title.info': 'Gear Info',
'gear.on': 'Equipped',
'gear.empty': 'Empty',
'gear.empty.hint': 'No gear for this slot yet. Clear stages to find some.',
'gear.equip': 'Equip',
'gear.unequip': 'Unequip',
'gear.wornby': 'Also equipped by {names}',
'gear.title': 'Gear',
'gear.done': 'Done',
'gear.auto': 'Auto Equip',
'gear.auto.done': 'Equipped your best gear',
'gear.auto.same': 'Already wearing your best gear',
'gear.bag.none': 'Collect gear fruits on adventures',
'gear.cmp.k': 'Equipped now',
'item.crossnecklace.eff': 'In battle, alternate Ten and Twin matches to fill the Awaken gauge {n}% more.',
'item.chainbracelet.eff': 'At combo {c} or more, matches score {n}% more.',
'item.firstcharm.eff': 'The first match of each stage scores {x}×.',
'item.lastcharm.eff': 'With {s}s or less left, matches score {n}% more.',
'item.puddingcharm.eff': "Blocks the villain's first attack once per battle.",
'over.title': 'Out of moves',
'over.best': 'Best',
'over.stage': 'Stage',
'over.continue': 'Continue (1 free)',
'over.continue.used': 'Again next board',
'over.continue.gem': 'Continue · 40 💎',
'over.retry': 'Retry',
'over.menu': 'Main menu',
'aria.continue': 'Continue this board with two more adds',
'aria.continue.used': 'Free continue already used on this board',
'aria.retry': 'Retry',
'aria.overMenu': 'Back to main menu',
'daily.title': 'Daily #{n}',
'daily.stats': '✅ {time} · {matches} matches · 🔥{combo}× · {score} pts',
'daily.grade': 'Rank {grade}',
'daily.share': 'Share',
'daily.menu': 'Main menu',
'aria.share': 'Share your daily result with a result card image',
'aria.dailyMenu': 'Back to main menu',
'toast.savefail': 'Progress can’t be saved',
'toast.savero': "Saving isn't working right now. Progress this session won't be saved.",
'v74.convert': '💎 Shard upgrades are gone. Your shards became gear levels (+{g}) and stars (+{s}).',
'v74.convert.gear': '💎 Shard upgrades are gone. Your shards became gear levels (+{g}).',
'v74.convert.star': '💎 Shard upgrades are gone. Your shards became stars (+{s}).',
'v74.arcdmg': 'Awakening now gives ×{am} points, so the Duel damage record starts fresh. Your old record is saved.',
'p3.walletnote': 'The top coin chip is now your coin wallet. Your adventure stars are on the map, in the bottom chip.',
'shop2.title': 'Shop',
'shop2.tab.gacha': 'Capsules',
'shop2.tab.deals': 'Deals',
'shop2.tab.free': 'Free',
'shop2.tab.deco': 'Style',
'shop2.tab.jewel': 'Jewels',
'shop2.sign': 'Shop',
'gacha.odds.s': 'Odds',
'gacha.btn1': 'Once',
'gacha.btn10': '×{n}',
'gacha.friend.have': 'Friends {have}/{all}',
'gacha.skin.have': 'Skins {have}/{all}',
'aria.shoptabs': 'Shop sections',
'aria.droptabs': 'Drop table sections',   /* [판정판 121 · Task 8a] 획득표 알약 탭 줄 */
'time.hm': '{h}h {m}m',
'deals.title': "Today's Deals",
'deals.gift': 'Daily Gift',
'deals.gift.d': 'Once a day',
'deals.gear': "Today's Gear",
'deals.sure': '{name} for sure',
'deals.heart1': 'One Heart',
'deals.trade': 'Trade for Stars',
'deals.heartfull': 'Full Hearts',
'deals.claim': 'Claim',
'deals.done': 'Tomorrow',
'deals.maxed': 'Max level',
'deals.got': 'You got {name}.',
'deals.foot': 'All deals are fixed items. You see what you get before you buy. They change every day at midnight.',
'deals.foot2': 'You can trade coins for stars up to {n} times a day.',
'coin.got': '+{n} coins',
'star.got': '+{n} stars',
'gacha.nocoin': 'You need {n} more coins.',
'gacha.item': 'Item Capsule',
'gacha.gold': 'Golden Capsule',
'gacha.friend': 'Friend Capsule',
'gacha.item.d': 'Any gear can come out!',
'gacha.gold.d': 'Only rare and epic gear!',
'gacha.friend.d': 'Only new friends!',
'gacha.free.first': 'First pull free',
'gacha.free.daily': 'Free pull today',
'gacha.pity': 'Epic guarantee {n}/{max}',
'gacha.friend.all': 'You have every friend. It opens again when a new friend arrives.',
'gacha.friend.note': 'Bosses and goals also bring friends.',
'gacha.nostar': 'You need {n} more stars.',
'gacha.used': 'Already used today.',
'gacha.skin': 'Style Capsule',
'gacha.skin.d': "Only skins you don't have yet!",
'gacha.skin.all': 'You have every skin. It opens again when a new skin arrives.',
'gacha.skin.none': 'No skins to get right now. New friends or skins will open it.',
'gacha.skin.note': 'Put on your skins from Skins on the character screen.',
'odds.title': 'Odds',
'odds.tab.item': 'Item',
'odds.tab.gold': 'Golden',
'odds.tab.friend': 'Friend',
'odds.tier': 'Odds by rarity (per pull)',
'odds.items': 'Odds per gear',
'odds.friends': 'Odds per friend',
'odds.skins': 'Odds per skin',
'odds.rules': 'Guarantees and repeats',
'odds.tier.row': '{n} kinds, {each} each',
'odds.rule.ten': 'In a pull ×{n}, if the first ones are all common, the last one is rare or better. Rare is {r} and epic is {e}.',
'odds.rule.pity': 'After {n} pulls without an epic, the next pull is a sure epic. Now {c}/{n}.',
'odds.rule.dup': 'A repeat raises the level by one. At the top level {max}, you get coins back. Common gives {c}, rare {r}, and epic {e}.',
'odds.rule.friend': "Only friends you don't have yet. Rarity weights common {c}, rare {r}, epic {e} are shared by the friends left.",
'odds.skin.dup': 'Skins you have never come out.',
'odds.foot1': 'Pulls use only coins, stars and ad rewards. They are never sold for money.',
'odds.foot2': 'The odds shown come from the same table the draw uses. Decimals are rounded. ({date})',
'gres.title1': 'Result',
'gres.title10': 'Pull ×{n} Result',
'gres.ten.up': 'A rare or better was guaranteed.',
'gres.pity.hit': 'The guarantee gave you an epic!',
'gres.pity.reset': 'The epic guarantee count starts over.',
'gres.lvup': 'Lv{a}→{b}',
'gres.sum': 'New {a} · Level up {b}',
'gres.skin.sum': 'New skin {a}',
'gres.refund': '{n} coins back',
'gres.new': 'NEW',
'gres.ok': 'OK',
'gres.again10': '{n} more',
'gres.again1': 'Once more',
'gres.openall': 'Open all',
'free.title': 'Watch and Get',
'free.reset': 'Resets at midnight. Time left',
'free.coin': '+{n} Coins',
'free.item': 'One Item Capsule pull',
'free.star': '+{n} Stars',
'free.heart': 'One Heart',
'free.friend': 'One Friend Capsule pull',
'free.x2': 'Double coins on results',
'free.left.day': '{n}/{m} left today',
'free.left.week': '{n}/{m} this week, resets Monday',
'free.heart.full': 'Locked while your hearts are full',
'free.friend.none': 'Locked when no new friend is left',
'free.x2.d': 'On the result screen after a round, {n}/{m} used today',
'free.x2.where': 'After a round',
'free.get': 'Get',
'free.tomorrow': 'Tomorrow',
'free.foot1': 'One ad gives one reward. There are no ad buttons during a round.',
'free.foot2': 'Without ads you can get the same things with coins, deals and missions.',
'gacha.ad': 'Watch an ad to pull',
'gacha.ad.week': 'Free pull, once a week',
'coin.x2': 'Double coins',
'coin.x2.no': 'Just take',
'coin.x2.got': 'You got {n} more coins!',
'gacha.dup.star': '{name} is already with you, so you got {n} stars.',
'toast.noadds': 'No adds left',
'toast.empty': 'Board is empty',
'toast.nohints': 'No hints left',
'toast.nomoves': 'No moves. Use Add.',
'toast.noundo': 'No undo left',
'toast.usedstage': 'Already used this stage',
'toast.copied': 'Copied!',
'toast.copyfail': 'Copy failed',
'combo.1': 'Nice!',
'combo.2': 'Great!',
'combo.3': 'Wow!',
'combo.4': 'Unreal!',
'char.ten.name': 'Tenten',
'char.twin.name': 'Twin',
'char.ppyak.name': 'Ppyak',
'char.ppyak.pass': 'For {psec} seconds, tiles far apart can link too. Ice tiles break in one match while it lasts.',
'char.mungchi.name': 'Mungchi',
'char.mungchi.pass': 'Stops the clock and the villain gauge for {psec} seconds. You can keep matching while they are stopped.',
'char.jelly.name': 'Jelly',
'cut.p3d': 'Nope. Those slowpoke princes—',
'cut.p3e': 'if I sit here waiting for a rescue,',
'cut.p3f': 'I’ll be a grandma before they show.',
'cut.f0': '…She’s already gone? — Then why did we come?',
'cut.f1': 'The bars are gone... you really came for me.',
'cut.f2': 'Now let us all go home together.',
'cut.c1a': 'The harmony of Jelly Pang World is broken.',
'cut.c1a2': 'When only sameness remains, the world slowly hardens.',
'cut.c1b': 'The Gobbler swallowed the Heart of Ten.',
'cut.c1b2': 'The Princess went after it\u2026 and got locked in the castle.',
'cut.c1c': '"Let\'s go. Every Ten we make, the world loosens a little."',
'cut.c2a': 'Even the river has gone sticky and stiff.',
'cut.c2a2': 'This is what happens when only like sticks with like.',
'cut.c3a': 'The old candy town. They say it crumbled first, the day the harmony broke.',
'cut.c3b': 'A starlight blinked from the castle. The Princess is alive.',
'cut.c4a': 'The wind bites. The Mint Gobbler freezes what moves \u2014 keep the chain going, don\'t stop.',
'cut.c5a': 'The castle\'s first gate. The keeper is\u2026 King Cocoa.',
'cut.c5a2': 'The very Gobbler who swallowed the Heart.',
'cut.c5b': 'You weren\'t too weak. Without the Heart, no Ten is ever complete. Fall back. Gather more.',
'cut.c6a': 'Inside the castle. The cream swallows every footstep. Gobbler territory, from here on.',
'cut.c7a': 'The paths keep sticking. What the maze wants: you, circling the same way forever.',
'cut.c8a': 'The cell where the Princess was held.',
'cut.c8a2': 'Scratched on the bars: "Harmony breaks \u2014 and can be matched anew."',
'cut.c8b': 'The cell is empty! The Princess is finding her own way.',
'cut.c9a': 'The Heart of Ten beats here.',
'cut.c9a2': 'Why the world hardened, and how it heals \u2014 all in this room.',
'cut.c10a': 'King Cocoa, once more. This time, the Heart beats on our side.',
'cut.c10b': 'Harmony returns. Sameness is welcome again \u2014 and what differs still adds up to Ten.',
'cut.c10b2': '\u2026That\'s how this world plays.',
'char.pudding.name': 'Pudding Knight',
'char.pudding.title': 'Shield of the Jelly Court',
'char.pudding.tag': 'Defender',
'char.pudding.ult': 'For {sec}s, every match extends your Ten Twin combo and gets both the Ten Power and Twin Power bonus.',
'char.pudding.tip': 'Pick him to hold the line and stack the chain.',
'skill.pudding.name': 'Pudding Shield',
'char.sodawitch.name': 'Soda Witch',
'char.sodawitch.title': 'Witch of the Fizzy Marsh',
'char.sodawitch.tag': 'Big-hitter',
'char.sodawitch.ult': 'For {sec}s, every match scores {x}×.',
'char.sodawitch.tip': 'Pick her to blow the board wide open.',
'skill.sodawitch.name': 'Soda Spell',
'char.mongle.name': 'Mongle',
'char.mongle.pass': 'Stops the clock and the villain gauge for {psec} seconds. You can keep matching while they are stopped.',
'char.churup.name': 'Churup',
'char.churup.pass': 'Picks a row with two or more tiles left and reshuffles it. It also blocks the next board quake.',
'char.mukmul.name': 'Inky',
'char.mukmul.pass': 'Repaints {pn} tiles into the most common number on the board.',
'char.tiktok.name': 'TikTok',
'char.tiktok.pass': 'Stops time for {psec} seconds. You can keep matching while the clock and the villain gauge are stopped.',
'char.kkultteok.name': 'Honeybee',
'char.kkultteok.pass': 'Turns {pn} fruits into golden fruits. A match with a golden fruit scores {mult} times the points.',
'char.bangul.name': 'Bubbly',
'char.bangul.pass': 'Washes away {pn} blocker or ice tiles. Hidden numbers come back all at once.',
'char.ppyak.pass2': 'For 8 seconds, tiles far apart can link too. Ice tiles break in one match while it lasts.',
'char.sseokssak.name': 'Sweepy',
'char.sseokssak.pass': 'Clears {pn} of the remaining tiles at once. It also blocks the next board quake.',
'char.banjjak.name': 'Sparky',
'char.banjjak.pass': 'Fills the Skill gauge by {pn}% at once.',
'say.combo.pudding': 'Hold the line!',
'say.jackpot.pudding': 'What a break!',
'say.mission.pudding': 'Order restored!',
'say.tier.pudding': 'Nothing gets through!',
'say.clear.pudding': 'The way is safe.',
'say.boss.pudding': 'Behind my shield!',
'say.star.pudding': 'A star, well earned!',
'say.combo.sodawitch': 'Fizz it up!',
'say.jackpot.sodawitch': 'It popped!',
'say.mission.sodawitch': 'Bubbling done!',
'say.tier.sodawitch': 'Full fizz!',
'say.clear.sodawitch': 'That was a blast!',
'say.boss.sodawitch': 'Shake and burst!',
'say.star.sodawitch': 'Sparkling star!',
'pick.hero': 'Hero',
'pick.mate': 'Pet',
'cp.tab.char': 'Heroes',
'cp.tab.pet': 'Pets',
'aria.matepick': 'Choose your pet',
'mate.none.name': 'Solo',
'mate.none.pass': 'No pet',
'tw.next.ten': 'Next: Ten!',
'tw.next.twin': 'Next: Twin!',
'tw.banner': 'TENTWIN COMBO!',
'hurry.big': 'HURRY UP!!',
'hurry.princess': 'Help me... :(',
'hurry.prince': 'Just hold on!',
'aria.charpick': 'Choose your character',
'pv.jelly.hit': 'JACKPOT ×{jm}!',
// 콤보 티어 배너의 아랫줄 (윗줄 "8 COMBO!!" 는 숫자라 번역 대상이 아니다)
'combo.tier1': 'ON FIRE!',
'combo.tier2': 'BLAZING!',
'combo.tier3': 'UNREAL!',
'combo.tier4': 'LEGENDARY!',
'lang.short': 'EN',
'menu.bestrush': 'Rush {score}',
'toast.addcd': 'Add ready in {n}s',
'toast.autoadd': 'No moves left. Adding for you!',
'toast.rushnext': 'Board cleared. Next!',
'over.rush.title': "Time's up!",
'over.rush.best': 'Rush best',
'act.addfree': '∞',
'mission.label': 'Mission',
'mission.sum10': 'Clear {goal} pairs that add to 10',
'mission.sum10.one': 'Clear 1 pair that adds to 10',
'mission.same': 'Clear {goal} matching-number pairs',
'mission.same.one': 'Clear 1 matching-number pair',
'mission.rows': 'Clear {goal} rows',
'mission.rows.one': 'Clear 1 row',
'mission.noadd': 'Make {goal} matches without Add',
'mission.noadd.one': 'Make 1 match without Add',
'mission.special': 'Use {goal} special tiles',
'mission.special.one': 'Use 1 special tile',
'mission.fever': 'Trigger fever once',
'mission.bomb': 'Blow up {goal} tiles with a bomb',
'mission.bomb.one': 'Blow up 1 tile with a bomb',
'mission.chain3': 'Reach a Ten Twin chain of 3, {goal} times',
'mission.combo5': 'Reach combo ×5',
'mission.sprint': 'Make {goal} matches in 30s',
'mission.col': 'Clear column {goal} completely',
'mission.prog': '{n}/{goal}',
'finish.mission.sum10': 'Ten ×{goal}',
'finish.mission.chain3': 'Ten Twin chain ×{goal}',
'finish.mission.sprint': '{goal} matches, right now',
'finish.sub': 'FINISH CHANCE',
'mission.done': 'Mission complete!',
'mission.reward': '+{score} & Add +1',
'fever.on': 'FEVER!',
'fever.off': 'FEVER +{score}',
'grade.s': 'S',
'grade.a': 'A',
'grade.b': 'B',
'grade.c': 'C',
'grade.s.msg': 'Flawless run!',
'grade.a.msg': 'Sharp work.',
'grade.b.msg': 'Solid clear.',
'grade.c.msg': 'Cleared. Try it faster.',
'milestone.title': 'Match #{n}!',
'milestone.title.rw': 'Match #{n}! Stars +{v}',
'milestone.sub': 'What a streak. Keep going.',
'over.share': 'Share',
'aria.overShare': 'Share your score with a result card image',
'tut.skip': 'Skip',
'aria.tutSkip': 'Skip the tutorial',
'aria.theme': 'Theme',
'aria.pzTheme': 'Change theme',
'pause.theme.dark': 'Theme: Dark',
'tut.replay': 'Try it',
'tut.s1': 'Two <b>7</b>s, one above the other, in a straight line. Tap them.',
'tut.s2': 'Two <b>2</b>s up there. Try those.',
'tut.s2fail': 'See? Bent lines do not connect. Straight only, and diagonals count. <b>7</b> and <b>3</b> make <b>10</b>.',
'tut.s3': 'End of the row, start of the next. Those two <b>6</b>s still reach each other.',
'tut.s3fail': 'Not that one. Go from the <b>end</b> of a row to the <b>start</b> of the next.',
'tut.done': 'That\'s the basics. Now beat the villain!',
'rules.title': 'Three rules. That is all.',
'rules.r1': 'Same number, or two that make <b>10</b>.',
'rules.r2': 'Joined by a <b>straight path</b> across, down, or diagonally.',
'rules.r3': 'Or the <b>end</b> of a row to the <b>start</b> of the next.',
'rules.note': 'Either way, nothing may be left standing in between.',
'skills.title': 'Three buttons in battle',
'skills.s1': '<b>Attack</b> fills on your hero\'s name plate and fires on its own when full.',
'skills.s2': '<b>Awakening</b> fills only when you <b>alternate</b> sum-10 and same-number matches. Tap it to score <b>×{am}</b> for {awk}s.',
'skills.s3': "<b>Skill</b> fills with every match, faster at higher combos. Tap it to fire your hero's own skill.",
'skills.s4': '<b>Pet</b> uses your chosen pet\'s skill. Each round starts with {pu} uses, plus one per pet fruit you pop (up to {pmax}).',
'skills.note': '<b>Skill fruit</b> and <b>awakening fruit</b> fill their gauges at once. Pop a <b>gear fruit</b> to get that gear.',
'menu.dailydone': "Today's daily: cleared",
'menu.dailytodo': "Today's daily is waiting",
'hud.daily': 'Daily',
'hud.moves': 'Moves',
'act.shuffle': 'Shuffle',
'aria.shuffle': 'Shuffle the board',
'toast.shuffled': 'Shuffled!',
'toast.shufflestuck': 'Stuck! Shuffling for you.',
'toast.shufflelocked': 'There are still matches. Find them!',
'toast.shufflefail': 'No moves left, even after a re-deal.',
'toast.noshuffle': 'No shuffles left.',
'toast.blocked': 'Right numbers, but the path is blocked.',
'toast.blockedBy': '{n} is in the way.',
'toast.notLine': 'That is not a straight path.',
'toast.alignRemind': 'A straight path, or the end of a row to the start of the next.',
'combo.5': 'UNSTOPPABLE!',
'streak.reward': '{d}-day streak reward!',
'toast.rushopen': 'Time Rush unlocked!',
'clear.nextpreview': 'Next: {cells} tiles · {what}',
'clear.nextpreviewplain': 'Next: {cells} tiles',
'prev.wild': 'wildcards appear',
'prev.ice': 'ice appears',
'prev.bomb': 'bombs appear',
'prev.row': 'one more row',
'prev.adds': 'Add drops to {n}',
'prev.denser': 'pairs get scarcer',
'share.beat': 'Beat my score!',
'rank.title': 'Records',
'rank.tab.endless': 'Endless',
'rank.tab.rush': 'Time Rush',
'rank.tab.daily': 'Daily',
'rank.hint.endless': 'Your 5 best Endless runs, by final score.',
'rank.hint.rush': 'Your 5 best Time Rush runs, by final score.',
'rank.hint.daily': 'Your 5 fastest Daily clears. Every Daily is the same size, so time is the fair measure.',
'rank.tab.classic': 'Classic',
'rank.tab.classicrush': 'Classic Rush',
'rank.tab.classicdaily': 'Classic Daily',
'rank.hint.classic': 'Your 5 best Classic runs, with no skills or items.',
'rank.hint.classic-rush': 'Your 5 best Classic Time Rush runs, on skill alone.',
'rank.hint.classic-daily': "Your 5 fastest Classic Daily clears, all on even ground.",
'rank.empty': 'No record yet',
'rank.dateunknown': 'earlier',
'rank.close': 'Close',
'rank.open': 'Records',
'rank.row.endless': '{score}',
'rank.row.rush': '{score}',
'rank.row.daily': '{time}',
'rank.meta.endless': 'Stage {stage} · {date}',
'rank.meta.rush': '{matches} matches · {date}',
'rank.meta.daily': '#{n} · {combo}× · {date}',
'rank.new': '🏆 New #{n} record!',
'rank.new1': '🏆 New best ever!',
'rank.overline': 'New personal record: #{n}',
'aria.rank': 'Records',
'aria.rankClose': 'Close records',
'aria.rankTab': 'Pick which records to show',
'menu.adv': 'Adventure',
'menu.advsub': 'Rescue the Jelly Princess',
'mode.title': 'Play',
'map.plate1': 'Chapter 1: Sweet Map',
'map.plate2': 'Chapter 2: Pudding Range',
'map.plate3': 'Chapter 3: Candy Cane Desert',
'map.plate4': 'Chapter 4: Mint Hills',
'map.plate5': 'Chapter 5: Cocoa Gate',
'map.plate6': 'Chapter 6: Cream Corridor',
'map.plate7': 'Chapter 7: Syrup Maze',
'map.plate8': 'Chapter 8: Sugar Prison',
'map.plate9': 'Chapter 9: The Heart Room',
'map.plate10': 'Chapter 10: The Throne',
'map.chip1': 'Ch. 1 · Sweet Map',
'map.chip2': 'Ch. 2 · Pudding Range',
'map.chip3': 'Ch. 3 · Candy Cane Desert',
'map.chip4': 'Ch. 4 · Mint Hills',
'map.chip5': 'Ch. 5 · Cocoa Gate',
'map.chip6': 'Ch. 6 · Cream Corridor',
'map.chip7': 'Ch. 7 · Syrup Maze',
'map.chip8': 'Ch. 8 · Sugar Prison',
'map.chip9': 'Ch. 9 · The Heart Room',
'map.chip10': 'Ch. 10 · The Throne',
'minimap.title': 'Chapters',
'minimap.locked': 'Clear stage {n} to unlock',
'minimap.sum': '{s} stars · {c}/10 chapters open',
'aria.minimap': 'See all chapters',
'aria.mmcell': 'Chapter {c}, {s} stars, {d} stages cleared',
'aria.mmlock': 'Chapter {c}, locked',
'theater.title': 'Story Theater',
'theater.locked': 'Reach Chapter {n} to unlock',
'aria.thcell': 'Chapter {c} story replay',
'mode.rush.d': '90s. Each match adds time.',
'classic.title': 'Classic',
'classic.lead': 'No skills, no items, no passives. Clear the board for the next one. Stuck ends the run, Rush ends at 90s, Daily is one board a day.',
'classic.arcade': 'Endless',
'classic.arcade.d': 'No timer, pure play.',
'classic.rush': 'Time Rush',
'classic.rush.d': '90s, skill only.',
'classic.daily': 'Daily',
'classic.daily.d': "Today's board, even.",
'classic.skills': 'Use skills & pets',
'classic.lead.on': 'Skills, items, pets and passives are on. Same three modes, records kept apart from pure Classic.',
'arc.hub': 'Duel',
'arc.hub.d': 'Three ways to fight a villain.',
'arc.title': 'Duel',
'arc.lead': 'Fight a villain on the rush clock. Screenshot the result and compare.',
'arc.time.name': 'Time Attack',
'arc.time.d': 'Beat the villain fastest.',
'arc.surv.name': 'Survival',
'arc.surv.d': 'Last longest vs. the villain.',
'arc.dmg.name': '90s Damage',
'arc.dmg.d': 'Most damage in 90s.',
'arc.dir.low': 'Shorter wins',
'arc.dir.high': 'Longer wins',
'arc.dir.more': 'Higher wins',
'arc.clear': 'Villain defeated!',
'arc.ko': 'You were knocked out',
'arc.timeup': "Time's up",
'arc.norecord': 'no record',
'arc.foe': 'Villain {name}',
'arc.kos': 'Defeated {n}',
'arc.best': 'Best {v}',
'arc.nobest': 'First record!',
'arc.new': 'NEW RECORD!',
'arc.again': 'Retry',
'arc.menu': 'Main menu',
'arc.share': 'Share',
'aria.arcShare': 'Share your arcade record with a result card image',
'rank.arc.title': 'Arcade Duel',
'aria.cont': 'Classic: pure skill modes',
'aria.chprev': 'Previous chapter',
'aria.chnext': 'Next chapter',
'aria.cutskip': 'Skip the story',
'aria.cutskipall': 'Skip the whole story',
'pick.rec': 'Best for',
'pet.combo.k': 'Best team',
'pet.syn.ppyak': 'Far tiles link up, so the princes find their pairs.',
'pet.syn.mungchi': 'Time stops for {psec}s, so keep matching for jackpots.',
'pet.syn.mongle': 'Time stops for {psec}s, so keep matching for jackpots.',
'pet.syn.tiktok': 'Time stops for {psec}s, so keep matching for jackpots.',
'pet.syn.churup': 'Reshuffles a row into new pairs, great for Ten Power.',
'pet.syn.mukmul': 'Paints {pn} tiles one number, perfect for Twin Power.',
'pet.syn.kkultteok': '{pn} golden fruits pay more with a high Base Score.',
'pet.syn.banjjak': 'Fills {pn}% of the Skill gauge, great for long skills.',
'pet.syn.bangul': 'Clears {pn} blockers so both princes find their pairs.',
'pet.syn.sseokssak': 'Clears {pn} tiles and refills, so Base Score keeps paying.',
'char.ten.tag': 'Strategist',
'char.twin.tag': 'Speedrunner',
'char.jelly.tag': 'Thrill-seeker',
'story.skip': 'Skip',
'story.skipall': 'Skip all',
'cut.who.ten': 'Tenten',
'cut.who.twin': 'Twin',
'cut.who.jelly': 'Jelly Princess',
'cut.who.boss': 'Gobbler',
'cut.who.bros': 'Tenten & Twin',
'cut.who.mates': 'Ppyak & Mungchi',
'cut.who.ppyak': 'Ppyak',
'cut.who.mungchi': 'Mungchi',
'cut.o1': 'Another wobbly, peaceful day in Jelly Pang.',
'cut.o2': 'When the fruit ripened, everyone shared.',
'cut.o3': 'But that night felt\u2026 wrong.',
'cut.o4': 'Munch\u2026 munch\u2026 I am hungryyy.',
'cut.o5': 'All of it\u2014 MINE!',
'cut.o6': 'You can\u2019t have our jellies!',
'cut.o7': 'Hey! Let\u2014 go of me!',
'cut.o8': 'Dessert\u2026 will be the princess.',
'cut.o9': 'The news reached the Tentwin Kingdom.',
'cut.o10': 'Let\u2019s go, Twin. \u2014 Already got my shoes on!',
'cut.o11': 'Peep! Me too! \u2014 Mung\u2026 together\u2026',
'cut.o11b': 'Mung\u2026 I made it\u2026',
'cut.o12': 'The rescue starts NOW!',
'cut.t1': 'There\u2019s only one road.',
'cut.t2': 'Sum to ten, and the path opens.',
'cut.t3': 'We\u2019ll make it in time.',
'cut.w1': 'A map? Who needs one!',
'cut.w2': 'Same numbers! That\u2019s all I need!',
'cut.w3': 'Bro! Last one there\u2019s a jelly!',
'cut.p1': 'The princess waited for her princes. Again.',
'cut.p2': '\u2026It\u2019s been three days.',
'cut.p3': 'I am NOT waiting for those princes!',
'cut.p3b': 'No! If the princes see me like THIS\u2026',
'cut.p3c': 'My wedding is RUINED!',
'cut.p4': 'I\u2019ll make my own way out!',
'aria.mapback': 'Back to the menu',
'adv.stagen': 'Stage {n}',
'adv.stagebadge': 'S{n}',
'adv.bossn': 'Boss {n}',
'adv.locked': 'Clear the stage before it first.',
'adv.nodearia': 'Stage {n}, {s} stars',
'adv.goal.score': 'Score {n} points',
'adv.goal.digit': 'Clear {n} tiles showing {d}',
'adv.goal.time': 'Clear {n} tiles within {s}s',
'adv.hud.score': '{n} / {goal}',
'adv.hud.digit': '{d}: {n} / {goal}',
'adv.hud.time': 'Cleared {n} / {goal}',
'adv.goalhit': 'Goal reached! Now go for stars!',
'adv.hand.blk': 'Blockers ×{n}',
'adv.hand.lock': 'Locked tiles ×{n}',
'adv.hand.noshuffle': 'No shuffle',
'adv.hand.timecut': 'Short clock',
'adv.star1': '★ Clear the stage',
'adv.star2': '★★ Score {n}',
'adv.star3': '★★★ Score {n} + no shuffles + {t} sum-10 matches',
'node.foehp': 'Villain HP',
'node.cond': 'Weak point',
'node.best': 'Your best',
'node.rec': 'Why this hero',
'node.recpet': 'Why this pet',
'node.clear': 'Knock it down in {sec}s',
'node.clear.boss': 'Knock it down, then {mis} within {fsec}s',
'node.clear.timeout': 'When time runs out, the higher remaining HP share wins. A tie goes to you.',
'node.info.aria': 'How the clock works',
'node.atk.info.aria': 'Show skill details',
'node.drops': 'Gear from this stage',
'node.drops.all': 'All {k} ›',
'node.recmark': 'Pick',
'node.swap.aria': 'Change hero or pet',
'node.stars.got': 'You have {s} stars on this stage.',
'node.foe.label': 'Opponent',
'node.hp.label': 'HP',
'node.lv': 'Lv{lv}',
'rec.why.ten': 'Ten Power is high, so the sum-10 pairs common on this stage score big.',
'rec.why.twin': 'Twin Power is high, so the same-number pairs common on this stage score big.',
'rec.why.jelly': 'Jackpot is high, so any match can score {jm}×. Strong when the clock is the goal.',
'rec.why.pudding': 'Base Score is high, so every match pays and long boards stay on track.',
'rec.why.sodawitch': 'Soda Spell makes every match score {x}× for {sec}s and cuts boss HP fast.',
'rec.why.atk.blk': "This boss keeps dropping blockers. Bubbly's Bubble Wave washes away 2 of them at a time.",
'rec.why.atk.freeze': 'This boss freezes a column. While TikTok holds time, the freeze does not work.',
'rec.why.atk.mask': "This boss hides numbers. Bubbly's Bubble Wave brings every hidden number back at once.",
'rec.why.atk.quake': "This boss shakes the board. Churup's Big Bite blocks the next quake.",
'rec.why.atk.cycle': 'This boss rotates four attacks. When TikTok stops time, you get a window whatever comes next.',
'adv.go': 'Start',
'adv.missionwin': 'Mission clear! Every match ×{mult} from now on',
'adv.missionfail': 'Mission time is up. The stage goes on.',
'adv.crumble': 'The blockers crumbled!',
'adv.win': 'Stage {n} clear!',
'adv.bosswin': 'Boss {n} down!',
'adv.lose': 'Stage {n} failed',
'adv.result.scripted': 'Round One: Retreat',
'adv.result.scripted.sub': 'You didn\'t lose. The story just began. Chapter 6 is open.',
'adv.result.finish': 'The finish slipped away',
'story.s50.taunt': '"Not yet! Without the Heart you can\'t win. Fall back, and gather your strength."',
'howto.ten': 'Same numbers make a <b>Twin</b>; adding to 10 makes a <b>Ten</b>. Every Ten loosens the hardened world.',
'howto.ult': 'The Awakening gauge fills when you <b>alternate</b> Ten and Twin matches, one after the other. When it is full, tap it for ×{am} points for {awk}s.',
'howto.awaken': "The Skill gauge fills faster with bigger combos. When it is full, tap it to use your hero's skill for {sec}s.",
'howto.overdrive': 'Chain your attacks and hit <b>OVERDRIVE</b>! It lasts as long as you do. Keep matching, keep firing.',
'howto.finish': 'When the boss falls: <b>10-second Finish</b>. Clear the final mission on screen. That\'s the real win.',
'tip.awakenReady': 'Skill ready! Tap it.',
'tip.ultReady': 'Awakening ready! Tap it for ×{am} points for {awk}s.',
'item.guard.block': 'Blocked!',
'fx.overdrive': 'OVERDRIVE!!',
'adv.note3': 'Three stars. Nothing left to take here.',
'adv.note.next': 'Score {n} for the second star.',
'adv.note.miss2': 'For the second star, you need {m}.',
'adv.note.miss3': 'For the third star, you need {m}.',
'adv.miss.score': '{n} points',
'adv.miss.ease': 'time or adds to spare',
'adv.miss.shuffle': 'no shuffles',
'adv.miss.ten': '{t} more sum-10 matches',
'adv.reason.timeout': 'Out of time.',
'adv.reason.stuck': 'No moves left.',
'adv.reason.ko': 'You were knocked out.',
'adv.reason.finish': 'The 10-second finish ran out.',
'duel.tell': 'The villain is winding up!',
'duel.hit': 'Hit! -{n} HP',
'duel.skill': 'Blockers dropped ×{n}!',
'duel.skfreeze': 'A whole column froze! ({n} tiles)',
'duel.skmask': 'Numbers blacked out! ({n} tiles)',
'duel.skquake': 'The board lurched! ({n} rows shifted)',
'duel.skvoid': "The villain's move fizzled!",
'duel.skvoidw': 'BLOCKED!',
'act.attack': 'Attack',
'act.special': 'Awaken',
'act.awk.left': '{n}s',
'act.pet': 'Pet',
'act.awaken': 'Skill',
'aria.special': 'Awaken. Every point you earn is ×{am} for {awk}s.',
'aria.pet': 'Use your pet skill',
'aria.awaken': 'Skill',
'duel.spstat': 'Awakening {n}%. Alternate sum-10 and same-number matches to fill it.',
'duel.spgo': 'Awakened! Every point you earn is ×{am} for {awk}s',
'duel.awkon': 'Awakening is on. {n}s left.',
'duel.petnone': 'No pet yet. Pick one and you can use their skill a few times each round.',
'duel.petout': 'No pet skill uses left this round. Pop a pet fruit on the board to get one more.',
'duel.petempty': 'Nothing left to peck.',
'duel.petpeck': 'Peck! {n} tiles cleared',
'mk.pet': '+1 PET!',
'mk.star': 'SKILL MAX!',
'mk.awk': 'AWAKEN MAX!',
'mk.gear': 'Got {tier} {name}!',
'mk.gearmax': '{name} is maxed! +{c} coins',
'mk.gearmax0': '{name} is maxed!',
'drops.tier.common': 'Common',
'drops.tier.rare': 'Rare',
'drops.tier.epic': 'Epic',
'drops.title': 'Stage {n} Drops',
'drops.gear.h': 'Gear Fruit',
'drops.gear.sub': 'About {r} in every 100 new fruits is a gear fruit.',
'drops.gear.avg': 'That is {a} per round on average.',
'drops.tier': 'Common {c}% · Rare {r}% · Epic {e}%',
'drops.chance': '{p}%',
'drops.lv': 'Lv {lv}/{max}',
'drops.note': 'Chances are per gear fruit. Per-round averages come from test runs.',
'drops.boss.h': 'Boss Reward',
'drops.boss.sub': 'Defeat the boss for one guaranteed gear. Rare {r}% · Epic {e}%',
'drops.use.h': 'Instant Fruits',
'drops.use.pet': 'Pet Fruit',
'drops.use.pet.d': 'You get one more Pet use.',
'drops.use.star': 'Skill Fruit',
'drops.use.star.d': 'Your Skill gauge fills up at once.',
'drops.use.awk': 'Awakening Fruit',
'drops.use.awk.d': 'Your Awakening gauge fills up at once.',
'drops.use.p': '{x} in 100',
'drops.gift.h': 'Gift Box',
'drops.gift.sub': 'On this stage a gift box shows up {p}% of the time. It holds gear {i}% of the time, or a pet or epic gear {x}%.',
'drops.gift.d': 'It holds gear {i}% of the time, or a pet or epic gear {x}%.',   /* [Task 8a 수정 1회차 A3c] 선물 줄 설명 = drops.gift.sub 둘째 문장 그대로 */
'drops.gift.p': '{p}% per round',                                            /* 선물 줄 알약 = 얼마나 자주 */
'drops.gear.cap': '{r} in 100 fruits · {a} per round',
'drops.note2': 'Chances are per gear fruit',
'tile.lv': 'Lv {lv}',   /* 장비 칸(itemTile) 레벨 알약 */
'duel.petshield': 'Squishy Shield! Clock and villain gauge frozen for {n}s',
'skill.sub.sp': 'AWAKENING',
'skill.sub.pet': 'PET',
'skill.sub.foe': 'VILLAIN',
'skill.sp.name': 'SCORE ×{am}!',
'skill.ppyak.name': "PPYAK'S FREE LINK!",
'skill.mungchi.name': "MUNGCHI'S SQUISHY SHIELD!",
'skill.foe.name': 'BLOCKER RAIN!',
'duel.tellwarn': 'INCOMING!',
'duel.timestop': 'TIME STOP',
'skill.mongle.name': "MONGLE'S TIME PUDDLE!",
'skill.churup.name': "CHURUP'S BIG BITE!",
'duel.petmongle': 'Time Puddle! Clock and villain gauge frozen for {n}s',
'duel.petchurup': 'Big Bite! {n} row reshuffled',
'skill.tiktok.name': "TIKTOK'S TIME STOP!",
'skill.mukmul.name': "INKY'S INK SPLASH!",
'skill.kkultteok.name': "HONEYBEE'S GOLDEN CALL!",
'skill.bangul.name': "BUBBLY'S BUBBLE WAVE!",
'skill.sseokssak.name': "SWEEPY'S CLEAN SWEEP!",
'skill.banjjak.name': "SPARKY'S SPARK CHARGE!",
'duel.pettiktok': 'Time Stop! The clock is held for {n}s. Keep popping!',
'duel.petppyak': 'Free Link! Far tiles connect for {n}s',
'duel.petmukmul': 'Ink Splash! {n} tiles repainted to {v}',
'duel.petkkultteok': 'Golden Call! {n} golden fruits summoned',
'duel.petbangul': 'Bubble Wave! {n} blockers washed away',
'duel.petclean0': 'Nothing to clean up.',
'duel.petsseokssak': 'Clean Sweep! {n} tiles cleared',
'duel.petbanjjak': 'Spark Charge! Skill gauge +{n}%',
'pet.lock.ppyak': 'Ppyak is with you from the very first round.',
'pet.lock.mungchi': 'Mungchi is with you from the very first round.',
'pet.lock.mongle': 'Match 10 times in a row with no delay and Mongle joins you.',
'pet.lock.churup': 'Churup turns up in the rare slot of an Adventure gift box.',
'pet.lock.mukmul': 'Beat the stage-20 boss and Inky joins you.',
'pet.lock.tiktok': 'Chain 3 skills in a row and TikTok joins you.',
'pet.lock.kkultteok': 'Collect 30 gear fruits and Honeybee joins you.',
'pet.lock.bangul': 'Beat the stage-40 boss and Bubbly joins you.',
'pet.lock.sseokssak': 'Make 500 sum-10 matches in total and Sweepy joins you.',
'pet.lock.banjjak': 'Beat the stage-30 boss and Sparky joins you.',
'pet.timestop.hold': "I've got time held. Go!",
'pet.timestop.go': 'Pop those fruits, quick!!',
'pet.freelink.go': 'Ppyak will clear the way!',
'adv.heartkept': 'Cleared, so no heart was spent.',
'adv.heartplus': 'Boss bonus: +1 heart!',
'adv.heartlost': '-1 heart. {n} left.',
'adv.next': 'Next stage',
'adv.retry': 'Try again',
'adv.map': 'Map',
'adv.leave': 'Map (-1 heart)',
'adv.abandon': 'Left the stage. -1 heart.',
'adv.heartin': 'Next in {t}',
'adv.heartfull': 'MAX',   /* 2026-08-19 한/영 공통 표기로 통일 */
'adv.heartwait': 'Out of hearts. Next one in {t}.',
'adv.ad': 'Get a heart (coming soon)',
'adv.hearts': 'Hearts',
'aria.skill': 'Use your skill',
'skill.ready': 'GO!',
'skill.notyet': 'Skill is at {n}%. Every match charges it, and a higher combo charges it faster.',
'skill.sub': 'SKILL',
'skill.shout': '{name}!',
'skill.ten.name': "Prince's Blessing",
'skill.twin.name': 'Twin Oath',
'skill.jelly.name': 'Jelly Time',
'skill.on.ten': "Prince's Blessing makes every match a Ten Twin combo for {sec}s",
'skill.on.twin': 'Twin Oath makes every match a Ten Twin combo for {sec}s',
'skill.on.jelly': 'Jelly Time raises your jackpot chance by {jp}% for {sec}s',
'skill.on.pudding': 'Pudding Shield makes every match a Ten Twin combo for {sec}s',
'skill.on.sodawitch': 'Soda Spell makes every match score {x}× for {sec}s',
'fx.awaken': 'SKILL!!',
'fx.awaken.chain': '{n}-CHAIN BLAST!',
'fx.finish': 'FINISH!!',
'fx.finish.sub': 'PERFECT FINISH!',
'skill.gauge': 'Skill',
'boss.grape.name': 'Grape Gobbler',
'boss.soda.name': 'Soda Gobbler',
'boss.berry.name': 'Berry Gobbler',
'boss.mint.name': 'Mint Gobbler',
'boss.cocoa.name': 'King Cocoa',
'boss.cocoa.intro': '"I swallowed the Heart. Your \'Ten\' is only half a thing now."',
'boss.cocoa.rematch': '"You again. \u2026That look. You\'ve got the Heart back."',
'boss.atk.blk': 'Blocker Drop',
'boss.atk.freeze': 'Column Freeze',
'boss.atk.mask': 'Number Blackout',
'boss.atk.quake': 'Board Quake',
'boss.atk.cycle': 'All Four, Rotating',
'boss.atk.blk.d': 'Drops {n} blocker tiles onto the board.',
'boss.atk.freeze.d': 'Freezes one column. Frozen tiles take two matches to clear.',
'boss.atk.mask.d': 'Hides the numbers on {n} tiles for {sec}s.',
'boss.atk.quake.d': 'Shakes {n} rows and moves the fruit around.',
'boss.atk.cycle.d': 'Uses all four skills in turn, switching every {sec}s.',
'boss.cond.sum10': 'Land {n} sum-10 matches',
'boss.cond.chain3': 'Reach a Ten Twin chain of 3, {n} times',
'boss.cond.sprint': 'Land {n} back-to-back matches',
'boss.cond.mission2': 'Clear {n} missions in a row',
'boss.goal': 'Take down {b}',
'boss.prog': '{c} · {n}/{goal}',
'boss.armed': 'Opening found! SKILL INCOMING!',
'boss.weak': 'OPENING!',
'boss.tell': '{b} is winding up…',
'boss.atk': 'Blockers dropped! (×{n})',
'boss.down': 'DOWN!',
'boss.label': 'Boss',
'boss.hp': 'HP',
'char.locked.aria': 'Locked character',
'char.locked.hint': 'Still locked. Beat the stage-10 boss to set her free.',
'unlock.title': 'Jelly Princess is free!',
'unlock.line': 'Thank you! I am coming with you!',
'unlock.sub': 'Jelly Princess joins your party. Pick her in the menu.',
'unlock.go': 'Welcome aboard!',
'pick.title': 'Heroes',
'pick.go': 'Confirm',
'pick.locked': 'Locked',
'pick.passive': 'Passive',
'pick.ult': 'Skill',
'menu.sub': 'Jelly Pang World',
'pick.head': 'Heroes',
'stat.k1': 'Ten Power',
'stat.k2': 'Base Score',
'stat.k3': 'Twin Power',
'stat.k4': 'Jackpot',
'stat.tip.t': '{k} {v}',
'stat.d1':  'Sum-10 matches score {n}% more.',
'stat.d2':  'Every match scores {n}% more.',
'stat.d3':  'Same-number matches score {n}% more.',
'stat.d4':  'Each match has a {n}% chance to score {jm}×.',
'aria.statinfo': 'What this stat does',
'menu.settings': 'Settings',
'settings.title': 'Settings',
'settings.sound': 'Sound',
'settings.vibe': 'Vibration',
'settings.theme': 'Theme',
'settings.lang': 'Language',
'quest.title': 'Missions',
'quest.tab.daily': 'Daily',
'quest.tab.weekly': 'Weekly',
'quest.tab.epic': 'Epic',
'quest.claim': 'Claim',
'quest.claimed': 'Done',
'quest.claimall': 'Claim all',
'quest.none': 'Nothing to claim yet.',
'quest.ready': 'Ready to claim: {n}',
'quest.got': 'Stars +{v}',
'quest.bonus': 'All daily missions cleared! Heart +{n}',
'quest.att.d': 'Day {n}',
'aria.questTab': 'Pick which missions to show',
'menu.quest': 'Missions {n}/{g}',
'dq.m10': 'Make a Ten {n} times',
'dq.m10.one': 'Make a Ten once',
'dq.combo': 'Reach combo ×{n}',
'dq.pet': 'Call your pet {n} times',
'dq.pet.one': 'Call your pet once',
'dq.awaken': 'Use skills {n} times',
'dq.awaken.one': 'Use a skill once',
'dq.clear': 'Clear {n} stages',
'dq.clear.one': 'Clear 1 stage',
'dq.daily': "Finish today's Daily",
'dq.duel': 'Win a duel',
'dq.star2': 'Earn 2 stars or more',
'dq.rush': 'Score {n} in Time Rush',
'dq.item': 'Equip an item',
'dq.match': 'Match {n} pairs',
'dq.chain': 'Chain {n} in a row',
'wq.wclear': 'Clear {n} stages this week',
'wq.wstar': 'Earn {n} new stars this week',
'wq.wmis': 'Finish {n} daily missions',
'wq.wmatch': 'Match {n} pairs this week',
'ach.first': 'First pair',
'ach.match100': 'Matched {n}',
'ach.match1000': 'Matched {n}',
'ach.match5000': 'Matched {n}',
'ach.combo5': 'Combo ×{n}',
'ach.combo10': 'Combo ×{n}',
'ach.combo20': 'Combo ×{n}',
'ach.pet1': 'First pet',
'ach.pet3': 'Three pets',
'ach.petall': 'Every pet',
'ach.chap1': 'Chapter {n} cleared',
'ach.chap3': 'Chapter {n} cleared',
'ach.star30': 'Stars {n}',
'ach.star60': 'Stars {n}',
'ach.streak3': '{n}-day streak',
'ach.streak7': '{n}-day streak',
'ach.streak14': '{n}-day streak',
'ach.duel1': 'First win',
'ach.duel10': '{n} duel wins',
'ach.awaken50': 'Use skills {n} times',
'ach.awaken50.one': 'Use a skill once',
'settings.rank': 'Records',
'settings.close': 'Close',
'settings.on': 'On',
'settings.off': 'Off',
'settings.theme.dark': 'Dark',
'settings.theme.light': 'Light',
'settings.lang.v': 'English',
'aria.settings': 'Open settings',
'aria.charrack': 'Character thumbnails',
'aria.skins': 'Open skins',
'skin.btn': 'Skins',
'skin.title': 'Skins',
'skin.balance': 'Stars',
'skin.equip': 'Equip',
'skin.equipped': 'Wearing',
'skin.inshop': 'In the Shop',   /* rc1009 — 없는 유료 스킨 줄의 닫힌 알약(얻는 곳 = 상점 꾸미기 캡슐) */
'skin.soon': 'Coming soon',
'skin.soonhint': 'A hat for the bichon prince',
'skin.confirm': 'Spend {n} Stars on {name}?',
'skin.bought': '{name} unlocked!',
'skin.poor': 'Not enough Stars ({n} more)',
'aria.shop': 'Open shop',
'shop.btn': 'Shop',
'shop.title': 'Shop',
'shop.tab.jewel': 'Jewels',
'shop.tab.bundle': 'Bundles',
'shop.krw': 'KRW {n}',
'shop.price.jewel': '\uD83D\uDC8E {n}',
'shop.daily': 'Daily free',
'shop.daily.d': '{n} jewels + 1 heart, once a day',
'shop.daily.wait': 'Come back tomorrow',
'shop.daily.get': 'Claim',
'shop.daily.done': 'Claimed',
'shop.daily.got': 'Jewels +{n} and a heart!',
'shop.first2x': 'Double, first time only',
'shop.pack.s': 'Handful of jewels',
'shop.pack.m': 'Pouch of jewels',
'shop.pack.l': 'Box of jewels',
'shop.pack.xl': 'Chest of jewels',
'shop.pack.d': '{n} jewels',
'shop.start': 'Starter pack',
'shop.start.d': '{n} jewels + {h} hearts + {s} stars',
'shop.heart5': 'Refill hearts',
'shop.heart5.d': 'Straight back to {n}',
'shop.heart1': 'One heart',
'shop.heart1.d': 'Skip the 30-minute wait',
'shop.heart.ok': 'Hearts restored!',
'shop.bundle1': 'Adventure bundle',
'shop.bundle1.d': 'Hearts and items in one go',
'shop.bundle2': 'Heart bundle',
'shop.bundle2.d': 'A long evening of play',
'shop.skin.confirm': 'Spend {n} jewels on {name}?',
'shop.poor': 'Not enough jewels ({n} more)',
'shop.poor.continue': 'Not enough jewels to continue',
'shop.continue.paid': 'Jewels -{n}. One more try!',
'confirm.title': 'Confirm',
'confirm.yes': 'Buy',
'confirm.no': 'Cancel',
'invite.title': 'Invite',
'invite.next': 'To the next invite',
'invite.go.n': 'Invite for ★{n}',
'invite.free': 'Invite for free',
'invite.go': 'Invite',
'invite.got': 'NEW CHARACTER!',
'invite.got.pet': 'NEW PET!',   /* [T14 I-9] 몽글 같은 펫 획득에도 이 화면을 쓰는데 머리는 늘 「캐릭터」였다 */
'invite.new': '{n} joined you!',
'intro.next': '▶ Next',
'intro.done': '▶ Close',
'intro.ten.l1': "I am Prince Tenten. There is always one more path, you know.",
'intro.ten.l2': 'Ten Power is my strength. Every sum-10 match I make scores big.',
'intro.ten.l3': 'When I use my skill I call my brother, and every match becomes a Ten Twin combo.',
'intro.twin.l1': "Twin here! I can't stand slow. Try to keep up.",
'intro.twin.l2': 'Twin Power is my thing. Same-number matches score big for me!',
'intro.twin.l3': 'Use my skill and I call Tenten over. Everything counts as a Ten Twin combo.',
'intro.jelly.l1': "I'm the Jelly Princess. I waited a long time. My turn to protect you now.",
'intro.jelly.l2': 'Jackpot is my strength. Any match can burst into {jm}× points.',
'intro.jelly.l3': 'My skill is Jelly Time. For {sec}s my jackpot chance goes up by {jp}%.',
'intro.pudding.l1': 'Pudding Knight, at your service. The bigger the rush, the firmer I stand.',
'intro.pudding.l2': 'My Base Score is the highest. Every match, whatever it is, pays steadily.',
'intro.pudding.l3': 'When I use my skill the shield opens, and every match counts as a Ten Twin combo.',
'intro.sodawitch.l1': 'Soda Witch. One big bang. That is my taste.',
'intro.sodawitch.l2': 'Jackpot and Base Score are both high for me. Steady points, and now and then a big bang.',
'intro.sodawitch.l3': 'My skill is Soda Spell. For {sec}s every match scores {x}×.',
'intro.ppyak.l1': "Ppyak! I've been here with you from the very first round.",
'intro.ppyak.l2': 'My skill is Free Link. For {psec} seconds even far tiles connect.',
'intro.mungchi.l1': 'Mungchi. Nobody is sturdier than me.',
'intro.mungchi.l2': 'My skill is Squishy Shield. The clock and the villain gauge stop for {psec} seconds.',
'intro.mongle.l1': 'Mongle here. Call me when time gets tight.',
'intro.mongle.l2': 'My skill is Time Puddle. The clock and the villain gauge stop for {psec} seconds.',
'intro.tiktok.l1': 'Tick-tock! I am the one who counts the seconds.',
'intro.tiktok.l2': 'My skill is Time Stop. Time freezes for {psec} seconds, and you can still match.',
'intro.churup.l1': 'Churup! One bite, one row. Leave it to me.',
'intro.churup.l2': 'My skill is Big Bite. A whole row gets reshuffled.',
'intro.kkultteok.l1': 'Honeybee here. Anything sweet belongs to me.',
'intro.kkultteok.l2': 'My skill is Golden Call. I summon {pn} golden fruits.',
'intro.sseokssak.l1': 'Sweepy! A messy board is exactly my job.',
'intro.sseokssak.l2': 'My skill is Clean Sweep. {pn} of the remaining tiles clear at once.',
'intro.mukmul.l1': 'Inky. Quietly, and for certain.',
'intro.mukmul.l2': 'My skill is Ink Splash. {pn} tiles turn into the same number.',
'intro.banjjak.l1': 'Sparky! Leave anything that glitters to me.',
'intro.banjjak.l2': 'My skill is Spark Charge. Your Skill gauge fills by {pn}%.',
'intro.bangul.l1': 'Bubbly here. Stuck spots get loosened with bubbles.',
'intro.bangul.l2': 'My skill is Bubble Wave. {pn} blocker tiles get washed away.',
'skin.gem': '+1 Star!',
'skin.base': 'Default',
'skin.basedesc': 'The look you started with',
'skin.royal': 'Royal Gown',
'skin.royaldesc': 'Ballroom dress and sparkling eyes',
'skin.bearcoral': 'Coral Bear',
'skin.bearcoraldesc': 'Warm coral fur',
'skin.bearrose': 'Rose Bear',
'skin.bearrosedesc': 'Soft rose fur',
'skin.bearlavender': 'Lavender Bear',
'skin.bearlavenderdesc': 'Violet lavender fur',
'skin.bearmint': 'Mint Bear',
'skin.bearmintdesc': 'Cool mint fur',
'skin.bearblue': 'Sky Bear',
'skin.bearbluedesc': 'Clear sky-blue fur',
'aria.charopen': 'Heroes: choose a character',
'aria.prevchar': 'Previous character',
'aria.prevpet': 'Previous pet',
'aria.nextpet': 'Next pet',
'aria.nextchar': 'Next character',
'aria.close': 'Close',
'char.ten.title': 'First Prince of Tentwin',
'char.ten.ult': 'For {sec}s, every match extends your Ten Twin combo and gets both the Ten Power and Twin Power bonus.',
'char.ten.tip': 'Pick him when sum-10 pairs are everywhere.',
'char.twin.title': 'Second Prince of Tentwin',
'char.twin.ult': 'For {sec}s, every match extends your Ten Twin combo and gets both the Ten Power and Twin Power bonus.',
'char.twin.tip': 'Pick him when the same numbers pile up.',
'char.jelly.title': 'Princess of the Jelly Pang World',
'char.jelly.ult': 'For {sec}s, your jackpot chance gets +{jp}%, so {jm}× matches hit far more often.',
'char.jelly.tip': 'Pick her to gamble on one huge run.',
'say.combo.ten': 'Keep it going!',
'say.combo.twin': 'More! More!',
'say.combo.jelly': 'Bouncy!',
'say.jackpot.ten': 'What luck!',
'say.jackpot.twin': 'Whoa, huge!',
'say.jackpot.jelly': 'Jelly jackpot!',
'say.mission.ten': 'Mission done!',
'say.mission.twin': 'Nailed it!',
'say.mission.jelly': 'Too easy!',
'say.tier.ten': "We're on fire!",
'say.tier.twin': "Can't stop me!",
'say.tier.jelly': 'Step aside!',
'say.clear.ten': 'One step closer!',
'say.clear.twin': 'See that, bro?',
'say.clear.jelly': 'I did that!',
'say.boss.ten': 'Now! Hit it!',
'say.boss.twin': 'One more hit!',
'say.boss.jelly': 'Take this!',
'say.star.ten': 'A star for us!',
'say.star.twin': 'Got a star!',
'say.star.jelly': 'Sparkle!',
'kd.castle': 'Castle',
'aria.kdmenu': 'Village menu',   /* [116] 메인 v3 왼쪽 메뉴 판(#kd-menu) 이름 */
'kd.playground': 'Playground',   /* [판정판 121] 'Arcade' 로 바꿨다가 되돌림(지휘자 판정 — 놀이터 창 안 줄 pg.arcade 'Arcade' 와 겹침). 아래 줄 이름 칸은 .88 맞춤 */
'kd.shop': 'Shop',
'kd.pethouse': 'Pet House',
'kd.circus': 'Story Theater',
'kd.mission': 'Missions',
'kd.post': 'Post Office',
'pg.title': 'Playground',
'pg.classic': 'Classic',
'pg.classic.d': 'Endless, Time Rush, Daily.',
'pg.arcade': 'Arcade',
'pg.arcade.d': 'Time Attack, Survival, 90s Damage.',
'mode.title.arcade': 'Arcade Duel',
'soon.title': 'Coming Soon',
'soon.body': 'Under construction. Check back after the next update!',
'kd.visit': 'Yesterday-you saved up {n} Stars.',
'kd.visit.first': 'Welcome to Jelly Pang Kingdom!',
'kd.res.aria': 'Say hello',
'portal.login': 'Log in',
'portal.account': 'Account',
'portal.watchad.heart': 'Watch an ad for +1 heart',
'portal.watchad.continue': 'Watch an ad to continue',
'portal.ad.fail': 'No ad available right now. Try again later.',
'aria.continue.ad': 'Watch an ad to continue'
},
ko: {
'menu.tagline': '같은 숫자, 또는 합이 10인 짝을 지우세요.',
'menu.play': '시작하기',
// W7.5 — 옛 값: '이어하기'. 키 이름을 남긴 이유는 en 쪽 주석 참조.
'menu.continue': '클래식',
'menu.daily': '데일리',
'menu.howto': '게임 방법',
'menu.best': '최고 {score}점 · {stage}단계',
'menu.bestclassic': '클래식 {score}점',
'splash.tap': '화면을 터치하세요',
'load.tip1': '합이 10이거나 같은 숫자면 사라져요.',
'load.tip2': '하트는 30분에 하나씩 채워져요.',
'load.tip3': '장비 과일을 터뜨리면 그 장비를 얻어요.',
'load.tip4': '능력치 옆 ⓘ 를 누르면 설명이 나와요.',
'load.tip5': '스킬은 게이지가 가득 찼을 때 터져요.',
'load.tip6': '펫 스킬 한 방이 전투를 뒤집어요.',
'load.tip7': '데일리를 매일 풀면 연속 기록이 쌓여요.',
'load.tip8': '막히면 섞기로 새 짝을 만들어요.',
'aria.logo': 'Ten Twin 젤리 팡 월드',
'aria.play': '무한 모드 시작',
'aria.howto': '게임 방법',
'aria.sound': '소리',
'aria.classicSkills': '스킬·펫 사용 켜고끄기',
'aria.vibe': '진동',
'aria.lang': '언어',
'aria.pause': '일시정지',
'howto.title': '게임 방법',
'howto.p1': '<b>같은 숫자</b> 타일 두 개를 탭하세요.',
'howto.p2': '…또는 <b>합이 10</b>이 되는 두 개를요.',
'howto.p3': '두 타일은 <b>일직선</b>에 있어야 해요. 8방향 어디든 좋아요.',
'howto.p4': '…또는 <b>읽는 순서로 이웃</b>이면 돼요. 줄 끝은 다음 줄 첫 칸과 이어져요.',
'howto.p5': '한 줄을 다 비우면 <b>그 줄이 사라지고</b> 위쪽이 아래로 내려와요.',
'howto.prev': '이전',
'howto.next': '다음',
'howto.close': '확인',
'aria.howtoPrev': '이전 화면',
'aria.howtoNext': '다음 화면',
'aria.howtoClose': '게임 방법 닫기',
'hud.stage': '단계',
'hud.score': '점수',
'hud.best': '최고',
'hud.time': '시간',
'act.add': '추가',
'act.hint': '힌트',
'act.undo': '되돌리기',
'aria.add': '남은 숫자를 보드에 추가',
'aria.hint': '힌트 보기',
'aria.undo': '방금 지운 짝 되돌리기',
'pause.title': '일시정지',
'pause.lang': '언어: 한국어',
'pause.howto': '게임 방법',
'pause.restart': '단계 다시하기',
'pause.menu': '메인 메뉴',
'pause.resume': '계속하기',
'aria.pzSound': '소리 켜고 끄기',
'aria.pzVibe': '진동 켜고 끄기',
'aria.pzLang': '언어 바꾸기',
'aria.pzHowto': '게임 방법',
'aria.pzRestart': '이 단계 다시하기',
'aria.pzMenu': '메인 메뉴로',
'aria.pzResume': '게임 계속하기',
'clear.title': '{stage}단계 클리어!',
'clear.matches': '지운 짝',
'clear.combo': '최고 콤보',
'clear.adds': '남은 추가 × 30',
'harvest.bonus': '수확 보너스 +{n}',
'clear.total': '합계',
'clear.next': '다음 단계',
'aria.next': '다음 단계로',
'rw.starfruit': '스킬 과일',
'rw.petfruit': '펫 과일',
'rw.awkfruit': '각성 과일',
'rw.gem': '별',
'rw.coin': '코인',
'rw.heart': '하트',
'mk.gift': '선물 상자!',
'pet.get': '{n} 합류!',
'cp.items': '아이템',
'char.ten.passname': '왕자의 축복',
'char.twin.passname': '쌍둥이 맹세',
'char.jelly.passname': '젤리 타임',
'char.pudding.passname': '푸딩 방패',
'char.sodawitch.passname': '탄산 주문',
'char.ppyak.passname': '자유 연결',
'char.mungchi.passname': '말랑 방패',
'char.mongle.passname': '시간 웅덩이',
'char.churup.passname': '크게 한 입',
'char.mukmul.passname': '잉크 물들이기',
'char.tiktok.passname': '타임 스톱',
'char.kkultteok.passname': '황금 소환',
'char.bangul.passname': '거품 파도',
'char.sseokssak.passname': '싹쓸이',
'char.banjjak.passname': '번쩍 충전',
'cp.sk.head': '[스킬]',
'cp.sk.skill': '스킬',
'cp.sk.none': '혼자 가요. 이번 판에는 펫 스킬이 없어요.',
'cp.pet.empty': '펫을 고르면 여기에 스킬이 나와요. {free}는 처음부터 함께예요.',
'cp.pet.sep': '·',
'cp.sk.lock': '잠김',
'aria.loadout': '장비',
'pet.axis.link': '연결',
'pet.axis.time': '시간',
'pet.axis.cleanse': '정화',
'pet.axis.layout': '재배치',
'pet.axis.value': '숫자',
'pet.axis.count': '수확',
'pet.axis.sweep': '청소',
'pet.axis.awaken': '스킬',
'item.flint.nm': '반짝 부싯돌',
'item.flint.fl': '작은 불씨도 스킬엔 충분해.',
'item.fizzjelly.nm': '폭죽 젤리',
'item.fizzjelly.fl': '터질 때를 아는 젤리.',
'item.flamescepter.nm': '불꽃 왕홀',
'item.flamescepter.fl': '왕가의 스킬이 깃든 홀.',
'item.softcushion.nm': '말랑 쿠션',
'item.softcushion.fl': '쉬지 않아도 아프지 않게.',
'item.puddingarmor.nm': '푸딩 갑옷',
'item.puddingarmor.fl': '헛손질을 받아내는 몰랑함.',
'item.turtleshield.nm': '거북 등껍질 방패',
'item.turtleshield.fl': '천 번을 쳐도 흔들림 없다.',
'item.windribbon.nm': '바람 리본',
'item.windribbon.fl': '낙하보다 반 박자 빠르게.',
'item.sodaboots.nm': '탄산 부츠',
'item.sodaboots.fl': '톡 쏘는 스텝.',
'item.boltshoes.nm': '번개 운동화',
'item.boltshoes.fl': '터지는 와중에 이미 다음 칸.',
'item.rabbitfoot.nm': '토끼발 부적',
'item.rabbitfoot.fl': '젤리 토끼의 뒷발.',
'item.luckybell.nm': '행운 종',
'item.luckybell.fl': '딸랑이면 확률이 웃는다.',
'item.goldclover.nm': '황금 네잎클로버',
'item.goldclover.fl': '네 잎째는 언제나 잭팟.',
'item.heatshard.nm': '열의 조각',
'item.heatshard.fl': '심장에서 떨어져 나온 파편. 손톱만 한데 손바닥이 뜨거워진다.',
'item.twinmirror.nm': '쌍둥이 거울',
'item.twinmirror.fl': '들여다보면 나와 같은 얼굴이 마주 본다.',
'item.crossnecklace.nm': '교차 목걸이',
'item.crossnecklace.fl': '두 왕자가 어릴 때 나눠 가진 것. 하나로는 아무 힘이 없다.',
'item.chainbracelet.nm': '연쇄 팔찌',
'item.chainbracelet.fl': '사슬이 이어지는 동안에만 소리가 난다.',
'item.firstcharm.nm': '첫수 부적',
'item.firstcharm.fl': '첫 수가 그 판의 모양을 정한다.',
'item.lastcharm.nm': '막판 부적',
'item.lastcharm.fl': '초조할 때 더 잘 되는 사람이 있다. 그런 사람을 위한 물건.',
'item.awakecatalyst.nm': '스킬 촉매',
'item.awakecatalyst.fl': '자기가 빛나지는 않는다. 빛나는 순간을 당길 뿐이다.',
'item.puddingcharm.nm': '푸딩 부적',
'item.puddingcharm.fl': '푸딩 기사가 나눠준 조각. 본인은 필요 없다며 준다.',
'item.soon': '준비 중',
'gear.slot.weapon': '무기',
'gear.slot.aux': '보조',
'gear.slot.trinket': '장신구',
'gear.title.list': '장비 목록',
'gear.title.info': '장비 정보',
'gear.on': '착용 중',
'gear.empty': '비어 있음',
'gear.empty.hint': '아직 이 부위 장비가 없어요. 판을 깨면 나와요.',
'gear.equip': '장착',
'gear.unequip': '해제',
'gear.wornby': '{names}도 장착 중이에요',
'gear.title': '장비',
'gear.done': '완료',
'gear.auto': '자동 장착',
'gear.auto.done': '가장 좋은 장비를 꼈어요',
'gear.auto.same': '이미 가장 좋은 장비예요',
'gear.bag.none': '모험에서 장비 과일을 모아요',
'gear.cmp.k': '지금 낀 장비',
'item.crossnecklace.eff': '전투에서 텐과 트윈을 번갈아 맞추면 각성 게이지가 {n}% 더 차요.',
'item.chainbracelet.eff': '콤보 {c} 이상에서 점수가 {n}% 올라요.',
'item.firstcharm.eff': '판의 첫 매치 점수가 {x}배가 돼요.',
'item.lastcharm.eff': '남은 시간 {s}초 이하에서 점수가 {n}% 올라요.',
'item.puddingcharm.eff': '전투마다 악당의 첫 공격을 한 번 막아요.',
'over.title': '더 이상 지울 수 없어요',
'over.best': '최고',
'over.stage': '단계',
'over.continue': '이어하기 (1회 무료)',
'over.continue.used': '다음 판에 다시',
'over.continue.gem': '이어하기 · 40 💎',
'over.retry': '다시하기',
'over.menu': '메인 메뉴',
'aria.continue': '추가 2회를 받아 이어하기',
'aria.continue.used': '이번 판의 무료 이어하기를 이미 썼어요',
'aria.retry': '다시하기',
'aria.overMenu': '메인 메뉴로',
'daily.title': '데일리 #{n}',
'daily.stats': '✅ {time} · {matches}짝 · 🔥{combo}× · {score}점',
'daily.grade': '{grade}등급',
'daily.share': '공유하기',
'daily.menu': '메인 메뉴',
'aria.share': '결과 카드 이미지와 함께 데일리 결과 공유하기',
'aria.dailyMenu': '메인 메뉴로',
'toast.savefail': '진행이 저장되지 않아요',
'toast.savero': '저장에 문제가 있어 이번에는 진행이 저장되지 않아요.',
'v74.convert': '💎 파편 강화가 없어져서, 모아 둔 파편을 장비 {g}레벨과 별 {s}개로 바꿨어요.',
'v74.convert.gear': '💎 파편 강화가 없어져서, 모아 둔 파편을 장비 {g}레벨로 바꿨어요.',
'v74.convert.star': '💎 파편 강화가 없어져서, 모아 둔 파편을 별 {s}개로 바꿨어요.',
'v74.arcdmg': '각성이 점수 {am}배로 바뀌어서 대전 누적 피해 기록을 새로 시작해요. 예전 기록은 저장해 뒀어요.',
'p3.walletnote': '위 동전 칸은 이제 코인 지갑이에요. 모은 모험 별은 지도 아래 칸에서 볼 수 있어요.',
'shop2.title': '상점',
'shop2.tab.gacha': '뽑기',
'shop2.tab.deals': '특가',
'shop2.tab.free': '무료',
'shop2.tab.deco': '꾸미기',
'shop2.tab.jewel': '보석',
'shop2.sign': '상점',
'gacha.odds.s': '확률',
'gacha.btn1': '한 번',
'gacha.btn10': '{n}회',
'gacha.friend.have': '가진 친구 {have}/{all}',
'gacha.skin.have': '가진 스킨 {have}/{all}',
'aria.shoptabs': '상점 칸 고르기',
'aria.droptabs': '획득표 구분',   /* [판정판 121 · Task 8a] 획득표 알약 탭 줄 */
'time.hm': '{h}시간 {m}분',
'deals.title': '오늘의 특가',
'deals.gift': '매일 선물',
'deals.gift.d': '하루 한 번',
'deals.gear': '오늘의 장비',
'deals.sure': '{name} 확정',
'deals.heart1': '하트 하나',
'deals.trade': '별로 바꾸기',
'deals.heartfull': '하트 가득',
'deals.claim': '무료 받기',
'deals.done': '내일 다시',
'deals.maxed': '최고 레벨',
'deals.got': '{name}을(를) 받았어요.',
'deals.foot': '특가는 모두 확정 상품이에요. 무엇을 받는지 미리 보여요. 매일 자정에 새로 바뀌어요.',
'deals.foot2': '코인을 별로 바꾸기는 하루 {n}번까지예요.',
'coin.got': '코인 +{n}',
'star.got': '별 +{n}',
'gacha.nocoin': '코인이 {n}개 부족해요.',
'gacha.item': '아이템 캡슐',
'gacha.gold': '황금 캡슐',
'gacha.friend': '친구 캡슐',
'gacha.item.d': '모든 장비가 나올 수 있어요!',
'gacha.gold.d': '희귀와 영웅 장비만 나와요!',
'gacha.friend.d': '새 친구만 나와요!',
'gacha.free.first': '처음 한 번 무료',
'gacha.free.daily': '오늘 무료 뽑기',
'gacha.pity': '영웅 천장 {n}/{max}',
'gacha.friend.all': '친구를 모두 모았어요. 새 친구가 오면 다시 열려요.',
'gacha.friend.note': '보스와 조건으로도 친구를 만나요.',
'gacha.nostar': '별이 {n}개 부족해요.',
'gacha.used': '오늘은 이미 썼어요.',
'gacha.skin': '꾸미기 캡슐',
'gacha.skin.d': '아직 없는 스킨만 나와요!',
'gacha.skin.all': '스킨을 모두 모았어요. 새 스킨이 오면 다시 열려요.',
'gacha.skin.none': '지금은 뽑을 스킨이 없어요. 새 친구나 새 스킨이 오면 열려요.',
'gacha.skin.note': '뽑은 스킨은 캐릭터 화면의 스킨에서 입혀요.',
'odds.title': '확률 정보',
'odds.tab.item': '아이템 캡슐',
'odds.tab.gold': '황금 캡슐',
'odds.tab.friend': '친구 캡슐',
'odds.tier': '등급 확률 (한 번 기준)',
'odds.items': '장비별 확률',
'odds.friends': '친구별 확률',
'odds.skins': '스킨별 확률',
'odds.rules': '보장과 중복 규칙',
'odds.tier.row': '{n}종, 각 {each}',
'odds.rule.ten': '{n}회 뽑기에서 앞 칸이 모두 일반이면 마지막 칸은 희귀 이상이에요. 희귀 {r}, 영웅 {e}예요.',
'odds.rule.pity': '영웅 없이 {n}회를 뽑으면 다음 한 번은 영웅이 확정이에요. 지금 {c}/{n}이에요.',
'odds.rule.dup': '같은 장비가 또 나오면 레벨이 하나 올라요. 최고 레벨 {max}이면 코인으로 돌려받아요. 일반 {c}, 희귀 {r}, 영웅 {e}개예요.',
'odds.rule.friend': '아직 없는 친구만 나와요. 등급 무게 일반 {c}, 희귀 {r}, 영웅 {e}를 남은 친구끼리 나눠요.',
'odds.skin.dup': '가진 스킨은 나오지 않아요.',
'odds.foot1': '코인, 별, 광고 보상으로만 뽑아요. 현금으로 팔지 않아요.',
'odds.foot2': '보이는 확률은 실제 추첨에 쓰는 표와 같은 값이에요. 소수점 아래는 반올림했어요. ({date} 기준)',
'gres.title1': '뽑기 결과',
'gres.title10': '{n}회 뽑기 결과',
'gres.ten.up': '희귀 이상 한 개가 확정으로 나왔어요.',
'gres.pity.hit': '천장으로 영웅이 나왔어요!',
'gres.pity.reset': '영웅 천장을 처음부터 다시 세요.',
'gres.lvup': 'Lv{a}→{b}',
'gres.sum': '새 장비 {a} · 레벨업 {b}',
'gres.skin.sum': '새 스킨 {a}',
'gres.refund': '코인 {n} 돌려받음',
'gres.new': 'NEW',
'gres.ok': '확인',
'gres.again10': '{n}회 더',
'gres.again1': '한 번 더',
'gres.openall': '모두 열기',
'free.title': '광고 보고 받기',
'free.reset': '매일 자정에 초기화돼요. 남은 시간',
'free.coin': '코인 +{n}',
'free.item': '아이템 캡슐 한 번',
'free.star': '별 +{n}',
'free.heart': '하트 하나',
'free.friend': '친구 캡슐 한 번',
'free.x2': '결과 화면 코인 두 배',
'free.left.day': '오늘 남은 횟수 {n}/{m}',
'free.left.week': '이번 주 {n}/{m}, 월요일에 초기화돼요',
'free.heart.full': '하트가 가득하면 잠겨요',
'free.friend.none': '새 친구가 없으면 잠겨요',
'free.x2.d': '판이 끝난 결과 화면에서, 오늘 {n}/{m} 사용',
'free.x2.where': '판이 끝나면',
'free.get': '받기',
'free.tomorrow': '내일 다시',
'free.foot1': '광고 한 번에 보상 한 번이에요. 판을 하는 동안에는 광고 버튼이 없어요.',
'free.foot2': '광고 없이도 코인, 특가, 미션으로 같은 것을 얻을 수 있어요.',
'gacha.ad': '광고 보고 뽑기',
'gacha.ad.week': '무료 뽑기, 주 한 번',
'coin.x2': '코인 두 배',
'coin.x2.no': '그냥 받기',
'coin.x2.got': '코인 {n}개를 더 받았어요!',
'gacha.dup.star': '{name}은(는) 이미 함께해서 별 {n}개로 바꿨어요.',
'toast.noadds': '추가 횟수를 다 썼어요',
'toast.empty': '보드가 비었어요',
'toast.nohints': '힌트를 다 썼어요',
'toast.nomoves': '지울 수 있는 짝이 없어요. 추가를 눌러 보세요.',
'toast.noundo': '되돌리기를 다 썼어요',
'toast.usedstage': '이번 단계에선 이미 썼어요',
'toast.copied': '복사했어요!',
'toast.copyfail': '복사하지 못했어요',
'combo.1': '좋아요!',
'combo.2': '멋져요!',
'combo.3': '대박!',
'combo.4': '미쳤다!',
// --- v3 캐릭터 3인 (문구 길이 제약은 en 쪽 주석 참고) ---
'char.ten.name': '텐텐 왕자',
'char.twin.name': '트윈 왕자',
'char.ppyak.name': '삐약',
'char.ppyak.pass': '{psec}초 동안 멀리 떨어진 두 칸도 이어서 맞출 수 있어요. 그동안 얼음 칸은 한 번에 깨져요.',
'char.mungchi.name': '뭉치',
'char.mungchi.pass': '{psec}초 동안 시계와 악당 게이지를 멈춰요. 멈춘 동안에도 매치는 계속할 수 있어요.',
'char.jelly.name': '젤리공주',
'cut.p3d': '안 되겠어, 이 느림보 왕자들이',
'cut.p3e': '구해주길 기다리고만 있다간',
'cut.p3f': '내가 할머니가 되고 말 거야.',
'cut.f0': '…이미 없는데? — 우리 왜 온 거야?',
'cut.f1': '창살이… 정말 와 줬구나!',
'cut.f2': '이제 다 같이 집으로 가자.',
'cut.c1a': '젤리팡 월드의 합(合)이 깨졌어요.',
'cut.c1a2': '똑같은 것들만 남으면, 세계는 천천히 굳어요.',
'cut.c1b': '먹깨비가 「열의 심장」을 삼켰고,',
'cut.c1b2': '공주님은 그걸 찾으러 갔다가\u2026 성에 갇혔어요.',
'cut.c1c': '"가자. 텐을 만들 때마다, 세계가 조금씩 풀려."',
'cut.c2a': '강물까지 끈적하게 굳었어요.',
'cut.c2a2': '같은 거품끼리만 붙어 있으면 이렇게 돼요.',
'cut.c3a': '여기는 옛 사탕 마을. 합이 깨진 날, 제일 먼저 무너졌대요.',
'cut.c3b': '성 쪽에서 별빛이 깜빡였어요. 공주님이 살아 있다는 신호예요.',
'cut.c4a': '바람이 차요. 박하 먹깨비는 움직이는 걸 얼려버려요 \u2014 멈추지 말고 이어가요.',
'cut.c5a': '성의 첫 관문. 문지기는\u2026 초코 대왕.',
'cut.c5a2': '심장을 삼킨 바로 그 먹깨비예요.',
'cut.c5b': '힘이 부족했던 게 아니에요. 심장 없이는, 텐이 완성되지 않아요. 돌아가서 더 모아요.',
'cut.c6a': '성 안이에요. 발소리를 크림이 삼켜요. 여기서부턴 먹깨비들의 땅.',
'cut.c7a': '길이 자꾸 달라붙어요. 미로가 원하는 건 \u2014 당신이 같은 길만 도는 것.',
'cut.c8a': '공주님이 갇혔던 방이에요.',
'cut.c8a2': '창살에 이렇게 적혀 있어요 \u2014 "합은 부서져도, 다시 맞출 수 있다."',
'cut.c8b': '감옥이 비어 있어요! 공주님은 스스로 길을 찾고 있어요.',
'cut.c9a': '「열의 심장」이 여기서 뛰고 있어요.',
'cut.c9a2': '세계가 굳은 이유도, 풀릴 방법도 \u2014 전부 이 방에.',
'cut.c10a': '초코 대왕과의 재대결. 이번엔 심장이 우리 쪽에서 뛰어요.',
'cut.c10b': '합이 돌아왔어요. 같은 것은 같아서 반갑고, 다른 것은 더해져 열이 돼요.',
'cut.c10b2': '\u2026그게 이 세계의 노는 법이에요.',
'char.pudding.name': '푸딩 기사',
'char.pudding.title': '젤리 왕궁의 방패',
'char.pudding.tag': '버티기파',
'char.pudding.ult': '{sec}초 동안 모든 매치가 텐트윈 콤보로 이어지고, 텐 파워와 트윈 파워 보너스를 함께 받아요.',
'char.pudding.tip': '길게 버티며 사슬을 쌓고 싶을 때.',
'skill.pudding.name': '푸딩 방패',
'char.sodawitch.name': '소다 마녀',
'char.sodawitch.title': '탄산 늪의 마녀',
'char.sodawitch.tag': '한 방파',
'char.sodawitch.ult': '{sec}초 동안 모든 매치 점수가 {x}배가 돼요.',
'char.sodawitch.tip': '한 번에 크게 터뜨리고 싶을 때.',
'skill.sodawitch.name': '탄산 주문',
'char.mongle.name': '몽글',
'char.mongle.pass': '{psec}초 동안 시계와 악당 게이지를 멈춰요. 멈춘 동안에도 매치는 계속할 수 있어요.',
'char.churup.name': '츄릅',
'char.churup.pass': '숫자가 두 칸 이상 남은 줄 하나를 골라 다시 섞어요. 다음 판 흔들기도 한 번 막아 줘요.',
'char.mukmul.name': '먹물이',
'char.mukmul.pass': '판에서 가장 많은 숫자로 {pn}칸을 물들여요.',
'char.tiktok.name': '째깍이',
'char.tiktok.pass': '{psec}초 동안 시간을 멈춰요. 시계와 악당 게이지가 멈춘 동안에도 매치할 수 있어요.',
'char.kkultteok.name': '꿀떡이',
'char.kkultteok.pass': '열매 {pn}개를 황금 열매로 바꿔요. 황금 열매가 든 매치는 점수가 {mult}배예요.',
'char.bangul.name': '방울이',
'char.bangul.pass': '방해 타일(블로커·얼음) {pn}개를 씻어 내요. 가려진 숫자도 한 번에 되돌려요.',
'char.ppyak.pass2': '8초 동안 멀리 떨어진 두 칸도 이어서 맞출 수 있어요. 그동안 얼음 칸은 한 번에 깨져요.',
'char.sseokssak.name': '썩싹이',
'char.sseokssak.pass': '남은 타일 중 {pn}칸을 한 번에 지워요. 다음 판 흔들기도 한 번 막아 줘요.',
'char.banjjak.name': '반짝이',
'char.banjjak.pass': '스킬 게이지를 한 번에 {pn}% 채워요.',
'say.combo.pudding': '버텨, 계속!',
'say.jackpot.pudding': '운이 따르는군!',
'say.mission.pudding': '임무 완수!',
'say.tier.pudding': '한 발도 못 지나가!',
'say.clear.pudding': '길이 안전해졌다.',
'say.boss.pudding': '내 뒤에 서!',
'say.star.pudding': '별을 지켜냈다!',
'say.combo.sodawitch': '보글보글!',
'say.jackpot.sodawitch': '펑, 터졌다!',
'say.mission.sodawitch': '거품 완성!',
'say.tier.sodawitch': '탄산 만땅!',
'say.clear.sodawitch': '시원하게 끝!',
'say.boss.sodawitch': '흔들어서 뻥!',
'say.star.sodawitch': '반짝이는 별!',
'pick.hero': '주인공',
'pick.mate': '펫',
'cp.tab.char': '캐릭터',
'cp.tab.pet': '펫',
'aria.matepick': '펫을 고르세요',
'mate.none.name': '없음',
'mate.none.pass': '혼자서',
'tw.next.ten': '다음: 텐!',
'tw.next.twin': '다음: 트윈!',
'tw.banner': '텐트윈 콤보!',
'hurry.big': '허리 업!!',
'hurry.princess': '도와줘~ ㅠㅠ',
'hurry.prince': '조금만 버텨!',
'aria.charpick': '캐릭터 고르기',
'pv.jelly.hit': '잭팟 ×{jm}!',
'combo.tier1': '불붙었다!',
'combo.tier2': '활활!',
'combo.tier3': '말도 안 돼!',
'combo.tier4': '전설이다!',
'lang.short': '한',
'menu.bestrush': '러시 {score}점',
'toast.addcd': '{n}초 뒤에 또 쓸 수 있어요',
'toast.autoadd': '이을 게 없네요. 제가 추가할게요!',
'toast.rushnext': '보드 클리어! 다음 판으로',
'over.rush.title': '시간 종료!',
'over.rush.best': '러시 최고',
'act.addfree': '∞',
'mission.label': '미션',
'mission.sum10': '합이 10인 짝 {goal}번 지우기',
'mission.same': '같은 숫자 짝 {goal}번 지우기',
'mission.rows': '줄 {goal}개 없애기',
'mission.noadd': '추가 없이 {goal}번 지우기',
'mission.special': '특수 타일 {goal}개 써먹기',
'mission.fever': '피버 타임 한 번 터뜨리기',
'mission.bomb': '폭탄으로 {goal}칸 날리기',
'mission.chain3': '텐↔트윈 교차 3연결 {goal}번',
'mission.combo5': '콤보 5까지 올리기',
'mission.sprint': '30초 안에 {goal}번 지우기',
'mission.col': '{goal}번 세로줄 싹 비우기',
'mission.prog': '{n}/{goal}',
'finish.mission.sum10': '텐 {goal}번',
'finish.mission.chain3': '텐↔트윈 교차 {goal}번',
'finish.mission.sprint': '지금 {goal}번 지우기',
'finish.sub': '피니시 찬스',
'mission.done': '미션 완료!',
'mission.reward': '+{score}점 & 추가 +1',
'fever.on': '피버 타임!',
'fever.off': '피버 +{score}점',
'grade.s': 'S',
'grade.a': 'A',
'grade.b': 'B',
'grade.c': 'C',
'grade.s.msg': '완벽했어요!',
'grade.a.msg': '아주 좋아요.',
'grade.b.msg': '무난하게 클리어!',
'grade.c.msg': '클리어! 다음엔 더 빠르게',
'milestone.title': '{n}번째 짝!',
'milestone.title.rw': '{n}번째 짝! 별 +{v}',
'milestone.sub': '이 기세 그대로 가요.',
'over.share': '공유하기',
'aria.overShare': '결과 카드 이미지와 함께 점수 공유하기',
'tut.skip': '건너뛰기',
'aria.tutSkip': '튜토리얼 건너뛰기',
'aria.theme': '테마',
'aria.pzTheme': '테마 바꾸기',
'pause.theme.dark': '테마: 어둡게',
'tut.replay': '직접 해보기',
'tut.s1': '<b>7</b>이 위아래로 둘. 곧게 이어지지? 눌러 봐.',
'tut.s2': '저기 <b>2</b>도 두 개네. 눌러 봐.',
'tut.s2fail': '봤지? 꺾이면 안 이어져. 곧은 길만 통해. 비스듬한 것도 곧은 길이야. <b>7</b>과 <b>3</b>, 합이 <b>10</b>.',
'tut.s3': '줄 끝이랑 다음 줄 첫 칸. 저 <b>6</b> 둘은 아직 닿아 있어.',
'tut.s3fail': '거기 말고. 줄 <b>끝</b>에서 다음 줄 <b>첫 칸</b>으로 이어 봐.',
'tut.done': '이게 기본이야. 이제 악당을 물리쳐 봐!',
'rules.title': '규칙은 셋뿐이야',
'rules.r1': '같은 숫자, 또는 합이 <b>10</b>',
'rules.r2': '가로·세로·대각선 <b>곧은 길</b>로 이어질 것',
'rules.r3': '또는 줄 <b>끝</b>에서 다음 줄 <b>첫 칸</b>으로',
'rules.note': '어느 쪽이든 사이에 타일이 남아 있으면 안 돼.',
'skills.title': '전투의 세 단추',
'skills.s1': '<b>공격</b> 게이지는 캐릭터 이름판에서 차고, 다 차면 저절로 공격해요.',
'skills.s2': '<b>각성</b> 게이지는 합이 10인 짝과 같은 숫자 짝을 <b>번갈아</b> 맞출 때만 차요. 누르면 {awk}초 동안 점수가 <b>{am}배</b>예요.',
'skills.s3': '<b>스킬</b> 게이지는 매치마다, 콤보가 높을수록 빨리 차요. 누르면 캐릭터 스킬을 써요.',
'skills.s4': '<b>펫소환</b>은 고른 펫 스킬을 써요. 판마다 {pu}번으로 시작해 펫 과일을 터뜨릴 때마다 늘어요(최대 {pmax}번).',
'skills.note': '<b>스킬 과일</b>과 <b>각성 과일</b>은 자기 게이지를 단번에 채우고, <b>장비 과일</b>을 터뜨리면 그 장비를 얻어요.',
'menu.dailydone': '오늘 데일리 완료',
'menu.dailytodo': '오늘의 데일리가 기다려요',
'hud.daily': '데일리',
'hud.moves': '남은 짝',
'act.shuffle': '섞기',
'aria.shuffle': '보드 섞기',
'toast.shuffled': '싹 섞었어요!',
'toast.shufflestuck': '막혔네요. 제가 섞어드릴게요!',
'toast.shufflelocked': '아직 맞출 짝이 남았어요!',
'toast.shufflefail': '다시 섞어도 짝이 없어요. 여기까지예요!',
'toast.noshuffle': '섞기를 다 썼어요.',
'toast.blocked': '값은 맞지만 사이가 막혔어요',
'toast.blockedBy': '{n} 타일이 사이를 막고 있어요',
'toast.notLine': '곧은 길이 아니에요',
'toast.alignRemind': '곧은 길, 또는 줄 끝과 다음 줄 첫 칸',
'combo.5': '이걸 멈춰?!',
'streak.reward': '연속 {d}일 보상!',
'toast.rushopen': '타임 러시 열렸어요!',
'clear.nextpreview': '다음: {cells}칸 · {what}',
'clear.nextpreviewplain': '다음: {cells}칸',
'prev.wild': '만능 타일 등장',
'prev.ice': '얼음 등장',
'prev.bomb': '폭탄 등장',
'prev.row': '한 줄 더',
'prev.adds': '추가 {n}개로 줄어요',
'prev.denser': '짝이 더 귀해져요',
'share.beat': '내 기록 깨봐!',
'rank.title': '내 기록',
'rank.tab.endless': '무한 모드',
'rank.tab.rush': '타임 러시',
'rank.tab.daily': '데일리',
'rank.hint.endless': '무한 모드 최고 점수 TOP 5',
'rank.hint.rush': '타임 러시 최고 점수 TOP 5',
'rank.hint.daily': '데일리 최단 시간 TOP 5. 데일리는 매일 판 크기가 같아서 시간으로 겨뤄요.',
// W7.5 — 클래식 보드 셋. 행 문구를 새로 만들지 않는 이유는 en 쪽 주석 참조.
'rank.tab.classic': '클래식',
'rank.tab.classicrush': '클래식 러시',
'rank.tab.classicdaily': '클래식 데일리',
'rank.hint.classic': '스킬도 아이템도 없이 겨룬 클래식 최고 점수 TOP 5',
'rank.hint.classic-rush': '실력만으로 겨룬 클래식 타임 러시 최고 점수 TOP 5',
'rank.hint.classic-daily': '모두가 같은 조건인 클래식 데일리 최단 시간 TOP 5',
'rank.empty': '아직 비었어요',
'rank.dateunknown': '예전 기록',
'rank.close': '닫기',
'rank.open': '내 기록',
'rank.row.endless': '{score}점',
'rank.row.rush': '{score}점',
'rank.row.daily': '{time}',
'rank.meta.endless': '{stage}단계 · {date}',
'rank.meta.rush': '{matches}짝 · {date}',
'rank.meta.daily': '#{n} · {combo}× · {date}',
'rank.new': '🏆 {n}위 기록!',
'rank.new1': '🏆 1위 신기록!',
'rank.overline': '신기록! 내 기록 {n}위',
'aria.rank': '내 기록 보기',
'aria.rankClose': '내 기록 닫기',
'aria.rankTab': '기록 종류 고르기',
'menu.adv': '모험',
'menu.advsub': '젤리공주 구출 대작전',
'mode.title': '플레이',
'map.plate1': '챕터 1: 달콤한 지도',
'map.plate2': '챕터 2: 푸딩 산맥',
'map.plate3': '챕터 3: 캔디 케인 사막',
'map.plate4': '챕터 4: 박하 언덕',
'map.plate5': '챕터 5: 초코 관문',
'map.plate6': '챕터 6: 크림 회랑',
'map.plate7': '챕터 7: 시럽 미로',
'map.plate8': '챕터 8: 설탕 감옥',
'map.plate9': '챕터 9: 심장의 방',
'map.plate10': '챕터 10: 왕좌',
'map.chip1': '챕터 1: 달콤한 지도',
'map.chip2': '챕터 2: 푸딩 산맥',
'map.chip3': '챕터 3: 캔디 케인 사막',
'map.chip4': '챕터 4: 박하 언덕',
'map.chip5': '챕터 5: 초코 관문',
'map.chip6': '챕터 6: 크림 회랑',
'map.chip7': '챕터 7: 시럽 미로',
'map.chip8': '챕터 8: 설탕 감옥',
'map.chip9': '챕터 9: 심장의 방',
'map.chip10': '챕터 10: 왕좌',
'minimap.title': '챕터',
'minimap.locked': '{n}탄을 깨면 열려요',
'minimap.sum': '별 {s} · 열린 챕터 {c}/10',
'aria.minimap': '챕터 전체 보기',
'aria.mmcell': '챕터 {c}, 별 {s}개, {d}탄 클리어',
'aria.mmlock': '챕터 {c}, 잠김',
'theater.title': '스토리 극장',
'theater.locked': '{n}챕터에 도착하면 열려요',
'aria.thcell': '{c}장 이야기 다시 보기',
'mode.rush.d': '90초. 맞추면 시간 추가.',
'classic.title': '클래식',
'classic.lead': '스킬도 아이템도 패시브도 없어요. 판을 비우면 다음 판, 막히면 끝. 러시는 90초, 데일리는 하루 한 판이에요.',
'classic.arcade': '무한 모드',
'classic.arcade.d': '끝없이, 순수하게.',
'classic.rush': '타임 러시',
'classic.rush.d': '90초, 실력만으로.',
'classic.daily': '데일리',
'classic.daily.d': '오늘의 판, 같은 조건.',
'classic.skills': '스킬·펫 사용',
'classic.lead.on': '스킬·아이템·펫·패시브를 켜고 해요. 종목은 그대로 셋, 기록은 순수 클래식과 따로 쌓여요.',
'arc.hub': '대전',
'arc.hub.d': '악당과 겨루는 세 종목.',
'arc.title': '대전',
'arc.lead': '러시 시계 위에서 악당과 겨뤄요. 결과를 찍어 친구와 비교하세요.',
'arc.time.name': '타임어택',
'arc.time.d': '악당을 가장 빠르게.',
'arc.surv.name': '서바이벌',
'arc.surv.d': '악당 앞에서 오래 버티기.',
'arc.dmg.name': '90초 누적',
'arc.dmg.d': '90초, 악당에게 누적 데미지.',
'arc.dir.low': '짧을수록 승리',
'arc.dir.high': '길수록 승리',
'arc.dir.more': '많을수록 승리',
'arc.clear': '악당 격파!',
'arc.ko': '쓰러졌어요',
'arc.timeup': '시간 종료',
'arc.norecord': '기록 없음',
'arc.foe': '상대 {name}',
'arc.kos': '처치 {n}',
'arc.best': '최고 {v}',
'arc.nobest': '첫 기록!',
'arc.new': '신기록!',
'arc.again': '다시하기',
'arc.menu': '메인 메뉴',
'arc.share': '공유하기',
'aria.arcShare': '결과 카드 이미지와 함께 아케이드 기록 공유하기',
'rank.arc.title': '아케이드 대전',
'aria.cont': '클래식: 순수 실력 모드',
'aria.chprev': '이전 챕터',
'aria.chnext': '다음 챕터',
'aria.cutskip': '스토리 건너뛰기',
'aria.cutskipall': '이야기 전부 건너뛰기',
'pick.rec': '추천',
'pet.combo.k': '추천 조합',
'pet.syn.ppyak': '떨어진 칸도 이어져 두 왕자가 짝을 고르기 쉬워요.',
'pet.syn.mungchi': '{psec}초 동안 멈춘 사이에도 매치해 잭팟을 더 노려요.',
'pet.syn.mongle': '{psec}초 동안 멈춘 사이에도 매치해 잭팟을 더 노려요.',
'pet.syn.tiktok': '{psec}초 동안 멈춘 사이에도 매치해 잭팟을 더 노려요.',
'pet.syn.churup': '한 줄을 섞어 새 짝을 만들어 텐 파워와 잘 맞아요.',
'pet.syn.mukmul': '{pn}칸을 같은 숫자로 바꿔 트윈 파워와 딱 맞아요.',
'pet.syn.kkultteok': '황금 열매 {pn}개로 기본 점수가 높을수록 더 벌어요.',
'pet.syn.banjjak': '스킬 게이지를 {pn}% 채워 스킬이 긴 캐릭터와 잘 맞아요.',
'pet.syn.bangul': '방해 타일 {pn}개를 치워 두 왕자가 짝을 찾기 쉬워요.',
'pet.syn.sseokssak': '{pn}칸을 지우고 새로 채워 기본 점수 캐릭터가 바로 벌어요.',
'char.ten.tag': '전략가',
'char.twin.tag': '스피드러너',
'char.jelly.tag': '두근두근파',
'story.skip': '건너뛰기',
'story.skipall': '전부 건너뛰기',
'cut.who.ten': '텐텐',
'cut.who.twin': '트윈',
'cut.who.jelly': '젤리공주',
'cut.who.boss': '먹깨비',
'cut.who.bros': '텐텐 · 트윈',
'cut.who.mates': '삐약 · 뭉치',
'cut.who.ppyak': '삐약',
'cut.who.mungchi': '뭉치',
'cut.o1': '젤리팡 세상은 오늘도 말랑말랑.',
'cut.o2': '열매가 열리면 다 같이 나눠 먹었지.',
'cut.o3': '그런데 그날 밤은\u2026 좀 이상했어.',
'cut.o4': '우물\u2026 우물\u2026 배고파아\u2014.',
'cut.o5': '전부\u2014 내 거야아!',
'cut.o6': '우리 젤리는 못 줘!',
'cut.o7': '앗! 놔! 놓으라구!',
'cut.o8': '디저트는\u2026 공주로 하지\u2014.',
'cut.o9': '소식은 옆 나라, 텐트윈 왕국에 닿았어.',
'cut.o10': '가자, 트윈. \u2014 이미 신발 신었어!',
'cut.o11': '삐약! 나도 갈래! \u2014 뭉\u2026 같이\u2026',
'cut.o11b': '뭉\u2026 나도 왔어\u2026',
'cut.o12': '구출 대작전, 지금 시작!',
'cut.t1': '길은 하나뿐이야.',
'cut.t2': '합이 10이면\u2026 길이 열려.',
'cut.t3': '늦지 않게 갈게, 공주.',
'cut.w1': '지도? 그런 거 몰라!',
'cut.w2': '똑같은 숫자! 그거면 돼!',
'cut.w3': '형! 먼저 간다\u2014!',
'cut.p1': '공주는 오늘도 왕자님을 기다렸다.',
'cut.p2': '\u20263일째잖아.',
'cut.p3': '이 왕자놈들을 기다릴 순 없어!',
'cut.p3b': '안 돼! 이 모습을 왕자님들께 보이면\u2026',
'cut.p3c': '내 결혼은 끝이야!',
'cut.p4': '길은 내가 뚫는다!',
'aria.mapback': '메뉴로 돌아가기',
'adv.stagen': '{n}탄',
'adv.stagebadge': '{n}탄',
'adv.bossn': '{n}탄 보스',
'adv.locked': '앞 탄부터 깨야 열려요.',
'adv.nodearia': '{n}탄, 별 {s}개',
'adv.goal.score': '{n}점 모으기',
'adv.goal.digit': '숫자 {d} 타일 {n}개 지우기',
'adv.goal.time': '{s}초 안에 {n}칸 비우기',
'adv.hud.score': '{n} / {goal}',
'adv.hud.digit': '{d}번 {n} / {goal}',
'adv.hud.time': '{n} / {goal}칸',
'adv.goalhit': '목표 달성! 남은 시간엔 별을 모아요',
'adv.hand.blk': '블로커 {n}개',
'adv.hand.lock': '잠금 {n}개',
'adv.hand.noshuffle': '셔플 금지',
'adv.hand.timecut': '시간 단축',
'adv.star1': '★ 클리어',
'adv.star2': '★★ {n}점',
'adv.star3': '★★★ {n}점 + 셔플 0회 + 합10 {t}회',
'node.foehp': '악당 체력',
'node.cond': '약점',
'node.best': '내 최고',
'node.rec': '이 캐릭인 이유',
'node.recpet': '이 펫인 이유',
'node.clear': '{sec}초 안에 쓰러뜨리기',
'node.clear.boss': '쓰러뜨리고 {fsec}초 안에 {mis}',
'node.clear.timeout': '시간이 끝나면 남은 체력 비율로 승부해요. 같으면 내가 이겨요.',
'node.info.aria': '시간 규칙 보기',
'node.atk.info.aria': '악당 기술 설명 보기',
'node.drops': '이 판에서 나오는 장비',
'node.drops.all': '전체 {k}종 ›',
'node.recmark': '추천',
'node.swap.aria': '캐릭터·펫 바꾸기',
'node.stars.got': '이 탄에서 별 {s}개를 얻었어요.',
'node.foe.label': '이번 상대',
'node.hp.label': 'HP',
'node.lv': 'Lv{lv}',
'rec.why.ten': '텐 파워가 높아서, 합이 10인 짝이 많은 이 판에서 점수가 가장 크게 올라요.',
'rec.why.twin': '트윈 파워가 높아서, 같은 숫자 짝이 많은 이 판에서 점수가 가장 크게 올라요.',
'rec.why.jelly': '잭팟이 높아서 매치마다 점수 {jm}배를 노려요. 시간이 목표인 판에서 강해요.',
'rec.why.pudding': '기본 점수가 높아서 어떤 매치든 점수가 붙어요. 긴 판을 끝까지 끌고 가요.',
'rec.why.sodawitch': '탄산 주문이 {sec}초 동안 모든 매치 점수를 {x}배로 올려 보스를 빠르게 깎아요.',
'rec.why.atk.blk': '이 보스는 블로커를 자주 떨어뜨려요. 방울이의 거품 파도가 블로커를 2개씩 씻어 내요.',
'rec.why.atk.freeze': '이 보스는 한 줄을 얼려요. 째깍이가 시간을 멈춘 동안에는 얼리기가 통하지 않아요.',
'rec.why.atk.mask': '이 보스는 숫자를 가려요. 방울이의 거품 파도가 가려진 숫자를 한 번에 되돌려요.',
'rec.why.atk.quake': '이 보스는 판을 흔들어요. 츄릅의 크게 한 입이 다음 흔들기를 한 번 막아 줘요.',
'rec.why.atk.cycle': '이 보스는 네 가지 공격을 번갈아 써요. 째깍이가 시간을 멈추면 어떤 공격이 와도 대응할 틈이 생겨요.',
'adv.go': '시작',
'adv.missionwin': '미션 성공! 이제 매치마다 ×{mult}',
'adv.missionfail': '미션 시간이 끝났어요. 스테이지는 계속돼요.',
'adv.crumble': '블로커가 와르르 무너졌어요!',
'adv.win': '{n}탄 클리어!',
'adv.bosswin': '{n}탄 보스 격파!',
'adv.lose': '{n}탄 실패',
'adv.result.scripted': '1차전: 후퇴',
'adv.result.scripted.sub': '진 게 아니에요. 이야기가 이제 시작된 거예요. 6챕터가 열렸어요.',
'adv.result.finish': '피니시를 놓쳤어요',
'story.s50.taunt': '"지금은 안 돼! 심장 없이는 못 이겨. 물러나서, 힘을 모아."',
'howto.ten': '같은 숫자는 <b>트윈</b>, 합이 10이면 <b>텐</b>. 텐을 만들수록 굳은 세계가 풀려요.',
'howto.ult': '각성 게이지는 <b>번갈아</b> 맞출 때 차요. 텐 다음 트윈, 트윈 다음 텐으로 이어 가다가 가득 차면 눌러서 {awk}초 동안 점수를 {am}배로 받아요.',
'howto.awaken': '스킬 게이지는 콤보가 클수록 빨리 차요. 가득 차면 눌러서 내 캐릭터의 스킬을 {sec}초 동안 써요.',
'howto.overdrive': '공격이 꼬리를 물면 <b>폭주</b>! 멈추지 않는 한 계속돼요. 계속 맞추면, 계속 쏴요.',
'howto.finish': '보스가 쓰러지면 <b>피니시 10초</b>. 화면에 뜬 마지막 미션을 해내야 진짜 승리예요.',
'tip.awakenReady': '스킬 준비! 눌러 보세요.',
'tip.ultReady': '각성 준비! 누르면 {awk}초 동안 점수가 {am}배예요.',
'item.guard.block': '막았다!',
'fx.overdrive': '폭주!!',
'adv.note3': '별 세 개. 여기서 더 가져갈 게 없어요.',
'adv.note.next': '{n}점이면 별 두 개예요.',
'adv.note.miss2': '별 두 개 조건 · {m}',
'adv.note.miss3': '별 세 개 조건 · {m}',
'adv.miss.score': '{n}점',
'adv.miss.ease': '시간 또는 추가 여유',
'adv.miss.shuffle': '셔플 0회',
'adv.miss.ten': '합10 {t}회 더',
'adv.reason.timeout': '시간이 다 됐어요.',
'adv.reason.stuck': '더 이상 맞출 짝이 없어요.',
'adv.reason.ko': '쓰러지고 말았어요...',
'adv.reason.finish': '피니시 10초 안에 못 해냈어요.',
'duel.tell': '악당이 공격을 준비해요!',
'duel.hit': '피격! HP -{n}',
'duel.skill': '방해 블로커 {n}개!',
'duel.skfreeze': '한 열이 통째로 얼었어요! ({n}칸)',
'duel.skmask': '숫자가 가려졌어요! ({n}칸)',
'duel.skquake': '판이 흔들렸어요! ({n}행 밀림)',
'duel.skvoid': '악당의 기술이 빗나갔어요!',
'duel.skvoidw': '무효!',
'act.attack': '공격',
'act.special': '각성',
'act.awk.left': '{n}초',
'act.pet': '펫소환',
'act.awaken': '스킬',
'aria.special': '각성. {awk}초 동안 얻는 점수가 {am}배가 돼요.',
'aria.pet': '펫 스킬 사용',
'aria.awaken': '스킬',
'duel.spstat': '각성 게이지 {n}%예요. 합이 10인 짝과 같은 숫자 짝을 번갈아 맞추면 차요.',
'duel.spgo': '각성! {awk}초 동안 얻는 점수가 {am}배예요',
'duel.awkon': '각성 중이에요. {n}초 남았어요.',
'duel.petnone': '펫이 없어요. 펫을 고르면 그 스킬을 판마다 몇 번 쓸 수 있어요.',
'duel.petout': '이번 판에 쓸 수 있는 펫 스킬을 다 썼어요. 판 위의 펫 과일을 터뜨리면 한 번 더 쓸 수 있어요.',
'duel.petempty': '쪼아먹을 타일이 없어요.',
'duel.petpeck': '쪼아먹기! {n}칸 정리',
'mk.pet': '+1 펫!',
'mk.star': '스킬 MAX!',
'mk.awk': '각성 MAX!',
'mk.gear': '{tier} {name} 획득!',
'mk.gearmax': '{name} 최대 레벨! 코인 +{c}',
'mk.gearmax0': '{name} 최대 레벨!',
'drops.tier.common': '일반',
'drops.tier.rare': '희귀',
'drops.tier.epic': '영웅',
'drops.title': '{n}탄 획득표',
'drops.gear.h': '장비 과일',
'drops.gear.sub': '새로 떨어지는 과일 100개 중 {r}개꼴로 장비 과일이 나와요.',
'drops.gear.avg': '한 판 평균 {a}개예요.',
'drops.tier': '일반 {c}% · 희귀 {r}% · 영웅 {e}%',
'drops.chance': '{p}%',
'drops.lv': 'Lv {lv}/{max}',
'drops.note': '확률은 장비 과일 하나 기준이에요. 한 판 평균은 시험 주행 값이에요.',
'drops.boss.h': '보스 보상',
'drops.boss.sub': '보스를 쓰러뜨리면 장비 하나를 꼭 받아요. 희귀 {r}% · 영웅 {e}%',
'drops.use.h': '사용 과일',
'drops.use.pet': '펫 과일',
'drops.use.pet.d': '펫 소환을 한 번 더 쓸 수 있어요.',
'drops.use.star': '스킬 과일',
'drops.use.star.d': '스킬 게이지가 단번에 가득 차요.',
'drops.use.awk': '각성 과일',
'drops.use.awk.d': '각성 게이지가 단번에 가득 차요.',
'drops.use.p': '100개 중 {x}개꼴',
'drops.gift.h': '선물 상자',
'drops.gift.sub': '이 탄에 들어가면 {p}% 확률로 상자가 나와요. 열면 장비 {i}%, 펫이나 영웅 장비 {x}%예요.',
'drops.gift.d': '열면 장비 {i}%, 펫이나 영웅 장비 {x}%예요.',   /* [Task 8a 수정 1회차 A3c] 선물 줄 설명 = drops.gift.sub 둘째 문장 그대로 */
'drops.gift.p': '들어갈 때마다 {p}%',                          /* 선물 줄 알약 = 얼마나 자주 */
'drops.gear.cap': '과일 100개 중 {r}개꼴 · 한 판 평균 {a}개',
'drops.note2': '확률은 장비 과일 하나 기준이에요',
'tile.lv': 'Lv {lv}',   /* 장비 칸(itemTile) 레벨 알약 */
'duel.petshield': '말랑 방패! {n}초 동안 시계도 악당 게이지도 멈춰요',
'skill.sub.sp': '각성',
'skill.sub.pet': '펫 스킬',
'skill.sub.foe': '악당 기술',
'skill.sp.name': '점수 {am}배!',
'skill.ppyak.name': '삐약의 자유 연결!',
'skill.mungchi.name': '뭉치의 말랑 방패!',
'skill.foe.name': '블로커 비!',
'duel.tellwarn': '온다!',
'duel.timestop': '시간 정지',
'skill.mongle.name': '몽글의 시간 웅덩이!',
'skill.churup.name': '츄릅의 크게 한 입!',
'duel.petmongle': '시간 웅덩이! {n}초 동안 시계도 악당 게이지도 멈춰요',
'duel.petchurup': '크게 한 입! {n}줄을 다시 섞었어요',
'skill.tiktok.name': '째깍이의 타임 스톱!',
'skill.mukmul.name': '먹물이의 잉크 물들이기!',
'skill.kkultteok.name': '꿀떡이의 황금 소환!',
'skill.bangul.name': '방울이의 거품 파도!',
'skill.sseokssak.name': '썩싹이의 싹쓸이!',
'skill.banjjak.name': '반짝이의 번쩍 충전!',
'duel.pettiktok': '타임 스톱! {n}초 동안 시계를 잡아 뒀어요. 지금 터트려요!',
'duel.petppyak': '자유 연결! {n}초 동안 멀리 떨어진 숫자도 이어져요',
'duel.petmukmul': '잉크 물들이기! {n}칸이 {v}(으)로 물들었어요',
'duel.petkkultteok': '황금 소환! 황금 열매 {n}개가 열렸어요',
'duel.petbangul': '거품 파도! 방해 {n}개를 씻어 냈어요',
'duel.petclean0': '씻어 낼 방해가 없어요.',
'duel.petsseokssak': '싹쓸이! {n}칸을 치웠어요',
'duel.petbanjjak': '번쩍 충전! 스킬 게이지 +{n}%',
'pet.lock.ppyak': '처음부터 함께 있는 펫이에요.',
'pet.lock.mungchi': '처음부터 함께 있는 펫이에요.',
'pet.lock.mongle': '쉬지 않고 10연속 매치하면 합류해요.',
'pet.lock.churup': '모험 선물 상자의 희귀 자리에서 만날 수 있어요.',
'pet.lock.mukmul': '20탄 보스를 이기면 합류해요.',
'pet.lock.tiktok': '스킬을 3연속으로 터뜨리면 합류해요.',
'pet.lock.kkultteok': '장비 과일을 30개 모으면 합류해요.',
'pet.lock.bangul': '40탄 보스를 이기면 합류해요.',
'pet.lock.sseokssak': '합이 10인 매치를 누적 500회 하면 합류해요.',
'pet.lock.banjjak': '30탄 보스를 이기면 합류해요.',
'pet.timestop.hold': '내가 시간을 잡고 있을게!',
'pet.timestop.go': '어서 열매를 터트려!!',
'pet.freelink.go': '삐약이가 길을 터줄게!',
'adv.heartkept': '클리어라 하트는 그대로예요.',
'adv.heartplus': '보스 보상, 하트 +1!',
'adv.heartlost': '하트 -1. {n}개 남았어요.',
'adv.next': '다음 탄',
'adv.retry': '다시 도전',
'adv.map': '지도로',
'adv.leave': '지도로 (하트 -1)',
'adv.abandon': '스테이지를 나왔어요. 하트 -1.',
'adv.heartin': '다음 {t}',
'adv.heartfull': 'MAX',   /* 2026-08-19 사용자 반려 — "가득"이 촌스럽다. 한/영 공통 MAX */
'adv.heartwait': '하트가 없어요. 다음 하트까지 {t}.',
'adv.ad': '하트 받기 (준비 중)',
'adv.hearts': '하트',
'aria.skill': '스킬 쓰기',
'skill.ready': '발동!',
'skill.notyet': '스킬 {n}%예요. 매치마다 차고, 콤보가 높을수록 빨리 차요.',
'skill.sub': '스킬',
'skill.shout': '{name}!',
'skill.ten.name': '왕자의 축복',
'skill.twin.name': '쌍둥이 맹세',
'skill.jelly.name': '젤리 타임',
'skill.on.ten': '왕자의 축복으로 {sec}초 동안 모든 매치가 텐트윈 콤보예요',
'skill.on.twin': '쌍둥이 맹세로 {sec}초 동안 모든 매치가 텐트윈 콤보예요',
'skill.on.jelly': '젤리 타임으로 {sec}초 동안 잭팟 확률이 {jp}% 올라요',
'skill.on.pudding': '푸딩 방패로 {sec}초 동안 모든 매치가 텐트윈 콤보예요',
'skill.on.sodawitch': '탄산 주문으로 {sec}초 동안 모든 매치 점수가 {x}배예요',
'fx.awaken': '스킬!!',
'fx.awaken.chain': '{n}연쇄 폭발!',
'fx.finish': '격파!!',
'fx.finish.sub': '완벽한 마무리!',
'skill.gauge': '스킬',
'boss.grape.name': '포도 먹깨비',
'boss.soda.name': '소다 먹깨비',
'boss.berry.name': '딸기 먹깨비',
'boss.mint.name': '박하 먹깨비',
'boss.cocoa.name': '초코 대왕',
'boss.cocoa.intro': '"이 몸이 심장을 삼켰다. 너희의 \'텐\'은 이제 반쪽이야."',
'boss.cocoa.rematch': '"또 왔나. \u2026그 눈빛, 심장을 되찾은 눈이군."',
'boss.atk.blk': '블로커 투하',
'boss.atk.freeze': '한 열 얼리기',
'boss.atk.mask': '숫자 가리기',
'boss.atk.quake': '판 흔들기',
'boss.atk.cycle': '네 가지 공격 순환',
'boss.atk.blk.d': '판에 방해 블로커 {n}개를 떨어뜨려요.',
'boss.atk.freeze.d': '한 열을 얼려요. 언 칸은 두 번 맞춰야 사라져요.',
'boss.atk.mask.d': '숫자 {n}칸을 {sec}초 동안 가려요.',
'boss.atk.quake.d': '과일 {n}줄을 흔들어 자리를 바꿔요.',
'boss.atk.cycle.d': '네 기술을 {sec}초마다 돌아가며 써요.',
'boss.cond.sum10': '합10 매치 {n}회',
'boss.cond.chain3': '텐트윈 교대 연쇄 3 도달 {n}회',
'boss.cond.sprint': '쉬지 않고 이어친 매치 {n}회',
'boss.cond.mission2': '미션 {n}개 연속 성공',
'boss.goal': '{b} 격파',
'boss.prog': '{c} · {n}/{goal}',
'boss.armed': '빈틈 발견! 스킬 발동!',
'boss.weak': '빈틈!',
'boss.tell': '{b}가 노려보고 있어요…',
'boss.atk': '블로커가 떨어졌어요! ({n}개)',
'boss.down': '격파!!',
'boss.label': '보스',
'boss.hp': '체력',
'char.locked.aria': '잠긴 캐릭터',
'char.locked.hint': '아직 잠겨 있어요. 10탄 보스를 이기면 풀려나요.',
'unlock.title': '젤리공주 구출!',
'unlock.line': '고마워! 나도 같이 갈래!',
'unlock.sub': '젤리공주가 합류했어요. 메뉴에서 고를 수 있어요.',
'unlock.go': '같이 가자!',
'pick.title': '캐릭터',
'pick.go': '선택 완료',
'pick.locked': '잠김',
'pick.passive': '패시브',
'pick.ult': '스킬',
'menu.sub': '젤리팡 월드',
'pick.head': '캐릭터 선택',
'stat.k1': '텐 파워',
'stat.k2': '기본 점수',
'stat.k3': '트윈 파워',
'stat.k4': '잭팟',
'stat.tip.t': '{k} {v}',
'stat.d1':  '합이 10인 매치의 점수가 {n}% 올라요.',
'stat.d2':  '모든 매치의 점수가 {n}% 올라요.',
'stat.d3':  '같은 숫자 매치의 점수가 {n}% 올라요.',
'stat.d4':  '매치마다 {n}% 확률로 점수가 {jm}배가 돼요.',
'aria.statinfo': '이 능력치가 하는 일',
'menu.settings': '설정',
'settings.title': '설정',
'settings.sound': '소리',
'settings.vibe': '진동',
'settings.theme': '테마',
'settings.lang': '언어',
'quest.title': '미션',
'quest.tab.daily': '일일',
'quest.tab.weekly': '주간',
'quest.tab.epic': '에픽',
'quest.claim': '받기',
'quest.claimed': '완료',
'quest.claimall': '모두 받기',
'quest.none': '아직 받을 것이 없어요.',
'quest.ready': '받을 수 있어요: {n}',
'quest.got': '별 +{v}',
'quest.bonus': '오늘 미션 전부 완료! 하트 +{n}',
'quest.att.d': '{n}일째',
'aria.questTab': '어떤 미션을 볼지 고르기',
'menu.quest': '미션 {n}/{g}',
'dq.m10': '합 텐 {n}번 만들기',
'dq.combo': '콤보 x{n} 이상 1회',
'dq.pet': '펫 {n}번 소환',
'dq.awaken': '스킬 {n}번',
'dq.clear': '스테이지 {n}판 클리어',
'dq.daily': '오늘의 데일리 1판',
'dq.duel': '대전 1승',
'dq.star2': '별 두 개 이상 1회',
'dq.rush': '타임러시 {n}점',
'dq.item': '아이템 장착 1회',
'dq.match': '짝 {n}번 맞추기',
'dq.chain': '연속 매치 {n}회',
'wq.wclear': '이번 주 스테이지 {n}판 클리어',
'wq.wstar': '이번 주 새 별 {n}개',
'wq.wmis': '일일 미션 {n}회 완료',
'wq.wmatch': '이번 주 짝 {n}번',
'ach.first': '첫 짝',
'ach.match100': '짝 {n}번',
'ach.match1000': '짝 {n}번',
'ach.match5000': '짝 {n}번',
'ach.combo5': '콤보 x{n}',
'ach.combo10': '콤보 x{n}',
'ach.combo20': '콤보 x{n}',
'ach.pet1': '첫 펫',
'ach.pet3': '펫 셋',
'ach.petall': '펫 전원',
'ach.chap1': '챕터 {n} 완주',
'ach.chap3': '챕터 {n} 완주',
'ach.star30': '별 {n}개',
'ach.star60': '별 {n}개',
'ach.streak3': '{n}일 연속',
'ach.streak7': '{n}일 연속',
'ach.streak14': '{n}일 연속',
'ach.duel1': '첫 승',
'ach.duel10': '대전 {n}승',
'ach.awaken50': '스킬 {n}회',
'settings.rank': '기록',
'settings.close': '닫기',
'settings.on': '켜짐',
'settings.off': '꺼짐',
'settings.theme.dark': '어둡게',
'settings.theme.light': '밝게',
'settings.lang.v': '한국어',
'aria.settings': '설정 열기',
'aria.charrack': '캐릭터 썸네일',
'aria.skins': '스킨 열기',
'skin.btn': '스킨',
'skin.title': '스킨',
'skin.balance': '별',
'skin.equip': '장착',
'skin.equipped': '착용 중',
'skin.inshop': '상점에서 만나요',
'skin.soon': '곧 만나요',
'skin.soonhint': '비숑 왕자의 모자',
'skin.confirm': '{name}을(를) 별 {n}개로 살까요?',
'skin.bought': '{name} 해금!',
'skin.poor': '별이 {n}개 부족해요',
'aria.shop': '상점 열기',
'shop.btn': '상점',
'shop.title': '상점',
'shop.tab.jewel': '보석',
'shop.tab.bundle': '번들',
'shop.krw': '{n}원',
'shop.price.jewel': '\uD83D\uDC8E {n}',
'shop.daily': '일일 무료',
'shop.daily.d': '하루 한 번, 보석 {n}개 + 하트 1개',
'shop.daily.wait': '내일 다시 받을 수 있어요',
'shop.daily.get': '받기',
'shop.daily.done': '받음',
'shop.daily.got': '보석 +{n}개와 하트 1개!',
'shop.first2x': '처음 한 번 2배',
'shop.pack.s': '보석 한 줌',
'shop.pack.m': '보석 주머니',
'shop.pack.l': '보석 상자',
'shop.pack.xl': '보석 궤짝',
'shop.pack.d': '보석 {n}개',
'shop.start': '시작 팩',
'shop.start.d': '보석 {n}개 + 하트 {h}개 + 별 {s}개',
'shop.heart5': '하트 가득 채우기',
'shop.heart5.d': '기다림 없이 {n}개로',
'shop.heart1': '하트 1개',
'shop.heart1.d': '30분 기다림을 건너뛰어요',
'shop.heart.ok': '하트를 채웠어요!',
'shop.bundle1': '모험 번들',
'shop.bundle1.d': '하트와 아이템을 한 번에',
'shop.bundle2': '하트 번들',
'shop.bundle2.d': '저녁 내내 놀 수 있는 만큼',
'shop.skin.confirm': '{name}을(를) 보석 {n}개로 살까요?',
'shop.poor': '보석이 {n}개 부족해요',
'shop.poor.continue': '이어하려면 보석이 더 필요해요',
'shop.continue.paid': '보석 -{n}개. 한 번 더!',
'confirm.title': '확인',
'confirm.yes': '구매',
'confirm.no': '취소',
'invite.title': '초대',
'invite.next': '다음 초대까지',
'invite.go.n': '★{n} 로 초대',
'invite.free': '무료로 초대',
'invite.go': '초대',
'invite.got': '새로운 캐릭터!',
'invite.got.pet': '새로운 펫!',
'invite.new': '{n} 합류!',
'intro.next': '▶ 다음',
'intro.done': '▶ 닫기',
'intro.ten.l1': '나는 텐텐 왕자. 길은 언제나 하나쯤 더 있는 법이오.',
'intro.ten.l2': '나는 텐 파워가 가장 높소. 합이 10인 짝을 맞출수록 점수가 크게 오르지.',
'intro.ten.l3': '스킬을 쓰면 트윈을 부른다. 그동안은 모든 매치가 텐트윈 콤보요.',
'intro.twin.l1': '트윈 왕자야. 느린 건 못 참아. 따라와 봐!',
'intro.twin.l2': '난 트윈 파워가 제일 높아. 같은 숫자 짝이면 점수가 확 올라가!',
'intro.twin.l3': '스킬을 쓰면 형을 부른다. 그동안은 전부 텐트윈 콤보!',
'intro.jelly.l1': '젤리공주예요. 오래 기다렸어요. 이제 내가 지킬 차례예요.',
'intro.jelly.l2': '저는 잭팟이 가장 높아요. 매치마다 점수 {jm}배가 터질 수 있어요.',
'intro.jelly.l3': '내 스킬은 젤리 타임이에요. {sec}초 동안 잭팟 확률이 {jp}% 올라가요.',
'intro.pudding.l1': '푸딩 기사입니다. 급할수록 단단하게. 내가 앞에 서겠소.',
'intro.pudding.l2': '나는 기본 점수가 가장 높소. 어떤 매치든 점수가 든든하게 붙지.',
'intro.pudding.l3': '스킬을 쓰면 방패를 펼친다. 그동안 모든 매치가 텐트윈 콤보요.',
'intro.sodawitch.l1': '소다 마녀야. 크게 한 번, 그게 내 취향이지.',
'intro.sodawitch.l2': '난 잭팟과 기본 점수가 둘 다 높아. 꾸준히 벌다가 가끔 크게 터뜨리지.',
'intro.sodawitch.l3': '내 스킬은 탄산 주문. {sec}초 동안 모든 매치 점수가 {x}배가 돼.',
'intro.ppyak.l1': '삐약! 처음부터 너랑 같이 있었어.',
'intro.ppyak.l2': '내 스킬은 「자유 연결」이야. {psec}초 동안 떨어진 두 칸도 이어져.',
'intro.mungchi.l1': '뭉치야. 든든한 건 내가 제일이지.',
'intro.mungchi.l2': '내 스킬은 「말랑 방패」야. {psec}초 동안 시계와 악당 게이지가 멈춰.',
'intro.mongle.l1': '몽글이에요. 시간이 급할 때 불러 주세요.',
'intro.mongle.l2': '내 스킬은 「시간 웅덩이」예요. {psec}초 동안 시계와 악당 게이지가 멈춰요.',
'intro.tiktok.l1': '째깍! 나는 시간을 세는 펫이야.',
'intro.tiktok.l2': '내 스킬은 「타임 스톱」이야. {psec}초 동안 멈춘 시간에도 매치할 수 있어.',
'intro.churup.l1': '츄릅! 한 입에 한 줄, 자신 있어요.',
'intro.churup.l2': '내 스킬은 「크게 한 입」이에요. 한 줄을 통째로 다시 섞어요.',
'intro.kkultteok.l1': '꿀떡이예요. 달콤한 건 다 제 몫이죠.',
'intro.kkultteok.l2': '내 스킬은 「황금 소환」이에요. 황금 열매를 {pn}개 불러요.',
'intro.sseokssak.l1': '썩싹! 지저분한 판은 제가 싹 치워요.',
'intro.sseokssak.l2': '내 스킬은 「싹쓸이」예요. 남은 타일 {pn}칸을 한 번에 없애요.',
'intro.mukmul.l1': '먹물이야. 조용히, 그리고 확실하게.',
'intro.mukmul.l2': '내 스킬은 「잉크 물들이기」야. {pn}칸을 같은 숫자로 바꿔.',
'intro.banjjak.l1': '반짝! 번쩍이는 건 다 나한테 맡겨.',
'intro.banjjak.l2': '내 스킬은 「번쩍 충전」이야. 스킬 게이지를 {pn}% 채워 줘.',
'intro.bangul.l1': '방울이에요. 막힌 자리는 거품으로 풀어요.',
'intro.bangul.l2': '내 스킬은 「거품 파도」예요. 방해 타일 {pn}개를 씻어 내요.',
'skin.gem': '별 +1!',
'skin.base': '기본',
'skin.basedesc': '처음부터 함께한 모습',
'skin.royal': '로열 드레스',
'skin.royaldesc': '무도회 드레스와 반짝이는 눈',
'skin.bearcoral': '코랄 곰돌이',
'skin.bearcoraldesc': '따뜻한 산호빛 털',
'skin.bearrose': '로즈 곰돌이',
'skin.bearrosedesc': '은은한 장미빛 털',
'skin.bearlavender': '라벤더 곰돌이',
'skin.bearlavenderdesc': '보랏빛 라벤더 털',
'skin.bearmint': '민트 곰돌이',
'skin.bearmintdesc': '시원한 민트빛 털',
'skin.bearblue': '하늘 곰돌이',
'skin.bearbluedesc': '맑은 하늘빛 털',
'aria.charopen': '캐릭터 선택 열기',
'aria.prevchar': '이전 캐릭터',
'aria.prevpet': '이전 펫',
'aria.nextpet': '다음 펫',
'aria.nextchar': '다음 캐릭터',
'aria.close': '닫기',
'char.ten.title': '텐트윈 왕국의 첫째 왕자',
'char.ten.ult': '{sec}초 동안 모든 매치가 텐트윈 콤보로 이어지고, 텐 파워와 트윈 파워 보너스를 함께 받아요.',
'char.ten.tip': '합이 10인 짝이 많은 판에서 강해요.',
'char.twin.title': '텐트윈 왕국의 둘째 왕자',
'char.twin.ult': '{sec}초 동안 모든 매치가 텐트윈 콤보로 이어지고, 텐 파워와 트윈 파워 보너스를 함께 받아요.',
'char.twin.tip': '같은 숫자가 몰린 판에서 강해요.',
'char.jelly.title': '젤리팡 세상의 공주',
'char.jelly.ult': '{sec}초 동안 잭팟 확률에 {jp}%를 더해, 점수 {jm}배 매치가 훨씬 자주 터져요.',
'char.jelly.tip': '운에 걸고 크게 터뜨리고 싶을 때.',
'say.combo.ten': '좋아, 계속!',
'say.combo.twin': '더! 더!',
'say.combo.jelly': '탱글탱글!',
'say.jackpot.ten': '이런 행운이!',
'say.jackpot.twin': '우와, 대박!',
'say.jackpot.jelly': '젤리 잭팟!',
'say.mission.ten': '임무 완료!',
'say.mission.twin': '해냈다!',
'say.mission.jelly': '이 정도야 뭐!',
'say.tier.ten': '불이 붙었어!',
'say.tier.twin': '못 멈춰!',
'say.tier.jelly': '비켜 봐!',
'say.clear.ten': '한 걸음 더!',
'say.clear.twin': '형, 봤지?',
'say.clear.jelly': '내가 해냈지!',
'say.boss.ten': '지금이야!',
'say.boss.twin': '한 방 더!',
'say.boss.jelly': '받아라!',
'say.star.ten': '별을 얻었다!',
'say.star.twin': '별 챙겼다!',
'say.star.jelly': '반짝!',
'kd.castle': '성',
'aria.kdmenu': '마을 메뉴',   /* [116] 메인 v3 왼쪽 메뉴 판(#kd-menu) 이름 */
'kd.playground': '놀이터',
'kd.shop': '상점',
'kd.pethouse': '펫 하우스',
'kd.circus': '스토리 극장',
'kd.mission': '미션',
'kd.post': '우체국',
'pg.title': '놀이터',
'pg.classic': '클래식',
'pg.classic.d': '무한 모드·타임 러시·데일리',
'pg.arcade': '아케이드',
'pg.arcade.d': '타임어택·서바이벌·90초 누적',
'mode.title.arcade': '아케이드 대전',
'soon.title': '준비 중',
'soon.body': '공사 중이에요! 다음 업데이트를 기다려 주세요.',
'kd.visit': '어제의 내가 별 {n}개를 모아 뒀어요.',
'kd.visit.first': '젤리팡 왕국에 온 걸 환영해요!',
'kd.res.aria': '인사하기',
'portal.login': '로그인',
'portal.account': '계정',
'portal.watchad.heart': '광고 보고 하트 +1',
'portal.watchad.continue': '광고 보고 이어하기',
'portal.ad.fail': '지금은 광고를 볼 수 없어요. 잠시 뒤 다시 해 주세요.',
'aria.continue.ad': '광고 보고 이어하기'
}
};
function currentLang() {
if (store.lang === 'ko' || store.lang === 'en') return store.lang;
var nav = '';
try {
if (typeof navigator !== 'undefined' && navigator) {
nav = navigator.language ||
(navigator.languages && navigator.languages[0]) || '';
}
} catch (e) { nav = ''; }
nav = String(nav).toLowerCase();
if (nav.indexOf('ko') === 0) return 'ko';
if (nav) return 'en';
try {
if (typeof window !== 'undefined' &&
(window.GAME_DEFAULT_LANG === 'ko' || window.GAME_DEFAULT_LANG === 'en')) {
return window.GAME_DEFAULT_LANG;
}
} catch (e) { /* ignore */ }
return 'en';
}
function fmtSec(ms) { return String(Math.round((ms | 0) / 100) / 10); }
var SEC_KEY_RE = /^(?:char\.([A-Za-z0-9_]+)\.ult|skill\.on\.([A-Za-z0-9_]+)|intro\.([A-Za-z0-9_]+)\.l3|rec\.why\.([A-Za-z0-9_]+))$/;
function i18nDerived(name, key) {
if (name === 'jm') return String(JACKPOT_MULT);
if (name === 'jp') return String(Math.round(SKILL_JP_ADD * 100));
if (name === 'x') return String(SKILL_SODA_MULT);
if (name === 'awk') return fmtSec(AWAKEN_MS);
if (name === 'am') return String(AWAKEN_SCORE_MULT);
if (name === 'pu') return String(DUEL_PET_MAX);
if (name === 'pmax') return String(MK_PET_CAP);
if (name === 'mult' && /^(?:char|intro)\.kkultteok\./.test(String(key || ''))) return String(GOLD_MULT);   /* 꿀떡이 황금 배수(점검 C5) — adv.missionwin 의 {mult} 는 매개변수로 온다 */
if (name === 'psec' || name === 'pn') {
var pm = /^(?:char\.([a-z]+)\.pass|intro\.([a-z]+)\.l2|pet\.syn\.([a-z]+))$/.exec(String(key || ''));
var pv = pm ? petSkillVal(pm[1] || pm[2] || pm[3], name) : null;
return pv === null ? null : String(pv);
}
if (name !== 'sec') return null;
var m = SEC_KEY_RE.exec(String(key || ''));
var id = m ? (m[1] || m[2] || m[3] || m[4]) : '';
var ms = id ? SKILL_MS[id] : (key === 'howto.awaken' ? SKILL_MS[charId()] : 0);
return ms ? fmtSec(ms) : null;
}
function t(key, params) {
var dict = I18N[currentLang()] || I18N.en;
var isOne = !!params && (params.n === 1 || params.goal === 1);
var oneKey = isOne ? (key + '.one') : null;
var s = (oneKey && typeof dict[oneKey] === 'string') ? dict[oneKey] : dict[key];
if (typeof s !== 'string') {
s = (oneKey && typeof I18N.en[oneKey] === 'string') ? I18N.en[oneKey] : I18N.en[key];
}
if (typeof s !== 'string') return String(key);
s = s.replace(/\{(\w+)\}/g, function (m, name) {
if (params && Object.prototype.hasOwnProperty.call(params, name)) {
return String(params[name]);
}
var d = i18nDerived(name, key);
return (d === null) ? m : d;
});
return s;
}
function applyI18n(root) {
if (typeof document === 'undefined') return;
var scope = root || document;
if (!root) { try { document.documentElement.lang = currentLang(); } catch (e) { /* ignore */ } }
var i, list;
list = scope.querySelectorAll('[data-i18n]');
for (i = 0; i < list.length; i++) {
headText(list[i], t(list[i].getAttribute('data-i18n')));
}
list = scope.querySelectorAll('[data-i18n-html]');
for (i = 0; i < list.length; i++) {
list[i].innerHTML = t(list[i].getAttribute('data-i18n-html'));
}
list = scope.querySelectorAll('[data-i18n-aria]');
for (i = 0; i < list.length; i++) {
list[i].setAttribute('aria-label', t(list[i].getAttribute('data-i18n-aria')));
}
}
function setLang(lang) {
store.lang = (lang === 'ko') ? 'ko' : 'en';
persist();
applyI18n();
syncDynamicI18n();
syncMenu();
syncHud();
syncToggleLabels();
if ($('screen-kingdom')) kdSync();
var kv = $('kd-visit');
if (kv && !kv.hidden) {
kv.textContent = t(kv.dataset.first ? 'kd.visit.first' : 'kd.visit', { n: KD_VISIT_JSTAR });
}
J.sfx.ui();
}
function rebuildSkinsIfOpen() {
var el = $('modal-skin');
if (el && !el.hidden) buildSkinList();
}
function toggleLang() {
setLang(currentLang() === 'ko' ? 'en' : 'ko');
rebuildSkinsIfOpen();
}
function osPrefersLight() {
try {
return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches);
} catch (e) { return false; }
}
function effectiveTheme() {
return store.theme || (osPrefersLight() ? 'light' : 'dark');
}
function applyTheme() {
if (typeof document === 'undefined') return;
var el = document.documentElement;
if (!el) return;
if (store.theme === 'dark' || store.theme === 'light') el.setAttribute('data-theme', store.theme);
else el.removeAttribute('data-theme');
}
function toggleTheme() {
store.theme = (effectiveTheme() === 'light') ? 'dark' : 'light';
persist();
applyTheme();
syncToggleLabels();
J.sfx.ui();
}
var S = {
mode: 'endless', stage: 1, seed: 1,
cells: [],
score: 0, adds: 5, hints: 3, undoLeft: 1,
combo: 1, comboUntil: 0,
sel: -1, busy: false, running: false, paused: false,
matches: 0, maxCombo: 1,
startedAt: 0, elapsed: 0,
continueUsed: false,
adContinueUsed: false,   /* Task 12 rev1(I-7) — 광고 이어하기도 판당 1회 */
snapshot: null,
gridSeed: 1,
// --- v2 ---
addSeq: 0,               // Add counter — seeds deterministic bomb rolls
stageStartedAt: 0,       // per-stage clock, feeds the clear grade
stageMaxCombo: 1,        // per-stage best combo, feeds the clear grade
mission: null,           // {id, goal, prog, done} — endless only
gainPet: 0, gainStar: 0,
gainAwk: 0, gainGear: [],
dropTable: null,
gainGift: [], gainPets: [], giftLeft: 0,
hitTaken: false,
gainGem: 0,
gainJstar: 0,
gainCoin: 0, runCoin: 0, coinRunAt: 0,
x2Token: 0, x2Done: 0, x2Sheet: '',
feverOn: false, feverUntil: 0, feverScore: 0, feverCdUntil: 0,
rushEndAt: 0, addCdUntil: 0, rushBeatAt: 0,
pausedAt: 0,             // wall clock at pause, used to shift deadlines
howtoFromPause: false,   // (a) fix: How-to opened from the pause modal
// --- v3 ---
sprintTimes: [],         // match timestamps inside the `sprint` mission window
overInfo: null,          // frozen game-over figures; see paintOverModal()
rushStartedAt: 0,
// --- v4 ---
pairsLeft: 0,
shuffles: 0,             // shuffles left this stage
shuffleCount: 0,         // shuffles ALREADY spent — the ordinal the stream uses
pv: { hits: [], armed: false, stack: 0, seenTier: 0,
twLast: '', twAlt: 0, twSeen: 0 },
hurryDone: false,
hurryLift: 0,
advPlan: null,
advEndAt: 0,
advDigit: 0,
advCleared: 0,     // 이 판에서 지운 타일 총수 ('time' 목표의 계수)
advShuf: false,
tenCount: 0,
advHit: false,     // 목표를 이미 채웠다고 한 번 알렸는가 (토스트 중복 방지)
bangOn: false,
missionUntil: 0,
finishUntil: 0,
missionMult: 1,
skillKind: '',
skillUntil: 0,
cutOn: false,
cutAt: 0,
cutFn: null,
hurryOn: false,          // 허리 업 연출이 화면을 잡고 있는 동안 (겹침 순서용)
bossHp: 0,
bossHpMax: 0,
bossProg: 0,
bossFired: 0,
bossAtkAt: 0,
bossTellAt: 0,
bossAtkN: 0,
bossSeqIdx: 0,
bossDown: false,
bossArm: false,          // 공략 조건이 채워졌다 — 다음 안전한 순간에 필살기가 터진다
maskUntil: 0,
duel: null,
sprintWin: MISSION_SPRINT_MS
};
var tileEls = [];
var ts = 40;           // current tile size in px
var rafCombo = 0;
var rafFever = 0;
var resizeTimer = 0;
var resizeSettle = 0;
var timerInt = 0;
var rushInt = 0;
var advInt = 0;        // 모험 스테이지의 200ms 시계 (러시와 같은 손동작, 다른 소유자)
var audioUnlocked = false;
var howtoIdx = 0;
var tutCells = [];        // mini-board cells, own array — never S.cells
var tutEls = [];          // mini-board tile elements — never tileEls
var tutBox = null;        // the injected container div
var tutStep = 0;          // 0, 1, 2
var tutSel = -1;
var tutBusy = false;
var tutFailShown = false;
var tutDone = false;      // step 3 solved, waiting on the "Got it" button
var tutFromHowto = false;
var tutTextKey = 'tut.s1';// last key written into #tut-text, for re-translation
var TUT_VIS_COLS = 4;   // 화면에 그리는 열 수. 나머지 COLS-4 열(7열이면 3칸)은 죽은 패딩이다.
var TUT_BOARDS = [
[[8, 7, 4, 5], [1, 7]],
[[5, 7, 4, 2], [3, 2, 1]],
[[1, 3, 5, 6], [6, 2]]
];
function isClassic() {
return S.mode === 'classic' || S.mode === 'classic-rush' || S.mode === 'classic-daily';
}
function isRush() {
return S.mode === 'rush' || S.mode === 'classic-rush' || isArcadeDuel();
}
function isDaily() { return S.mode === 'daily' || S.mode === 'classic-daily'; }
function addsFree() { return isRush() || S.mode === 'classic-daily'; }
function addsCd() { return isRush(); }
var ARC_MODES = { 'arc-time': 1, 'arc-surv': 1, 'arc-dmg': 1 };
var ARC_LV = 5;              // 아케이드가 쓰는 고정 탄 번호(악당 스케일의 유일한 입력)
var ARC_TIME_HP_K = 3;       // 타임어택만 악당 HP ×3 — 한 판이 1~3분이 되게
var ARC_ATK_TIME_MS = 6000;  // 자동공격 1회분(atkMax)만큼 때리면 버는 시간
function isArcadeDuel() { return !!ARC_MODES[S.mode]; }
function arcLowerIsBetter(mode) { return mode === 'arc-time'; }
function bestKey() {
if (isArcadeDuel()) return 'bestArcade';
if (S.mode === 'classic-rush') return 'bestClassicRush';
if (S.mode === 'classic') return 'bestClassic';
return isRush() ? 'bestRush' : 'best';
}
function bestStageKey() { return isClassic() ? 'bestClassicStage' : 'bestStage'; }
function rankKeyOf() {
if (S.mode === 'adv') return '';
if (isArcadeDuel()) return '';
if (isClassic()) return S.mode;          // 'classic' / 'classic-rush' / 'classic-daily'
if (S.mode === 'rush') return 'rush';
if (S.mode === 'daily') return 'daily';
return 'endless';
}
function saveSlot() { return isClassic() ? 'saveClassic' : 'save'; }
function featuresOn() { return !isDaily() && !isClassic(); }
function addsExhausted() {
if (addsFree()) return false;
return S.adds <= 0;
}
var CHROME_H = 210;
function boardArea() {
var w = 0, h = 0;
var sc = $('board-scroll');
if (sc) {
w = sc.clientWidth;
h = sc.clientHeight;
try {
var cs = window.getComputedStyle(sc);
w -= (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
h -= (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
} catch (e) { /* ignore */ }
}
var vw = 0, vh = 0;
try {
if (typeof window !== 'undefined') {
vw = window.innerWidth || 0;
vh = window.innerHeight || 0;
}
} catch (e) { /* ignore */ }
if (!isFinite(w) || w <= 0) w = vw > 0 ? Math.max(200, vw - 8) : BOARD_MAX;
if (!isFinite(h) || h <= 0) h = vh > 0 ? Math.max(240, vh - CHROME_H) : BOARD_MAX;
return { w: w, h: h };
}
function boardMaxPx() {
var board = $('board');
if (board) {
try {
var cs = window.getComputedStyle(board);
var v = parseFloat(cs.getPropertyValue('--board-max'));
if (isFinite(v) && v > 0) return v;
var mw = parseFloat(cs.maxWidth);
if (isFinite(mw) && mw > 0) return mw;
} catch (e) { /* ignore */ }
}
return BOARD_MAX_FALLBACK;
}
function rowCount() { return Math.ceil(S.cells.length / COLS); }
var tsRowsMax = 0;
function layoutRowsReset() { tsRowsMax = 0; }
function layout() {
var board = $('board');
if (!board) return;
var area = boardArea();
var bmax = boardMaxPx();
if (bmax > 0 && area.w > bmax) area.w = bmax;
var rows = rowCount();
if (rows > tsRowsMax) tsRowsMax = rows;
var sizeRows = tsRowsMax;
var byW = Math.floor((area.w - GAP * (COLS - 1)) / COLS);
var byH = sizeRows > 0 ? Math.floor((area.h - GAP * (sizeRows - 1)) / sizeRows) : byW;
var next = Math.min(byW, byH);
if (!isFinite(next)) next = TILE_MIN;
next = clamp(next, TILE_MIN, TILE_MAX);
if (isFinite(byW) && byW > 0 && next > byW) next = byW;   // never overflow width
if (isFinite(byH) && byH > 0 && next > byH && battleOn() && battleStage()) next = byH;
if (next < 12) next = 12;
ts = next;
board.style.setProperty('--ts', ts + 'px');
board.style.setProperty('--gap', GAP + 'px');
var bw = COLS * ts + (COLS - 1) * GAP;
var bh = rows * ts + Math.max(0, rows - 1) * GAP;
board.style.width = bw + 'px';
board.style.height = bh + 'px';
// Vertical centring, but only while the board is shorter than its box — a
// taller board must still start at the top and scroll.
var slack = Math.floor((area.h - bh) / 2);
board.style.marginTop = (slack > 0 ? slack : 0) + 'px';
for (var i = 0; i < tileEls.length; i++) positionTile(tileEls[i], i);
}
function positionTile(el, i) {
if (!el) return;
var rc = idxToRC(i);
el.style.transform = 'translate3d(' + (rc.c * (ts + GAP)) + 'px,' +
(rc.r * (ts + GAP)) + 'px,0)';
}
function ensureTiles() {
var board = $('board');
if (!board) return;
while (tileEls.length < S.cells.length) {
var el = document.createElement('div');
el.className = 'tile';
el.appendChild(document.createElement('span'));
board.appendChild(el);
tileEls.push(el);
}
while (tileEls.length > S.cells.length) {
var gone = tileEls.pop();
if (gone && gone.parentNode) gone.parentNode.removeChild(gone);
}
}
function paintTile(i) {
var el = tileEls[i], c = S.cells[i];
if (!el || !c) return;
var v = String(c.v);
if (el.getAttribute('data-v') !== v) el.setAttribute('data-v', v);
var span = el.firstChild;
if (span) {
var txt = c.mask ? '?' : v;
var tn = span.firstChild;
if (tn) { if (tn.nodeValue !== txt) tn.nodeValue = txt; }
else span.textContent = txt;
}
if (el.getAttribute('data-i') !== String(i)) el.setAttribute('data-i', String(i));
setCls(el, 'dead', !!c.dead);
// Special-tile skin (contract §6). CSS owns every visual; we only label.
var sp = c.sp || '';
if (sp) {
if (el.getAttribute('data-sp') !== sp) el.setAttribute('data-sp', sp);
} else if (el.hasAttribute && el.hasAttribute('data-sp')) {
el.removeAttribute('data-sp');
}
setCls(el, 'iced1', sp === 'ice' && (c.ice | 0) >= 1);
var mk = c.mk || '';
if (mk) {
if (el.getAttribute('data-mk') !== mk) el.setAttribute('data-mk', mk);
var mt = (mk === 'gear') ? (c.mkTier || 'common') : '';
if ((el.getAttribute('data-mk-tier') || '') !== mt) { if (mt) el.setAttribute('data-mk-tier', mt); else el.removeAttribute('data-mk-tier'); }
if (mk === 'gear' && !c.dead) {
var fxEl = el.__mkFx || mkFxTake(el);
if (fxEl) {
if (fxEl.parentNode !== el) el.appendChild(fxEl);
if (fxEl.getAttribute('data-tier') !== mt) fxEl.setAttribute('data-tier', mt);
if (fxEl.__item !== c.mkItem) { fxEl.__item = c.mkItem; fxEl.__ico.style.setProperty('background-image', itemArtCss(c.mkItem, 64)); }
}
} else if (el.__mkFx) {
mkFxDrop(el);
}
} else if (el.hasAttribute && el.hasAttribute('data-mk')) {
el.removeAttribute('data-mk');
el.removeAttribute('data-mk-tier');
if (el.__mkFx) mkFxDrop(el);   /* 74 T11 — 표식이 지워진 칸도 빛 층을 풀에 돌려준다(보충 1: 떼기 두 경로) */
}
positionTile(el, i);
}
function renderAll() {
ensureTiles();
for (var i = 0; i < S.cells.length; i++) paintTile(i);
layout();
}
function tileColor(i) {
var el = tileEls[i];
if (el) {
try {
var v = window.getComputedStyle(el).getPropertyValue('--c');
if (v && v.trim()) return v.trim();
} catch (e) { /* ignore */ }
}
var c = S.cells[i];
return c ? PALETTE[(c.v - 1) % PALETTE.length] : '#ffffff';
}
function tileCenter(i) {
var el = tileEls[i];
if (el && el.getBoundingClientRect) {
var r = el.getBoundingClientRect();
return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}
return { x: 0, y: 0 };
}
function floatOnBoard(x, y, txt, color) {
var b = $('board');
if (b && b.getBoundingClientRect) {
var r = b.getBoundingClientRect();
if (r.width > 0 && r.height > 0) {
var pad = 10;
var top = r.top + pad, bot = r.bottom - pad;
if (top > bot) { top = bot = (r.top + r.bottom) / 2; }
y = y < top ? top : (y > bot ? bot : y);
var lft = r.left + pad, rgt = r.right - pad;
if (lft > rgt) { lft = rgt = (r.left + r.right) / 2; }
x = x < lft ? lft : (x > rgt ? rgt : x);
}
}
J.floatText(x, y, txt, color);
}
function showScreen(id) {
if (splashBooted) splashDismiss();
if (typeof document === 'undefined') return;
var list = document.querySelectorAll('.screen');
for (var i = 0; i < list.length; i++) {
list[i].classList.toggle('active', list[i].id === id);
}
syncLobbyBgmNight(isNightHour(new Date().getHours()));
if (audioUnlocked) J.bgm.scene(id === 'screen-game' ? 'game' : 'menu');
if (id !== 'screen-map') stopMapTicker();
}
var WIN_SEL = '.modal, #charpanel';
function winInert(el, on) { try { if ('inert' in el) el.inert = !!on; } catch (e) { /* 옛 엔진: 숨김만 */ } }
function winLift(el) { if (el && el.hasAttribute('data-under')) { el.removeAttribute('data-under'); winInert(el, false); } }
function winShow(el, keep) {
if (!el) return;
var fresh = el.hidden || el.hasAttribute('data-under');
el.hidden = false;
winLift(el);
if (fresh && el.id) {
var ws = document.querySelectorAll(WIN_SEL);
for (var i = 0; i < ws.length; i++) {
var w = ws[i];
if (w === el || w === keep || w.hidden || w.hasAttribute('data-under')) continue;
w.setAttribute('data-under', el.id);
winInert(w, true);
}
}
gearRoomInert();
}
function winHide(el) {
if (!el) return;
el.hidden = true;
winLift(el);
if (el.id) {
var ws = document.querySelectorAll('[data-under="' + el.id + '"]');
for (var i = 0; i < ws.length; i++) winLift(ws[i]);
}
gearRoomInert();
}
function winReset() {
var ws = document.querySelectorAll('[data-under]');
for (var i = 0; i < ws.length; i++) winLift(ws[i]);
gearRoomInert();
}
function openModal(id) { var m = $(id); if (m) { winShow(m); healHeads(m); mfFitFoots(m); } }
function mfFitFoots(root) {
if (!root || !root.querySelectorAll || typeof window === 'undefined' || !window.matchMedia) return;
var land = window.matchMedia('(min-aspect-ratio: 1/1)').matches;
var fs = root.querySelectorAll('.mf-foot[data-fit]');
for (var i = 0; i < fs.length; i++) {
var f = fs[i];
f.removeAttribute('data-row');
if (!land || !f.offsetWidth) continue;
f.setAttribute('data-row', '');
var bs = f.querySelectorAll('.mf-btn'), over = false;
for (var j = 0; j < bs.length && !over; j++) {
if (bs[j].hidden || !bs[j].offsetWidth) continue;
over = bs[j].scrollWidth > bs[j].clientWidth + 1 || bs[j].scrollHeight > bs[j].clientHeight + 1;
}
if (over) f.removeAttribute('data-row');
}
resFit(root.classList && root.classList.contains('modal') ? root : null);
}
function resFit(root) {
if (typeof document === 'undefined') return;
var ms = root ? [root] : Array.prototype.slice.call(document.querySelectorAll('.modal:not([hidden]) .share-thumb')).map(function (t) { return t.closest('.modal'); });
for (var i = 0; i < ms.length; i++) {
var m = ms[i], thumb = m && m.querySelector ? m.querySelector('.share-thumb') : null;
var foot = m && m.querySelector ? m.querySelector('.sheet > .mf-foot:not(.coin-x2)') : null;   /* 포털 2배 줄(.coin-x2.mf-foot — 모험 창은 판 바로 아래 자식)은 단추 줄이 아니다 */
if (!thumb || !foot) continue;
thumb.style.removeProperty('--res-thumb-w');                 /* 기본 폭에서 다시 잰다(창이 커지면 되돌아온다) */
if (thumb.hidden || !thumb.offsetWidth || !foot.offsetWidth) continue;
var over = thumb.getBoundingClientRect().bottom + parseFloat(getComputedStyle(thumb).marginBottom || '0') - foot.getBoundingClientRect().top;
var body = thumb.closest('.res-body');
if (body && getComputedStyle(body).display !== 'contents') over = Math.max(over, body.scrollHeight - body.clientHeight);
if (!(over > 0.5)) continue;
var r = thumb.getBoundingClientRect(), w = parseFloat(getComputedStyle(thumb).width) || r.width;
var nw = Math.max(w * .7, w - over * (1080 / 1350) - 1);      /* 안쪽 상자 비 1080:1350 — 높이 1px 줄이면 폭 .8px */
thumb.style.setProperty('--res-thumb-w', nw.toFixed(1) + 'px');
}
}
function closeModal(id) { winHide($(id)); }
function closeAllModals() {
tutFxRaise(false);
['modal-howto', 'modal-tutorial', 'modal-pause', 'modal-clear', 'modal-over', 'modal-daily',
'modal-rank',
'modal-quest',
'modal-soon',
'modal-playground',
'modal-theater',
// v4 4차-a — 모험의 두 시트도 여기 목록에 있어야 지도/메뉴로 나갈 때 남지 않는다.
'modal-node', 'modal-adv',
'modal-drops',
'modal-classic',
'modal-arc',
'modal-confirm',
'modal-gear-info', 'modal-gear']
.forEach(closeModal);
winReset();   /* [판정판 121 · Task 5] 목록 밖 창(캐릭창 · 설정 · 스킨 · 보석 창)에 남은 깔림 표식까지 걷는다 · [Task 8b2 F5] 끝에서 방 inert 도 다시 센다 */
gearInfoId = '';
dropsN = 0;   /* 획득표가 위 목록에서 걷혔다 — 열린 탄 표식도 함께 0(closeDrops 를 안 거치는 길) */
}
var confirmPending = null;
function confirmBox(msg, onYes) {
var m = $('modal-confirm'), p = $('cf-msg');
if (!m || !p) {
if (typeof window !== 'undefined' && window.confirm && window.confirm(msg) && onYes) onYes();
return;
}
confirmPending = (typeof onYes === 'function') ? onYes : null;
p.textContent = htmlPlain(msg);
openModal('modal-confirm');
var y = $('cf-yes');
if (y && y.focus) { try { y.focus(); } catch (e) { /* 포커스는 장식이다 */ } }
}
function closeConfirm() {
confirmPending = null;
closeModal('modal-confirm');
}
function htmlPlain(s) {
return String(s == null ? '' : s).replace(/<[^>]*>/g, '');
}
function howtoOnce(flag, key, needFeatures) {
if (!store.seenHowto) store.seenHowto = {};
if (store.seenHowto[flag]) return false;
if (needFeatures && !featuresOn()) return false;
store.seenHowto[flag] = 1;
persist();
toast(htmlPlain(t(key)));
return true;
}
function tipOnce(flag, key) {
if (!store.tipsSeen) store.tipsSeen = {};
if (store.tipsSeen[flag]) return false;
store.tipsSeen[flag] = 1;
persist();
toast(htmlPlain(t(key)));
return true;
}
function fullCue(btnId) {
var el = $(btnId);
if (!el || !el.classList) return false;
if (el.cueT) { clearTimeout(el.cueT); el.cueT = 0; }
el.classList.remove('fullcue');
void el.offsetWidth;
el.classList.add('fullcue');
el.cueT = setTimeout(function () {
el.cueT = 0;
el.classList.remove('fullcue');
}, Math.round(fullCueMs()));
return true;
}
var fullCueCache = 0;
function fullCueMs() {
if (fullCueCache) return fullCueCache;
var v = 0;
try {
var raw = window.getComputedStyle(document.documentElement)
.getPropertyValue('--mo-full-cue');
v = parseFloat(raw);
if (isFinite(v) && v > 0 && String(raw).indexOf('ms') < 0) v *= 1000;
} catch (e) { v = 0; }
fullCueCache = (isFinite(v) && v > 0) ? v : 1000;   /* 토큰을 못 읽을 때의 안전값 */
return fullCueCache;
}
var TOAST_MS = 1700;                    /* 한 줄(종전 값) */
var TOAST_MS_MAX = 5000;                /* 두 줄 이상의 상한 */
var TOAST_CPS = { ko: 12, en: 20 };     /* 초당 읽는 글자 수 */
var toastTimer = 0, toastAt = 0, toastText = '', toastLines = 1, toastRO = null, toastRange = null;
function toastMs(msg, lines) {
if (lines < 2) return TOAST_MS;
var cps = TOAST_CPS[currentLang()] || TOAST_CPS.en;
return Math.min(TOAST_MS_MAX, Math.max(TOAST_MS, Math.round(String(msg).length * 1000 / cps)));
}
function toastHide() {
var t = $('toast');
if (t) t.classList.remove('show');
}
function toastResized() {
var t = $('toast');
if (!t || !t.firstChild || !toastRange) return;
toastRange.selectNodeContents(t);
var rs = toastRange.getClientRects(), n = 0, top = null, i;
for (i = 0; i < rs.length; i++) {
if (top === null || Math.abs(rs[i].top - top) > 1) { n++; top = rs[i].top; }
}
if (!n || n === toastLines) return;
toastLines = n;
clearTimeout(toastTimer);
toastTimer = setTimeout(toastHide, Math.max(0, toastMs(toastText, toastLines) - (now() - toastAt)));
}
function toast(msg) {
var t = $('toast');
if (!t) return;
clearTimeout(toastTimer);
t.textContent = msg;
t.classList.add('show');
toastText = String(msg);
toastAt = now();
if (!toastRO && typeof ResizeObserver === 'function' && typeof document !== 'undefined' && document.createRange) {
toastRange = document.createRange();
toastRO = new ResizeObserver(toastResized);
toastRO.observe(t);
}
toastTimer = setTimeout(toastHide, toastMs(toastText, toastLines));
}
function badgePop(id) {
var el = $(id);
if (!el) return;
el.classList.remove('badge-pop');
void el.offsetWidth; // restart the animation
el.classList.add('badge-pop');
}
function dailyDoneToday() {
return !!(store.dailyBest && store.dailyBest.date === todayKey());
}
function dailyBestNow() {
return (S.mode === 'classic-daily') ? store.classicDailyBest : store.dailyBest;
}
function classicDailyDoneToday() {
return !!(store.classicDailyBest && store.classicDailyBest.date === todayKey());
}
function recountMoves() {
var prev = S.pairsLeft;
S.pairsLeft = countPairsEx(S.cells);
paintMoves(prev !== S.pairsLeft);
}
function setCls(el, name, on) {
if (!el || !el.classList) return;
on = !!on;
if (el.classList.contains(name) !== on) { if (on) el.classList.add(name); else el.classList.remove(name); }
}
function paintMoves(pulse) {
setText('moves-val', S.pairsLeft);
var box = $('stat-moves');
setCls(box, 'low', S.pairsLeft <= MOVES_LOW);
if (!pulse) return;
var v = $('moves-val');
if (!v || !v.classList) return;
v.classList.remove('tick');
void v.offsetWidth;                      // restart the CSS animation
v.classList.add('tick');
later(function () { if (v && v.classList) v.classList.remove('tick'); }, 320);
}
function syncClassicSkin() {
var app = $('app');
setCls(app, 'classic', isClassic());
}
var chRunAt = 0, chP0 = 0;
function syncClassicHud() {
var box = $('classic-hud');
if (!box) return;
var live = isClassic() && S.running;
if (box.hidden !== !live) box.hidden = !live;
if (!live) {
var chL0 = $('ch-l');
setCls(chL0, 'low', false);
return;
}
var chBaby = $('ch-baby');
if (chBaby && chBaby.style) {
var pf = stdArt(mateId(), 'face');
chBaby.style.setProperty('--char-thumb', pf || 'url("catalog/duel-cloud-baby.webp")');
}
var timed = isRush() || isDaily();
var sec = isRush() ? Math.ceil(rushLeftMs() / 1000)
: Math.floor((Date.now() - S.startedAt) / 1000);
var capTxt = timed ? fmtTime(Math.max(0, sec)) : String(S.score);
duelTimerGlyphs($('ch-cap-v'), capTxt);
var m = S.mission;
var mLive = !!m && missionsOn();
setText('ch-l-v', mLive
? (m.prog + '/' + (m.id === 'col' ? 1 : m.goal))
: String(S.pairsLeft));
setText('ch-r-v', timed ? String(S.score) : String(store[bestKey()] || 0));
var chL = $('ch-l'), chR = $('ch-r');
setKey(chL, mLive ? t('mission.label') : t('hud.moves'));
if (chL && chL.classList) {
chL.classList.toggle('low', !mLive && Number(S.pairsLeft) <= MOVES_LOW);
}
setKey(chR, timed ? t('hud.score') : t('hud.best'));
var best = Number(store[bestKey()] || 0);
var pl = Number(S.pairsLeft) || 0;
if (chRunAt !== S.startedAt) { chRunAt = S.startedAt; chP0 = pl; }
if (pl > chP0) chP0 = pl;
var cleared = chP0 > 0 ? (chP0 - pl) / chP0 : 0;
var lp = mLive
? (m.id === 'col' ? Math.min(1, m.prog) : (m.goal > 0 ? m.prog / m.goal : 0))
: cleared;
var cp = timed
? (isRush() ? Math.max(0, rushLeftMs()) / RUSH_MS : cleared)
: cleared;
var rp = best > 0 ? S.score / best : 0;
setBarPct('ch-tl', lp);
setBarPct('ch-tc', cp);
setBarPct('ch-tr', rp);
}
var playHeroKey = '';
function playHeroSync() {
var cid = charId();
var nm = t('char.' + cid + '.name');     /* 언어를 바꾸면(setLang → syncHud) 이름도 바뀌어야 해서 열쇠에 넣는다 */
if (cid + '|' + nm === playHeroKey) return;
playHeroKey = cid + '|' + nm;
var av = $('play-hero-av');
if (av && av.style) {
var full = stdArt(cid, 'full');
if (full) av.style.setProperty('--me-full', full);
else av.style.removeProperty('--me-full');
}
setText('play-hero-name', nm);
}
function setKey(el, txt) {
if (!el || el.getAttribute('data-k') === txt) return;
el.setAttribute('data-k', txt);
}
function setBarPct(id, ratio) {
var box = $(id);
if (!box) return;
var fill = box.firstChild;
if (!fill || !fill.style) return;
var pct = Math.round(Math.max(0, Math.min(1, ratio || 0)) * 1000) / 10;
var next = pct + '%';
if (fill.getAttribute('data-p') === next) return;
fill.style.setProperty('--p', (pct / 100).toFixed(3));
fill.setAttribute('data-p', next);
}
function syncHud() {
syncClassicSkin();
syncClassicHud();
if (!battleOn()) playHeroSync();   /* [판정판 130] 판 화면 PC 캐릭터 카드(전투 밖 갈래 전부 — 바뀔 때만 쓴다) */
setText('stage-val', isDaily() ? ('#' + dailyNumber()) : S.stage);
var ss = $('stat-stage');
if (ss) {
if (ss.hidden !== isRush()) ss.hidden = isRush();
var sk = ss.querySelector ? ss.querySelector('.stat-k') : null;
var skv = isDaily() ? t('hud.daily') : t('hud.stage');
if (sk && sk.textContent !== skv) sk.textContent = skv;
if (ss.getAttribute('aria-label') !== skv) ss.setAttribute('aria-label', skv);
setCls(ss, 'is-daily', isDaily());
}
setText('score-val', S.score);
var bestShown;
if (S.mode === 'daily') bestShown = dailyDoneToday() ? store.dailyBest.score : 0;
else if (S.mode === 'classic-daily') {
bestShown = classicDailyDoneToday() ? store.classicDailyBest.score : 0;
} else bestShown = store[bestKey()];
setText('best-val', bestShown);
setText('hint-badge', S.hints);
setText('undo-badge', S.undoLeft);
setText('shuffle-badge', S.shuffles);
paintMoves(false);
var free = addsFree();
var cd = addsCd() ? Math.max(0, Math.ceil((S.addCdUntil - now()) / 1000)) : 0;
var cdShown = (isClassic() && S.pairsLeft === 0) ? 0 : cd;
setText('add-badge', free ? (cdShown > 0 ? cdShown : t('act.addfree')) : S.adds);
var ba = $('btn-add'), bh = $('btn-hint'), bu = $('btn-undo'), bsh = $('btn-shuffle');
if (ba) {
ba.classList.toggle('off', free ? cdShown > 0 : S.adds <= 0);
ba.classList.toggle('urge', S.running && !battleOn() && S.pairsLeft === 0
&& (free ? cdShown <= 0 : S.adds > 0));
}
if (bh) bh.classList.toggle('off', S.hints <= 0);
if (bu) bu.classList.toggle('off', S.undoLeft <= 0 || !S.snapshot);
if (bsh) {
bsh.classList.toggle('off', S.shuffles <= 0);
bsh.classList.toggle('urge', S.running && S.shuffles > 0 && S.pairsLeft === 0);
}
if (battleOn()) { syncBattleActs(ba, bh, bu, bsh); actBattleLabels = true; }
else if (actBattleLabels) {
resetActLabel(ba); resetActLabel(bh); resetActLabel(bu); resetActLabel(bsh);
if (ba) ba.classList.remove('urge');
if (bh) bh.classList.remove('urge');
if (bu) bu.classList.remove('urge');
actBattleLabels = false;
}
var st = $('stat-timer');
if (st && st.hidden !== !isDaily()) st.hidden = !isDaily();
syncMission();
syncRushHud();
}
function syncDynamicI18n() {
try { syncPetInfo(); syncSidePanes(); fitAllDesc(); } catch (e) { /* 부팅 전 */ }
var msh = $('modal-mode');
if (msh && !msh.hidden) syncModeSheet();
// W7.5 — 클래식 허브의 배지도 같은 규약으로 다시 그린다.
var csh = $('modal-classic');
if (csh && !csh.hidden) syncClassicSheet();
var mb = $('menu-best');
if (mb) {
// One line, two records: endless best + Time Rush best (contract §6).
var parts = [];
if (store.best > 0) {
parts.push(t('menu.best', { score: store.best, stage: store.bestStage }));
}
if (store.bestRush > 0) parts.push(t('menu.bestrush', { score: store.bestRush }));
if (store.bestClassic > 0) {
parts.push(t('menu.bestclassic', { score: store.bestClassic }));
}
parts.push(dailyDoneToday() ? t('menu.dailydone') : t('menu.dailytodo'));
mb.textContent = parts.join(' · ');
}
// The How-to's Next button doubles as the tutorial entry on the last panel,
// so its label is state-dependent and must be re-derived after a re-translate.
setHowto(howtoIdx);
var tm = $('modal-tutorial');
if (tm && !tm.hidden) {
tutSetText(tutDone ? 'tut.done' : tutTextKey);
tutSyncSkip();
}
syncTwChip();
var ct = $('clear-title');
if (ct) headText(ct, t('clear.title', { stage: S.stage }));
var cm = $('modal-clear');
if (cm && !cm.hidden) paintNextPreview();
var d = dailyBestNow();   // W7.5 — 열려 있는 시트가 말하고 있는 그 판
if (d) {
setText('daily-title', t('daily.title', { n: d.n }));
setText('daily-stats', dailyStatsLine(d));
paintDailyRankLine();
}
var rkm = $('modal-rank');
if (rkm && !rkm.hidden) buildRankList();
// applyI18n() has just reset over-title / over-best-label from their markup
// keys, which are the ENDLESS wording; restore the mode-correct text.
paintOverModal();
var mp = $('screen-map');
if (mp && mp.classList && mp.classList.contains('active')) buildMap();
var nd = $('modal-node');
if (nd && !nd.hidden && advCardN) openNodeCard(advCardN);
var pm2 = $('pz-menu');
if (pm2 && S.mode === 'adv') pm2.textContent = t('adv.leave');
syncCharSummary();
cpShow(cpIdx);
cx2Refit();   /* [Task 8d 덧붙임 D] 2배 줄이 열린 채 언어를 바꾸면 글 폭이 달라진다 — 나란히/쌓기를 다시 잰다 */
}
function dailyStatsLine(d) {
var s = t('daily.stats', {
time: fmtTime(d.timeSec), matches: d.matches,
combo: d.maxCombo, score: d.score
});
if (d.grade) s += ' · ' + t('daily.grade', { grade: d.grade });
return s;
}
var DAY_FROM = 6, DAY_TO = 18;
function isNightHour(h) { return !(h >= DAY_FROM && h < DAY_TO); }
function menuIsActive() {
var m = $('screen-menu');
return !!(m && m.classList && m.classList.contains('active'));
}
function syncLobbyBgmNight(night) {
J.bgm.setNight(!!night && menuIsActive());
}
function applyDayNight() {
var night = isNightHour(new Date().getHours());
var m = $('screen-menu');
if (m) m.classList.toggle('is-night', night);
syncLobbyBgmNight(night);
}
function applyLogoArt() {
if (typeof getComputedStyle !== 'function' || !document.documentElement) return;
var v = '';
try {
v = getComputedStyle(document.documentElement).getPropertyValue('--art-logo') || '';
} catch (e) { v = ''; }
v = String(v).trim();
if (!v || v === 'none') document.documentElement.classList.add('no-art-logo');
}
var logoArtChecked = false;
function syncMenu() {
applyDayNight();   // v4 7차: 메뉴를 맞추는 그 순간의 시각으로 낮/밤을 정한다
if (!logoArtChecked) { logoArtChecked = true; applyLogoArt(); }
var sb = $('streak-badge');
if (sb) {
var txt = store.streak > 0 ? ('🔥' + store.streak) : '';
if (dailyDoneToday()) txt = txt ? (txt + ' ✅') : '✅';
sb.textContent = txt;
}
setText('hero-streak-v', store.streak);
setText('hero-best-v', store.bestStage);
var rb = $('rush-badge');
if (rb) rb.hidden = !!store.rushSeen;
syncCharPick();     // v3: 카드 3장의 선택 상태 (aria-checked 가 곧 표시다)
applyCharSkin();
var cpEl = $('charpanel');
if (!cpEl || cpEl.hidden) cpShow(Math.max(0, HERO_IDS.indexOf(charId())));
syncDynamicI18n();
syncToggleLabels();
}
function syncToggleLabels() {
var bs = $('btn-sound'), bv = $('btn-vibe'), bl = $('btn-lang');
// 아이콘은 이제 인라인 SVG 스프라이트다. textContent를 쓰면 <svg>가 통째로 날아가
// 버튼이 빈 원이 되므로, <use>의 href만 갈아끼운다.
setIcon(bs, store.sound ? 'sound' : 'sound-off');
setIcon(bv, store.vibrate ? 'vibe' : 'vibe-off');
if (bs) bs.classList.toggle('off', !store.sound);
if (bv) bv.classList.toggle('off', !store.vibrate);
if (bl) bl.textContent = t('lang.short');
var dark = effectiveTheme() !== 'light';
var bt = $('btn-theme'), pt = $('pz-theme');
if (bt) { bt.textContent = dark ? '◑' : '◐'; bt.classList.toggle('off', !dark); }
var ps = $('pz-sound'), pv = $('pz-vibe'), pl = $('pz-lang');
if (pt) pt.textContent = dark ? t('settings.theme.dark') : t('settings.theme.light');
if (ps) {
ps.textContent = store.sound ? t('settings.on') : t('settings.off');
ps.setAttribute('aria-pressed', store.sound ? 'true' : 'false');
}
if (pv) {
pv.textContent = store.vibrate ? t('settings.on') : t('settings.off');
pv.setAttribute('aria-pressed', store.vibrate ? 'true' : 'false');
}
if (pl) pl.textContent = t('settings.lang.v');
var ss = $('st-sound'), sv2 = $('st-vibe'), stt = $('st-theme'), sl = $('st-lang');
if (ss) {
ss.textContent = store.sound ? t('settings.on') : t('settings.off');
ss.setAttribute('aria-pressed', store.sound ? 'true' : 'false');
}
if (sv2) {
sv2.textContent = store.vibrate ? t('settings.on') : t('settings.off');
sv2.setAttribute('aria-pressed', store.vibrate ? 'true' : 'false');
}
if (stt) stt.textContent = dark ? t('settings.theme.dark') : t('settings.theme.light');
if (sl) sl.textContent = t('settings.lang.v');
}
function comboColor(level) {
return COMBO_COLORS[clamp(level - 1, 0, COMBO_COLORS.length - 1)];
}
function comboPraise(level) {
var i = level >= 8 ? 5 : (level >= 7 ? 4 : (level >= 5 ? 3 : (level >= 4 ? 2 : 1)));
return t('combo.' + i);
}
function stopComboLoop() {
if (rafCombo) { cancelAnimationFrame(rafCombo); rafCombo = 0; }
}
function comboLoop() {
rafCombo = 0;
var fill = $('combo-fill'), label = $('combo-label');
if (S.combo <= 1) {
if (fill) fill.style.setProperty('--p', '0');
if (label) label.textContent = '';
return;
}
var left = S.comboUntil - now();
if (left <= 0) {
var prevC = S.combo;
S.combo = 1;
if (fill) fill.style.setProperty('--p', '0');
if (label) { label.textContent = ''; label.style.color = ''; }
syncBgmIntensity();   // the chain died: drop the combo lift back out of the mix
if (battleOn() && prevC > 1) foeDriver.onBreak();
return;
}
if (fill) fill.style.setProperty('--p', clamp(left / COMBO_MS, 0, 1).toFixed(3));
rafCombo = requestAnimationFrame(comboLoop);
}
function bumpCombo() {
var t = now();
var prev = S.combo;
if (S.combo > 1 && t < S.comboUntil) S.combo = Math.min(COMBO_MAX, S.combo + 1);
else if (S.combo === 1 && t < S.comboUntil) S.combo = 2;
else {
S.combo = 1;
if (battleOn() && prev > 1) foeDriver.onBreak();
}
S.comboUntil = t + COMBO_MS;
if (S.combo > S.maxCombo) S.maxCombo = S.combo;
if (S.combo > S.stageMaxCombo) S.stageMaxCombo = S.combo;
if (S.combo > (store.comboMax | 0)) store.comboMax = S.combo;
dqBump('combo', S.combo, true);
// "Reach a x5 combo" — an unbroken chain, which is exactly what S.combo is.
if (S.combo >= MISSION_COMBO) missionBump('combo5', 1);
var label = $('combo-label');
if (label) {
if (S.combo > 1) {
label.textContent = 'x' + S.combo;
label.style.color = comboColor(S.combo);
label.classList.remove('pulse');
void label.offsetWidth;
label.classList.add('pulse');
} else {
label.textContent = '';
}
}
stopComboLoop();
if (S.combo > 1) rafCombo = requestAnimationFrame(comboLoop);
return S.combo > prev && S.combo > 1;
}
var MASCOT_CLASSES = ['ms-c1', 'ms-c2', 'ms-c3', 'ms-fever', 'ms-sad', 'ms-jelly'];
var MASCOT_MS = { 1: 500, 2: 660, 3: 860 };   // must clear the CSS keyframe lengths
var MASCOT_JELLY_MS = 720;                    // ms-jellypop 키프레임(.68s)보다 길게
var mascotTimer = 0;
var mascotHeld  = '';    // 'ms-fever' | 'ms-sad' | ''
function mascotClear() {
if (mascotTimer) { clearTimeout(mascotTimer); mascotTimer = 0; }
}
function mascotApply(cls) {
var el = $('mascot');
if (!el || !el.classList) return;
for (var i = 0; i < MASCOT_CLASSES.length; i++) el.classList.remove(MASCOT_CLASSES[i]);
if (cls) {
void el.offsetWidth;
el.classList.add(cls);
}
}
function mascotCheer(level) {
if (level < 3 || mascotHeld === 'ms-sad') return;
var tier = level >= 7 ? 3 : (level >= 5 ? 2 : 1);
J.sfx.cheer(tier);
mascotBeat(tier);
}
function mascotBeat(tier) {
if (mascotHeld === 'ms-sad') return;
if (mascotHeld === 'ms-fever') return;   // already dancing; do not restart it
mascotClear();
mascotApply('ms-c' + tier);
mascotTimer = setTimeout(function () {
mascotTimer = 0;
mascotApply(mascotHeld);
}, MASCOT_MS[tier]);
}
function mascotJelly() {
if (mascotHeld === 'ms-sad') return;      // 끝난 판은 끝난 채로 둔다
mascotClear();
mascotApply('ms-jelly');
mascotTimer = setTimeout(function () {
mascotTimer = 0;
mascotApply(mascotHeld);                // 피버 중이었으면 피버 춤으로 돌아간다
}, MASCOT_JELLY_MS);
}
function mascotFever(on) {
if (mascotHeld === 'ms-sad') return;     // a finished run stays finished
mascotClear();
mascotHeld = on ? 'ms-fever' : '';
mascotApply(mascotHeld);
}
function mascotSad() {
mascotClear();
mascotHeld = 'ms-sad';
mascotApply('ms-sad');
J.sfx.cheer(0);
}
function mascotReset() {
mascotClear();
mascotHeld = '';
mascotApply('');
}
var HERO_IDS = ['ten', 'twin', 'jelly', 'pudding', 'sodawitch'];
var MATE_IDS = ['ppyak', 'mungchi', 'mongle', 'churup',
'mukmul', 'tiktok', 'kkultteok', 'bangul',
'sseokssak', 'banjjak'];
var CHAR_DEFAULT = 'ten';
var CHARS = {
ten:     { cls: 'ch-ten',     key: '#3E8BF0' },
twin:    { cls: 'ch-twin',    key: '#FF6B3D' },
jelly:   { cls: 'ch-jelly',   key: '#D9714B' },
ppyak:   { cls: 'ch-ppyak',   key: '#E8A600' },
mungchi: { cls: 'ch-mungchi', key: '#F5479E' },
pudding:   { cls: 'ch-pudding',   key: '#E8B84B' },
sodawitch: { cls: 'ch-sodawitch', key: '#7FD4F0' },
mongle:    { cls: 'ch-mongle',    key: '#A8C8F0' },
churup:    { cls: 'ch-churup',    key: '#7ED9C0' },
mukmul:    { cls: 'ch-mukmul',    key: '#5B4B9E' },
tiktok:    { cls: 'ch-tiktok',    key: '#F3E3C0' },
kkultteok: { cls: 'ch-kkultteok', key: '#F2B822' },
bangul:    { cls: 'ch-bangul',    key: '#7EC8F0' },
sseokssak: { cls: 'ch-sseokssak', key: '#A0E85B' },
banjjak:   { cls: 'ch-banjjak',   key: '#B98CFF' }
};
var CHAR_CLASSES = ['ch-ten', 'ch-twin', 'ch-jelly', 'ch-ppyak', 'ch-mungchi',
'ch-pudding', 'ch-sodawitch', 'ch-mongle', 'ch-churup',
'ch-mukmul', 'ch-tiktok', 'ch-kkultteok', 'ch-bangul',
'ch-sseokssak', 'ch-banjjak'];
var HERO_STATS = {
ten:        { pwr: 75, std: 45, agi: 45, luk: 35 },
twin:       { pwr: 45, std: 40, agi: 80, luk: 35 },
jelly:      { pwr: 45, std: 40, agi: 40, luk: 75 },
pudding:    { pwr: 40, std: 85, agi: 40, luk: 35 },
sodawitch:  { pwr: 65, std: 25, agi: 75, luk: 35 },
macaron:    { pwr: 40, std: 30, agi: 65, luk: 65 },
waffle:     { pwr: 60, std: 60, agi: 45, luk: 35 },
mintspirit: { pwr: 35, std: 50, agi: 70, luk: 45 },
caramel:    { pwr: 70, std: 30, agi: 40, luk: 60 },
starfairy:  { pwr: 45, std: 45, agi: 55, luk: 55 }
};
var HERO_DEFS = {
ten:        { codex: 'C01', grade: 1, playable: true },
twin:       { codex: 'C02', grade: 1, playable: true },
jelly:      { codex: 'C03', grade: 2, playable: true },
pudding:    { codex: 'C04', grade: 1, playable: true },
sodawitch:  { codex: 'C05', grade: 3, playable: true },
macaron:    { codex: 'C06', grade: 2, playable: false,
pass: '매치마다 5% 확률로 파편 +1',
ult:  '5초간 획득 자원(점수·파편·게이지) 2배',
unlock: '누적 파편 200' },
waffle:     { codex: 'C07', grade: 2, playable: false,
pass: '블로커·잠금 타일 생성 -30%',
ult:  '판의 방해물을 전부 제거하고 그 수만큼 점수',
unlock: '30탄 클리어' },
mintspirit: { codex: 'C08', grade: 3, playable: false,
pass: '제한시간 -10% 로 시작, 매치마다 얻는 시간 +50%',
ult:  '5초 완전 정지',
unlock: '40탄 보스 격파' },
caramel:    { codex: 'C09', grade: 3, playable: false,
pass: '매치 점수가 x0.5 ~ x2.5 사이에서 무작위',
ult:  '50% 확률로 보스 HP 25% 삭감 / 50% 확률로 자신이 30 피해',
unlock: '50탄 초코 대왕 조우' },
starfairy:  { codex: 'C10', grade: 2, playable: false,
pass: '각성 게이지 적립 +35%',
ult:  '각성 즉시 발동 + 지속시간 +50%',
unlock: '누적 별 100' }
};
var PET_STATS = {
ppyak:     { codex: 'P01', pwr: 2, std: 2, agi: 8, luk: 2, axis: 'link' },
mungchi:   { codex: 'P02', pwr: 2, std: 8, agi: 2, luk: 2, axis: 'time' },
bangul:    { codex: 'P03', pwr: 2, std: 2, agi: 2, luk: 8, axis: 'cleanse' },
mongle:    { codex: 'P04', pwr: 8, std: 2, agi: 2, luk: 2, axis: 'time' },
churup:    { codex: 'P05', pwr: 2, std: 8, agi: 2, luk: 2, axis: 'layout' },
tiktok:    { codex: 'P06', pwr: 2, std: 2, agi: 8, luk: 2, axis: 'time' },
mukmul:    { codex: 'P07', pwr: 8, std: 2, agi: 2, luk: 2, axis: 'value' },
kkultteok: { codex: 'P08', pwr: 2, std: 4, agi: 2, luk: 6, axis: 'count' },
sseokssak: { codex: 'P09', pwr: 4, std: 2, agi: 6, luk: 2, axis: 'sweep' },
banjjak:   { codex: 'P10', pwr: 6, std: 2, agi: 2, luk: 4, axis: 'awaken' }
};
var CHAR_STD = ['ten', 'twin', 'jelly', 'ppyak', 'mungchi', 'boss',
'pudding', 'sodawitch', 'mongle', 'churup',
'mukmul', 'tiktok', 'kkultteok', 'bangul',
'sseokssak', 'banjjak'];
function hasStdArt(id) { return CHAR_STD.indexOf(id) >= 0; }
function stdArt(id, kind) {
return hasStdArt(id) ? ('var(--ch-' + id + '-' + kind + ')') : '';
}
function setArt(el, prop, std, crop) {
if (!el || !el.style) return '';
var v = std || crop || '';
if (v) el.style.setProperty(prop, v);
else if (el.style.removeProperty) el.style.removeProperty(prop);
var state = std ? 'std' : (crop ? 'crop' : '');
if (el.setAttribute) {
if (state) el.setAttribute('data-art', state);
else if (el.removeAttribute) el.removeAttribute('data-art');
}
return state;
}
function setStdArt(el, id, kind, prop) {
return setArt(el, prop, stdArt(id, kind), '') === 'std';
}
var SKINS = {
ten: [
{ id: 'ten.base', name: 'skin.base', desc: 'skin.basedesc', cost: 0, img: '--art-tenten' },
{ id: 'ten.hat', name: 'skin.soon', desc: 'skin.soonhint', cost: 0, soon: true }
],
twin: [
{ id: 'twin.base', name: 'skin.base', desc: 'skin.basedesc', cost: 0, img: '--art-twin' },
{ id: 'twin.coral', name: 'skin.bearcoral', desc: 'skin.bearcoraldesc', cost: 0, img: '--art-twin-bear-coral', art: { portrait: '--art-twin-bear-coral-portrait', thumb: '--art-twin-bear-coral-thumb' }, alpha: true, fit: 'icon' },
{ id: 'twin.rose', name: 'skin.bearrose', desc: 'skin.bearrosedesc', cost: 0, img: '--art-twin-bear-rose', art: { portrait: '--art-twin-bear-rose-portrait', thumb: '--art-twin-bear-rose-thumb' }, alpha: true, fit: 'icon' },
{ id: 'twin.lavender', name: 'skin.bearlavender', desc: 'skin.bearlavenderdesc', cost: 0, img: '--art-twin-bear-lavender', art: { portrait: '--art-twin-bear-lavender-portrait', thumb: '--art-twin-bear-lavender-thumb' }, alpha: true, fit: 'icon' },
{ id: 'twin.mint', name: 'skin.bearmint', desc: 'skin.bearmintdesc', cost: 0, img: '--art-twin-bear-mint', art: { portrait: '--art-twin-bear-mint-portrait', thumb: '--art-twin-bear-mint-thumb' }, alpha: true, fit: 'icon' },
{ id: 'twin.blue', name: 'skin.bearblue', desc: 'skin.bearbluedesc', cost: 0, img: '--art-twin-bear-blue', art: { portrait: '--art-twin-bear-blue-portrait', thumb: '--art-twin-bear-blue-thumb' }, alpha: true, fit: 'icon' }
],
jelly: [
{ id: 'jelly.base', name: 'skin.base', desc: 'skin.basedesc', cost: 0, img: '--art-jelly' },
{ id: 'jelly.royal', name: 'skin.royal', desc: 'skin.royaldesc', cost: 25, img: '--art-jelly-royal', art: { portrait: '--art-jelly-royal-portrait', thumb: '--art-jelly-royal-thumb' }, alpha: true, fit: 'icon' }
]
};
var SKIN_COST_ROYAL = 25;   // §9 확정가. 표의 값과 같아야 하며, 여기가 정본이다.
function skinsFor(id) { return SKINS[id] || []; }
function skinById(sid) {
for (var k in SKINS) {
if (!Object.prototype.hasOwnProperty.call(SKINS, k)) continue;
var list = SKINS[k];
for (var i = 0; i < list.length; i++) if (list[i].id === sid) return list[i];
}
return null;
}
function skinOwned(sk) {
if (!sk || sk.soon) return false;
return sk.cost === 0 || store.skins.indexOf(sk.id) >= 0;
}
function equippedSkin(id) {
var list = skinsFor(id);
var want = store.equipped[id];
for (var i = 0; i < list.length; i++) {
if (list[i].id === want && skinOwned(list[i])) return list[i];
}
return list[0] || null;
}
function advStarsTotalOf(map) {
var sum = 0;
for (var k in map) {
if (Object.prototype.hasOwnProperty.call(map, k)) sum += map[k] | 0;
}
return sum;
}
// 텐텐 왕자 — 합10 매치 보너스. 왕자 승격과 함께 +50% → +60%.
var TEN_SUM10_MULT = 1.6;
var TWIN_SAME_MULT = 1.6;
// 젤리 — 매치마다 확률적으로 그 매치만 ×3.
var JELLY_P = 0.10;
var JELLY_MULT = 3;
var JELLY_ALT = '#B6F24A';
var JELLY_SALT = 0x7A5C1D3B;
var JELLY_GOLDEN = 0x9E3779B1;
function jackpotRoll() {
if (!isDaily()) return Math.random();
var s = (((S.seed >>> 0) ^ JELLY_SALT) +
Math.imul((S.matches | 0) + 1, JELLY_GOLDEN)) >>> 0;
return mulberry32(s)();
}
function heroUnlocked(id) {
return id !== 'jelly' || !!store.jellyOn;
}
function charId() {
var id = HERO_IDS.indexOf(store.charId) >= 0 ? store.charId : CHAR_DEFAULT;
return heroUnlocked(id) ? id : CHAR_DEFAULT;
}
function mateId() {
return MATE_IDS.indexOf(store.mateId) >= 0 ? store.mateId : '';
}
function charKeyColor() {
return (CHARS[charId()] || CHARS[CHAR_DEFAULT]).key;
}
function applyCharSkin() {
var i, el = $('mascot'), cid = charId();
if (el) {
for (i = 0; i < CHAR_CLASSES.length; i++) el.classList.remove(CHAR_CLASSES[i]);
el.classList.add((CHARS[cid] || CHARS[CHAR_DEFAULT]).cls);
setStdArt(el, cid, 'face', '--slot-face');
}
var mt = $('mate'), mid = mateId();
if (mt) {
for (i = 0; i < CHAR_CLASSES.length; i++) mt.classList.remove(CHAR_CLASSES[i]);
mt.hidden = !mid;
if (mid) mt.classList.add(CHARS[mid].cls);
setStdArt(mt, mid, 'face', '--mate-face');
}
var hs = $('hero-slot');
if (hs && hs.style) hs.style.setProperty('--hs-key', charKeyColor());
}
var HERO_BUBBLE_MS = 1600;        // style.css hb-pop 키프레임 길이와 같아야 한다
var SAY_DEF = {
combo:   { tier: 3, pose: 0, pri: 0 },
jackpot: { tier: 6, pose: 0, pri: 1 },
mission: { tier: 4, pose: 2, pri: 1 },
tier:    { tier: 5, pose: 2, pri: 1 },
clear:   { tier: 6, pose: 3, pri: 1 },
boss:    { tier: 5, pose: 3, pri: 1 },
star:    { tier: 4, pose: 2, pri: 1 }
};
var sayTimer = 0;
function heroBubble(text) {
var el = $('hero-bubble'), v = $('hb-t');
if (!el || !text) return;
if (fxBusy()) return;
if (sayTimer) { clearTimeout(sayTimer); sayTimer = 0; }
if (v) v.textContent = text;
el.hidden = false;
el.classList.remove('show');
void el.offsetWidth;                 // 진행 중인 애니메이션을 새 사건으로 다시 시작
el.classList.add('show');
sayTimer = setTimeout(function () {
sayTimer = 0;
if (el.classList) el.classList.remove('show');
el.hidden = true;
}, HERO_BUBBLE_MS);
}
function heroSay(kind, tier) {
var d = SAY_DEF[kind];
if (!d) return;
var id = charId();
J.sfx.voice(id, tier || d.tier, d.pri);
if (d.pose) mascotBeat(d.pose);
heroBubble(t('say.' + kind + '.' + id));
}
function syncPickGroup(wrapId, cur) {
var wrap = $(wrapId);
if (!wrap || !wrap.querySelectorAll) return;
var cards = wrap.querySelectorAll('.char-card');
for (var i = 0; i < cards.length; i++) {
var on = (cards[i].getAttribute('data-char') || '') === cur;
cards[i].setAttribute('aria-checked', on ? 'true' : 'false');
cards[i].tabIndex = on ? 0 : -1;   // 라디오 그룹은 탭 스톱이 하나다
}
}
function syncCharPick() {
syncPickGroup('char-pick', charId());
syncPickGroup('mate-pick', mateId());
syncHeroLocks();
syncMateLocks();      /* WD-2 §14 — 펫 카드도 같은 자리에서 잠금을 맞춘다 */
syncItemList();       /* WD-2 §11.6-B — 보유/장착 자리표 */
syncCharSummary();
applySkins();
applyHeroStats();
syncPetInfo();            /* charsel v2 */
syncSidePanes();
fitAllDesc();             /* charsel v2 — 잘림 0 은 실측으로만 보장된다 */
}
var cpIdx = 0;
var cpSwipeAt = 0;        // 스와이프 직후의 click 을 걸러 내기 위한 시각
function cavClone(id) {
if (typeof document === 'undefined' || !document.querySelector) return null;
var src = document.querySelector('#char-pick .char-card[data-char="' + id + '"] .cav') ||
document.querySelector('#mate-pick .char-card[data-char="' + id + '"] .cav');
return (src && src.cloneNode) ? src.cloneNode(true) : null;
}
function syncCharSummary() {
var id = charId(), mid = mateId(), node;
var h = $('co-hero'), m = $('co-mate');
if (h) {
h.className = 'co-av ' + (CHARS[id] || CHARS[CHAR_DEFAULT]).cls;
h.innerHTML = '';
node = cavClone(id);
if (node) h.appendChild(node);
setStdArt(h, id, 'face', '--slot-std');
}
if (m) {
m.className = 'co-av co-av-m' + (mid ? ' ' + CHARS[mid].cls : '');
m.innerHTML = '';
if (mid) { node = cavClone(mid); if (node) m.appendChild(node); }
setArt(m, '--slot-std', mid ? stdArt(mid, 'face') : '', '');
}
setText('co-name', mid ? (t('char.' + id + '.name') + ' + ' + t('char.' + mid + '.name'))
: t('char.' + id + '.name'));
}
function applySkins() {
if (typeof document === 'undefined' || !document.querySelectorAll) return;
cpBuild();   /* ⑰ — 얼굴을 붙이기 전에 방울(3벌)이 서 있게 한다(멱등) */
var nodes = document.querySelectorAll('#char-pick .char-card, #cp-info .ci-chip, #cp-rack .cp-th');
for (var i = 0; i < nodes.length; i++) paintSkinArt(nodes[i]);
fillSvgFallback('#cp-rack .cp-th');
fillSvgFallback('#cp-info .ci-chip');
}
function paintSkinArt(el) {
var id = el.getAttribute('data-char');
if (!id) {
var par = el.parentNode;
while (par && !(par.getAttribute && par.getAttribute('data-char'))) par = par.parentNode;
id = par && par.getAttribute ? par.getAttribute('data-char') : '';
}
var sk = equippedSkin(id);
var skImg = sk && sk.img ? 'var(' + sk.img + ')' : '';
if (el.style) el.style.setProperty('--char-img', skImg);
var kind = el.classList && el.classList.contains('cp-th') ? 'thumb'
: (el.classList && el.classList.contains('ci-chip')) ? 'thumb'
: 'portrait';
var isBase = !sk || !sk.id || /\.base$/.test(sk.id);
var stdSkin = !isBase && !!(sk && sk.alpha);
var skKindImg = (sk && sk.art && sk.art[kind]) ? 'var(' + sk.art[kind] + ')' : skImg;
setArt(el, '--char-' + kind,
isBase ? stdArt(id, kind) : (stdSkin ? skKindImg : ''),  // std: 파이프라인 산출물
(isBase || stdSkin) ? '' : skKindImg);                   // crop: 시트 크롭 스킨뿐
}
function fillSvgFallback(sel) {
if (typeof document === 'undefined' || !document.querySelectorAll) return;
var nodes = document.querySelectorAll(sel);
for (var i = 0; i < nodes.length; i++) {
var el = nodes[i];
var id = el.getAttribute('data-char');
if (!id) {
var par = el.parentNode;
while (par && !(par.getAttribute && par.getAttribute('data-char'))) par = par.parentNode;
id = par && par.getAttribute ? par.getAttribute('data-char') : '';
}
var old = el.querySelector ? el.querySelector('.cav') : null;
if (el.getAttribute('data-art')) {
if (old && old.parentNode) old.parentNode.removeChild(old);
continue;
}
if (old) continue;
if (!id) continue;
var av = cavClone(id);
if (av) {
if (av.setAttribute) av.setAttribute('aria-hidden', 'true');
el.appendChild(av);
}
}
}
var CP_CAR = {
rack: function () { return $('cp-rack'); },
win: function () { return $('cp-win'); },
track: function () { return $('cp-track'); },
ids: function () { return HERO_IDS; },
build: cpBuildChar,
onCenter: function () { cpTail(); },
pos: 0, normT: 0,
getIdx: function () { return cpIdx; },
setIdx: function (v) { cpIdx = v; }
};
var CP_PET_IDS = MATE_IDS.concat(['']);    /* 지금 순서 그대로 — 펫 열 + 「없음」(끝) */
var CP_PET = {
rack: function () {
return (typeof document !== 'undefined' && document.querySelector)
? document.querySelector('#charpanel .pick-row.pick-mate') : null;
},
win: function () {
var r = CP_PET.rack();
return (r && r.querySelector) ? r.querySelector('.cp-win') : null;
},
track: function () { return $('mate-pick'); },
ids: function () { return CP_PET_IDS; },
build: cpPetBuild,
onCenter: cpPetCenter,
pos: 0, normT: 0, i: 0,
getIdx: function () { return CP_PET.i; },
setIdx: function (v) { CP_PET.i = v; }
};
function carBuild(c) {
if (typeof document === 'undefined') return;
var track = c.track();
if (!track) return;
var ids = c.ids();
if (track.children && track.children.length === ids.length * 3) return;
c.build(track, ids);
}
function cpBuildChar(track, ids) {
var n = ids.length;
track.innerHTML = '';
for (var c = 0; c < 3; c++) {
for (var i = 0; i < n; i++) {
var id = ids[i];
var b = document.createElement('button');
b.type = 'button';
b.className = 'cp-th kit-chip-v2 ch-' + id;
b.setAttribute('data-i', String(i));
b.setAttribute('data-char', id);
b.setAttribute('data-i18n-aria', 'char.' + id + '.name');
b.setAttribute('aria-label', t('char.' + id + '.name'));
var s = document.createElement('span');
s.className = 'ct-art';
s.setAttribute('aria-hidden', 'true');
b.appendChild(s);
track.appendChild(b);
}
}
}
function cpBuild() { carBuild(CP_CAR); }
function cpPetBuild(track, ids) {
var orig = [], i, k;
for (i = 0; i < ids.length; i++) {
var el = track.querySelector('.char-card[data-char="' + ids[i] + '"]');
if (!el) return;
orig.push(el);
}
var frag = document.createDocumentFragment();
for (k = 0; k < 3; k++) {
for (i = 0; i < orig.length; i++) frag.appendChild(k === 1 ? orig[i] : orig[i].cloneNode(true));
}
track.appendChild(frag);
}
function carRing(c, pos) {
var track = c.track();
if (!track || !track.children) return;
for (var k = 0; k < track.children.length; k++) {
var b = track.children[k];
if (!b.classList) continue;
if (k === pos) { b.classList.add('cp-center'); if (b.setAttribute) b.setAttribute('aria-current', 'true'); }
else { b.classList.remove('cp-center'); if (b.removeAttribute) b.removeAttribute('aria-current'); }
}
}
function carTranslate(c, pos, animate) {
var track = c.track(), win = c.win();
if (!track || !win || !win.clientWidth) return;
var b = track.children[pos];
if (!b) return;
var tx = win.clientWidth / 2 - (b.offsetLeft + b.offsetWidth / 2);
track.style.transition = animate ? 'transform .16s var(--ease)' : 'none';
track.style.transform = 'translateX(' + tx.toFixed(2) + 'px)';
if (!animate) { void track.offsetWidth; }   /* 순간 이동을 커밋(다음 애니의 출발점 고정) */
}
function cpTail() {
var root = $('charpanel');
if (root && root.style) root.style.setProperty('--cp-i', String(cpIdx));
var tr = $('char-pick');
if (tr && tr.style) tr.style.setProperty('--cp-i', String(cpIdx));
var info = $('cp-info');
if (info && info.setAttribute) info.setAttribute('data-cp', String(cpIdx));
var dots = $('cp-dots');
if (dots && dots.children) {
for (var k = 0; k < dots.children.length; k++) {
if (dots.children[k].classList) dots.children[k].classList.toggle('on', k === cpIdx);
}
}
var go = $('cp-go');
if (go) go.textContent = heroUnlocked(HERO_IDS[cpIdx]) ? t('pick.go') : t('pick.locked');
syncSidePanes();
cpStage(cpIdx);
}
function carSelectPos(c, pos, animate, how) {
var n = c.ids().length, prev = c.getIdx();
if (c.normT) { clearTimeout(c.normT); c.normT = 0; }
var win = c.win();
if (animate && win && win.clientWidth) {
var mid = (((c.pos % n) + n) % n) + n;
if (c.pos !== mid) {
var d0 = pos - c.pos;
c.pos = mid; pos = mid + d0;
carRing(c, c.pos);
carTranslate(c, c.pos, false);
}
}
c.pos = pos;
c.setIdx(((pos % n) + n) % n);
carRing(c, pos);
carTranslate(c, pos, animate);
c.onCenter(how, prev);
if (animate) {
c.normT = setTimeout(function () {
c.normT = 0;
var mid2 = c.getIdx() + n;
if (c.pos !== mid2) { c.pos = mid2; carRing(c, mid2); carTranslate(c, mid2, false); }
}, 200);
}
}
function cpSelectPos(pos, animate) { carSelectPos(CP_CAR, pos, animate); }
function carShow(c, i, how) {
closeStatTip();          /* [SI-0909] 카드가 바뀌면 앞 카드의 설명은 끝난 말이다 */
var n = c.ids().length;
var target = ((i % n) + n) % n;
var rack = c.rack(), panel = $('charpanel'), track = c.track();
var vis = panel && !panel.hidden && rack && rack.clientWidth > 0 &&
track && track.children && track.children.length;
if (!vis) { carSeed(c, target); return; }
var d = target - c.getIdx();
while (d > n / 2) d -= n;
while (d < -n / 2) d += n;
carSelectPos(c, c.pos + d, true, how);
}
function cpShow(i) { carShow(CP_CAR, i); }
function carSeed(c, i) {
closeStatTip();          /* [SI-0909] 위 carShow 와 같은 이유 */
var n = c.ids().length;
var target = ((i % n) + n) % n;
carBuild(c);
if (c.normT) { clearTimeout(c.normT); c.normT = 0; }
c.pos = target + n;
c.setIdx(target);
carRing(c, c.pos);
carTranslate(c, c.pos, false);
c.onCenter('seed');
}
function cpSeed(i) { carSeed(CP_CAR, i); }
function cpPetCenter(how, prev) {
if (how === 'seed') return;
var idx = CP_PET.getIdx(), id = CP_PET_IDS[idx] || '';
var owned = !id || petOwned(id);
var equip = owned && id !== mateId();
cpPetView = id;
syncPetInfo();
if (owned) setMate(id);
else if (idx !== prev) toast(petLockText(id));
if (!equip) J.sfx.ui();
}
function cpStep(d) {
if (cpTabCur === 'pet') { carShow(CP_PET, CP_PET.getIdx() + d, 'nav'); return; }
cpShow(cpIdx + d);
J.sfx.ui();
}
function openSettings() {
var el = $('modal-settings');
if (!el) return;
winShow(el);   /* [판정판 121 · Task 5] 겹친 창 규칙 — 아래 창이 있으면 깐다(openModal 과 같은 손) */
syncToggleLabels();
TW_PORTAL.syncAccountUI(twApplyAccountUI);   /* Task 12 — 계정 줄 표시/숨김 */
try { questBadges(); } catch (eq) { /* 부팅 전 */ }
J.sfx.ui();
}
function closeSettings() {
winHide($('modal-settings'));   /* [판정판 121 · Task 5] 깔았던 창만 되살린다 */
J.sfx.ui();
}
function twApplyAccountUI(loginStateOrNull) {
var row = $('portal-acct'); if (!row) return;
if (loginStateOrNull === null) { row.hidden = true; return; }
row.hidden = false;
var nameEl = $('portal-acct-name'), loginBtn = $('portal-acct-login');
var unameEl = $('portal-acct-uname'), avEl = $('portal-acct-avatar');
if (loginStateOrNull) {
if (nameEl) nameEl.hidden = false;
if (unameEl) unameEl.textContent = loginStateOrNull.username || t('portal.account');
if (avEl) {
var pic = loginStateOrNull.profilePictureUrl;
if (pic) { avEl.src = pic; avEl.hidden = false; }
else { avEl.hidden = true; avEl.removeAttribute('src'); }
}
if (loginBtn) loginBtn.hidden = true;
} else {
if (nameEl) nameEl.hidden = true;
if (avEl) { avEl.hidden = true; avEl.removeAttribute('src'); }
if (loginBtn) loginBtn.hidden = false;
}
}
function skinTargetId() { return HERO_IDS[cpIdx] || charId(); }
function buildSkinList() {
var wrap = $('sk-list');
if (!wrap) return;
var id = skinTargetId();
var list = skinsFor(id);
var cur = equippedSkin(id);
if (!list.length) { list = [{ id: id + '.base', name: 'skin.base', desc: 'skin.basedesc', cost: 0 }]; cur = list[0]; }
wrap.innerHTML = '';
for (var i = 0; i < list.length; i++) {
var sk = list[i];
var row = document.createElement('div');
row.className = 'sk-item kit-box-v2' + (sk.soon ? ' soon' : '') +
(cur && cur.id === sk.id ? ' on' : '');
var th = document.createElement('span');
th.className = 'sk-th kit-slot-v2 kit-slot-v2--portrait';
var art = /\.base$/.test(sk.id) ? stdArt(id, 'thumb') : skinThumbCss(sk.id);
if (art) th.style.setProperty('--sk-img', art);
row.appendChild(th);
var body = document.createElement('span');
body.className = 'sk-b';
var n = document.createElement('b');
n.className = 'sk-n';
n.textContent = t(sk.name);
var d = document.createElement('span');
d.className = 'sk-d';
d.textContent = t(sk.desc);
body.appendChild(n);
body.appendChild(d);
row.appendChild(body);
var act = document.createElement('button');
act.type = 'button';
act.className = 'sk-act';
if (sk.soon) {
act.className += ' kit-pill-v2';
act.setAttribute('data-variant', 'soft');
act.textContent = t('skin.soon');
act.disabled = true;
} else if (!skinOwned(sk)) {
act.className += ' kit-pill-v2';
act.setAttribute('data-variant', 'soft');
act.textContent = t('skin.inshop');
act.disabled = true;
} else if (cur && cur.id === sk.id) {
act.className += ' kit-pill-v2';
act.setAttribute('data-variant', 'soft');
act.textContent = t('skin.equipped');
act.disabled = true;
} else {
act.className += ' kit-pill-v2';
act.setAttribute('data-variant', 'soft');
act.textContent = t('skin.equip');
act.setAttribute('data-equip', sk.id);
}
row.appendChild(act);
wrap.appendChild(row);
}
try { if (window.TW && window.TW.applyPlatformGates) window.TW.applyPlatformGates(wrap); } catch (e) {}
}
function skinListClick(ev) {
var root = ev && ev.currentTarget;
var el = ev && ev.target;
while (el && el !== root && !(el.getAttribute &&
(el.getAttribute('data-buy') || el.getAttribute('data-buyjewel') ||
el.getAttribute('data-equip')))) el = el.parentNode;
if (!el || el === root || !el.getAttribute) return;
var b = el.getAttribute('data-buy');
if (b) { buySkin(b); return; }
var bj = el.getAttribute('data-buyjewel');
if (bj) { buySkinJewel(bj); return; }
var e = el.getAttribute('data-equip');
if (e) equipSkin(e);
}
function skinShopSync() { if (shopActive() && shopTab2 === 'deco') paintShopTab('deco'); }
function openSkins() {
var el = $('modal-skin');
if (!el) return;
winShow(el);
buildSkinList();
J.sfx.ui();
}
function closeSkins() {
winHide($('modal-skin'));
J.sfx.ui();
}
function equipSkin(sid) {
var sk = skinById(sid);
if (!sk || !skinOwned(sk)) return;
store.equipped[skinTargetId()] = sk.id;
persist();
applySkins();
buildSkinList();
skinShopSync();
J.sfx.ui();
}
function buySkin(sid) {
var sk = skinById(sid);
if (!sk || sk.soon || skinOwned(sk)) return;
var have = store.jstar | 0;
if (have < sk.cost) {
toast(t('skin.poor', { n: sk.cost - have }));
J.sfx.fail();
return;
}
confirmBox(t('skin.confirm', { n: sk.cost, name: t(sk.name) }), function () {
closeConfirm();
var sk2 = skinById(sid);
if (!sk2 || sk2.soon || skinOwned(sk2)) return;
var now = store.jstar | 0;
if (now < sk2.cost) { toast(t('skin.poor', { n: sk2.cost - now })); J.sfx.fail(); return; }
store.jstar = now - sk2.cost;
if (store.skins.indexOf(sk2.id) < 0) store.skins.push(sk2.id);
store.equipped[skinTargetId()] = sk2.id;
persist();
applySkins();
buildSkinList();
skinShopSync();
toast(t('skin.bought', { name: t(sk2.name) }));
J.sfx.win();
});
}
var INVITE_ORDER = ['mongle', 'tiktok', 'churup', 'kkultteok', 'sseokssak',
'mukmul', 'banjjak', 'bangul', 'jelly'];
var INVITE_COST = {
mongle: 0,          /* 첫 초대 **무료** — 값을 배우기 전에 흐름을 먼저 배운다 */
tiktok: 8,
churup: 12,
kkultteok: 16,
sseokssak: 20,
mukmul: SKIN_COST_ROYAL,   /* = 25. 사다리의 중간 계단이자 값의 자 */
banjjak: 30,
bangul: 36,
jelly: 45           /* 10탄 보스(무료 경로)가 그대로 살아 있는 보조 경로 */
};
function inviteCost(id) {
return Object.prototype.hasOwnProperty.call(INVITE_COST, id) ? (INVITE_COST[id] | 0) : null;
}
function charOwned(id) {
if (HERO_IDS.indexOf(id) >= 0) return heroUnlocked(id);
if (MATE_IDS.indexOf(id) >= 0) return petOwned(id);
return false;
}
function invitable(id) { return inviteCost(id) !== null && !charOwned(id); }
function charStatPct(id) {
if (HERO_IDS.indexOf(id) >= 0) {
var e = statEff(id);
return [Math.round(100 * e.power / STAT_BAR_MAX), Math.round(100 * e.steady / STAT_BAR_MAX),
Math.round(100 * e.agility / STAT_BAR_MAX), Math.round(100 * e.luck / STAT_BAR_MAX)];
}
return [0, 0, 0, 0];
}
function paintStatBars(root, id) {
if (!root || !root.querySelectorAll) return;
var pet = MATE_IDS.indexOf(id) >= 0;
root.hidden = pet;   /* 74 — 펫은 능력치가 없다(사용자 2026-09-25). 초대·획득 창도 같다 */
if (pet) return;
var v = charStatPct(id), bars = root.querySelectorAll('.cs-bar'), i;
for (i = 0; i < bars.length && i < 4; i++) {
var n = clamp(v[i] | 0, 0, 100);
bars[i].style.setProperty('--v', n + '%');
bars[i].style.setProperty('--f2-gv', String(n / 100));
}
}
function charTagKey(id) {
if (HERO_IDS.indexOf(id) >= 0) return 'char.' + id + '.tag';
var p = PET_STATS[id];
return p ? ('pet.axis.' + p.axis) : 'mate.none.name';
}
function inviteWhy(id) {
return (MATE_IDS.indexOf(id) >= 0) ? petLockText(id) : t('char.locked.hint');
}
var ivId = '';        /* 지금 초대 창이 보고 있는 id. 창이 닫히면 '' 다. */
function openInvite(id) {
if (!invitable(id) || !$('modal-invite')) return false;
ivId = id;
syncInvite();
openModal('modal-invite');
J.sfx.ui();
return true;
}
function closeInvite() {
ivId = '';
closeModal('modal-invite');
J.sfx.ui();
}
function syncInvite() {
var id = ivId;
if (!id) return;
var cost = inviteCost(id) | 0, have = store.jstar | 0, free = cost <= 0;
var chip = $('iv-chip');
if (chip) {
chip.className = 'ci-chip kit-slot-v2 kit-slot-v2--portrait ch-' + id;
setArt(chip, '--char-thumb', stdArt(id, 'thumb'), '');
}
setText('iv-name', t('char.' + id + '.name'));
setText('iv-tag', t(charTagKey(id)));
paintStatBars($('iv-stats'), id);
setText('iv-why', inviteWhy(id));
setText('iv-gems', have);
var row = $('iv-prog-row'), bar = $('iv-prog');
if (row) row.hidden = free;
if (bar) {
bar.hidden = free;
var pct = free ? 100 : clamp(Math.round(100 * have / cost), 0, 100);
bar.style.setProperty('--v', pct + '%');
bar.style.setProperty('--f2-gv', String(pct / 100));
}
setText('iv-prog-v', Math.min(have, cost) + '/' + cost);
var yes = $('iv-yes');
if (yes) {
yes.disabled = have < cost;
headText(yes, free ? t('invite.free') : t('invite.go.n', { n: cost }));
}
}
function inviteBuy() {
var id = ivId;
if (!id || !invitable(id)) return;
var cost = inviteCost(id) | 0, have = store.jstar | 0;
if (have < cost) { toast(t('skin.poor', { n: cost - have })); J.sfx.fail(); return; }
store.jstar = have - cost;
if (!store.invited || typeof store.invited !== 'object') store.invited = {};
store.invited[id] = 1;
if (MATE_IDS.indexOf(id) >= 0) grantPet(id, true);   /* quiet: 연출은 아래가 맡는다 */
else if (id === 'jelly') store.jellyOn = true;
persist();
closeModal('modal-invite');
ivId = '';
syncCharPick();
charGetFx(id, function () {
introPlay(id, function () {
if (cgToastMsg) { toast(cgToastMsg); cgToastMsg = ''; }
});
});
}
var cgTimer = 0, cgThen = null, cgToastMsg = '';   /* [T14 I-7b] 토스트는 화면이 닫힌 뒤 */
function invCssMs(name, fb) {
try {
var s = getComputedStyle(document.documentElement).getPropertyValue(name);
var m = /(-?[\d.]+)\s*(ms|s)?/.exec(String(s || '').trim());
if (!m) return fb;
var n = parseFloat(m[1]);
if (!isFinite(n)) return fb;
return (m[2] === 's') ? Math.round(n * 1000) : Math.round(n);
} catch (e) { return fb; }
}
function getLifeMs() { return invCssMs('--mo-get-life', 1700); }
function charGetFx(id, then) {
var el = $('charget');
if (!el || (S && S.running)) { if (then) then(); return false; }
cgThen = then || null;
el.className = 'ch-' + id;
var art = $('cg-art');
if (art && art.style) {
var img = stdArt(id, 'full');
if (img) art.style.setProperty('--cg-img', img);
else if (art.style.removeProperty) art.style.removeProperty('--cg-img');
}
if (el.style) el.style.setProperty('--cut-key', (CHARS[id] || CHARS[CHAR_DEFAULT]).key);
setText('cg-sub', t(HERO_IDS.indexOf(id) >= 0 ? 'invite.got' : 'invite.got.pet'));
setText('cg-name', t('char.' + id + '.name'));
setText('cg-tag', t(charTagKey(id)));
paintStatBars($('cg-stats'), id);
el.hidden = false;
el.classList.remove('go');
void el.offsetWidth;              // 진행 중인 애니메이션을 새 사건으로 다시 시작
el.classList.add('go');
cgToastMsg = t('invite.new', { n: t('char.' + id + '.name') });
J.sfx.win();
J.vibrate(70);
if (typeof window !== 'undefined') {
J.confetti(window.innerWidth / 2, window.innerHeight * 0.42);
}
if (cgTimer) clearTimeout(cgTimer);
cgTimer = setTimeout(function () { cgTimer = 0; charGetEnd(); }, getLifeMs());
return true;
}
function charGetEnd() {
if (cgTimer) { clearTimeout(cgTimer); cgTimer = 0; }
var el = $('charget');
if (el) { el.classList.remove('go'); el.hidden = true; }
var fn = cgThen;
cgThen = null;
if (fn) fn();
}
var cinId = '', cinIdx = 0, cinLines = [], cinThen = null;
function introSeenChar(id) {
return !!(store.introSeen && store.introSeen[id]);
}
function introMark(id) {
if (!id) return;
if (!store.introSeen || typeof store.introSeen !== 'object') store.introSeen = {};
if (store.introSeen[id]) return;
store.introSeen[id] = 1;
persist();
}
function introLines(id) {
var out = [], i, k, s;
for (i = 1; i <= 3; i++) {
k = 'intro.' + id + '.l' + i;
s = t(k);
if (s && s !== k) out.push(s);
}
return out;
}
function introDue(id) {
return !!id && !introSeenChar(id) && introLines(id).length > 0;
}
function introPlay(id, then) {
var lines = introLines(id), el = $('charintro');
if (!el || !lines.length) { introMark(id); if (then) then(); return false; }
cinId = id; cinIdx = 0; cinLines = lines; cinThen = then || null;
var face = $('cin-face');
if (face && face.style) {
var img = stdArt(id, 'portrait');
if (img) face.style.setProperty('--cin-face', img);
else if (face.style.removeProperty) face.style.removeProperty('--cin-face');
}
setText('cin-who', t('char.' + id + '.name'));
cinPaint();
el.hidden = false;
return true;
}
function cinPaint() {
setText('cin-line', cinLines[cinIdx] || '');
var b = $('cin-next');
if (b) headText(b, (cinIdx >= cinLines.length - 1) ? t('intro.done') : t('intro.next'));
}
function cinNext() {
if (!cinLines.length) return;
if (cinIdx < cinLines.length - 1) { cinIdx++; cinPaint(); J.sfx.ui(); return; }
cinFinish();
}
function cinFinish() {
var el = $('charintro');
if (el) el.hidden = true;
introMark(cinId);
cinLines = []; cinIdx = 0; cinId = '';
var fn = cinThen;
cinThen = null;
J.sfx.ui();
if (fn) fn();
}
function introGate(id, then) {
if (!introDue(id)) return false;
return introPlay(id, then);
}
var cpTabCur = 'char';
function cpTab(k) {
closeStatTip();          /* [SI-0909] 탭이 바뀌면 카드가 통째로 바뀐다 */
var root = $('charpanel');
cpTabCur = (k === 'pet') ? 'pet' : 'char';
if (!root || !root.setAttribute) return;
root.setAttribute('data-cptab', cpTabCur);
var car = cpTabCur === 'pet' ? CP_PET : CP_CAR;
carTranslate(car, car.pos, false);
cpPetStage();             /* W-B ③ — 탭이 곧 무대의 주인을 바꾼다 */
syncPetInfo();            /* charsel v2 — 펫 탭의 [패시브 스킬] 박스 */
var tabs = root.querySelectorAll ? root.querySelectorAll('.cp-tab') : null;
if (!tabs) return;
for (var i = 0; i < tabs.length; i++) {
tabs[i].setAttribute('aria-selected',
tabs[i].getAttribute('data-cptab') === cpTabCur ? 'true' : 'false');
}
}
function cpPetStage() {
var el = $('charpanel');
var art = el && el.querySelector ? el.querySelector('.cp-petart') : null;
if (!art) return;
setStdArt(art, cpTabCur === 'pet' ? cpPetId() : '', 'full', '--pet-full');
}
var cpPetView = null;      /* null = 지금 고른 펫(mateId) 을 본다 */
function cpTxt(el, key, txt) {
if (!el) return;
if (key) { el.setAttribute('data-i18n', key); el.textContent = t(key); }
else { el.removeAttribute('data-i18n'); el.textContent = txt || ''; }
}
function cpPetId() {
return (cpPetView === null) ? mateId() : cpPetView;
}
var PET_SYN = {
ppyak: ['ten', 'twin'], mungchi: ['jelly', 'sodawitch'], mongle: ['jelly', 'sodawitch'],
tiktok: ['jelly', 'sodawitch'], churup: ['ten', 'pudding'], mukmul: ['twin'],
kkultteok: ['pudding', 'sodawitch'], banjjak: ['jelly', 'pudding'],
bangul: ['ten', 'twin'], sseokssak: ['pudding', 'sodawitch']
};
function petSynOf(id) { return { chars: (PET_SYN[id] || []).slice(), whyKey: 'pet.syn.' + id }; }
function petSkillVal(id, name) {
if (name === 'psec') {
var ms = { ppyak: DUEL_PPYAK_FREELINK_MS, mungchi: DUEL_PET_FREEZE_MS,
mongle: DUEL_MONGLE_FREEZE_MS, tiktok: DUEL_TIKTOK_FREEZE_MS }[id];
return ms ? fmtSec(ms) : null;
}
var n = { churup: DUEL_CHURUP_ROWS, mukmul: DUEL_MUKMUL_REPAINT, kkultteok: DUEL_KKULTTEOK_GOLD,
bangul: DUEL_BANGUL_CLEAN, sseokssak: PET2_SWEEP_POP, banjjak: PET2_BANJJAK_GAUGE }[id];
return (typeof n === 'number') ? n : null;
}
function petFreeNames() {
var out = [];
for (var i = 0; i < PET_FREE.length; i++) out.push(t('char.' + PET_FREE[i] + '.name'));
return out.join(t('cp.pet.sep'));
}
function syncPetInfo() {
var box = $('cp-petinfo');
if (!box) return;
var id = cpPetId(), st = PET_STATS[id], i;
var lock = !!id && !petOwned(id);
box.setAttribute('data-char', id || '');
if (box.classList) box.classList.toggle('locked', false);   /* 잠겨도 문구는 읽힌다 */
var face = $('cp-pet-face');
if (face) {
face.className = 'ci-chip kit-slot-v2 kit-slot-v2--portrait' + (id ? (' ch-' + id) : '');
}
setStdArt(face, id, 'face', '--char-face');
if (face) paintSkinArt(face);
cpTxt($('cp-pet-name'), id ? ('char.' + id + '.name') : 'mate.none.name');
cpTxt($('cp-pet-tag'), (id && st) ? ('pet.axis.' + st.axis) : 'mate.none.name');
var pk = $('cp-pet-passk');
cpTxt($('cp-pet-passname'), null, id ? (t('char.' + id + '.passname') || '') : '');
var emp = $('cp-pet-empty'), useln = $('cp-pet-useline');
if (useln) useln.hidden = true;   /* 74 — 사용 줄은 은퇴. 잠긴 펫의 해금 조건은 토스트·초대 창이 말한다(설명판 넘침 0) */
if (emp) {
if (id) emp.hidden = true;
else { emp.textContent = t('cp.pet.empty', { free: petFreeNames() }); emp.hidden = false; }
}
var comboRow = $('cp-pet-combo'), comboWho = $('cp-pet-combo-v'), comboWhy = $('cp-pet-combo-why');
var recIds = id ? petSynOf(id).chars : [];
if (comboWho && typeof document !== 'undefined') {
while (comboWho.firstChild) comboWho.removeChild(comboWho.firstChild);
for (i = 0; i < recIds.length; i++) {
var rc = recIds[i];
var rchip = document.createElement('i');
rchip.className = 'ci-chip kit-slot-v2 kit-slot-v2--portrait ch-' + rc;
rchip.setAttribute('aria-hidden', 'true');
rchip.setAttribute('data-char', rc);   /* applySkins 가 펫이 아니라 이 캐릭터로 칠하게 */
paintSkinArt(rchip);                   /* 캐릭터 판 초상 칩과 같은 칠(장착 스킨 포함) */
var rname = document.createElement('b');
rname.className = 'ci-tag-v kit-pill-v2';
rname.setAttribute('data-variant', 'soft');
rname.textContent = t('char.' + rc + '.name');
comboWho.appendChild(rchip);
comboWho.appendChild(rname);
}
}
var whyKey = recIds.length ? petSynOf(id).whyKey : '';
var whyTxt = whyKey ? t(whyKey) : '';
cpTxt(comboWhy, null, whyTxt === whyKey ? '' : whyTxt);
if (comboRow) comboRow.hidden = !recIds.length;
if (!id) {
cpTxt($('cp-pet-pass'), 'cp.sk.none');
cpTxt($('cp-pet-use'), null, '-');
cpTxt(pk, 'cp.sk.skill');
} else {
var ptx = t('char.' + id + '.pass') || '', plab = '';
var pm = /^([^:]{1,12}):[ 	]*/.exec(ptx);
if (pm) { plab = pm[1]; ptx = ptx.slice(pm[0].length); }
cpTxt($('cp-pet-pass'), null, ptx);
if (plab) { cpTxt(pk, null, plab); } else { cpTxt(pk, 'cp.sk.skill'); }
cpTxt($('cp-pet-use'), null, lock ? petLockText(id) : '');
}
var uk = $('cp-pet-use');
if (uk && uk.parentNode && uk.parentNode.firstChild) {
cpTxt(uk.parentNode.querySelector('.cc-k'), 'cp.sk.lock');
}
fitDesc($('cp-pet-desc'));
fitDesc(comboRow);        /* 64-fix2 ⑥ — 추천 카드도 같은 「잘림 0」: 넘치면 글자를 줄인다(펫마다 다시 잰다) */
cpPetStage();             /* 구경 중인 펫이 무대에도 선다(없으면 히어로) */
}
function fitDesc(el) {
if (!el || !el.classList) return;
el.classList.remove('cp-tight', 'cp-tight-2');
if (el.scrollHeight <= el.clientHeight) return;
el.classList.add('cp-tight');
if (el.scrollHeight <= el.clientHeight) return;
el.classList.remove('cp-tight');
el.classList.add('cp-tight-2');
}
function fitAllDesc() {
if (typeof document === 'undefined' || !document.querySelectorAll) return;
var list = document.querySelectorAll('#charpanel .ci-desc');
for (var i = 0; i < list.length; i++) fitDesc(list[i]);
}
function syncSidePanes() {
var id = HERO_IDS[cpIdx] || charId();
cpTxt($('cp-side-rec'), 'char.' + id + '.tag');
syncItemList();
}
function openCharPanel() {
var el = $('charpanel');
if (!el) return;
winShow(el);              /* [판정판 121 · Task 5] 겹친 창 규칙 — 판 정보 창(⇄)에서 열면 그 창을 깐다 */
cpPetView = null;        /* 열 때마다 "구경"은 지금 고른 펫에서 시작한다 */
cpTab(cpTabCur);          /* W4 — 세션 안에서 마지막으로 보던 탭으로 연다 */
syncSidePanes();          /* 레일 — 배지 + 아이템 칸 그리드 */
syncCharPick();
var cur = HERO_IDS.indexOf(charId());
cpSeed(cur < 0 ? 0 : cur);   /* ⑰ 열 때는 애니 없이 정중앙 seed(가운데 벌) */
carSeed(CP_PET, Math.max(0, CP_PET_IDS.indexOf(mateId())));   /* [rc1011] 펫 줄도 — 지금 장착한 펫(없으면 「없음」)을 순간 배치 */
J.sfx.ui();
}
function closeCharPanel() {
closeStatTip();          /* [SI-0909] 닫힌 패널에 열린 말풍선을 남기지 않는다 */
winHide($('charpanel'));  /* [판정판 121 · Task 5] 깔았던 창(판 정보 등)을 되살린다 — 아래 openNodeCard 보다 먼저 */
syncCharSummary();
J.sfx.ui();
if (advCardN && $('modal-node') && !$('modal-node').hidden) openNodeCard(advCardN);   /* 74 — 편성이 바뀌면 카드도 */
}
function cpConfirm() {
var id = HERO_IDS[cpIdx];
if (!heroUnlocked(id)) {
toast(t('char.locked.hint')); J.sfx.fail(); return;
}
setChar(id);              // 이미 그 캐릭터면 조용히 아무 일도 하지 않는다
closeCharPanel();
afterCharPick();
}
function syncHeroLocks() {
var wrap = $('char-pick');
if (!wrap || !wrap.querySelectorAll) return;
var cards = wrap.querySelectorAll('.char-card');
for (var i = 0; i < cards.length; i++) {
var id = cards[i].getAttribute('data-char') || '';
var lock = !heroUnlocked(id);
cards[i].classList.toggle('locked', lock);
var ci = document.querySelector('#cp-info .ci[data-char="' + id + '"]');
if (ci && ci.classList) ci.classList.toggle('locked', lock);
var ths = document.querySelectorAll('#cp-rack .cp-th[data-char="' + id + '"]');
for (var ti = 0; ti < ths.length; ti++) {
if (ths[ti].classList) ths[ti].classList.toggle('locked', lock);
}
if (lock) {
cards[i].setAttribute('aria-disabled', 'true');
cards[i].setAttribute('aria-label', t('char.locked.aria'));
} else {
cards[i].removeAttribute('aria-disabled');
cards[i].removeAttribute('aria-label');
}
}
}
function setChar(id) {
if (HERO_IDS.indexOf(id) < 0 || id === store.charId) return;
if (!heroUnlocked(id)) {
toast(t('char.locked.hint')); J.sfx.fail(); return;
}
store.charId = id;
persist();
syncCharPick();
applyCharSkin();
kdAvatarPaint();   /* [116] 메인 프로필 얼굴도 그 자리에서 */
J.sfx.ui();
// 고른 순간 그 캐릭터의 목소리를 한 번 들려준다 — 선택의 근거가 하나 더 는다.
J.sfx.voice(id, 3);
introGate(id, null);
}
function setMate(id) {
var v = (id === '' || MATE_IDS.indexOf(id) >= 0) ? id : '';
if (v && !petOwned(v)) {
toast(petLockText(v)); J.sfx.fail(); return;
}
if (v === mateId()) return;
store.mateId = v;
cpPetView = null;         /* 고른 순간 구경도 그것으로 맞춘다 */
persist();
syncCharPick();
cpPetStage();             /* W-B ③ — 고른 동료가 곧바로 무대에 선다 */
applyCharSkin();
J.sfx.ui();
if (v) J.sfx.voice(v, 3);
}
function passiveReset() {
S.pv = { hits: [], armed: false, stack: 0, seenTier: 0,
twLast: '', twAlt: 0, twSeen: 0,
pud: 1 };
syncTwChip();
mateChip('');
charFxTxt = ''; charFxJp = false;   /* 판정판 74 — 주인공 칩의 잭팟 강조 기억도 판 단위(charFx) */
}
var TW_STEP = 0.04;
var TW_MAX = 10;              // 배수 상한 = ×1.40. 배너 두 번째 임계와 같은 수
var TW_BANNER_AT = [5, 10];
var TW_COL = { sum10: '#3E8BF0', same: '#FF6B3D' };
function matchKind(va, vb) {
if (va === vb) return 'same';
if (va + vb === 10) return 'sum10';
return '';
}
function twMultOf(chain) {
var n = chain | 0;
if (n < 0) n = 0;
if (n > TW_MAX) n = TW_MAX;
return 1 + TW_STEP * n;
}
function twinApply(va, vb) {
var pv = S.pv, k = matchKind(va, vb);
if (skillOn('summon')) {
pv.twAlt++;
pv.twLast = (pv.twLast === 'sum10') ? 'same' : 'sum10';
var fs = 0;
for (var si = 0; si < TW_BANNER_AT.length; si++) {
if (pv.twAlt === TW_BANNER_AT[si] && pv.twSeen < TW_BANNER_AT[si]) {
pv.twSeen = TW_BANNER_AT[si];
fs = TW_BANNER_AT[si];
}
}
return { mult: twMultOf(pv.twAlt), kind: k || pv.twLast,
chain: pv.twAlt, fired: fs };
}
if (!k) return { mult: twMultOf(pv.twAlt), kind: '', chain: pv.twAlt, fired: 0 };
if (pv.twLast && k !== pv.twLast) pv.twAlt++;
else pv.twAlt = 0;
pv.twLast = k;
var fired = 0;
for (var i = 0; i < TW_BANNER_AT.length; i++) {
if (pv.twAlt === TW_BANNER_AT[i] && pv.twSeen < TW_BANNER_AT[i]) {
pv.twSeen = TW_BANNER_AT[i];
fired = TW_BANNER_AT[i];
}
}
return { mult: twMultOf(pv.twAlt), kind: k, chain: pv.twAlt, fired: fired };
}
function syncTwChip() {
var el = $('tw-chip');
if (!el) return;
var pv = S.pv;
if (!pv || !pv.twLast) { el.hidden = true; return; }
var next = pv.twLast === 'sum10' ? 'same' : 'sum10';
el.hidden = false;
el.style.setProperty('--tw-key', TW_COL[next]);
el.classList.toggle('tw-n-same', next === 'same');
var lab = $('tw-next');
if (lab) lab.textContent = t(next === 'same' ? 'tw.next.twin' : 'tw.next.ten');
var num = $('tw-n');
if (num) {
num.textContent = pv.twAlt > 0
? (pv.twAlt + ' · x' + twMultOf(pv.twAlt).toFixed(2))
: '';
}
}
function twinFx(tw, x, y) {
syncTwChip();
if (!tw.kind) return;
if (tw.chain > 0) {
J.burst(x, y, TW_COL[tw.kind], 8 + Math.min(12, tw.chain));
}
if (!tw.fired) return;
var el = multFxOn() ? null : $('tw-banner'), num = $('tw-num'), word = $('tw-word');
if (el) {
el.style.setProperty('--cb-key', TW_COL.same);
if (num) num.textContent = tw.fired + ' CHAIN!!';
if (word) word.textContent = t('tw.banner');
el.classList.remove('show');
void el.offsetWidth;
el.classList.add('show');
}
J.screenPulse();
J.vignette(tw.fired >= 10 ? 0.5 : 0.34);
J.sfx.tierUp(tw.fired >= 10 ? 3 : 2);
J.vibrate(26 + (tw.fired >= 10 ? 12 : 0));
scorePunch(true);
}
function pvChip(text, armed) {
var el = $('pv-chip'), v = $('pv-val');
if (!el) return;
if (!text) { el.hidden = true; el.classList.remove('pv-armed'); return; }
el.hidden = false;
el.style.setProperty('--pv-key', charKeyColor());
if (v) v.textContent = text;
el.classList.toggle('pv-armed', !!armed);
el.classList.remove('pv-pop');
void el.offsetWidth;
el.classList.add('pv-pop');
}
function mateChip(text, armed) {
var el = $('mate-chip');
if (!el) return;
if (!text) { el.hidden = true; el.classList.remove('pv-armed'); return; }
el.hidden = false;
el.textContent = text;
el.classList.toggle('pv-armed', !!armed);
}
var charFxTxt = '';     /* 마지막 자기 보너스 글자('+N%', 없으면 '') — 잭팟 강조를 내릴 때 되돌릴 값 */
var charFxJp = false;   /* 칩이 지금 잭팟 강조(x3!)인가. 둘 다 판 단위 — passiveReset 이 지운다 */
function charFx(st, x, y) {
var key = charKeyColor();
mateChip('');
if (!st) return;
if (st.own) {
var n = Math.round((st.det - 1) * 100);
charFxTxt = n > 0 ? ('+' + n + '%') : '';
}
if (st.jp) {
charFxJp = true;
pvChip('x' + JACKPOT_MULT + '!', true);
J.shockwave(x, y, key);
J.burst(x, y, key, 26);
J.burst(x, y, JELLY_ALT, 16);
J.vibrate(30);
J.sfx.jackpot();
heroSay('jackpot', 6);
mascotJelly();
floatOnBoard(x, y - 96, t('pv.jelly.hit'), key, 34);
return;
}
if (!st.own) {   /* 텐텐의 같은 수 매치·트윈의 합10 매치 — 칩을 새로 켜지 않는다(옛 빈도, 점검 W12) */
if (charFxJp) { charFxJp = false; pvChip(charFxTxt, false); }   /* 잭팟 강조만 한 번 내린다(리뷰 m-1 ①) */
return;
}
charFxJp = false;
pvChip(charFxTxt, false);
}
function comboTier(n) {
var v = n | 0, tr = 0;
for (var i = 0; i < COMBO_TIER_AT.length; i++) if (v >= COMBO_TIER_AT[i]) tr = i + 1;
return tr;
}
function comboScoreMult(combo, legacy) {
var c = combo | 0;
if (c <= COMBO_EXP_FROM) return c < 1 ? 1 : c;
var cap = legacy ? COMBO_MULT_CAP : COMBO_MULT_CAP_ADV;
var m = COMBO_EXP_FROM * Math.pow(COMBO_EXP_BASE, c - COMBO_EXP_FROM);
return m > cap ? cap : m;
}
function voiceTier(combo) {
var c = combo | 0;
if (c >= 16) return 6;
if (c >= 12) return 5;
if (c >= 8) return 4;
if (c === 6 || c === 7) return 3;
if (c === 4 || c === 5) return 2;
if (c === 2 || c === 3) return 1;
return 0;
}
var IW_POOL = 3;
var iwNodes = null, iwNext = 0;
function fxReduced() {
var mq = (typeof window !== 'undefined' && window.matchMedia)
? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
return !!(mq && mq.matches);
}
function iwEnsure() {
if (iwNodes) return iwNodes;
if (typeof document === 'undefined') return null;
var host = $('impact-layer');
if (!host) return null;
iwNodes = [];
for (var i = 0; i < IW_POOL; i++) {
var d = document.createElement('div');
d.className = 'iw';
var m = document.createElement('span'); m.className = 'iw-main';
var sb = document.createElement('span'); sb.className = 'iw-sub';
d.appendChild(m);
d.appendChild(sb);
(function (node) {
node.addEventListener('animationend', function (e) {
if (e.target !== node) return;
node.classList.remove('iw-show');
node.classList.remove('iw-heavy');
});
})(d);
host.appendChild(d);
iwNodes.push(d);
}
return iwNodes;
}
function impactWord(text, color, size, opts) {
var o = opts || {};
var nodes = iwEnsure();
if (!nodes) return;
var el;
if (typeof o.slot === 'number' && o.slot >= 0 && o.slot < IW_POOL) {
el = nodes[o.slot];
} else {
el = nodes[1 + (iwNext % (IW_POOL - 1))];
iwNext++;
}
var main = el.firstChild, sub = el.lastChild;
main.textContent = String(text);
if (o.sub) { sub.textContent = String(o.sub); sub.hidden = false; }
else { sub.textContent = ''; sub.hidden = true; }
el.style.setProperty('--iw-key', color || '#FFD34D');
el.style.setProperty('--iw-size', Math.round(iwFit(main.textContent, size || 56)) + 'px');
el.style.setProperty('--iw-top', o.topCss || ((o.top || 34) + '%'));
el.style.setProperty('--iw-dur', Math.round(o.dur || 900) + 'ms');
el.classList.remove('iw-show');
el.classList.remove('iw-heavy');
el.classList.remove('iw-still');
if (o.band) el.classList.add('iw-band');
else el.classList.remove('iw-band');
if (o.plate) el.classList.add('iw-plate');
else el.classList.remove('iw-plate');
if (el.iwT) { clearTimeout(el.iwT); el.iwT = 0; }
void el.offsetWidth;
if (fxReduced()) {
el.classList.add('iw-still');
var hold = Math.round(o.dur || 900);
if (hold < 1400) hold = 1400;
el.iwT = setTimeout(function () {
el.iwT = 0;
el.classList.remove('iw-still');
}, hold);
return;
}
if (o.heavy) el.classList.add('iw-heavy');
el.classList.add('iw-show');
}
function impactFlash() {
if (fxReduced()) return;
var host = $('impact-layer');
if (!host || !host.classList) return;
host.classList.remove('iw-flash');
void host.offsetWidth;
host.classList.add('iw-flash');
}
function multColor(m) {
if (m >= 16) return '#FFF3B0';
if (m >= 8) return '#FF4FA3';
if (m >= 5) return '#FF6B3D';
if (m >= 3) return '#FFB03D';
return '#FFD34D';
}
function multSize(m) {
var v = 62 + (m > 20 ? 20 : m) * 3.4;
return v > 128 ? 128 : v;
}
var MULT_BAND_K = 0.4;       /* 종전 크기의 40% 상한 — 사용자 지시 그대로 */
var MULT_BAND_FILL = 0.68;   /* 띠 세로 여유 중 글자가 쓰는 비율(나머지는 숨통) */
var MULT_BAND_MIN = 14;      /* 이보다 작으면 읽을 수 없다 — 그 아래로는 안 간다 */
var multLifeCache = 0;
function multLifeMs() {
if (multLifeCache) return multLifeCache;
var v = 0;
try {
var raw = window.getComputedStyle(document.documentElement)
.getPropertyValue('--mo-mult-life');
v = parseFloat(raw);
if (isFinite(v) && v > 0 && String(raw).indexOf('ms') < 0) v *= 1000;
} catch (e) { v = 0; }
multLifeCache = (isFinite(v) && v > 0) ? v : 1000;   /* 토큰을 못 읽을 때의 안전값 */
return multLifeCache;
}
function multBandGap() {
var vh = (typeof window !== 'undefined' ? (window.innerHeight || 844) : 844);
var top = 0, i, el, r;
var bot = 0, br = null;
el = $('board') || $('board-scroll');
if (el && el.getBoundingClientRect) {
br = el.getBoundingClientRect();
if (br.height > 0) bot = br.top;
}
var side = !!(br && br.width > 0 && battleOn() && battleStage());
var ids = ['duel-hud', 'classic-hud', 'topbar', 'tb-stats', 'hud-row', 'boss-bar'];
for (i = 0; i < ids.length; i++) {
el = $(ids[i]);
if (!el || el.hidden || !el.getBoundingClientRect) continue;
r = el.getBoundingClientRect();
if (r.width <= 0 || r.height <= 0) continue;
if (side && (r.right <= br.left || r.left >= br.right)) continue;
if (r.bottom > top) top = r.bottom;
}
if (!(bot > 0) || !(bot > top)) { top = vh * 0.06; bot = vh * 0.18; }
return { top: top, bot: bot };
}
function multBandWord(m, sub) {
var g = multBandGap();
var gap = g.bot - g.top;
var size = multSize(m) * MULT_BAND_K;
var byGap = gap * MULT_BAND_FILL;
if (byGap < size) size = byGap;
if (size < MULT_BAND_MIN) size = MULT_BAND_MIN;
var half = size * 0.47 + size * 0.105 + 2;
var y = (g.top + g.bot) / 2;
if (y + half > g.bot) y = g.bot - half;      /* 판 위 끝을 넘지 않는다 */
if (y - half < 0) y = half;                  /* 화면 위로도 안 나간다 */
impactWord('×' + m, multColor(m), size,
{ topCss: Math.round(y * 10) / 10 + 'px', dur: multLifeMs(),
sub: sub, plate: true, band: true, slot: 0 });
return { y: y, size: size, gap: gap };       /* smoke 가 읽는다 */
}
var multFxUntil = 0;
function multFxOn() { return now() < multFxUntil; }
function iwFit(text, size) {
var w = (typeof window !== 'undefined' ? (window.innerWidth || 390) : 390) * 0.92;
var em = 0;
for (var i = 0; i < text.length; i++) {
var c = text.charCodeAt(i);
if (c > 0x2E7F) em += 1.02;
else if (c === 33 || c === 46 || c === 44) em += 0.34;
else em += 0.62;
}
if (em <= 0) return size;
var cap = w / em;
if (cap < 26) cap = 26;
return size > cap ? cap : size;
}
function awakenBlast(kind) {
if (typeof window === 'undefined') return;
var col = charKeyColor() || '#FFD34D';
var reduced = fxReduced();
var st = awkStreak | 0;
if (st < 1) st = 1;
if (st > 5) st = 5;
var w = window.innerWidth || 360, h = window.innerHeight || 640;
var bc = boardCenter();
impactWord(t('fx.awaken'), col, 62 + st * 6, {
sub: st >= 2 ? t('fx.awaken.chain', { n: st }) : '',
top: 40, dur: 1150, heavy: true
});
J.sfx.tierUp(st >= 3 ? 4 : 3);
J.screenPulse();
J.vignette(Math.min(0.9, 0.62 + st * 0.06));
J.vibrate(reduced ? 40 : 90);
if (reduced) { J.shockwave(w * 0.5, h * 0.5, col, { fill: 0.52, scale: 1.2, sparks: 8 }); return; }
impactFlash();
J.burst(bc.x, bc.y, col, 18);
var cx = w * 0.5, cy = h * 0.5;
var wave = [
{ d: 0,   c: col,       f: 0.62, sc: 0.85, sp: 14 },
{ d: 90,  c: '#FFFFFF', f: 0.42, sc: 1.25, sp: 10 },
{ d: 190, c: col,       f: 0.38, sc: 1.75, sp: 16 },
{ d: 310, c: col,       f: 0.30, sc: 2.30, sp: 12 }
];
var n = st >= 3 ? wave.length : 3;
for (var i = 0; i < n; i++) {
(function (p) {
if (p.d === 0) { J.shockwave(cx, cy, p.c, { fill: p.f, scale: p.sc, sparks: p.sp }); return; }
later(function () { J.shockwave(cx, cy, p.c, { fill: p.f, scale: p.sc, sparks: p.sp }); }, p.d);
})(wave[i]);
}
later(function () { J.vibrate(60); }, 110);
later(function () { J.screenPulse(); J.vibrate(120); }, 230);
if (st >= 3) later(function () { J.vibrate(70); }, 380);
later(function () { J.confetti(bc.x, bc.y); }, 150);
}
var finishFxIds = [];
function finishFxClear() {
for (var i = 0; i < finishFxIds.length; i++) clearTimeout(finishFxIds[i]);
finishFxIds.length = 0;
}
function finishBlast() {
if (typeof window === 'undefined') return;
finishFxClear();
var reduced = fxReduced();
impactWord(t('fx.finish'), '#FFE27A', 82, {
sub: t('fx.finish.sub'), top: 46, dur: 1250, heavy: true
});
if (reduced) return;
impactFlash();
var w = window.innerWidth || 360, h = window.innerHeight || 640;
var fcx = w * 0.5, fcy = h * 0.5;
var pts = [
{ d: 0,   c: '#FFFFFF', f: 0.58, sc: 0.9, sp: 14 },
{ d: 110, c: '#FFE27A', f: 0.44, sc: 1.4, sp: 12 },
{ d: 240, c: '#FFE27A', f: 0.38, sc: 1.9, sp: 16 },
{ d: 380, c: '#FF6B3D', f: 0.30, sc: 2.4, sp: 12 }
];
for (var i = 0; i < pts.length; i++) {
(function (p) {
finishFxIds.push(setTimeout(function () {
J.shockwave(fcx, fcy, p.c, { fill: p.f, scale: p.sc, sparks: p.sp });
}, p.d));
})(pts[i]);
}
finishFxIds.push(setTimeout(function () { J.vibrate(70); }, 90));
finishFxIds.push(setTimeout(function () { J.screenPulse(); J.vibrate(130); }, 320));
finishFxIds.push(setTimeout(function () { J.vibrate(60); }, 460));
finishFxIds.push(setTimeout(function () { J.confetti(w * 0.5, h * 0.42); }, 360));
}
function comboBanner(combo) {
var tr = comboTier(combo);
if (tr <= 0 || tr <= S.pv.seenTier) return;
S.pv.seenTier = tr;
if (multFxOn()) return;
var el = $('combo-banner'), num = $('cb-num'), word = $('cb-word');
if (!el) return;
var col = comboColor(COMBO_TIER_AT[tr - 1]);
el.style.setProperty('--cb-key', col);
if (num) num.textContent = COMBO_TIER_AT[tr - 1] + ' COMBO!!';
if (word) word.textContent = t('combo.tier' + tr);
el.classList.remove('show');
void el.offsetWidth;
el.classList.add('show');
J.screenPulse();
J.vignette(Math.min(0.55, 0.2 + tr * 0.1));
J.sfx.tierUp(tr);
J.vibrate(26 + tr * 6);
scorePunch(true);
heroSay('tier', 5);
}
function scorePunch(big) {
var el = $('score-val');
if (!el) return;
el.classList.remove('punch', 'punch-big');
void el.offsetWidth;
el.classList.add(big ? 'punch-big' : 'punch');
}
function syncBgmIntensity() {
var base = isRush() ? 1 : (S.stage >= 10 ? 1 : 0);
var lift = S.feverOn ? 2 : 0;
J.bgm.setIntensity(Math.min(3, base + lift + (S.hurryLift | 0)));
}
function fxBusy() {
return !!(S.paused || S.bangOn || S.cutOn || S.hurryOn);
}
var hitStopUntil = 0;
function hitStop(ms) {
var n = ms | 0;
if (n <= 0) return;
var until = now() + n;
if (until <= hitStopUntil) return;
hitStopUntil = until;
setAppClass('hitstop', true);
later(function () {
if (now() + 8 < hitStopUntil) return;   // 나중 호출이 더 멀리 밀어 놨다
hitStopUntil = 0;
setAppClass('hitstop', false);
}, n);
}
function shakeScreen(level) {
var k = clamp(level | 0, 1, 3);
var el = $('app');
if (!el || !el.classList) return;
el.classList.remove('shk1', 'shk2', 'shk3');
void el.offsetWidth;                       // 다시 걸어야 재생된다 (duelHudFlash 와 같은 문법)
el.classList.add('shk' + k);
later(function () { if (el.classList) el.classList.remove('shk' + k); }, 120 + k * 90);
}
function gaugeGain(combo) {
var c = combo | 0;
if (c < 1) c = 1;
if (c > SKILL_COMBO_CAP) c = SKILL_COMBO_CAP;
return SKILL_BASE + SKILL_COMBO * c;
}
var SKILL_KIND = { jelly: 'jellytime', sodawitch: 'soda' };   /* 74 — 탄산 주문은 젤리 타임과 다른 스킬(모든 매치 ×1.4, 수치안 §5-1 W1) */
function skillKindOf(id) { return SKILL_KIND[id] || 'summon'; }
function skillCastOf(id) {
if (id === 'ten') return 'twin';
if (id === 'twin') return 'ten';
return id;
}
function skillSyl(id) {
var s = (I18N.ko && I18N.ko['char.' + id + '.passname']) || '';
var n = s.replace(/[^가-힣]/g, '').length;
return n > 0 ? n : 6;
}
function gaugeFull() { return store.gauge >= SKILL_MAX; }
function skillOn(kind) {
if (!S.skillKind) return false;
return kind ? S.skillKind === kind : true;
}
function gaugeBump(combo) {
if (isClassic()) return;
if (!battleOn()) return;
var was = gaugeFull();
store.gauge = clamp(store.gauge + gaugeGain(combo) * (battleOn() ? AWAKEN_GAIN_K : 1),
0, SKILL_MAX);
if (!was && gaugeFull()) {
if (battleOn() && J.sfx.awakenMax) J.sfx.awakenMax(); else J.sfx.mission();
J.vibrate(battleOn() ? 40 : 24);
if (battleOn()) {
fullCue('btn-shuffle');
tipOnce('awakenReady', 'tip.awakenReady');
}
}
syncSkill();
}
function syncSkill() {
setAppClass('skill-full', S.mode === 'adv' && !!S.running && !battleOn()
&& gaugeFull() && !S.skillKind);
var el = $('skill-btn');
if (!el) return;
if (battleOn()) { el.hidden = true; return; }
var live = S.mode === 'adv' && S.running;
el.hidden = !live;
if (!live) return;
var id = charId();
var pct = clamp(store.gauge, 0, SKILL_MAX) / SKILL_MAX;
el.style.setProperty('--sk', String(pct));
el.style.setProperty('--sk-key', charKeyColor());
var full = gaugeFull();
el.classList.toggle('full', full && !S.skillKind);
el.classList.toggle('live', !!S.skillKind);
el.setAttribute('aria-disabled', (full && !S.skillKind && !fxBusy()) ? 'false' : 'true');
var av = $('skill-av');
if (av) {
var cls = (CHARS[id] && CHARS[id].cls) || 'ch-ten';
if (av.getAttribute('data-ch') !== cls) {
av.setAttribute('data-ch', cls);
av.className = 'skill-av ' + cls;
av.innerHTML = '';
var src = document.querySelector
? document.querySelector('#char-pick .char-card[data-char="' + id + '"] .cav')
: null;
if (src && src.cloneNode) av.appendChild(src.cloneNode(true));
setStdArt(av, id, 'face', '--slot-std');   /* 14차 수리 8 (§26-3b) */
}
}
var left = S.skillKind ? Math.max(0, S.skillUntil - now()) : 0;
setText('skill-pct', S.skillKind
? (Math.ceil(left / 1000) + 's')
: (full ? t('skill.ready') : (Math.floor(pct * 100) + '%')));
}
function cutinReset() {
// W7.5 — 하드 티어다운도 예약을 걷는다(endCutin 과 같은 이유).
if (cutTimer) { clearTimeout(cutTimer); cutTimer = 0; }
S.cutOn = false;
S.cutAt = 0;
S.cutFn = null;
setAppClass('cutin', false);
var el = $('cutin');
if (el) { el.classList.remove('go'); el.hidden = true; }
if (el && el.style && el.style.removeProperty) el.style.removeProperty('--cutin-img');
}
var cutTimer = 0;
function cutinHoldMs() {
var mq = (typeof window !== 'undefined' && window.matchMedia)
? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
return (mq && mq.matches) ? SKILL_CUTIN_REDUCED_MS : SKILL_CUTIN_MS;
}
function runCutin(castId, nameKey, then, opt) {
var o = opt || {};
if (fxBusy()) { if (then) then(); return; }
S.cutOn = true;
S.cutAt = now();
S.cutFn = then || null;
S.paused = true;
S.pausedAt = now();
stopComboLoop();
stopFeverLoop();
setAppClass('cutin', true);
var el = $('cutin');
if (el) {
el.className = 'cut-' + castId + (o.cls ? (' ' + o.cls) : '');
var art = $('cutin-av');
if (art) {
art.className = 'cutin-av ' + ((CHARS[castId] && CHARS[castId].cls) || 'ch-ten');
art.innerHTML = '';
if (o.noAv) {
if (art.removeAttribute) art.removeAttribute('data-art');
if (art.style && art.style.removeProperty) art.style.removeProperty('--slot-std');
} else {
var src = document.querySelector
? document.querySelector('#char-pick .char-card[data-char="' + castId + '"] .cav')
: null;
if (src && src.cloneNode) art.appendChild(src.cloneNode(true));
setStdArt(art, castId, 'full', '--slot-std');   /* 14차 수리 8 (§26-3b) */
}
}
el.style.setProperty('--cut-key', o.key || (CHARS[castId] || CHARS.ten).key);
if (o.img) el.style.setProperty('--cutin-img', o.img);
else if (el.style.removeProperty) el.style.removeProperty('--cutin-img');
var cutImg = $('cutin-img');
if (cutImg && cutImg.toggleAttribute) cutImg.toggleAttribute('data-cut', !!(o.img && o.cut));
setText('cutin-name', o.shout ? t('skill.shout', { name: t(nameKey).toUpperCase() }) : t(nameKey));
setText('cutin-sub', t(o.subKey || 'skill.sub'));
el.hidden = false;
el.classList.remove('go');
void el.offsetWidth;
el.classList.add('go');
}
if (o.sfx) o.sfx(); else J.sfx.tierUp(3);
J.screenPulse();
J.vignette(o.vig === undefined ? 0.5 : o.vig);
J.vibrate(50);
var vid = (o.voice === undefined) ? castId : o.voice;
if (vid) later(function () { J.sfx.voice(vid, 6, 0, o.syl | 0); }, 200);
cutTimer = later(function () { endCutin(false); }, cutinHoldMs());
}
function endCutin(skip) {
if (!S.cutOn) return;
if (skip && (now() - S.cutAt) < SKILL_CUTIN_MIN_MS) return;
// W7.5 — 두 가드를 통과해 **실제로 끝내기로 한** 뒤에 끈다. 가드 위에서
// 끄면 너무 이른 스킵 탭이 정상 종료 타이머까지 지워 컷인이 안 걷힌다.
if (cutTimer) { clearTimeout(cutTimer); cutTimer = 0; }
var fn = S.cutFn;
S.cutOn = false;
S.cutFn = null;
setAppClass('cutin', false);
var el = $('cutin');
if (el) { el.classList.remove('go'); el.hidden = true; }
if (S.running) {
var held = S.pausedAt ? Math.max(0, now() - S.pausedAt) : 0;
S.pausedAt = 0;
S.paused = false;
shiftDeadlines(held, false);
if (S.duel && S.duel.mgLastShotAt) S.duel.mgLastShotAt += held;
} else {
S.paused = false;
S.pausedAt = 0;
}
if (fn) fn();
}
function canFireSkill() {
return (battleOn() || S.mode === 'adv') && S.running && !fxBusy() &&
!S.skillKind && gaugeFull();
}
function fireSkill() {
if (!canFireSkill()) {
if ((battleOn() || S.mode === 'adv') && S.running && !S.skillKind && !gaugeFull()) {
toast(t('skill.notyet', { n: duelGaugePct() }));
J.sfx.fail();
}
return;
}
store.gauge = 0;
persist();
meCastFx($('btn-shuffle'));     /* [판정판 130] 전투에서만 낸다(함수 안에서 battleOn 확인) — 영웅 시전 연출 + 단추 후광 퍼짐 */
castSkill(charId(), true);
}
function castSkill(id, selfHit) {
var kind = skillKindOf(id);
var cast = skillCastOf(id);
var nameKey = 'skill.' + id + '.name';
runCutin(cast, nameKey, function () {
applySkill(kind);
if (selfHit) {
var p = S.advPlan;
if (p && p.boss && !S.bossDown) {
bossDamage(bossUltDmg(p.n) * BOSS_ULT_SELF, true);
}
}
}, { syl: skillSyl(id), shout: true });
}
function applySkill(kind) {
S.skillKind = kind;
S.skillUntil = now() + (SKILL_MS[charId()] || 6000);
setAppClass('skill', true);
setAppClass('skill-jelly', kind === 'jellytime' || kind === 'soda');
awkStreak++;
store.awkTotal = (store.awkTotal | 0) + 1;
dqBump('awaken', 1);
achvCheck();
if (kind === 'summon') {
var pv = S.pv;
if (pv) {
if (pv.twAlt < SKILL_TW_HEAD) pv.twAlt = SKILL_TW_HEAD;
if (pv.twSeen < SKILL_TW_HEAD) pv.twSeen = SKILL_TW_HEAD;
if (!pv.twLast) pv.twLast = 'sum10';
}
syncTwChip();
}
awakenBlast(kind);
toast(t('skill.on.' + charId()));
mascotCheer(8);
syncSkill();
syncHud();
}
function skillTick() {
if (!S.skillKind) return;
if (S.paused) return;                 // 정지 중에는 흐르지 않는다 (불이익 0)
if (now() >= S.skillUntil) { endSkill(); return; }
syncSkill();
}
function endSkill() {
if (!S.skillKind) return;
S.skillKind = '';
S.skillUntil = 0;
setAppClass('skill', false);
setAppClass('skill-jelly', false);
J.sfx.ui();
syncSkill();
}
function skillReset() {
S.skillKind = '';
S.skillUntil = 0;
setAppClass('skill', false);
setAppClass('skill-jelly', false);
cutinReset();
syncSkill();
}
function setAppClass(name, on) {
if (typeof document === 'undefined') return;
var app = $('app') || document.body;
if (app && app.classList) app.classList.toggle(name, !!on);
}
function stopFeverLoop() {
if (rafFever) { cancelAnimationFrame(rafFever); rafFever = 0; }
}
function boardCenter() {
var b = $('board');
if (b && b.getBoundingClientRect) {
var r = b.getBoundingClientRect();
if (r.width > 0 && r.height > 0) {
return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}
}
var vw = 0, vh = 0;
try {
if (typeof window !== 'undefined') {
vw = window.innerWidth || 0;
vh = window.innerHeight || 0;
}
} catch (e) { /* ignore */ }
return { x: vw / 2, y: vh / 2 };
}
function feverLoop() {
rafFever = 0;
if (!S.feverOn) return;
var left = S.feverUntil - now();
var fill = $('fever-fill');
if (left <= 0) { endFever(); return; }
if (fill) fill.style.setProperty('--p', clamp(left / FEVER_MS, 0, 1).toFixed(3));
if (!S.paused) rafFever = requestAnimationFrame(feverLoop);
}
function startFever() {
if (!featuresOn() || S.feverOn) return;
if (S.feverCdUntil && now() < S.feverCdUntil) return;
S.feverOn = true;
S.feverUntil = now() + FEVER_MS;
S.feverScore = 0;
var bar = $('fever-bar');
if (bar) bar.hidden = false;
setAppClass('fever', true);
J.sfx.feverOn();
J.feverAura(true);
var bc = boardCenter();
J.feverEnter(bc.x, bc.y);
J.bgm.setFever(true);   // opens the BGM filter for as long as fever lasts
syncBgmIntensity();     // ...and fever is worth two layers on top of the stage base
mascotFever(true);
J.vibrate(30);
missionBump('fever', 1);
if (typeof window !== 'undefined') {
J.floatText(window.innerWidth / 2, window.innerHeight * 0.34, t('fever.on'), '#ff4fc3');
}
stopFeverLoop();
rafFever = requestAnimationFrame(feverLoop);
}
function tickFever() {
if (S.feverOn && now() >= S.feverUntil) endFever();
}
function extendFever() {
if (!S.feverOn) return;
var left = Math.min(FEVER_MAX_MS, (S.feverUntil - now()) + FEVER_STEP_MS);
S.feverUntil = now() + Math.max(0, left);
}
function endFever(silent) {
var was = S.feverOn;
var gained = S.feverScore | 0;
S.feverOn = false;
S.feverUntil = 0;
S.feverScore = 0;
if (was) S.feverCdUntil = now() + FEVER_CD_MS;
stopFeverLoop();
var fill = $('fever-fill');
if (fill) fill.style.setProperty('--p', '0');
var bar = $('fever-bar');
if (bar) bar.hidden = true;
setAppClass('fever', false);
J.feverAura(false);
J.bgm.setFever(false);
syncBgmIntensity();
mascotFever(false);
if (was && !silent) {
J.sfx.feverOff();
if (typeof window !== 'undefined') {
J.floatText(window.innerWidth / 2, window.innerHeight * 0.34,
t('fever.off', { score: gained }), '#ffd94a');
}
}
}
function missionPool(stage, mode, cellCount) {
var n = cellCount || 30;
// combo5 / sprint / col are pure classic mechanics — no special tile has to
// exist for them, so they are available from stage 1 and in Daily.
var pool = ['sum10', 'same', 'rows', 'noadd', 'combo5', 'sprint'];
// "Clear column N" is only offered once the board is at least one full row,
// i.e. every column is actually populated. genBoard never goes below 25
// cells, but the guard keeps the invariant local and checkable.
if (n >= COLS) pool.push('col');
if (mode === 'daily') return pool;                 // classic mechanics only
var specialsExist = (mode === 'rush') || stage >= SP_STAGE_MIN;
if (specialsExist) {
pool.push('special');
pool.push('fever');
if (specialKinds(stage, mode).bomb) pool.push('bomb');
}
return pool;
}
function pickMission(seed, cellCount, stage, mode, avoidId) {
var n = cellCount || 30;
var pool = missionPool(stage || 1, mode || 'endless', n);
if (avoidId) {
var trimmed = [];
for (var i = 0; i < pool.length; i++) {
if (pool[i] !== avoidId) trimmed.push(pool[i]);
}
if (trimmed.length) pool = trimmed;
}
var r = mulberry32(((seed >>> 0) ^ 0x5BF03635) >>> 0);
var id = pool[clamp((r() * pool.length) | 0, 0, pool.length - 1)];
var goalFn = MISSION_GOALS[id];
// The rng is handed on so a goal can be seeded too (MISSION_GOALS.col picks
// which column) while staying a pure function of `seed`.
return { id: id, goal: goalFn ? goalFn(n, r) : 5, prog: 0, done: false };
}
function capSpecialMission(m) {
if (!m || m.id !== 'special') return m;
var have = countSpecials(S.cells);
m.goal = Math.max(1, Math.min(m.goal, have > 0 ? have : 1));
return m;
}
function missionText(m) {
if (!m) return '';
if (finishOn()) return t('finish.mission.' + m.id, { goal: m.goal });
return t('mission.' + m.id, { goal: m.goal });
}
function missionMode() {
return S.mode === 'endless' || S.mode === 'adv' || S.mode === 'classic';
}
function missionsOn() { return missionMode() && (featuresOn() || isClassic()); }
function syncMission() {
var badge = $('mission-badge');
var live = !!S.mission && missionsOn() && (!battleOn() || finishOn());
if (badge && badge.hidden !== !live) badge.hidden = !live;
if (!live) return;
setText('mission-text', missionText(S.mission));
// `col`'s goal is a column NUMBER, so the progress readout is a plain 0/1.
var shownGoal = S.mission.id === 'col' ? 1 : S.mission.goal;
setText('mission-prog', t('mission.prog', { n: S.mission.prog, goal: shownGoal }));
if (badge && badge.classList) badge.classList.toggle('done', !!S.mission.done);
var mt = $('mission-time');
if (!mt) return;
var left = missionLeftMs();
var timed = S.missionUntil > 0 && !S.mission.done;
mt.hidden = !timed;
if (timed) mt.textContent = fmtTime(Math.ceil(left / 1000));
if (badge && badge.classList) {
badge.classList.toggle('warn', timed && left <= ADV_MISSION_WARN_MS);
badge.classList.toggle('expired', S.missionUntil < 0);
}
}
function missionLeftMs() {
if (!(S.missionUntil > 0)) return 0;
var d = S.missionUntil - now();
return d > 0 ? d : 0;
}
function missionBump(kind, n) {
var m = S.mission;
if (battleOn() && !finishOn()) return;   // 반려 ② — 전투에는 미션이 없다(syncMission 주석)
if (!m || m.done || !missionsOn()) return;
// 시간 초과된 미션은 더 이상 진행되지 않는다 (실패해도 스테이지는 계속된다).
if (S.missionUntil < 0) return;
if (m.id !== kind) return;
if (m.id === 'sprint') {
if (!S.sprintTimes) S.sprintTimes = [];
var tn = now();
S.sprintTimes.push(tn);
var cut = tn - (S.sprintWin > 0 ? S.sprintWin : MISSION_SPRINT_MS);
while (S.sprintTimes.length && S.sprintTimes[0] < cut) S.sprintTimes.shift();
m.prog = Math.min(S.sprintTimes.length, m.goal);
} else {
m.prog += (n || 1);
}
if (m.prog >= m.goal) { m.prog = m.goal; completeMission(); }
syncMission();
}
function columnCleared(col) {
if (col < 0 || col >= COLS) return false;
var seen = false;
for (var i = col; i < S.cells.length; i += COLS) {
var c = S.cells[i];
if (!c) continue;
seen = true;
if (!c.dead) return false;
}
return seen;
}
function checkColumnMission() {
var m = S.mission;
if (battleOn()) return;              // 반려 ② — missionBump 과 같은 게이트
if (!m || m.done || m.id !== 'col') return;
if (!missionsOn() || S.missionUntil < 0) return;
if (!columnCleared((m.goal | 0) - 1)) return;
m.prog = 1;
completeMission();
syncMission();
}
function completeMission() {
var m = S.mission;
if (!m || m.done) return;
m.done = true;
S.missionUntil = 0;                // 성공했으므로 시계는 더 이상 의미가 없다
var missionPts = MISSION_SCORE * awakenMult();   // 74 — 각성 ×2 는 얻는 점수 전부(§27.3). 아래 토스트도 이 한 값을 쓴다
S.score += missionPts;
S.adds += 1;                       // reward loops straight back into resources
badgePop('mission-badge');
badgePop('add-badge');
J.sfx.mission();
J.vibrate(30);
if (typeof window !== 'undefined') {
J.confetti(window.innerWidth / 2, window.innerHeight * 0.3);
J.floatText(window.innerWidth / 2, window.innerHeight * 0.4, t('mission.done'), '#7affc0');
}
heroSay('mission');
if (S.mode === 'adv') {
S.missionMult = ADV_MISSION_MULT;
toast(t('adv.missionwin', { mult: ADV_MISSION_MULT }));
bossOnMissionDone();
} else {
toast(t('mission.reward', { score: missionPts }));
}
syncHud();
}
function rushLeftMs() {
return isRush() ? Math.max(0, S.rushEndAt - now()) : 0;
}
function rushMatchMs() {
if (S.rushStartedAt && now() - S.rushStartedAt >= RUSH_DECAY_AFTER) {
return RUSH_MATCH_LATE_MS;
}
return RUSH_MATCH_MS;
}
function addRushTime(ms) {
if (!isRush()) return;
var left = rushLeftMs();
if (left >= RUSH_LEFT_CAP_MS) return;            // no gain, no flash
var gain = Math.min(ms, RUSH_LEFT_CAP_MS - left);
if (gain <= 0) return;
S.rushEndAt += gain;
var el = $('rush-timer');
if (el && el.classList) {
el.classList.remove('gain');
void el.offsetWidth;
el.classList.add('gain');
}
}
function setDanger(on) {
setAppClass('danger', on);
J.bgm.setPanic(on);
}
function duelTimerGlyphs(dt, txt) {
if (!dt || dt.getAttribute('data-tg') === txt) return;
var prev = dt.getAttribute('data-tg') || '', i;
if (prev.length !== txt.length) {
while (dt.firstChild) dt.removeChild(dt.firstChild);   /* 마크업 초기값 "0:00" 포함 */
for (i = 0; i < txt.length; i++) dt.appendChild(document.createElement('i'));
prev = '';
}
for (i = 0; i < txt.length; i++) {
if (prev.charAt(i) === txt.charAt(i)) continue;        /* 안 바뀐 자리는 무접촉 */
var c = txt.charAt(i);
dt.childNodes[i].className = 'tg tg-' + (c === ':' ? 'colon' : c);
}
dt.setAttribute('data-tg', txt);
dt.setAttribute('aria-label', txt);
}
function syncRushHud() {
var timed = isRush() || S.mode === 'adv';
var el = $('rush-timer');
var txt = finishOn() ? fmtTime(Math.ceil(finishLeftMs() / 1000))
: isRush() ? fmtTime(Math.ceil(rushLeftMs() / 1000))
: S.mode === 'adv' ? fmtTime(Math.ceil(advLeftMs() / 1000)) : '';
if (el) {
if (el.hidden !== !timed) el.hidden = !timed;
if (txt && el.textContent !== txt) el.textContent = txt;
}
if (txt && battleOn()) {
var dt = $('duel-timer');
duelTimerGlyphs(dt, txt);
}
if (!timed) setDanger(false);
syncAdvGoal();
}
function stopRush() {
if (rushInt) { clearInterval(rushInt); rushInt = 0; }
setDanger(false);
}
function startRushLoop() {
stopRush();
rushInt = setInterval(function () {
if (!isRush() || !S.running) return;
if (S.paused) return;
if (battleOn()) duelChillTick();
var left = rushLeftMs();
syncRushHud();
syncHud();
var danger = left <= RUSH_DANGER_MS && left > 0;
setDanger(danger);
if (danger && now() - S.rushBeatAt >= 1000) {   // one beat per second
S.rushBeatAt = now();
J.sfx.heartbeat();
}
maybeHurry(left);          // v4 §6.5 — 20초 지점. 10초 패닉의 윗단이다
if (battleOn()) { skillTick(); awakenTick(); }
if (battleOn()) duelTick();
if (!S.running) return;    // 위에서 격파·KO 로 판이 끝났을 수 있다
if (left <= 0) {
stopRush();
if (isArcadeDuel()) arcFinish('timeup');
else onGameOver();
}
}, 200);
}
var HURRY_AT_MS = 20000;      // 발동 지점(잔여 20초). RUSH_DANGER_MS 의 두 배
var HURRY_MS = 1600;          // 총 길이. 스펙 ~1.5초 + 퇴장 여유
function hurryReset() {
S.hurryDone = false;
S.hurryLift = 0;
S.hurryOn = false;          // v4 5차: 겹침 순서를 fxBusy() 한 곳에서 읽기 위한 플래그
setAppClass('hurry', false);
var el = $('hurry');
if (el) { el.classList.remove('go'); el.hidden = true; }
tsOverlayClose();
setAppClass('freelink', false);
if (S.duel) { S.duel.freeLinkUntil = 0; S.duel.tsOverlayUntil = 0; }
}
function maybeHurry(left) {
if (!isRush() && S.mode !== 'adv') return;
if (S.hurryDone || !S.running || fxBusy()) return;
if (left > HURRY_AT_MS || left <= RUSH_DANGER_MS) return;
S.hurryDone = true;
runHurry();
}
function runHurry() {
// ① 타임스톱 — pause() 와 같은 손동작, 모달만 없다.
S.hurryOn = true;
S.paused = true;
S.pausedAt = now();
stopComboLoop();
stopFeverLoop();
setAppClass('hurry', true);      // 화면이 살짝 어두워진다(젤리들이 얼어붙는다)
var el = $('hurry');
if (el) {
var cid = charId();
var asJelly = cid === 'jelly';
el.classList.toggle('hu-prince', asJelly);
var cast = $('hurry-cast');
if (cast) setStdArt(cast, cid, 'face', '--hu-face');
var big = $('hurry-big'), line = $('hurry-line');
if (big) big.textContent = t('hurry.big');
if (line) line.textContent = t(asJelly ? 'hurry.prince' : 'hurry.princess');
el.hidden = false;
el.classList.remove('go');
void el.offsetWidth;
el.classList.add('go');
}
J.sfx.hurry();
J.vibrate(60);
J.screenPulse();
later(function () {
if (charId() === 'jelly') J.sfx.voice('twin', 4);   // "조금만 버텨!"
else J.sfx.cry();                                    // 울먹이는 공주
}, 520);
later(endHurry, HURRY_MS);
}
function endHurry() {
S.hurryOn = false;
setAppClass('hurry', false);
var el = $('hurry');
if (el) { el.classList.remove('go'); el.hidden = true; }
if (!S.running) { S.paused = false; S.pausedAt = 0; return; }
var held = S.pausedAt ? Math.max(0, now() - S.pausedAt) : 0;
S.pausedAt = 0;
S.paused = false;
shiftDeadlines(held, false);
// ④ BGM 긴장 레이어 1단. 이후 10초 패닉의 템포 상승이 그 위에 또 얹힌다.
S.hurryLift = 1;
syncBgmIntensity();
}
var GRADE_REF_CELLS = 36;   // the board the 45/75/120/180s buckets came from
function gradeFor(addsLeft, maxCombo, sec, addsMax, cells) {
var max = (addsMax && addsMax > 0) ? addsMax : 5;
var scale = (cells && cells > 0) ? (cells / GRADE_REF_CELLS) : 1;
var t = sec / scale;
var pts = clamp(addsLeft / max, 0, 1) * 40;
pts += maxCombo >= 8 ? 30 : (maxCombo >= 6 ? 24 : (maxCombo >= 4 ? 16 : (maxCombo >= 2 ? 8 : 0)));
pts += t <= 45 ? 30 : (t <= 75 ? 22 : (t <= 120 ? 12 : (t <= 180 ? 5 : 0)));
return pts >= 78 ? 'S' : (pts >= 58 ? 'A' : (pts >= 35 ? 'B' : 'C'));
}
function showGrade(rank) {
var el = $('clear-grade');
if (!el || typeof document === 'undefined') return;
var low = rank.toLowerCase();
el.hidden = false;
el.innerHTML = '';
var badge = document.createElement('span');
badge.className = 'grade ' + low;
badge.textContent = t('grade.' + low);
var note = document.createElement('span');
note.className = 'grade-note';
note.textContent = t('grade.' + low + '.msg');
el.appendChild(badge);
el.appendChild(note);
el.setAttribute('title', t('grade.' + low + '.msg'));
}
function celebrateGrade(rank) {
var el = $('clear-grade');
if (el && el.classList) {
el.classList.remove('reveal');
void el.offsetWidth;
el.classList.add('reveal');
}
J.sfx.grade(rank);
if (rank === 'S' && typeof window !== 'undefined') {
J.confetti(window.innerWidth * 0.5, window.innerHeight * 0.3);
later(function () { J.confetti(window.innerWidth * 0.2, window.innerHeight * 0.36); }, 140);
later(function () { J.confetti(window.innerWidth * 0.8, window.innerHeight * 0.36); }, 280);
}
}
function checkMilestone() {
var total = store.totalMatches | 0;
for (var i = 0; i < MILESTONES.length; i++) {
var m = MILESTONES[i];
if (total < m) continue;
if (store.milestones.indexOf(m) >= 0) continue;   // already celebrated
store.milestones.push(m);
var mrw = MILESTONE_REWARD[m] | 0;
if (mrw > 0) {
store.jstar = (store.jstar | 0) + mrw;
S.gainJstar = (S.gainJstar | 0) + mrw;
}
persist();
toast(mrw > 0 ? t('milestone.title.rw', { n: m, v: mrw })
: t('milestone.title', { n: m }));
J.sfx.milestone();
J.vibrate(35);
if (typeof window !== 'undefined') {
J.confetti(window.innerWidth / 2, window.innerHeight * 0.35);
J.floatText(window.innerWidth / 2, window.innerHeight * 0.45,
t('milestone.sub'), '#ffd94a');
}
break;   // at most one milestone can be crossed by a single match
}
}
function qRng(seed) {
var a = (seed | 0) >>> 0;
return function () {
a = (a + 0x6D2B79F5) >>> 0;
var t = a;
t = Math.imul(t ^ (t >>> 15), t | 1);
t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
}
function weekKey(d) {
var t = d ? new Date(d.getTime()) : new Date();
var dow = t.getDay();                    // 0=일 … 6=토
var back = (dow + 6) % 7;                // 월요일까지 며칠 뒤로
t.setHours(0, 0, 0, 0);
t.setDate(t.getDate() - back);
return todayKey(t);
}
function dqDefOf(id) {
for (var i = 0; i < DAILY_QUESTS.length; i++) {
if (DAILY_QUESTS[i].id === id) return DAILY_QUESTS[i];
}
return null;
}
function wqDefOf(id) {
for (var i = 0; i < WEEKLY_QUESTS.length; i++) {
if (WEEKLY_QUESTS[i].id === id) return WEEKLY_QUESTS[i];
}
return null;
}
function achvDefOf(id) {
for (var i = 0; i < ACHV.length; i++) {
if (ACHV[i].id === id) return ACHV[i];
}
return null;
}
function achvGoal(a) { return a.id === 'petall' ? MATE_IDS.length : a.goal; }
function dqRoll(dateK) {
var r = qRng(parseInt(dateK, 10) | 0);
var pool = DAILY_QUESTS.slice(), list = [], i, d, lv;
for (i = 0; i < 3 && pool.length; i++) {
d = pool.splice(Math.floor(r() * pool.length) % pool.length, 1)[0];
lv = d.fix ? d.fix : (1 + (Math.floor(r() * 3) % 3));
list.push({ id: d.id, lv: lv, goal: d.goal[lv - 1], prog: 0, done: 0, claimed: 0 });
}
var has1 = false;
for (i = 0; i < list.length; i++) { if (list[i].lv === 1) has1 = true; }
if (!has1) {
for (i = 0; i < list.length; i++) {
d = dqDefOf(list[i].id);
if (d && !d.fix) { list[i].lv = 1; list[i].goal = d.goal[0]; break; }
}
}
return { date: dateK, list: list, bonus: 0 };
}
function wqRoll(weekK) {
var r = qRng((parseInt(weekK, 10) | 0) ^ 0x5745454B);
var pool = WEEKLY_QUESTS.slice(), list = [], i, d;
for (i = 0; i < WQ_PICK && pool.length; i++) {
d = pool.splice(Math.floor(r() * pool.length) % pool.length, 1)[0];
list.push({ id: d.id, goal: d.goal, prog: 0, done: 0, claimed: 0 });
}
return { week: weekK, list: list };
}
function questsEnsure() {
var dk = todayKey(), wk = weekKey(), q = store.quests, dirty = false;
if (!q || typeof q !== 'object') { q = {}; dirty = true; }
if (!q.daily || q.daily.date !== dk || !q.daily.list || q.daily.list.length !== 3) {
q.daily = dqRoll(dk); dirty = true;
}
if (!q.weekly || q.weekly.week !== wk || !q.weekly.list || !q.weekly.list.length) {
q.weekly = wqRoll(wk); dirty = true;
}
if (!store.achv || typeof store.achv !== 'object') { store.achv = {}; dirty = true; }
store.quests = q;
if (dirty) persist();
return q;
}
function dqBump(id, n, atLeast) {
var q = questsEnsure(), hit = false, i, e, want;
var lists = [q.daily.list, q.weekly.list];
for (var L = 0; L < lists.length; L++) {
for (i = 0; i < lists[L].length; i++) {
e = lists[L][i];
if (e.id !== id || e.done) continue;
want = atLeast ? Math.max(e.prog | 0, n | 0) : ((e.prog | 0) + (n | 0 || 1));
if (want <= (e.prog | 0)) continue;
e.prog = Math.min(e.goal, want);
hit = true;
if (e.prog >= e.goal) {
e.done = 1;
toast(t('quest.ready', { n: questText(e, L === 0 ? 'daily' : 'weekly') }));
J.sfx.milestone();
J.vibrate(35);
if (L === 0) dqBump('wmis', 1);      // 주간 「미션 10회」는 일일 완료를 센다
}
}
}
if (!hit) return;
persist();
questPaint();
questBadges();
}
function achvAxis(ax) {
switch (ax) {
case 'match':  return store.totalMatches | 0;
case 'combo':  return store.comboMax | 0;
case 'pet':    return Array.isArray(store.pets) ? store.pets.length : 0;
case 'chap':   return Math.max(0, Math.floor((((store.advMax | 0) - 1)) / ADV_CHAPTER));
case 'star':   return advStarsTotalOf(store.advStars) | 0;
case 'streak': return store.streak | 0;
case 'duel':   return store.duelWins | 0;
case 'awaken': return store.awkTotal | 0;
}
return 0;
}
function achvCheck(inWin) {
if (!store.achv || typeof store.achv !== 'object') store.achv = {};
var got = 0, i, a;
for (i = 0; i < ACHV.length; i++) {
a = ACHV[i];
if (store.achv[a.id]) continue;
if (achvAxis(a.ax) < achvGoal(a)) continue;
store.achv[a.id] = { date: todayKey(), claimed: 0 };
if (!got) {
if (!inWin) toast(t('quest.ready', { n: t('ach.' + a.id, { n: achvGoal(a) }) }));
J.sfx.milestone();
J.vibrate(35);
if (typeof window !== 'undefined') {
J.confetti(window.innerWidth / 2, window.innerHeight * 0.35);
}
}
got++;
}
if (!got) return;
persist();
questPaint();
questBadges();
}
function questClaimable() {
var q = questsEnsure(), n = 0, i, L;
var lists = [q.daily.list, q.weekly.list];
for (L = 0; L < lists.length; L++) {
for (i = 0; i < lists[L].length; i++) {
if (lists[L][i].done && !lists[L][i].claimed) n++;
}
}
for (i = 0; i < ACHV.length; i++) {
var r = store.achv && store.achv[ACHV[i].id];
if (r && !r.claimed) n++;
}
return n;
}
function dqBonus(q) {
if (q.daily.bonus) return 0;
for (var i = 0; i < q.daily.list.length; i++) {
if (!q.daily.list[i].claimed) return 0;
}
q.daily.bonus = 1;
grantHearts(DQ_BONUS_HEART);
toast(t('quest.bonus', { n: DQ_BONUS_HEART }));
return DQ_BONUS_HEART;
}
function questClaim(tab, id) {
var q = questsEnsure(), gain = 0, e, i, a, r;
if (tab === 'epic') {
a = achvDefOf(id);
r = a && store.achv ? store.achv[a.id] : null;
if (!a || !r || r.claimed) return 0;
r.claimed = 1;
gain = a.v | 0;
} else {
var list = (tab === 'weekly' ? q.weekly.list : q.daily.list);
for (i = 0; i < list.length; i++) {
if (list[i].id !== id) continue;
e = list[i];
break;
}
if (!e || !e.done || e.claimed) return 0;
e.claimed = 1;
gain = (tab === 'weekly') ? ((wqDefOf(id) || { v: 0 }).v | 0)
: (DQ_REWARD[e.lv] | 0);
}
if (gain > 0) {
store.jstar = (store.jstar | 0) + gain;
S.gainJstar = (S.gainJstar | 0) + gain;
}
if (tab === 'daily') dqBonus(q);
persist();
toast(t('quest.got', { v: gain }));
J.sfx.milestone();
J.vibrate(30);
if (typeof window !== 'undefined') {
J.confetti(window.innerWidth / 2, window.innerHeight * 0.42);
}
questPaint();
questBadges();
kdSync();   /* T14 I-2a — 젤리별 지갑은 위에서 바로 늘지만 왕국 하단 칩은 따로 안 갱신됐다 */
return gain;
}
function questClaimAll(tab) {
var q = questsEnsure(), got = 0, i;
if (tab === 'epic') {
for (i = 0; i < ACHV.length; i++) {
var r = store.achv && store.achv[ACHV[i].id];
if (r && !r.claimed) got += questClaim('epic', ACHV[i].id);
}
return got;
}
var list = (tab === 'weekly' ? q.weekly.list : q.daily.list).slice();
for (i = 0; i < list.length; i++) {
if (list[i].done && !list[i].claimed) got += questClaim(tab, list[i].id);
}
return got;
}
function addsForStage(stage) {
var floor = (stage | 0) >= ADD_FLOOR_STAGE ? 1 : 2;
return Math.max(floor, 5 - (((stage - 1) / 3) | 0));
}
function todayKey(d) {
var t = d || new Date();
var m = t.getMonth() + 1, day = t.getDate();
return '' + t.getFullYear() + (m < 10 ? '0' : '') + m + (day < 10 ? '0' : '') + day;
}
var dailyParam = (function () {
var v = '';
try { v = new URLSearchParams(location.search).get('daily') || ''; }
catch (e) { return ''; }
if (!/^\d{8}$/.test(v)) return '';
var y = +v.slice(0, 4), m = +v.slice(4, 6), dd = +v.slice(6, 8);
var dt = new Date(y, m - 1, dd);
if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== dd) return '';
return v;
})();
function dailyKey() { return dailyParam || todayKey(); }
function dailyIsReplay() { return !!dailyParam && dailyParam !== todayKey(); }
function dailySeed() { return parseInt(dailyKey(), 10) | 0; }
function dailyNumber() {
var t = dailyParam
? new Date(+dailyParam.slice(0, 4), +dailyParam.slice(4, 6) - 1, +dailyParam.slice(6, 8))
: new Date();
var base = Date.UTC(2025, 0, 1);
var cur = Date.UTC(t.getFullYear(), t.getMonth(), t.getDate());
return Math.max(1, Math.floor((cur - base) / 86400000) + 1);
}
function dailyLinkEnter() {
if (!dailyIsReplay() && store.dailyBest && store.dailyBest.date === todayKey()) {
showDailyResult(0, false);
return;
}
startDaily(true);
}
function dailyLinkBoot() {
if (!dailyParam) return;
var tries = 0;
var step = function () {
if (++tries > 80) return;
var sp = $('splash');
if (sp && !sp.hidden) { setTimeout(step, 150); return; }
var tu = $('modal-tutorial');
if (tu && !tu.hidden) { setTimeout(step, 150); return; }
dailyLinkEnter();
};
setTimeout(step, 150);
}
function startStage(stage, seed) {
TW_PORTAL.gameplayStart();   /* Task 12 — 판 시작(또는 재개) 신호 */
clearTimers();
stopComboLoop();
endFever(true);
mascotReset();      // a new board clears a game-over slump as well as a fever dance
passiveReset();     // v3: 새 판 = 패시브의 누적·장전·배너 기억 전부 초기화
pvChip('');
layoutRowsReset();  // D1: 타일 크기의 행 기준도 판마다 새로 잡는다
S.gainPet = 0;
S.gainStar = 0;
S.gainAwk = 0;
S.gainGear = [];
S.dropTable = (S.mode === 'adv') ? dropTableFor(stage) : null;
S.gainGem = 0;
hvReset();
S.harvest = 0;
S.gainJstar = 0;
S.gainGift = [];
S.gainPets = [];
S.hitTaken = false;
S.giftLeft = (S.mode === 'adv' && isGachaStage(stage) &&
Math.random() < GACHA_STAGE_P) ? 1 : 0;
awkStreak = 0;
stdyRun = 0;
statAgil = false;
multFxTier = 0;
multFxAt = 0;
multFxUntil = 0;
rwReset();
applyCharSkin();    // 마스코트 슬롯을 선택 캐릭터로 (메뉴에서 바꿨을 수 있다)
S.stage = stage;
var advp = (S.mode === 'adv') ? advPlan(stage) : null;
S.advPlan = advp;
if (advp && TW_BATTLE) duelInit(advp);
else if (!isArcadeDuel()) S.duel = null;
var gen = advp
? genBoardBanded(stage, advp.seed, advp.density)
: genBoardBanded(isDaily() ? 3 : stage, seed, undefined, isDaily());
S.cells = gen.cells;
if (TW_BATTLE && (advp || isArcadeDuel())) S.cells = battleFitBoard(S.cells, gen.seed);
S.seed = gen.seed;
S.gridSeed = gen.seed;
// Specials ride on top of the PURE board, from a seed-derived stream, so a
// given seed always yields the same layout. Daily is skipped entirely.
if (featuresOn()) {
applySpecials(S.cells, stage, S.mode,
mulberry32(((gen.seed >>> 0) ^ 0x1F123BB5) >>> 0));
}
if (advp) {
applyHandicaps(S.cells, advp.hand.blk, advp.hand.lock,
mulberry32(((gen.seed >>> 0) ^ ADV_HAND_SALT) >>> 0));
}
S.addSeq = 0;
S.refillSeq = 0;             // 낙하 스폰 순번의 비전투 폴백 (전투는 duel.refillSeq)
S.feverCdUntil = 0;          // a new board always allows fever immediately
S.stageStartedAt = Date.now();
S.stageMaxCombo = 1;
S.mission = advp
? { id: advp.mission.id, goal: advp.mission.goal, prog: 0, done: false }
: (missionMode()
? pickMission(gen.seed, S.cells.length, stage, S.mode, store.lastMissionId) : null);
// Remembered in the store (and mirrored into the save) so the "never twice
// in a row" rule survives a reload, not just a stage transition.
capSpecialMission(S.mission);          /* W6.5b P0 — 있는 것보다 많이 요구 금지 */
if (S.mission && !advp) store.lastMissionId = S.mission.id;
// 미션 시계는 "빡!" 배너가 끝난 뒤에 시작한다 (advBeginStage). 여기서는 0.
S.missionUntil = 0;
S.finishUntil = 0;        /* §3 — 피니시 커서도 판마다 0 */
S.missionMult = 1;
S.advDigit = 0;
S.advCleared = 0;
S.advShuf = false;
S.tenCount = 0;           /* 0826 6단계 — 텐 카운터도 판마다 0 (★★★ 조건) */
S.advEndAt = 0;
S.sprintTimes = [];
S.sprintWin = MISSION_SPRINT_MS;
skillReset();
S.overInfo = null;
shareCardReset();
S.adds = isDaily() ? 3 : addsForStage(stage);
S.addCdUntil = 0;
S.hints = 3;
S.undoLeft = 1;
// 셔플 금지(핸디캡 축 4)는 예산을 0으로 두는 것으로 끝난다 — 버튼의 비활성화·
// 자동 구제 경로가 이미 전부 `S.shuffles > 0` 하나만 본다.
S.shuffles = (advp && advp.hand.noShuffle) ? 0 : SHUFFLES_PER_STAGE;
if (isClassic()) {
S.adds = addsForStage(stage);
S.hints = 0;
S.undoLeft = 0;
}
S.shuffleCount = 0;      // new board, new stream: the ordinal restarts with it
S.snapshot = null;
boardsPlayed++;
S.sel = -1;
S.combo = 1;
S.comboUntil = 0;
var comboFill = $('combo-fill'), comboLabel = $('combo-label');
if (comboFill) comboFill.style.setProperty('--p', '0');
if (comboLabel) { comboLabel.textContent = ''; comboLabel.style.color = ''; }
S.busy = false;
S.continueUsed = false;
S.adContinueUsed = false;   /* Task 12 rev1(I-7) */
S.running = true;
S.paused = false;
var board = $('board');
if (board) board.classList.remove('grayed');
// Board DOM is rebuilt wholesale only on a stage change.
for (var i = 0; i < tileEls.length; i++) {
if (tileEls[i] && tileEls[i].parentNode) tileEls[i].parentNode.removeChild(tileEls[i]);
}
tileEls.length = 0;
renderAll();
recountMoves();          // board mutation: the only place the count may be taken
if (battleOn()) { bossReset(); duelStart(advp); }
else if (advp && advp.boss) bossStart(advp); else bossReset();
syncHud();
syncSkill();
syncBgmIntensity();      // the stage base moved; the combo lift is back to zero
saveProgress();
}
function leaveAdvSkin() {
setAppClass('adv', false);
stopAdv();
stopMapTicker();
bangReset();
skillReset();
bossReset();
S.duel = null;
setAppClass('duel-hurt', false);
setAppClass('battle', false);
setAppClass('skill-full', false);
duelHudUnmount();
}
function startEndless(fresh) {
leaveAdvSkin();
S.mode = 'endless';
if (!fresh && store.save && store.save.mode === 'endless') {
restoreSave(store.save);
} else {
S.score = 0;
S.matches = 0;
S.maxCombo = 1;
S.startedAt = Date.now();
startStage(1, (Math.random() * 0x7fffffff) | 0);
}
closeAllModals();
showScreen('screen-game');
layout();
}
function startDaily(fresh) {
leaveAdvSkin();
S.mode = 'daily';
if (!fresh && store.save && store.save.mode === 'daily') {
restoreSave(store.save);
} else {
S.score = 0;
S.matches = 0;
S.maxCombo = 1;
S.startedAt = Date.now();
startStage(1, dailySeed());
}
closeAllModals();
showScreen('screen-game');
layout();
startTimer();
}
function startRush() {
leaveAdvSkin();
S.mode = 'rush';
S.score = 0;
S.matches = 0;
S.maxCombo = 1;
S.startedAt = Date.now();
S.rushEndAt = now() + RUSH_MS;
S.rushStartedAt = now();   // the run's age — only startRush() may set this
S.rushBeatAt = 0;
S.addCdUntil = 0;
hurryReset();              // v4 §6.5 — 허리 업은 러시 세션당 1회다
startStage(1, (Math.random() * 0x7fffffff) | 0);
closeAllModals();
showScreen('screen-game');
layout();
syncRushHud();
startRushLoop();
}
function startClassic(fresh) {
leaveAdvSkin();
S.mode = 'classic';
var sv = store.saveClassic;
if (!fresh && sv && sv.mode === 'classic') {
restoreSave(sv);
} else {
S.score = 0;
S.matches = 0;
S.maxCombo = 1;
S.startedAt = Date.now();
startStage(1, (Math.random() * 0x7fffffff) | 0);
}
closeAllModals();
showScreen('screen-game');
layout();
}
function startClassicRush() {
leaveAdvSkin();
S.mode = 'classic-rush';
S.score = 0;
S.matches = 0;
S.maxCombo = 1;
S.startedAt = Date.now();
S.rushEndAt = now() + RUSH_MS;
S.rushStartedAt = now();   // the run's age — only a rush entry may set this
S.rushBeatAt = 0;
S.addCdUntil = 0;
hurryReset();              // v4 §6.5 — 허리 업은 러시 세션당 1회다
startStage(1, (Math.random() * 0x7fffffff) | 0);
closeAllModals();
showScreen('screen-game');
layout();
syncRushHud();
startRushLoop();
}
function startClassicDaily(fresh) {
leaveAdvSkin();
S.mode = 'classic-daily';
var sv = store.saveClassic;
if (!fresh && sv && sv.mode === 'classic-daily') {
restoreSave(sv);
} else {
S.score = 0;
S.matches = 0;
S.maxCombo = 1;
S.startedAt = Date.now();
startStage(1, dailySeed());
}
closeAllModals();
showScreen('screen-game');
layout();
startTimer();
}
var arcLast = '';
function arcDuelInit() {
var d = duelInit({ n: ARC_LV });
d.kos = 0;                       // 이 판에서 쓰러뜨린 악당 수 (웨이브 카운터)
var atkMax = duelAtkMax(1);
d.me.atkMax = atkMax;
d.me.spMax = atkMax * DUEL_SP_MULT;
d.def = BOSS_DEFS[0];
var arcHp = arcFoeHpMax(ARC_LV);
if (S.mode === 'arc-time') {
arcHp = Math.max(1, Math.round(arcHp * ARC_TIME_HP_K));
}
d.foe.hp = arcHp;
d.foe.hpMax = arcHp;
return d;
}
function startArcade(kind) {
if (!ARC_MODES[kind]) return;
leaveAdvSkin();            // 모험 잔상(오라·보스바·전투 HUD) 제거
S.mode = kind;
S.score = 0;
S.matches = 0;
S.maxCombo = 1;
S.startedAt = Date.now();
S.rushEndAt = now() + RUSH_MS;
S.rushStartedAt = now();   // the run's age — only a rush entry may set this
S.rushBeatAt = 0;
S.addCdUntil = 0;
S.arcStartedAt = now();
arcLast = kind;
hurryReset();              // v4 §6.5 — 허리 업은 러시 세션당 1회다
startStage(1, (Math.random() * 0x7fffffff) | 0);
arcDuelInit();
closeAllModals();
showScreen('screen-game');
duelStart(null);           // .battle · HUD 마운트 · 벽시계 출발 (모험과 같은 함수)
layout();
syncRushHud();
startRushLoop();
}
function arcFinish(why) {
if (!S.running) return;                       // 두 번 들어오지 않는다
TW_PORTAL.gameplayStop();   /* Task 12 rev1(C-1) — 판이 끝나는 즉시 */
S.running = false;
S.busy = true;
stopComboLoop();
stopRush();
endFever(true);
clearSelection();
endSkill();
bangReset();
S.bossArm = false;
if (S.duel) { S.duel.down = true; S.duel.meArm = false; }
setAppClass('duel-hurt', false);
setAppClass('boss-tell', false);
S.bossTellAt = 0;
var d = S.duel;
var mode = S.mode;
arcLast = mode;
var value, submit;
if (mode === 'arc-dmg') {
value = d ? (d.dmg | 0) : 0;
submit = true;
} else {
value = Math.max(0, now() - (S.arcStartedAt || now()));
submit = (mode !== 'arc-time') || (why === 'clear');
}
ensureArcadeBest();
S.arcLastValue = value | 0;
var res = submit ? arcSubmitBest(mode, value)
: { best: store.arcadeBest[mode] || null, fresh: false };
runCoinPay(coinForArc(!!res.fresh, why === 'clear'));
dropProgress();
persist();
var board = $('board');
if (why === 'clear') {
J.sfx.win();
J.vibrate(40);
if (typeof window !== 'undefined') {
J.confetti(window.innerWidth / 2, window.innerHeight * 0.42);
}
} else {
if (board) board.classList.add('grayed');
J.sfx.lose();
J.vibrate(60);
mascotSad();
}
var arcTail = function () {
paintArcSheet(mode, why, value, res);
shareCardPrep('arc', 'arc-card-thumb');
later(function () {
TW_PORTAL.requestMidgameAd(function () { openModal('modal-arc'); rewardReveal('arc-reward', (S.gainCoin | 0) > 0 ? [coinRewardItem(S.gainCoin)] : [], { sheetId: 'modal-arc' }); paintCoinX2('arc'); });   /* Task 12 rev1(C-1) · P3 T9 */
}, 520);
};
if (why === 'clear') { harvestFinale(arcTail); return; }
arcTail();
}
function arcSubmitBest(mode, value) {
ensureArcadeBest();
var prev = store.arcadeBest[mode] || null;
var low = arcLowerIsBetter(mode);
var v = Math.max(0, value | 0);
var better = !prev || (typeof prev.value !== 'number') ||
(low ? (v < prev.value) : (v > prev.value));
if (!better) return { best: prev, fresh: false };
var e = {
mode: mode,
value: v,
lowerIsBetter: low,
date: todayKey(),
ts: Date.now(),
char: charId(),
pet: mateId()
};
store.arcadeBest[mode] = e;
persist();
return { best: e, fresh: true };
}
var ARC_KEY = { 'arc-time': 'time', 'arc-surv': 'surv', 'arc-dmg': 'dmg' };
function arcModeName(mode) { return t('arc.' + (ARC_KEY[mode] || 'time') + '.name'); }
function arcDirText(mode) {
if (mode === 'arc-time') return t('arc.dir.low');
if (mode === 'arc-dmg') return t('arc.dir.more');
return t('arc.dir.high');
}
function arcComma(n) {
var s = String(Math.max(0, n | 0)), out = '', c = 0, i;
for (i = s.length - 1; i >= 0; i--) {
out = s.charAt(i) + out;
c++;
if (c % 3 === 0 && i > 0) out = ',' + out;
}
return out;
}
function arcValueText(mode, v) {
if (mode === 'arc-dmg') return arcComma(v);
return fmtTime(Math.round(Math.max(0, v | 0) / 1000));
}
function arcPad2(n) { return (n < 10 ? '0' : '') + n; }
function paintArcSheet(mode, why, value, res) {
setText('arc-title', arcModeName(mode));
var am = $('modal-arc'); if (am) { am.classList.toggle('is-arctime', mode === 'arc-time'); am.classList.toggle('is-arcsurv', mode === 'arc-surv'); am.classList.toggle('is-arcdmg', mode === 'arc-dmg'); }
setText('arc-value', arcValueText(mode, value));
paintHarvestRow('arc-bonus');   /* 수확 피날레 DESIGN §25.7 */
setText('arc-dir', arcDirText(mode));
var note = why === 'clear' ? t('arc.clear')
: why === 'ko' ? t('arc.ko')
: t('arc.timeup');
if (mode === 'arc-time' && why !== 'clear') note = note + ' · ' + t('arc.norecord');
setText('arc-note', note);
var d = S.duel;
if (mode === 'arc-time') {
setText('arc-kos', t('arc.foe', { name: d && d.def ? bossName(d.def) : '' }));
} else {
setText('arc-kos', t('arc.kos', { n: d ? (d.kos | 0) : 0 }));
}
var pid = mateId();
setText('arc-who', t('char.' + charId() + '.name') +
(pid ? ' · ' + t('char.' + pid + '.name') : ''));
var best = res ? res.best : null;
var bl = $('arc-best');
if (bl) {
if (!best) bl.textContent = t('arc.nobest');
else if (res && res.fresh) bl.textContent = t('arc.new') + ' · ' +
t('arc.best', { v: arcValueText(mode, best.value) });
else bl.textContent = t('arc.best', { v: arcValueText(mode, best.value) });
}
var dt = new Date();
setText('arc-when', dt.getFullYear() + '-' + arcPad2(dt.getMonth() + 1) + '-' +
arcPad2(dt.getDate()) + ' ' + arcPad2(dt.getHours()) + ':' +
arcPad2(dt.getMinutes()));
}
function syncArcadeSheet() {
ensureArcadeBest();
var ids = ['arc-time', 'arc-surv', 'arc-dmg'], i;
for (i = 0; i < ids.length; i++) {
var e = store.arcadeBest[ids[i]];
setText('arcrow-' + ARC_KEY[ids[i]] + '-b',
e && typeof e.value === 'number' ? arcValueText(ids[i], e.value) : '');
}
}
function rushNextBoard() {
S.stage += 1;
S.score += 100 * S.stage * awakenMult();   // small board-clear bonus; time is the prize · 74 — 각성 ×2 는 얻는 점수 전부(§27.3)
J.sfx.win();
if (typeof window !== 'undefined') {
J.confetti(window.innerWidth / 2, window.innerHeight * 0.4);
}
var keepEnd = S.rushEndAt;
startStage(S.stage, (S.seed + 0x9E3779B1) >>> 0);
S.rushEndAt = keepEnd;         // startStage must not reset the session clock
toast(t('toast.rushnext'));    // after startStage: its clearTimers() would
// otherwise cancel the toast's hide timer
syncHud();
}
function restoreSave(sv) {
TW_PORTAL.gameplayStart();   /* Task 12 rev1(C-1) — startStage() 를 안 거치는 유일한 진입로 */
clearTimers();
stopComboLoop();
endFever(true);
passiveReset();
pvChip('');
layoutRowsReset();  // D1: startStage() 를 안 거치는 유일한 진입로라 여기도 필요하다
hurryReset();
applyCharSkin();
S.mode = (sv.mode === 'daily' || sv.mode === 'classic' || sv.mode === 'classic-daily')
? sv.mode : 'endless';
S.stage = sv.stage || 1;
S.seed = sv.seed || 1;
S.gridSeed = sv.gridSeed || S.seed;
S.cells = cloneCells(sv.cells || []);
S.addSeq = sv.addSeq || 0;
// A pre-v4 save has neither field: it gets a full budget and a fresh ordinal,
// which is the same state startStage() would have left it in.
S.shuffles = typeof sv.shuffles === 'number' ? sv.shuffles : SHUFFLES_PER_STAGE;
S.shuffleCount = typeof sv.shuffleCount === 'number' ? sv.shuffleCount : 0;
S.stageStartedAt = Date.now();
S.stageMaxCombo = 1;
// Pre-v3 saves carry no mission history; '' simply means "nothing to avoid".
if (typeof sv.lastMission === 'string' && sv.lastMission) {
store.lastMissionId = sv.lastMission;
}
S.mission = missionMode()
? (sv.mission && sv.mission.id
? { id: sv.mission.id, goal: sv.mission.goal || 5,
prog: sv.mission.prog || 0, done: !!sv.mission.done }
: pickMission(S.seed, S.cells.length, S.stage, S.mode, store.lastMissionId))
: null;
capSpecialMission(S.mission);          /* W6.5b P0 — 복원된 판에서도 같은 빗장 */
if (S.mission) store.lastMissionId = S.mission.id;
S.sprintTimes = [];
S.overInfo = null;
shareCardReset();       // 판정판 53 — startStage 와 같은 이유(결과가 무효 = 카드도 무효)
S.addCdUntil = 0;
S.score = sv.score || 0;
S.adds = typeof sv.adds === 'number' ? sv.adds : addsForStage(S.stage);
if (isClassic() && sv.addsV !== 2) S.adds = addsForStage(S.stage);
S.hints = typeof sv.hints === 'number' ? sv.hints : 3;
S.matches = sv.matches || 0;
S.maxCombo = sv.maxCombo || 1;
S.startedAt = sv.startedAt || Date.now();
S.runCoin = sv.runCoin | 0; S.coinRunAt = S.startedAt; S.gainCoin = 0;
S.x2Done = sv.x2Done | 0; S.x2Token = sv.x2Token | 0;
S.undoLeft = 1;
S.snapshot = null;
S.sel = -1;
S.combo = 1;
S.comboUntil = 0;
S.busy = false;
S.continueUsed = false;
S.adContinueUsed = false;   /* Task 12 rev1(I-7) */
S.running = true;
S.paused = false;
var board = $('board');
if (board) board.classList.remove('grayed');
for (var i = 0; i < tileEls.length; i++) {
if (tileEls[i] && tileEls[i].parentNode) tileEls[i].parentNode.removeChild(tileEls[i]);
}
tileEls.length = 0;
renderAll();
recountMoves();          // the restored board is a board mutation like any other
syncHud();
if (isDaily()) startTimer();
}
function startTimer() {
stopTimer();
timerInt = setInterval(function () {
if (!S.running || S.paused) return;
var sec = Math.floor((Date.now() - S.startedAt) / 1000);
setText('timer-val', fmtTime(sec));
}, 500);
}
function stopTimer() {
if (timerInt) { clearInterval(timerInt); timerInt = 0; }
}
function fmtNum(v) {
var n = Math.round(v || 0), neg = n < 0, out = '', str = String(neg ? -n : n), i;
for (i = 0; i < str.length; i++) {
if (i > 0 && (str.length - i) % 3 === 0) out += ',';
out += str.charAt(i);
}
return (neg ? '-' : '') + out;
}
function fmtTime(sec) {
var m = Math.floor(sec / 60), s = sec % 60;
return m + ':' + (s < 10 ? '0' : '') + s;
}
function clearSelection() {
if (S.sel >= 0 && tileEls[S.sel]) tileEls[S.sel].classList.remove('sel');
S.sel = -1;
clearCands();
}
function clearHints() {
for (var i = 0; i < tileEls.length; i++) {
if (tileEls[i]) setCls(tileEls[i], 'hint', false);
}
}
function clearCands() {
for (var i = 0; i < tileEls.length; i++) {
if (tileEls[i]) {
setCls(tileEls[i], 'cand', false);
setCls(tileEls[i], 'cand-ok', false);
setCls(tileEls[i], 'cand-far', false);
}
}
}
var boardsPlayed = 0;      // 이 세션에서 시작한 판 수 (1 = 첫 판)
var alignRemindLeft = 2;   // 첫 판에서 규칙 전문을 띄울 남은 횟수
function markCands(i) {
clearCands();
var list = connectCandidates(S.cells, i) || [];
var seen = {}, k;
for (k = 0; k < list.length; k++) seen[list[k]] = 1;
// wild tiles match values the pure rule rejects; scan only if one exists
var hasWild = false, j;
for (j = 0; j < S.cells.length; j++) { if (isWild(S.cells, j)) { hasWild = true; break; } }
if (hasWild) {
for (j = 0; j < S.cells.length; j++) {
if (j !== i && !seen[j] && isValidPairEx(S.cells, i, j)) seen[j] = 1;
}
}
for (var key in seen) {
var el = tileEls[key | 0];
if (el && el.classList) {
el.classList.add('cand');
if (isValidPairEx(S.cells, i, key | 0)) {
el.classList.add('cand-ok');
var KF = idxToRC(key | 0), IF = idxToRC(i);
if (Math.max(Math.abs(KF.r - IF.r), Math.abs(KF.c - IF.c)) > 1) {
el.classList.add('cand-far');
}
}
}
}
}
function onBoardPointerDown(e) {
if (!e || S.paused || !S.running) return;
if (S.busy && !(popLive > 0 && (now() - popBurstAt) < POP_BURST_MS)) return;
var tg = e.target;
var tile = (tg && tg.closest) ? tg.closest('.tile') : null;
if (!tile) return;
var i = parseInt(tile.getAttribute('data-i'), 10);
if (isNaN(i) || !isAlive(S.cells, i)) return;
clearHints();
if (S.sel === i) { clearSelection(); return; }
if (S.sel < 0) {
S.sel = i;
tile.classList.add('sel');
markCands(i);
J.sfx.select(S.cells[i].v);
return;
}
var a = S.sel, b = i;
if (isValidPairEx(S.cells, a, b)) {   // wilds widen the value rule only
clearSelection();
resolveMatch(a, b);
} else {
var why = rejectReason(S.cells, a, b);
if (why === 'blocked') {
var blk = blockersBetween(S.cells, a, b, 4);
if (blk.length) {
var pa = tileCenter(a), ps = tileCenter(blk[0]);
J.brokenLink(pa.x, pa.y, ps.x, ps.y);
for (var bi = 0; bi < blk.length; bi++) flashBlocker(blk[bi]);
var bc = S.cells[blk[0]];
toast(t('toast.blockedBy', { n: bc ? bc.v : '?' }));
} else {
shake(a); shake(b);
toast(t('toast.blocked'));
}
} else if (why === 'notaligned') {
shake(a); shake(b);
var pg = tileCenter(a);
var te = tileEls[a];
var tw = (te && te.getBoundingClientRect) ? te.getBoundingClientRect().width : 34;
J.lineGuide(pg.x, pg.y, tw);
if (boardsPlayed <= 1 && alignRemindLeft > 0 && !store.tutorialCleared) {
alignRemindLeft--;
toast(t('toast.alignRemind'));
} else {
toast(t('toast.notLine'));
}
} else {
shakeNum(a); shakeNum(b);
}
if (battleOn()) foeDriver.onMiss(why);
J.sfx.fail();
J.vibrate(12);
clearSelection();
}
}
function flashBlocker(i) {
var el = tileEls[i];
if (!el || !el.classList) return;
el.classList.remove('blocker');
void el.offsetWidth;
el.classList.add('blocker');
later(function () { if (el && el.classList) el.classList.remove('blocker'); }, 700);
}
function shake(i) {
var el = tileEls[i];
if (!el) return;
el.classList.remove('shake');
void el.offsetWidth;
el.classList.add('shake');
later(function () { if (el) el.classList.remove('shake'); }, 260);
}
function shakeNum(i) {
var el = tileEls[i];
if (!el) return;
el.classList.remove('shake-num');
void el.offsetWidth;
el.classList.add('shake-num');
later(function () { if (el) el.classList.remove('shake-num'); }, 260);
}
function takeSnapshot() {
S.snapshot = {
cells: cloneCells(S.cells),
score: S.score, combo: S.combo, comboUntil: S.comboUntil,
adds: S.adds, hints: S.hints, matches: S.matches,
addSeq: S.addSeq,
mission: S.mission ? {
id: S.mission.id, goal: S.mission.goal,
prog: S.mission.prog, done: !!S.mission.done
} : null
};
}
function resolveMatch(a, b) {
takeSnapshot();
tickFever();      // authoritative expiry before anything is scored
S.busy = true;
if (popLive === 0) {
popBurstAt = now();   // 이 매치가 연타 묶음의 첫 팝이다
stdyRun = 1;
statAgil = false;
} else {
stdyRun++;
statAgil = true;
}
popLive++;
popGen++;
var myGen = popGen;
var ca = tileCenter(a), cb = tileCenter(b);
GEAR_GEO.ok = false;
if (S.duel && (S.cells[a].mk === 'gear' || S.cells[b].mk === 'gear' || spOf(S.cells, a) === 'bomb' || spOf(S.cells, b) === 'bomb')) gearGeoRead();
var cola = tileColor(a), colb = tileColor(b);
var mx = (ca.x + cb.x) / 2, my = (ca.y + cb.y) / 2;
var va = S.cells[a].v, vb = S.cells[b].v;
var spA = spOf(S.cells, a), spB = spOf(S.cells, b);
var gold = spA === 'gold' || spB === 'gold';
var specialsUsed = (spA ? 1 : 0) + (spB ? 1 : 0);
// --- 2. ice: an iced tile spends a layer instead of dying ---------------
var pair = [a, b];
var dying = [], chipped = [];
var iceFree = connFreeOn();
for (var pi = 0; pi < pair.length; pi++) {
var idx = pair[pi], cell = S.cells[idx];
if (cell.sp === 'ice' && (cell.ice | 0) > 0 && !iceFree) {
cell.ice = (cell.ice | 0) - 1;
if (cell.ice <= 0) { cell.sp = ''; cell.ice = 0; }   // now a plain tile
chipped.push(idx);
} else {
if (cell.sp === 'ice') { cell.sp = ''; cell.ice = 0; }
dying.push(idx);
}
}
// Nothing died: only ice broke. No combo, no match count — no farming.
var iceOnly = dying.length === 0;
var rose = iceOnly ? false : bumpCombo();
for (var di = 0; di < dying.length; di++) S.cells[dying[di]].dead = true;
// --- 4. bomb: a detonating tile clears its living 3×3 neighbourhood -----
var blown = [];
for (var bi = 0; bi < dying.length; bi++) {
if (spOf(S.cells, dying[bi]) !== 'bomb') continue;
var tg = bombTargets(S.cells, dying[bi]);
for (var ti = 0; ti < tg.length; ti++) {
var k = tg[ti];
if (S.cells[k].dead) continue;
S.cells[k].dead = true;                 // bombs punch straight through ice
S.cells[k].sp = '';
S.cells[k].ice = 0;
blown.push(k);
}
}
if (blown.length) S.comboUntil = now() + COMBO_MS + BOMB_COMBO_EXTEND;
var freed = releaseBlockers(S.cells, pair.concat(blown));
if (S.mode === 'adv' && S.advPlan) {
S.advCleared += dying.length + blown.length;
if (S.advPlan.goal.type === 'digit') {
var wantV = S.advPlan.goal.digit;
for (var gd = 0; gd < dying.length; gd++) {
if (S.cells[dying[gd]].v === wantV) S.advDigit++;
}
for (var gb = 0; gb < blown.length; gb++) {
if (S.cells[blown[gb]].v === wantV) S.advDigit++;
}
}
}
var mkPet = 0, mkStar = 0, mkGift = 0, mkAwk = 0, mkGear = MK_GEAR_BUF; mkGear.length = 0;
for (var mki = 0; mki < dying.length + blown.length; mki++) {
var mkIdx = mki < dying.length ? dying[mki] : blown[mki - dying.length];
var mkc = S.cells[mkIdx];
if (!mkc || !mkc.mk) continue;
if (mkc.mk === 'pet') mkPet++;
else if (mkc.mk === 'star') mkStar++;
else if (mkc.mk === 'gift') mkGift++;
else if (mkc.mk === 'awk') mkAwk++;
else if (mkc.mk === 'gear') mkGear.push({ id: mkc.mkItem, tier: mkc.mkTier, i: mkIdx });   /* i = 그 칸 — 획득 비행이 이 칸에서 출발한다(T11) */
mkc.mk = ''; mkc.mkItem = ''; mkc.mkTier = '';
}
// --- 6. score: base × gold × fever, then the bomb bonus -----------------
var fx = S.feverOn ? FEVER_MULT : 1;
var noBonus = iceOnly || isClassic();
var twPrev = S.pv ? (S.pv.twAlt | 0) : 0;
var tw = noBonus ? { mult: 1, kind: '', chain: 0, fired: 0 } : twinApply(va, vb);
var mm = S.missionMult > 1 ? S.missionMult : 1;
var st = statMult(noBonus, va, vb);
var im = noBonus ? 1 : itemScoreMult(va, vb);
var aw = awakenMult();
var gainPre = iceOnly
? ICE_BREAK_SCORE * S.stage * fx
: Math.round(10 * S.stage * comboScoreMult(S.combo, S.mode !== 'adv') *
((gold && !isClassic()) ? GOLD_MULT : 1) * fx * tw.mult * mm * st.mult * im);
var gain = gainPre * aw;
var bombPre = blown.length ? BOMB_KILL_SCORE * S.stage * blown.length * fx : 0;
var bombGain = bombPre * aw;
var lg = lastGainRec;   /* 새 객체 없이 필드만 고친다(점검 R5) */
lg.gainPre = gainPre; lg.gain = gain; lg.bombPre = bombPre; lg.bombGain = bombGain; lg.aw = aw;
lg.fx = fx; lg.st = st.mult; lg.tw = tw.mult; lg.im = im; lg.mm = mm;
S.score += gain + bombGain;
if (S.feverOn) S.feverScore += gain + bombGain;
if (!iceOnly && !isClassic() && tw && (tw.chain | 0) > (twPrev | 0)
&& battleOn() && itemOn('crossnecklace')) {
store.gauge = clamp(store.gauge + gaugeGain(S.combo) * ITEM_CROSS_GAUGE_K, 0, SKILL_MAX);
}
if (battleOn()) duelOnMatch(gain + bombGain, iceOnly, tw, twPrev, gainPre + bombPre);
if (!iceOnly) {
if (S.combo <= 1) { multFxTier = 0; multFxUntil = 0; }
var mDisp = comboScoreMult(S.combo, S.mode !== 'adv') *
((gold && !isClassic()) ? GOLD_MULT : 1) *
fx * tw.mult * mm * st.mult * aw * im;
var mTier = Math.floor(mDisp + 1e-9);
if (mTier >= 2 && mTier > multFxTier &&
(mTier >= 4 || (now() - multFxAt) > MULT_FX_MIN_MS)) {
multFxTier = mTier;
multFxAt = now();
var mSub = '';
if (tw && tw.fired > 0) mSub = tw.fired + ' CHAIN';
else if (S.combo >= 3) mSub = S.combo + ' COMBO';
multBandWord(mTier, mSub);
multFxUntil = now() + multLifeMs();
J.vibrate(mTier >= 8 ? 46 : (mTier >= 4 ? 26 : 14));
}
petCondBump();
S.matches++;
store.totalMatches = (store.totalMatches | 0) + 1;
dqBump('match', 1);
dqBump('wmatch', 1);
achvCheck();
missionBump('noadd', 1);
missionBump('sprint', 1);
if (tw && tw.chain > 0) dqBump('chain', tw.chain, true);
if (tw && tw.chain > 0 && tw.chain % 3 === 0) missionBump('chain3', 1);
if (va === vb) missionBump('same', 1);
else if (va + vb === 10) {
missionBump('sum10', 1);
dqBump('m10', 1);           /* 판정판 50 — 「합 10」 축 */
petTenBump();
S.tenCount = (S.tenCount | 0) + 1;
}
if (specialsUsed) missionBump('special', specialsUsed);
if (blown.length) missionBump('bomb', blown.length);
if (isRush()) {
if (battleOn()) {
if (S.mode !== 'arc-dmg') {
var arcD = S.duel;
var arcMax = (arcD && arcD.me && arcD.me.atkMax > 0) ? arcD.me.atkMax : 1;
addRushTime(Math.round(ARC_ATK_TIME_MS * Math.max(0, gain + bombGain) / arcMax));
}
} else addRushTime(rushMatchMs());        // decays past 60s
}
// Fever ignites at combo x4 and only ever ends on its own timer.
if (featuresOn()) {
if (S.feverOn) extendFever();
else if (S.combo >= FEVER_COMBO) startFever();
}
checkMilestone();
gaugeBump(S.combo);
if (!battleOn() && S.mode === 'adv' && S.advPlan && S.advPlan.boss) {
bossOnMatch(gain + bombGain, va, vb, tw);
} else if (battleOn() && S.mode === 'adv' && S.advPlan && S.advPlan.boss) {
bossCondMatch(va, vb, tw);
}
}
if ((mkPet || mkStar || mkGift || mkAwk || mkGear.length) && battleOn()) {
S.gainPet  += mkPet;
S.gainStar += mkStar;
var mkC = tileCenter(dying.length ? dying[0] : a);
if (mkPet) {
var pl = S.duel.petLeft | 0;
var pn = Math.min(pl + mkPet, MK_PET_CAP);
S.duel.petLeft = pn;
if (pn > pl) {
floatOnBoard(mkC.x, mkC.y - 44, t('mk.pet'), '#FF8FC5');
badgePop('undo-badge');
}
J.sfx.mission();
J.vibrate(20);
}
if (mkStar) {
store.gauge = SKILL_MAX;
syncSkill();
floatOnBoard(mkC.x, mkC.y - 72, t('mk.star'), '#FFD34D');
J.sfx.mission();
J.vibrate(28);
if (typeof window !== 'undefined') {
J.shockwave(mkC.x, mkC.y, '#FFD34D');
}
}
if (mkAwk && S.duel) {
var dA = S.duel;
if (dA.me.sp < dA.me.spMax) { dA.me.sp = dA.me.spMax; fullCue('btn-hint'); tipOnce('ultReady', 'tip.ultReady'); }
S.gainAwk = (S.gainAwk | 0) + mkAwk;
floatOnBoard(mkC.x, mkC.y - 58, t('mk.awk'), GEAR_TIER_INK.epic);
J.sfx.mission();
J.vibrate(24);
}
for (var gfk = 0; gfk < mkGear.length; gfk++) { gearCellFrom(mkGear[gfk].i, a, ca.x, ca.y); harvestGear(mkGear[gfk], GEAR_GEO.fx, GEAR_GEO.fy, false); }
if (mkGift) {
for (var gfi = 0; gfi < mkGift; gfi++) {
S.gainGift.push(openGachaRoll());
}
persist();
floatOnBoard(mkC.x, mkC.y - 88, t('mk.gift'), '#C9AEF5');
J.sfx.mission();
J.vibrate(30);
if (typeof window !== 'undefined') {
J.shockwave(mkC.x, mkC.y, '#C9AEF5');
}
}
}
// --- juice: beam -> pops -> score float ---
J.beam(ca.x, ca.y, cb.x, cb.y, cola);
for (var ci = 0; ci < chipped.length; ci++) {
var che = tileEls[chipped[ci]];
var cc = tileCenter(chipped[ci]);
if (che) { che.classList.remove('pop'); void che.offsetWidth; che.classList.add('pop'); }
J.burst(cc.x, cc.y, '#bfe9ff', 12);
paintTile(chipped[ci]);
}
if (chipped.length) J.sfx.ice();
for (var fri = 0; fri < freed.length; fri++) {
var frc = tileCenter(freed[fri]);
J.burst(frc.x, frc.y, '#e8dcc6', 10);
paintTile(freed[fri]);
}
if (freed.length) J.sfx.ice();
if (gold && !iceOnly) J.sfx.gold();
for (var dj = 0; dj < dying.length; dj++) {
if (tileEls[dying[dj]]) tileEls[dying[dj]].classList.add('pop');
}
if (blown.length) {
J.sfx.bomb();
J.vibrate(45);
for (var wi = 0; wi < blown.length; wi++) {
var we = tileEls[blown[wi]];
if (we) we.classList.add('bombgo');
}
var bc = tileCenter(dying.length ? dying[0] : a);
J.shockwave(bc.x, bc.y, '#ff8a3d');
J.screenPulse();
}
var dyingV = dying.map(function (ix) { return S.cells[ix] ? S.cells[ix].v : 0; });
var blownV = blown.map(function (ix) { return S.cells[ix] ? S.cells[ix].v : 0; });
var dyingE = dying.map(function (ix) { return tileEls[ix] || null; });
var blownE = blown.map(function (ix) { return tileEls[ix] || null; });
var chippedE = chipped.map(function (ix) { return tileEls[ix] || null; });
var dyingC = dying.map(function (ix) { return tileCenter(ix); });
var blownC = blown.map(function (ix) { return tileCenter(ix); });
if (S.duel && !S.duel.down) {
var srcC = dyingC.concat(blownC);
S.duel.srcPts = srcC.length ? srcC : [ca, cb];
}
(function (blownList, dyingEls, blownEls, chippedEls, dyingVals, blownVals, dyingCs, blownCs) {
later(function () {
var n;
for (n = 0; n < dyingEls.length; n++) {
var de = dyingEls[n], dc = dyingCs[n];
J.burst(dc.x, dc.y, n === 0 ? cola : colb, 14, fruitOf(dyingVals[n]));
if (de) { de.classList.remove('pop'); de.classList.add('dead'); }
}
for (n = 0; n < blownEls.length; n++) {
var be = blownEls[n], bcc = blownCs[n];
J.burst(bcc.x, bcc.y, '#ff8a3d', 10, fruitOf(blownVals[n]));
if (be) { be.classList.remove('bombgo'); be.classList.add('dead'); }
if (be && tileEls[blownList[n]] === be) paintTile(blownList[n]);
}
for (n = 0; n < chippedEls.length; n++) {
var ce = chippedEls[n];
if (ce) ce.classList.remove('pop');
}
}, POP_MS);
})(blown.slice(), dyingE, blownE, chippedE, dyingV, blownV, dyingC, blownC);
floatOnBoard(mx, my - 8, '+' + (gain + bombGain), comboColor(S.combo),
22 + Math.min(20, S.combo * 1.6));
J.sfx.match(S.combo);
J.vibrate(10);
if (!iceOnly) { if (!noBonus) charFx(st, mx, my); twinFx(tw, mx, my); }
if (rose) {
floatOnBoard(mx, my - 44, 'x' + S.combo + '!', comboColor(S.combo));
if (S.combo >= 3 && comboTier(S.combo) === 0 && !multFxOn()) {
floatOnBoard(mx, my - 72, comboPraise(S.combo), comboColor(S.combo));
}
J.sfx.combo(S.combo);
mascotCheer(S.combo);
var vt = voiceTier(S.combo);
if (vt) heroSay('combo', vt);       // v4 6차: 보이스와 말풍선이 한 호출에서 난다
comboBanner(S.combo);
}
syncHud();
scorePunch(false);
syncBgmIntensity();
later(function () { popSettle(myGen); }, POP_MS);
}
function popSettle(gen) {
if (popLive > 0) popLive--;
if (popLive > 0 || gen !== popGen) return;
if (!S.running) return;
clearSelection();
clearHints();
if (battleBoard()) { runBattleRefill(); return; }
var rows = findFullDeadRows(S.cells);
if (rows.length) { runRowCollapse(rows); return; }
S.busy = false;
saveProgress();
afterMove();
}
var TW_BATTLE = true;
var BATTLE_FALL_MS = 300;
var BATTLE_COLS = COLS;
var BATTLE_ROWS_MIN = 8, BATTLE_ROWS_MAX = 12;
var BATTLE_HUD_RESERVE = 34;
var BATTLE_HUD_AR = 1536 / 500;
var BATTLE_HUD_WAS = 63;
function battleStage() {
try {
var cs = window.getComputedStyle(document.documentElement);
var sw = parseFloat(cs.getPropertyValue('--bt-stage-w')), sh = parseFloat(cs.getPropertyValue('--bt-stage-h'));
var bw = parseFloat(cs.getPropertyValue('--bt-board-w')), bh = parseFloat(cs.getPropertyValue('--bt-board-h'));
if (sw > 0 && sh > 0 && bw > 0 && bh > 0) return { sw: sw, sh: sh, bw: bw, bh: bh };
} catch (e) { /* ignore */ }
return null;
}
function battleRows(n) {
var rows = 0;
try {
var area = boardArea();
var bmax = boardMaxPx();
var land = false;
var stg = battleStage();
if (stg) {
var bu = Math.min((window.innerWidth || 0) / stg.sw, (window.innerHeight || 0) / stg.sh);
if (bu > 0) { land = true; area = { w: bu * stg.bw, h: bu * stg.bh }; bmax = 0; }
}
var w = (bmax > 0 && area.w > bmax) ? bmax : area.w;
var tw = clamp(Math.floor((w - GAP * (BATTLE_COLS - 1)) / BATTLE_COLS),
TILE_MIN, TILE_MAX);
var hr = $('hud-row');
var hrH = hr ? hr.getBoundingClientRect().height : 0;
var reserve = hrH >= BATTLE_HUD_RESERVE ? 0 : (BATTLE_HUD_RESERVE - hrH);
var dh = $('duel-hud');
var dhH = (dh && dh.getBoundingClientRect) ? dh.getBoundingClientRect().height : 0;
if (dhH <= 1) reserve += Math.max(0, area.w / BATTLE_HUD_AR - BATTLE_HUD_WAS);
if (land) reserve = 0;
rows = Math.floor((area.h - reserve + GAP) / (tw + GAP));
} catch (e) { rows = 0; }
if (!isFinite(rows) || rows <= 0) rows = Math.round((n | 0) / BATTLE_COLS);
return clamp(rows, BATTLE_ROWS_MIN, BATTLE_ROWS_MAX) | 0;
}
function battleOn() {
return TW_BATTLE && (S.mode === 'adv' || isArcadeDuel()) && !!S.duel;
}
function battleBoard() { return battleOn(); }
var DUEL_MIN_PAIRS = 3;      // 리필 직후 최소 짝 수. 미달이면 스폰 값만 다시 뽑는다.
var DUEL_REROLL_MAX = 8;
var BATTLE_SALT = 0x5EED1A11;
var MK_PET_RATE  = 0.03;     // 🐾 펫 과일 — 스폰 칸당 3%
var MK_STAR_RATE = 0.015;    // ⭐ 스킬 과일 — 스폰 칸당 1.5%
var MK_AWK_RATE  = 0.015;    // ⚡ 각성 과일 — 스폰 칸당 1.5%, d.me.sp 즉시 만땅(스펙 §D-2)
var MK_AWK_HI = MK_PET_RATE + MK_STAR_RATE + MK_AWK_RATE;   // = .06
var MK_MAX_EACH  = 1;        // 판에 동시에 떠 있을 수 있는 수 (종류별)
var MK_PET_CAP   = DUEL_PET_MAX + 2;  // 펫 과일로 넘길 수 있는 잔여 상한 (기본 2 → 4)
var GIFT_SPAWN_RATE = 0.02;
var MK_STAR_HI  = MK_PET_RATE + MK_STAR_RATE;
var MK_GIFT_LO = 0.145;   /* 74 — 선물 상자 띠 자리 고정(옛 파편 띠 끝) — 재현성 */
var MK_GIFT_HI = MK_GIFT_LO + GIFT_SPAWN_RATE;
function battleRng() {
var d = S.duel;
var seq = ((d ? d.refillSeq : S.refillSeq) | 0) + 1;
if (d) d.refillSeq = seq; else S.refillSeq = seq;
return mulberry32((((S.gridSeed >>> 0) ^ BATTLE_SALT) ^
Math.imul(seq, 0x9E3779B1)) >>> 0);
}
function battleRefill(cells, rng) {
var rows = (cells.length / COLS) | 0, out = new Array(cells.length);
var moves = [], spawns = [];
for (var c = 0; c < COLS; c++) {
var w = rows - 1;                        // 쓰기 커서: 바닥부터
for (var r = rows - 1; r >= 0; r--) {    // 아래->위, 산 것만 내려앉힌다
var i = r * COLS + c;
if (cells[i] && !cells[i].dead) {
out[w * COLS + c] = cells[i];
if (w !== r) moves.push({ from: i, to: w * COLS + c });
w--;
}
}
for (var k = 0; w >= 0; w--, k++) {      // 남은 위쪽 = 신규 스폰
var v = 1 + ((rng() * 9) | 0); if (v > 9) v = 9;
out[w * COLS + c] = { v: v, dead: false };
spawns.push({ to: w * COLS + c, stack: k + 1 });
}
}
var mkHave = { pet: 0, star: 0, awk: 0, gear: 0 };
var mkGiftHave = 0;
var dt = S.dropTable, gearRate = dt ? dt.rate : 0;
for (var q = 0; q < out.length; q++) {
var oc = out[q];
if (!oc || oc.dead || !oc.mk) continue;
if (mkHave[oc.mk] !== undefined) mkHave[oc.mk]++;
else if (oc.mk === 'gift') mkGiftHave++;
}
for (var si = 0; si < spawns.length; si++) {
var r2 = rng();                                   // 상한과 무관하게 언제나 1회
var sc = out[spawns[si].to];
if (!sc || sc.sp) continue;
if (r2 < MK_PET_RATE) {
if (mkHave.pet < MK_MAX_EACH) { sc.mk = 'pet'; mkHave.pet++; }
} else if (r2 < MK_STAR_HI) {
if (mkHave.star < MK_MAX_EACH) { sc.mk = 'star'; mkHave.star++; }
} else if (r2 < MK_AWK_HI) {
if (mkHave.awk < MK_MAX_EACH) { sc.mk = 'awk'; mkHave.awk++; }
} else if (r2 < MK_GEAR_LO + GEAR_RATE_MAX) {
var gr = dt ? gearRollFrom(dt.tiers, dt.statP, rng) : (rng(), rng(), rng(), null);
if (gr && gr.id && r2 < MK_GEAR_LO + gearRate && mkHave.gear < MK_MAX_EACH) {
sc.mk = 'gear'; sc.mkItem = gr.id; sc.mkTier = gr.tier; mkHave.gear++;
}
} else if (r2 >= MK_GIFT_LO && r2 < MK_GIFT_HI) {
if ((S.giftLeft | 0) > 0 && !mkGiftHave) {
sc.mk = 'gift'; mkGiftHave++; S.giftLeft = 0;
}
}
}
return { cells: out, moves: moves, spawns: spawns };
}
function battleRefillEx(cells, rng) {
var res = battleRefill(cells, rng);
for (var t = 0; t < DUEL_REROLL_MAX; t++) {
if (countPairsEx(res.cells) >= DUEL_MIN_PAIRS) break;
for (var s = 0; s < res.spawns.length; s++) {
var v = 1 + ((rng() * 9) | 0); if (v > 9) v = 9;
res.cells[res.spawns[s].to].v = v;
}
}
return res;
}
function battleFitBoard(cells, seed) {
var want = battleRows(cells.length) * BATTLE_COLS;
if (cells.length === want) return cells;
var out = cells.slice(0, want);
if (out.length < want) {
var rng = mulberry32(((seed >>> 0) ^ BATTLE_SALT) >>> 0);
var from = out.length;
while (out.length < want) {
var v = 1 + ((rng() * 9) | 0); if (v > 9) v = 9;
out.push({ v: v, dead: false });
}
for (var t = 0; t < DUEL_REROLL_MAX; t++) {
if (countPairsEx(out) >= DUEL_MIN_PAIRS) break;
for (var i = from; i < out.length; i++) {
var nv = 1 + ((rng() * 9) | 0); if (nv > 9) nv = 9;
out[i].v = nv;
}
}
}
return out;
}
function runBattleRefill() {
var board = $('board');
var res = battleRefillEx(S.cells, battleRng());
// 1) 죽은 타일의 el 제거. 팝 연출은 resolveMatch 가 이미 재생했다.
var keep = [];
for (var i = 0; i < tileEls.length; i++) {
var el = tileEls[i], c = S.cells[i];
if (!el) continue;
if (!c || c.dead) { if (el.parentNode) el.parentNode.removeChild(el); }
else keep[i] = el;
}
// 2) 새 인덱스 -> 옛 인덱스. 기록에 없는 자리는 제자리다(battleRefill 주석).
var srcOf = [], stackOf = [], n;
for (n = 0; n < res.cells.length; n++) srcOf[n] = n;
for (n = 0; n < res.moves.length; n++) srcOf[res.moves[n].to] = res.moves[n].from;
for (n = 0; n < res.spawns.length; n++) {
srcOf[res.spawns[n].to] = -1;
stackOf[res.spawns[n].to] = res.spawns[n].stack;
}
// 3) el 재배열 — 이동 셀은 기존 el 재사용, 스폰 셀만 새로 만든다.
S.cells = res.cells;
var next = new Array(S.cells.length);
for (n = 0; n < S.cells.length; n++) {
var src = srcOf[n], reuse = src >= 0 ? keep[src] : null;
if (reuse) { next[n] = reuse; continue; }
var ne = document.createElement('div');
ne.className = 'tile';
ne.appendChild(document.createElement('span'));
if (board) board.appendChild(ne);
next[n] = ne;
if (src >= 0) srcOf[n] = n;   // el 이 없던 자리: 애니메이션 없이 제자리에서 시작
}
tileEls = next;
for (n = 0; n < S.cells.length; n++) paintTile(n);   // data-v/data-i/sp — 그리고 최종 위치
// 4) 출발 위치를 되돌려 찍는다 (아직 .fall 이 없으므로 트랜지션 없음).
for (n = 0; n < tileEls.length; n++) {
var s = srcOf[n];
if (s === n) continue;                              // 제자리 — 옮길 것이 없다
if (s >= 0) { positionTile(tileEls[n], s); continue; }
var rc = idxToRC(n);
tileEls[n].style.transform = 'translate3d(' + (rc.c * (ts + GAP)) + 'px,' +
(-(stackOf[n] | 0) * (ts + GAP) - ts) + 'px,0)';  // 컬럼 상단 바깥
}
if (board) void board.offsetWidth;                    // 리플로 강제 = 여기가 출발점
// 5) 전원 낙하. layout() 은 index->transform 순수 함수라 이것만으로 성립한다.
for (n = 0; n < tileEls.length; n++) tileEls[n].classList.add('fall');
layout();
var myFall = ++fallGen;
later(function () {
if (myFall !== fallGen) return;
for (var m = 0; m < tileEls.length; m++) tileEls[m].classList.remove('fall');
}, BATTLE_FALL_MS + 40);   // 옛 값: FALL_MS + 40 (=460ms). CSS 300ms 와 어긋나 있었다
S.busy = false;
saveProgress();
afterMove();
}
function runRowCollapse(rows) {
var bonus = 50 * S.combo * rows.length * (S.feverOn ? FEVER_MULT : 1);
S.score += bonus;
if (S.feverOn) S.feverScore += bonus;
missionBump('rows', rows.length);
if (isRush()) addRushTime(RUSH_ROW_MS * rows.length);
syncHud();
// Phase 1 — whole-row flash (DESIGN 3: "행 전체 플래시 → 좌→우 스윕 소멸").
var FLASH_MS = 150;
for (var f = 0; f < rows.length; f++) {
for (var fc = 0; fc < COLS; fc++) {
var fe = tileEls[rows[f] * COLS + fc];
if (fe) fe.classList.add('rowflash');
}
}
// Phase 2 — left-to-right sweep dissolve, staggered per column.
var maxDelay = 0;
for (var k = 0; k < rows.length; k++) maxDelay = Math.max(maxDelay, (COLS - 1) * ROWGO_STAGGER);
later(function () {
for (var k2 = 0; k2 < rows.length; k2++) {
var r = rows[k2];
for (var c = 0; c < COLS; c++) {
var el = tileEls[r * COLS + c];
if (!el) continue;
el.classList.remove('rowflash');
el.style.transitionDelay = (c * ROWGO_STAGGER) + 'ms';
el.classList.add('rowgo');
}
var first = tileEls[r * COLS];
if (first && first.getBoundingClientRect) {
var rect = first.getBoundingClientRect();
J.sweep(rect.left, rect.top, COLS * ts + (COLS - 1) * GAP, ts, comboColor(S.combo));
}
}
J.sfx.rowClear();
J.screenPulse();
J.vibrate(25);
J.floatText(window.innerWidth / 2, window.innerHeight / 2, '+' + bonus, comboColor(S.combo));
}, FLASH_MS);
later(function () {
// Remove the collapsed rows from both the model and the DOM, then reindex.
var kill = {};
for (var q = 0; q < rows.length; q++) kill[rows[q]] = 1;
var keptEls = [];
for (var i = 0; i < tileEls.length; i++) {
var el = tileEls[i];
if (kill[(i / COLS) | 0]) {
if (el && el.parentNode) el.parentNode.removeChild(el);
} else if (el) {
keptEls.push(el);
}
}
S.cells = collapseRows(S.cells, rows);
tileEls = keptEls;
for (var j = 0; j < tileEls.length; j++) {
tileEls[j].classList.add('fall');
tileEls[j].setAttribute('data-i', String(j));
}
layout(); // applies the new transforms; .fall supplies the spring easing
var myFall = ++fallGen;
later(function () {
if (myFall !== fallGen) return;   // 더 새 낙하가 시작됐다
for (var m = 0; m < tileEls.length; m++) tileEls[m].classList.remove('fall');
}, FALL_MS + 40);
S.busy = false;
saveProgress();
afterMove();
}, FLASH_MS + maxDelay + 320);
}
function crumbleBlockersIfAny() {
var freed = crumbleBlockers(S.cells);
if (!freed.length) return false;
for (var i = 0; i < freed.length; i++) {
var c = tileCenter(freed[i]);
J.burst(c.x, c.y, '#e8dcc6', 12);
paintTile(freed[i]);
}
J.sfx.ice();
toast(t('adv.crumble'));
return true;
}
var nmWarnAt = 0;
function nmWarnOnce() {
if (nmWarnAt === S.startedAt) return false;
nmWarnAt = S.startedAt;
return true;
}
var CLASSIC_DEAD_AUTO_MS = 4000;
var deadAutoGen = 0;
function armDeadAuto() {
var gen = ++deadAutoGen;
later(function tick() {
if (gen !== deadAutoGen) return;                        // 더 최근 무장이 이겼다
if (!S.running || !isClassic()) return;
if (S.pairsLeft !== 0) return;                          // 사람이 먼저 풀었다
if (S.paused || S.busy) { later(tick, 600); return; }
if (addsExhausted()) return;   // 사다리(자동 셔플 → 정산)가 맡는 구간이다
toast(t('toast.autoadd'));
doAdd();
}, CLASSIC_DEAD_AUTO_MS);
}
function afterMove() {
if (battleOn()) S.duel.idleAt = now() + DUEL_IDLE_MS;
checkColumnMission();   // board-state mission, judged on every settled move
recountMoves();
var alive = 0;
for (var i = 0; i < S.cells.length; i++) if (!S.cells[i].dead) alive++;
if (alive === 0) { onStageClear(); return; }
if (findAnyPairEx(S.cells) === null && crumbleBlockersIfAny()) {
recountMoves();
if (findAnyPairEx(S.cells) !== null) { syncHud(); return; }
}
if (battleOn() && findAnyPairEx(S.cells) === null) {
if (S.shuffles <= 0) S.shuffles = 1;
doShuffle(true);
return;
}
if (findAnyPairEx(S.cells) === null && !addsExhausted() && nmWarnOnce()) {
toast(t('toast.nomoves'));
}
if (isClassic() && findAnyPairEx(S.cells) === null && !addsExhausted()) armDeadAuto();
// Wilds can rescue an otherwise dead board, so the EXT scan decides.
if (findAnyPairEx(S.cells) === null && addsExhausted()) {
if (S.shuffles > 0) { doShuffle(true); return; }
onGameOver('stuck'); return;
}
syncHud();
}
function doAdd() {
if (S.busy || S.paused || !S.running) return;
if (battleBoard()) { toast(t('toast.noadds')); J.sfx.fail(); return; }
if (addsCd()) {
// Unlimited, but rate-limited: Add becomes a timing decision.
var cdLeft = S.addCdUntil - now();
if (cdLeft > 0 && !(isClassic() && S.pairsLeft === 0)) {
toast(t('toast.addcd', { n: Math.ceil(cdLeft / 1000) }));
J.sfx.fail();
return;
}
} else if (!addsFree() && S.adds <= 0) { toast(t('toast.noadds')); J.sfx.fail(); return; }
var oldLen = S.cells.length;
var next = buildAddCells(S.cells);   // PURE: clones v only, never specials
if (next.length === oldLen) { toast(t('toast.empty')); return; }
takeSnapshot();
S.cells = next;
// Bombs are stamped onto the fresh tail only, from a deterministic stream.
S.addSeq = (S.addSeq | 0) + 1;
if (featuresOn()) {
applyBombs(S.cells, oldLen, S.mode,
mulberry32(((S.seed >>> 0) + S.addSeq * 0x9E3779B1) >>> 0));
}
if (addsCd()) S.addCdUntil = now() + RUSH_ADD_CD;
else if (!addsFree()) S.adds--;
// "No Add" mission restarts rather than failing (contract §3).
if (S.mission && S.mission.id === 'noadd' && !S.mission.done) {
S.mission.prog = 0;
syncMission();
}
clearSelection();
clearHints();
S.busy = true;
ensureTiles();
for (var i = 0; i < S.cells.length; i++) paintTile(i);
layout();
var count = S.cells.length - oldLen;
// Per-tile step and sfx thinning: see DEAL_TOTAL_MS. A short Add still deals
// at the full 30ms; a 100-tile Add compresses to fit the budget.
var step = count > 0 ? Math.min(DEAL_STAGGER, DEAL_TOTAL_MS / count) : DEAL_STAGGER;
var tickEvery = Math.max(1, Math.ceil(count / DEAL_TICKS));
for (var k = 0; k < count; k++) {
(function (k) {
var el = tileEls[oldLen + k];
if (!el) return;
var at = Math.round(k * step);
el.style.animationDelay = at + 'ms';
el.classList.add('deal');
if (k % tickEvery === 0) later(function () { J.sfx.deal(k); }, at);
})(k);
}
badgePop('add-badge');
J.vibrate(15);
syncHud();
later(function () {
for (var m = oldLen; m < tileEls.length; m++) {
if (tileEls[m]) { tileEls[m].classList.remove('deal'); tileEls[m].style.animationDelay = ''; }
}
S.busy = false;
saveProgress();
afterMove();
}, Math.round(count * step) + 320);
// Scroll the freshly dealt tail into view.
var sc = $('board-scroll');
if (sc) later(function () { sc.scrollTop = sc.scrollHeight; }, 60);
}
function doHint() {
if (S.busy || S.paused || !S.running) return;
if (S.hints <= 0) {
// [AD PLACEHOLDER — rewarded] out of hints: a rewarded ad would refill
// hints here. Wire the portal SDK to the .ad-reward slot and grant +2.
toast(t('toast.nohints'));
J.sfx.fail();
return;
}
var pair = findAnyPairEx(S.cells);
if (!pair) { toast(t('toast.nomoves')); J.sfx.fail(); return; }
S.hints--;
clearHints();
if (tileEls[pair[0]]) tileEls[pair[0]].classList.add('hint');
if (tileEls[pair[1]]) tileEls[pair[1]].classList.add('hint');
badgePop('hint-badge');
J.sfx.ui();
syncHud();
saveProgress();
later(clearHints, 1800);
}
function doUndo() {
if (S.busy || S.paused || !S.running) return;
if (S.undoLeft <= 0 || !S.snapshot) { toast(t('toast.noundo')); J.sfx.fail(); return; }
var s = S.snapshot;
S.cells = cloneCells(s.cells);   // restores sp/ice as well as v/dead
S.score = s.score;
S.combo = s.combo;
S.comboUntil = s.comboUntil;
S.adds = s.adds;
S.hints = s.hints;
S.matches = s.matches;
S.addSeq = typeof s.addSeq === 'number' ? s.addSeq : S.addSeq;
if (s.mission && S.mission) {
S.mission.id = s.mission.id;
S.mission.goal = s.mission.goal;
S.mission.prog = s.mission.prog;
S.mission.done = !!s.mission.done;
}
S.snapshot = null;
S.undoLeft--;
clearSelection();
clearHints();
// Rebuild tiles: the array length may have changed in either direction.
for (var i = 0; i < tileEls.length; i++) {
if (tileEls[i] && tileEls[i].parentNode) tileEls[i].parentNode.removeChild(tileEls[i]);
}
tileEls.length = 0;
renderAll();
// Undo restores a whole earlier board, so it is a board mutation — and it is
// the one settle path that deliberately never calls afterMove() (undoing must
// not be able to trigger a stage clear or a game over).
recountMoves();
badgePop('undo-badge');
J.sfx.ui();
syncHud();
saveProgress();
}
function doShuffle(stuck) {
if (!S.running || S.busy) return;
if (S.shuffles <= 0) { toast(t('toast.noshuffle')); J.sfx.fail(); return; }
if (!stuck && S.pairsLeft > 0) { toast(t('toast.shufflelocked')); J.sfx.fail(); return; }
clearSelection();
clearHints();
var res = shuffleBoardEx(S.cells, S.seed, S.shuffleCount, SHUF_TRIES);
S.shuffleCount += 1;
S.shuffles -= 1;
S.advShuf = true;
renderAll();
recountMoves();
syncHud();
saveProgress();
if (!res.ok) {
toast(t('toast.shufflefail'));
J.sfx.fail();
J.vibrate(60);
S.busy = true;
later(function () { S.busy = false; onGameOver('stuck'); }, CLASSIC_STUCK_MS);
return;
}
toast(t(stuck ? 'toast.shufflestuck' : 'toast.shuffled'));
J.sfx.ui();
J.vibrate(20);
}
var CLEAR_ADD_BONUS = 30;
var HARVEST_PER_TILE = CLEAR_ADD_BONUS;
var HV_LEAD_MS  = 140;    // 승리 효과음 뒤 첫 열매가 금이 되기까지
var HV_SPAN_MS  = 1400;   // 물결이 판 전체를 훑는 시간 (지시 범위 1.2~1.8초의 중앙)
var HV_STEP_MIN = 16;     // 칸 간격 하한 — 한 프레임보다 촘촘하면 물결이 아니라 동시 폭발
var HV_STEP_MAX = 90;     // 칸 간격 상한 — 남은 칸이 적을 때 피날레가 늘어지지 않게
var HV_HOLD_MS  = 180;    // 금으로 바뀐 뒤 터지기까지 (두 사건이 갈려 읽히는 최소 간격)
var HV_TAIL_MS  = 220;    // 마지막 팝 뒤 결과 시트까지 (파티클 착지 여유)
var HV_SWEEP_N  = 10;     /* 뒷정리를 한 프레임에 몇 칸씩 훑나. 63칸을 한 번에
걷으면 그 프레임 하나가 50ms 를 넘는다(실측). */
var HV_SFX_MS   = 340;    /* 효과음 최소 간격 = 물결의 **강조 리듬**. 오디오 gate()
디바운스(70ms)보다 훨씬 성근 이유는 실측이다 — 촘촘히
부르면 4x CPU 에서 프레임을 먹는다(DIAG-PAIRED.json). */
var hvGen = 0;            // 세대 — 새 판·새 피날레가 옛 rAF 루프를 무효로 만든다
var hvRaf = 0;
var hvOff = null;         // 탭-스킵 리스너 해제자 (없으면 null)
function harvestGain() { return S.harvest | 0; }
function hvReset() {
hvGen++;
if (hvRaf) { try { cancelAnimationFrame(hvRaf); } catch (e) {} hvRaf = 0; }
if (hvOff) { try { hvOff(); } catch (e) {} hvOff = null; }
}
function paintHarvestRow(id) {
var el = $(id);
if (!el) return;
var n = harvestGain();
if (n > 0) { el.textContent = t('harvest.bonus', { n: n }); el.hidden = false; }
else { el.textContent = ''; el.hidden = true; }
}
function harvestFinale(done) {
hvReset();
S.harvest = 0;
var i, live = [];
for (i = 0; i < S.cells.length; i++) {
var gc = S.cells[i];
if (gc && !gc.dead && gc.mk === 'gear') {
harvestGear({ id: gc.mkItem, tier: gc.mkTier }, 0, 0, true);
gc.mk = ''; gc.mkItem = ''; gc.mkTier = '';
}
}
for (i = 0; i < S.cells.length; i++) {
var c0 = S.cells[i];
if (c0 && !c0.dead) live.push(i);
}
var n = live.length;
if (!n) { if (done) done(); return; }
var total = n * HARVEST_PER_TILE;
if (rwReduced()) {
for (i = 0; i < n; i++) {
var rc = S.cells[live[i]];
if (rc) { rc.dead = true; rc.sp = ''; rc.ice = 0; rc.blk = 0; }
var re = tileEls[live[i]];
if (re && re.classList) re.classList.add('dead');
}
S.score += total;
S.harvest = total;
syncHud();
if (done) done();
return;
}
var pts = [];
for (i = 0; i < n; i++) pts.push(tileCenter(live[i]));
var scoreEls = [$('score-val'), $('ch-r-v')];
function hvPaintScore() {
var s = String(S.score | 0);
for (var q = 0; q < scoreEls.length; q++) {
if (scoreEls[q]) scoreEls[q].textContent = s;
}
}
var step  = clamp(HV_SPAN_MS / Math.max(1, n - 1), HV_STEP_MIN, HV_STEP_MAX);
var gen   = hvGen;
var t0    = now();
var goldN = 0, popN = 0, sfxAt = 0;
function goldAt(k) {
var el = tileEls[live[k]];
if (el && el.classList) el.classList.add('harvest');
}
function popAt(k) {
var idx = live[k], el = tileEls[idx], cc = S.cells[idx];
var v = cc ? cc.v : 1;
if (cc) { cc.dead = true; cc.sp = ''; cc.ice = 0; cc.blk = 0; }
if (el && el.classList) el.classList.add('pop');
S.score += HARVEST_PER_TILE;
S.harvest = (S.harvest | 0) + HARVEST_PER_TILE;
var ms = now();
if (ms - sfxAt >= HV_SFX_MS) { sfxAt = ms; J.sfx.gold(); }
if (k === n - 1) J.burst(pts[k].x, pts[k].y, '#ffd76a', 14, fruitOf(v));
}
function finish() {
if (gen !== hvGen) return;
hvReset();
later(function () {
var k = 0;
(function sweep() {
var end = Math.min(n, k + HV_SWEEP_N);
for (; k < end; k++) {
var e = tileEls[live[k]];
if (e && e.classList) {
e.classList.remove('harvest');
e.classList.remove('pop');
e.classList.add('dead');
}
}
if (k < n) { requestAnimationFrame(sweep); return; }
syncHud();
if (done) done();
})();
}, HV_TAIL_MS);
}
function skip() {
if (gen !== hvGen) return;
while (goldN < n) { goldAt(goldN); goldN++; }
while (popN  < n) { popAt(popN);  popN++;  }
finish();
}
hvRaf = requestAnimationFrame(function frame() {
if (gen !== hvGen) return;
var ms = now() - t0;
var wantGold = clamp(Math.floor((ms - HV_LEAD_MS) / step) + 1, 0, n);
var wantPop  = clamp(Math.floor((ms - HV_LEAD_MS - HV_HOLD_MS) / step) + 1, 0, n);
var before = popN;
while (goldN < wantGold) { goldAt(goldN); goldN++; }
while (popN  < wantPop)  { popAt(popN);  popN++;  }
if (popN >= n) { finish(); return; }
if (popN !== before) hvPaintScore();
hvRaf = requestAnimationFrame(frame);
});
if (typeof document !== 'undefined') {
var onTap = function () { skip(); };
document.addEventListener('pointerdown', onTap, true);
hvOff = function () { document.removeEventListener('pointerdown', onTap, true); };
}
}
function rollupRow(list, key, value) {
if (!list) return null;
var li = document.createElement('li');
var s = document.createElement('span');
s.setAttribute('data-i18n', key);
s.textContent = t(key);
var b = document.createElement('b');
b.textContent = '0';
li.appendChild(s);
li.appendChild(b);
list.appendChild(li);
return { el: b, target: value };
}
function countUp(entries, totalEl, total, done) {
var t0 = now();
var dur = 700;
var id = requestAnimationFrame(function step() {
var p = clamp((now() - t0) / dur, 0, 1);
var e = 1 - Math.pow(1 - p, 3);
for (var i = 0; i < entries.length; i++) {
if (entries[i] && entries[i].el) {
entries[i].el.textContent = String(Math.round(entries[i].target * e));
}
}
if (totalEl) totalEl.textContent = String(Math.round(total * e));
if (p < 1) id = requestAnimationFrame(step);
else if (done) done();
});
return id;
}
var RW_LEAD_MS = 220;      // 시트가 뜨고 첫 슬롯이 튀기까지
var RW_STEP_MS = 240;      // 슬롯 사이 간격 — reward 피치 사다리의 보폭이기도 하다
var RW_PIP_MS  = 170;      // 별 픽 점등 간격 (슬롯보다 촘촘해야 "한 세트"로 읽힌다)
var RW_TAIL_MS = 120;      // 마지막 픽이 뜨고 done 까지의 여유
var rwTimers = [];         // 진행 중인 리빌이 예약한 later() id
var rwOff    = null;       // 탭-스킵 리스너 해제자 (없으면 null)
function rwReduced() {
var mq = (typeof window !== 'undefined' && window.matchMedia)
? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
return !!(mq && mq.matches);
}
function rwReset() {
for (var i = 0; i < rwTimers.length; i++) clearTimeout(rwTimers[i]);
rwTimers.length = 0;
if (rwOff) { try { rwOff(); } catch (e) {} rwOff = null; }
var sv = $('adv-stars');
if (sv && sv.classList) sv.classList.remove('rw-seq');
}
function rwAt(fn, ms) { rwTimers.push(later(fn, ms)); }
function rewardItems(opt) {
var o = opt || {};
var out = [];
if ((S.gainStar | 0) > 0) {
out.push({ ico: '⭐', disc: 'star', key: 'rw.starfruit', val: S.gainStar | 0, rar: 'common' });
}
if ((S.gainPet | 0) > 0) {
out.push({ ico: '🐾', disc: 'pet', key: 'rw.petfruit', val: S.gainPet | 0, rar: 'common' });
}
if ((S.gainAwk | 0) > 0) out.push({ ico: '⚡', disc: 'awk', key: 'rw.awkfruit', val: S.gainAwk | 0, rar: 'common' });
if ((o.coin | 0) > 0) out.push(coinRewardItem(o.coin | 0));   /* P3 — 코인이 별보다 앞(흔한 것 먼저, §10.2 순서) */
if ((o.gem | 0) > 0) {
out.push({ ico: '★', disc: 'gem', key: 'rw.gem', val: o.gem | 0, rar: 'normal' });
}
if ((o.heart | 0) > 0) {
out.push({ ico: '❤️', disc: 'heart', key: 'rw.heart', val: o.heart | 0, rar: 'normal' });
}
var i;
for (i = 0; i < S.gainGift.length; i++) {
var g = S.gainGift[i];
if (!g) continue;
if (g.kind === 'gem') {
out.push({ ico: '★', disc: 'gem', key: 'rw.gem', val: g.n | 0, rar: 'normal' });
} else if (g.kind === 'item') {
var gi = itemById(g.id);
out.push({ ico: (gi && gi.ico) || '🎁', disc: 'item', key: 'item.' + g.id + '.nm',
val: g.lv | 0,
rar: g.tier === 'epic' ? 'epic' : (g.tier === 'rare' ? 'rare' : 'normal') });
}
}
for (i = 0; i < (S.gainGear || []).length; i++) {
var gg = S.gainGear[i], git = itemById(gg.id);
out.push(gg.max ? coinRewardItem(gg.refund | 0)
: { ico: (git && git.ico) || '🎁', disc: 'item', key: 'item.' + gg.id + '.nm', val: gg.lv,
rar: gg.tier === 'epic' ? 'epic' : (gg.tier === 'rare' ? 'rare' : 'normal'),
art: itemArtUrl(gg.id, 96) });   /* 74 T11 — 결과 줄에 장비 그림(.rw-ico[data-art]) */
}
for (i = 0; i < S.gainPets.length; i++) {
out.push({ ico: '🐾', disc: 'petnew', key: 'char.' + S.gainPets[i] + '.name',
val: 1, rar: 'epic' });
}
return out;
}
function rewardReveal(listId, items, opt) {
var o = opt || {};
rwReset();
var list   = $(listId);
var starEl = o.starEl ? $(o.starEl) : null;
var stars  = clamp(o.stars | 0, 0, 3);
var i;
items = items || [];
if (list) { list.innerHTML = ''; list.hidden = true; }
var seqStars = !!(starEl && starEl.textContent);
if (!list || (!items.length && !seqStars)) {
if (o.done) o.done();
return false;
}
if (items.length) list.hidden = false;
for (i = 0; i < items.length; i++) {
var it = items[i];
var li = document.createElement('li');
li.className = 'rw-slot';
li.setAttribute('data-rar', it.rar || 'common');
var ic = document.createElement('span');
ic.className = 'rw-ico';
if (it.disc) ic.setAttribute('data-disc', it.disc);
if (it.art) { ic.setAttribute('data-art', ''); ic.style.setProperty('--rw-art', 'url("' + it.art + '")'); }
ic.textContent = it.ico || '';
var nm = document.createElement('span');
nm.className = 'rw-name';
nm.setAttribute('data-i18n', it.key);
nm.textContent = t(it.key);
var vb = document.createElement('b');
vb.className = 'rw-val';
vb.textContent = '0';
li.appendChild(ic);
li.appendChild(nm);
li.appendChild(vb);
list.appendChild(li);
it._el = li;
it._num = vb;
it._on = false;
}
if (o.sheetId) resFit($(o.sheetId));
var pips = [];
if (seqStars) {
var txt = String(starEl.textContent || '');
starEl.innerHTML = '';
for (i = 0; i < txt.length; i++) {
var sp = document.createElement('span');
sp.className = 'rw-pip';
sp.textContent = txt.charAt(i);
starEl.appendChild(sp);
pips.push(sp);
}
if (starEl.classList) starEl.classList.add('rw-seq');
}
var reduced = rwReduced();
function land(idx) {
var e = items[idx];
if (!e || e._on) return;
e._on = true;
if (e._el.classList) e._el.classList.add('in');
J.sfx.reward(idx);                 // 슬롯 번호 = 피치 계단
J.vibrate(idx === 0 ? 18 : 12);
if (e.rar === 'epic' && typeof window !== 'undefined') {
J.screenPulse();
J.vignette(0.42);
}
countUp([{ el: e._num, target: e.val }], null, 0, null);
}
function lightPip(k, snd) {
if (pips[k] && pips[k].classList) pips[k].classList.add('on');
if (snd) J.sfx.starGet(k);
}
function finish(skipped) {
var k, pending = false;
for (k = 0; k < items.length; k++) {
if (!items[k]._on) { pending = true; items[k]._on = true; }
if (items[k]._el.classList) items[k]._el.classList.add('in');
items[k]._num.textContent = String(items[k].val);
}
for (k = 0; k < pips.length; k++) {
if (pips[k].classList && !pips[k].classList.contains('on')) {
pending = true;
pips[k].classList.add('on');
}
}
for (k = 0; k < rwTimers.length; k++) clearTimeout(rwTimers[k]);
rwTimers.length = 0;
if (rwOff) { try { rwOff(); } catch (e) {} rwOff = null; }
if (skipped && pending) J.sfx.reward(items.length ? items.length - 1 : 0);
if (o.done) o.done();
}
var host = o.sheetId ? $(o.sheetId) : null;
if (host && host.addEventListener && !reduced) {
var onTap = function () { finish(true); };
host.addEventListener('pointerdown', onTap);
host.addEventListener('touchstart', onTap, { passive: true });
rwOff = function () {
host.removeEventListener('pointerdown', onTap);
host.removeEventListener('touchstart', onTap);
};
}
if (reduced) { finish(false); return true; }
var acc = RW_LEAD_MS;
for (i = 0; i < items.length; i++) {
(function (idx, ms) { rwAt(function () { land(idx); }, ms); })(i, acc);
acc += RW_STEP_MS;
}
for (i = 0; i < pips.length; i++) {
(function (k, ms, snd) { rwAt(function () { lightPip(k, snd); }, ms); })(
i, acc + i * RW_PIP_MS, i < stars);
}
rwAt(function () { finish(false); },
acc + pips.length * RW_PIP_MS + RW_TAIL_MS);
return true;
}
function specialsAt(stage) {
var st = stage | 0;
if (st < 1) return { gold: false, wild: false, ice: false, bomb: false };
if (st < SP_STAGE_MIN) return { gold: true, wild: false, ice: false, bomb: false };
var k = specialKinds(st, S.mode);
return { gold: !!k.gold, wild: !!k.wild, ice: !!k.ice, bomb: !!k.bomb };
}
var PREVIEW_EPS = 1e-9;
function nextStagePreview(stage) {
var n = (stage | 0) + 1;
var cells = extBoardSize(n);
var cur = specialsAt(n), prv = specialsAt(n - 1);
var bits = [];
if (cur.wild && !prv.wild) bits.push(t('prev.wild'));
if (cur.ice && !prv.ice) bits.push(t('prev.ice'));
if (cur.bomb && !prv.bomb) bits.push(t('prev.bomb'));
if (extRows(n) > extRows(n - 1)) bits.push(t('prev.row'));
if (addsForStage(n) < addsForStage(n - 1)) bits.push(t('prev.adds', { n: addsForStage(n) }));
if (!bits.length && pairDensityTarget(n) < pairDensityTarget(n - 1) - PREVIEW_EPS) {
bits.push(t('prev.denser'));
}
return bits.length
? t('clear.nextpreview', { cells: cells, what: bits.join(' · ') })
: t('clear.nextpreviewplain', { cells: cells });
}
function paintNextPreview() {
var el = $('clear-next-preview');
if (!el) return;
if (S.mode !== 'endless') { el.textContent = ''; el.hidden = true; return; }
el.textContent = nextStagePreview(S.stage);
el.hidden = false;
}
function onStageClear() {
if (S.mode === 'adv') {
if (battleOn()) { S.duel.foe.hp = 0; duelTick(); return; }
if (S.advPlan && S.advPlan.boss && !S.bossDown) {
S.bossHp = 0;
S.bossDown = true;
bossDefeatFx();
finishBlast();          /* §3 재배선 보상 — bossDefeatFx 에서 뗀 몫 */
}
advFinish(true, 'empty');
return;
}
// Time Rush never stops for a modal — the clock is the only pacing device.
if (isRush()) {
if (S.score > store[bestKey()]) { store[bestKey()] = S.score; persist(); }
rushNextBoard();
return;
}
S.running = false;
S.busy = true;
stopComboLoop();
endFever(true);
clearSelection();
var bonus = S.adds * CLEAR_ADD_BONUS;
S.score += bonus;
if (S.score > store[bestKey()]) store[bestKey()] = S.score;
if (S.stage > store[bestStageKey()]) store[bestStageKey()] = S.stage;
var clearSec = Math.max(0, Math.floor((Date.now() - S.stageStartedAt) / 1000));
// extBoardSize(stage), not S.cells.length: by the time a stage clears the
// board is empty, and the grade has to scale with the size it STARTED at.
var rank = gradeFor(S.adds, S.stageMaxCombo, clearSec,
addsForStage(S.stage), extBoardSize(S.stage));
J.sfx.win();
J.vibrate(40);
heroSay('clear', 6);          // v4 6차 §C-1: 엔들리스·데일리의 스테이지 클리어
J.confetti(window.innerWidth / 2, window.innerHeight * 0.42);
later(function () { J.confetti(window.innerWidth * 0.25, window.innerHeight * 0.5); }, 160);
later(function () { J.confetti(window.innerWidth * 0.75, window.innerHeight * 0.5); }, 300);
if (isDaily()) { finishDaily(); return; }
dropProgress();
persist();
setText('clear-title', t('clear.title', { stage: S.stage }));
paintNextPreview();
var list = $('clear-rollup');
if (list) list.innerHTML = '';
var entries = [
rollupRow(list, 'clear.matches', S.matches),
rollupRow(list, 'clear.combo', S.maxCombo),
rollupRow(list, 'clear.adds', bonus)
];
// [AD PLACEHOLDER — interstitial] shown once every 3 stages. Replace the
// slot reveal below with the portal's interstitial SDK call before submit.
// Task 12 — 이 슬롯 문법(모달 안 배너)은 쓰지 않는다: 실제 정책은 모달을
// **열기 직전** SDK 전면 광고 요청이라(아래 requestMidgameAd), 이 토글은
// 그대로 둬도 무해하다(.ad-slot 은 .ad-live 없이는 항상 display:none).
var inter = document.querySelector('.ad-slot[data-ad-slot="interstitial"]');
if (inter) inter.hidden = !(S.stage % 3 === 0);
TW_PORTAL.requestMidgameAd(function () {
openModal('modal-clear');
// Task 12 rev1(m-9) — 등급 뱃지·점수 집계 애니메이션을 광고 뒤로. 광고
// 앞에서 시작하면 광고가 뜨는 사이 집계·축하 연출이 화면 뒤에서 혼자
// 끝난다(onStageClear 위쪽 대사와 같은 이유).
showGrade(rank);
countUp(entries, $('clear-total'), S.score, function () { celebrateGrade(rank); });
rewardReveal('clear-reward', rewardItems({ gem: S.gainJstar }), { sheetId: 'modal-clear' });
if (!store.rushHintShown && S.mode === 'endless') {
store.rushHintShown = true;
persist();
later(function () { toast(t('toast.rushopen')); }, 900);
}
});
}
function nextStage() {
closeModal('modal-clear');
J.sfx.ui();
S.combo = 1;
S.comboUntil = 0;
startStage(S.stage + 1, (S.seed + 0x9E3779B1) >>> 0);
afterMoveGuard();
}
function afterMoveGuard() {
if (findAnyPairEx(S.cells) === null && crumbleBlockersIfAny()) {
recountMoves();
if (findAnyPairEx(S.cells) !== null) return;
}
if (findAnyPairEx(S.cells) === null && addsExhausted()) {
// Same escalation as afterMove(): re-deal once before declaring it over.
// AD HOOK: a rewarded video could grant a further shuffle here.
if (S.shuffles > 0) { doShuffle(true); return; }
onGameOver('stuck'); return;
}
}
var overSepNode = null;     // the ' · ' text node between best and stage
var overSepText = '';       // ...and what it said before it was blanked
var overSepLooked = false;  // markup is static: look for the node exactly once
function overStageNodes() {
var val = $('over-stage');
if (!val) return null;
var lab = null, p = val.parentNode;
if (p && p.querySelector) lab = p.querySelector('[data-i18n="over.stage"]');
if (!overSepLooked && p && p.childNodes) {
overSepLooked = true;
for (var i = 0; i < p.childNodes.length; i++) {
var n = p.childNodes[i];
// nodeType 3 === TEXT_NODE, spelled out to stay ES5-plain in old engines
if (n && n.nodeType === 3 && n.nodeValue && n.nodeValue.indexOf('·') >= 0) {
overSepNode = n;
overSepText = n.nodeValue;
break;
}
}
}
return { val: val, lab: lab };
}
function paintOverModal() {
var o = S.overInfo;
if (!o) return;
setText('over-title', (o.rush && !o.stuck) ? t('over.rush.title') : t('over.title'));
var om = $('modal-over'); if (om) om.classList.toggle('is-rush', !!(o.rush && !o.stuck));
setText('over-score', o.score);
setText('over-best', o.best);
setText('over-stage', o.stage);
var ol = $('over-best-label');
if (ol) ol.textContent = o.rush ? t('over.rush.best') : t('over.best');
var rl = $('over-rank-line');
if (rl) {
var rk = o.rank | 0;
rl.hidden = !(rk > 0);
rl.textContent = rk > 0 ? t('rank.overline', { n: rk }) : '';
}
// Idempotent in both directions: every call sets the full state, never toggles.
var st = overStageNodes();
if (st) {
if (st.val.style) st.val.style.display = o.rush ? 'none' : '';
if (st.lab && st.lab.style) st.lab.style.display = o.rush ? 'none' : '';
if (overSepNode) overSepNode.nodeValue = o.rush ? '' : overSepText;
}
}
function onGameOver(cause) {
if (S.mode === 'adv') {
advFinish(battleOn() ? duelTimeoutWin() : advGoalMet(), 'stuck');
return;
}
if (isArcadeDuel()) { stopRush(); arcFinish('timeup'); return; }
S.running = false;
S.busy = true;
stopComboLoop();
stopTimer();
stopRush();
endFever(true);
clearSelection();
var board = $('board');
if (board) board.classList.add('grayed');
J.sfx.lose();
J.vibrate(60);
mascotSad();
var rush = isRush();
if (rush) dqBump('rush', S.score | 0, true);
if (S.score > store[bestKey()]) store[bestKey()] = S.score;
if (!rush && S.stage > store[bestStageKey()]) store[bestStageKey()] = S.stage;
dropProgress();
persist();
clearRankFresh();
var rkey = rankKeyOf();
var newRank = rush
? submitRank(rkey, { score: S.score, matches: S.matches })
: submitRank(rkey, { score: S.score, stage: S.stage });
if (newRank > 0) {
rankFresh.mode = rkey;
rankFresh.pos = newRank;
}
var overCoin = coinForRank(newRank);   /* P3 — 기록판 순위로 세 단 */
var sameRunPaid = S.coinRunAt === S.startedAt && (S.runCoin | 0) > 0;   /* 이 판은 이미 오늘 몫을 받았다 → 차이만, 셈 안 씀(102 리뷰 반영 · 지휘자 판정) */
if (isDaily() && coinPlayed() && !sameRunPaid && !coinCapTake('dOver', COIN_DAILY_OVER_DAY_MAX)) overCoin = 0;   /* 판정판 102 ① — 데일리 게임오버 코인은 새 판 하루 1번(끝까지 finishDaily 는 무변) */
runCoinPay(overCoin);
// Freeze exactly what the modal shows. Re-painting later (a language
// toggle, say) then cannot read state that has moved on in the meantime.
S.overInfo = {
rush: rush,
score: S.score,
best: store[bestKey()],   // W7.5 — 이 판이 겨룬 바로 그 기록
stage: S.stage,
rank: newRank,
stuck: cause === 'stuck'
};
paintOverModal();
shareCardPrep('over', 'over-card-thumb');
paintContinueBtn();
later(function () {
TW_PORTAL.requestMidgameAd(function () {
paintContinueBtn();
openModal('modal-over');
// Fired with the sheet, not before it: the float text is drawn on #fx
// above the modal, and landing it on an empty board reads as a glitch.
celebrateRank(newRank);
rewardReveal('over-reward', rewardItems({ gem: S.gainJstar, coin: S.gainCoin | 0 }), { sheetId: 'modal-over' });
paintCoinX2('over');   /* P3 T9 — 방금 끝난 판의 창에만 2배 줄 */
});
}, 520);
}
function appGemContinue() {
var p = '';
try { p = (window.TW && window.TW.platform) || ''; } catch (e) { p = ''; }
return p === 'twa' && typeof store.jewel === 'number';
}
function paintContinueBtn() {
var cont = $('btn-continue');
if (!cont) return;
var rush = !!(S.overInfo && S.overInfo.rush);
var used = !!S.continueUsed;
var gem  = used && appGemContinue();
var adCan = used && !gem && !S.adContinueUsed && TW_PORTAL.env === 'crazygames' && TW_PORTAL.canReward();
var contOk = !rush && (!used || gem || adCan);
cont.hidden = !contOk;
var rb = $('btn-retry'), rs = $('btn-over-retry');
if (rb) rb.hidden = contOk;
if (rs) rs.hidden = !contOk;
// Time Rush has unlimited Adds, so the "+2 Add" slot is pointless.
if (rush) return;
var ad   = used && !gem && !S.adContinueUsed && TW_PORTAL.env === 'crazygames' && TW_PORTAL.canReward();
cont.disabled = used && !gem && !ad;
if (gem) cont.setAttribute('data-app-only', 'gem-continue');
else cont.removeAttribute('data-app-only');
var key  = !used ? 'over.continue' : (gem ? 'over.continue.gem' : (ad ? 'portal.watchad.continue' : 'over.continue.used'));
var akey = (used && !gem && !ad) ? 'aria.continue.used' : (ad ? 'aria.continue.ad' : 'aria.continue');
cont.setAttribute('data-i18n', key);
cont.setAttribute('data-i18n-aria', akey);
headText(cont, t(key));
cont.setAttribute('aria-label', t(akey));
}
function doContinue() {
if (S.continueUsed) {
if (TW_PORTAL.env === 'crazygames' && !appGemContinue() && !S.adContinueUsed && TW_PORTAL.canReward()) {
var contBtn = $('btn-continue');
if (contBtn) contBtn.disabled = true;
TW_PORTAL.requestRewardedAd('continue', function (ok) {
if (ok) { S.adContinueUsed = true; twGrantContinue(); return; }
toast(t('portal.ad.fail'));   // I-6/m-2 — "이미 썼어요" 와 분리된 실패 전용 문구
J.sfx.fail();
paintContinueBtn();
});
return;
}
if (!jewelPayContinue()) {
toast(t(appGemContinue() ? 'shop.poor.continue' : 'toast.usedstage'));
J.sfx.fail();
return;
}
toast(t('shop.continue.paid', { n: JEWEL_COST.continue2 }));
}
twGrantContinue();
}
function twGrantContinue() {
TW_PORTAL.gameplayStart();   /* Task 12 rev1(C-1) — 이어하기 = 재개(revive) */
S.continueUsed = true;
S.adds += 2;
S.running = true;
S.busy = false;
S.overInfo = null;      // back in play: the modal is no longer meaningful
shareCardReset();       // 판정판 53 — 게임오버가 취소됐으므로 그 카드도 취소다
var board = $('board');
if (board) board.classList.remove('grayed');
var cont = $('btn-continue');
if (cont) cont.hidden = !appGemContinue();
closeModal('modal-over');
J.sfx.ui();
badgePop('add-badge');
syncHud();
saveProgress();
if (isDaily()) startTimer();
}
function yesterdayKey() {
var d = new Date();
d.setDate(d.getDate() - 1);
return todayKey(d);
}
function bumpStreak() {
var today = todayKey();
if (store.lastDailyDate === today) return;
var goes = (store.lastDailyDate === yesterdayKey());
store.streak = goes ? (store.streak + 1) : 1;
store.lastDailyDate = today;
if (!goes) store.streakClaimed = {};
}
function claimStreakRewards() {
var got = { heart: 0, jstar: 0, days: [] };
if (!store.streakClaimed || typeof store.streakClaimed !== 'object') store.streakClaimed = {};
for (var i = 0; i < STREAK_REWARD.length; i++) {
var r = STREAK_REWARD[i], k = String(r.day);
if ((store.streak | 0) < r.day) continue;
if (store.streakClaimed[k]) continue;
store.streakClaimed[k] = 1;
got.days.push(r.day);
if (r.heart) { grantHearts(r.heart); got.heart += r.heart; }
if (r.jstar) { store.jstar = (store.jstar | 0) + r.jstar; got.jstar += r.jstar; }
}
return got;
}
function buildEmojiGrid(seed) {
var rng = mulberry32(seed >>> 0);
var rows = [];
for (var r = 0; r < 5; r++) {
var line = '';
for (var c = 0; c < 5; c++) {
line += GRID_EMOJI[(rng() * GRID_EMOJI.length) | 0];
}
rows.push(line);
}
return rows.join('\n');
}
function finishDaily() {
TW_PORTAL.gameplayStop();   /* Task 12 rev1(C-1) — 판이 끝나는 즉시 */
stopTimer();
var sec = Math.floor((Date.now() - S.startedAt) / 1000);
var classicRun = (S.mode === 'classic-daily');
var bestSlot = classicRun ? 'classicDailyBest' : 'dailyBest';
var replay = dailyIsReplay();
var streakGot = { heart: 0, jstar: 0, days: [] };
if (!classicRun && !replay) { bumpStreak(); streakGot = claimStreakRewards(); }
if (!classicRun && store.shardDailyDate !== todayKey()) {
store.shardDailyDate = todayKey();
store.jstar = (store.jstar | 0) + DAILY_JSTAR;
S.gainJstar = (S.gainJstar | 0) + DAILY_JSTAR;
}
if (!classicRun) { dqBump('daily', 1); achvCheck(); }
var rec = {
date: todayKey(), seed: dailyKey(), n: dailyNumber(), timeSec: sec,
matches: S.matches, maxCombo: S.maxCombo, score: S.score,
// Grade and milestones are seed-independent, so awarding them in Daily
// costs nothing in fairness — everyone still solves the same board.
// Daily's board is genBoardBanded(3, dateSeed), so its size is the one
// extBoardSize(3) reports — the same normaliser every player gets.
grade: gradeFor(S.adds, S.maxCombo, sec, 3, extBoardSize(3)),
grid: buildEmojiGrid(S.gridSeed)
};
if (!replay) store[bestSlot] = rec;
if (streakGot.days.length) {
toast(t('streak.reward', { d: streakGot.days[streakGot.days.length - 1] }));
}
dropProgress();
persist();
clearRankFresh();
var dRank = replay ? 0 : submitRank(rankKeyOf(), {
timeSec: sec, n: dailyNumber(), matches: S.matches,
maxCombo: S.maxCombo, grade: rec.grade, date: todayKey()
});
if (dRank > 0) { rankFresh.mode = rankKeyOf(); rankFresh.pos = dRank; }
runCoinPay(replay ? 0 : coinForRank(dRank));
dailyReward = rewardItems({
gem:   (S.gainJstar | 0) + (streakGot.jstar | 0),
heart: streakGot.heart | 0,
coin:  S.gainCoin | 0
});
showDailyResult(dRank, classicRun, replay ? rec : undefined, true);
}
function showDailyResult(rank, classicRun, rec, viaFinish) {
var d = rec || ((classicRun === undefined) ? dailyBestNow()
: (classicRun ? store.classicDailyBest : store.dailyBest));
if (!d) { goMenu(); return; }
dailyShown = d;
dailyRank = rank | 0;
var drw = dailyReward;
dailyReward = [];
var openTail = function () {
setText('daily-title', t('daily.title', { n: d.n }));
setText('daily-stats', dailyStatsLine(d));
paintDailyRankLine();
var g = $('daily-grid');
if (g) g.textContent = d.grid || '';
closeAllModals();
showScreen('screen-game');
openModal('modal-daily');
shareCardPrep('daily', 'daily-card-thumb');
celebrateRank(dailyRank);
later(function () {
rewardReveal('daily-reward', drw, { sheetId: 'modal-daily' });
paintCoinX2(viaFinish ? 'daily' : '');   /* P3 T9 — 허브에서 오늘 결과를 다시 열 때는 직전 다른 판의 줄이 뜨지 않게 창 이름을 비운다(W18) */
}, 420);
};
if (viaFinish) { TW_PORTAL.requestMidgameAd(openTail); } else { openTail(); }
}
var SHARE_URL = 'https://ghkd70408040-wq.github.io/game-factory-site/tentwin.html?ref=share';
function withShareLink(txt, url) {
if (TW_PORTAL.env === 'crazygames') return txt;
return txt ? (txt + '\n' + (url || SHARE_URL)) : txt;
}
var dailyShown = null;
function dailyShareUrl(d) {
return SHARE_URL + '&daily=' + ((d && (d.seed || d.date)) || dailyKey());
}
function shareText() {
var d = dailyShown || dailyBestNow();   // W7.5 — 방금 끝낸 판의 칸
if (!d) return '';
// Language-independent by design (contract §8).
return withShareLink('Ten Twin #' + d.n + ' ✅ ' + fmtTime(d.timeSec) + ' 🔥' + d.maxCombo + 'x' +
(d.grade ? ' ' + d.grade : '') + '\n' + (d.grid || ''), dailyShareUrl(d));
}
function copyToClipboard(txt) {
if (!txt) return;
var ok = function () { toast(t('toast.copied')); J.sfx.ui(); };
var fallback = function () {
try {
var ta = document.createElement('textarea');
ta.value = txt;
ta.setAttribute('readonly', '');
ta.style.position = 'fixed';
ta.style.top = '-1000px';
ta.style.opacity = '0';
document.body.appendChild(ta);
ta.select();
ta.setSelectionRange(0, txt.length);
var done = document.execCommand && document.execCommand('copy');
document.body.removeChild(ta);
if (done) ok(); else toast(t('toast.copyfail'));
} catch (e) { toast(t('toast.copyfail')); }
};
try {
if (navigator.clipboard && navigator.clipboard.writeText) {
navigator.clipboard.writeText(txt).then(ok, fallback);
} else fallback();
} catch (e) { fallback(); }
}
function copyShare() { copyToClipboard(shareText()); }
function shareOut(txt) {
if (!txt) return;
try {
if (typeof navigator !== 'undefined' && navigator.share) {
var pr = navigator.share({ text: txt });
if (pr && pr.then) {
pr.then(function () { J.sfx.ui(); }, function (e) {
if (e && e.name === 'AbortError') return;   // 사용자가 닫았다 — 끝
copyToClipboard(txt);
});
}
return;
}
} catch (e) { /* 아래 클립보드로 */ }
copyToClipboard(txt);
}
function arcShareText() {
var mode = arcLast || S.mode;
if (!ARC_MODES[mode]) return '';
var d = S.duel;
var value = (mode === 'arc-dmg')
? (d ? (d.dmg | 0) : 0)
: Math.max(0, (S.arcLastValue | 0));
ensureArcadeBest();
var b = store.arcadeBest[mode];
return withShareLink('Ten Twin ⚔ ' + arcModeName(mode) + '\n' +
arcValueText(mode, value) + ' · ' + arcDirText(mode) +
(b && typeof b.value === 'number'
? '\n👑 ' + arcValueText(mode, b.value) : '') +
'\n' + t('share.beat'));
}
function scoreShareText() {
var o = S.overInfo;
if (!o) return '';
return withShareLink('Ten Twin ' + (o.rush ? '⚡ Time Rush ' : '') + o.score +
(o.rush ? '' : ' · Stage ' + o.stage) + ' 🍬\n' + t('share.beat'));
}
function shareScore() { copyToClipboard(scoreShareText()); }
var CARD_L = {
safe: 0.04,
logo_top: 0.050, logo_box: [0.62, 0.135],
mode_y: 0.250, mode_f: 0.046,
value_y: 0.385, value_f: 0.115,
sub_y: 0.455, sub_f: 0.036,
num_y: 0.545, num_f: 0.032,
extra_y: 0.610, extra_f: 0.032,
char_h: 0.340, char_bottom: 0.885, char_right: 0.955,
foot_y: 0.925, foot_f: 0.026,
url_y: 0.950, url_f: 0.018,
mid_box: 0.86,
left_x: 0.070, left_box: 0.58
};
function shareCardSupported() {
try {
return !!(typeof document !== 'undefined' && document.createElement &&
typeof Promise === 'function' &&
typeof HTMLCanvasElement !== 'undefined' &&
HTMLCanvasElement.prototype && HTMLCanvasElement.prototype.toBlob &&
typeof URL !== 'undefined' && URL.createObjectURL);
} catch (e) { return false; }
}
function shareCardCssUrl(name) {
var v = '';
try { v = getComputedStyle(document.documentElement).getPropertyValue(name) || ''; }
catch (e) { return ''; }
var m = /url\(\s*(['"]?)([\s\S]*?)\1\s*\)/.exec(v);
return m ? m[2] : '';
}
function shareCardToken(name, fallback) {
var v = '';
try { v = (getComputedStyle(document.documentElement).getPropertyValue(name) || '').trim(); }
catch (e) { v = ''; }
return v || fallback;
}
function cardInkBox(d, w, h, thr) {
var l = w, t = h, r = -1, b = -1, x, y, row;
for (y = 0; y < h; y++) {
row = y * w * 4;
for (x = 0; x < w; x++) {
if (d[row + (x << 2) + 3] > thr) {
if (x < l) l = x;
if (x > r) r = x;
if (y < t) t = y;
b = y;
}
}
}
return (r < 0) ? null : { l: l, t: t, r: r + 1, b: b + 1 };
}
function cardAlphaBox(im) {
var w = im.naturalWidth || im.width || 0, h = im.naturalHeight || im.height || 0;
var box = { x: 0, y: 0, w: w, h: h };
if (!w || !h) return box;
try {
var cv = document.createElement('canvas');
cv.width = w; cv.height = h;
var cx = cv.getContext('2d');
cx.drawImage(im, 0, 0);
var bb = cardInkBox(cx.getImageData(0, 0, w, h).data, w, h, 0);
if (bb) { box.x = bb.l; box.y = bb.t; box.w = bb.r - bb.l; box.h = bb.b - bb.t; }
} catch (e) { /* 못 재면 파일 캔버스 그대로 — 카드는 그래도 나간다 */ }
return box;
}
function shareCardLoad(url) {
return new Promise(function (resolve) {
if (!url) { resolve(null); return; }
var im = new Image();
im.onload = function () { resolve(im); };
im.onerror = function () { resolve(null); };
try { im.src = url; } catch (e) { resolve(null); }
});
}
function cardRun(cx, out, id, str, o) {
if (!str) return;
var size = o.size, min = o.min || Math.max(10, o.size * 0.45), w;
cx.textAlign = o.align || 'center';
cx.textBaseline = 'alphabetic';
for (;;) {
cx.font = (o.weight || 800) + ' ' + Math.round(size) + 'px ' + o.fam;
w = cx.measureText(str).width;
if (w <= o.box || size <= min) break;
size = Math.max(min, size * (o.box / w) * 0.98);
}
if (w > o.box) out.overflow.push({ id: id, w: Math.round(w), box: Math.round(o.box) });
cx.globalAlpha = (typeof o.alpha === 'number') ? o.alpha : 1;
cx.fillStyle = o.fill;
cx.fillText(str, o.x, o.y);
cx.globalAlpha = 1;
out.texts.push({ id: id, str: str, x: Math.round(o.x), y: Math.round(o.y), w: Math.round(w) });
}
function shareCardData(kind) {
if (kind === 'daily') {
var d = dailyShown || dailyBestNow();
if (!d) return null;
return {
mode: t('menu.daily'),
value: fmtTime(d.timeSec),
sub: '🔥' + d.maxCombo + 'x · ' + d.matches + (d.grade ? ' · ' + d.grade : ''),
num: '#' + d.n,
extra: '',
url: dailyShareUrl(d)
};
}
if (kind === 'arc') {
var mode = arcLast || S.mode;
if (!ARC_MODES[mode]) return null;
var du = S.duel;
var v = (mode === 'arc-dmg') ? (du ? (du.dmg | 0) : 0) : Math.max(0, (S.arcLastValue | 0));
ensureArcadeBest();
var b = store.arcadeBest[mode];
return {
mode: arcModeName(mode),
value: arcValueText(mode, v),
sub: arcDirText(mode),
num: t('arc.kos', { n: du ? (du.kos | 0) : 0 }),
extra: (b && typeof b.value === 'number')
? t('arc.best', { v: arcValueText(mode, b.value) }) : t('arc.nobest'),
url: SHARE_URL
};
}
var o = S.overInfo;
if (!o) return null;
return {
mode: (o.rush && !o.stuck) ? t('over.rush.title') : t('over.title'),
value: String(o.score),
// 러시에는 스테이지가 뜻이 없다 — scoreShareText 가 빼는 그 자리다.
sub: o.rush ? '' : (t('over.stage') + ' ' + o.stage),
num: (o.rush ? t('over.rush.best') : t('over.best')) + ' ' + o.best,
extra: '',
url: SHARE_URL
};
}
function buildShareCard(kind) {
return new Promise(function (resolve, reject) {
if (!shareCardSupported()) { reject(new Error('share-card: unsupported')); return; }
var data = shareCardData(kind);
if (!data) { reject(new Error('share-card: no result for ' + kind)); return; }
var logoUrl = (currentLang() === 'en') ? 'catalog/art-logo-en2.webp'   /* final-fix M-5 */
: shareCardCssUrl('--art-logo');
var charUrl = shareCardCssUrl('--ch-' + charId() + '-full');
Promise.all([shareCardLoad(logoUrl), shareCardLoad(charUrl)]).then(function (ims) {
try { cardPaint(data, ims[0], ims[1], resolve, reject); }
catch (e) { reject(e); }
}, reject);
});
}
function cardPaint(data, logo, ch, resolve, reject) {
var L = CARD_L, W = 1080, H = 1350;
var bg = document.createElement('canvas');
bg.width = W; bg.height = H;
var bx = bg.getContext('2d');
var g = bx.createLinearGradient(0, 0, 0, H - 1);
g.addColorStop(0, '#C6D0FF');
g.addColorStop(1, '#ACB8F8');
bx.fillStyle = g;
bx.fillRect(0, 0, W, H);
var lay = document.createElement('canvas');
lay.width = W; lay.height = H;
var cx = lay.getContext('2d');
var ink = shareCardToken('--prim-ink', '#221B2E');
var fam = shareCardToken('--font', '-apple-system, "Segoe UI", Roboto, sans-serif');
var out = { overflow: [], texts: [] };
if (logo) {
var lb = cardAlphaBox(logo);
var bw = W * L.logo_box[0], bh = H * L.logo_box[1];
var s = Math.min(bw / lb.w, bh / lb.h);          // fit() 와 같은 식
var lw = Math.max(1, Math.round(lb.w * s)), lh = Math.max(1, Math.round(lb.h * s));
cx.drawImage(logo, lb.x, lb.y, lb.w, lb.h,
Math.round((W - lw) / 2), Math.round(H * L.logo_top), lw, lh);
}
if (ch) {
var cb = cardAlphaBox(ch);
var chh = Math.max(1, Math.round(H * L.char_h));
var chw = Math.max(1, Math.round(cb.w * chh / cb.h));
cx.drawImage(ch, cb.x, cb.y, cb.w, cb.h,
Math.round(W * L.char_right) - chw, Math.round(H * L.char_bottom) - chh, chw, chh);
}
var mid = W * L.mid_box, lx = W * L.left_x, lbox = W * L.left_box;
cardRun(cx, out, 'mode', data.mode,
{ x: W / 2, y: H * L.mode_y, box: mid, size: H * L.mode_f, fill: ink, fam: fam, alpha: .78 });
cardRun(cx, out, 'value', data.value,
{ x: W / 2, y: H * L.value_y, box: mid, size: H * L.value_f, weight: 900, fill: ink, fam: fam });
cardRun(cx, out, 'sub', data.sub,
{ x: W / 2, y: H * L.sub_y, box: mid, size: H * L.sub_f, fill: ink, fam: fam, alpha: .86 });
cardRun(cx, out, 'num', data.num,
{ x: lx, y: H * L.num_y, box: lbox, size: H * L.num_f, align: 'left', fill: ink, fam: fam, alpha: .86 });
cardRun(cx, out, 'extra', data.extra,
{ x: lx, y: H * L.extra_y, box: lbox, size: H * L.extra_f, align: 'left', fill: ink, fam: fam, alpha: .86 });
cardRun(cx, out, 'foot', 'Ten Twin',
{ x: W / 2, y: H * L.foot_y, box: mid, size: H * L.foot_f, weight: 900, fill: ink, fam: fam, alpha: .72 });
cardRun(cx, out, 'url', (TW_PORTAL.env === 'crazygames') ? '' : String(data.url || SHARE_URL).replace(/^https?:\/\//, ''),
{ x: W / 2, y: H * L.url_y, box: mid, size: H * L.url_f, weight: 600, min: 14, fill: ink, fam: fam, alpha: .62 });
var cvo = document.createElement('canvas');
cvo.width = W; cvo.height = H;
var ox = cvo.getContext('2d');
ox.drawImage(bg, 0, 0);
ox.drawImage(lay, 0, 0);
var bb = cardInkBox(cx.getImageData(0, 0, W, H).data, W, H, 8);
var ink4 = bb ? { l: bb.l, t: bb.t, r: bb.r, b: bb.b } : { l: 0, t: 0, r: W, b: H };
var m = bb ? { l: bb.l, t: bb.t, r: W - bb.r, b: H - bb.b } : { l: 0, t: 0, r: 0, b: 0 };
var pct = { l: m.l / W, r: m.r / W, t: m.t / H, b: m.b / H };
cvo.toBlob(function (blob) {
if (!blob) { reject(new Error('share-card: toBlob failed')); return; }
var url = '';
try { url = URL.createObjectURL(blob); } catch (e) { url = ''; }
resolve({
blob: blob, url: url, width: W, height: H,
ink: ink4, inkPct: pct, overflow: out.overflow, texts: out.texts
});
}, 'image/png');
}
var shareCardCache = null;   // { kind, res }
var shareCardGen = 0;        // 세대 번호. 늦게 도착한 굽기를 버리는 데 쓴다.
var shareCardThumb = null;   // 그 blob 주소를 걸고 있는 <img> (반납 전에 떼야 한다)
function shareCardReset() {
if (shareCardThumb) {
shareCardThumb.hidden = true;
shareCardThumb.removeAttribute('src');
shareCardThumb = null;
}
if (shareCardCache && shareCardCache.res && shareCardCache.res.url) {
try { URL.revokeObjectURL(shareCardCache.res.url); } catch (e) { /* 이미 반납됨 */ }
}
shareCardCache = null;
shareCardGen++;
}
function shareCardPrep(kind, thumbId) {
shareCardReset();
var img = $(thumbId);
if (img) { img.hidden = true; img.removeAttribute('src'); }
if (!shareCardSupported()) return;
var gen = shareCardGen;
buildShareCard(kind).then(function (res) {
if (gen !== shareCardGen) {                 // 그 사이에 다음 판이 열렸다
try { URL.revokeObjectURL(res.url); } catch (e) {}
return;
}
shareCardCache = { kind: kind, res: res };
if (img && res.url) { img.onload = function () { resFit(img.closest ? img.closest('.modal') : null); }; img.src = res.url; img.hidden = false; shareCardThumb = img; }
}, function () { /* 카드 없이도 공유는 산다 */ });
}
function shareCardOut(kind, txt, fallback) {
var c = shareCardCache;
if (c && c.kind === kind && c.res && c.res.blob &&
typeof File === 'function' && typeof navigator !== 'undefined' &&
navigator.canShare && navigator.share) {
try {
var f = new File([c.res.blob], 'tentwin-' + kind + '.png', { type: 'image/png' });
if (navigator.canShare({ files: [f] })) {
var pr = navigator.share({ files: [f], text: txt });
if (pr && pr.then) {
pr.then(function () { J.sfx.ui(); }, function (e) {
if (e && e.name === 'AbortError') return;   // 사용자가 닫았다 — 끝
fallback();
});
}
return;
}
} catch (e) { /* 아래 글+주소 경로로 */ }
}
fallback();
}
var rankMode = 'endless';
var rankFresh = { mode: '', pos: 0 };
var dailyRank = 0;
var dailyReward = [];
function clearRankFresh() { rankFresh.mode = ''; rankFresh.pos = 0; }
function normRankMode(m) {
return (RANK_MODES.indexOf(m) >= 0) ? m : 'endless';
}
function rankDateText(d) {
var s = String(d || '');
if (s.length !== 8) return t('rank.dateunknown');
return s.slice(0, 4) + '-' + s.slice(4, 6) + '-' + s.slice(6, 8);
}
function buildRankRow(i, e) {
var row = document.createElement('div');
var cls = 'rank-row set-row';
if (!e) cls += ' rank-empty';
else if (rankFresh.mode === rankMode && rankFresh.pos === i + 1) cls += ' rank-fresh';
row.className = cls;
var pos = document.createElement('span');
pos.className = 'rank-pos';
pos.textContent = String(i + 1);
var main = document.createElement('span');
main.className = 'rank-main';
var meta = document.createElement('span');
meta.className = 'rank-meta';
if (!e) {
main.textContent = t('rank.empty');
meta.textContent = '';
} else if (rankShape(rankMode) === 'daily') {
main.textContent = t('rank.row.daily', { time: fmtTime(e.timeSec) });
meta.textContent = t('rank.meta.daily', {
n: e.n, combo: e.maxCombo, date: rankDateText(e.date)
});
} else if (rankShape(rankMode) === 'rush') {
main.textContent = t('rank.row.rush', { score: e.score });
meta.textContent = t('rank.meta.rush', { matches: e.matches, date: rankDateText(e.date) });
} else {
main.textContent = t('rank.row.endless', { score: e.score });
meta.textContent = t('rank.meta.endless', { stage: e.stage, date: rankDateText(e.date) });
}
row.appendChild(pos);
row.appendChild(main);
row.appendChild(meta);
return row;
}
function buildRankList() {
if (typeof document === 'undefined') return;
var i, b;
for (i = 0; i < RANK_MODES.length; i++) {
b = $('rank-tab-' + RANK_MODES[i]);
if (!b) continue;
var sel = (RANK_MODES[i] === rankMode);
if (b.classList) b.classList.toggle('on', sel);
b.setAttribute('aria-selected', sel ? 'true' : 'false');
}
// Written through t(), so applyI18n() cannot reach it — syncDynamicI18n() does.
setText('rank-hint', t('rank.hint.' + rankMode));
var list = $('rank-list');
if (!list) return;
var arr = (store.ranks && Array.isArray(store.ranks[rankMode])) ? store.ranks[rankMode] : [];
list.textContent = '';                     // cheapest full clear, no parser
for (i = 0; i < RANK_CAP; i++) list.appendChild(buildRankRow(i, arr[i]));
buildArcRankSection(list);
}
function buildArcRankSection(list) {
ensureArcadeBest();
var modes = ['arc-time', 'arc-surv', 'arc-dmg'], i;
var sec = document.createElement('div');
sec.className = 'rank-arc';
var h = document.createElement('div');
h.className = 'rank-arc-h';
h.textContent = t('rank.arc.title');
sec.appendChild(h);
for (i = 0; i < modes.length; i++) {
var m = modes[i];
var e = store.arcadeBest[m];
var row = document.createElement('div');
row.className = 'rank-row rank-arc-row set-row' + (e ? '' : ' rank-empty');  /* ⑩ [0904] 설정창 .set-row 부품 통일 */
var main = document.createElement('span');
main.className = 'rank-main';
var val = document.createElement('b');
val.className = 'arc-v';
val.textContent = e && typeof e.value === 'number' ? arcValueText(m, e.value) : '-';
main.appendChild(val);
main.appendChild(document.createTextNode(arcModeName(m)));
var meta = document.createElement('span');
meta.className = 'rank-meta';
meta.textContent = arcDirText(m) + (e && e.date ? ' · ' + rankDateText(e.date) : '');
row.appendChild(main);
row.appendChild(meta);
sec.appendChild(row);
}
list.appendChild(sec);
}
var questTab = 'daily';
function questText(e, tab) {
if (tab === 'weekly') return t('wq.' + e.id, { n: e.goal });
if (tab === 'epic') return t('ach.' + e.id, { n: achvGoal(e) });
return t('dq.' + e.id, { n: e.goal });
}
var QS_GAUGE =
'<i class="kit-gauge-v2__gem" aria-hidden="true"></i>' +
'<i class="kit-gauge-v2__fill">' +
'<i class="kit-gauge-v2__cap" data-side="l"></i>' +
'<i class="kit-gauge-v2__cap" data-side="r"></i>' +
'</i>';
function questRow(tab, id, ico, label, prog, goal, v, claimed) {
var done = (prog | 0) >= (goal | 0);
var row = document.createElement('div');
row.className = 'qs-row';
row.setAttribute('data-state', claimed ? 'claimed' : (done ? 'done' : 'prog'));
var rw = document.createElement('span');
rw.className = 'qs-rw';
var ic = document.createElement('i');
ic.className = 'qs-rw-ic';
ic.setAttribute('aria-hidden', 'true');
ic.style.setProperty('--q-ico', 'var(' + ico + ')');
var rn = document.createElement('b');
rn.className = 'qs-rw-n';
rn.textContent = '+' + (v | 0);
rw.appendChild(ic);
rw.appendChild(rn);
var mid = document.createElement('div');
mid.className = 'qs-mid';
var ttl = document.createElement('p');
ttl.className = 'qs-t';
ttl.textContent = label;
var pct = (goal | 0) > 0 ? Math.max(0, Math.min(1, (prog | 0) / (goal | 0))) : 0;
var bar = document.createElement('i');
bar.className = 'qs-bar kit-gauge-v2';
bar.style.setProperty('--v', (pct * 100).toFixed(1) + '%');
bar.style.setProperty('--f2-gv', pct.toFixed(3));
bar.insertAdjacentHTML('beforeend', QS_GAUGE);
var num = document.createElement('b');
num.className = 'qs-n';
num.textContent = Math.min(prog | 0, goal | 0) + '/' + (goal | 0);
bar.appendChild(num);
mid.appendChild(ttl);
mid.appendChild(bar);
var btn = document.createElement('button');
btn.type = 'button';
btn.className = 'kit-btn-v2 qs-get';
btn.setAttribute('data-kind', 'secondary');
btn.setAttribute('data-qtab', tab);
btn.setAttribute('data-qid', id);
btn.setAttribute('aria-selected', (done && !claimed) ? 'true' : 'false');
btn.disabled = !(done && !claimed);
btn.textContent = claimed ? t('quest.claimed') : t('quest.claim');
row.appendChild(rw);
row.appendChild(mid);
row.appendChild(btn);
return row;
}
function questReadyName() {
var q = questsEnsure(), i, e, r;
for (i = 0; i < q.daily.list.length; i++) { e = q.daily.list[i]; if (e.done && !e.claimed) return questText(e, 'daily'); }
for (i = 0; i < q.weekly.list.length; i++) { e = q.weekly.list[i]; if (e.done && !e.claimed) return questText(e, 'weekly'); }
for (i = 0; i < ACHV.length; i++) {
r = store.achv && store.achv[ACHV[i].id];
if (r && !r.claimed) return t('ach.' + ACHV[i].id, { n: achvGoal(ACHV[i]) });
}
return '';
}
function questAtt() {
var host = $('quest-att');
if (!host) return;
var st = store.streak | 0, i, j, r, cell, k;
host.innerHTML = '';
for (i = 1; i <= 7; i++) {
cell = document.createElement('span');
cell.className = 'qs-day';
cell.setAttribute('role', 'listitem');
cell.setAttribute('data-on', i <= st ? '1' : '0');
if (st > 0 && i === Math.min(st, 7)) cell.setAttribute('data-now', '1');
r = null;
for (j = 0; j < STREAK_REWARD.length; j++) {
if (STREAK_REWARD[j].day === i) { r = STREAK_REWARD[j]; break; }
}
if (r) {
k = String(r.day);
cell.setAttribute('data-rw', r.heart ? 'heart' : 'jstar');
cell.setAttribute('data-claimed',
(store.streakClaimed && store.streakClaimed[k]) ? '1' : '0');
}
cell.setAttribute('aria-label', t('quest.att.d', { n: i }));
var lab = document.createElement('b');
lab.textContent = String(i);
cell.appendChild(lab);
host.appendChild(cell);
}
}
function questPaint() {
var host = $('quest-list');
var root = $('modal-quest');
if (root && root.setAttribute) root.setAttribute('data-qtab', questTab);
var tabs = root && root.querySelectorAll ? root.querySelectorAll('.qs-tab') : null;
var i;
if (tabs) {
for (i = 0; i < tabs.length; i++) {
var on = tabs[i].getAttribute('data-qtab') === questTab;
tabs[i].setAttribute('aria-selected', on ? 'true' : 'false');
if (on) tabs[i].setAttribute('data-active', '');
else tabs[i].removeAttribute('data-active');
}
}
if (!host) return;
var q = questsEnsure(), e, d, a, r, n = 0;
host.innerHTML = '';
if (questTab === 'epic') {
for (i = 0; i < ACHV.length; i++) {
a = ACHV[i];
r = (store.achv && store.achv[a.id]) || null;
host.appendChild(questRow('epic', a.id, a.ico, t('ach.' + a.id, { n: achvGoal(a) }),
Math.min(achvAxis(a.ax), achvGoal(a)), achvGoal(a),
a.v, r && r.claimed ? 1 : 0));
n++;
}
} else if (questTab === 'weekly') {
for (i = 0; i < q.weekly.list.length; i++) {
e = q.weekly.list[i];
d = wqDefOf(e.id) || { ico: '--lib-glyph-target', v: 0 };
host.appendChild(questRow('weekly', e.id, d.ico, questText(e, 'weekly'),
e.prog, e.goal, d.v, e.claimed));
n++;
}
} else {
for (i = 0; i < q.daily.list.length; i++) {
e = q.daily.list[i];
d = dqDefOf(e.id) || { ico: '--lib-glyph-target' };
host.appendChild(questRow('daily', e.id, d.ico, questText(e, 'daily'),
e.prog, e.goal, DQ_REWARD[e.lv] | 0, e.claimed));
n++;
}
}
var all = $('quest-all');
if (all) {
var can = 0;
var rows = host.querySelectorAll ? host.querySelectorAll('.qs-get[aria-selected="true"]') : [];
can = rows.length;
all.setAttribute('aria-selected', can > 0 ? 'true' : 'false');
all.disabled = !can;
}
var note = $('quest-note'), rn = questReadyName();
if (note) note.hidden = !rn;
setText('quest-note-t', rn ? t('quest.ready', { n: rn }) : '');
questAtt();
}
function questBadges() {
var n = questClaimable();
['kd-mission-badge', 'map-mission-badge', 'sh-mission-badge'].forEach(function (id) {   /* [Task 8c] 상점 위 바도 같은 미션 단추 */
var b = $(id);
if (!b) return;
b.textContent = n > 0 ? String(n) : '';
b.hidden = !(n > 0);
});
}
function openQuest(tab) {
questTab = (tab === 'weekly' || tab === 'epic') ? tab : 'daily';
questsEnsure();
achvCheck(true);
questPaint();
if (toastText && toastText.indexOf(t('quest.ready', { n: '' })) === 0) toastHide();
openModal('modal-quest');
J.sfx.ui();
}
function closeQuest() {
closeModal('modal-quest');
J.sfx.ui();
}
function setQuestTab(tab) {
var m = (tab === 'weekly' || tab === 'epic') ? tab : 'daily';
if (m === questTab) return;
questTab = m;
questPaint();
J.sfx.ui();
}
function openRank(mode) {
rankMode = normRankMode(mode);
ensureRankArrays();
buildRankList();
openModal('modal-rank');
J.sfx.ui();
}
function setRankTab(mode) {
var m = normRankMode(mode);
if (m === rankMode) return;
rankMode = m;
buildRankList();
J.sfx.ui();
}
function closeRank() {
closeModal('modal-rank');
// The highlight belongs to the open that followed the submit, not forever.
clearRankFresh();
J.sfx.ui();
}
function celebrateRank(rank) {
var r = rank | 0;
if (r <= 0 || typeof window === 'undefined') return;
var w = window.innerWidth, h = window.innerHeight;
var cx = w / 2, cy = h * 0.34;
if (r === 1) {
J.floatText(cx, cy, t('rank.new1'), '#ffe873');
// Same three staggered bursts onStageClear uses for its own biggest moment.
J.confetti(cx, h * 0.3);
later(function () { J.confetti(w * 0.2, h * 0.36); }, 160);
later(function () { J.confetti(w * 0.8, h * 0.36); }, 300);
J.shockwave(cx, cy, '#ffe873');
J.screenPulse();
J.sfx.grade('S');
J.sfx.milestone();
J.vibrate(60);
} else if (r <= 3) {
J.floatText(cx, cy, t('rank.new', { n: r }), '#ffe873');
J.confetti(cx, h * 0.32);
J.shockwave(cx, cy, '#ffe873');
J.screenPulse();
J.sfx.grade('A');
J.vibrate(35);
} else {
J.floatText(cx, cy, t('rank.new', { n: r }), '#9fb6d6');
J.screenPulse();
J.sfx.grade('B');
J.vibrate(20);
}
}
function paintDailyRankLine() {
var el = $('daily-rank-line');
if (!el) return;
el.hidden = !(dailyRank > 0);
el.textContent = dailyRank > 0 ? t('rank.overline', { n: dailyRank }) : '';
}
function pause() {
if (!S.running || S.paused) return;
TW_PORTAL.gameplayStop();   /* Task 12 — 일시정지 = 플레이 break */
S.paused = true;
S.pausedAt = now();
stopComboLoop();
stopFeverLoop();
syncToggleLabels();
var adv = S.mode === 'adv';
var pr = $('pz-restart'), pm = $('pz-menu');
if (pr) pr.hidden = adv;
if (pm) pm.textContent = adv ? t('adv.leave') : t('pause.menu');
openModal('modal-pause');
J.sfx.ui();
}
function shiftDeadlines(held, freshCombo) {
if (S.feverOn) {
S.feverUntil += held;
stopFeverLoop();
rafFever = requestAnimationFrame(feverLoop);
}
if (isRush()) S.rushEndAt += held;
if (S.advEndAt > 0) S.advEndAt += held;
if (S.missionUntil > 0) S.missionUntil += held;
if (S.finishUntil > 0) S.finishUntil += held;
if (S.skillUntil > 0) S.skillUntil += held;
if (S.bossAtkAt > 0) S.bossAtkAt += held;
if (S.bossTellAt > 0) S.bossTellAt += held;
if (S.maskUntil > 0) S.maskUntil += held;
if (S.duel) {
if (S.duel.awkUntil > 0) S.duel.awkUntil += held;   /* 74 — 각성도 벽시계 */
if (S.duel.idleAt > 0) S.duel.idleAt += held;
if (S.duel.foeSkillAt > 0) S.duel.foeSkillAt += held;
if (S.duel.freezeUntil > 0) S.duel.freezeUntil += held;
if (S.duel.chillAt > 0) S.duel.chillAt += held;
if (S.duel.freeLinkUntil > 0) S.duel.freeLinkUntil += held;
if (S.duel.tsOverlayUntil > 0) S.duel.tsOverlayUntil += held;
if (S.duel.cycAt > 0) S.duel.cycAt += held;
}
// The run's age is a wall-clock field like every other one: without this
// shift, a long pause would age the run and silently trigger the match decay.
if (S.rushStartedAt > 0) S.rushStartedAt += held;
if (S.addCdUntil > 0) S.addCdUntil += held;
if (S.feverCdUntil > 0) S.feverCdUntil += held;
// The sprint mission's rolling window is a wall-clock deadline too.
var i;
if (S.sprintTimes && S.sprintTimes.length) {
for (i = 0; i < S.sprintTimes.length; i++) S.sprintTimes[i] += held;
}
if (S.pv && S.pv.hits && S.pv.hits.length) {
for (i = 0; i < S.pv.hits.length; i++) S.pv.hits[i] += held;
}
if (S.combo > 1) {
S.comboUntil = freshCombo ? (now() + COMBO_MS) : (S.comboUntil + held);
stopComboLoop();
rafCombo = requestAnimationFrame(comboLoop);
}
}
function resume() {
// Every wall-clock deadline is shifted by the paused span, so pausing can
// neither drain a fever nor burn Time Rush seconds.
var held = S.pausedAt ? Math.max(0, now() - S.pausedAt) : 0;
S.pausedAt = 0;
S.paused = false;
TW_PORTAL.gameplayStart();   /* Task 12 — 재개 = 플레이 재시작 신호 */
closeModal('modal-pause');
S.howtoFromPause = false;
J.sfx.ui();
shiftDeadlines(held, true);
layout();
}
function goMenu() {
S.paused = false;
S.pausedAt = 0;
S.howtoFromPause = false;
leaveAdvSkin();
hurryReset();
bangReset();           // 같은 이유 — "빡!" 배너도 later() 에 의존한다
skillReset();          // 컷인도 later(endCutin) 에 의존한다 (같은 이유)
bossReset();
if (S.running) saveProgress();
S.running = false;
stopComboLoop();
stopTimer();
stopRush();
stopAdv();
endFever(true);
clearTimers();
J.clear();
closeAllModals();
syncMenu();
enterKingdom();
}
function restartStage() {
if (S.mode === 'adv') { heartsTick(); if (store.hearts <= 0) return; }
closeModal('modal-pause');
S.paused = false;
S.pausedAt = 0;
S.howtoFromPause = false;
if (S.mode === 'adv') { advStart(S.stage); J.sfx.ui(); return; }
hurryReset();          // 같은 이유 — 다시 시작하면 화면 상태도 처음으로
S.combo = 1;
S.comboUntil = 0;
var keepEnd = S.rushEndAt;
startStage(S.stage, isDaily() ? dailySeed() : S.seed);
if (isDaily()) { S.score = 0; S.matches = 0; S.maxCombo = 1; S.startedAt = Date.now(); syncHud(); startTimer(); }
if (isRush()) { S.rushEndAt = keepEnd; startRushLoop(); }
J.sfx.ui();
}
function openHowto(fromPause) {
S.howtoFromPause = !!fromPause;
if (fromPause) closeModal('modal-pause');
setHowto(0);
openModal('modal-howto');
J.sfx.ui();
}
function closeHowto() {
closeModal('modal-howto');
if (S.howtoFromPause) {
S.howtoFromPause = false;
if (S.paused) openModal('modal-pause');
}
J.sfx.ui();
}
function setHowto(i) {
howtoIdx = clamp(i, 0, 6);    /* [E17-0903 ⑯-16] 12장 -> 7장 */
var track = $('howto-track');
// The track is 700% wide (7 panels), so one panel step is 100/7 % of it.
if (track) track.style.transform = 'translate3d(' + (-howtoIdx * 100 / 7) + '%,0,0)';
var dots = $('howto-dots');
if (dots && dots.children) {
for (var k = 0; k < dots.children.length; k++) {
dots.children[k].classList.toggle('on', k === howtoIdx);
}
}
var nx = $('howto-next');
if (nx) nx.textContent = (howtoIdx >= 11) ? t('tut.replay') : t('howto.next');
}
function tutBuildBoard() {
var stage = $('tut-stage');
if (!stage || typeof document === 'undefined') return;
while (stage.firstChild) stage.removeChild(stage.firstChild);
tutEls.length = 0;
tutBox = document.createElement('div');
var n = tutCells.length;
if (n <= 0) { stage.appendChild(tutBox); return; }
var rows = Math.ceil(n / COLS);
var cols = TUT_VIS_COLS;
// 24 = #tut-stage's 12px horizontal padding on both sides.
var avail = (stage.clientWidth || 300) - 24;
var mts = clamp(Math.floor((avail - GAP * (cols - 1)) / cols), 30, 58);
if (tutBox.style) {
tutBox.style.setProperty('--ts', mts + 'px');
tutBox.style.setProperty('--gap', GAP + 'px');
tutBox.style.width = (cols * mts + (cols - 1) * GAP) + 'px';
tutBox.style.height = (rows * mts + (rows - 1) * GAP) + 'px';
}
for (var p = 0; p < n; p++) tutEls.push(null);
for (var r = 0; r < rows; r++) {
for (var c = 0; c < cols; c++) {
var i = r * COLS + c;
var cell = tutCells[i];
if (!cell || cell.dead) continue;
var el = document.createElement('div');
el.className = 'tile';
var sp = document.createElement('span');
sp.textContent = String(cell.v);
el.appendChild(sp);
el.setAttribute('data-v', String(cell.v));
el.setAttribute('data-i', String(i));
if (el.style) {
el.style.transform = 'translate3d(' + (c * (mts + GAP)) + 'px,' +
(r * (mts + GAP)) + 'px,0)';
}
tutBox.appendChild(el);
tutEls[i] = el;
}
}
stage.appendChild(tutBox);
}
function tutPaint() {
for (var i = 0; i < tutEls.length; i++) {
var el = tutEls[i];
if (!el || !el.classList) continue;
el.classList.toggle('dead', !!(tutCells[i] && tutCells[i].dead));
el.classList.toggle('sel', i === tutSel);
}
}
function tutClearCands() {
for (var k = 0; k < tutEls.length; k++) {
if (tutEls[k] && tutEls[k].classList) {
tutEls[k].classList.remove('cand');
tutEls[k].classList.remove('cand-ok');   // #34: 본 게임 clearCands 와 같은 3종
tutEls[k].classList.remove('cand-far');
}
}
}
function tutMarkCands(i) {
tutClearCands();
if (i < 0 || i >= tutCells.length) return;
var list = connectCandidates(tutCells, i) || [];
var A = idxToRC(i);
for (var k = 0; k < list.length; k++) {
var j = list[k];
var el = tutEls[j];
if (!el || !el.classList) continue;
el.classList.add('cand');
if (isValidPairEx(tutCells, i, j)) {
el.classList.add('cand-ok');
var B = idxToRC(j);
if (Math.max(Math.abs(B.r - A.r), Math.abs(B.c - A.c)) > 1) el.classList.add('cand-far');
}
}
}
function tutCenter(i) {
var el = tutEls[i];
if (el && el.getBoundingClientRect) {
var r = el.getBoundingClientRect();
return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}
return { x: 0, y: 0 };
}
function tutShake(i) {
var el = tutEls[i];
if (!el || !el.classList) return;
el.classList.remove('shake');
void el.offsetWidth;
el.classList.add('shake');
later(function () { if (el && el.classList) el.classList.remove('shake'); }, 260);
}
function tutSetText(key) {
tutTextKey = key;
var el = $('tut-text');
if (el) el.innerHTML = t(key);
}
function tutSetDots() {
var dots = $('tut-dots');
if (!dots || !dots.children) return;
for (var k = 0; k < dots.children.length; k++) {
if (dots.children[k].classList) dots.children[k].classList.toggle('on', k === tutStep);
}
}
function tutSyncSkip() {
var b = $('tut-skip');
if (!b) return;
if (tutDone) {
b.textContent = t('howto.close');
} else {
b.textContent = t('tut.skip');
}
}
function tutLoadStep(i) {
tutStep = clamp(i, 0, TUT_BOARDS.length - 1);
tutSel = -1;
tutFailShown = false;
tutBusy = false;
tutCells.length = 0;
var rows = TUT_BOARDS[tutStep];
for (var r = 0; r < rows.length; r++) {
for (var c = 0; c < COLS; c++) {
var v = (c < TUT_VIS_COLS && rows[r][c]) ? rows[r][c] : 0;
tutCells.push({ v: v, dead: !v });
}
}
tutBuildBoard();
tutPaint();
tutSetText('tut.s' + (tutStep + 1));
tutSetDots();
tutSyncSkip();
}
function openTutorial(fromHowto) {
tutFromHowto = !!fromHowto;
if (fromHowto) closeModal('modal-howto');
tutDone = false;
openModal('modal-tutorial');
tutFxRaise(true);
tutLoadStep(0);
J.sfx.ui();
}
function tutFxRaise(on) {
var fx = $('fx');
if (fx && fx.style) fx.style.zIndex = on ? '75' : '';
}
function finishTutorial(completed) {
// Skipping counts too: the player was offered the lesson and declined it,
// and forcing it again on every launch would be worse than not teaching it.
store.tutorialDone = true;
if (completed) store.tutorialCleared = true;
persist();
tutFxRaise(false);
J.clear();
closeModal('modal-tutorial');
var stage = $('tut-stage');
if (stage) { while (stage.firstChild) stage.removeChild(stage.firstChild); }
tutEls.length = 0;
tutCells.length = 0;
tutBox = null;
tutSel = -1;
tutDone = false;
J.sfx.ui();
if (tutFromHowto) {
// Came in from the How-to's last panel: land back where they left, and let
// closeHowto() keep owning the pause hand-back.
tutFromHowto = false;
setHowto(4);
openModal('modal-howto');
}
return !!completed;
}
function onTutPointerDown(e) {
if (!e || tutBusy || tutDone) return;
var tg = e.target;
var tile = (tg && tg.closest) ? tg.closest('.tile') : null;
if (!tile) return;
var i = parseInt(tile.getAttribute('data-i'), 10);
if (isNaN(i) || !isAlive(tutCells, i)) return;
if (tutSel === i) { tutSel = -1; tutPaint(); tutClearCands(); return; }
if (tutSel < 0) {
tutSel = i;
tutPaint();
tutMarkCands(i);
J.sfx.select(tutCells[i].v);
return;
}
var a = tutSel, b = i;
if (isValidPairEx(tutCells, a, b)) {
tutBusy = true;
tutSel = -1;
tutPaint();
tutClearCands();
var ea = tutEls[a], eb = tutEls[b];
if (ea && ea.classList) ea.classList.add('pop');
if (eb && eb.classList) eb.classList.add('pop');
var pa = tutCenter(a), pb = tutCenter(b);
J.burst(pa.x, pa.y, '#bfe9ff');
J.burst(pb.x, pb.y, '#bfe9ff');
J.sfx.match(1);
J.vibrate(10);
later(function () {
if (tutCells[a]) tutCells[a].dead = true;
if (tutCells[b]) tutCells[b].dead = true;
if (ea && ea.classList) ea.classList.remove('pop');
if (eb && eb.classList) eb.classList.remove('pop');
tutPaint();
}, POP_MS);
later(function () {
if (tutStep < TUT_BOARDS.length - 1) {
tutLoadStep(tutStep + 1);
} else {
tutBusy = false;
tutDone = true;
tutSetText('tut.done');
tutSetDots();
tutSyncSkip();
J.sfx.win();
}
}, POP_MS + 420);
return;
}
var twhy = rejectReason(tutCells, a, b);
if (twhy === 'blocked') {
var tblk = blockersBetween(tutCells, a, b, 4);
var fa = tutCenter(a), fs = tutCenter(tblk.length ? tblk[0] : b);
J.brokenLink(fa.x, fa.y, fs.x, fs.y);
} else if (twhy === 'notaligned') {
var tg2 = tutCenter(a);
var te2 = tutEls[a];
var tw2 = (te2 && te2.getBoundingClientRect) ? te2.getBoundingClientRect().width : 34;
J.lineGuide(tg2.x, tg2.y, tw2);
}
tutShake(a);
tutShake(b);
J.sfx.fail();
J.vibrate(12);
if (!tutFailShown && twhy === 'notaligned') {
if (tutStep === 1) { tutFailShown = true; tutSetText('tut.s2fail'); }
else if (tutStep === 2) { tutFailShown = true; tutSetText('tut.s3fail'); }
}
tutSel = -1;
tutPaint();
tutClearCands();
}
function advBase(n) {
if (n === 1)  return { pct: 35, sec: 40 };    // 스피드 템포: ~15초 클리어
if (n === 2)  return { pct: 35, sec: 45 };
if (n === 3)  return { pct: 35, sec: 50 };
if (n === 4)  return { pct: 30, sec: 70 };
if (n === 5)  return { pct: 33, sec: 85 };    // 소개탄: 블로커 첫 등장
if (n <= 9)   return { pct: 30, sec: 100 };
if (n === 10) return { pct: 25, sec: 90 };    // 보스
if (n === 15) return { pct: 30, sec: 100 };   // 소개탄: 잠금 첫 등장
if (n <= 19)  return { pct: 28, sec: 90 };
if (n === 20) return { pct: 22, sec: 80 };    // 보스
if (n === 25) return { pct: 28, sec: 70 };    // 소개탄: 시간단축 첫 적용
if (n <= 29)  return { pct: 25, sec: 80 };
if (n === 30) return { pct: 20, sec: 70 };    // 보스
// 31+ 공식
return {
pct: Math.max(15, 25 - 0.2 * (n - 30)),
sec: Math.max(60, 70 - 0.5 * (n - 30))
};
}
function advDensityPct(n) {
var pct = advBase(n).pct;
if (n % 5 !== 0) {
var k = (n - 1) % ADV_WAVE_PERIOD;
pct += ADV_WAVE_PCT * Math.sin(2 * Math.PI * k / ADV_WAVE_PERIOD);
}
// 동적 난이도 보정 (로얄매치식). 표시하지 않는다 — 알면 일부러 지게 된다.
if ((store.advFails[String(n)] | 0) >= ADV_RELIEF_FAILS) pct += ADV_RELIEF_PCT;
return clamp(pct, 15, 40);
}
function advPctToDensity(pct) {
var d = GB_DMIN + (pct - 15) / 20 * (GB_D0 - GB_DMIN);
return clamp(d, 0.50, 0.95);
}
function advHand(n) {
var h = { blk: 0, lock: 0, noShuffle: false, timeCut: false }, m;
if (n < 5) return h;
if (n === 5)  { h.blk = 2; return h; }                       // 블로커 소개
if (n <= 9)   { h.blk = 1; return h; }
if (n === 10) { h.blk = 4; return h; }                       // 보스
if (n === 15) { h.lock = 2; return h; }                      // 잠금 소개
if (n <= 19)  { h.blk = 2 + (n % 2); return h; }             // 2~3개
if (n === 20) { h.blk = 3; h.lock = 3; h.noShuffle = true; return h; }  // 총 6
if (n === 25) { h.blk = 1; h.lock = 1; h.timeCut = true; return h; }    // 시간단축 소개
if (n <= 29)  { m = 3 + ((n - 21) % 3); h.blk = Math.ceil(m / 2); h.lock = m - h.blk; return h; }
if (n === 30) { h.blk = 4; h.lock = 4; h.noShuffle = true; h.timeCut = true; return h; }
// 31+ : 챕터 순환 — 위 10탄 패턴을 되풀이한다. 시간단축은 이후 상시다.
h.timeCut = true;
var k = n % 10;
if (k === 0) { h.blk = 4; h.lock = 4; h.noShuffle = true; return h; }
if (k === 5) { h.blk = 2; h.lock = 1; return h; }            // 소개탄 자리는 완만하게
m = 3 + (k % 3);
h.blk = Math.ceil(m / 2);
h.lock = m - h.blk;
return h;
}
function advChapter(n) { return Math.floor((n - 1) / ADV_CHAPTER) + 1; }
function advSeedOf(n) {
var st = (n | 0) < 1 ? 1 : (n | 0);
return (ADV_SEED_SALT ^ ((st * 0x9E3779B1) >>> 0)) >>> 0;
}
function advThemeIdx(n) { return ((advChapter(n) - 1) % ADV_CHAPTERS) + 1; }
function advIsBoss(n) { return n % ADV_CHAPTER === 0; }
function advPar(n) {
var sec = advIsBoss(n) ? advBase(n).sec * BOSS_TIME_K : advBase(n).sec;
var matches = Math.min(extBoardSize(n) * 0.5, sec / ADV_PAR_SEC);
var raw = matches * 10 * n * ADV_PAR_K;
return Math.round(raw / 10) * 10;
}
var ADV_GOAL_K = 0.82;
var ADV_EARLY_GOAL_K = { 1: 0.50, 2: 0.55, 3: 0.62, 4: 0.70, 5: 0.75 };
function advGoalK(n) {
var k = ADV_EARLY_GOAL_K[n | 0];
return (typeof k === 'number') ? k : ADV_GOAL_K;
}
var ADV_CH_D = [1.00, 1.06, 1.12, 1.18, 1.24, 1.30, 1.36, 1.42, 1.48, 1.55];
function advDiffK(n) {
var c = advChapter(n);
if (!(c >= 1)) c = 1;
if (c > ADV_CH_D.length) c = ADV_CH_D.length;
return ADV_CH_D[c - 1];
}
var ADV_TIME_K = 0.57;
var ADV_DIGIT_K = 0.74;
function advReach(n) {
var sec = advIsBoss(n) ? advBase(n).sec * BOSS_TIME_K : advBase(n).sec;
var full = extBoardSize(n) * 0.5;
var can = sec / ADV_PAR_SEC;
return can >= full ? 1 : can / full;
}
function advGoalType(n) {
if (advIsBoss(n)) return 'boss';
if (n <= 9) return 'score';
if (n <= 19) return (n % 2 === 1) ? 'score' : 'digit';   // 점수+제거 혼합
return ['score', 'digit', 'time'][(n - 21) % 3];         // 3목표 순환
}
function advDigitCountsFor(n, seed, density) {
var memo = advDigitCountsFor.memo || (advDigitCountsFor.memo = {});
var key = n + '|' + (seed >>> 0) + '|' + Math.round(density * 1000);
var got = memo[key];
if (got) return got;
var arr = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
var gen = genBoardBanded(n, seed, density);
var cs = gen.cells;
for (var i = 0; i < cs.length; i++) {
var c = cs[i];
if (c && !c.dead) arr[c.v | 0]++;
}
memo[key] = arr;
return arr;
}
function advGoalFor(n, par, cells, rng, seed, density) {
var type = advGoalType(n);
if (type === 'boss') return { type: 'boss', digit: 0, need: bossHpMax(n) };
if (type === 'digit') {
var d = 1 + ((rng() * 9) | 0);
if (d > 9) d = 9;
var cnt = (seed === undefined) ? 0 : advDigitCountsFor(n, seed, density)[d];
var need = cnt > 0 ? Math.round(cnt * ADV_DIGIT_K * advReach(n))
: Math.round(cells * 0.06);       // 판을 못 세면 옛 식
return { type: 'digit', digit: d, need: clamp(need, 3, Math.max(3, cnt || 10)) };
}
if (type === 'time') {
return { type: 'time', digit: 0, need: Math.max(10, Math.round(cells * ADV_TIME_K)) };
}
return {
type: 'score', digit: 0,
need: Math.round(par * advGoalK(n) * advDiffK(n) / 10) * 10
};
}
function advMissionGoal(id, n) {
var step = Math.floor(n / 10);            // 챕터마다 +1
if (id === 'sum10') return Math.min(3 + step, 8);
if (id === 'same') return Math.min(4 + step, 8);
if (id === 'sprint') return Math.min(5 + step, 9);
if (id === 'rows') return Math.min(1 + Math.floor(n / 20), 2);
if (id === 'special') return Math.min(2 + Math.floor(n / 15), 4);
if (id === 'bomb') return 2;
if (id === 'chain3') return Math.min(1 + Math.floor(n / 50), 2);
return 1;                                  // fever / combo5 — 1회면 성립한다
}
var ADV_MISSION_FIXED = {
1: 'rows',    2: 'sum10',   4: 'same',           // FTUE — 텐(2탄)·트윈(4탄)
18: 'chain3', 26: 'chain3', 35: 'chain3', 48: 'chain3',
57: 'chain3', 65: 'chain3', 76: 'chain3', 85: 'chain3', 94: 'chain3'
};
function advMissionFor(n, cells, seed) {
var memo = advMissionFor.memo || (advMissionFor.memo = {});
if (memo[n]) return memo[n];
var bd = bossDefOf(n), res;
if (bd && bd.seq) { res = { id: bd.seq[0].id, goal: bd.seq[0].goal }; memo[n] = res; return res; }
var fx = ADV_MISSION_FIXED[n];
if (fx) { res = { id: fx, goal: advMissionGoal(fx, n) }; memo[n] = res; return res; }
var pool = missionPool(n, 'endless', cells), out = [];
for (var i = 0; i < pool.length; i++) {
if (pool[i] === 'col' || pool[i] === 'noadd') continue;
out.push(pool[i]);
}
if (n > 1) {
var prev = advMissionFor(n - 1, extBoardSize(n - 1), advSeedOf(n - 1)).id;
var trimmed = [];
for (var j = 0; j < out.length; j++) { if (out[j] !== prev) trimmed.push(out[j]); }
if (trimmed.length) out = trimmed;
}
if (!out.length) out = ['sum10'];
var r = mulberry32((seed ^ 0x5BF03635) >>> 0);
var id = out[clamp((r() * out.length) | 0, 0, out.length - 1)];
res = { id: id, goal: advMissionGoal(id, n) };
memo[n] = res;
return res;
}
var PET_REC_COND = { sum10: 'ppyak', chain3: 'mukmul', mission2: 'tiktok', sprint: 'mongle' };
var PET_REC_GOAL = { score: 'banjjak', digit: 'sseokssak', time: 'tiktok' };
var PET_REC_ATK = { blk: 'bangul', freeze: 'tiktok', mask: 'bangul', quake: 'churup', cycle: 'tiktok' };
function advPetRecAtk(p) {
if (!p) return '';
var d = p.boss && p.bossDef ? p.bossDef : duelFoeDef(p.n);
var a = bossAtkIdOf(d, p.n);               /* ★ ⑦ P3 */
return PET_REC_ATK[a] ? a : '';
}
function advPetRecommend(p) {
if (!p) return '';
var a = advPetRecAtk(p);
if (a) return PET_REC_ATK[a];
if (p.boss && p.bossDef) return PET_REC_COND[p.bossDef.cond] || '';
return PET_REC_GOAL[p.goal && p.goal.type] || '';
}
function advRecommend(goal, mission) {
if (mission.id === 'sum10') return 'ten';      // 합10 = 텐텐 왕자의 +60%
if (mission.id === 'same') return 'twin';      // 같은 숫자 = 트윈 왕자의 +60%
if (mission.id === 'sprint' || mission.id === 'combo5') return 'jelly';
if (goal.type === 'digit') return 'jelly';     // 운(잭팟)이 제거 속도를 밀어 준다
if (goal.type === 'time') return 'twin';
return 'ten';
}
var BOSS_DEFS = [
{ id: 'grape', cond: 'sum10',    need: 5, hero: 'ten',   atk: 'blk',    atk2: 'freeze',
finish: [{ id: 'sum10', goal: 3 }, { id: 'sum10', goal: 3 }] },
{ id: 'soda',  cond: 'chain3',   need: 2, hero: 'twin',  atk: 'freeze', atk2: 'mask',
finish: [{ id: 'chain3', goal: 1 }, { id: 'chain3', goal: 2 }] },
{ id: 'berry', cond: 'mission2', need: 2, hero: 'jelly', atk: 'mask',   atk2: 'quake',
seq: [{ id: 'sprint', goal: 5 }, { id: 'same', goal: 4 }],
finish: [{ id: 'sum10', goal: 2 }, { id: 'sprint', goal: 4 }] },
{ id: 'mint',  cond: 'sprint',   need: 5, hero: 'twin',  atk: 'quake',  atk2: 'blk',
finish: [{ id: 'sprint', goal: 6 },
{ id: 'sprint', goal: 5, win: FINISH_SPRINT_FAST }] },
{ id: 'cocoa', cond: 'mission2', need: 2, hero: 'ten',   atk: 'cycle',  atk2: 'cycle',
seq: [{ id: 'sum10', goal: 5 }, { id: 'combo5', goal: 1 }],
finish: [null, { id: 'sum10', goal: 4 }] }
];
function bossDefOf(n) {
if (!advIsBoss(n)) return null;
var k = advChapter(n) - 1;
return BOSS_DEFS[((k % BOSS_DEFS.length) + BOSS_DEFS.length) % BOSS_DEFS.length];
}
function bossFinishOf(n) {
var d = bossDefOf(n);
if (!d || !d.finish) return null;
return d.finish[advChapter(n) > BOSS_DEFS.length ? 1 : 0] || null;
}
function finishOn() { return !!(S.duel && S.duel.finishPhase); }
function bossAtkIdOf(d, n) {
var a = (d && d.atk) || 'blk';
if (d && d.atk2 && advChapter(n | 0) > BOSS_DEFS.length) a = d.atk2;
return a;
}
function bossAtkText(d, n) { return t('boss.atk.' + bossAtkIdOf(d, n)); }
function bossUltDmg(n) { return Math.round(advPar(n) * BOSS_ULT_K); }
function bossUltNeed(n) {
var c = advChapter(n);
if (!(c >= 1)) c = 1;
if (c > BOSS_ULT_NEED_CH.length) c = BOSS_ULT_NEED_CH.length;
return BOSS_ULT_NEED_CH[c - 1] | 0;
}
function bossHpMax(n) { return bossUltDmg(n) * bossUltNeed(n); }
function bossName(d) { return d ? t('boss.' + d.id + '.name') : ''; }
function bossCondText(d) {
return d ? t('boss.cond.' + d.cond, { n: d.need }) : '';
}
function bossReset() {
S.bossHp = 0; S.bossHpMax = 0; S.bossProg = 0; S.bossFired = 0;
S.bossAtkAt = 0; S.bossTellAt = 0; S.bossAtkN = 0;
S.bossSeqIdx = 0; S.bossDown = false; S.bossArm = false;
bossMaskClear();
setAppClass('boss', false);
setAppClass('boss-tell', false);
var el = $('boss-bar');
if (el) { el.hidden = true; el.classList.remove('hit', 'big', 'down'); }
}
function bossStart(p) {
bossReset();
if (!p || !p.boss || !p.bossDef) return;
S.bossHpMax = bossHpMax(p.n);
S.bossHp = S.bossHpMax;
S.bossAtkAt = now() + BOSS_ATK_MS;      // 첫 반격은 판이 궤도에 오른 뒤에
if (p.bossDef.seq && p.bossDef.seq[0].id === 'sprint') S.sprintWin = BOSS_SPRINT_MS;
setAppClass('boss', true);
var el = $('boss-bar');
if (el) {
el.hidden = false;
var av = $('boss-av');
if (av) av.className = 'boss-av bs-' + p.bossDef.id;
setText('boss-name', bossName(p.bossDef));
}
syncBoss();
}
function syncBoss() {
if (battleOn()) { syncDuel(); return; }
var el = $('boss-bar');
if (!el || el.hidden) return;
var p = S.advPlan, d = p && p.bossDef;
var f = S.bossHpMax > 0 ? Math.max(0, S.bossHp) / S.bossHpMax : 0;
el.style.setProperty('--hp', String(f));
setText('boss-hp-n', Math.max(0, Math.ceil(f * 100)) + '%');
if (!d) return;
setText('boss-cond', t('boss.prog', {
c: bossCondText(d), n: Math.min(S.bossProg, d.need), goal: d.need
}));
}
function bossDamage(dmg, big) {
if (!S.bossHpMax || S.bossDown) return;
var d = Math.max(0, Math.round(dmg));
if (d <= 0) return;
S.bossHp = Math.max(0, S.bossHp - d);
var el = $('boss-bar');
if (el && el.classList) {
el.classList.remove(big ? 'big' : 'hit');
void el.offsetWidth;
el.classList.add(big ? 'big' : 'hit');
}
if (big && typeof window !== 'undefined') {
J.shockwave(window.innerWidth / 2, window.innerHeight * 0.16, '#ff5a3d');
J.floatText(window.innerWidth / 2, window.innerHeight * 0.24,
'-' + d, '#ff8a3d');
J.vibrate(50);
heroSay('boss', 5);
}
syncBoss();
}
function bossArmUlt() {
if (S.bossArm || S.bossDown) return;
S.bossArm = true;
toast(t('boss.armed'));
J.sfx.mission();
}
function bossOnMatch(gain, va, vb, tw) {
var p = S.advPlan, d = p && p.bossDef;
if (!p || !p.boss || !d || S.bossDown) return;
// ① 소량 데미지 — 점수 비례, 단 한 매치가 필살기를 대신할 수는 없다.
var cap = bossUltDmg(p.n) * BOSS_CHIP_CAP;
bossDamage(Math.min(gain * BOSS_CHIP, cap), false);
// ② 공략 조건
if (d.cond === 'sum10') {
if (matchKind(va, vb) === 'sum10') S.bossProg++;
} else if (d.cond === 'sprint') {
if (statAgil) S.bossProg++;
} else if (d.cond === 'chain3') {
if (tw && tw.chain > 0 && tw.chain % 3 === 0) S.bossProg++;
}
if (d.cond !== 'mission2' && S.bossProg >= d.need) {
S.bossProg = 0;
bossArmUlt();
}
syncBoss();
}
function bossCondMatch(va, vb, tw) {
var p = S.advPlan, d = p && p.bossDef, du = S.duel;
if (!p || !p.boss || !d || !du || du.down || du.finishPhase || S.bossDown) return;
if ((S.bossFired | 0) >= DUEL_COND_MAX) {
if (S.bossProg < d.need) { S.bossProg = d.need; syncDuel(); }
return;
}
if (d.cond === 'sum10') {
if (matchKind(va, vb) === 'sum10') S.bossProg++;
} else if (d.cond === 'sprint') {
if (statAgil) S.bossProg++;
} else if (d.cond === 'chain3') {
if (tw && tw.chain > 0 && tw.chain % 3 === 0) S.bossProg++;
}
if (d.cond !== 'mission2' && S.bossProg >= d.need) {
S.bossProg = 0;
bossCondReward();
}
syncDuel();
}
function bossCondReward() {
var du = S.duel;
if (!du || du.down) return;
S.bossFired++;
toast(t('boss.armed'));
J.sfx.mission();
J.vignette(0.30);
shakeScreen(2);
J.vibrate(40);
impactWord(t('boss.weak'), '#FFE27A', 46, { top: 30, dur: 820 });
duelHitFoe(du.me.atkMax * DUEL_COND_HIT, true);
}
function bossNextSeqMission() {
var p = S.advPlan, d = p && p.bossDef;
if (!d || !d.seq) return;
var step = d.seq[clamp(S.bossSeqIdx, 0, d.seq.length - 1)];
S.mission = { id: step.id, goal: step.goal, prog: 0, done: false };
capSpecialMission(S.mission);          /* W6.5b P0 — 보스 미션 사슬도 같은 빗장 */
S.sprintWin = step.id === 'sprint' ? BOSS_SPRINT_MS : MISSION_SPRINT_MS;
S.sprintTimes = [];
var room = Math.max(4000, advLeftMs() - 1500);
S.missionUntil = now() + Math.min(BOSS_MISSION_MS, room);
syncMission();
}
function bossOnMissionDone() {
var p = S.advPlan, d = p && p.bossDef;
if (!p || !p.boss || !d || d.cond !== 'mission2' || S.bossDown) return;
if (battleOn() && (!S.duel || S.duel.down)) return;
if (battleOn() && (S.bossFired | 0) >= DUEL_COND_MAX) {
if (S.bossProg < d.need) { S.bossProg = d.need; syncBoss(); }
return;
}
S.bossProg++;
if (S.bossProg >= d.need) {
S.bossProg = 0;
S.bossSeqIdx = 0;
if (battleOn()) bossCondReward(); else bossArmUlt();
} else {
S.bossSeqIdx++;
}
syncBoss();
// 다음 미션은 한 박자 뒤에 — 성공 연출과 새 미션 배지가 같은 프레임에 겹치면 둘 다 안 읽힌다.
later(function () { if (S.running) bossNextSeqMission(); }, 700);
}
function bossOnMissionFail() {
var p = S.advPlan, d = p && p.bossDef;
if (!p || !p.boss || !d || d.cond !== 'mission2' || S.bossDown) return;
S.bossProg = 0;
S.bossSeqIdx = 0;
syncBoss();
later(function () { if (S.running) bossNextSeqMission(); }, 900);
}
function bossTell() {
S.bossTellAt = now() + BOSS_TELL_MS;
setAppClass('boss-tell', true);
var el = $('boss-bar');
if (el && el.classList) el.classList.add('tell');
toast(t('boss.tell', { b: bossName(S.advPlan && S.advPlan.bossDef) }));
J.sfx.fail();
J.vibrate(20);
}
function bossDropBlockers(k) {
var live = [], i;
for (i = 0; i < S.cells.length; i++) {
if (S.cells[i] && !S.cells[i].dead && !S.cells[i].sp) live.push(i);
}
if (!live.length) return 0;
var base = (S.advPlan ? (S.advPlan.seed >>> 0) : 1) ^ BOSS_ATK_SALT;
var rng = mulberry32((base + Math.imul((S.bossAtkN | 0) + 1, 0x9E3779B1)) >>> 0);
shuffleSeeded(live, rng);
var n = Math.min(k | 0, live.length);
for (i = 0; i < n; i++) {
S.cells[live[i]].sp = 'block';
S.cells[live[i]].blk = 1;
paintTile(live[i]);
var c = tileCenter(live[i]);
J.burst(c.x, c.y, '#8a6a3d', 14);
}
recountMoves();     // 짝 수가 줄었다 — HUD 의 유일한 근거를 다시 잰다
syncHud();
return n;
}
var BOSS_ATK_CYCLE = ['blk', 'freeze', 'mask', 'quake'];
var bossSkillStat = { blk: 0, freeze: 0, mask: 0, quake: 0, voided: 0 };
function bossAtkRng(salt) {
var base = (S.advPlan ? (S.advPlan.seed >>> 0) : 1) ^ BOSS_ATK_SALT;
var ord = ((S.bossAtkN | 0) + 1) * 4 + (salt | 0);
return mulberry32((base + Math.imul(ord, 0x9E3779B1)) >>> 0);
}
function bossAtkNow(def) {
var a = bossAtkIdOf(def, S.advPlan ? S.advPlan.n : 0);
if (a !== 'cycle') return a;
var d = S.duel, k;
if (d && d.cycAt > 0) k = Math.floor((now() - d.cycAt) / DUEL_SKILL_CYCLE_MS);
else k = (S.bossAtkN | 0);
if (!(k >= 0)) k = 0;
return BOSS_ATK_CYCLE[k % BOSS_ATK_CYCLE.length];
}
function bossFreezeCol() {
var d = S.duel, r, c, i;
if (d && d.freezeUntil > 0 && now() < d.freezeUntil) return -1;
var rows = Math.ceil(S.cells.length / COLS);
var cand = [];
for (c = 0; c < COLS; c++) {
var n0 = 0;
for (r = 0; r < rows; r++) {
var c0 = S.cells[r * COLS + c];
if (c0 && !c0.dead && !c0.sp) n0++;
}
if (n0 > 0) cand.push(c);
}
if (!cand.length) return 0;
shuffleSeeded(cand, bossAtkRng(1));
var col = cand[0], k = 0;
for (r = 0; r < rows; r++) {
i = r * COLS + col;
var cc = S.cells[i];
if (!cc || cc.dead || cc.sp) continue;     // 특수 타일은 덮지 않는다(조용한 증발 금지)
cc.sp = 'ice';
cc.ice = 1;
paintTile(i);
var pt = tileCenter(i);
J.burst(pt.x, pt.y, '#7ae0ff', 10);
k++;
}
clearHints();
recountMoves();     // 얼음은 짝을 막지 않지만 힌트·이동수의 근거는 다시 잰다
syncHud();
return k;
}
function bossMaskCells(k) {
var live = [], i;
for (i = 0; i < S.cells.length; i++) {
var c = S.cells[i];
if (c && !c.dead && c.sp !== 'block' && !c.mask) live.push(i);
}
if (!live.length) return 0;
shuffleSeeded(live, bossAtkRng(2));
var n = Math.min(k | 0, live.length);
for (i = 0; i < n; i++) {
S.cells[live[i]].mask = 1;
paintTile(live[i]);
}
S.maskUntil = now() + DUEL_SKILL_MASK_MS;
clearHints();
return n;
}
function bossMaskClear() {
var n = 0, i;
S.maskUntil = 0;
if (!S.cells) return 0;
for (i = 0; i < S.cells.length; i++) {
var c = S.cells[i];
if (c && c.mask) { delete c.mask; paintTile(i); n++; }
}
return n;
}
function bossMaskTick() {
if (S.maskUntil > 0 && now() >= S.maskUntil) bossMaskClear();
}
function bossQuakeRows(k) {
var d = S.duel, r, i;
if (d && d.quakeGuard) { d.quakeGuard = 0; return -1; }
var rows = Math.ceil(S.cells.length / COLS);
var pick = [];
for (r = 0; r < rows; r++) {
var n0 = 0;
for (i = 0; i < COLS; i++) {
var c0 = S.cells[r * COLS + i];
if (c0 && !c0.dead && c0.sp !== 'block') n0++;
}
if (n0 >= 2) pick.push(r);          // 한 칸짜리 행은 밀어 봐야 그대로다
}
if (!pick.length) return 0;
shuffleSeeded(pick, bossAtkRng(3));
var take = Math.min(k | 0, pick.length), done = 0;
for (var q = 0; q < take; q++) {
var row = pick[q], idx = [], vals = [];
for (i = 0; i < COLS; i++) {
var kk = row * COLS + i, cc = S.cells[kk];
if (cc && !cc.dead && cc.sp !== 'block') { idx.push(kk); vals.push(cc.v); }
}
if (idx.length < 2) continue;
vals.push(vals.shift());            // 왼쪽으로 1칸 회전
for (i = 0; i < idx.length; i++) S.cells[idx[i]].v = vals[i];
done++;
}
if (!done) return 0;
clearSelection();
clearHints();
renderAll();
if (S.duel) S.duel.idleAt = now() + DUEL_IDLE_MS;   // 판이 나 때문에 바뀌었다
recountMoves();
syncHud();
return done;
}
function bossSkillVoid() {
bossSkillStat.voided++;
toast(t('duel.skvoid'));
J.sfx.mission();
if (typeof window !== 'undefined') {
impactWord(t('duel.skvoidw'), '#7EE8C8', 42, { top: 32, dur: 720 });
}
J.vibrate(20);
}
function bossSkillFire(atk, blkN) {
var n, W = (typeof window !== 'undefined') ? window : null;
if (atk === 'freeze') {
n = bossFreezeCol();
if (n < 0) { bossSkillVoid(); return 0; }
bossSkillStat.freeze++;
if (n > 0) {
toast(t('duel.skfreeze', { n: n }));
J.sfx.ice();
J.screenPulse();
J.vignette(0.30);
hitStop(HITSTOP_LIGHT_MS);
shakeScreen(2);
J.vibrate(30);
if (W) J.shockwave(W.innerWidth / 2, W.innerHeight * 0.58, '#7ae0ff');
}
return n;
}
if (atk === 'mask') {
n = bossMaskCells(DUEL_SKILL_MASK);
bossSkillStat.mask++;
if (n > 0) {
toast(t('duel.skmask', { n: n }));
J.sfx.fail();
J.vignette(0.34);
shakeScreen(1);
J.vibrate(26);
impactWord(t('boss.atk.mask'), '#9AA6C4', 40, { top: 30, dur: 760 });
}
return n;
}
if (atk === 'quake') {
n = bossQuakeRows(DUEL_SKILL_QUAKE);
if (n < 0) { bossSkillVoid(); return 0; }
bossSkillStat.quake++;
if (n > 0) {
toast(t('duel.skquake', { n: n }));
J.sfx.bomb();
J.screenPulse();
J.vignette(0.30);
hitStop(HITSTOP_LIGHT_MS);
shakeScreen(3);            // 가장 센 단계 — "판이 흔들렸다"가 그 기술이다
J.vibrate(40);
if (W) J.shockwave(W.innerWidth / 2, W.innerHeight * 0.62, '#C08A4A');
}
return n;
}
n = bossDropBlockers((blkN | 0) > 0 ? (blkN | 0) : DUEL_SKILL_BLK);
bossSkillStat.blk++;
if (n > 0) {
toast(t('duel.skill', { n: n }));
J.sfx.bomb();
J.screenPulse();
hitStop(HITSTOP_LIGHT_MS);
shakeScreen(2);
J.vibrate(30);
}
return n;
}
function bossAttack() {
S.bossTellAt = 0;
S.bossAtkN++;
setAppClass('boss-tell', false);
var el = $('boss-bar');
if (el && el.classList) el.classList.remove('tell');
bossSkillFire(bossAtkNow(S.advPlan && S.advPlan.bossDef), BOSS_ATK_BLK);
S.bossAtkAt = now() + BOSS_ATK_MS;
}
function bossTick() {
var p = S.advPlan;
if (!p || !p.boss || !S.running) return;
if (S.bossHp <= 0 && !S.bossDown) {
S.bossDown = true;
S.bossArm = false;
bossDefeatFx();
finishBlast();            /* §3 재배선 보상 — 비전투 경로의 격파 */
advFinish(true, 'boss');
return;
}
if (S.bossDown) return;
bossMaskTick();               // ★ 0826 7단계 — 비전투 경로도 같은 한 줄
if (S.bossArm && !S.busy && !fxBusy()) {
S.bossArm = false;
S.bossFired++;
castSkill(charId());
bossDamage(bossUltDmg(p.n), true);
return;
}
if (S.bossTellAt > 0) {
if (now() >= S.bossTellAt) bossAttack();
return;
}
if (S.bossAtkAt > 0 && now() >= S.bossAtkAt) {
if (fxBusy()) { S.bossAtkAt = now() + 700; return; }
bossTell();
}
}
function hudFloorY(size) {
var h = (typeof window !== 'undefined' ? (window.innerHeight || 640) : 640);
var bottom = 0;
var ids = ['duel-hud', 'classic-hud', 'topbar', 'tb-stats'];
for (var i = 0; i < ids.length; i++) {
var el = $(ids[i]);
if (!el || el.hidden || !el.getBoundingClientRect) continue;
var r = el.getBoundingClientRect();
if (r.width <= 0 || r.height <= 0) continue;
if (r.bottom > bottom) bottom = r.bottom;
}
var rise = (J && J.floatRise) ? J.floatRise(size) : (54 + ((size || 22) - 22) * 1.1);
var y = bottom + rise + 10;              // 10 = 글자 윗변과 HUD 사이의 숨통
var cap = h * 0.62;
return y > cap ? cap : y;
}
function bossDefeatFx() {
var el = $('boss-bar');
if (el && el.classList) el.classList.add('down');
var hud = $('duel-hud');
if (hud && hud.classList) { hud.classList.remove('tell'); hud.classList.add('down'); }
setAppClass('boss-tell', false);
J.screenPulse();
J.vignette(0.55);
J.sfx.tierUp(4);
J.vibrate(90);
}
function duelFoeDef(n) {
var d = bossDefOf(n);
if (d) return d;
var k = ((n | 0) - 1) % BOSS_DEFS.length;
return BOSS_DEFS[((k % BOSS_DEFS.length) + BOSS_DEFS.length) % BOSS_DEFS.length];
}
function duelNeedHits(n) {
var c = advChapter(n);
if (!(c >= 1)) c = 1;
var tbl = advIsBoss(n) ? DUEL_NEED_BOSS_CH : DUEL_NEED_CH;
if (c > tbl.length) c = tbl.length;
return Math.max(1, tbl[c - 1] | 0);
}
function duelFoeHpMax(n) {
return Math.max(1, duelAtkMax(n) * duelNeedHits(n));
}
function arcFoeHpMax(n) { return Math.max(1, Math.round(advPar(n) * DUEL_FOE_HP_K)); }
function duelAtkMax(n) { return Math.max(1, Math.round(advPar(n) * DUEL_ATK_K)); }
function duelFoeHit(n) {
return Math.min(DUEL_HIT_CAP,
Math.round(DUEL_ME_HP * (DUEL_HIT_BASE + (n | 0) * DUEL_HIT_STEP)));
}
function duelInit(p) {
var n = p ? p.n : 1;
var atkMax = duelAtkMax(n);
var foeHp = duelFoeHpMax(n);
S.duel = {
me: { hp: DUEL_ME_HP, hpMax: DUEL_ME_HP, atk: 0, atkMax: atkMax,
sp: 0, spMax: atkMax * DUEL_SP_MULT },
foe: { hp: foeHp, hpMax: foeHp, atk: 0, atkMax: DUEL_FOE_ATK_MAX,
hit: duelFoeHit(n) },
def: duelFoeDef(n),
dmg: 0,
petLeft: petUses(),
refillSeq: 0,
foeSkillAt: 0,
idleAt: 0,
awkUntil: 0,   /* 74 — 각성 마감(벽시계). 0 = 꺼짐 */
freezeUntil: 0,
chillAt: 0,
freeLinkUntil: 0,
tsOverlayUntil: 0,
meArm: false,
quakeGuard: 0,
cycAt: 0,
finishPhase: false,
down: false
};
return S.duel;
}
function duelStart(p) {
var d = S.duel;
if (!d) return;
d.foeSkillAt = now() + DUEL_SKILL_MS;   // 첫 방해는 판이 궤도에 오른 뒤에
d.idleAt = now() + DUEL_IDLE_MS;
d.cycAt = now();                        // ★ 0826 7단계 — 초코 대왕의 30초 창
d.quakeGuard = 0;
S.bossAtkAt = 0;
S.bossTellAt = 0;
S.bossArm = false;
setAppClass('boss', true);
setAppClass('battle', true);
var bb = $('boss-bar');
if (bb) {
bb.hidden = true;
if (bb.classList) bb.classList.remove('hit', 'big', 'down', 'tell');
}
duelHudMount(d);
syncDuel();
}
function duelHudMount(d) {
var hud = $('duel-hud');
if (!hud || !d) return;
hud.hidden = false;
if (hud.classList) hud.classList.remove('fhit', 'mhit', 'big', 'tell', 'down');
d.hud = null;                      // 캐시 초기화 — 첫 틱이 여섯 칸을 다 쓴다
var av = $('duel-foe-av');
if (av) av.className = 'dh-av boss-av bs-' + (d.def ? d.def.id : 'grape');
var foeChip = $('duel-foe-chip');
if (foeChip) foeChip.className = 'dh-foe-chip cp-th kit-chip-v2 bs-' + (d.def ? d.def.id : 'grape');
var foeAtk = bossAtkIdOf(d.def, S.advPlan ? S.advPlan.n : 0);
setText('duel-foe-skill-n', t('boss.atk.' + foeAtk));
setText('duel-foe-skill-d', t('boss.atk.' + foeAtk + '.d', ncAtkArgs(foeAtk)));
setText('duel-foe-name', d.def ? bossName(d.def) : '');
var cid = charId();
setText('duel-me-name', t('char.' + cid + '.name'));
['duel-foe-name', 'duel-me-name'].forEach(function (id) {
var ne = $(id);
if (ne) ne.toggleAttribute('data-long', (ne.textContent || '').length >= 10);
});
var me = $('duel-me-av');
if (me) {
setStdArt(me, cid, 'face', '--duel-me-face');
var meFull = stdArt(cid, 'full');
if (me.style) {
if (meFull) me.style.setProperty('--me-full', meFull);
else me.style.removeProperty('--me-full');
}
}
var baby = $('duel-baby');
if (baby && baby.style) {
var petFace = stdArt(mateId(), 'face');
baby.style.setProperty('--char-thumb',
petFace || 'url("catalog/duel-cloud-baby.webp")');
}
}
function duelHudUnmount() {
var hud = $('duel-hud');
if (!hud) return;
hud.hidden = true;
if (hud.classList) hud.classList.remove('fhit', 'mhit', 'big', 'tell', 'down');
}
function dhVar(c, k, id, prop, v) {
var n = Math.round(v * 1000) / 1000;
if (c[k] === n) return;
c[k] = n;
var el = $(id);
if (el && el.style) el.style.setProperty(prop, String(n));
}
function dhText(c, k, id, s) {
if (c[k] === s) return;
c[k] = s;
setText(id, s);
}
function dhHp(c, k, id, cur, max) {
var s = cur + ' / ' + max;
if (c[k] === s) return;
c[k] = s;
var e = $(id);
if (!e) return;
var w = e.firstElementChild;
if (!w || w.className !== 'dh-hp' || w.childNodes.length !== 3 || w.firstChild.nodeType !== 3 || w.lastChild.nodeType !== 3) {
e.textContent = '';
w = document.createElement('span');
w.className = 'dh-hp';
w.appendChild(document.createTextNode(''));
var sl = document.createElement('span');
sl.className = 'dh-sl';
sl.textContent = '/';
w.appendChild(sl);
w.appendChild(document.createTextNode(''));
e.appendChild(w);
}
w.firstChild.nodeValue = cur + ' ';
w.lastChild.nodeValue = ' ' + max;
}
function dhBar(c, k, id, v) {
var n = Math.round(v * 1000) / 1000;
if (c[k] === n) return;
var prev = (c[k] === undefined) ? n : c[k];
c[k] = n;
var el = $(id);
if (!el || !el.style) return;
el.style.setProperty('--hv2-hp-prev', String(prev));
el.style.setProperty('--hv2-hp', String(n));
if (!el.setAttribute) return;
el.setAttribute('data-dir', n > prev ? 'up' : 'down');
if (n < 0.25) el.setAttribute('data-low', ''); else el.removeAttribute('data-low');
if (n <= 0)   el.setAttribute('data-empty', ''); else el.removeAttribute('data-empty');
}
function syncDuel() {
var d = S.duel;
if (!d) return;
var hud = $('duel-hud');
if (!hud || hud.hidden) return;
var c = d.hud || (d.hud = {});
var f = d.foe, m = d.me;
dhVar(c, 'fr', 'duel-foe-fill', '--hp', f.hpMax > 0 ? Math.max(0, f.hp) / f.hpMax : 0);
dhVar(c, 'mr', 'duel-me-fill', '--hp', m.hpMax > 0 ? Math.max(0, m.hp) / m.hpMax : 0);
dhVar(c, 'fa', 'duel-foe-atk', '--atk', f.atkMax > 0 ? Math.min(1, f.atk / f.atkMax) : 0);
var mr = m.atkMax > 0 ? Math.min(1, m.atk / m.atkMax) : 0;
dhVar(c, 'ma', 'duel-me-atk', '--atk', mr);
var mpct = duelAtkPct();
if (c.mp !== mpct) {
c.mp = mpct;
setText('duel-me-atkpct', mpct + '%');
var mrow = $('duel-me-atkrow');
if (mrow) mrow.setAttribute('aria-valuenow', String(mpct));
}
var tier = mr >= 1 ? '3' : mr >= 0.66 ? '2' : mr >= 0.33 ? '1' : '0';
if (c.mt !== tier) {
c.mt = tier;
var mav = $('duel-me-av');
if (mav) mav.setAttribute('data-atk-tier', tier);
}
dhHp(c, 'fn', 'duel-foe-n', Math.max(0, Math.ceil(f.hp)), f.hpMax);
dhHp(c, 'mn', 'duel-me-n', Math.max(0, Math.ceil(m.hp)), m.hpMax);
}
function duelFoeAt() {
var w = typeof window !== 'undefined' ? window.innerWidth : 360;
var h = typeof window !== 'undefined' ? window.innerHeight : 640;
var pt = { x: w / 2, y: h * 0.16 };
var el = $('duel-foe-av');
if (el && el.getBoundingClientRect) {
var r = el.getBoundingClientRect();
if (r.width > 0) { pt.x = r.left + r.width / 2; pt.y = r.top + r.height / 2; }
}
return pt;
}
function duelHudFlash(cls, big) {
var hud = $('duel-hud');
if (!hud || hud.hidden || !hud.classList) return;
hud.classList.remove('fhit', 'mhit', 'big');
void hud.offsetWidth;
hud.classList.add(cls);
if (big) hud.classList.add('big');
}
function duelHitFoe(dmg, big) {
var d = S.duel;
if (!d || d.down) return 0;
var n = Math.max(0, Math.round(dmg));
if (n <= 0) return 0;
var real = Math.min(n, d.foe.hp);
d.foe.hp -= real;
d.dmg += real;
duelHudFlash('fhit', big);
if (big && typeof window !== 'undefined') {
var at = duelFoeAt();
J.shockwave(at.x, at.y, '#ff5a3d');
var px = Math.min(Math.max(at.x, 96), Math.max(96, window.innerWidth - 96));
var dy = Math.max(at.y + 26, hudFloorY(36));
J.floatText(px, dy, '-' + n, '#ff8a3d', 36);
J.vibrate(50);
heroSay('boss', 5);
}
syncDuel();
advScriptCheck(d);
return real;
}
function advScriptCheck(d) {
if (!d || d.scripted || d.down) return;
if (S.mode !== 'adv') return;                 // 아케이드 누출 차단(이중 가드 ①)
var p = S.advPlan || advPlan(S.stage);
if (!p || p.n !== DUEL_SCRIPT_STAGE) return;  // 50탄 하나뿐(이중 가드 ②)
if (d.foe.hp > d.foe.hpMax * DUEL_SCRIPT_HP) return;
advScriptFire(d);
}
function advScriptFire(d) {
d.scripted = true;
d.foe.hp = d.foe.hpMax;
d.foe.atk = 0;
duelMgOff(d);                 // 각본 중에 폭주 간판이 떠 있으면 말이 엉킨다
syncDuel();
duelHudFlash('fhit', true);
shakeScreen(3);
if (typeof window !== 'undefined') J.vignette(0.6);
J.vibrate(60);
later(function () {
runCutin('boss', 'boss.cocoa.name', function () {
duelHitMe(DUEL_ME_HP);
}, { cls: 'cut-scripted', subKey: 'story.s50.taunt', voice: 'jelly' });
}, 900);
}
var meCastOffT = 0;
var meFxMs = null;
function meFxTimes() {
if (!meFxMs) meFxMs = { cast: invCssMs('--mo-cast-life', 700), d2: invCssMs('--dur-2', 260) };
return meFxMs;
}
function meCastFx(btn) {
if (!battleOn()) return;
var av = $('duel-me-av');
if (av && av.classList) {
var life = meFxTimes().cast;
if (meCastOffT) { clearTimeout(meCastOffT); meCastOffT = 0; }
var on = function () { av.classList.add('cast'); meCastOffT = setTimeout(function () { meCastOffT = 0; av.classList.remove('cast'); }, life); };
if (av.classList.contains('cast')) { av.classList.remove('cast'); requestAnimationFrame(on); } else on();
}
if (btn && btn.classList) {
var pop = meFxTimes().d2;
if (btn.__popT) { clearTimeout(btn.__popT); btn.__popT = 0; }
var onB = function () { btn.classList.add('halo-pop'); btn.__popT = setTimeout(function () { btn.__popT = 0; btn.classList.remove('halo-pop'); }, pop); };
if (btn.classList.contains('halo-pop')) { btn.classList.remove('halo-pop'); requestAnimationFrame(onB); } else onB();
}
}
var meHitOffT = 0;
function meHitFx() {
if (!battleOn()) return;
var av = $('duel-me-av');
if (!av || !av.classList) return;
var life = meFxTimes().d2;
if (meHitOffT) { clearTimeout(meHitOffT); meHitOffT = 0; }
var on = function () { av.classList.add('hit'); meHitOffT = setTimeout(function () { meHitOffT = 0; av.classList.remove('hit'); }, life); };
if (av.classList.contains('hit')) { av.classList.remove('hit'); requestAnimationFrame(on); } else on();
}
function duelMeAttack() {
var d = S.duel;
if (!d || d.down) return;
var me = d.me;
meCastFx(null);
me.atk -= me.atkMax;
if (me.atk < 0) me.atk = 0;
if (typeof window !== 'undefined') {
var at = duelFoeAt();
var src = (d.srcPts && d.srcPts.length) ? d.srcPts : null;
if (!src) {
J.beam(window.innerWidth / 2, window.innerHeight * 0.74, at.x, at.y, '#ffb03d');
} else {
var beamCap = (d.mgTier >= 2) ? DUEL_MG_BEAM_MAX : DUEL_BEAM_MAX;
var nBeam = Math.min(src.length, beamCap);
for (var bi = 0; bi < nBeam; bi++) {
(function (p, k) {
if (!p) return;
if (k === 0) J.beam(p.x, p.y, at.x, at.y, '#ffb03d');
else later(function () { J.beam(p.x, p.y, at.x, at.y, '#ffb03d'); }, k * DUEL_BEAM_GAP_MS);
})(src[bi], bi);
}
}
}
J.sfx.bomb();
duelHitFoe(me.atkMax, true);
d.meArm = me.atk >= me.atkMax;
if (!d.mgShots) d.mgShots = [];
var tShot = now();
d.mgShots.push(tShot);
d.mgLastShotAt = tShot;
while (d.mgShots.length && tShot - d.mgShots[0] > DUEL_MG_TIER2_WIN) d.mgShots.shift();
}
function duelMgCount(d, win) {
var t = now(), n = 0, i;
if (!d.mgShots) return 0;
for (i = d.mgShots.length - 1; i >= 0; i--) {
if (t - d.mgShots[i] > win) break;
n++;
}
return n;
}
function duelMgOff(d) {
d = d || S.duel;
setAppClass('mg', false);
setAppClass('mg2', false);
if (!d) return;
if (d.mgOn && typeof window !== 'undefined') J.vignette(0);
d.mgOn = false;
d.mgTier = 0;
if (d.mgShots) d.mgShots.length = 0;
}
function duelMgTick(d) {
if (!d || d.down) return;
if (d.mgOn && d.mgLastShotAt && now() - d.mgLastShotAt > DUEL_MG_GRACE) {
duelMgOff(d);
return;
}
var n1 = duelMgCount(d, DUEL_MG_WIN);
var n2 = duelMgCount(d, DUEL_MG_TIER2_WIN);
if (!d.mgOn) {
if (n1 < DUEL_MG_ENTER) return;
d.mgOn = true;
d.mgTier = 1;
setAppClass('mg', true);
impactWord(t('fx.overdrive'), '#FFD24A', 1.0, { top: 28, dur: 820 });
howtoOnce('od', 'howto.overdrive', true);
J.screenPulse();
shakeScreen(1);
J.vibrate(60);
J.sfx.jackpot();
return;
}
if (d.mgTier < 2 && n2 >= DUEL_MG_TIER2) {
d.mgTier = 2;
setAppClass('mg2', true);
J.sfx.tierUp(4);
} else if (d.mgTier >= 2 && n2 < DUEL_MG_TIER2) {
d.mgTier = 1;
setAppClass('mg2', false);
}
}
function duelHitMe(dmg) {
var d = S.duel;
if (!d || d.down) return;
var n = Math.max(0, Math.round(dmg));
if (n <= 0) return;
if (!d.itemGuardUsed && itemOn('puddingcharm')) {
d.itemGuardUsed = 1;
duelHudFlash('mhit', false);
if (typeof window !== 'undefined') {
J.floatText(window.innerWidth / 2, window.innerHeight * 0.64,
t('item.guard.block'), '#8FD9C0', 30);
}
J.sfx.ui();
syncDuel();
return;
}
d.me.hp = Math.max(0, d.me.hp - n);
S.hitTaken = true;
duelHudFlash('mhit', false);
meHitFx();                       /* [판정판 130 · 지휘자 답 Q4] 영웅 그림 움찔 + 빨간 번쩍(채택표 「(말로)」 줄) */
setAppClass('duel-hurt', true);
later(function () { setAppClass('duel-hurt', false); }, 420);
J.screenPulse();
J.vignette(0.45);
J.vibrate(70);
if (typeof window !== 'undefined') {
J.shockwave(window.innerWidth / 2, window.innerHeight * 0.6, '#ff3d3d');
J.floatText(window.innerWidth / 2, window.innerHeight * 0.64, '-' + n, '#ff6a6a', 36);
}
J.sfx.fail();
syncDuel();
}
function duelFoeGauge(n) {
var d = S.duel;
if (!d || d.down || !S.running) return;
if (d.freezeUntil > 0 && now() < d.freezeUntil) return;
if (S.bossTellAt > 0) return;      // 이미 예고 중 — 예고 위에 예고를 쌓지 않는다
d.foe.atk += Math.max(0, n | 0);
if (d.foe.atk >= d.foe.atkMax) {
d.foe.atk = d.foe.atkMax;
duelTell();
}
syncDuel();
}
function duelTell() {
S.bossTellAt = now() + BOSS_TELL_MS;
setAppClass('boss-tell', true);
var el = $('boss-bar');
if (el && el.classList) el.classList.add('tell');
var hud = $('duel-hud');
if (hud && hud.classList) hud.classList.add('tell');
var fav = $('duel-foe-av');
if (fav && fav.classList) {
fav.classList.remove('foewarn');
void fav.offsetWidth;
fav.classList.add('foewarn');
later(function () { if (fav.classList) fav.classList.remove('foewarn'); }, BOSS_TELL_MS);
}
if (typeof window !== 'undefined') {
var at = duelFoeAt();
var px = Math.min(Math.max(at.x, 96), Math.max(96, window.innerWidth - 96));
J.floatText(px, Math.max(40, at.y - 18), t('duel.tellwarn'), '#ff5a3d', 26);
}
toast(t('duel.tell'));
J.sfx.fail();
shakeScreen(1);           // 가장 약한 단계 — 예고는 알림이지 타격이 아니다
J.vibrate(20);
}
function duelFoeAttack() {
var d = S.duel;
S.bossTellAt = 0;
setAppClass('boss-tell', false);
var el = $('boss-bar');
if (el && el.classList) el.classList.remove('tell');
var hud = $('duel-hud');
if (hud && hud.classList) hud.classList.remove('tell');
if (!d || d.down) return;
d.foe.atk = 0;
duelHitMe(d.foe.hit);
toast(t('duel.hit', { n: d.foe.hit }));
}
var FOE_FULL = { grape: 'grape', soda: 'soda', berry: 'straw', mint: 'mint', cocoa: 'cocoa' };
function duelFoeFull() {
var d = S.duel, id = (d && d.def) ? d.def.id : '';
var k = FOE_FULL[id];
return 'url("catalog/duel-demon-full' + (k ? ('-' + k) : '') + '.webp")';
}
function duelFoeSkill() {
S.bossAtkN = (S.bossAtkN | 0) + 1;   // 위치 난수의 순번 (재도전 재현성)
var atk = bossAtkNow(S.duel && S.duel.def);
runCutin('demon', 'skill.foe.name', function () {
bossSkillFire(atk, DUEL_SKILL_BLK);
}, {
subKey: 'skill.sub.foe',
key: '#FF3D2E',
cls: 'cut-foe',
noAv: true,
voice: '',                                        // 악당에게는 보이스 세트가 없다
vig: 0.62,
img: duelFoeFull(),
cut: !!FOE_ART_CUT[(S.duel && S.duel.def) ? S.duel.def.id : ''],   /* [수정 2회차] 아래변이 잘린 그림이면 발 가림(표는 NC_FOE_ART 곁 FOE_ART_CUT 하나) */
sfx: function () { J.sfx.foeStab(); }
});
}
var bossDriver = {
onMiss: function (why) { duelFoeGauge(DUEL_MISS_GAIN); },
onBreak: function () { duelFoeGauge(DUEL_BREAK_GAIN); },
onTick: function () { duelFoeSkill(); }
};
var foeDriver = bossDriver;
function duelOnMatch(pts, iceOnly, tw, twPrev, ptsPre) {
var d = S.duel;
if (!d || d.down) return;
d.me.atk += Math.max(0, pts);
if (!iceOnly) {
d.idleAt = now() + DUEL_IDLE_MS;
if (tw && (tw.chain | 0) > (twPrev | 0) && !awakenOn()) {
var spWas = d.me.sp >= d.me.spMax;
d.me.sp = Math.min(d.me.spMax, d.me.sp + DUEL_SP_MULT * Math.max(0, (typeof ptsPre === 'number') ? ptsPre : pts));
if (!spWas && d.me.sp >= d.me.spMax) {
if (J.sfx.milestone) J.sfx.milestone();
J.vibrate(34);
fullCue('btn-hint');
tipOnce('ultReady', 'tip.ultReady');
}
}
}
if (d.me.atk >= d.me.atkMax) d.meArm = true;
syncDuel();
}
function finishLeftMs() {
if (!finishOn() || !(S.finishUntil > 0)) return 0;
var left = S.finishUntil - now();
return left > 0 ? left : 0;
}
function enterFinish() {
var d = S.duel, p = S.advPlan;
if (!d || d.finishPhase) return;
var f = p ? bossFinishOf(p.n) : null;
if (!f) return;
d.finishPhase = true;
bossDefeatFx();
duelMgOff(d);
d.meArm = false;
d.foeSkillAt = 0;
d.idleAt = 0;
S.bossTellAt = 0;
setAppClass('boss-tell', false);
S.mission = { id: f.id, goal: f.goal | 0, prog: 0, done: false };
capSpecialMission(S.mission);          /* W6.5b P0 — 있는 것보다 많이 요구 금지 */
S.sprintWin = f.win > 0 ? f.win : DUEL_FINISH_MS;
S.sprintTimes = [];
S.finishUntil = now() + DUEL_FINISH_MS;
S.missionUntil = S.finishUntil;
syncMission();
impactWord(missionText(S.mission), '#FFE27A', 64,
{ sub: t('finish.sub'), top: 24, dur: 900, heavy: true });
J.screenPulse();
shakeScreen(2);
J.sfx.tierUp(3);
J.vibrate(60);
syncDuel();
}
function finishTick() {
var d = S.duel;
if (!d || !d.finishPhase) return;
if (S.mission && S.mission.done) { finishWin(); return; }
if (now() >= S.finishUntil) { finishLose(); return; }
syncMission();               // 배지의 남은 시간 한 칸
}
function finishWin() {
var d = S.duel;
if (!d) return;
d.finishPhase = false;
d.down = true;
d.meArm = false;
S.finishUntil = 0;
finishBlast();
advFinish(true, 'boss');
}
function finishLose() {
var d = S.duel;
if (!d) return;
d.finishPhase = false;
d.down = true;
d.meArm = false;
S.finishUntil = 0;
S.missionUntil = 0;
duelHudFlash('mhit', true);
advFinish(false, 'finish');
}
function duelTick() {
var d = S.duel;
if (!d || !S.running || !battleOn()) return;
if (d.finishPhase) { finishTick(); return; }
if (!d.down && d.foe.hp <= 0) {
if (S.mode !== 'adv') {
store.duelWins = (store.duelWins | 0) + 1;
dqBump('duel', 1);
achvCheck();
}
if (S.mode === 'adv') {
var pf = S.advPlan;
if (pf && pf.boss && bossFinishOf(pf.n)) { enterFinish(); return; }
d.down = true;
d.meArm = false;
duelMgOff(d);
bossDefeatFx();
finishBlast();          /* §3 재배선 — 피니시 없는 탄의 격파는 여기서 터진다 */
advFinish(true, 'boss');
return;
}
if (S.mode === 'arc-time') {
d.down = true;
d.meArm = false;
bossDefeatFx();
finishBlast();          /* §3.5 P0 — 아케이드 격파 연출 보상 */
arcFinish('clear');
return;
}
arcWaveNext();            // arc-surv / arc-dmg — 판은 계속된다
return;
}
if (!d.down && d.me.hp <= 0) {
d.down = true;
d.meArm = false;
duelMgOff(d);
if (S.mode === 'adv') advFinish(false, d.scripted ? 'scripted' : 'ko');
else arcFinish('ko');
return;
}
if (d.down) return;
bossMaskTick();               // ★ 0826 7단계 — mask 자동 해제 (벽시계 하나)
duelMgTick(d);                // 폭주 §1.3 — 진입·승격·강등·해제
if (d.meArm && !S.busy && !fxBusy()) { duelMeAttack(); return; }
if (S.bossTellAt > 0) {
if (now() >= S.bossTellAt) duelFoeAttack();
return;
}
if (d.idleAt > 0 && now() >= d.idleAt) {
d.idleAt = now() + DUEL_IDLE_MS;
duelFoeGauge(DUEL_IDLE_GAIN);
}
if (d.foeSkillAt > 0 && now() >= d.foeSkillAt) {
if (S.busy || fxBusy()) { d.foeSkillAt = now() + 700; return; }
d.foeSkillAt = now() + DUEL_SKILL_MS;
foeDriver.onTick();
}
}
function arcWaveNext() {
var d = S.duel;
if (!d) return;
bossDefeatFx();
finishBlast();            /* §3.5 P0 — 웨이브 격파 연출 보상 */
d.kos = (d.kos | 0) + 1;
d.def = BOSS_DEFS[(d.kos % BOSS_DEFS.length + BOSS_DEFS.length) % BOSS_DEFS.length];
d.foe.hp = d.foe.hpMax;
d.foe.atk = 0;
duelHudMount(d);
syncDuel();
}
function duelChillSync() {
var d = S.duel;
var on = !!(d && d.freezeUntil > 0 && now() < d.freezeUntil);
setAppClass('chill', on);
var dt = $('duel-timer');
if (dt && dt.classList) dt.classList.toggle('chill', on);
var rt = $('rush-timer');
if (rt && rt.classList) rt.classList.toggle('chill', on);
return on;
}
function arcAddClock(held) {
if (!(held > 0)) return;
if (S.mode === 'adv') { if (S.advEndAt > 0) S.advEndAt += held; return; }
if (isArcadeDuel() && S.rushEndAt > 0) S.rushEndAt += held;
}
function duelChillTick() {
var d = S.duel;
if (!d) return 0;
if (!(d.freezeUntil > 0)) {
if (d.chillAt > 0) { d.chillAt = 0; duelChillSync(); }
return 0;
}
var t = now(), held;
if (t >= d.freezeUntil) {
held = d.chillAt > 0 ? Math.max(0, d.freezeUntil - d.chillAt) : 0;
d.chillAt = 0;
d.freezeUntil = 0;
arcAddClock(held);       // 모험이면 S.advEndAt, 아케이드면 S.rushEndAt
duelChillSync();
return held;
}
if (!(d.chillAt > 0)) { d.chillAt = t; duelChillSync(); return 0; }
held = Math.max(0, t - d.chillAt);
d.chillAt = t;
arcAddClock(held);         // 모험이면 S.advEndAt, 아케이드면 S.rushEndAt
duelChillSync();
return held;
}
function duelTimeoutWin() {
var d = S.duel;
if (!d) return false;
var mine = d.me.hpMax > 0 ? d.me.hp / d.me.hpMax : 0;
var theirs = d.foe.hpMax > 0 ? d.foe.hp / d.foe.hpMax : 0;
return mine >= theirs;
}
function duelAtkPct() {
var d = S.duel;
if (!d || d.me.atkMax <= 0) return 0;
return Math.min(100, Math.floor(d.me.atk / d.me.atkMax * 100));
}
function duelSpPct() {
var d = S.duel;
if (!d || d.me.spMax <= 0) return 0;
return Math.min(100, Math.floor(d.me.sp / d.me.spMax * 100));
}
function duelGaugePct() {
return Math.floor(clamp(store.gauge, 0, SKILL_MAX) / SKILL_MAX * 100);
}
var AWAKEN_MS = 8000;
var AWAKEN_SCORE_MULT = 2;
function awakenOn() {
var d = S.duel;
return !!(d && !d.down && d.awkUntil > 0 && now() < d.awkUntil);
}
function awakenMult() { return awakenOn() ? AWAKEN_SCORE_MULT : 1; }
function awakenLeftMs() { return awakenOn() ? Math.max(0, S.duel.awkUntil - now()) : 0; }
function awakenLeftSec() { return Math.ceil(awakenLeftMs() / 1000); }
function awakenBadgeText() {
var n = awakenLeftSec(), lg = currentLang();
if (n !== awkBadgeSec || lg !== awkBadgeLang) {
awkBadgeSec = n; awkBadgeLang = lg;
AWK_LEFT_ARG.n = n;
awkBadgeTxt = t('act.awk.left', AWK_LEFT_ARG);
}
return awkBadgeTxt;
}
function awakenStart() {
var d = S.duel;
if (!d || d.down) return;
d.awkUntil = now() + AWAKEN_MS;
awkBadgeSec = -1;                    // 배지 글자 캐시를 비운다 — 새 각성은 처음 값부터 다시 만든다
if (J.sfx.milestone) J.sfx.milestone();
J.screenPulse();
J.vibrate(40);
toast(t('duel.spgo'));
syncHud();
syncDuel();
}
function awakenTick() {
var d = S.duel;
if (!d || !(d.awkUntil > 0) || S.paused) return;
if (now() >= d.awkUntil) { d.awkUntil = 0; syncHud(); syncDuel(); return; }
}
function doSpecial() {
var d = S.duel;
if (!d || d.down || !S.running || S.paused) return;
if (awakenOn()) {
toast(t('duel.awkon', { n: awakenLeftSec() }));
J.sfx.ui();
return;
}
if (d.me.sp < d.me.spMax) {
toast(t('duel.spstat', { n: duelSpPct() }));
J.sfx.fail();
return;
}
d.me.sp = 0;
meCastFx($('btn-hint'));            /* [판정판 130] 실제로 쓴 순간에만 — 미만땅 토스트 길에서는 안 낸다 */
syncHud();
syncDuel();
runCutin(charId(), 'skill.sp.name', function () { awakenStart(); },
{ subKey: 'skill.sub.sp', sfx: function () { J.sfx.spBlast(); } });
}
function doPetSkill() {
var d = S.duel;
if (!d || d.down || !S.running || S.paused) return;
if (S.busy) return;                  // 리필·연출 한가운데서 판을 또 흔들지 않는다
var mid = mateId();
if (!mid) { toast(t('duel.petnone')); J.sfx.fail(); return; }
if ((d.petLeft | 0) <= 0) { toast(t('duel.petout')); J.sfx.fail(); return; }
d.petLeft = (d.petLeft | 0) - 1;
dqBump('pet', 1);               /* 판정판 50 — 「펫 소환」 축 */
meCastFx($('btn-undo'));        /* [판정판 130] 영웅 시전 연출 + 단추 후광 퍼짐(실제로 쓴 순간) */
duelPetFx();
badgePop('undo-badge');
syncHud();
syncDuel();
runCutin(mid, 'skill.' + mid + '.name', function () {
var fn = PET_SKILL[mid] || petPeck;
var ok = fn();
if (!ok) {
d.petLeft = (d.petLeft | 0) + 1;
syncHud();
syncDuel();
return;
}
hitStop(HITSTOP_MS);
syncHud();
syncDuel();
}, { subKey: 'skill.sub.pet', sfx: function () { J.sfx.petBell(); } });
}
function petPeck(nOpt, keyOpt) {
var d = S.duel, i;
var want = petPowN((nOpt | 0) > 0 ? (nOpt | 0) : DUEL_PET_POP);
var tkey = keyOpt || 'duel.petpeck';
var live = [];
for (i = 0; i < S.cells.length; i++) {
var c = S.cells[i];
if (c && !c.dead && c.sp !== 'block') live.push(i);
}
if (!live.length) { toast(t('duel.petempty')); J.sfx.fail(); return false; }
shuffleSeeded(live, battleRng());     // 시드 파생 — 같은 판·같은 순서면 같은 표적
var kill = live.slice(0, Math.min(want, live.length));
clearSelection();
clearHints();
S.busy = true;
var vals = [];
for (i = 0; i < kill.length; i++) {
var k = kill[i], cc = S.cells[k];
vals.push(cc.v);
cc.dead = true; cc.sp = ''; cc.ice = 0; cc.blk = 0;
if (tileEls[k]) tileEls[k].classList.add('pop');
}
var pts = BOMB_KILL_SCORE * S.stage * kill.length;
d.me.atk += pts;
if (d.me.atk >= d.me.atkMax) d.meArm = true;
d.idleAt = now() + DUEL_IDLE_MS;
J.sfx.bomb();
J.vibrate(30);
toast(t(tkey, { n: kill.length }));
(function (list, vlist) {
later(function () {
for (var n = 0; n < list.length; n++) {
var el = tileEls[list[n]], ctr = tileCenter(list[n]);
J.burst(ctr.x, ctr.y, '#ffd76a', 13, fruitOf(vlist[n]));
if (el) { el.classList.remove('pop'); el.classList.add('dead'); }
}
runBattleRefill();       // S.busy 는 리필이 끝내 준다 (resolveMatch 와 같은 사슬)
}, POP_MS);
})(kill.slice(), vals);
return true;
}
function petShield() {
var d = S.duel;
var fms = petDurMs(DUEL_PET_FREEZE_MS);
d.freezeUntil = now() + fms;
if (!(d.chillAt > 0)) d.chillAt = now();
duelChillSync();
J.screenPulse();
J.vignette(0.24);
J.sfx.ice();
J.sfx.mission();
hitStop(HITSTOP_LIGHT_MS);
shakeScreen(1);
J.vibrate(30);
if (typeof window !== 'undefined') {
J.shockwave(window.innerWidth / 2, window.innerHeight * 0.62, '#7ae0ff');
J.floatText(window.innerWidth / 2, window.innerHeight * 0.50,
t('duel.timestop'), '#9fe8ff', 34);
}
toast(t('duel.petshield', { n: Math.round(fms / 1000) }));
return true;
}
function petFreeze4s_mongle() {
var d = S.duel;
if (!d || d.down) return false;
var mms = petDurMs(DUEL_MONGLE_FREEZE_MS);   /* 74 — 지속은 상수 그대로(항등 자리) */
var until = now() + mms;
if (until > d.freezeUntil) d.freezeUntil = until;
if (!(d.chillAt > 0)) d.chillAt = now();
duelChillSync();
J.sfx.ice();
J.screenPulse();
J.vignette(0.20);
hitStop(HITSTOP_LIGHT_MS);
shakeScreen(1);
J.vibrate(24);
if (typeof window !== 'undefined') {
J.shockwave(window.innerWidth / 2, window.innerHeight * 0.60, '#9fe8ff');
J.floatText(window.innerWidth / 2, window.innerHeight * 0.50,
t('duel.timestop'), '#9fe8ff', 32);
}
toast(t('duel.petmongle', { n: Math.round(mms / 1000) }));
return true;
}
function petRowShuffle_churup() {
var d = S.duel, i, r;
if (!d || d.down || S.busy) return false;
var rows = Math.ceil(S.cells.length / COLS);
if (rows <= 0) return false;
var pick = [];
for (r = 0; r < rows; r++) {
var n = 0;
for (i = 0; i < COLS; i++) {
var c = S.cells[r * COLS + i];
if (c && !c.dead && c.sp !== 'block') n++;
}
if (n >= 2) pick.push(r);          // 한 칸짜리 행은 섞어 봐야 그대로다
}
if (!pick.length) { toast(t('duel.petempty')); J.sfx.fail(); return false; }
shuffleSeeded(pick, battleRng());    // 시드 파생 — 같은 판·같은 순서면 같은 행
var take = Math.min(DUEL_CHURUP_ROWS, pick.length);
for (var k = 0; k < take; k++) {
var row = pick[k], idx = [], vals = [];
for (i = 0; i < COLS; i++) {
var kk = row * COLS + i, cc = S.cells[kk];
if (cc && !cc.dead && cc.sp !== 'block') { idx.push(kk); vals.push(cc.v); }
}
shuffleSeeded(vals, battleRng());
for (i = 0; i < idx.length; i++) S.cells[idx[i]].v = vals[i];
}
clearSelection();
clearHints();
renderAll();
d.idleAt = now() + DUEL_IDLE_MS;
d.quakeGuard = 1;
J.sfx.petBell();
shakeScreen(1);
J.vibrate(24);
toast(t('duel.petchurup', { n: take }));
return true;
}
function petTimestop_tiktok() {
var d = S.duel;
if (!d || d.down) return false;
var tms = petDurMs(DUEL_TIKTOK_FREEZE_MS);   /* 74 — 지속은 상수 그대로(항등 자리) */
var until = now() + tms;
if (until > d.freezeUntil) d.freezeUntil = until;
if (!(d.chillAt > 0)) d.chillAt = now();
duelChillSync();
tsOverlayOpen(tms);
J.sfx.ice();
J.sfx.mission();
J.screenPulse();
J.vignette(0.22);
hitStop(HITSTOP_LIGHT_MS);
shakeScreen(1);
J.vibrate(60);                     /* §4.2-3 의 값 그대로 */
toast(t('duel.pettiktok', { n: Math.round(tms / 1000) }));
return true;
}
function tsOverlayOpen(ms) {
var el = $('ts-over');
var d = S.duel;
if (d) d.tsOverlayUntil = now() + ms;
if (!el) return;
setStdArt($('ts-cast'), 'tiktok', 'full', '--slot-std');
setText('ts-line', t('pet.timestop.hold'));
el.hidden = false;
el.classList.remove('go');
if (el.offsetWidth !== undefined) void el.offsetWidth;
el.classList.add('go');
later(function () {
if (!el.hidden) { setText('ts-line', t('pet.timestop.go')); el.classList.add('grab'); }
}, 700);
later(function () { tsOverlayClose(); }, ms);
}
function tsOverlayClose() {
var el = $('ts-over');
var d = S.duel;
if (d) d.tsOverlayUntil = 0;
if (!el) return;
el.classList.remove('go');
el.classList.remove('grab');
el.hidden = true;
}
function petFreeLink_ppyak() {
var d = S.duel;
if (!d || d.down) return false;
var until = now() + DUEL_PPYAK_FREELINK_MS;
if (until > d.freeLinkUntil) d.freeLinkUntil = until;
setAppClass('freelink', true);
later(function () {
if (!connFreeOn()) setAppClass('freelink', false);
}, DUEL_PPYAK_FREELINK_MS + 40);
clearHints();
d.idleAt = now() + DUEL_IDLE_MS;
J.sfx.petBell();
J.screenPulse();
J.vignette(0.18);
hitStop(HITSTOP_LIGHT_MS);
J.vibrate(30);
if (typeof window !== 'undefined') {
J.floatText(window.innerWidth / 2, window.innerHeight * 0.50,
t('pet.freelink.go'), '#FFD84D', 28);
}
toast(t('duel.petppyak', { n: Math.round(DUEL_PPYAK_FREELINK_MS / 1000) }));
return true;
}
function petInkRepaint_mukmul() {
var d = S.duel, i;
if (!d || d.down || S.busy) return false;
var live = [];
for (i = 0; i < S.cells.length; i++) {
var c = S.cells[i];
if (c && !c.dead && c.sp !== 'block' && !(c.ice > 0)) live.push(i);
}
if (live.length < 2) { toast(t('duel.petempty')); J.sfx.fail(); return false; }
var freq = Object.create(null), best = -1, bestN = -1;
for (i = 0; i < live.length; i++) {
var v = S.cells[live[i]].v;
freq[v] = (freq[v] | 0) + 1;
if (freq[v] > bestN) { bestN = freq[v]; best = v; }
}
if (best < 0) { toast(t('duel.petempty')); J.sfx.fail(); return false; }
var pool = [];
for (i = 0; i < live.length; i++) {
if (S.cells[live[i]].v !== best) pool.push(live[i]);
}
if (!pool.length) { toast(t('duel.petempty')); J.sfx.fail(); return false; }
shuffleSeeded(pool, battleRng());
var take = Math.min(DUEL_MUKMUL_REPAINT, pool.length);
for (i = 0; i < take; i++) {
S.cells[pool[i]].v = best;
if (S.cells[pool[i]].mask) delete S.cells[pool[i]].mask;
}
clearSelection();
clearHints();
renderAll();
d.idleAt = now() + DUEL_IDLE_MS;
J.sfx.petBell();
shakeScreen(1);
J.vibrate(26);
if (typeof window !== 'undefined') {
J.shockwave(window.innerWidth / 2, window.innerHeight * 0.55, '#5B4B9E');
}
toast(t('duel.petmukmul', { n: take, v: best }));
return true;
}
function petGoldFruit_kkultteok() {
var d = S.duel, i;
if (!d || d.down || S.busy) return false;
var pool = [];
for (i = 0; i < S.cells.length; i++) {
var c = S.cells[i];
if (c && !c.dead && !c.sp && !(c.ice > 0)) pool.push(i);
}
if (!pool.length) { toast(t('duel.petempty')); J.sfx.fail(); return false; }
shuffleSeeded(pool, battleRng());
var take = Math.min(DUEL_KKULTTEOK_GOLD, pool.length);
for (i = 0; i < take; i++) S.cells[pool[i]].sp = 'gold';
clearHints();
renderAll();
J.sfx.gold();
J.sfx.petBell();
shakeScreen(1);
J.vibrate(26);
if (typeof window !== 'undefined') {
J.shockwave(window.innerWidth / 2, window.innerHeight * 0.55, '#F2B822');
}
toast(t('duel.petkkultteok', { n: take }));
return true;
}
function petCleanse_bangul() {
var d = S.duel, i;
if (!d || d.down || S.busy) return false;
var mn = bossMaskClear();
var pool = [];
for (i = 0; i < S.cells.length; i++) {
var c = S.cells[i];
if (!c || c.dead) continue;
if (c.sp === 'block' || c.ice > 0) pool.push(i);
}
if (!pool.length && mn <= 0) { toast(t('duel.petclean0')); J.sfx.fail(); return false; }
shuffleSeeded(pool, battleRng());
var take = Math.min(DUEL_BANGUL_CLEAN, pool.length);
for (i = 0; i < take; i++) {
var cc = S.cells[pool[i]];
if (cc.ice > 0) { cc.ice = 0; delete cc.sp; }
else { cc.dead = true; delete cc.sp; }
}
clearSelection();
clearHints();
renderAll();
d.idleAt = now() + DUEL_IDLE_MS;
J.sfx.petBell();
J.screenPulse();
shakeScreen(1);
J.vibrate(26);
if (typeof window !== 'undefined') {
J.shockwave(window.innerWidth / 2, window.innerHeight * 0.55, '#7EC8F0');
}
toast(t('duel.petbangul', { n: take + mn }));
return true;
}
var PET2_SWEEP_POP = 7;      // 썩싹이 — 74: 레버 실효 7칸을 굳힘(스펙 §E-3)
var PET2_BANJJAK_GAUGE = 50; // 반짝이 — 74: 레버 실효 +48% 를 굳혀 +50%(게이지 100 중 — 화면 단위는 %, 점검 W18)(스펙 §E-3)
function petSweep_sseokssak() {
var ok = petPeck(PET2_SWEEP_POP, 'duel.petsseokssak');
if (ok && S.duel) S.duel.quakeGuard = 1;
return ok;
}
function petSparkGauge_banjjak() {
var dd = S.duel;
if (!dd || dd.down) return false;
if (store.gauge >= SKILL_MAX) { toast(t('skill.ready')); J.sfx.fail(); return false; }
var gpct = petPowN(PET2_BANJJAK_GAUGE);
var add = Math.round(SKILL_MAX * gpct / 100);
store.gauge = clamp(store.gauge + add, 0, SKILL_MAX);
syncSkill();
J.sfx.petBell();
J.sfx.tierUp(3);
J.screenPulse();
J.vignette(0.18);
hitStop(HITSTOP_LIGHT_MS);
J.vibrate(30);
if (typeof window !== 'undefined') {
J.shockwave(window.innerWidth / 2, window.innerHeight * 0.55, '#B98CFF');
J.floatText(window.innerWidth / 2, window.innerHeight * 0.50,
'+' + gpct + '%', '#D9BBFF', 30);
}
toast(t('duel.petbanjjak', { n: gpct }));
return true;
}
var PET_SKILL = {
mungchi: petShield,
mongle:  petFreeze4s_mongle,
churup:  petRowShuffle_churup,
ppyak:     petFreeLink_ppyak,
tiktok:    petTimestop_tiktok,
mukmul:    petInkRepaint_mukmul,
kkultteok: petGoldFruit_kkultteok,
bangul:    petCleanse_bangul,
sseokssak: petSweep_sseokssak,
banjjak:   petSparkGauge_banjjak
};
function duelPetFx() {
var el = battleOn() ? $('btn-undo') : $('mate');
if (!el || !el.classList) return;
el.classList.remove('petgo');
void el.offsetWidth;
el.classList.add('petgo');
later(function () { el.classList.remove('petgo'); }, 620);
}
function doAwaken() { fireSkill(); }
function setActLabel(btn, key, ariaKey) {
if (!btn) return;
var lab = btn.querySelector ? btn.querySelector('.act-t') : null;
var lv = t(key), av = t(ariaKey);                      /* perf-0908: 같은 값 쓰기 생략 */
if (lab && lab.textContent !== lv) lab.textContent = lv;
if (btn.getAttribute('aria-label') !== av) btn.setAttribute('aria-label', av);
}
function resetActLabel(btn) {
if (!btn) return;
var lab = btn.querySelector ? btn.querySelector('.act-t') : null;
if (lab) { var k = lab.getAttribute('data-i18n'); if (k) lab.textContent = t(k); }
var ak = btn.getAttribute('data-i18n-aria');
if (ak) btn.setAttribute('aria-label', t(ak));
}
var actBattleLabels = false;
function setHaloK(btn, k) {
if (!btn || !btn.style) return;
var v = String(Math.round(clamp(k, 0, 1) * 100) / 100);
if (btn.__ahK !== v) { btn.__ahK = v; btn.style.setProperty('--ah-k', v); }
}
function syncBattleActs(ba, bh, bu, bsh) {
var d = S.duel;
if (!d) return;
var spFull = d.me.sp >= d.me.spMax;
var gFull = gaugeFull() && !S.skillKind;
var petOk = (d.petLeft | 0) > 0 && !!mateId();
var awk = awakenOn();
setText('hint-badge', awk ? awakenBadgeText() : (duelSpPct() + '%'));
setText('undo-badge', d.petLeft | 0);
setText('shuffle-badge', duelGaugePct() + '%');
if (ba) { setCls(ba, 'off', false); setCls(ba, 'urge', false); }
if (bh) { setCls(bh, 'off', !spFull && !awk); setCls(bh, 'urge', spFull && !awk); }
if (bu) { setCls(bu, 'off', !petOk); setCls(bu, 'urge', false); }
if (bsh) {
setCls(bsh, 'off', !gFull);
setCls(bsh, 'urge', gFull);
setCls(bsh, 'primed', gaugeFull() && !!S.skillKind);
}
setHaloK(bh, duelSpPct() / 100);
setHaloK(bu, 0);
setHaloK(bsh, duelGaugePct() / 100);
setAppClass('skill-full', gFull);
setActLabel(bh, 'act.special', 'aria.special');
setActLabel(bu, 'act.pet', 'aria.pet');
setActLabel(bsh, 'act.awaken', 'aria.awaken');
if (duelSpPct() >= HOWTO_ULT_PCT) howtoOnce('ult', 'howto.ult', true);
if (gFull) howtoOnce('awaken', 'howto.awaken', true);
}
function advPlan(n) {
var st = (n | 0) < 1 ? 1 : (n | 0);
var seed = advSeedOf(st);                 /* ★ ⑦ P2 — 식은 그대로, 자리만 하나로 */
var rng = mulberry32(seed);
var cells = extBoardSize(st);
var par = advPar(st);
var pct = advDensityPct(st);
var density0 = advPctToDensity(pct);
var goal = advGoalFor(st, par, cells, rng, seed, density0);
var mission = advMissionFor(st, cells, seed);
var bd = bossDefOf(st);
var sec = bd ? Math.round(advBase(st).sec * BOSS_TIME_K)
: Math.round(advBase(st).sec);
return {
n: st, seed: seed, chapter: advChapter(st), theme: advThemeIdx(st),
boss: advIsBoss(st), bossDef: bd, intro: (st % 5 === 0 && !advIsBoss(st)),
pct: pct, density: density0, sec: sec,
hand: advHand(st), par: par, goal: goal, mission: mission,
hero: bd ? bd.hero : advRecommend(goal, mission)
};
}
function heartsTick() {
var t0 = Date.now();
// 기기 시계가 뒤로 갔을 때(수동 변경·시간대). 미래의 기준점은 의미가 없다.
if (store.heartAt > t0) { store.heartAt = t0; persist(); }
if (!store.heartAt) { store.heartAt = t0; persist(); }
if (store.hearts >= HEART_MAX) {
if (store.heartAt !== t0) { store.heartAt = t0; persist(); }
return store.hearts;
}
var grew = Math.floor((t0 - store.heartAt) / HEART_MS);
if (grew > 0) {
var take = Math.min(grew, HEART_MAX - store.hearts);
store.hearts += take;
store.heartAt += take * HEART_MS;
if (store.hearts >= HEART_MAX) store.heartAt = t0;
persist();
}
return store.hearts;
}
function heartNextMs() {
heartsTick();
if (store.hearts >= HEART_MAX) return 0;
return Math.max(0, store.heartAt + HEART_MS - Date.now());
}
function heartWaitMs() { return store.hearts >= HEART_MAX ? 0 : Math.max(0, (Number(store.heartAt) || 0) + HEART_MS - Date.now()); }
function spendHeart() {
heartsTick();
if (store.hearts <= 0) return false;
if (store.hearts >= HEART_MAX) store.heartAt = Date.now();
store.hearts -= 1;
persist();
return true;
}
function grantHearts(n) {
heartsTick();
store.hearts += (n | 0);
persist();
}
function fmtHeartWait(ms) {
var s = Math.ceil(ms / 1000);
var m = Math.floor(s / 60);
var r = s % 60;
return m + ':' + (r < 10 ? '0' : '') + r;
}
function jewelBalance() { return store.jewel | 0; }
function jewelAmountOk(n) {
return (typeof n === 'number') && isFinite(n) && n === Math.floor(n) && n > 0;
}
function jewelGrant(n, reason) {
if (!jewelAmountOk(n)) return false;
store.jewel = Math.max(0, Math.min(JEWEL_MAX, jewelBalance() + n)) | 0;
persist();
paintShopBalance();
return true;
}
function jewelSpend(n, reason) {
if (!jewelAmountOk(n)) return false;
var have = jewelBalance();
if (have < n) return false;
store.jewel = have - n;
persist();
paintShopBalance();
return true;
}
function paintShopBalance() {
setText('shop-jewel', jewelBalance());
setText('shop-jstar', store.jstar | 0);
setText('shop-jewel-menu', jewelBalance());
}
var COIN_MAX = 999999;
var STAR_MAX = 999999;         /* 별 잔액 상한 — COIN_MAX · V74_NUM_CAP · SHARD_HOLD_MAX 와 같은 값 가족(수정 1회차 M3 판정 b). 실제 플레이로는
닿지 않는 값이라 손상 저장만 막는다: starGrant 가 여기서 멈추고 readStore 의 별 읽기도 같은 clamp */
var GACHA_ITEM_PITY = 60;      /* 영웅 없이 60회 → 61번째 영웅(스펙 §4-b) */
var GACHA_GOLD_PITY = 9;       /* 영웅 없이 9회 → 10번째 영웅 */
var GACHA_LOG_MAX = 50;        /* 뽑기 결과 기록 — 분쟁 대비(스펙 §4-f ⑤) */
var GACHA_FRIEND_IDS = ['mongle', 'tiktok', 'churup', 'kkultteok', 'sseokssak', 'mukmul', 'banjjak', 'bangul', 'jelly'];
var GACHA_REFUND = { common: 30, rare: 80, epic: 250 };   /* 최고 레벨 장비가 또 나오면 코인(스펙 §4-b) */
var P3_AD_IDS = ['coin', 'item', 'star', 'heart', 'x2'];   /* 하루 칸 — friend 만 주 칸 */
var P3_AD_CAP = { coin: 3, item: 3, star: 2, heart: 3, x2: 10, friend: 1 };
var P3_DEAL_IDS = ['gift', 'gearC', 'gearR', 'heart1', 'trade', 'heartfull'];
var P3_DEAL_CAP = { gift: 1, gearC: 1, gearR: 1, heart1: 5, trade: 3, heartfull: 1 };
function coinBalance() { return clamp(Math.floor(Number(store.coin) || 0), 0, COIN_MAX); }
function coinGrant(n, reason) {
if (!jewelAmountOk(n)) return false;
store.coin = Math.min(COIN_MAX, coinBalance() + n);
persist();
paintWallets();
return true;
}
function coinSpend(n, reason) {
if (!jewelAmountOk(n)) return false;
var have = coinBalance();
if (have < n) return false;
store.coin = have - n;
persist();
paintWallets();
return true;
}
function starGrant(n, reason) {
if (!jewelAmountOk(n)) return false;
store.jstar = Math.min(STAR_MAX, (store.jstar | 0) + n);   /* 상한에서 멈춘다 — 실제 증가분은 잔액 차로 읽는다(반환은 참/거짓, M2 와 같은 규칙) */
persist();
paintWallets();
return true;
}
function starSpend(n, reason) {
if (!jewelAmountOk(n)) return false;
var have = store.jstar | 0;
if (have < n) return false;
store.jstar = have - n;
persist();
paintWallets();
return true;
}
function paintChipText(id, s) {
var el = $(id);
setText(id, s);
if (el && el.getAttribute('data-len') !== String(s.length)) el.setAttribute('data-len', String(s.length));
}
function paintCoinChip(id) { paintChipText(id, arcComma(coinBalance())); }
function paintWallets() {
paintCoinChip('sh-coin-v');   /* 상점 띠 코인도 큰 수 줄임(data-len 6·7 — 지휘자 판정 2026-10-06, 왕국·지도 칩과 같은 도우미) */
paintChipText('sh-star-v', arcComma(store.jstar | 0));   /* [판정판 121 Task 4] 상점 위 바 = 공용 위 바 — 별 캡슐도 메인 · 지도처럼 data-len 단계 */
paintCoinChip('kd-top-stars-v'); paintCoinChip('map-stars-v'); paintChipText('kd-top-star-v', arcComma(store.jstar | 0));   /* [116] 별 캡슐 = 위 바 */
paintChipText('map-star-v', arcComma(store.jstar | 0));   /* [판정판 121] 지도 위 바 별 캡슐(공용 위 바 — 메인과 같은 구성) */
}
function grantItemOrRefund(id, src) {
var it = itemById(id);
if (!it || it.enabled === false) return null;
var had = (store.items && store.items.own) ? (store.items.own[id] | 0) : 0;
if (had >= ITEM_LV_MAX) {
var back = GACHA_REFUND[it.tier] | 0, before = coinBalance();
if (back > 0) coinGrant(back, 'refund');
return { id: id, tier: it.tier, lv: had, lv0: had, isNew: false, max: true, refund: coinBalance() - before };
}
var g = grantItem(id, src);
if (!g) return null;
return { id: id, tier: it.tier, lv: g.lv, lv0: had, isNew: !!g.isNew, max: false, refund: 0 };
}
function p3Int(v, hi) { return clamp(Math.floor(Number(v) || 0), 0, hi); }
function p3Day(v) { return (typeof v === 'string' && /^\d{8}$/.test(v)) ? v : ''; }
function gachaStateFrom(g) {
var o = (g && typeof g === 'object') ? g : {};
var out = {
itemPity: p3Int(o.itemPity, GACHA_ITEM_PITY), goldPity: p3Int(o.goldPity, GACHA_GOLD_PITY),
freeDay: p3Day(o.freeDay), firstItem: o.firstItem ? 1 : 0, firstFriend: o.firstFriend ? 1 : 0,
happy: o.happy ? 1 : 0, petSrc: {}, dupPaid: {}, log: []
};
var k, i, e;
if (o.petSrc && typeof o.petSrc === 'object') {
for (k in o.petSrc) {
if (!Object.prototype.hasOwnProperty.call(o.petSrc, k) || GACHA_FRIEND_IDS.indexOf(k) < 0) continue;
if (o.petSrc[k] === 'gacha' || o.petSrc[k] === 'gift') out.petSrc[k] = o.petSrc[k];
}
}
if (o.dupPaid && typeof o.dupPaid === 'object') {
for (k in o.dupPaid) {
if (Object.prototype.hasOwnProperty.call(o.dupPaid, k) && GACHA_FRIEND_IDS.indexOf(k) >= 0 && o.dupPaid[k]) out.dupPaid[k] = 1;
}
}
if (Array.isArray(o.log)) {
for (i = Math.max(0, o.log.length - GACHA_LOG_MAX); i < o.log.length; i++) {
e = o.log[i];
if (e && typeof e === 'object' && typeof e.k === 'string' && Array.isArray(e.r)) {
out.log.push({ t: Math.floor(Number(e.t) || 0), k: e.k, h: String(e.h || ''), r: e.r.slice(0, 10).map(String) });
}
}
}
return out;
}
function adCapsFrom(a) {
var o = (a && typeof a === 'object') ? a : {};
var n = (o.n && typeof o.n === 'object') ? o.n : {};
var w = (o.w && typeof o.w === 'object') ? o.w : {};
var out = { day: p3Day(o.day), week: p3Day(o.week), n: {}, w: { friend: p3Int(w.friend, P3_AD_CAP.friend) } };
for (var i = 0; i < P3_AD_IDS.length; i++) out.n[P3_AD_IDS[i]] = p3Int(n[P3_AD_IDS[i]], P3_AD_CAP[P3_AD_IDS[i]]);
return out;
}
function dealsFrom(d) {
var o = (d && typeof d === 'object') ? d : {};
var b = (o.b && typeof o.b === 'object') ? o.b : {};
var out = { day: p3Day(o.day), b: {} };
for (var i = 0; i < P3_DEAL_IDS.length; i++) out.b[P3_DEAL_IDS[i]] = p3Int(b[P3_DEAL_IDS[i]], P3_DEAL_CAP[P3_DEAL_IDS[i]]);
return out;
}
function coinCapsFrom(c) {
var o = (c && typeof c === 'object') ? c : {};
return { day: p3Day(o.day), re: p3Int(o.re, COIN_RE_DAY_MAX), dOver: p3Int(o.dOver, COIN_DAILY_OVER_DAY_MAX) };
}
function gachaShapeOk(g) {
return !!g && typeof g === 'object' && typeof g.itemPity === 'number' && typeof g.goldPity === 'number' && typeof g.freeDay === 'string'
&& !!g.petSrc && typeof g.petSrc === 'object' && !!g.dupPaid && typeof g.dupPaid === 'object' && Array.isArray(g.log);
}
function adCapsShapeOk(a) {
if (!a || typeof a !== 'object' || !a.n || typeof a.n !== 'object' || !a.w || typeof a.w !== 'object') return false;
for (var i = 0; i < P3_AD_IDS.length; i++) { if (typeof a.n[P3_AD_IDS[i]] !== 'number') return false; }
return typeof a.w.friend === 'number' && typeof a.day === 'string' && typeof a.week === 'string';
}
function dealsShapeOk(d) {
if (!d || typeof d !== 'object' || !d.b || typeof d.b !== 'object' || typeof d.day !== 'string') return false;
for (var i = 0; i < P3_DEAL_IDS.length; i++) { if (typeof d.b[P3_DEAL_IDS[i]] !== 'number') return false; }
return true;
}
function coinCapsShapeOk(c) {
return !!c && typeof c === 'object' && typeof c.day === 'string' && typeof c.re === 'number' && typeof c.dOver === 'number';
}
function p3Ensure() {
if (typeof store.coin !== 'number' || !isFinite(store.coin)) store.coin = 0;
if (!gachaShapeOk(store.gacha)) store.gacha = gachaStateFrom(store.gacha);
if (!adCapsShapeOk(store.adCaps)) store.adCaps = adCapsFrom(store.adCaps);
if (!dealsShapeOk(store.deals)) store.deals = dealsFrom(store.deals);
if (!coinCapsShapeOk(store.coinCaps)) store.coinCaps = coinCapsFrom(store.coinCaps);
}
function p3Roll() {
p3Ensure();
var d = todayKey(), wk = weekKey(), i;
if (store.adCaps.day !== d) { store.adCaps.day = d; for (i = 0; i < P3_AD_IDS.length; i++) store.adCaps.n[P3_AD_IDS[i]] = 0; }
if (store.adCaps.week !== wk) { store.adCaps.week = wk; store.adCaps.w.friend = 0; }
if (store.deals.day !== d) { store.deals.day = d; for (i = 0; i < P3_DEAL_IDS.length; i++) store.deals.b[P3_DEAL_IDS[i]] = 0; }
if (store.coinCaps.day !== d) { store.coinCaps.day = d; store.coinCaps.re = 0; store.coinCaps.dOver = 0; }
}
var COIN_ADV_FIRST = 20, COIN_ADV_FIRST_STAR = 10;   /* 모험 첫 클리어 20 + 별 하나당 10 */
var COIN_ADV_RE = 10, COIN_ADV_RE_STAR = 5;          /* 다시 깨면 10 + 별 하나당 5 */
var COIN_RE_DAY_MAX = 10, COIN_DAILY_OVER_DAY_MAX = 1;   /* 반복 코인 하루 한도 — 다시 깨기 10판 · 데일리 게임오버 1번(판정판 102 ① · 사용자 2026-10-10) */
var COIN_BOSS_MULT = 2;                               /* 보스탄 첫 클리어만(스펙 §4-f 괄호 자리) */
var COIN_RUN = [15, 25, 40];
function coinForAdv(first, stars, boss) {
var s = clamp(stars | 0, 0, 3);
if (!first) return COIN_ADV_RE + COIN_ADV_RE_STAR * s;                                /* 재클리어 — 보스도 ×1 */
return (COIN_ADV_FIRST + COIN_ADV_FIRST_STAR * s) * (boss ? COIN_BOSS_MULT : 1);    /* 첫 클리어 — 보스 ×2 */
}
function coinForRank(rank) { return rank === 1 ? COIN_RUN[2] : (rank > 1 ? COIN_RUN[1] : COIN_RUN[0]); }
function coinForArc(fresh, clear) { return fresh ? COIN_RUN[2] : (clear ? COIN_RUN[1] : COIN_RUN[0]); }
function coinPlayed() { return (S.matches | 0) > 0; }
function coinCapTake(k, max) {
p3Roll();
if ((store.coinCaps[k] | 0) >= max) return false;
store.coinCaps[k] = (store.coinCaps[k] | 0) + 1;
return true;
}
function runCoinPay(want) {
if (S.coinRunAt !== S.startedAt) { S.coinRunAt = S.startedAt; S.runCoin = 0; }
if (!coinPlayed()) want = 0;
var pay = Math.max(0, (want | 0) - (S.runCoin | 0));
if (pay > 0) { coinGrant(pay, 'run'); S.runCoin = (S.runCoin | 0) + pay; }
S.gainCoin = pay;
S.x2Token = (S.x2Token | 0) + 1;   /* P3 — 결과 창 2배는 판 끝마다 한 번 */
return pay;
}
function coinRewardItem(n) { return { ico: '●', disc: 'coin', key: 'rw.coin', val: n | 0, rar: 'normal' }; }
var P3_NOTICE_DELAY = 4800;
function toastLeftMs() {
return toastAt ? Math.max(0, toastMs(toastText, toastLines) - (now() - toastAt)) : 0;
}
function p3Notice() {
if (!store.p3 || store.p3.shown || !v74NoticeReady()) return false;
var wait = toastLeftMs();
if (v74DueAt > now()) wait = Math.max(wait, v74DueAt - now());   /* 74 알림 타이머가 아직 안 울렸다 — 그 알림이 먼저 뜨고 나서(수정 1회차 m4) */
if (v74ArcTimer) wait = Math.max(wait, 300);   /* 대전 기록 안내가 이어질 차례 — 그 토스트가 뜨고 걷힐 때까지 */
if (wait > 0) { setTimeout(p3Notice, wait + 120); return false; }   /* 앞 알림을 덮어쓰지 않는다 — 소비는 띄운 그 순간 */
toast(t('p3.walletnote'));
store.p3.shown = 1;
persist();
return true;
}
var SHOP_TABS = ['gacha', 'deals', 'free', 'deco', 'jewel'];
var SHOP_ART = { bg: 1, machine: 1, capsule: 1, coin: 1, tabs: 1 };   /* P3 T12 · [Task 8c] host(상인) 은퇴 */
var SHOP_PAINT = { gacha: function () {}, deals: function () {}, free: function () {}, deco: function () {} };
var SHOP_DOTS = { gacha: function () { return 0; }, deals: function () { return 0; }, free: function () { return 0; } };
var SHOP_ACTS = {};
var shopTab2 = 'gacha';
var shopTick = 0;
function portalAdsOk() { return TW_PORTAL.env === 'crazygames' && TW_PORTAL.canReward(); }
function portalAdsSync() {
try { document.documentElement.setAttribute('data-portal', portalAdsOk() ? 'cg' : 'off'); } catch (e) {}
}
function shopTabOk(k) {
if (SHOP_TABS.indexOf(k) < 0) return false;
if (k === 'free') return portalAdsOk();
if (k === 'jewel') return appGemContinue();
return true;
}
function openShopScreen(tab) {
hubMark();   /* [판정판 121] 연 곳 기억(닫기 = hubReturn) */
heartsTick();
p3Roll();
portalAdsSync();
var want = (tab === 'jewel') ? 'gacha' : tab;
shopTab2 = shopTabOk(want) ? want : 'gacha';
showScreen('screen-shop');
kdAvatarPaint();   /* [Task 8c] 위 바 = 메인과 같은 구성 — 얼굴 · 미션 배지도 메인과 같은 함수가 칠한다(지도에서 열어도) */
questBadges();
shopPaint();
if (shopTick) clearInterval(shopTick);
shopTick = setInterval(shopTickFn, 1000);
if (tab === 'jewel' && shopTabOk('jewel')) openShop();
J.sfx.ui();
}
function shopTickFn() {
var el = $('screen-shop');
if (!el || !el.classList.contains('active')) { clearInterval(shopTick); shopTick = 0; return; }
if (store.hearts < HEART_MAX) heartsTick();   /* 수정 1회차 M-5 — 가득이면 heartsTick 이 매초 heartAt 을 고쳐 저장하므로 회복이 올 수 있을 때만(저장 = 하트가 늘 때만) */
paintShopHearts();
var clk = $('sh-clock');
if (clk) clk.textContent = shopClockText();
}
function closeShopScreen() {
if (shopTick) { clearInterval(shopTick); shopTick = 0; }
J.sfx.ui();
hubReturn();   /* [판정판 121] 연 곳으로(지도 아래 줄에서 열었으면 지도 · 그 밖은 메인) — 옛: enterKingdom() */
}
function setShopTab(tab) {
if (tab === 'jewel') { if (shopTabOk('jewel')) openShop(); return; }
if (!shopTabOk(tab) || tab === shopTab2) return;
shopTab2 = tab;
shopPaint();
J.sfx.ui();
}
function shopActive() { var el = $('screen-shop'); return !!(el && el.classList && el.classList.contains('active')); }
function paintShopHearts() {
setText('sh-hearts-v', store.hearts | 0);
var ht = $('sh-heart-t');
if (ht) { var ms = heartWaitMs(); ht.textContent = ms > 0 ? fmtHeartWait(ms) : t('adv.heartfull'); }
}
function msToMidnight() {
var n = new Date(), m = new Date(n.getFullYear(), n.getMonth(), n.getDate() + 1);
return Math.max(0, m.getTime() - n.getTime());
}
function shopClockText() {
var ms = msToMidnight();
return t('time.hm', { h: Math.floor(ms / 3600000), m: Math.floor((ms % 3600000) / 60000) });
}
function shopPaint() {
var root = $('screen-shop');
if (!root) return;
portalAdsSync();
if (!shopTabOk(shopTab2)) shopTab2 = 'gacha';   /* 세션 중 광고가 막히면(애드블록·Basic) 무료 탭에 남지 않는다 */
root.setAttribute('data-stab', shopTab2);
var art = [], k;
for (k in SHOP_ART) if (Object.prototype.hasOwnProperty.call(SHOP_ART, k) && SHOP_ART[k]) art.push(k);
root.setAttribute('data-art', art.join(' '));
document.documentElement.setAttribute('data-shop-art', art.join(' '));   /* #modal-gres 용 */
var tabs = root.querySelectorAll('.sh-tab');
for (var i = 0; i < tabs.length; i++) {
var on = tabs[i].getAttribute('data-stab') === shopTab2;
tabs[i].setAttribute('aria-selected', on ? 'true' : 'false');
if (on) tabs[i].removeAttribute('data-variant'); else tabs[i].setAttribute('data-variant', 'soft');
}
var panel = $('sh-body');
if (panel) panel.setAttribute('aria-labelledby', 'sh-tab-' + shopTab2);   /* 수정 1회차 M-3 — 판(tabpanel)의 이름 = 선택된 탭 */
paintShopTab(shopTab2, true);   /* 전체 다시 그리기 = 탭 하나 다시 그리기 + 스크롤 처음으로(열기·탭 전환) — 수정 1회차 M-2 */
}
function paintShopTab(tab, resetScroll) {
var root = $('screen-shop');
if (!root) return;
tab = tab || shopTab2;
if (tab !== shopTab2) { setShopTab(tab); return; }
var body = $('sh-body');
var keep = (body && !resetScroll) ? body.scrollTop : 0;
if (body) {
body.innerHTML = '';
(SHOP_PAINT[tab] || SHOP_PAINT.gacha)(body);
if (keep) body.scrollTop = keep;
}
paintWallets();
paintShopHearts();
shopDots();
applyI18n(root);
try { if (window.TW && window.TW.applyPlatformGates) window.TW.applyPlatformGates(root); } catch (e) {}
shopFitCards();   /* [Task 8c] 글이 3열 카드에 안 들면 그 탭만 1열 가로 카드 */
}
function shopAct2(a, el) {
var i = a.indexOf(':'), name = i < 0 ? a : a.slice(0, i), arg = i < 0 ? '' : a.slice(i + 1);
if (SHOP_ACTS[name]) SHOP_ACTS[name](arg, el);
}
function shopFreeCount() {
var n = 0, k;
for (k in SHOP_DOTS) {
if (!Object.prototype.hasOwnProperty.call(SHOP_DOTS, k)) continue;
if (k === 'free' && !portalAdsOk()) continue;
n += SHOP_DOTS[k]() | 0;
}
return n;
}
function shopDots() {
var root = $('screen-shop');
if (root) {
var dots = root.querySelectorAll('.sh-tab .sh-dot');
for (var i = 0; i < dots.length; i++) {
var k = dots[i].parentNode.getAttribute('data-stab');
var n = (SHOP_DOTS[k] && (k !== 'free' || portalAdsOk())) ? (SHOP_DOTS[k]() | 0) : 0;
dots[i].textContent = n > 0 ? String(n) : '';
dots[i].hidden = !(n > 0);
}
}
var c = shopFreeCount();
['kd-shop-badge', 'map-shop-badge'].forEach(function (id) {
var b = $(id);
if (b) { b.textContent = c > 0 ? String(c) : ''; b.hidden = !(c > 0); }
});
}
var DEAL_GIFT_COIN = 100;                      /* 매일 선물 */
var DEAL_GEAR_PRICE = { common: 300, rare: 900 };
var DEAL_HEART1 = 60;                          /* 하트 1개 — 하루 5 */
var DEAL_TRADE = { coin: 500, star: 5 };       /* 코인 500 → 별 5 — 하루 3 */
var DEAL_HEARTFULL = 250;                      /* 하트 가득 — 하루 1 */
var DEAL_SALT = { common: 0x5EED01, rare: 0x5EED02 };
function dealGearOf(tier) {
var pool = [], i;
for (i = 0; i < ITEM_POOL.length; i++) if (ITEM_POOL[i].tier === tier && ITEM_POOL[i].enabled !== false) pool.push(ITEM_POOL[i].id);
if (!pool.length) return '';
var r = mulberry32((parseInt(todayKey(), 10) ^ DEAL_SALT[tier]) >>> 0)();
return pool[Math.min(pool.length - 1, Math.floor(r * pool.length))];
}
function dealLeft(k) { p3Roll(); return Math.max(0, (P3_DEAL_CAP[k] | 0) - (store.deals.b[k] | 0)); }
function dealBuy(k) {
if (dealLeft(k) <= 0) return { err: 'limit' };
var price = 0, gear = '', tier = '';
if (k === 'gearC' || k === 'gearR') {
tier = (k === 'gearC') ? 'common' : 'rare';
gear = dealGearOf(tier);
if (!gear || ((store.items.own[gear] | 0) >= ITEM_LV_MAX)) return { err: 'max' };
price = DEAL_GEAR_PRICE[tier];
} else if (k === 'heart1') price = DEAL_HEART1;
else if (k === 'trade') price = DEAL_TRADE.coin;
else if (k === 'heartfull') {
heartsTick();
if ((store.hearts | 0) >= HEART_MAX) return { err: 'full' };
price = DEAL_HEARTFULL;
} else if (k !== 'gift') return { err: 'bad' };
if (price > 0 && coinBalance() < price) return { err: 'coin', need: price - coinBalance() };
var got = null;
if (k === 'gift') { coinGrant(DEAL_GIFT_COIN, 'deal-gift'); got = { coin: DEAL_GIFT_COIN }; }
else {
if (!coinSpend(price, 'deal-' + k)) return { err: 'coin', need: price - coinBalance() };
if (gear) got = grantItemOrRefund(gear, 'shop');
else if (k === 'heart1') { grantHearts(1); got = { heart: 1 }; }
else if (k === 'trade') { starGrant(DEAL_TRADE.star, 'deal-trade'); got = { star: DEAL_TRADE.star }; }
else { store.hearts = HEART_MAX; store.heartAt = Date.now(); got = { heartfull: 1 }; }
}
store.deals.b[k] = (store.deals.b[k] | 0) + 1;
persist();
return { ok: true, got: got };
}
function shopBtn(o) {
var b = document.createElement('button');
b.type = 'button';
b.className = 'cta-jelly sh-btn';
b.setAttribute('data-price', o.price || 'ok');
var ic = function () { var ci = document.createElement('i'); ci.className = 'sh-btn-ic sh-btn-ic--' + o.coinIc; ci.setAttribute('aria-hidden', 'true'); b.appendChild(ci); };
if (o.amt) { b.appendChild(document.createTextNode(o.label)); if (o.coinIc) ic(); b.appendChild(document.createTextNode(o.amt)); }
else { if (o.coinIc) ic(); b.appendChild(document.createTextNode(o.label)); }
if (o.portal) b.setAttribute('data-portal-only', '');
if (o.dis) b.disabled = true; else if (o.act) b.setAttribute('data-sh-act', o.act);
return b;
}
function shopCard2(o) {
var card = document.createElement('div');
card.className = 'shop-card';
card.setAttribute('data-part', 'shop-card');
card.setAttribute('data-layout', o.layout || 'grid');
if (o.tier) card.setAttribute('data-tier', o.tier);
var cb = document.createElement('span'); cb.className = 'shop-cbody';
var hd = document.createElement('b'); hd.className = 'shop-cn'; hd.textContent = o.title; cb.appendChild(hd);
if (o.badge) { var bd = document.createElement('em'); bd.className = 'shop-badge'; bd.textContent = o.badge; card.appendChild(bd); }
if (o.odds) {
var od = document.createElement('button'); od.type = 'button'; od.className = 'kit-pill-v2 sh-odds'; od.setAttribute('data-variant', 'soft');
od.setAttribute('data-sh-act', o.odds); od.textContent = t('gacha.odds.s'); card.appendChild(od);
}
var box = document.createElement('span'); box.className = 'shop-icbox';   /* 그림 + 지급 수 — 지급 수는 그림 상자 오른쪽 아래에 붙는다(제목이 두 줄로 접혀도 같은 자리, 리뷰 M-4) */
if (o.tile) box.appendChild(o.tile);
else {
var ic = document.createElement('i'); ic.className = 'shop-ic ' + (o.ic || ''); ic.setAttribute('aria-hidden', 'true');
if (o.icCss) ic.style.setProperty('background-image', o.icCss);
box.appendChild(ic);
}
if (o.qty) { var q = document.createElement('span'); q.className = 'shop-qty'; q.textContent = o.qty; box.appendChild(q); }
card.appendChild(box);
if (o.sub) { var sb = document.createElement('span'); sb.className = 'shop-cd'; sb.textContent = o.sub; cb.appendChild(sb); }
if (o.prog) { var pg = document.createElement('span'); pg.className = 'kit-pill-v2 sh-prog'; pg.setAttribute('data-variant', 'soft'); pg.textContent = o.prog; cb.appendChild(pg); }
var list = o.btns || [o], bw = document.createElement('span'), pr = null;
bw.className = 'sh-btns';
for (var i = 0; i < list.length; i++) {
if (list[i].pair) { if (!pr) { pr = document.createElement('span'); pr.className = 'sh-pair'; bw.appendChild(pr); } pr.appendChild(shopBtn(list[i])); }
else bw.appendChild(shopBtn(list[i]));
}
cb.appendChild(bw);
card.appendChild(cb);
return card;
}
function shopTextOver(el) {
var r = el.getBoundingClientRect();
if (!(r.width > 0)) return false;
var cs = getComputedStyle(el), rg = document.createRange();
rg.selectNodeContents(el);
var need = rg.getBoundingClientRect().width;
var room = r.width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - parseFloat(cs.borderLeftWidth) - parseFloat(cs.borderRightWidth);
return need > room + 0.5;
}
function shopFitPairs(g) {
var ps = g.querySelectorAll('.sh-pair'), k, j;
for (k = 0; k < ps.length; k++) ps[k].removeAttribute('data-stack');
for (k = 0; k < ps.length; k++) {
var bs = ps[k].querySelectorAll('.sh-btn'), over = false;
for (j = 0; j < bs.length && !over; j++) over = shopTextOver(bs[j]);
if (over) ps[k].setAttribute('data-stack', '1');
}
}
function shopFitCards() {
var body = $('sh-body');
if (!body || !shopActive()) return;
var grids = body.querySelectorAll('.sh-grid');
for (var i = 0; i < grids.length; i++) {
var g = grids[i];
if (g.getAttribute('data-cols')) g.removeAttribute('data-cols');   /* 3열에서 다시 잰다 */
shopFitPairs(g);   /* 나란히 → 안 들면 쌓기 */
var els = g.querySelectorAll('.sh-btn, .sh-prog'), over = false;
for (var j = 0; j < els.length && !over; j++) over = shopTextOver(els[j]);
if (over) { g.setAttribute('data-cols', '1'); shopFitPairs(g); }   /* 1열 가로 카드에서 나란히를 다시 잰다 */
}
}
function shopHead(body, title, pill, playIc) {
var row = document.createElement('div'); row.className = 'sh-hrow';
var h = document.createElement('b'); h.className = 'sh-htitle';
if (playIc) { var pl = document.createElement('i'); pl.className = 'fr-play'; pl.setAttribute('aria-hidden', 'true'); h.appendChild(pl); }
h.appendChild(document.createTextNode(title)); row.appendChild(h);
if (pill) row.appendChild(pill);
body.appendChild(row);
return row;
}
function shopClockPill(pre) {
var p = document.createElement('span'); p.className = 'kit-pill-v2 sh-clockpill'; p.setAttribute('data-variant', 'soft');
if (pre) { var s = document.createElement('span'); s.textContent = pre; p.appendChild(s); }
var clk = document.createElement('b'); clk.id = 'sh-clock'; clk.textContent = shopClockText(); p.appendChild(clk);
return p;
}
SHOP_PAINT.deals = function (body) {
shopHead(body, t('deals.title'), shopClockPill());
var grid = document.createElement('div'); grid.className = 'sh-grid'; body.appendChild(grid);
var lim = function (k) { return (store.deals.b[k] | 0) + '/' + P3_DEAL_CAP[k]; };
var money = function (k, n) { return dealLeft(k) > 0 ? { label: arcComma(n), coinIc: 'coin', price: 'coin', act: 'deal:' + k }
: { label: t('deals.done'), price: 'ok', dis: true }; };
var gC = dealGearOf('common'), gR = dealGearOf('rare');
var cards = [
Object.assign({ title: t('deals.gift'), ic: 'shop-ic-coin', qty: '×' + DEAL_GIFT_COIN, sub: t('deals.gift.d') },
dealLeft('gift') > 0 ? { label: t('deals.claim'), price: 'free', act: 'deal:gift' } : { label: t('deals.done'), price: 'ok', dis: true }),
Object.assign({ title: t('deals.gear'), tier: 'common', tile: itemTile(gC, { tier: 'common', size: 96 }), sub: t('deals.sure', { name: t('item.' + gC + '.nm') }) },
(store.items.own[gC] | 0) >= ITEM_LV_MAX ? { label: t('deals.maxed'), price: 'ok', dis: true } : money('gearC', DEAL_GEAR_PRICE.common)),
Object.assign({ title: t('deals.gear'), tier: 'rare', badge: t('drops.tier.rare'), tile: itemTile(gR, { tier: 'rare', size: 96 }), sub: t('deals.sure', { name: t('item.' + gR + '.nm') }) },
(store.items.own[gR] | 0) >= ITEM_LV_MAX ? { label: t('deals.maxed'), price: 'ok', dis: true } : money('gearR', DEAL_GEAR_PRICE.rare)),
Object.assign({ title: t('deals.heart1'), ic: 'shop-ic-heart', sub: lim('heart1') }, money('heart1', DEAL_HEART1)),
Object.assign({ title: t('deals.trade'), ic: 'shop-ic-jstar-1', qty: '×' + DEAL_TRADE.star, sub: lim('trade') }, money('trade', DEAL_TRADE.coin)),
Object.assign({ title: t('deals.heartfull'), ic: 'shop-ic-heart', sub: lim('heartfull') },
((store.hearts | 0) >= HEART_MAX && dealLeft('heartfull') > 0) ? { label: t('adv.heartfull'), price: 'ok', dis: true } : money('heartfull', DEAL_HEARTFULL))   /* 가득이라 못 사면 「MAX」 · 「내일 다시」 는 한도를 다 쓴 경우만 */
];
for (var i = 0; i < cards.length; i++) grid.appendChild(shopCard2(cards[i]));
var f1 = document.createElement('p'); f1.className = 'sh-fine'; f1.textContent = t('deals.foot'); body.appendChild(f1);
var f2 = document.createElement('p'); f2.className = 'sh-fine'; f2.textContent = t('deals.foot2', { n: P3_DEAL_CAP.trade }); body.appendChild(f2);
};
SHOP_DOTS.deals = function () { return dealLeft('gift') > 0 ? 1 : 0; };
SHOP_ACTS.deal = function (k) {
var r = dealBuy(k);
if (r.ok) {
if (r.got && r.got.coin) toast(t('coin.got', { n: r.got.coin }));
else if (r.got && r.got.star) toast(t('star.got', { n: r.got.star }));
else if (r.got && r.got.id) toast(t('deals.got', { name: t('item.' + r.got.id + '.nm') }));
else if (r.got && (r.got.heart || r.got.heartfull)) toast(t('shop.heart.ok'));   /* 알 수 없는 종류면 토스트 없음 */
J.sfx.win();
} else {
if (r.err === 'coin') toast(t('gacha.nocoin', { n: r.need }));
J.sfx.fail();
}
paintShopTab(shopTab2);   /* 구매 뒤 = 이 탭만 다시(스크롤 자리 유지 · 띠·점·번역을 같이 맞춘다) — 처음으로 돌리는 전체 다시 그리기는 열기·탭 전환만 */
};
SHOP_PAINT.deco = function (body) {   /* [Task 8c] 꾸미기 캡슐 카드 하나 — 뽑기 탭과 같은 카드 · 같은 격자 */
var grid = document.createElement('div'); grid.className = 'sh-grid'; body.appendChild(grid);
grid.appendChild(capsuleCard('skin'));
shopFine(body, t('gacha.skin.note'));
};
var gachaKind = 'item', gachaBusy = false;
function pctText(p, digits) { var k = Math.pow(10, digits); return (Math.round(p * Math.pow(10, digits + 2) * (1 + Number.EPSILON)) / k).toFixed(digits) + '%'; }
function gachaKindSet(k) {
if (GACHA_TAB_KINDS.indexOf(k) < 0) return;   /* [Task 8c] 종류 알약은 은퇴(캡슐 카드 셋이 늘 함께 선다) — 이 함수는 옛 시험 · 도구 호환 API(종류 기억 + 뽑기 탭 다시 그리기)로만 남는다 */
gachaKind = k;
if (shopTab2 === 'gacha' && shopActive()) paintShopTab(shopTab2, true);   /* 종류가 바뀌면 판 내용이 통째로 바뀐다 → 스크롤도 처음으로 */
}
function gachaFailToast(r, elseKey) {
if (r.err === 'coin') toast(t('gacha.nocoin', { n: r.need }));
else if (r.err === 'star') toast(t('gacha.nostar', { n: r.need }));
else if (r.err === 'allfriends') toast(t('gacha.friend.all'));
else if (r.err === 'allskins') toast(t(skinEmptyKey(gachaTable('skin'))));   /* [rc1009] 탭 알약과 같은 문장(지휘자 판정 Q5) */
else if (r.err === 'used') toast(t('gacha.used'));
else if (elseKey) toast(t(elseKey));
}
var gachaQueue = [];
function gachaPlay(res, after) {
if (gachaBusy) { gachaQueue.push({ res: res, after: after }); return; }
gachaBusy = true;
var shown = false, fired = false, end = function () {
if (fired) return;
fired = true;
gachaBusy = false;
if (after) after(true);
var q = gachaQueue.shift();
if (q) gachaPlay(q.res, q.after);
};
try { gachaShow(res, end); shown = true; }
finally { if (!shown) end(); }
}
function gachaRun(kind, n, how) {
if (gachaBusy || adBusyP3) return;
var r = gachaBuy(kind, n, how);
if (!r.ok) { gachaFailToast(r); J.sfx.fail(); return; }
gachaPlay(r, function () { if (shopActive()) paintShopTab(shopTab2); });
}
var gresDone = null, gresAnims = [], gresTimers = [];
var easeTokCache = {}, durTokCache = {};
var GRES_DUR = ['--dur-1', '--dur-2', '--dur-3'], GRES_EASE = ['--ease', '--ease-out', '--drop', '--spring'];
function durTok(name) {
if (durTokCache[name] !== undefined) return durTokCache[name];
var v = 0;
try { v = parseFloat(String(getComputedStyle(document.documentElement).getPropertyValue(name) || '')) || 0; } catch (e) { v = 0; }
durTokCache[name] = v > 0 ? v : 0;
return durTokCache[name];
}
function easeTok(name) {
if (easeTokCache[name] !== undefined) return easeTokCache[name];
var v = '';
try { v = String(getComputedStyle(document.documentElement).getPropertyValue(name) || '').trim(); } catch (e) { v = ''; }
easeTokCache[name] = v || 'linear';
return easeTokCache[name];
}
function gresTokPrime() {
var i;
for (i = 0; i < GRES_DUR.length; i++) durTok(GRES_DUR[i]);
for (i = 0; i < GRES_EASE.length; i++) easeTok(GRES_EASE[i]);
}
function gresAnim(el, frames, dur, ease, delay, fill) {
if (!el || !el.animate) return null;
var a = el.animate(frames, { duration: dur, easing: easeTok(ease), delay: delay || 0, fill: fill || 'both' });
gresAnims.push(a);
return a;
}
function gresClear() {
var i;
for (i = 0; i < gresAnims.length; i++) { try { gresAnims[i].cancel(); } catch (e) {} }
for (i = 0; i < gresTimers.length; i++) clearTimeout(gresTimers[i]);
gresAnims = []; gresTimers = [];
}
function gachaShow(res, done) {
var i, ep = false;
for (i = 0; i < res.items.length; i++) if (res.items[i].tier === 'epic') ep = true;
if (res.kind === 'friend') {
var id = res.items[0].id;
TW_PORTAL.happytime();                          /* 새 친구 = 드문 성취(스펙 §4-d, 최대 9번) */
charGetFx(id, function () {
introPlay(id, function () { if (cgToastMsg) { toast(cgToastMsg); cgToastMsg = ''; } if (done) done(); });
});
return;
}
if (ep && !store.gacha.happy) { store.gacha.happy = 1; persist(); TW_PORTAL.happytime(); }   /* 첫 영웅 한 번만 */
gresDone = done || null;
gresOpen(res);
}
function gresCard(it) {
var li = document.createElement('li');
li.className = 'gres-card';
li.setAttribute('data-tier', it.tier);
li.setAttribute('data-flip', '0');
li.setAttribute('data-how', it.how || '');   /* 천장(pity) · 10회 보장(ten) 칸 표식 — CSS 강조는 뒤 태스크 몫(리뷰 M-9) */
li.innerHTML = '<i class="gres-glow"></i><i class="gres-back"></i><i class="gres-art"></i><b class="gres-new"></b><em class="gres-lv"></em><span class="gres-nm"></span>';
li.querySelector('.gres-new').textContent = it.isNew ? t('gres.new') : '';
li.querySelector('.gres-lv').textContent = (it.isNew || it.skin) ? '' : (it.max ? ((it.refund | 0) > 0 ? t('gres.refund', { n: it.refund }) : '') : t('gres.lvup', { a: it.lv0 | 0, b: it.lv | 0 }));
li.querySelector('.gres-nm').textContent = it.skin ? skinNameOf(it.id) : t('item.' + it.id + '.nm');   /* [rc1009] 꾸미기 캡슐 = 스킨 이름 */
return li;
}
function gresOpen(res) {
gresTokPrime();                                   /* 읽기 먼저(모션 규칙 5) — 아래 DOM 쓰기 뒤에 getComputedStyle 0 */
var d1 = durTok('--dur-1'), d2 = durTok('--dur-2'), d3 = durTok('--dur-3'), reduced = rwReduced();
gresClear();                                      /* 앞 결과의 타이머 · 애니(「10회 더」 로 바로 바꿀 때 — 리뷰 I-1) */
var grid = $('gres-grid'), i, it, li, ten = false, pity = false, epic = false, nNew = 0, nUp = 0, refund = 0, arts = [];
grid.innerHTML = '';
grid.setAttribute('data-n', String(res.items.length));   /* 단발 = 한 장을 가운데 칸에(CSS) — 캡슐이 그 위에서 열린다(지휘자 판정 Q7-c) */
grid.setAttribute('data-ready', reduced ? '1' : '0');   /* 등장 전(투명) 카드는 탭을 무시한다(리뷰 M-7) */
for (i = 0; i < res.items.length; i++) {
it = res.items[i];
li = gresCard(it);
grid.appendChild(li);
arts.push([li.querySelector('.gres-art'), it.skin ? skinThumbCss(it.id) : itemArtCss(it.id, 96)]);   /* [rc1009] 스킨 = art.thumb · 없으면 img */
if (it.how === 'ten') ten = true;
if (it.how === 'pity') pity = true;
if (it.tier === 'epic') epic = true;
if (it.isNew) nNew++; else if (!it.max) nUp++;
refund += it.refund | 0;
}
setText('gres-title', t(res.n > 1 ? 'gres.title10' : 'gres.title1', { n: res.n }));
setText('gres-note', pity ? t('gres.pity.hit') : (ten ? t('gres.ten.up') : ''));
var sum = $('gres-sum'); sum.innerHTML = '';
if (res.kind !== 'skin') ['epic', 'rare', 'common'].forEach(function (tr) {   /* [rc1009] 스킨에는 등급 칩 줄이 없다 */
var n = res.items.filter(function (x) { return x.tier === tr; }).length;
if (!n) return;
var s = document.createElement('span'); s.className = 'gres-s'; s.setAttribute('data-tier', tr); s.setAttribute('data-n', String(n));
var c = document.createElement('b'); c.className = 'gc-chip'; c.textContent = t('drops.tier.' + tr) + ' ' + n; s.appendChild(c);
sum.appendChild(s);
});
var tail = document.createElement('span'); tail.className = 'kit-pill-v2 gres-t'; tail.setAttribute('data-variant', 'soft');
var ts = document.createElement('span'); ts.textContent = res.kind === 'skin' ? t('gres.skin.sum', { a: nNew }) : t('gres.sum', { a: nNew, b: nUp }); tail.appendChild(ts);
if (refund) { var trf = document.createElement('span'); trf.className = 'gres-rf'; trf.textContent = t('gres.refund', { n: refund }); tail.appendChild(trf); }
sum.appendChild(tail);
var tb = gachaTable(res.kind);
setText('gres-pity', epic ? t('gres.pity.reset') : '');   /* 맨숫자 「0」 없는 문장(착수 전 점검 C9) */
var again = $('gres-again'), agN = res.n > 1 ? GACHA_TEN : 1, agP = res.n > 1 ? tb.ten : tb.price, cur = GACHA_CUR[res.kind];
again.textContent = '';
again.appendChild(document.createTextNode(t(res.n > 1 ? 'gres.again10' : 'gres.again1', { n: agN })));
var ic = document.createElement('i'); ic.className = 'sh-btn-ic sh-btn-ic--' + cur; ic.setAttribute('aria-hidden', 'true'); again.appendChild(ic);
again.appendChild(document.createTextNode(arcComma(agP)));
again.setAttribute('data-again', res.kind + ':' + agN + ':' + cur);
var agDis = capLeft(res.kind) && tb.left <= 0;
again.setAttribute('data-price', agDis ? 'ok' : cur);
again.disabled = agDis;
$('gres-all').hidden = res.items.length < 2;
openModal('modal-gres');
J.sfx.ui();
var top = 'common';
for (i = 0; i < res.items.length; i++) if (res.items[i].tier === 'epic' || (res.items[i].tier === 'rare' && top === 'common')) top = res.items[i].tier;
var cap = $('gres-cap'), dim = document.querySelector('#modal-gres > .cut-dim');
cap.setAttribute('data-tier', top);
var paintArts = function () { for (var k = 0; k < arts.length; k++) arts[k][0].style.setProperty('background-image', arts[k][1]); };
if (reduced) {
paintArts();
gresAnim(dim, [{ opacity: 0 }, { opacity: 1 }], 0, '--ease-out', 0);   /* 25행 대체 — 덮개 끝 상태 바로 */
cap.hidden = true; gresOpenAll(true); return;
}
requestAnimationFrame(paintArts);
gresAnim(dim, [{ opacity: 0 }, { opacity: 1 }], d2, '--ease-out', 0);                                                            /* 25 덮개 켜기 */
cap.hidden = false;
gresAnim(cap, [{ transform: 'translateY(-60%)', opacity: 0 }, { transform: 'translateY(0)', opacity: 1 }], d3, '--drop', 0);      /* 19 낙하 */
gresAnim(cap.querySelector('.gres-top'), [{ transform: 'rotate(0)' }, { transform: 'rotate(6deg)' }, { transform: 'rotate(-6deg)' }, { transform: 'rotate(0)' }], d2 * 2, '--ease-out', d3);   /* 20 흔들림 */
gresAnim(cap.querySelector('.gres-light'), [{ opacity: 0 }, { opacity: 1 }, { opacity: 0.6 }], d2 * 2, '--ease-out', d3);       /* 20 빛 */
gresAnim(cap.querySelector('.gres-top'), [{ transform: 'translate(0, 0) rotate(0)', opacity: 1 }, { transform: 'translate(-30%, -60%) rotate(-24deg)', opacity: 0 }], d2, '--spring', d3 + d2 * 2, 'forwards');
var gone = gresAnim(cap.querySelector('.gres-bot'), [{ opacity: 1 }, { opacity: 0 }], d2, '--ease', d3 + d2 * 3, 'forwards');
gresAnim(cap.querySelector('.gres-light'), [{ opacity: 0.6 }, { opacity: 0 }], d2, '--ease', d3 + d2 * 3, 'forwards');
if (gone) gone.onfinish = function () { cap.hidden = true; };
var cards = grid.querySelectorAll('.gres-card'), last = null;
for (i = 0; i < cards.length; i++) last = gresAnim(cards[i], [{ opacity: 0, transform: 'scale(.9)' }, { opacity: 1, transform: 'scale(1)' }], d2, '--ease-out', d3 + d2 * 3 + i * d1 / 2);   /* 24 등장 */
if (last) last.onfinish = function () { grid.setAttribute('data-ready', '1'); };
else grid.setAttribute('data-ready', '1');
}
function gresFlip(li, instant) {
if (!li || li.getAttribute('data-flip') !== '0') return;
if (instant || !li.animate) { li.setAttribute('data-flip', '1'); return; }
var d1 = durTok('--dur-1');
var a = gresAnim(li, [{ transform: 'rotateY(0)' }, { transform: 'rotateY(90deg)' }], d1, '--ease-out', 0);
if (!a) { li.setAttribute('data-flip', '1'); return; }
li.setAttribute('data-flip', 'h');
a.onfinish = function () {
li.setAttribute('data-flip', '1');
gresAnim(li, [{ transform: 'rotateY(90deg)' }, { transform: 'rotateY(0)' }], d1, '--ease-out', 0);
};
J.sfx.ui();
}
function gresOpenAll(instant) {
var cards = document.querySelectorAll('#gres-grid .gres-card'), d1 = durTok('--dur-1'), i;
for (i = 0; i < cards.length; i++) {
if (instant) gresFlip(cards[i], true);
else (function (li, k) { gresTimers.push(setTimeout(function () { gresFlip(li, false); }, k * d1)); })(cards[i], i);
}
}
function gresClose() {
gresClear();
closeModal('modal-gres');
var fn = gresDone; gresDone = null;
if (fn) fn();
}
function gachaFreeBtn(kind) {
var g = store.gacha;
if (kind === 'item' && !g.firstItem) return { label: t('gacha.free.first'), price: 'free', act: 'gbuy:item:1:first' };
if (kind === 'friend' && !g.firstFriend) return { label: t('gacha.free.first'), price: 'free', act: 'gbuy:friend:1:first' };
if (kind === 'item' && g.freeDay !== todayKey()) return { label: t('gacha.free.daily'), price: 'free', act: 'gbuy:item:1:free' };
if (kind === 'item' && adRowOk('item')) return { label: t('gacha.ad'), price: 'ad', coinIc: 'play', act: 'ad:item', portal: true };   /* P3 T9 — 포털 전용 */
if (kind === 'friend' && adRowOk('friend')) return { label: t('gacha.ad.week'), price: 'ad', coinIc: 'play', act: 'ad:friend', portal: true };
return null;
}
function capLeft(kind) { return kind === 'friend' || kind === 'skin'; }
function capRowArt(kind, id) { return kind === 'skin' ? skinThumbCss(id) : (kind === 'friend' ? stdArt(id, 'thumb') : itemArtCss(id, 64)); }
function capRowName(kind, id) { return kind === 'skin' ? skinNameOf(id) : (kind === 'friend' ? t('char.' + id + '.name') : t('item.' + id + '.nm')); }
function capsuleCard(kind) {
var tb = gachaTable(kind), lf = capLeft(kind), dis = lf && tb.left <= 0;
var cur = GACHA_CUR[kind] === 'coin' ? 'coin' : 'star';
var fb = dis ? null : gachaFreeBtn(kind), btns = [];
if (fb) btns.push(fb);
btns.push({ label: t('gacha.btn1'), amt: arcComma(tb.price), coinIc: cur, price: dis ? 'ok' : cur, act: 'gbuy:' + kind + ':1:' + cur, dis: dis, pair: kind === 'item' });   /* 닫힌 단추는 특가 탭처럼 「ok」(연보라) */
if (kind === 'item') btns.push({ label: t('gacha.btn10', { n: GACHA_TEN }), amt: arcComma(tb.ten), coinIc: 'coin', price: 'coin', act: 'gbuy:item:' + GACHA_TEN + ':coin', pair: true });
var sub = dis ? t(kind === 'friend' ? 'gacha.friend.all' : skinEmptyKey(tb)) : t('gacha.' + kind + '.d');
var prog = lf ? t('gacha.' + kind + '.have', { have: tb.all - tb.left, all: tb.all }) : t('gacha.pity', { n: tb.pity, max: tb.pityAt });
var card = shopCard2({ title: t('gacha.' + kind), ic: 'shop-ic-machine-' + kind, sub: sub, prog: prog, odds: 'godds:' + kind, btns: btns });
card.setAttribute('data-kind', kind);
return card;
}
function shopFine(body, s) { var p = document.createElement('p'); p.className = 'sh-fine'; p.textContent = s; body.appendChild(p); return p; }
SHOP_PAINT.gacha = function (body) {
var grid = document.createElement('div'); grid.className = 'sh-grid'; body.appendChild(grid);
for (var i = 0; i < GACHA_TAB_KINDS.length; i++) grid.appendChild(capsuleCard(GACHA_TAB_KINDS[i]));
shopFine(body, t('odds.foot1'));
shopFine(body, t('gacha.friend.note'));
};
SHOP_DOTS.gacha = function () {
p3Ensure();   /* 새 설치는 store.gacha 가 아직 없다 — 왕국 배지가 먼저 이 함수를 부른다 */
var g = store.gacha, n = 0;
if (!g.firstItem) n++;
if (!g.firstFriend && gachaTable('friend').left > 0) n++;
if (g.freeDay !== todayKey()) n++;
return n;
};
SHOP_ACTS.gbuy = function (arg) { var p = arg.split(':'); gachaRun(p[0], parseInt(p[1], 10) || 1, p[2]); };
SHOP_ACTS.godds = function (k) { openOdds(k); };
var oddsKind = 'item';
function oddsRefit() {
var m = $('modal-odds');
if (m && !m.hidden) { oddsFitBox(); return; }
window.removeEventListener('resize', oddsRefit); window.removeEventListener('orientationchange', oddsRefit);
}
function openOdds(kind) {
oddsKind = GACHA_KINDS.indexOf(kind) >= 0 ? kind : 'item';
oddsPaint();
openModal('modal-odds');
oddsFitBox();
window.addEventListener('resize', oddsRefit); window.addEventListener('orientationchange', oddsRefit);
var ob = $('odds-body'); if (ob) ob.scrollTop = 0;
J.sfx.ui();
}
function closeOdds() { closeModal('modal-odds'); oddsRefit(); J.sfx.ui(); }
function oddsRow(cls, id, name, p, art) {
var r = document.createElement('div'); r.className = 'od-row ' + cls; if (id) r.setAttribute('data-id', id);
if (art) { var i = document.createElement('i'); i.className = 'od-ic'; i.style.setProperty('background-image', art); r.appendChild(i); }
var n = document.createElement('span'); n.className = 'od-n'; n.textContent = name; r.appendChild(n);
var v = document.createElement('b'); v.className = 'od-p'; v.textContent = p; r.appendChild(v);
return r;
}
function oddsPaint() {
var tabs = document.querySelectorAll('#odds-tabs .od-tab'), i, tb = gachaTable(oddsKind), fr = oddsKind === 'friend', sk = oddsKind === 'skin', d = (fr || sk) ? 2 : 3;
for (i = 0; i < tabs.length; i++) {
var on = tabs[i].getAttribute('data-otab') === oddsKind;
tabs[i].setAttribute('aria-selected', on ? 'true' : 'false');
if (on) tabs[i].setAttribute('data-active', ''); else tabs[i].removeAttribute('data-active');
}
var trow = $('odds-tabs'); if (trow) trow.hidden = sk;
var b = $('odds-body'); if (!b) return;
b.innerHTML = '';
if (!sk) {   /* 등급 절 — 스킨에는 등급이 없어 절째 뺀다(판정 Q3) */
var s1 = document.createElement('section'); s1.className = 'od-sec';
var h1 = document.createElement('h3'); h1.textContent = t('odds.tier'); s1.appendChild(h1);
for (i = 0; i < tb.tiers.length; i++) {
var tr = oddsRow('od-tier', '', t('odds.tier.row', { n: tb.tiers[i].n, each: pctText(tb.tiers[i].each, d) }), pctText(tb.tiers[i].p, d));
tr.setAttribute('data-tier', tb.tiers[i].tier);
var chip = document.createElement('em'); chip.className = 'gc-chip'; chip.textContent = t('drops.tier.' + tb.tiers[i].tier); tr.insertBefore(chip, tr.firstChild);
s1.appendChild(tr);
}
b.appendChild(s1);
}
var s2 = document.createElement('section'); s2.className = 'od-sec od-list';
var h2 = document.createElement('h3'); h2.textContent = t(fr ? 'odds.friends' : (sk ? 'odds.skins' : 'odds.items')); s2.appendChild(h2);
var box = document.createElement('div'); box.className = 'od-box'; s2.appendChild(box);   /* 높이가 정해진 안쪽 스크롤 상자 — 규칙 절 · 바닥 글이 첫 화면에 들게(리뷰 I-2). 마지막 줄이 반쯤 잘려 보이는 것이 「더 있다」 신호 */
for (i = 0; i < tb.rows.length; i++) {
var id = tb.rows[i].id;
box.appendChild(oddsRow('', id, capRowName(oddsKind, id), pctText(tb.rows[i].p, d), capRowArt(oddsKind, id)));   /* M-2 — 이름 · 그림 한 곳 */
}
if (!tb.rows.length) { box.hidden = true; var none = document.createElement('p'); none.textContent = t(sk ? skinEmptyKey(tb) : 'gacha.friend.all'); s2.appendChild(none); }
b.appendChild(s2);
var s3 = document.createElement('section'); s3.className = 'od-sec od-rules';
var h3 = document.createElement('h3'); h3.textContent = t('odds.rules'); s3.appendChild(h3);
var ul = document.createElement('ul'), li;
var rules = [];
if (oddsKind === 'item') rules.push(t('odds.rule.ten', { n: GACHA_TEN, r: pctText(GACHA_TEN_UP.rare, 0), e: pctText(GACHA_TEN_UP.epic, 0) }));
if (!fr && !sk) rules.push(t('odds.rule.pity', { n: tb.pityAt, c: tb.pity }));
if (fr) rules.push(t('odds.rule.friend', { c: GACHA_FRIEND_W.common, r: GACHA_FRIEND_W.rare, e: GACHA_FRIEND_W.epic }));
else if (sk) rules.push(t('odds.skin.dup'));
else rules.push(t('odds.rule.dup', { max: ITEM_LV_MAX, c: GACHA_REFUND.common, r: GACHA_REFUND.rare, e: GACHA_REFUND.epic }));
for (i = 0; i < rules.length; i++) { li = document.createElement('li'); li.textContent = rules[i]; ul.appendChild(li); }
s3.appendChild(ul);
b.appendChild(s3);
var f1 = document.createElement('p'); f1.className = 'sh-fine'; f1.textContent = t('odds.foot1'); b.appendChild(f1);
var f2 = document.createElement('p'); f2.className = 'sh-fine'; f2.textContent = t('odds.foot2', { date: todayKey().slice(0, 4) + '.' + todayKey().slice(4, 6) }); b.appendChild(f2);
oddsFitBox();
}
function oddsFitBox() {
var m = $('modal-odds'), box = m && !m.hidden ? m.querySelector('.od-box') : null;
if (!box || box.hidden) return;
box.style.maxHeight = '';
var cs = getComputedStyle(box), cap = parseFloat(cs.maxHeight), pad = parseFloat(cs.paddingBottom) || 0;
if (!(cap > 0)) return;
box.scrollTop = 0;
var kids = box.children, i, tp, bt, top0 = -1, bot0 = 0;
for (i = 0; i < kids.length; i++) {
tp = kids[i].offsetTop - box.offsetTop; bt = tp + kids[i].offsetHeight;
if (top0 < 0) { if (bt > cap - pad + 0.5) { top0 = tp; bot0 = bt; } }
else if (Math.abs(tp - top0) < 1) bot0 = Math.max(bot0, bt);
}
if (top0 < 0) return;
box.style.maxHeight = (top0 + (bot0 - top0) / 2 + pad) + 'px';
}
var P3_AD_COIN = 100, P3_AD_STAR = 3;
var P3_AD_ROWS = ['coin', 'item', 'star', 'heart', 'friend'];
function adCapLeft(id) {
p3Roll();
if (id === 'friend') return Math.max(0, P3_AD_CAP.friend - (store.adCaps.w.friend | 0));
return Math.max(0, (P3_AD_CAP[id] | 0) - (store.adCaps.n[id] | 0));
}
function adCapUse(id) {
if (id === 'friend') store.adCaps.w.friend = (store.adCaps.w.friend | 0) + 1;
else store.adCaps.n[id] = (store.adCaps.n[id] | 0) + 1;
persist();
}
function adRowOk(id) {
if (!portalAdsOk() || adCapLeft(id) <= 0) return false;
if (id === 'heart') {
if ((store.hearts | 0) >= HEART_MAX) return false;   /* 가득이면 heartsTick 이 매번 저장한다(M-5) — 부르기 전에 거른다. 가득은 틱으로 풀리지 않는다 */
heartsTick();
return (store.hearts | 0) < HEART_MAX;
}
if (id === 'friend') return gachaTable('friend').left > 0;
return true;
}
var adBusyP3 = false;
function watchAdFor(id, btn, after) {
var draw = (id === 'item' || id === 'friend');
if (adBusyP3 || (draw && gachaBusy) || !adRowOk(id)) return;
adBusyP3 = true;
if (btn) btn.disabled = true;
TW_PORTAL.requestRewardedAd('p3-' + id, function (ok) {
adBusyP3 = false;
if (btn) btn.disabled = false;
portalAdsSync();
if (!ok) { toast(t('portal.ad.fail')); J.sfx.fail(); if (after) after(false); return; }
var res = null;
if (draw) {
res = gachaBuy(id, 1, 'ad');
if (!res.ok) { gachaFailToast(res, 'portal.ad.fail'); J.sfx.fail(); if (after) after(false); return; }
}
adCapUse(id);
if (id === 'coin') { coinGrant(P3_AD_COIN, 'ad'); toast(t('coin.got', { n: P3_AD_COIN })); }
else if (id === 'star') { starGrant(P3_AD_STAR, 'ad'); toast(t('star.got', { n: P3_AD_STAR })); }
else if (id === 'heart') { grantHearts(1); paintHearts(); toast(t('shop.heart.ok')); }
J.sfx.win();
if (res) gachaPlay(res, after);
else if (after) after(true);
});
}
SHOP_PAINT.free = function (body) {
shopHead(body, t('free.title'), shopClockPill(t('free.reset')), true).setAttribute('data-portal-only', '');
var list = document.createElement('div'); list.className = 'sh-grid fr-list'; list.setAttribute('data-portal-only', ''); body.appendChild(list);
var IC = { coin: 'shop-ic-coin', item: 'shop-ic-machine-item', star: 'shop-ic-star', heart: 'shop-ic-heart', friend: 'shop-ic-machine-friend' };
for (var i = 0; i < P3_AD_ROWS.length; i++) {
var id = P3_AD_ROWS[i], left = adCapLeft(id), cap = P3_AD_CAP[id], okNow = adRowOk(id), sub;
if (id === 'heart' && (store.hearts | 0) >= HEART_MAX) sub = t('free.heart.full');
else if (id === 'friend' && gachaTable('friend').left <= 0) sub = t('free.friend.none');
else if (id === 'friend') sub = t('free.left.week', { n: left, m: cap });
else sub = t('free.left.day', { n: left, m: cap });
var title = t('free.' + id, { n: id === 'coin' ? P3_AD_COIN : P3_AD_STAR });
var card = shopCard2({ title: title, ic: IC[id], sub: sub, coinIc: okNow ? 'play' : '',
label: okNow ? t('free.get') : ((id === 'heart' && (store.hearts | 0) >= HEART_MAX && left > 0) ? t('adv.heartfull') : t('free.tomorrow')),   /* 하트 가득 = 「MAX」(특가 탭과 같은 낱말) · 「내일 다시」 는 상한을 다 쓴 경우만 */
price: okNow ? 'ad' : 'ok', dis: !okNow, act: 'ad:' + id });
card.setAttribute('data-ad', id);
list.appendChild(card);
}
var used = store.adCaps.n.x2 | 0, x2 = shopCard2({ title: t('free.x2'), ic: 'shop-ic-coin-3',
sub: t('free.x2.d', { n: used, m: P3_AD_CAP.x2 }), label: used < P3_AD_CAP.x2 ? t('free.x2.where') : t('free.tomorrow'), price: 'ok', dis: true });
x2.setAttribute('data-ad', 'x2');
list.appendChild(x2);
var f1 = document.createElement('p'); f1.className = 'sh-fine'; f1.setAttribute('data-portal-only', ''); f1.textContent = t('free.foot1'); body.appendChild(f1);
var f2 = document.createElement('p'); f2.className = 'sh-fine'; f2.setAttribute('data-portal-only', ''); f2.textContent = t('free.foot2'); body.appendChild(f2);
};
SHOP_DOTS.free = function () { var n = 0; for (var i = 0; i < P3_AD_ROWS.length; i++) if (adRowOk(P3_AD_ROWS[i])) n++; return n; };
SHOP_ACTS.ad = function (id, el) {
watchAdFor(id, el, function () { if (!shopActive()) return; if (shopTabOk(shopTab2)) paintShopTab(shopTab2); else setShopTab('gacha'); });
};
function paintCoinX2(sheet) {
if (sheet !== undefined) S.x2Sheet = sheet;   /* '' = 어느 창도 아님(허브에서 옛 결과를 다시 열 때) · 인자 없음 = 그대로(▶ · 그냥 받기 뒤 다시 칠하기) */
portalAdsSync();
var show = portalAdsOk() && adCapLeft('x2') > 0 && (S.gainCoin | 0) > 0 && S.x2Done !== S.x2Token;
var rows = document.querySelectorAll('.coin-x2');
for (var i = 0; i < rows.length; i++) rows[i].hidden = !(show && rows[i].getAttribute('data-sheet') === S.x2Sheet);
cx2Fit();
resFit(null);   /* [Task 8d 덧붙임 C] 2배 줄이 서거나 사라지면 결과 창 본문 높이가 바뀐다 — 썸네일 맞춤을 다시 잰다 */
}
function cx2Fit() {
if (typeof document === 'undefined') return;
var rows = document.querySelectorAll('.coin-x2');
for (var i = 0; i < rows.length; i++) {
var r = rows[i];
r.removeAttribute('data-stack');
if (r.hidden || !r.offsetWidth) continue;
var bs = r.querySelectorAll('.mf-btn'), over = false;
for (var j = 0; j < bs.length && !over; j++) over = bs[j].scrollWidth > bs[j].clientWidth + 1 || bs[j].scrollHeight > bs[j].clientHeight + 1;
if (over) r.setAttribute('data-stack', '');
}
}
var cx2RefitRaf = 0;
function cx2Refit() {
if (cx2RefitRaf) return;
if (typeof requestAnimationFrame === 'undefined') { cx2Fit(); return; }
cx2RefitRaf = requestAnimationFrame(function () { cx2RefitRaf = 0; cx2Fit(); });
}
function coinX2Click(ev) {
var el = ev.target && ev.target.closest ? ev.target.closest('.cx2-yes, .cx2-no') : null;
if (!el) return;
var tok = S.x2Token, n = S.gainCoin | 0;
if (el.classList.contains('cx2-no')) { S.x2Done = tok; paintCoinX2(); J.sfx.ui(); return; }
if (!(portalAdsOk() && adCapLeft('x2') > 0 && n > 0 && S.x2Done !== tok)) return;
var pair = el.parentNode.querySelectorAll('button'), pi;
for (pi = 0; pi < pair.length; pi++) pair[pi].disabled = true;   /* 요청 중에는 「그냥 받기」도 잠근다 — 끝까지 본 사람의 보상이 사라지지 않게(M-3) */
TW_PORTAL.requestRewardedAd('p3-x2', function (ok) {
for (pi = 0; pi < pair.length; pi++) pair[pi].disabled = false;
portalAdsSync();
if (ok && S.x2Done !== tok) { adCapUse('x2'); coinGrant(n, 'ad-x2'); toast(t('coin.x2.got', { n: n })); J.sfx.win(); S.x2Done = tok; }
else if (!ok) { toast(t('portal.ad.fail')); J.sfx.fail(); }
paintCoinX2();
});
}
function jewelRefillHearts() {
heartsTick();
if (store.hearts >= HEART_MAX) return false;
if (!jewelSpend(JEWEL_COST.heartsFull, 'hearts-full')) return false;
store.hearts = HEART_MAX;
store.heartAt = Date.now();
persist();
paintHearts();
return true;
}
function jewelBuyHeart() {
if (!jewelSpend(JEWEL_COST.heartOne, 'heart-one')) return false;
grantHearts(1);
paintHearts();
return true;
}
function appGemContinue() {
return !!(window.TW && window.TW.platform === 'twa' && typeof store.jewel === 'number');
}
function jewelPayContinue() {
if (!appGemContinue()) return false;
return jewelSpend(JEWEL_COST.continue2, 'continue');
}
function buySkinJewel(sid) {
var sk = skinById(sid);
if (!sk || sk.soon || skinOwned(sk)) return;
if (!appGemContinue()) return;                 /* 웹에서는 이 경로가 없다 */
var cost = JEWEL_COST.skin;
if (jewelBalance() < cost) {
toast(t('shop.poor', { n: cost - jewelBalance() }));
J.sfx.fail();
return;
}
confirmBox(t('shop.skin.confirm', { n: cost, name: t(sk.name) }), function () {
closeConfirm();
var sk2 = skinById(sid);
if (!sk2 || sk2.soon || skinOwned(sk2)) return;
if (!jewelSpend(cost, 'skin')) { toast(t('shop.poor', { n: cost - jewelBalance() })); J.sfx.fail(); return; }
if (store.skins.indexOf(sk2.id) < 0) store.skins.push(sk2.id);
store.equipped[skinTargetId()] = sk2.id;
persist();
applySkins();
buildSkinList();
skinShopSync();
toast(t('skin.bought', { name: t(sk2.name) }));
J.sfx.win();
});
}
function dailyFreeLeft() {
var at = Math.floor(Number(store.dailyFreeAt) || 0);
if (!(at > 0)) return 0;
var left = at + DAILY_FREE_MS - Date.now();
if (left > DAILY_FREE_MS) return 0;
return Math.max(0, left);
}
function claimDailyFree() {
if (dailyFreeLeft() > 0) return false;
store.dailyFreeAt = Date.now();
persist();                       /* 시각을 **먼저** 박는다 — 지급 중 죽어도 두 번 안 준다 */
jewelGrant(DAILY_FREE_JEWEL, 'daily-free');
grantHearts(DAILY_FREE_HEART);
paintHearts();
toast(t('shop.daily.got', { n: DAILY_FREE_JEWEL }));
J.sfx.win();
buildShopBody();
return true;
}
var shopTabCur = 'jewel';
var shopPayForce = 0;   /* 관문 전용 — layout-check 가 결제 묶음을 재려면 켠다 */
function shopHasBilling() {
if (shopPayForce) return true;
try { return ('getDigitalGoodsService' in window); } catch (e) { return false; }
}
function shopSyncPay() {
var g = $('shop-pay');
if (g) g.hidden = !shopHasBilling();
}
function shopCard(o) {
var card = document.createElement('div');
card.className = 'shop-card';
card.setAttribute('data-part', 'shop-card');
if (o.sku) card.setAttribute('data-sku', o.sku);
var ic = document.createElement('i');
ic.className = 'shop-ic ' + (o.ic || 'shop-ic-jewel');
ic.setAttribute('aria-hidden', 'true');
card.appendChild(ic);
var body = document.createElement('span');
body.className = 'shop-cb';
var n = document.createElement('b');
n.className = 'shop-cn';
n.textContent = o.title;
body.appendChild(n);
var d = document.createElement('span');
d.className = 'shop-cd';
d.textContent = o.sub || '';
body.appendChild(d);
if (o.badge) {
var bd = document.createElement('em');
bd.className = 'shop-badge';
bd.textContent = o.badge;
body.appendChild(bd);
}
card.appendChild(body);
var b = document.createElement('button');
b.type = 'button';
b.className = 'shop-act';
b.textContent = o.price;
if (o.dis) b.disabled = true;
else if (o.act) b.setAttribute('data-shop-act', o.act);
card.appendChild(b);
return card;
}
function shopKrw(n) { return t('shop.krw', { n: String(n).replace(/\B(?=(\d{3})+$)/g, ',') }); }
function buildShopBody() {
var wrap = $('shop-body');
if (!wrap) return;
wrap.innerHTML = '';
var i, d;
if (shopTabCur === 'jewel') {
var left = dailyFreeLeft();
wrap.appendChild(shopCard({
ic: 'shop-ic-jewel',
title: t('shop.daily'),
sub: left > 0 ? t('shop.daily.wait') : t('shop.daily.d', { n: DAILY_FREE_JEWEL }),
price: left > 0 ? t('shop.daily.done') : t('shop.daily.get'),
act: 'daily', dis: left > 0
}));
var pay = document.createElement('div');
pay.id = 'shop-pay';
pay.className = 'shop-pay';
var first = !store.firstBuy;
for (i = 0; i < JEWEL_PACKS.length; i++) {
d = JEWEL_PACKS[i];
pay.appendChild(shopCard({
sku: d.sku,
ic: 'shop-ic-jewel-' + d.tier,
title: t('shop.pack.' + d.tier),
sub: t('shop.pack.d', { n: d.n }),
badge: first ? t('shop.first2x') : '',
price: shopKrw(d.krw), dis: true
}));
}
pay.appendChild(shopCard({
sku: START_PACK.sku,
ic: 'shop-ic-bundle-1',
title: t('shop.start'),
sub: t('shop.start.d', { n: START_PACK.n, h: START_PACK.hearts, s: START_PACK.jstar }),
price: shopKrw(START_PACK.krw), dis: true
}));
wrap.appendChild(pay);
} else if (shopTabCur === 'bundle') {
wrap.appendChild(shopCard({
ic: 'shop-ic-heart',
title: t('shop.heart5'),
sub: t('shop.heart5.d', { n: HEART_MAX }),
price: t('shop.price.jewel', { n: JEWEL_COST.heartsFull }),
act: 'heart5',
dis: jewelBalance() < JEWEL_COST.heartsFull || store.hearts >= HEART_MAX
}));
wrap.appendChild(shopCard({
ic: 'shop-ic-heart',
title: t('shop.heart1'),
sub: t('shop.heart1.d'),
price: t('shop.price.jewel', { n: JEWEL_COST.heartOne }),
act: 'heart1',
dis: jewelBalance() < JEWEL_COST.heartOne
}));
var bpay = document.createElement('div');
bpay.id = 'shop-pay';
bpay.className = 'shop-pay';
bpay.appendChild(shopCard({
sku: 'bundle_starter', ic: 'shop-ic-bundle-1',
title: t('shop.bundle1'), sub: t('shop.bundle1.d'),
price: shopKrw(3300), dis: true
}));
bpay.appendChild(shopCard({
sku: 'bundle_heart', ic: 'shop-ic-bundle-2',
title: t('shop.bundle2'), sub: t('shop.bundle2.d'),
price: shopKrw(5500), dis: true
}));
wrap.appendChild(bpay);
}
shopSyncPay();
applyI18n();
}
function shopTab(k) {
var ok = ['jewel', 'bundle'];   /* P3 T5 — 별 교환 은퇴(뽑기 재화를 현금으로 팔지 않는다 §20.9) · 스킨 = 상점 꾸미기 탭 */
shopTabCur = (ok.indexOf(k) >= 0) ? k : 'jewel';
var root = $('shop-tabs');
if (root && root.querySelectorAll) {
var tabs = root.querySelectorAll('[data-shop-tab]');
for (var i = 0; i < tabs.length; i++) {
var on = tabs[i].getAttribute('data-shop-tab') === shopTabCur;
tabs[i].setAttribute('aria-selected', on ? 'true' : 'false');
if (on) tabs[i].setAttribute('data-active', '');
else tabs[i].removeAttribute('data-active');
}
}
buildShopBody();
}
function openShop() {
if (!appGemContinue()) return;
var el = $('modal-shop');
if (!el) return;
heartsTick();
paintShopBalance();
paintWallets();   /* P3 — 판 중 수확으로 오른 코인도 열 때 맞는다(지갑 칩이 생기면 보인다 · 지휘자 보충) */
shopTab(shopTabCur);
winShow(el);   /* [판정판 121 · Task 5] 겹친 창 규칙(openModal 과 같은 손) */
J.sfx.ui();
}
function closeShop() {
winHide($('modal-shop'));
if (shopActive()) paintShopTab(shopTab2);   /* P3 T5 — 별 교환은 은퇴, 보석 창이 아직 바꾸는 것은 하트 뿐: 닫으면 띠 하트와 특가 판(하트 가득 카드)이 따라온다 */
J.sfx.ui();
}
function shopAct(a) {
if (a === 'daily') { claimDailyFree(); return; }
if (a === 'heart5') { if (jewelRefillHearts()) { toast(t('shop.heart.ok')); J.sfx.win(); } else J.sfx.fail(); buildShopBody(); return; }
if (a === 'heart1') { if (jewelBuyHeart()) { toast(t('shop.heart.ok')); J.sfx.win(); } else J.sfx.fail(); buildShopBody(); return; }
}
function advStarK(arr, n, fb) {
var i = (n | 0) - 1;
var v = (i >= 0 && i < arr.length) ? arr[i] : fb;
return (v > 0) ? v : fb;
}
var ADV_STAR2_HP = 0.80;
var ADV_STAR3_HP = 1.07;   // 정수 DUEL_NEED 에서는 1.10 이 수치안 §7-3 무작위 ★★★ 0.605 를 못 맞춰(0.32) 1.07 로 낮춘다 — 근거 = 무작위 3런 합본 291판 0.574, Wilson [0.516, 0.629](DESIGN §27.9 합본 판정, 지휘자 판정 2026-10-04)
var ADV_STAR_EARLY_K = 0.85;
var ADV_STAR_SCRIPTED = 50;
function advStarHp(plan) {
var n = plan ? plan.n : 1;
return duelFoeHpMax(n) * (n <= ADV_STAR_EARLY ? ADV_STAR_EARLY_K : 1);
}
function advStarLegacy(plan, arr, fb) {
var n = plan ? plan.n : 1;
return Math.round((plan && plan.par > 0 ? plan.par : 1) * advDiffK(n) * advStarK(arr, n, fb));
}
function advStar2Need(plan) {
var n = plan ? plan.n : 1;
if (!TW_BATTLE || n === ADV_STAR_SCRIPTED) return advStarLegacy(plan, ADV_STAR2_K, ADV_STAR2_FALLBACK);
return Math.round(ADV_STAR2_HP * advStarHp(plan));
}
function advStar3Need(plan) {
var n = plan ? plan.n : 1;
if (!TW_BATTLE || n === ADV_STAR_SCRIPTED) return advStarLegacy(plan, ADV_STAR3_K, ADV_STAR3_FALLBACK);
return Math.round(ADV_STAR3_HP * advStarHp(plan));
}
function advStarsFor(plan, score, shuffled, ease, tenCount) {
var s = 1;
if (score >= advStar2Need(plan) && (ease === undefined || ease)) s = 2;
if (s === 2 && score >= advStar3Need(plan) && !shuffled &&
(tenCount === undefined || (tenCount | 0) >= advTenNeed(plan ? plan.n : 1))) s = 3;
return s;
}
function advTenNeed(n) { return Math.max(1, Math.ceil(extBoardSize(n) * ADV_STAR3_TEN)); }
function advStarsOf(n) { return store.advStars[String(n)] | 0; }
function advStarTotal() {
var sum = 0;
for (var k in store.advStars) {
if (Object.prototype.hasOwnProperty.call(store.advStars, k)) sum += store.advStars[k] | 0;
}
return sum;
}
function advStarMax() { return MAP_CHAPTERS.length * ADV_CHAPTER * 3; }
function advStarStr(s) {
var out = '';
for (var i = 1; i <= 3; i++) out += (i <= s) ? '★' : '☆';
return out;
}
function advGoalText(p) {
if (p.goal.type === 'boss') return t('boss.goal', { b: bossName(p.bossDef) });
if (p.goal.type === 'digit') return t('adv.goal.digit', { d: p.goal.digit, n: p.goal.need });
if (p.goal.type === 'time') return t('adv.goal.time', { s: p.sec, n: p.goal.need });
return t('adv.goal.score', { n: p.goal.need });
}
function advHandBits(p) {
var bits = [];
if (p.hand.blk > 0) bits.push(t('adv.hand.blk', { n: p.hand.blk }));
if (p.hand.lock > 0) bits.push(t('adv.hand.lock', { n: p.hand.lock }));
if (p.hand.noShuffle) bits.push(t('adv.hand.noshuffle'));
if (p.hand.timeCut) bits.push(t('adv.hand.timecut'));
return bits;
}
function advLeftMs() {
if (S.mode !== 'adv' || !(S.advEndAt > 0)) return 0;
var d = S.advEndAt - now();
return d > 0 ? d : 0;
}
function advGoalMet() {
var p = S.advPlan;
if (!p) return false;
if (battleOn()) return S.duel.foe.hp <= 0;
if (p.goal.type === 'boss') return S.bossDown || S.bossHp <= 0;
if (p.goal.type === 'score') return S.score >= p.goal.need;
if (p.goal.type === 'digit') return S.advDigit >= p.goal.need;
return S.advCleared >= p.goal.need;
}
function syncAdvGoal() {
var el = $('adv-goal');
if (!el) return;
var bossDuel = S.mode === 'adv' && !!S.advPlan && !!S.advPlan.boss && !!S.advPlan.bossDef && battleOn();
var live = bossDuel || (S.mode === 'adv' && !!S.advPlan && !S.advPlan.boss && !battleOn());
if (el.hidden !== !live) el.hidden = !live;
if (!live) return;
if (bossDuel) {
var bd = S.advPlan.bossDef, bn = Math.min(S.bossProg | 0, bd.need);
setText('adv-goal-t', t('boss.prog', { c: bossCondText(bd), n: bn, goal: bd.need }));
if (el.classList) el.classList.toggle('done', bn >= bd.need);
return;
}
var p = S.advPlan, txt;
if (p.goal.type === 'digit') {
txt = t('adv.hud.digit', { d: p.goal.digit, n: Math.min(S.advDigit, p.goal.need), goal: p.goal.need });
} else if (p.goal.type === 'time') {
txt = t('adv.hud.time', { n: Math.min(S.advCleared, p.goal.need), goal: p.goal.need });
} else {
txt = t('adv.hud.score', { n: S.score, goal: p.goal.need });
}
setText('adv-goal-t', txt);
var met = advGoalMet();
if (el.classList) el.classList.toggle('done', met);
if (met && !S.advHit) {
S.advHit = true;
toast(t('adv.goalhit'));
J.sfx.mission();
}
}
function bangReset() {
S.bangOn = false;
setAppClass('bang', false);
var el = $('bang');
if (el) { el.classList.remove('go'); el.hidden = true; }
}
function runBang() {
var p = S.advPlan;
if (!p) return;
S.bangOn = true;
S.paused = true;
S.pausedAt = now();
stopComboLoop();
stopFeverLoop();
setAppClass('bang', true);
var el = $('bang');
if (el) {
setText('bang-n', t(p.boss ? 'adv.bossn' : 'adv.stagen', { n: p.n }));
setText('bang-big', advGoalText(p));
setText('bang-sub', missionText(p.mission));
el.hidden = false;
el.classList.remove('go');
void el.offsetWidth;
el.classList.add('go');
}
J.sfx.hurry();
J.vibrate(60);
J.screenPulse();
if (S.mode === 'adv' && p.n === 1 && !store.tutorialDone) howtoOnce('ten', 'howto.ten', true);
if (S.mode === 'adv' && p.n === ADV_CHAPTER) howtoOnce('finish', 'howto.finish', true);
later(endBang, ADV_BANG_MS);
}
function endBang() {
S.bangOn = false;
setAppClass('bang', false);
var el = $('bang');
if (el) { el.classList.remove('go'); el.hidden = true; }
if (!S.running) { S.paused = false; S.pausedAt = 0; return; }
var held = S.pausedAt ? Math.max(0, now() - S.pausedAt) : 0;
S.pausedAt = 0;
S.paused = false;
shiftDeadlines(held, false);
if (battleOn()) { S.missionUntil = 0; syncMission(); return; }
var span = (S.advPlan && S.advPlan.bossDef && S.advPlan.bossDef.seq)
? BOSS_MISSION_MS : ADV_MISSION_MS;
var room = Math.max(5000, advLeftMs() - 2000);
S.missionUntil = now() + Math.min(span, room);
syncMission();
}
function tickMission() {
if (S.paused || S.bangOn) return;            // 허리 업이 우선 (위 순서 계약 3)
if (battleOn()) return;
if (!(S.missionUntil > 0)) return;
if (!S.mission || S.mission.done) return;
if (now() >= S.missionUntil) {
S.missionUntil = -1;                       // 만료 표식
syncMission();
toast(t('adv.missionfail'));
J.sfx.fail();
bossOnMissionFail();
return;
}
syncMission();
}
function stopAdv() {
if (advInt) { clearInterval(advInt); advInt = 0; }
setDanger(false);
}
function startAdvLoop() {
stopAdv();
advInt = setInterval(function () {
if (S.mode !== 'adv' || !S.running) return;
if (S.paused) return;
if (battleOn()) duelChillTick();
var left = advLeftMs();
syncHud();                                 // syncRushHud/syncAdvGoal 포함
var danger = left <= RUSH_DANGER_MS && left > 0;
setDanger(danger);
if (danger && now() - S.rushBeatAt >= 1000) {
S.rushBeatAt = now();
J.sfx.heartbeat();
}
maybeHurry(left);                          // 20초 — 스토리 긴장
tickMission();                             // 그 다음이 미션 시계
skillTick();                               // v4 5차 §2: 필살기 지속 만료
awakenTick();                              // 74 — 각성 마감·배지 카운트다운(점검 W3)
if (battleOn()) duelTick();
else bossTick();                           // v4 5차 §4: 격파·확정발동·반격
if (!S.running) return;                    // 위에서 격파로 판이 끝났을 수 있다
if (left <= 0) {
stopAdv();
advFinish(battleOn() ? duelTimeoutWin() : advGoalMet(), 'timeout');
}
}, 200);
}
function advStart(n) {
var st = (n | 0) < 1 ? 1 : (n | 0);
if (st > (store.advMax | 0)) { toast(t('adv.locked')); J.sfx.fail(); return; }
if (introGate(charId(), function () { advStart(n); })) return;
heartsTick();
if (store.hearts <= 0) { openNodeCard(st); return; }   // 카드가 대기 안내를 맡는다
closeModal('modal-node');
stopMapTicker();
S.mode = 'adv';
S.score = 0;
S.matches = 0;
S.maxCombo = 1;
S.startedAt = Date.now();
S.advHit = false;
hurryReset();
bangReset();
startStage(st, 0);          // 시드는 advPlan 이 준다 — 재도전은 같은 판이다
closeAllModals();
showScreen('screen-game');
setAppClass('adv', true);
layout();
S.advEndAt = now() + (S.advPlan ? S.advPlan.sec : 90) * 1000;
startAdvLoop();
syncHud();
runBang();
}
function advFinish(win, why) {
if (!S.running) return;                       // 두 번 들어오지 않는다
S.gainCoin = 0;   /* P3 — 진 판은 0 */
TW_PORTAL.gameplayStop();   /* Task 12 rev1(C-1) — 판이 끝나는 즉시(연출·컷신이 이어져도) */
S.running = false;
S.busy = true;
stopComboLoop();
stopAdv();
endFever(true);
clearSelection();
bangReset();
endSkill();
S.bossArm = false;
if (S.duel) { S.duel.down = true; S.duel.meArm = false; }
setAppClass('duel-hurt', false);
setAppClass('boss-tell', false);
S.bossTellAt = 0;
var p = S.advPlan || advPlan(S.stage);
var key = String(p.n);
var stars = 0;
var gemGain = 0;                              // 이 판이 적립한 젤리별
var freed = false;                            // 이 판이 젤리공주를 풀어 줬는가
var dupIds = [];                              // P3 T10 — 이 판 끝에서 별 +10 으로 바뀐 친구들(알림은 skin.gem 토스트 뒤에 차례로)
if ((S.score | 0) > (store.advBest[key] | 0)) store.advBest[key] = S.score | 0;
if (win) {
var ease = (p.sec > 0 && advLeftMs() >= p.sec * 250) ||
(S.adds >= Math.ceil(addsForStage(p.n) / 2));
S.starEase = !!ease;
stars = advStarsFor(p, S.score, S.advShuf, ease, S.tenCount | 0);
var prevStars = store.advStars[key] | 0;
if (stars === 3 && prevStars < 3 && !p.boss) TW_PORTAL.happytime();
if (stars > prevStars) {
store.advStars[key] = stars;
store.jstar = (store.jstar | 0) + (stars - prevStars);
gemGain = stars - prevStars;
}
S.gainCoin = coinPlayed() ? coinForAdv(prevStars === 0, stars, !!p.boss) : 0;   /* 짝 0 판은 0 */
if (S.gainCoin > 0 && prevStars > 0 && !coinCapTake('re', COIN_RE_DAY_MAX)) S.gainCoin = 0;   /* 판정판 102 ① — 다시 깨기 코인은 하루 10판까지(11판째부터 0) */
if (S.gainCoin > 0) coinGrant(S.gainCoin, 'adv');
S.x2Token = (S.x2Token | 0) + 1;   /* P3 — 결과 창 2배는 판 끝마다 한 번 */
store.advFails[key] = 0;
if (p.n >= (store.advMax | 0)) store.advMax = p.n + 1;
dqBump('clear', 1);
dqBump('wclear', 1);
if (stars >= 2) dqBump('star2', 1);
if (gemGain > 0) dqBump('wstar', gemGain);
if (p.boss) { TW_PORTAL.happytime(); grantHearts(ADV_BOSS_HEART); }   // Task 12 rev1(I-9) — 보스 격파 판정 자리
if (p.boss && p.n === ADV_CHAPTER && !store.jellyOn) {
store.jellyOn = true;
freed = true;
} else if (p.boss && p.n === ADV_CHAPTER && friendDupPay('jelly', true)) dupIds.push('jelly');   /* P3 — 뽑기로 먼저 온 젤리공주면 별 +10(구출 장면은 안 나온다 — 사용자 결정 대기 항목) */
if (p.boss && PET_BOSS[p.n] && !grantPet(PET_BOSS[p.n]) && friendDupPay(PET_BOSS[p.n], true)) dupIds.push(PET_BOSS[p.n]);   /* P3 — 이미 뽑은 친구면 별 +10 */
if (p.boss) { dupTray = dupIds; try { var bg = gearBossRoll(p.n, Math.random); if (bg && bg.id) harvestGear(bg, 0, 0, true); } finally { dupTray = null; } }   /* 74 — 보스 확정 장비 1개. 판 사본 S.gainGear 에 실려 결과 시트가 읽는다 · P3 — 이 수확의 petGearCheck 가 부르는 꿀떡이 중복 알림은 dupIds 로 모은다 */
if (p.boss && !S.hitTaken) store.bossNoHit = (store.bossNoHit | 0) + 1;
persist();
achvCheck();                  /* 판정판 50 — 별·챕터·펫 축이 여기서 움직인다 */
J.sfx.win();
J.vibrate(40);
heroSay('clear', 6);
if (stars > 0) later(function () { heroSay('star'); }, 240);
if (gemGain > 0) later(function () { toast(t('skin.gem')); }, 700);
var dupAt = gemGain > 0 ? 700 + toastMs(t('skin.gem'), 1) : 0;
dupIds.forEach(function (id) { var msg = friendDupMsg(id); later(function () { toast(msg); }, dupAt); dupAt += toastMs(msg, 2); });
if (typeof window !== 'undefined') {
J.confetti(window.innerWidth / 2, window.innerHeight * 0.42);
later(function () { J.confetti(window.innerWidth * 0.28, window.innerHeight * 0.5); }, 170);
}
} else {
if (why === 'scripted') {
var nxt = DUEL_SCRIPT_STAGE + 1;
if ((store.advMax | 0) < nxt) store.advMax = nxt;
} else {
store.advFails[key] = (store.advFails[key] | 0) + 1;
spendHeart();                             // 실패에만 비용이 붙는다
}
persist();
var board = $('board');
if (board) board.classList.add('grayed');
J.sfx.lose();
J.vibrate(60);
mascotSad();
}
S.gainGem = gemGain | 0;
var advTail = function () {
if (harvestGain() > 0 && (S.score | 0) > (store.advBest[key] | 0)) {
store.advBest[key] = S.score | 0;
persist();
}
paintAdvSheet(win, stars, why, p);
if (freed) {
later(function () {
playCuts(CUTS_FREE, 'free', function () {
showScreen('screen-game');
runUnlock();
});
}, 900);
return;
}
if (win && p && p.n === ADV_CHAPTER * MAP_CHAPTERS.length && !cutSeen('end')) {
later(function () {
playCuts(CUTS_END, 'end', function () {
showScreen('screen-game');
openAdvSheet();
});
}, 900);
return;
}
later(function () { openAdvSheet(); }, win ? 420 : 520);
};
if (win) { harvestFinale(advTail); return; }
advTail();
}
function openAdvSheet() {
TW_PORTAL.requestMidgameAd(function () {
openModal('modal-adv');
var sv = $('adv-stars');
var txt = (sv && !sv.hidden) ? String(sv.textContent || '') : '';
var full = 0;
for (var i = 0; i < txt.length; i++) { if (txt.charAt(i) === '★') full++; }
rewardReveal('adv-reward', rewardItems({ gem: (S.gainGem | 0) + (S.gainJstar | 0), coin: S.gainCoin | 0 }), {
starEl: 'adv-stars',
stars: full,
sheetId: 'modal-adv'
});
paintCoinX2('adv');   /* P3 T9 */
});
}
function runUnlock() {
var el = $('unlock');
if (!el) { openAdvSheet(); return; }           // DOM 이 없어도 진행은 막히지 않는다
setText('unlock-h', t('unlock.title'));
setText('unlock-line', t('unlock.line'));
setText('unlock-sub', t('unlock.sub'));
var go = $('unlock-go');
if (go) go.textContent = t('unlock.go');
el.hidden = false;
el.classList.remove('go');
void el.offsetWidth;
el.classList.add('go');
syncCharPick();                  // 잠금이 풀린 카드가 메뉴에서 바로 열려 있게
J.sfx.tierUp(4);
J.vibrate(70);
if (typeof window !== 'undefined') {
J.confetti(window.innerWidth / 2, window.innerHeight * 0.4);
later(function () { J.confetti(window.innerWidth * 0.7, window.innerHeight * 0.46); }, 220);
}
later(function () { J.sfx.voice('jelly', 6); }, 620);
}
function closeUnlock() {
var el = $('unlock');
if (el) { el.classList.remove('go'); el.hidden = true; }
J.sfx.ui();
openAdvSheet();
}
function advStarNote(stars, p) {
if (stars >= 3) return t('adv.note3');
var miss = [];
if (stars >= 2) {
var need3 = advStar3Need(p);   /* 0910 — 판정이 쓰는 그 함수 그대로 */
if ((S.score | 0) < need3) miss.push(t('adv.miss.score', { n: fmtNum(need3) }));
if (S.advShuf) miss.push(t('adv.miss.shuffle'));
var tn = advTenNeed(p.n), have = S.tenCount | 0;
if (have < tn) miss.push(t('adv.miss.ten', { t: tn - have }));
if (!miss.length) miss.push(t('adv.miss.score', { n: fmtNum(need3) }));
return t('adv.note.miss3', { m: miss.join(' \u00B7 ') });
}
var need2 = advStar2Need(p);     /* 0910 — 〃 */
var lowScore = (S.score | 0) < need2;
if (lowScore) miss.push(t('adv.miss.score', { n: fmtNum(need2) }));
if (!S.starEase) miss.push(t('adv.miss.ease'));
if (lowScore && miss.length === 1) return t('adv.note.next', { n: fmtNum(need2) });
if (!miss.length) miss.push(t('adv.miss.score', { n: fmtNum(need2) }));
return t('adv.note.miss2', { m: miss.join(' \u00B7 ') });
}
function bossIntroLine(p) {
if (!p || !p.boss || !p.bossDef || p.bossDef.id !== 'cocoa') return '';
if (p.n === DUEL_SCRIPT_STAGE) return t('boss.cocoa.intro');
if (p.n === ADV_CHAPTER * MAP_CHAPTERS.length) return t('boss.cocoa.rematch');
return '';
}
function paintAdvSheet(win, stars, why, p) {
var sheet = $('modal-adv');
if (sheet && sheet.classList) sheet.classList.toggle('lost', !win);
if (sheet && sheet.classList) { sheet.classList.toggle('is-advscript', !win && why === 'scripted'); sheet.classList.toggle('is-advfinish', !win && why === 'finish'); }
setText('adv-title', win
? t(p.boss ? 'adv.bosswin' : 'adv.win', { n: p.n })
: t(why === 'scripted' ? 'adv.result.scripted'
: why === 'finish' ? 'adv.result.finish' : 'adv.lose', { n: p.n }));
setText('adv-stars', win ? advStarStr(stars) : '');
var sv = $('adv-stars');
if (sv) sv.hidden = !win;
setText('adv-score', S.score);
paintHarvestRow('adv-bonus');   /* 수확 피날레 DESIGN §25.7 */
setText('adv-note', win
? advStarNote(stars, p)          /* 0901 ⑥-e — 남은 조건만 정확히 */
: t(why === 'scripted' ? 'adv.result.scripted.sub'
: 'adv.reason.' + (why === 'timeout' ? 'timeout'
: why === 'finish' ? 'finish'
: (why === 'ko' ? 'ko' : 'stuck'))));
setText('adv-hearts', win
? (p.boss ? t('adv.heartplus') : t('adv.heartkept'))
: t('adv.heartlost', { n: Math.max(0, store.hearts) }));
var advAdBtn = $('adv-ad');
if (advAdBtn) {
advAdBtn.hidden = !(!win && store.hearts <= 0 && TW_PORTAL.env === 'crazygames' && TW_PORTAL.canReward() && adCapLeft('heart') > 0);
advAdBtn.disabled = false;
}
var again = $('adv-again');
if (again) {
again.textContent = win ? t('adv.next') : t('adv.retry');
again.setAttribute('data-n', String(win ? p.n + 1 : p.n));
}
}
function advAbandon() {
if (S.running) {
var key = String(S.stage);
store.advFails[key] = (store.advFails[key] | 0) + 1;
spendHeart();
persist();
toast(t('adv.abandon'));
}
S.running = false;
S.paused = false;
S.pausedAt = 0;
stopComboLoop();
stopAdv();
endFever(true);
clearTimers();
hurryReset();
bangReset();
skillReset();          // v4 5차: 컷인·지속·화면 클래스까지 한 번에 (게이지는 유지)
bossReset();
J.clear();
closeAllModals();
openMap();
}
var mapInt = 0;          // 하트 회복 카운트다운을 1초마다 다시 쓰는 시계
var advCardN = 0;        // 지금 열려 있는 미션 카드의 탄 번호
function advStatus(n) {
var mx = store.advMax | 0;
if (n < mx) return 'clear';
if (n === mx) return 'cur';
return 'lock';
}
function advZig(n) {
var k = (n - 1) % 4;
return k === 1 ? 1 : (k === 3 ? -1 : 0);
}
function advNodeCount() {
var cur = store.advMax | 0;
var need = Math.ceil((cur + 3) / ADV_CHAPTER) * ADV_CHAPTER;
return Math.max(ADV_CHAPTER * MAP_CHAPTERS.length, need);
}
var SIAN_MAP = 0;
var SIAN_PER = 6;
var mapPage = 0;
var SIAN_SLOTS = [
[ 8.865, 69.516, 15.179, 6.591],   // 1 왼쪽 아래 라임 젤리
[29.298, 80.022, 19.515, 7.793],   // 2 초록 젤리 (가장 앞·가장 크다)
[49.821, 67.225, 15.204, 6.336],   // 3 가운데 민트 — 시안의 "현재 위치"
[69.828, 78.543, 17.156, 8.070],   // 4 오른쪽 분홍
[88.597, 70.983, 15.332, 7.225],   // 5 오른쪽 보라
[96.052, 62.221,  7.972, 5.841]    // 6 오른쪽 끝 — 프레임에 잘린 조각
];
function sianPages() { return Math.ceil(ADV_CHAPTER / SIAN_PER); }
var MAP_ANCHORS_CH = [
[
[ 7.62, 84.00, 5.20, 7.53, '--node-jelly-1'],   //  1 서쪽 숲가 초원(우체통 트레일헤드)
[12.50, 75.92, 4.10, 6.20, '--node-jelly-2'],   //  2 숲가 둔덕 (초원 위로)
[18.16, 80.50, 5.20, 7.53, '--node-jelly-3'],   //  3 초원, 아래로 굽이
[23.83, 74.33, 4.10, 6.20, '--node-jelly-4'],   //  4 숲 아래 오솔길
[29.30, 79.70, 4.60, 6.90, '--node-jelly-5'],   //  5 초원 바위 옆
[34.38, 77.12, 4.10, 6.20, '--node-jelly-1'],   //  6 캔디스톤 길 초입
[37.30, 68.73, 3.70, 5.60, '--node-jelly-2'],   //  7 캔디스톤 길
[39.84, 61.14, 3.40, 5.15, '--node-jelly-3'],   //  8 길 S자 굽이
[41.02, 53.15, 3.15, 4.80, '--node-jelly-4'],   //  9 숲 위 길
[43.36, 44.36, 2.95, 4.50, '--node-jelly-5']    // 10 길 마루 = 보스(왕관)
],
[
[46.09, 54.35, 3.15, 4.80, '--node-jelly-1'],   // 11 초코 늪 서안
[50.39, 59.94, 3.40, 5.15, '--node-jelly-2'],   // 12 늪 남안 길
[54.30, 62.34, 3.40, 5.15, '--node-jelly-3'],   // 13 남안, 아래로 굽이
[58.59, 58.74, 3.15, 4.80, '--node-jelly-4'],   // 14 늪 동단 초록 둔덕
[60.55, 72.73, 3.70, 5.60, '--node-jelly-5'],   // 15 달콤 마을 앞 밭 (마을로 내려선다)
[65.63, 70.33, 3.70, 5.60, '--node-jelly-1'],   // 16 마을 동쪽 들
[68.95, 57.94, 3.15, 4.80, '--node-jelly-2'],   // 17 사막 서쪽 기슭
[73.05, 50.35, 2.95, 4.50, '--node-jelly-3'],   // 18 모래언덕
[76.56, 41.16, 2.80, 4.25, '--node-jelly-4'],   // 19 산맥 동쪽 기슭
[79.88, 32.77, 2.80, 4.25, '--node-jelly-5']    // 20 푸딩 산맥 능선 = 보스(왕관)
],
[
[92.97, 47.95, 2.95, 4.50, '--node-jelly-1'],   // 21 사막 동단, 캔디케인 사이
[89.06, 56.34, 3.15, 4.80, '--node-jelly-2'],   // 22 모래 남사면
[85.35, 49.15, 2.95, 4.50, '--node-jelly-3'],   // 23 모래, 위로 굽이
[81.64, 56.34, 3.15, 4.80, '--node-jelly-4'],   // 24 사구 사이
[77.93, 47.95, 2.95, 4.50, '--node-jelly-5'],   // 25 사막 북단
[74.22, 41.16, 2.80, 4.25, '--node-jelly-1'],   // 26 산맥 동쪽 기슭
[71.68, 33.57, 2.80, 4.25, '--node-jelly-2'],   // 27 푸딩 능선
[65.63, 31.57, 2.80, 4.25, '--node-jelly-3'],   // 28 초콜릿 폭포 (늪의 발원지를 건넌다)
[61.13, 24.78, 2.80, 4.25, '--node-jelly-4'],   // 29 산마루 서쪽
[57.81, 29.97, 2.80, 4.25, '--node-jelly-5']    // 30 성문 앞 벼랑길 = 보스(왕관)
],
[
[25.50, 42.00, 3.60, 5.50, '--node-jelly-1'],   // 31 숲 관 위 첫 둔덕(아이스바 아래)
[28.20, 36.20, 3.50, 5.35, '--node-jelly-2'],   // 32 햇빛 사면
[31.90, 40.30, 3.40, 5.20, '--node-jelly-3'],   // 33 사면 아래 굽이
[34.20, 34.50, 3.30, 5.05, '--node-jelly-4'],   // 34 버섯 사탕 옆
[37.80, 38.60, 3.20, 4.90, '--node-jelly-5'],   // 35 언덕 허리
[40.50, 32.80, 3.10, 4.75, '--node-jelly-1'],   // 36 초록 젤리돔 아래
[43.80, 37.00, 3.05, 4.65, '--node-jelly-2'],   // 37 캔디스톤 길이 꺾이는 목
[46.50, 31.10, 2.95, 4.55, '--node-jelly-3'],   // 38 길 위 언덕
[49.50, 35.30, 2.90, 4.45, '--node-jelly-4'],   // 39 길 마지막 굽이
[52.50, 31.90, 2.85, 4.40, '--node-jelly-5']    // 40 능선 마루 = 보스(왕관)
],
[
[56.50, 57.50, 3.40, 5.20, '--node-jelly-1'],   // 41 달콤 마을 북쪽 풀밭
[60.50, 56.00, 3.30, 5.05, '--node-jelly-2'],   // 42 초코 늪 남안
[64.50, 55.00, 3.20, 4.90, '--node-jelly-3'],   // 43 남안 모래 턱
[68.50, 51.50, 3.15, 4.80, '--node-jelly-4'],   // 44 늪 동단 · 사탕 막대 옆
[72.00, 47.00, 3.05, 4.65, '--node-jelly-5'],   // 45 산 동쪽 기슭
[74.50, 41.00, 3.00, 4.55, '--node-jelly-1'],   // 46 초코 흘러내린 사면
[73.00, 35.00, 2.90, 4.45, '--node-jelly-2'],   // 47 동사면 중턱(되꺾음)
[75.00, 29.50, 2.85, 4.35, '--node-jelly-3'],   // 48 능선 어깨
[71.00, 27.90, 2.80, 4.30, '--node-jelly-4'],   // 49 정상 아래 초코 띠
[66.50, 27.90, 2.80, 4.30, '--node-jelly-5']    // 50 두 봉우리 사이 고개 = 보스
],
[
[26.38, 82.15, 18.50, 6.05, '--node-jelly-1'],  // 51 복도 입구 좌측 바닥
[71.59, 79.18, 17.26, 6.23, '--node-jelly-2'],  // 52 우측 기둥 앞
[30.45, 76.06, 16.10, 6.12, '--node-jelly-3'],  // 53 좌측 두 번째 기둥 사이
[67.53, 73.01, 15.02, 6.08, '--node-jelly-4'],  // 54 우측 기둥 사이
[34.38, 70.30, 14.01, 5.39, '--node-jelly-5'],  // 55 좌측 세 번째 기둥
[63.97, 67.62, 13.07, 4.59, '--node-jelly-1'],  // 56 우측 세 번째 기둥
[37.52, 65.34, 12.19, 4.40, '--node-jelly-2'],  // 57 좌측 네 번째 기둥
[61.06, 63.23, 11.38, 4.16, '--node-jelly-3'],  // 58 우측 네 번째 기둥
[39.98, 61.14, 10.61, 3.97, '--node-jelly-4'],  // 59 복도 안쪽
[50.30, 59.60,  9.90, 3.33, '--node-jelly-5']   // 60 끝의 아치 앞 = 보스
],
[
[60.00, 76.50, 3.30, 5.00, '--node-jelly-1'],   // 61 연못 서안 풀밭
[64.50, 73.00, 3.25, 4.90, '--node-jelly-2'],   // 62 남안 둔덕
[69.00, 76.50, 3.20, 4.80, '--node-jelly-3'],   // 63 물가로 내려섬
[73.50, 72.50, 3.15, 4.75, '--node-jelly-4'],   // 64 바위 선반 아래
[78.00, 77.00, 3.10, 4.65, '--node-jelly-5'],   // 65 연못 동단
[83.00, 80.00, 3.05, 4.60, '--node-jelly-1'],   // 66 동쪽 바위 밑동
[87.50, 76.00, 3.00, 4.50, '--node-jelly-2'],   // 67 벚꽃나무 아래
[91.00, 71.00, 2.95, 4.45, '--node-jelly-3'],   // 68 벚꽃 숲
[94.50, 75.50, 2.90, 4.40, '--node-jelly-4'],   // 69 숲 아래 굽이
[97.50, 68.50, 2.85, 4.35, '--node-jelly-5']    // 70 동쪽 숲 끝 = 보스
],
[
[29.41, 82.64, 14.60, 4.77, '--node-jelly-1'],  // 71 복도 입구(창살 쪽)
[69.13, 80.29, 13.73, 4.95, '--node-jelly-2'],  // 72 젤리 바닥 우측
[32.35, 77.80, 12.91, 4.91, '--node-jelly-3'],  // 73 창살 앞
[66.18, 75.35, 12.14, 4.92, '--node-jelly-4'],  // 74 되꺾어 안쪽으로
[35.22, 73.15, 11.42, 4.39, '--node-jelly-5'],  // 75 창살 밑동
[63.55, 70.97, 10.74, 3.77, '--node-jelly-1'],  // 76 우측 흘러내린 젤리 앞
[37.56, 69.07, 10.10, 3.64, '--node-jelly-2'],  // 77 복도 가운데
[61.37, 67.30,  9.50, 3.47, '--node-jelly-3'],  // 78 뒤벽 쪽
[39.65, 65.57,  8.93, 3.34, '--node-jelly-4'],  // 79 창살과 뒤벽이 만나는 곳
[50.00, 64.80,  8.40, 2.83, '--node-jelly-5']   // 80 복도 끝 = 보스
],
[
[10.00, 82.82, 18.10, 5.92, '--node-jelly-1'],  // 81 앞바닥 좌단
[30.00, 82.02, 17.19, 6.20, '--node-jelly-2'],  // 82 앞줄
[50.00, 81.62, 16.33, 6.21, '--node-jelly-3'],  // 83 앞줄 중앙
[70.00, 82.02, 15.52, 6.28, '--node-jelly-4'],  // 84 앞줄
[90.00, 82.82, 14.74, 5.67, '--node-jelly-5'],  // 85 앞바닥 우단
[82.00, 75.62, 14.00, 4.92, '--node-jelly-1'],  // 86 뒷줄 우단(되꺾음)
[62.00, 74.92, 13.30, 4.80, '--node-jelly-2'],  // 87 뒷줄
[38.00, 74.92, 12.63, 4.62, '--node-jelly-3'],  // 88 뒷줄
[18.00, 75.62, 12.00, 4.49, '--node-jelly-4'],  // 89 뒷줄 좌단
[50.00, 70.42, 11.40, 3.84, '--node-jelly-5']   // 90 심장 바로 앞(줄기 못) = 보스
],
[
[27.49, 82.00, 18.70, 6.11, '--node-jelly-1'],  //  91 카펫 입구
[70.50, 77.28, 17.63, 6.36, '--node-jelly-2'],  //  92 카펫 우측
[31.55, 72.49, 16.62, 6.31, '--node-jelly-3'],  //  93 카펫 좌측
[66.41, 67.70, 15.67, 6.35, '--node-jelly-4'],  //  94 카펫 우측
[35.54, 63.16, 14.77, 5.68, '--node-jelly-5'],  //  95 카펫 좌측
[62.75, 59.16, 13.93, 4.89, '--node-jelly-1'],  //  96 카펫 우측
[38.80, 55.52, 13.13, 4.74, '--node-jelly-2'],  //  97 카펫 좌측
[59.70, 52.01, 12.38, 4.52, '--node-jelly-3'],  //  98 카펫 우측
[41.73, 49.17, 11.67, 4.37, '--node-jelly-4'],  //  99 단상 계단 앞
[50.00, 45.08, 11.00, 3.70, '--node-jelly-5']   // 100 두 왕좌 사이 단상 = 보스
]
];
for (var _mc = MAP_ANCHORS_CH.length; _mc < 10; _mc++) {
MAP_ANCHORS_CH.push(MAP_ANCHORS_CH[0]);
}
var MAP_GATES = [
[46.09, 37.96, 2.80, 4.25, '--node-jelly-1'],   //  1 초코 늪 입구 — 챕터2 방면
[83.20, 27.57, 2.80, 4.25, '--node-jelly-1'],   //  2 능선 너머 — 챕터3(사막) 방면
[55.30, 25.30, 2.80, 4.25, '--node-jelly-1'],   //  3 젤리 성 — 성벽 밑동 (0909 겹침 수리 -1.10)
[56.50, 28.50, 2.80, 4.25, '--node-jelly-1'],   //  4 성이 앉은 대지 — 5챕터 방면
[58.00, 20.50, 2.80, 4.25, '--node-jelly-1'],   //  5 젤리 성 성벽 밑동 — 6챕터 방면
[50.00, 55.60, 8.50, 3.15, '--node-jelly-1'],   //  6 회랑 끝 아치 앞 — 7챕터 방면
[92.00, 64.00, 2.80, 4.25, '--node-jelly-1'],   //  7 (B안) 벚꽃 숲 너머 — 8챕터 방면
[33.00, 61.60, 8.00, 2.96, '--node-jelly-1'],   //  8 마지막 창살 너머 — 9챕터 방면
[94.00, 71.20, 8.00, 2.96, '--node-jelly-1'],   //  9 우측 기둥 옆 — 10챕터 방면
[50.00, 40.20, 8.50, 3.15, '--node-jelly-1']    // 10 스테인드글라스 단상 — 최종 목적지
];
function mapAnchors(c) {
if (SIAN_MAP) return SIAN_SLOTS;   // 시안 판은 챕터와 무관하게 같은 6칸을 재사용한다
return MAP_ANCHORS_CH[Math.min(Math.max(1, c || mapChap), MAP_ANCHORS_CH.length) - 1];
}
function mapLowBottom(c) {
var a = mapAnchors(c), m = 0;
for (var i = 0; i < a.length; i++) { var b = a[i][1] + a[i][3] / 2; if (b > m) m = b; }
return m;
}
var MAP_CHAPTERS = [
{ img: '',                 ar: '',           zoom: 1.00, x: '0%', tint: '',        alpha: 0    },  //  1 젤리 숲
{ img: '',                 ar: '',           zoom: 1.00, x: '0%', tint: '#FFC489', alpha: 0.08 },  //  2 푸딩 산맥
{ img: '',                 ar: '',           zoom: 1.00, x: '0%', tint: '#F5A97C', alpha: 0.08 },  //  3 캔디 케인 사막
{ img: '',                 ar: '',           zoom: 1.00, x: '0%', tint: '#8FE3C8', alpha: 0.08 },  //  4 박하 언덕
{ img: '',                 ar: '',           zoom: 1.00, x: '0%', tint: '#A9713F', alpha: 0.08 },  //  5 초코 관문
{ img: '--art-map-ch06',   ar: '780/1688',   zoom: 1.00, x: '0%', tint: '',        alpha: 0    },  //  6 크림 회랑
{ img: '',                 ar: '',           zoom: 1.00, x: '0%', tint: '#E0A64B', alpha: 0.08 },  //  7 시럽 미로
{ img: '--art-map-ch08',   ar: '780/1688',   zoom: 1.00, x: '0%', tint: '#EFD9E6', alpha: 0.06 },  //  8 설탕 감옥
{ img: '--art-map-ch09',   ar: '780/1688',   zoom: 1.00, x: '0%', tint: '',        alpha: 0    },  //  9 심장의 방
{ img: '--art-map-ch10',   ar: '780/1688',   zoom: 1.00, x: '0%', tint: '',        alpha: 0    }   // 10 왕좌
];
var mapPre = {};
function mapPreloadChapterArt(c) {
if (typeof Image === 'undefined') return;
var ch = MAP_CHAPTERS[(c | 0) - 1];
if (!ch || !ch.img || mapPre[ch.img]) return;
var raw = (typeof getComputedStyle !== 'undefined' && document.documentElement)
? getComputedStyle(document.documentElement).getPropertyValue(ch.img).trim() : '';
var m = /^url\((['"]?)([^'")]+)\1\)$/.exec(raw);
if (!m || m[2].indexOf('data:') === 0) { mapPre[ch.img] = 1; return; }
mapPre[ch.img] = 1;
try { var im = new Image(); im.src = m[2]; } catch (e) { /* 화면과 무관 */ }
}
var mapChap = 1;          // 지금 보고 있는 챕터 (1-base)
var mapMoved = 0;         // 이번 포인터 제스처의 이동 거리 (탭/드래그 판정)
function chapFirst(c) { return (c - 1) * ADV_CHAPTER + 1; }
function chapMax() {
return Math.max(1, advChapter(Math.max(1, store.advMax | 0)));
}
function makeMapNode(n, slot) {
var a = mapAnchors()[slot];
var st = advStatus(n);
var b = document.createElement('button');
b.type = 'button';
b.className = 'map-node st-' + st + (advIsBoss(n) ? ' is-boss' : '');
b.setAttribute('data-n', String(n));
b.style.setProperty('--l', String(a[0]));
b.style.setProperty('--t', String(a[1]));
b.style.setProperty('--w', String(a[2]));
b.style.setProperty('--h', String(a[3]));
if (a[4]) b.style.setProperty('--disc', 'var(' + a[4] + ')');   // 시안 표에는 없다 — 그림은 CSS 가 상태로 고른다
b.style.setProperty('--slot', String(slot));
if (st === 'lock') b.setAttribute('aria-disabled', 'true');
b.setAttribute('aria-label', t('adv.nodearia', { n: n, s: advStarsOf(n) }));
var num = document.createElement('span');
num.className = 'mn-num';
num.textContent = String(n);
b.appendChild(num);
if (advIsBoss(n)) {
var cr = document.createElement('span');
cr.className = 'mn-crown';
cr.setAttribute('aria-hidden', 'true');
b.appendChild(cr);
}
if (st === 'clear') {
var got = advStarsOf(n);
var row = document.createElement('span');
row.className = 'mn-stars';
row.setAttribute('aria-hidden', 'true');
for (var s = 1; s <= 3; s++) {
var st1 = document.createElement('i');
if (s > got) st1.className = 'off';
row.appendChild(st1);
}
b.appendChild(row);
}
if (st === 'cur') {
b.id = 'map-cur';
var fl = document.createElement('span');
fl.className = 'mn-flag';
fl.setAttribute('aria-hidden', 'true');
b.appendChild(fl);
var hero = document.createElement('span');
var cid = charId();
hero.className = 'mn-hero ' + ((CHARS[cid] && CHARS[cid].cls) || 'ch-ten');
hero.setAttribute('aria-hidden', 'true');
var src = document.querySelector
? document.querySelector('#char-pick .char-card[data-char="' + cid + '"] .cav')
: null;
if (src && src.cloneNode) hero.appendChild(src.cloneNode(true));
setStdArt(hero, cid, 'full', '--map-full');
b.appendChild(hero);
}
return b;
}
function buildMap() {
var root = $('map-path');
if (!root || typeof document === 'undefined') return;
if (mapChap < 1) mapChap = 1;
if (mapChap > MAP_CHAPTERS.length) mapChap = MAP_CHAPTERS.length;
if (mapChap > chapMax()) mapChap = chapMax();
root.innerHTML = '';
var first = chapFirst(mapChap);
var anch = mapAnchors();
if (SIAN_MAP) {
if (mapPage < 0) mapPage = 0;
if (mapPage > sianPages() - 1) mapPage = sianPages() - 1;
var s0 = first + mapPage * SIAN_PER;
var s1 = Math.min(first + ADV_CHAPTER - 1, s0 + SIAN_PER - 1);
for (var k = 0; s0 + k <= s1; k++) root.appendChild(makeMapNode(s0 + k, k));
} else {
for (var i = 0; i < anch.length; i++) {
root.appendChild(makeMapNode(first + i, i));
}
}
var gate = MAP_GATES[mapChap - 1] || MAP_GATES[0];
var g = document.createElement('span');
g.className = 'map-node st-gate';
g.setAttribute('aria-hidden', 'true');
g.style.setProperty('--l', String(gate[0]));
g.style.setProperty('--t', String(gate[1]));
g.style.setProperty('--w', String(gate[2]));
g.style.setProperty('--h', String(gate[3]));
g.style.setProperty('--disc', 'var(' + gate[4] + ')');
root.appendChild(g);
var ch = MAP_CHAPTERS[mapChap - 1] || MAP_CHAPTERS[0];
mapPreloadChapterArt(mapChap + 1);
var layer = $('map-layer');
if (layer && layer.style) {
layer.style.setProperty('--bgz', String(ch.zoom));
layer.style.setProperty('--bgx', ch.x);
layer.style.setProperty('--map-n1b', (mapLowBottom(mapChap) / 100).toFixed(4));
layer.style.aspectRatio = ch.ar || '2600 / 1272';
if (ch.img) layer.style.backgroundImage = 'var(' + ch.img + ')';
else layer.style.backgroundImage = '';
var arp = String(ch.ar || '2600/1272').split('/');
if ((parseFloat(arp[0]) || 1) < (parseFloat(arp[1]) || 1)) layer.setAttribute('data-ar', 'tall');
else layer.removeAttribute('data-ar');
var view = $('map-view');
if (view && view.style) view.style.setProperty('--map-art', ch.img ? 'var(' + ch.img + ')' : 'var(--art-map-bg)');
}
var tint = $('map-tint');
if (tint && tint.style) {
tint.style.setProperty('--ch-tint', ch.tint || 'transparent');
tint.style.setProperty('--ch-tint-a', String(ch.alpha));
}
setText('map-ch-k', 'CHAPTER ' + mapChap);
setText('map-ch-n', mmName(mapChap));
var pv = $('map-ch-prev'), nx = $('map-ch-next');
var lastCh = Math.min(MAP_CHAPTERS.length, chapMax());
if (pv) pv.disabled = SIAN_MAP ? (mapChap <= 1 && mapPage <= 0) : mapChap <= 1;
if (nx) nx.disabled = SIAN_MAP ? (mapChap >= lastCh && mapPage >= sianPages() - 1) : mapChap >= lastCh;
paintCoinChip('map-stars-v');
paintChipText('map-star-v', arcComma(store.jstar | 0));
paintChipText('map-b1-v', advStarTotal() + '/' + advStarMax());   /* P3 결정 2 — 진행도는 「/최대」를 단다(별 그림에 안 걸리게 5·6·7자 단계 줄임) */
setText('map-b2-v', store.best | 0);
paintHearts();
mapFit();
}
function mmStars(c) {
var f = chapFirst(c), s = 0;
for (var i = 0; i < ADV_CHAPTER; i++) s += advStarsOf(f + i);
return s;
}
function mmClears(c) {
var f = chapFirst(c), d = 0;
for (var i = 0; i < ADV_CHAPTER; i++) if (advStatus(f + i) === 'clear') d++;
return d;
}
function mmName(c) {
var s = t('map.plate' + c) || '';
var i = s.indexOf(':');
return i >= 0 ? s.slice(i + 1).replace(/^\s+/, '') : s;
}
function setChipText(id, s) {
var el = $(id);
if (!el) return;
s = String(s || '');
var i = s.indexOf(' · ');
if (i < 0) {
if (el.hasAttribute('data-two')) { el.removeAttribute('data-two'); el.textContent = ''; }
setText(id, s);
return;
}
var k = el.querySelector('.mp-chk'), n = el.querySelector('.mp-chn');
if (!k || !n) {
el.textContent = '';
k = document.createElement('small'); k.className = 'mp-chk';
n = document.createElement('span'); n.className = 'mp-chn';
el.appendChild(k); el.appendChild(n);
}
el.setAttribute('data-two', '');
if (k.textContent !== s.slice(0, i)) k.textContent = s.slice(0, i);
if (n.textContent !== s.slice(i + 3)) n.textContent = s.slice(i + 3);
}
function buildChapCellDom(c, locked, current, ariaKey) {
var b = document.createElement('button');
b.type = 'button';
b.className = 'mm-cell ' + (locked ? 'is-lock' : (current ? 'is-cur' : 'is-open'));
b.setAttribute('data-c', String(c));
var img = (MAP_CHAPTERS[c - 1] || {}).img;
b.style.setProperty('--mm-thumb', 'var(' + (img || '--art-map-bg') + ')');
var st = mmStars(c), dn = mmClears(c);
if (locked) b.setAttribute('aria-disabled', 'true');
if (current) b.setAttribute('aria-current', 'true');
b.setAttribute('aria-label', locked ? t('aria.mmlock', { c: c })
: t(ariaKey, { c: c, s: st, d: dn }));
var th = document.createElement('span');
th.className = 'mm-thumb';
th.setAttribute('aria-hidden', 'true');
b.appendChild(th);
var k = document.createElement('b');
k.className = 'mm-k';
k.textContent = 'CHAPTER ' + c;
b.appendChild(k);
var nm = document.createElement('i');
nm.className = 'mm-n';
nm.textContent = mmName(c);
b.appendChild(nm);
var p = document.createElement('span');
p.className = 'mm-p';
var ps = document.createElement('i'), pd = document.createElement('i');
ps.textContent = '\u2605 ' + st + '/' + (ADV_CHAPTER * 3);
pd.textContent = '\u2714 ' + dn + '/' + ADV_CHAPTER;
p.appendChild(ps);
p.appendChild(pd);
b.appendChild(p);
if (locked) {
var lk = document.createElement('span');
lk.className = 'mm-lock';
lk.setAttribute('aria-hidden', 'true');
b.appendChild(lk);   /* 칸의 직속 자식(썸네일 밖) — 썸네일의 흑백 필터가 자물쇠에 번지지 않게. 자리는 썸네일 오른쪽 위(CSS) */
}
return b;
}
function chapLocked(c) { return c > chapMax(); }
function chapCellDeny(gridId, c, msg) {
var cell = document.querySelector
? document.querySelector('#' + gridId + ' .mm-cell[data-c="' + c + '"]') : null;
if (cell && cell.classList) {
cell.classList.remove('mm-shake');
void cell.offsetWidth;               /* 애니메이션 재시작 (badgePop 과 같은 처방) */
cell.classList.add('mm-shake');
}
toast(msg);
J.sfx.fail();
}
function buildMinimap() {
var g = $('mm-grid');
if (!g || typeof document === 'undefined') return;
var last = chapMax();
g.innerHTML = '';
for (var c = 1; c <= MAP_CHAPTERS.length; c++) {
g.appendChild(buildChapCellDom(c, chapLocked(c), c === mapChap, 'aria.mmcell'));
}
setText('mm-sum', t('minimap.sum', { s: advStarTotal(), c: last }));
}
function openMinimap() {
buildMinimap();
openModal('modal-minimap');
mmFitCols($('mm-grid'));   /* [Task 8d] 열 수는 보이는 격자에서 잰다 */
}
function mmFitCols(g) {
if (!g || !g.children || !g.children.length || !g.offsetWidth || typeof window === 'undefined' || !window.matchMedia) return;
var max = window.matchMedia('(min-aspect-ratio: 1/1)').matches ? 5 : 2;
for (var n = max; n >= 2; n--) {
g.setAttribute('data-cols', String(n));
if (!mmCellsOver(g)) return;
}
}
function mmCellsOver(g) {
var els = g.querySelectorAll('.mm-k, .mm-n, .mm-p');
for (var i = 0; i < els.length; i++) {
if (els[i].scrollWidth > els[i].clientWidth + 1 || els[i].scrollHeight > els[i].clientHeight + 1) return true;
}
return false;
}
function closeMinimap() { closeModal('modal-minimap'); }
function mmPick(c) {
if (!(c >= 1) || c > MAP_CHAPTERS.length) return;
if (chapLocked(c)) {
chapCellDeny('mm-grid', c, t('minimap.locked', { n: chapFirst(c) - 1 }));
return;
}
mapChap = c;
mapPage = 0;
J.sfx.ui();
closeMinimap();
buildMap();          /* 배경·틴트·노드 10·명판을 그 챕터 값으로 */
mapCenterCurrent();  /* 그 챕터의 앵커 오프셋으로 가로 스크롤 */
}
function theaterUnlocked(c) { return !chapLocked(c); }
function buildTheater() {
var g = $('th-grid');
if (!g || typeof document === 'undefined') return;
g.innerHTML = '';
for (var c = 1; c <= MAP_CHAPTERS.length; c++) {
g.appendChild(buildChapCellDom(c, !theaterUnlocked(c), false, 'aria.thcell'));
}
}
function openTheater() {
hubMark();   /* [판정판 121] 연 곳 기억 — 컷을 다 보고 돌아올 곳(theaterPick 의 hubReturn) */
buildTheater();
openModal('modal-theater');
mmFitCols($('th-grid'));   /* [Task 8d] 열 수는 보이는 격자에서 잰다 */
}
function closeTheater() { closeModal('modal-theater'); }
function theaterCutsFor(c) {
var list = CUTS_CHAP[c] || [];
if (c === 1) list = CUTS_OPEN.concat(list);
if (c === MAP_CHAPTERS.length && cutSeen('end')) list = list.concat(CUTS_END);
return list;
}
function theaterPick(c) {
if (!(c >= 1) || c > MAP_CHAPTERS.length) return;
if (!theaterUnlocked(c)) {
chapCellDeny('th-grid', c, t('theater.locked', { n: c }));
return;
}
closeTheater();
playCuts(theaterCutsFor(c), 'chap' + c, function () { syncMenu(); hubReturn(); openTheater(); });
}
function mapGoChapter(d) {
if (SIAN_MAP) {
var p = mapPage + d, c = mapChap;
if (p < 0) { c -= 1; p = sianPages() - 1; }
if (p > sianPages() - 1) { c += 1; p = 0; }
if (c < 1 || c > Math.min(MAP_CHAPTERS.length, chapMax())) { J.sfx.fail(); return; }
mapChap = c; mapPage = p;
J.sfx.ui();
buildMap();
mapCenterCurrent();
return;
}
var next = mapChap + d;
if (next < 1 || next > Math.min(MAP_CHAPTERS.length, chapMax())) { J.sfx.fail(); return; }
mapChap = next;
J.sfx.ui();
buildMap();
mapCenterCurrent();
}
var mapX = 0, mapMin = 0, mapMax = 0, mapVel = 0, mapRaf = 0, mapPtr = -1, mapDragX = 0, mapBaseX = 0, mapLastX = 0, mapLastT = 0;
function mapApply() {
var l = $('map-layer');
if (l && l.style) l.style.setProperty('--mx', mapX.toFixed(2) + 'px');
}
function mapFit() {
var v = $('map-view'), l = $('map-layer');
if (!v || !l) return;
var vw = v.clientWidth || 0, lw = l.offsetWidth || 0;
if (lw < vw) { mapMin = mapMax = Math.round((vw - lw) / 2); }
else { mapMin = vw - lw; mapMax = 0; }
if (mapX < mapMin) mapX = mapMin;
if (mapX > mapMax) mapX = mapMax;
mapApply();
}
function mapCenterCurrent(tries) {
var v = $('map-view'), l = $('map-layer');
if (!v || !l) return;
if (!(l.offsetWidth > 0)) {
var k = (tries | 0) + 1;
if (k <= 10) later(function () { mapCenterCurrent(k); }, 30);
return;
}
mapFit();
var anch = mapAnchors();
var cur = store.advMax | 0;
var slot = cur - chapFirst(mapChap);
var focus;
if (slot >= 0 && slot < anch.length) focus = anch[slot][0];
else {
var lo = anch[0][0], hi = anch[0][0];
for (var q = 1; q < anch.length; q++) {
if (anch[q][0] < lo) lo = anch[q][0];
if (anch[q][0] > hi) hi = anch[q][0];
}
focus = (lo + hi) / 2;
}
var lw = l.offsetWidth || 0, vw = v.clientWidth || 0;
mapX = vw / 2 - (focus / 100) * lw;
if (mapX < mapMin) mapX = mapMin;
if (mapX > mapMax) mapX = mapMax;
mapVel = 0;
mapApply();
}
function mapGlide() {
mapRaf = 0;
if (Math.abs(mapVel) < 5) { mapVel = 0; return; }
mapX += mapVel / 60;
if (mapX < mapMin) { mapX = mapMin; mapVel = 0; }
if (mapX > mapMax) { mapX = mapMax; mapVel = 0; }
mapVel *= 0.94;
mapApply();
if (mapVel) mapRaf = requestAnimationFrame(mapGlide);
}
function mapDown(e) {
if (mapPtr !== -1) return;
if (mapRaf) { cancelAnimationFrame(mapRaf); mapRaf = 0; }
mapVel = 0;
mapMoved = 0;
mapPtr = (e && typeof e.pointerId === 'number') ? e.pointerId : 0;
mapDragX = mapLastX = (e && e.clientX) || 0;
mapBaseX = mapX;
mapLastT = now();
var v = $('map-view');
if (v && v.classList) v.classList.add('dragging');
if (v && v.setPointerCapture && e && typeof e.pointerId === 'number'
&& e.pointerType !== 'mouse') {
try { v.setPointerCapture(e.pointerId); } catch (err) {}
}
}
function mapMove(e) {
if (mapPtr === -1) return;
var x = (e && e.clientX) || 0;
var dx = x - mapDragX;
if (Math.abs(dx) > mapMoved) mapMoved = Math.abs(dx);
mapX = mapBaseX + dx;
if (mapX < mapMin) mapX = mapMin;
if (mapX > mapMax) mapX = mapMax;
var tn = now(), dt = tn - mapLastT;
if (dt > 8) { mapVel = (x - mapLastX) / dt * 1000; mapLastX = x; mapLastT = tn; }
mapApply();
if (mapMoved > 6 && e && e.preventDefault) e.preventDefault();
}
function mapUp() {
if (mapPtr === -1) return;
mapPtr = -1;
var v = $('map-view');
if (v && v.classList) v.classList.remove('dragging');
if (mapMoved > 6 && !mapRaf) mapRaf = requestAnimationFrame(mapGlide);
else mapVel = 0;
}
function paintHearts() {
if (store.hearts < HEART_MAX) heartsTick();
setText('map-hearts-v', store.hearts);
var w = $('map-heart-t');
if (!w) return;
var ms = heartWaitMs();
w.textContent = ms > 0 ? fmtHeartWait(ms) : t('adv.heartfull');
}
function startMapTicker() {
stopMapTicker();
mapInt = setInterval(function () {
var before = store.hearts;
paintHearts();
if (store.hearts !== before) paintNodeHearts();   // 카드가 열려 있으면 같이
}, 1000);
}
function stopMapTicker() {
if (mapInt) { clearInterval(mapInt); mapInt = 0; }
}
function maybeChapCut(c) {
var list = CUTS_CHAP[c | 0];
if (!list || !list.length) return false;
var id = 'chap' + (c | 0);
if (cutSeen(id)) return false;
playCuts(list, id, function () { openMap(); });
return true;
}
function openMap() {
heartsTick();
setAppClass('adv', false);
setDanger(false);
mapChap = chapMax();
if (maybeChapCut(mapChap)) return;
if (SIAN_MAP) {
mapPage = Math.min(sianPages() - 1,
Math.floor(((Math.max(1, store.advMax | 0) - 1) % ADV_CHAPTER) / SIAN_PER));
}
mapShow();
}
function mapShow(keepX) {
buildMap();
questBadges();   /* [판정판 121] 지도 위 바 미션 배지 · 아래 줄 상점 배지(메인과 같은 부품 · 같은 값) */
shopDots();
closeAllModals();
showScreen('screen-map');
if (typeof keepX === 'number') mapKeepX(0, keepX); else mapCenterCurrent(0);
startMapTicker();
}
function mapKeepX(tries, x) {
var l = $('map-layer');
if (!l) return;
if (!(l.offsetWidth > 0)) {
var k = (tries | 0) + 1;
if (k <= 10) later(function () { mapKeepX(k, x); }, 30);
return;
}
mapX = x;
mapVel = 0;
mapFit();
}
var hubFrom = 'kingdom', hubMapX = 0;
function hubMark() {
var m = $('screen-map');
hubFrom = (m && m.classList && m.classList.contains('active')) ? 'map' : 'kingdom';
if (hubFrom === 'map') hubMapX = mapX;
}
function hubReturn() {
if (hubFrom === 'map') { heartsTick(); mapShow(hubMapX); }
else enterKingdom();
}
function leaveMap() {
stopMapTicker();
closeModal('modal-node');
syncMenu();
enterKingdom();
}
function homeScreen() { return 'screen-kingdom'; }
var KD_TAP_CAP = 10;        // 116 — 탭 보상 은퇴, 옛 저장 칸 자르기만(readStore 의 kingdom.tapToday 상한)
var KD_VISIT_JSTAR = 3;     // §26.6 방문 보상 — 하루 1회 고정 소액
var KD_DECO_SLOTS = 12;     // §26.5 고정 12슬롯
var KD_ZONES = [
{ id: 'z-plaza',  bldgs: ['castle', 'gate', 'playground'], cost: 0 },
{ id: 'z-field',  bldgs: ['arena', 'pethouse'],            cost: 30 },
{ id: 'z-market', bldgs: ['shop', 'mailbox'],              cost: 60 },
{ id: 'z-garden', bldgs: ['hall', 'gazebo'],               cost: 90 }
];
var KD_DECO = [
{ id: 'd-lamp',   zone: 'z-plaza',  cost: 5 },
{ id: 'd-bench',  zone: 'z-plaza',  cost: 5 },
{ id: 'd-fence',  zone: 'z-field',  cost: 8 },
{ id: 'd-tree',   zone: 'z-field',  cost: 8 },
{ id: 'd-stall',  zone: 'z-market', cost: 12 },
{ id: 'd-banner', zone: 'z-market', cost: 12 },
{ id: 'd-flower', zone: 'z-garden', cost: 16 },
{ id: 'd-pond',   zone: 'z-garden', cost: 16 }
];
var KD_BUILDINGS = [
{ id: 'castle',     chap: 1, key: 'kd.castle',     tone: 'purple', ic: 'crown',      hide: true, go: function () { kdSoonModal(); } },
{ id: 'circus',     chap: 1, key: 'kd.circus',     tone: 'mint',   ic: 'star-empty', bar: true,  go: function () { openTheater(); } },
{ id: 'pethouse',   chap: 1, key: 'kd.pethouse',   tone: 'orange', ic: 'heart',      hide: true, go: function () { kdSoonModal(); } },
{ id: 'shop',       chap: 1, key: 'kd.shop',       tone: 'orange', ic: 'coin',       bar: true,  go: function () { openShopScreen('gacha'); } },
{ id: 'post',       chap: 1, key: 'kd.post',       tone: 'blue',   ic: 'flag',       hide: true, go: function () { kdSoonModal(); } },
{ id: 'playground', chap: 1, key: 'kd.playground', tone: 'violet', ic: 'inf',        bar: true,  go: function () { openPlayground(); } }
];
function kdBuilding(id) {
for (var i = 0; i < KD_BUILDINGS.length; i++) if (KD_BUILDINGS[i].id === id) return KD_BUILDINGS[i];
return null;
}
function kdZone(id) {
for (var i = 0; i < KD_ZONES.length; i++) if (KD_ZONES[i].id === id) return KD_ZONES[i];
return null;
}
function kdDeco(id) {
for (var i = 0; i < KD_DECO.length; i++) if (KD_DECO[i].id === id) return KD_DECO[i];
return null;
}
function kdStore() {
if (!store.kingdom || typeof store.kingdom !== 'object') {
store.kingdom = { unlocked: [], zones: [], deco: {}, lastVisit: 0, tapToday: 0 };
}
var k = store.kingdom;
if (!Array.isArray(k.unlocked)) k.unlocked = [];
if (!Array.isArray(k.zones)) k.zones = [];
if (!k.deco || typeof k.deco !== 'object') k.deco = {};
return k;
}
function kdUnlocked(b) {
if (!b) return false;
if (kdStore().unlocked.indexOf(b.id) >= 0) return true;
return chapMax() >= (b.chap | 0 || 1);
}
function kdNeedStage(b) { return chapFirst(b.chap | 0 || 1) - 1; }
function kdSoonModal() { openModal('modal-soon'); J.sfx.ui(); }
function buildKingdom() {
var wrap = $('kd-menu'), i, b, el, n = 0;
if (wrap) {
wrap.innerHTML = '';
for (i = 0; i < KD_BUILDINGS.length; i++) {
b = KD_BUILDINGS[i];
if (b.hide || b.bar) continue;
n++;
el = document.createElement('button');
el.type = 'button';
el.className = 'kd-mbtn kd-tag kit-pill-v2';
el.id = 'kd-m-' + b.id;
el.setAttribute('data-kd', b.id);
el.setAttribute('data-tone', b.tone || 'purple');
if (b.app) el.setAttribute('data-app-only', '');
var open = kdUnlocked(b);
if (!open) el.classList.add('is-lock');
el.setAttribute('aria-disabled', open ? 'false' : 'true');
el.setAttribute('aria-label', t(b.key));
el.setAttribute('data-i18n-aria', b.key);
var ic = document.createElement('i');
ic.className = 'kd-tag-ic';
ic.setAttribute('aria-hidden', 'true');
ic.style.setProperty('--kd-ic', 'var(--lib-glyph-' + (b.ic || 'crown') + ')');
var tx = document.createElement('b');
tx.setAttribute('data-i18n', b.key);
tx.textContent = t(b.key);
el.appendChild(ic);
el.appendChild(tx);
wrap.appendChild(el);
}
wrap.hidden = !n;   /* [판정판 121] 지을 단추가 없으면 판째 숨김(빈 판의 안여백만 남지 않게) */
try { if (window.TW && window.TW.applyPlatformGates) window.TW.applyPlatformGates(wrap); } catch (e) {}
}
kdAvatarPaint();
kdSync();
}
function kdAvatarPaint() {
var fs = document.querySelectorAll('#kd-top-avatar .kd-avatar-face, #sh-avatar .kd-avatar-face');
for (var i = 0; i < fs.length; i++) fs[i].style.setProperty('--kd-face', 'var(--ch-' + charId() + '-face)');
}
function kdSync() {
setText('kd-top-hearts-v', store.hearts | 0);
var ht = $('kd-top-heart-t');
if (ht) { var ms = heartNextMs(); ht.textContent = ms > 0 ? fmtHeartWait(ms) : t('adv.heartfull'); }
paintCoinChip('kd-top-stars-v');   /* P3 결정 2 — 위 칩 = 코인 지갑(동전 그림과 값 일치) */
paintChipText('kd-top-star-v', arcComma(store.jstar | 0));
setChipText('kd-bot-ch-n', t('map.chip' + Math.min(MAP_CHAPTERS.length, chapMax())));   /* [Task 8d] en 두 줄 */
}
function kdVisit() {
var k = kdStore(), line = $('kd-visit');
var today = todayKey();
var last = k.lastVisit ? todayKey(new Date(k.lastVisit)) : '';
if (last === today) { if (line) line.hidden = true; return; }
var first = !k.lastVisit;
k.lastVisit = Date.now();
k.tapToday = 0;
if (!first) store.jstar = (store.jstar | 0) + KD_VISIT_JSTAR;
persist();
kdSync();
if (line) {
line.textContent = t(first ? 'kd.visit.first' : 'kd.visit', { n: KD_VISIT_JSTAR });
line.hidden = false;
line.dataset.first = first ? '1' : '';   /* [리뷰 m-3] setLang() 재도색이 이 값으로 같은 문장을 고른다 */
}
if (!first) J.sfx.starGet(0);
}
function enterKingdom() {
TW_PORTAL.loadingStop();     /* Task 12 — 왕국 착지 = 로딩 끝(멱등, 최초 1회만 실제 호출) */
TW_PORTAL.gameplayStop();    /* Task 12 — 메뉴로 들어옴 = 플레이 break(playing 플래그가 중복을 막는다) */
buildKingdom();
questBadges();   /* T14 I-3 — 미션 배지(#kd-mission-badge) 값을 채운다 */
shopDots();      /* 상점 배지는 buildKingdom() 이 매번 새로(숨김) 지으므로 여기서 채운다 */
showScreen(homeScreen());
kdVisit();
v74Notice();
if (splashDone) setTimeout(p3Notice, P3_NOTICE_DELAY);   /* P3 — 나중에 왕국으로 돌아올 때. 부팅 때(스플래시 밑)는 걸지 않는다 — splashDismiss 가 건다 */
}
function kdBldgTap(id) {
var b = kdBuilding(id);
if (!b || b.hide) return;
if (!kdUnlocked(b)) {
toast(t('minimap.locked', { n: kdNeedStage(b) }));
J.sfx.fail();
return;
}
J.sfx.ui();
b.go();
}
function paintNodeHearts() {
if (!advCardN) return;
heartsTick();
var empty = store.hearts <= 0;   /* [판정판 122 ⑤] 하트 줄(.node-hearts · #node-hearts-v)은 뺐다 — 하트 수는 위 바 · 시작 단추의 ♥1 */
var go = $('node-go'), wait = $('node-wait'), ad = $('node-ad');
var nodeAdOk = TW_PORTAL.env === 'crazygames' && TW_PORTAL.canReward() && adCapLeft('heart') > 0;
if (go) go.hidden = empty;
if (wait) {
wait.hidden = !(empty && !nodeAdOk);
if (!wait.hidden) wait.textContent = t('adv.heartwait', { t: fmtHeartWait(heartNextMs()) });
}
if (ad) ad.hidden = !(empty && nodeAdOk);
if (ad && empty && nodeAdOk) twSyncAdHeartLabel(ad);
}
function twSyncAdHeartLabel(el) {
if (TW_PORTAL.env === 'crazygames' && TW_PORTAL.canReward()) {
el.setAttribute('data-i18n', 'portal.watchad.heart');
el.textContent = t('portal.watchad.heart');
return;
}
el.setAttribute('data-i18n', 'adv.ad');
el.textContent = t('adv.ad');
}
function twWatchAdForHeart(btn, extraRepaint) {
if (store.hearts > 0) return;
if (adCapLeft('heart') <= 0) { toast(t('free.tomorrow')); return; }   /* P3 — 무료 탭 하트 광고와 합산 하루 3 */
if (btn) btn.disabled = true;
TW_PORTAL.requestRewardedAd('heart', function (ok) {
if (btn) btn.disabled = false;
if (ok) {
adCapUse('heart');
grantHearts(1);
toast(t('shop.heart.ok'));
paintHearts();
paintNodeHearts();
kdSync();
if (extraRepaint) extraRepaint();   // I-6 — 결과 시트 호출부의 #adv-hearts/#adv-ad 갱신
} else {
toast(t('portal.ad.fail'));
J.sfx.fail();
}
});
}
var NC_FOE_ART = { grape: 'catalog/duel-demon-full-grape.webp', soda: 'catalog/duel-demon-full-soda.webp', berry: 'catalog/duel-demon-full-straw.webp',
mint: 'catalog/duel-demon-full-mint.webp', cocoa: 'catalog/duel-demon-full-cocoa.webp' };
var FOE_ART_CUT = { grape: true, soda: true, berry: true };
function setTextEl(el, s) { if (el && el.textContent !== s) el.textContent = s; }
function ncFinishText(f) { return f ? t('finish.mission.' + f.id, { goal: f.goal | 0 }) : ''; }
function ncAtkArgs(id) {
if (id === 'blk') return { n: DUEL_SKILL_BLK };
if (id === 'mask') return { n: DUEL_SKILL_MASK, sec: fmtSec(DUEL_SKILL_MASK_MS) };
if (id === 'quake') return { n: DUEL_SKILL_QUAKE };
if (id === 'cycle') return { sec: fmtSec(DUEL_SKILL_CYCLE_MS) };
return undefined;
}
function ncDropPick(items) {
var best = null, i, r;
var rk = function (x) { return GEAR_TIERS.indexOf(x.tier); };
for (i = 0; i < items.length; i++) {
r = items[i];
if (!(r.p > 0)) continue;
if (!best || rk(r) > rk(best) || (rk(r) === rk(best) && r.p > best.p)) best = r;
}
var lead = (best && rk(best) > 0) ? best : null;
var rest = items.filter(function (x) { return x !== lead; }).sort(function (a, b) { return b.p - a.p; });
return (lead ? [lead].concat(rest) : rest).slice(0, 4);
}
function ncTeam(p) {
var root = document.querySelector('#modal-node [data-role="team"]');
if (!root) return;
var hero = root.querySelector('[data-char-role="hero"]'), pet = root.querySelector('[data-char-role="pet"]');
var hid = charId(), mid = mateId();
hero.setAttribute('data-char', hid);
setStdArt(hero, hid, 'face', '--slot-std');
hero.querySelector('.nc-rec').hidden = (p.hero !== hid);
setTextEl(root.querySelector('[data-mem="hero"] .nc-mem-nm'), t('char.' + hid + '.name'));
pet.setAttribute('data-char', mid || '');
var petMem = root.querySelector('[data-mem="pet"]');
if (petMem) petMem.hidden = !mid;
if (mid) {
setStdArt(pet, mid, 'face', '--slot-std');
setTextEl(root.querySelector('[data-mem="pet"] .nc-mem-nm'), t('char.' + mid + '.name'));
}
pet.querySelector('.nc-rec').hidden = !mid || (advPetRecommend(p) !== mid);
var mems = root.querySelectorAll('.nc-mem');
for (var mi = 0; mi < mems.length; mi++) {
var mnm = mems[mi].querySelector('.nc-mem-nm'), mk = mems[mi].querySelector('.nc-mem-k');
mems[mi].setAttribute('aria-label', (mnm ? mnm.textContent : '') + ', ' + (mk ? mk.textContent : ''));
}
}
function ncBodyMore() {
var b = document.querySelector('#modal-node .nc-body');
if (!b) return;
var more = b.scrollHeight - b.clientHeight - Math.ceil(b.scrollTop) > 0;
if (more) { if (!b.hasAttribute('data-more')) b.setAttribute('data-more', ''); }
else if (b.hasAttribute('data-more')) b.removeAttribute('data-more');
}
function ncInfoToggle(ev) {
var b = ev && ev.currentTarget, cid = b && b.getAttribute('aria-controls'), more = cid && document.getElementById(cid);
if (!more) return;
more.hidden = !more.hidden;
b.setAttribute('aria-expanded', more.hidden ? 'false' : 'true');
J.sfx.ui();
}
function openNodeCard(n) {
var p = advPlan(n);
advCardN = n;
setText('node-title', t(p.boss ? 'adv.bossn' : 'adv.stagen', { n: n }));
setText('node-mission', missionText(p.mission));
var liMis = $('node-i-mis');
if (liMis) liMis.hidden = !p.mission;      /* B2 — 미션이 없으면 줄도 없다 */
var bw = $('node-boss');
if (bw) {
bw.hidden = !p.boss;
if (p.boss) {
var bav = $('node-boss-av');
if (bav) bav.className = 'node-boss-av bs-' + p.bossDef.id;
setText('node-boss-n', bossName(p.bossDef));
setText('node-boss-c', bossIntroLine(p));
}
}
var hb = $('node-hand');
if (hb) {
hb.innerHTML = '';
var bits = advHandBits(p);
for (var i = 0; i < bits.length; i++) {
var chip = document.createElement('span');
chip.className = 'node-chip';
chip.textContent = bits[i];
hb.appendChild(chip);
}
}
setText('node-hero-n', t('char.' + p.hero + '.name'));
var av = $('node-hero-av');
if (av) {
av.innerHTML = '';
av.className = 'node-hero-av ' + ((CHARS[p.hero] && CHARS[p.hero].cls) || 'ch-ten');
var src = document.querySelector
? document.querySelector('#char-pick .char-card[data-char="' + p.hero + '"] .cav')
: null;
if (src && src.cloneNode) av.appendChild(src.cloneNode(true));
setStdArt(av, p.hero, 'thumb', '--slot-std');
}
var star2Need = advStar2Need(p);          /* 0910 탄별 계수 — 판정과 같은 함수 */
var liHp = $('node-i-hp'), liAtk = $('node-i-atk');
var foeDef = p.boss && p.bossDef ? p.bossDef : duelFoeDef(p.n);
if (liHp) {
liHp.hidden = false;
if (liHp.classList) liHp.classList.toggle('is-boss', !!p.boss);
setText('node-hp-v', TW_BATTLE
? (fmtNum(duelFoeHpMax(p.n)) + ' / ' + duelNeedHits(p.n) + '\uD0C0')
: fmtNum(p.boss ? bossHpMax(p.n) : duelFoeHpMax(p.n)));
}
if (liAtk) {
liAtk.hidden = false;
if (liAtk.classList) liAtk.classList.toggle('is-boss', !!p.boss);
setText('node-atk-v', bossAtkText(foeDef, p.n));   /* ★ ⑦ P3 */
}
var liCond = $('node-i-cond');
if (liCond) {
liCond.hidden = !p.boss;
if (p.boss) setText('node-cond-v', bossCondText(p.bossDef));
}
var bestV = store.advBest[String(n)] | 0;
setText('node-best-v', bestV > 0 ? fmtNum(bestV) : '—');
var recAtk = advPetRecAtk(p);
var recKey = recAtk ? 'node.recpet' : 'node.rec';
var recK = $('node-rec-k');
if (recK) recK.setAttribute('data-i18n', recKey);
setText('node-rec-k', t(recKey));
setText('node-rec-v', recAtk ? t('rec.why.atk.' + recAtk) : t('rec.why.' + p.hero));
var petId = advPetRecommend(p), liPet = $('node-i-pet');
if (liPet) liPet.hidden = !petId;
if (petId) setText('node-pet-v', t('char.' + petId + '.name'));
var petAv = $('node-pet-av');
if (petAv) {
petAv.innerHTML = '';
petAv.className = 'ni-pet-av' + (petId && CHARS[petId] ? ' ' + (CHARS[petId].cls || '') : '');
if (petId) {
var pcl = cavClone(petId); if (pcl) petAv.appendChild(pcl);
setStdArt(petAv, petId, 'thumb', '--slot-std');   /* 투명셋이 있으면 PNG 가 이긴다 · [64-fix3 ⑦] face → thumb(초상 칩과 같은 아이콘) */
}
}
setText('node-star1', t('adv.star1'));
setText('node-star2', t('adv.star2', { n: fmtNum(star2Need) }));
setText('node-star3', t('adv.star3', {
n: fmtNum(advStar3Need(p)), t: advTenNeed(p.n)
}));
var have = advStarsOf(n);
for (var si = 1; si <= 3; si++) {
var slot = $('node-s' + si);
if (slot && slot.classList) slot.classList.toggle('got', si <= have);
}
var got = $('node-got');
if (got) {
got.hidden = have <= 0;
got.textContent = advStarStr(have);
}
buildNodeMates();
var go = $('node-go');
if (go) go.setAttribute('data-n', String(n));
var foe = p.boss && p.bossDef ? p.bossDef : duelFoeDef(p.n);
var cardEl = $('modal-node');
setTextEl(cardEl.querySelector('.nc-chap'), mmName(advChapter(p.n)));
var gotS = advStarsOf(p.n), starEls = cardEl.querySelectorAll('.nc-stars i');
for (var si = 0; si < starEls.length; si++) starEls[si].classList.toggle('on', si < gotS);
var starBox = cardEl.querySelector('.nc-stars');
if (starBox) starBox.setAttribute('aria-label', t('node.stars.got', { s: gotS }));
var art = cardEl.querySelector('.nc-foe-art');
var artId = NC_FOE_ART[foe.id] ? foe.id : 'grape';
if (art) {
art.style.setProperty('background-image', 'url("' + NC_FOE_ART[artId] + '")');
art.toggleAttribute('data-cut', !!FOE_ART_CUT[artId]);   /* [수정 2회차] 아래가 잘린 그림만 발 가림 */
}
setTextEl(cardEl.querySelector('.nc-foe-name'), bossName(foe));
setTextEl(cardEl.querySelector('.nc-hp-v'), fmtNum(duelFoeHpMax(p.n)));
var atkId = bossAtkIdOf(foe, p.n);
setTextEl(cardEl.querySelector('.nc-atk-n'), t('boss.atk.' + atkId));
var atkMore = cardEl.querySelector('.nc-atk-d');   /* [판정판 122 ②] 설명 = 칩 바로 아래 접힌 줄 — 다시 열면 접힌다(아래 ⓘ aria-expanded 되돌림과 짝) */
setTextEl(atkMore, t('boss.atk.' + atkId + '.d', ncAtkArgs(atkId)));
if (atkMore) atkMore.hidden = true;
var fin = p.boss ? bossFinishOf(p.n) : null;
setTextEl(cardEl.querySelector('.nc-clear-t'), fin
? t('node.clear.boss', { fsec: fmtSec(DUEL_FINISH_MS), mis: ncFinishText(fin) })
: t('node.clear', { sec: p.sec }));
var more = cardEl.querySelector('.nc-clear-more');
if (more) { more.hidden = true; more.textContent = [t('node.clear.timeout')].concat(
p.boss && p.bossDef ? [t('node.cond') + ' \u00B7 ' + bossCondText(p.bossDef)] : [], [t('adv.star1'),
t('adv.star2', { n: fmtNum(advStar2Need(p)) }) + ' \u00B7 ' + t('adv.miss.ease'),
t('adv.star3', { n: fmtNum(advStar3Need(p)), t: advTenNeed(p.n) })]).join('\n'); }
var handRow = cardEl.querySelector('.nc-hand');
if (handRow) {
var hbits = advHandBits(p);
handRow.innerHTML = '';
hbits.forEach(function (b) {
var hc = document.createElement('span');
hc.className = 'nc-hc kit-pill-v2 kit-pill-v2--chip';
hc.textContent = b;
handRow.appendChild(hc);
});
handRow.hidden = !hbits.length;
}
var infoBs = cardEl.querySelectorAll('.nc-info');   /* [판정판 122 ②] ⓘ 둘(악당 기술 · 클리어 줄) */
for (var ibi = 0; ibi < infoBs.length; ibi++) infoBs[ibi].setAttribute('aria-expanded', 'false');
var dt = dropTableFor(p.n), own = (store.items && store.items.own) || {}, list = cardEl.querySelector('.nc-drop-list');
if (list) {
list.innerHTML = '';
ncDropPick(dt.items).forEach(function (r) {
var li = document.createElement('li');
li.className = 'nc-drop';
li.setAttribute('data-item', r.id);
li.setAttribute('data-tier', r.tier);
var lv = own[r.id] | 0;
li.setAttribute('aria-label', t('item.' + r.id + '.nm') + ', ' + t('drops.tier.' + r.tier) + ', ' + t('stat.k' + (STAT_KEYS.indexOf(r.stat) + 1))
+ (lv > 0 ? ', ' + t('drops.lv', { lv: lv, max: ITEM_LV_MAX }) : '') + ', ' + t('drops.chance', { p: pctTxt(r.p) }));
li.appendChild(itemTile(r.id, { tier: r.tier, lv: lv, size: 64 }));
var pc = document.createElement('b'); pc.className = 'nc-p'; pc.textContent = pctTxt(r.p) + '%'; li.appendChild(pc);
list.appendChild(li);
});
}
var all = cardEl.querySelector('.nc-all');
if (all) { setTextEl(all, t('node.drops.all', { k: dt.items.length })); all.onclick = function () { openDrops(p.n); }; }
ncTeam(p);
paintNodeHearts();
openModal('modal-node');
var ncb = cardEl.querySelector('.nc-body');
if (ncb) ncb.scrollTop = 0;
}
function buildNodeMates() {
var box = $('node-mates');
if (!box || typeof document === 'undefined') return;
box.innerHTML = '';
var cur = mateId();
var ids = [''].concat(MATE_IDS);
for (var i = 0; i < ids.length; i++) {
var id = ids[i];
var b = document.createElement('button');
b.type = 'button';
b.className = 'nmate' + (id ? ' ' + ((CHARS[id] && CHARS[id].cls) || '') : ' nm-none');
b.setAttribute('role', 'radio');
b.setAttribute('aria-checked', id === cur ? 'true' : 'false');
b.setAttribute('data-mate', id);
b.setAttribute('aria-label', id ? t('char.' + id + '.name') : t('mate.none.name'));
if (id) {
var av = cavClone(id);
if (av) b.appendChild(av);
setStdArt(b, id, 'face', '--slot-std');   /* 14차 수리 8 (§26-3b) */
} else {
var x = document.createElement('span');
x.className = 'nmate-x';
x.setAttribute('aria-hidden', 'true');
x.textContent = '—';
b.appendChild(x);
}
box.appendChild(b);
}
}
var inkCtx = null;
function inkWidthOf(txt, cs) {
if (!txt) return 0;
if (!inkCtx) {
try { inkCtx = document.createElement('canvas').getContext('2d'); } catch (e) { inkCtx = null; }
}
if (!inkCtx) return 0;
inkCtx.font = cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily;
var m = inkCtx.measureText(txt);
var w = (m.actualBoundingBoxLeft || 0) + (m.actualBoundingBoxRight || 0);
if (!(w > 0)) w = m.width || 0;
var ls = parseFloat(cs.letterSpacing) || 0;
var sw = parseFloat(cs.webkitTextStrokeWidth || cs.getPropertyValue('-webkit-text-stroke-width')) || 0;
return w + ls * Math.max(0, txt.length - 1) + sw;
}
function fitStageBadge(el) {
if (!el) return;
var txt = el.textContent || '';
if (!txt) return;
el.style.removeProperty('--bp-stage-fs');   // 언제나 정본 자에서 다시 시작한다
for (var pass = 0; pass < 4; pass++) {
var cs = window.getComputedStyle(el);
var avail = el.clientWidth
- (parseFloat(cs.paddingLeft) || 0)
- (parseFloat(cs.paddingRight) || 0);
if (!(avail > 0)) return;
var ink = inkWidthOf(txt, cs);
if (!(ink > avail)) return;
var r0 = parseFloat(cs.getPropertyValue('--bp-stage-fs')) || 0;
if (!r0) return;
el.style.setProperty('--bp-stage-fs',
String(Math.floor(r0 * (avail / ink) * 0.98 * 1e5) / 1e5));
}
}
var badgeFontHooked = false;
function setStageBadge(id, n) {
var el = $(id);
if (!el) return;
el.setAttribute('data-digits', String(n).length);
setText(id, t('adv.stagebadge', { n: n }));
fitStageBadge(el);
if (!badgeFontHooked && window.document && document.fonts && document.fonts.ready) {
badgeFontHooked = true;
try {
document.fonts.ready.then(function () { fitStageBadge($(id)); });
} catch (e) { /* 서체 API 가 없으면 첫 맞춤 하나로 산다 */ }
}
}
function syncModeSheet() {
setStageBadge('mode-adv-b', Math.max(1, store.advMax | 0));
syncArcadeSheet();
}
function openPlayground() { openModal('modal-playground'); J.sfx.ui(); }
function closePlayground() { closeModal('modal-playground'); }
function modeSheetArcadeOnly(on) {
var m = $('modal-mode'), adv = $('mode-adv'), h = $('mode-h');
if (!m) return;
if (on) m.setAttribute('data-arcade-only', ''); else m.removeAttribute('data-arcade-only');
if (adv) adv.hidden = !!on;
if (h) {
h.setAttribute('data-i18n', on ? 'mode.title.arcade' : 'mode.title');
h.textContent = t(on ? 'mode.title.arcade' : 'mode.title');
}
}
function openModeSheet(opt) {
modeSheetArcadeOnly(!!(opt && opt.arcadeOnly));
openModal('modal-mode');
syncModeSheet();
J.sfx.ui();
}
function closeModeSheet() { closeModal('modal-mode'); modeSheetArcadeOnly(false); }
function resumeLast() {
J.sfx.ui();
if (store.save) { startEndless(false); return; }
openAdventure();
}
function classicSkillsOn() { return !!store.classicSkills; }
function syncClassicSheet() {
var on = classicSkillsOn();
var tg = $('classic-skills');
if (tg) {
tg.setAttribute('aria-pressed', on ? 'true' : 'false');
tg.textContent = t(on ? 'settings.on' : 'settings.off');
}
var lead = $('classic-lead');
if (lead) lead.textContent = t(on ? 'classic.lead.on' : 'classic.lead');
var bA = on ? store.best : store.bestClassic;
var bR = on ? store.bestRush : store.bestClassicRush;
setText('classic-arcade-b', bA > 0 ? String(bA) : '');
setText('classic-rush-b', bR > 0 ? String(bR) : '');
setText('classic-daily-b', (on ? dailyDoneToday() : classicDailyDoneToday()) ? '✅' : '');
}
function toggleClassicSkills() {
store.classicSkills = !store.classicSkills;
persist();
J.sfx.ui();
syncClassicSheet();
}
function openClassicHub() {
syncClassicSheet();
openModal('modal-classic');
J.sfx.ui();
}
function closeClassicHub() { closeModal('modal-classic'); }
var CUTS_OPEN = [
['o1',  '--art-menu-day',   'center',      '',              1, '',                  ''],
['o2',  '--art-menu-day',   '30% center',  '',              1, '',                  ''],
['o3',  '--art-menu-night', '30% center',  '',              1, '',                  ''],
['o4',  '--art-menu-night', '30% center',  '--ch-boss-full',1, '',                  'boss'],
['o5',  '--art-menu-night', 'center',      '--ch-boss-full',1, 'rgba(96,62,132,.5)','boss'],
['o6',  '--art-menu-night', 'center',      '--ch-jelly-full',1,'rgba(96,62,132,.4)','jelly'],
['o7',  '--art-menu-night', 'center',      '--ch-jelly-full',1,'rgba(78,48,120,.62)','jelly'],
['o8',  '--art-menu-night', '70% center',  '--ch-boss-full',-1,'rgba(78,48,120,.5)','boss'],
['o9',  '--art-stage',      'center',      '',              1, '',                  ''],
['o10', '--art-stage',      'center',      '',              1, '',                  'bros'],
['o11', '--art-stage',      'center',      '--ch-ppyak-full',1,'',                  'mates'],
['o11b','--art-throne',     'center',      '--ch-mungchi-full',1,'',                'mungchi'],
['o12', '--art-map-bg',     'center',      '',             -1,'',                  '']
];
var CUTS_SORTIE = {
ten: [
['t1', '--art-map-bg', '30% center', '',             1, '', 'ten'],
['t2', '--art-stage',  'center',     '',              1, '', 'ten'],
['t3', '--art-map-bg', '18% center', '--ch-ten-full', 1, '', 'ten']
],
twin: [
['w1', '--art-map-bg', '30% center', '',           1, '', 'twin'],
['w2', '--art-stage',  'center',     '',               1, '', 'twin'],
['w3', '--art-map-bg', '18% center', '--ch-twin-full', 1, '', 'twin']
],
jelly: [
['p1', '--art-menu-night', 'center', '--ch-jelly-full', 1, 'rgba(78,48,120,.62)', ''],
['p2', '--art-menu-night', 'center', '--ch-jelly-full', 1, 'rgba(120,48,84,.55)', 'jelly'],
['p3', '--art-menu-night', 'center', '--art-cut-smirk', 1, 'rgba(150,40,60,.30)', 'jelly'],
['p3b','--art-prison',     'center', '--art-cut-smirk', 1, 'rgba(150,40,60,.22)', 'jelly'],
['p3c','--art-prison',     'center', '--art-cut-smirk', 1, 'rgba(150,40,60,.14)', 'jelly', 1],
['p4', '--art-map-bg',     '18% center', '--art-cut-kick', 1, '',                 'jelly']
]
};
var CUTS_CHAP = {
1: [
['c1a',  '--art-map-bg', '0% center',  '',                1, '',                   ''],
['c1a2', '--art-map-bg', '0% center',  '',                1, '',                   ''],
['c1b',  '--art-map-bg', '0% center',  '--ch-boss-full',  1, 'rgba(96,62,132,.38)', 'boss'],
['c1b2', '--art-map-bg', '0% center',  '--ch-boss-full',  1, 'rgba(96,62,132,.38)', 'boss'],
['c1c',  '--art-map-bg', '0% center',  '--ch-ten-full',   1, '',                    'ten']
],
2:  [['c2a',  '--art-map-bg', '45% center', '', 1, '',                    ''],
['c2a2', '--art-map-bg', '45% center', '', 1, '',                    '']],
3:  [['c3a',  '--art-map-bg', '55% center', '', 1, 'rgba(96,62,132,.22)', ''],
['c3b',  '--art-map-bg', '55% center', '', 1, 'rgba(96,62,132,.30)', '']],
4:  [['c4a',  '--art-map-bg', '20% center', '', 1, '',                    '']],
5:  [['c5a',  '--art-map-bg', '68% center', '--ch-boss-full', 1, 'rgba(78,48,120,.30)', 'boss'],
['c5a2', '--art-map-bg', '68% center', '--ch-boss-full', 1, 'rgba(78,48,120,.30)', 'boss']],
6:  [['c5b',  '--art-map-bg',  '68% center', '--ch-jelly-full', 1, 'rgba(78,48,120,.42)', 'jelly', 0, 'jelly'],
['c6a',  '--art-corridor', 'center',    '',                1, '',                    '']],
7:  [['c7a',  '--art-map-bg',   '75% center', '', 1, '', '']],
8:  [['c8a',  '--art-prison',   'center',     '', 1, '', ''],
['c8a2', '--art-prison',   'center',     '', 1, '', ''],
['c8b',  '--art-prison',   'center',     '', 1, '', '']],
9:  [['c9a',  '--art-heart-room', 'center',   '', 1, '', ''],
['c9a2', '--art-heart-room', 'center',   '', 1, '', '']],
10: [['c10a', '--art-throne',   'center', '--ch-boss-full', 1, 'rgba(78,48,120,.30)', 'boss']]
};
var CUTS_END = [
['c10b',  '--art-throne', 'center', '', 1, '', '', 1, 'jelly'],
['c10b2', '--art-throne', 'center', '', 1, '', '']
];
var CUTS_FREE = [
['p3d','--art-prison', 'center',     '--art-cut-smirk',1, 'rgba(150,40,60,.30)', 'jelly'],
['p3e','--art-prison', 'center',     '--art-cut-smirk',1, 'rgba(150,40,60,.22)', 'jelly'],
['p3f','--art-prison', 'center',     '--art-cut-smirk',1, 'rgba(150,40,60,.14)', 'jelly', 1],
['p4', '--art-map-bg', '18% center', '--art-cut-kick', 1, '', 'jelly'],
['f0', '--art-map-bg', 'center',     '',               1, '', 'bros'],
['f1', '--art-map-bg', 'center',     '',               1, '', 'jelly'],
['f2', '--art-map-bg', 'center',     '',               1, '', 'ten', 1]
];
var cutList = null, cutIdx = 0, cutId = '', cutDone = null, cutPend = '';
var cutChain = false;
function cutSeen(id) { return !!(store.seenCuts && store.seenCuts[id]); }
function cutMark(id) {
if (!store.seenCuts) store.seenCuts = {};
store.seenCuts[id] = 1;
persist();
}
function anyCutSeen() {
var s = store.seenCuts || {};
for (var k in s) { if (Object.prototype.hasOwnProperty.call(s, k) && s[k]) return true; }
return false;
}
function playCuts(list, id, after) {
if (!list || !list.length) { if (after) after(); return; }
cutList = list;
cutIdx = 0;
cutId = id || '';
cutDone = after || null;
closeAllModals();
showScreen('screen-story');
cutSyncSkipAll();
cutBuildDots();
cutPaint();
}
function cutSyncSkipAll() {
var b = $('cut-skipall');
if (b) b.hidden = !cutChain;
}
function cutBuildDots() {
var d = $('cut-dots');
if (!d || typeof document === 'undefined') return;
d.innerHTML = '';
for (var i = 0; i < cutList.length; i++) d.appendChild(document.createElement('i'));
}
function cutPaint() {
var c = cutList && cutList[cutIdx];
if (!c) return;
var bg = $('cut-bg'), cast = $('cut-cast'), veil = $('cut-veil');
if (bg && bg.style) {
bg.style.setProperty('--cut-img',
'var(--cut-' + c[0] + '-img, var(' + c[1] + '))');
bg.style.setProperty('--cut-pos', c[2]);
}
if (cast && cast.style) {
cast.setAttribute('data-empty', c[3] ? '0' : '1');
cast.style.setProperty('--cut-cast', c[3] ? 'var(' + c[3] + ')' : 'none');
cast.style.setProperty('--cut-flip', String(c[4]));
}
if (veil && veil.style) veil.style.setProperty('--cut-veil', c[5] || 'transparent');
setText('cut-who', c[6] ? t('cut.who.' + c[6]) : '');
setText('cut-line', t('cut.' + c[0]));
var d = $('cut-dots');
if (d && d.children) {
for (var i = 0; i < d.children.length; i++) {
if (d.children[i].classList) d.children[i].classList.toggle('on', i === cutIdx);
}
}
if (c[7] && J && typeof J.screenPulse === 'function') J.screenPulse();
if (c[8] && J && J.sfx && typeof J.sfx.voice === 'function') J.sfx.voice(c[8], 4);
}
function cutNext() {
if (!cutList) return;
if (cutIdx >= cutList.length - 1) { cutFinish(false); return; }
cutIdx++;
J.sfx.select();
cutPaint();
}
function cutFinish(skipped) {
if (!cutList) return;
if (cutId) cutMark(cutId);
cutList = null;
var f = cutDone;
cutDone = null;
if (skipped) J.sfx.ui();
if (f) f();
else { syncMenu(); enterKingdom(); }   /* [KD57-0911] 컷이 끝나면 홈 = 왕국 */
}
function cutFinishAll() {
if (!cutList) return;
cutMark('open');
for (var k in CUTS_SORTIE) {
if (Object.prototype.hasOwnProperty.call(CUTS_SORTIE, k)) cutMark('sortie-' + k);
}
cutMark('chap' + chapMax());
cutChain = false;
cutFinish(true);
}
function openAdventure() {
if (cutSeen('open')) { openMap(); return; }
cutChain = true;
playCuts(CUTS_OPEN, 'open', function () {
cutPend = 'sortie';
openCharPanel();
});
}
function afterCharPick() {
if (cutPend !== 'sortie') return false;
cutPend = '';
var id = charId();
if (cutSeen('sortie-' + id)) { cutChain = false; openMap(); return true; }
var list = CUTS_SORTIE[id] || CUTS_SORTIE.ten;
playCuts(list, 'sortie-' + id, function () { cutChain = false; openMap(); });
return true;
}
var STAT_KEYS = ['power', 'steady', 'agility', 'luck'];
var STAT_BASE = {
ten:       { power: 6, steady: 2, agility: 2, luck: 2 },
twin:      { power: 2, steady: 2, agility: 6, luck: 2 },
jelly:     { power: 2, steady: 2, agility: 2, luck: 6 },
pudding:   { power: 3, steady: 6, agility: 2, luck: 1 },
sodawitch: { power: 2, steady: 4, agility: 1, luck: 5 }
};
var STAT_UNIT_H = { power: 330, agility: 270, steady: 150, luck: 75 };
var STAT_UNIT = {
power: STAT_UNIT_H.power / 10000, agility: STAT_UNIT_H.agility / 10000,
steady: STAT_UNIT_H.steady / 10000, luck: STAT_UNIT_H.luck / 10000
};
var STAT_BAR_MAX = 12;       // 막대 상한 = 기본 최대 6 + 장비 최대 6 (수치안 §4-1)
var JACKPOT_MULT = 3;        // 잭팟 배수 (스펙 §G2 권고 ×3)
var SKILL_JP_ADD = 0.20;     // 젤리 타임: 잭팟 확률 +20%p (수치안 §5-1 J1)
var SKILL_SODA_MULT = 1.4;   // 탄산 주문: 모든 매치 ×1.4 확정 (수치안 §5-1 W1)
var STAT_LV_MAX = 12;        // 세이브 소독 상한만 남았다 — readStore 의 statLv 칸(74 는 statLv 를 안 읽는다, 착수 전 점검 P19)
function statEff(id) {
var base = STAT_BASE[id] || STAT_BASE.ten;
var it = itemStatBonus(id);
var out = {}, i, k;
for (i = 0; i < STAT_KEYS.length; i++) {
k = STAT_KEYS[i];
out[k] = clamp((base[k] | 0) + (it[k] | 0), 0, STAT_BAR_MAX);
}
return out;
}
var STAT_RES = { mult: 1, det: 1, jp: false, own: false };
function statMult(noBonus, va, vb) {
var r = STAT_RES;
if (noBonus || isDaily()) { r.mult = 1; r.det = 1; r.jp = false; r.own = false; return r; }
var id = charId(), e = statEff(id);
var k = matchKind(va, vb);
var both = skillOn('summon');   // 왕자의 축복 · 쌍둥이 맹세 · 푸딩 방패: 모든 매치에 텐·트윈 둘 다
var pw = both || k === 'sum10', ag = both || k === 'same';
var det = 1 + e.steady * STAT_UNIT.steady +
(pw ? e.power * STAT_UNIT.power : 0) +
(ag ? e.agility * STAT_UNIT.agility : 0);
if (skillOn('soda')) det *= SKILL_SODA_MULT;
var p = e.luck * STAT_UNIT.luck + (skillOn('jellytime') ? SKILL_JP_ADD : 0);
var hit = jackpotRoll() < p;
r.det = det;
r.jp = hit;
r.mult = hit ? det * JACKPOT_MULT : det;
r.own = (id === 'ten') ? pw : (id === 'twin' ? ag : true);
return r;
}
var SHARD_PITY = 20;
var SHARD_HOLD_MAX = 999999;
var ITEM_CHAIN_MULT     = 1.08;   // I12 — 74: +20% 는 콤보가 안 끊겨 상시 = 기본 점수 13점급(과함) → +8%(수치안 §4-3)
var ITEM_CHAIN_COMBO    = 3;      // I12 그 문턱
var ITEM_FIRST_MULT     = 3;      // I13 firstcharm    — 판 첫 채점 매치
var ITEM_LAST_MULT      = 1.40;   // I14 lastcharm     — 막판 점수
var ITEM_LAST_SEC       = 10;     // I14 그 막판의 길이(초)
var ITEM_CROSS_GAUGE_K  = 0.50;   // I11 crossnecklace — 교차 사슬 전진 시 각성 추가 적립
var ITEM_SLOTS = ['weapon', 'aux', 'trinket'];
var ITEM_TIER_EFF = { common: 1, rare: 2, epic: 3 };   // §11.6-B 일반/희귀/영웅
var ITEM_LV_MAX = 12;      // 세이브 소독용 안전 상한 (STAT_LV_MAX 와 같은 이유)
var ITEM_POOL = [
{ id: 'flint',        kind: 'stat', stat: 'power',   tier: 'common', slot: 'weapon',  ico: '✨' },
{ id: 'fizzjelly',    kind: 'stat', stat: 'power',   tier: 'rare',   slot: 'weapon',  ico: '🎆' },
{ id: 'flamescepter', kind: 'stat', stat: 'power',   tier: 'epic',   slot: 'weapon',  ico: '🔱' },
{ id: 'softcushion',  kind: 'stat', stat: 'steady',  tier: 'common', slot: 'aux',     ico: '☁' },
{ id: 'puddingarmor', kind: 'stat', stat: 'steady',  tier: 'rare',   slot: 'aux',     ico: '🍮' },
{ id: 'turtleshield', kind: 'stat', stat: 'steady',  tier: 'epic',   slot: 'aux',     ico: '🛡' },
{ id: 'windribbon',   kind: 'stat', stat: 'agility', tier: 'common', slot: 'trinket', ico: '🎀' },
{ id: 'sodaboots',    kind: 'stat', stat: 'agility', tier: 'rare',   slot: 'trinket', ico: '🥾' },
{ id: 'boltshoes',    kind: 'stat', stat: 'agility', tier: 'epic',   slot: 'trinket', ico: '👟' },
{ id: 'rabbitfoot',   kind: 'stat', stat: 'luck',    tier: 'common', slot: 'trinket', ico: '🐇' },
{ id: 'luckybell',    kind: 'stat', stat: 'luck',    tier: 'rare',   slot: 'trinket', ico: '🔔' },
{ id: 'goldclover',   kind: 'stat', stat: 'luck',    tier: 'epic',   slot: 'trinket', ico: '🍀' },
{ id: 'heatshard',     kind: 'stat', stat: 'power',   tier: 'rare', slot: 'weapon',  ico: '🔥', codex: 'I09' },   /* 74 — 「텐 매치 +15%」 행동형 → 텐 파워 스탯형(희귀)으로 흡수(스펙 §B ①-b) */
{ id: 'twinmirror',    kind: 'stat', stat: 'agility', tier: 'rare', slot: 'trinket', ico: '🪞', codex: 'I10' },  /* 74 — 「트윈 매치 +15%」 → 트윈 파워 스탯형(희귀) */
{ id: 'crossnecklace', kind: 'act', stat: 'agility', tier: 'epic', slot: 'trinket', ico: '📿', enabled: true,  codex: 'I11' },
{ id: 'chainbracelet', kind: 'act', stat: 'power',   tier: 'rare', slot: 'trinket', ico: '⛓',      enabled: true,  codex: 'I12' },
{ id: 'firstcharm',    kind: 'act', stat: 'luck',    tier: 'rare', slot: 'trinket', ico: '🎯', enabled: true,  codex: 'I13' },
{ id: 'lastcharm',     kind: 'act', stat: 'luck',    tier: 'epic', slot: 'trinket', ico: '⏳',      enabled: true,  codex: 'I14' },
{ id: 'awakecatalyst', kind: 'act', stat: 'agility', tier: 'epic', slot: 'trinket', ico: '⭐',      enabled: false, codex: 'I15', eff: '각성 적립 +25%' },
{ id: 'puddingcharm',  kind: 'act', stat: 'steady',  tier: 'rare', slot: 'aux',     ico: '🍮', enabled: true,  codex: 'I16' }
];
function itemById(id) {
for (var i = 0; i < ITEM_POOL.length; i++) {
if (ITEM_POOL[i].id === id) return ITEM_POOL[i];
}
return null;
}
var ITEM_ART = {
flint:         { 256: 'catalog/item-flint@256.webp',         96: 'catalog/item-flint@96.webp',         64: 'catalog/item-flint@64.webp' },
fizzjelly:     { 256: 'catalog/item-fizzjelly@256.webp',     96: 'catalog/item-fizzjelly@96.webp',     64: 'catalog/item-fizzjelly@64.webp' },
flamescepter:  { 256: 'catalog/item-flamescepter@256.webp',  96: 'catalog/item-flamescepter@96.webp',  64: 'catalog/item-flamescepter@64.webp' },
heatshard:     { 256: 'catalog/item-heatshard@256.webp',     96: 'catalog/item-heatshard@96.webp',     64: 'catalog/item-heatshard@64.webp' },
softcushion:   { 256: 'catalog/item-softcushion@256.webp',   96: 'catalog/item-softcushion@96.webp',   64: 'catalog/item-softcushion@64.webp' },
puddingarmor:  { 256: 'catalog/item-puddingarmor@256.webp',  96: 'catalog/item-puddingarmor@96.webp',  64: 'catalog/item-puddingarmor@64.webp' },
turtleshield:  { 256: 'catalog/item-turtleshield@256.webp',  96: 'catalog/item-turtleshield@96.webp',  64: 'catalog/item-turtleshield@64.webp' },
puddingcharm:  { 256: 'catalog/item-puddingcharm@256.webp',  96: 'catalog/item-puddingcharm@96.webp',  64: 'catalog/item-puddingcharm@64.webp' },
windribbon:    { 256: 'catalog/item-windribbon@256.webp',    96: 'catalog/item-windribbon@96.webp',    64: 'catalog/item-windribbon@64.webp' },
sodaboots:     { 256: 'catalog/item-sodaboots@256.webp',     96: 'catalog/item-sodaboots@96.webp',     64: 'catalog/item-sodaboots@64.webp' },
boltshoes:     { 256: 'catalog/item-boltshoes@256.webp',     96: 'catalog/item-boltshoes@96.webp',     64: 'catalog/item-boltshoes@64.webp' },
twinmirror:    { 256: 'catalog/item-twinmirror@256.webp',    96: 'catalog/item-twinmirror@96.webp',    64: 'catalog/item-twinmirror@64.webp' },
rabbitfoot:    { 256: 'catalog/item-rabbitfoot@256.webp',    96: 'catalog/item-rabbitfoot@96.webp',    64: 'catalog/item-rabbitfoot@64.webp' },
luckybell:     { 256: 'catalog/item-luckybell@256.webp',     96: 'catalog/item-luckybell@96.webp',     64: 'catalog/item-luckybell@64.webp' },
goldclover:    { 256: 'catalog/item-goldclover@256.webp',    96: 'catalog/item-goldclover@96.webp',    64: 'catalog/item-goldclover@64.webp' },
crossnecklace: { 256: 'catalog/item-crossnecklace@256.webp', 96: 'catalog/item-crossnecklace@96.webp', 64: 'catalog/item-crossnecklace@64.webp' },
chainbracelet: { 256: 'catalog/item-chainbracelet@256.webp', 96: 'catalog/item-chainbracelet@96.webp', 64: 'catalog/item-chainbracelet@64.webp' },
firstcharm:    { 256: 'catalog/item-firstcharm@256.webp',    96: 'catalog/item-firstcharm@96.webp',    64: 'catalog/item-firstcharm@64.webp' },
lastcharm:     { 256: 'catalog/item-lastcharm@256.webp',     96: 'catalog/item-lastcharm@96.webp',     64: 'catalog/item-lastcharm@64.webp' }
};
var ITEM_ART_SIL = { weapon: 'catalog/slot-ic-skill.webp', aux: 'catalog/slot-ic-skin.webp', trinket: 'catalog/slot-ic-item.webp' };
function itemArtUrl(id, size) {
var it = itemById(id);
if (!it) return '';
var sz = (size === 256 || size === 64) ? size : 96;
var row = ITEM_ART[id];
return (row && row[sz]) ? row[sz] : (ITEM_ART_SIL[it.slot] || ITEM_ART_SIL.trinket);
}
function itemArtCss(id, size) {
var u = itemArtUrl(id, size);
return u ? ('url("' + u + '")') : 'none';
}
var ITILE_EMPTY_ART = { weapon: 'flamescepter', aux: 'puddingcharm', trinket: 'windribbon' };
function itileArtSet(el, id, size) {
var u1 = itemArtUrl(id, size);
if (!u1) return;
el.style.backgroundImage = 'url("' + u1 + '")';
var u2 = size === 256 ? '' : itemArtUrl(id, 256);
if (!u2 || u2 === u1) return;
var set = 'url("' + u1 + '") 1x, url("' + u2 + '") 2x';
el.style.backgroundImage = '-webkit-image-set(' + set + ')';
el.style.backgroundImage = 'image-set(' + set + ')';
}
function itemTile(id, o) {
o = o || {};
var empty = !!o.empty;
var neutral = !empty && !!o.art;
var it = (id && !neutral) ? itemById(id) : null;
var slot = neutral ? '' : (o.slot || (it ? it.slot : ''));
var lv = o.lv | 0;
var size = (o.size === 64 || o.size === 256) ? o.size : 96;
var el = document.createElement('span');
el.className = 'itile';
el.setAttribute('aria-hidden', 'true');
el.setAttribute('data-tier', (empty || neutral) ? 'none' : (o.tier || (it ? it.tier : 'none')));
el.setAttribute('data-state', empty ? 'empty' : (neutral ? 'neutral' : (o.eq ? 'eq' : 'own')));
if (slot) el.setAttribute('data-slot', slot);
var art = document.createElement('i');
art.className = 'itile-art';
if (neutral) art.style.backgroundImage = 'url("' + o.art + '")';
else {
var artId = empty ? (ITILE_EMPTY_ART[slot] || '') : id;
if (artId) itileArtSet(art, artId, size);
}
el.appendChild(art);
if (!empty && lv > 0) {
var b = document.createElement('b');
b.className = 'itile-lv';
b.textContent = t('tile.lv', { lv: lv });
el.appendChild(b);
}
if (!empty && o.eq) {
var q = document.createElement('i');
q.className = 'itile-eq';
q.textContent = '✓';
el.appendChild(q);
}
if (o.sel) {
el.setAttribute('data-sel', '');
var sv = document.createElement('i');
sv.className = 'itile-sel';
sv.setAttribute('aria-hidden', 'true');
el.appendChild(sv);
}
return el;
}
function itemEffOf(id, lv) {
var it = itemById(id);
if (!it) return 0;
var n = clamp(lv | 0, 1, ITEM_LV_MAX);
return ITEM_TIER_EFF[it.tier] + Math.floor(n / 4);
}
function itemsEq(charKey) {
var m = (store && store.items && store.items.eq) ? store.items.eq[charKey] : null;
return Array.isArray(m) ? m : [];
}
function itemStatBonus(charKey) {
var out = {}, i;
for (i = 0; i < STAT_KEYS.length; i++) out[STAT_KEYS[i]] = 0;
var eq = itemsEq(charKey), own = (store.items && store.items.own) || {};
for (i = 0; i < eq.length; i++) {
var it = itemById(eq[i]);
if (!it) continue;
if (it.kind !== 'stat') continue;
var lv = own[eq[i]] | 0;
if (lv <= 0) continue;
out[it.stat] += itemEffOf(eq[i], lv);
}
return out;
}
function itemOn(id) {
if (!featuresOn()) return false;
var own = (store.items && store.items.own) || {};
if ((own[id] | 0) <= 0) return false;
var eq = itemsEq(charId());
for (var i = 0; i < eq.length; i++) if (eq[i] === id) return true;
return false;
}
function itemScoreMult(va, vb) {
if (!featuresOn()) return 1;
var m = 1;
if ((S.combo | 0) >= ITEM_CHAIN_COMBO && itemOn('chainbracelet')) m *= ITEM_CHAIN_MULT;  // I12
if ((S.matches | 0) === 0 && itemOn('firstcharm')) m *= ITEM_FIRST_MULT;  // I13
var lastLeft = (S.mode === 'adv') ? advLeftMs() : (isRush() ? rushLeftMs() : 0);
if (lastLeft > 0 && lastLeft <= ITEM_LAST_SEC * 1000 && itemOn('lastcharm')) m *= ITEM_LAST_MULT;   // I14
return m;
}
var ITEM_SRC = ['farm', 'gacha', 'gift', 'shop'];   /* 74 — 획득 원천: 파밍 · 뽑기(P3) · 선물(P4) · 상점 특가(P3). 74 가 실제로 쓰는 값은 'farm' 뿐 */
function itemSrcOf(v) { return (v === 'gacha' || v === 'gift' || v === 'shop') ? v : 'farm'; }   /* 모르는 값·빈 값 = 'farm' — 리터럴 비교라 readStore 가 먼저 돌아도 같다 */
function grantItem(id, src) {
var it = itemById(id);
if (!it) return null;
if (it.enabled === false) return null;
var own = store.items.own;
var had = own[id] | 0;
var lv = clamp(had + 1, 1, ITEM_LV_MAX);
own[id] = lv;
if (!store.items.src || typeof store.items.src !== 'object') store.items.src = {};
store.items.src[id] = itemSrcOf(src);   /* 74 — 획득 원천(P3 뽑기·특가 상점·P4 선물과 합칠 자리) */
if (!had) {
var cid = charId(), eq = itemsEq(cid).slice(), used = {}, j;
for (j = 0; j < eq.length; j++) {
var e = itemById(eq[j]);
if (e) used[e.slot] = 1;
}
if (!used[it.slot] && eq.length < ITEM_SLOTS.length) {
eq.push(id);
store.items.eq[cid] = eq;
}
}
return { id: id, lv: lv, isNew: !had, tier: it.tier, stat: it.stat };
}
var GACHA_KINDS = ['item', 'gold', 'friend', 'skin'];
var GACHA_TAB_KINDS = ['item', 'gold', 'friend'];
var GACHA_PRICE = { item: 150, item10: 1350, gold: 30, friend: 20, skin: SKIN_COST_ROYAL };   /* 코인 · 코인 · 별 · 별 · 별(스킨 = 정본 스킨 값 하나 — 경제 무변) */
var GACHA_CUR = { item: 'coin', gold: 'star', friend: 'star', skin: 'star' };
var GACHA_TEN = 10;
var GACHA_TIER_P = { item: { common: 0.75, rare: 0.22, epic: 0.03 }, gold: { rare: 0.85, epic: 0.15 } };
var GACHA_TEN_UP = { rare: 0.88, epic: 0.12 };        /* 10회: 앞 9칸이 전부 일반이면 10번째 */
var GACHA_FRIEND_W = { common: 6, rare: 3, epic: 1 };  /* 남은 친구끼리 나누는 무게 */
var GACHA_FRIEND_TIER = { mongle: 'common', tiktok: 'common', churup: 'common',
kkultteok: 'rare', sseokssak: 'rare', mukmul: 'rare',
banjjak: 'epic', bangul: 'epic', jelly: 'epic' };   /* = 초대 사다리 0~12 / 16~25 / 30~45★ 순서 */
var GACHA_TIERS = ['common', 'rare', 'epic'];
var GACHA_SKIN_TIER = 'rare';   /* [rc1009] 스킨 줄의 액자 색(결과 카드 · 돔 · 후보 격자) — 겉모습일 뿐 등급이 아니다(확률 창 등급 절 없음, 지휘자 판정 Q3) */
function gachaItemsOf(tier) {
var out = [], i;
for (i = 0; i < ITEM_POOL.length; i++) if (ITEM_POOL[i].tier === tier && ITEM_POOL[i].enabled !== false) out.push(ITEM_POOL[i].id);
return out;
}
function friendOwned(id) { return charOwned(id); }
function friendRowsOf(ids) {
var rows = [], W = 0, i, tier;
for (i = 0; i < ids.length; i++) W += GACHA_FRIEND_W[GACHA_FRIEND_TIER[ids[i]]];
for (i = 0; i < ids.length; i++) { tier = GACHA_FRIEND_TIER[ids[i]]; rows.push({ id: ids[i], tier: tier, p: W ? GACHA_FRIEND_W[tier] / W : 0 }); }
return rows;
}
function gachaSkinsOf() {
var out = [], k, i, list;
for (k in SKINS) {
if (!Object.prototype.hasOwnProperty.call(SKINS, k) || !heroUnlocked(k)) continue;
list = SKINS[k];
for (i = 0; i < list.length; i++) if (list[i].cost > 0 && !list[i].soon) out.push(list[i]);
}
return out;
}
function skinThumbCss(sid) {
var sk = skinById(sid), v = sk ? ((sk.art && sk.art.thumb) || sk.img || '') : '';
return v ? ('var(' + v + ')') : '';
}
function skinNameOf(sid) { var sk = skinById(sid); return sk ? t(sk.name) : ''; }
function skinEmptyKey(tb) { return (tb && tb.all > 0) ? 'gacha.skin.all' : 'gacha.skin.none'; }
function grantSkin(sid) {
var sk = skinById(sid);
if (!sk || sk.soon || skinOwned(sk)) return false;
store.skins.push(sk.id);
persist();
return true;
}
function gachaTable(kind) {
p3Ensure();
var tb = { kind: kind, cur: GACHA_CUR[kind], price: GACHA_PRICE[kind], ten: kind === 'item' ? GACHA_PRICE.item10 : 0,
tiers: [], rows: [], pity: 0, pityAt: 0, left: 0, all: 0 };
var i, j, tier, ids, p, n;
if (kind === 'skin') {   /* [rc1009] 남은 후보끼리 같은 무게(각 1/남은 수) · 등급 절 없음(tiers 빈 배열) · 천장 · 10회 없음 */
var sks = gachaSkinsOf();
tb.all = sks.length;
for (i = 0; i < sks.length; i++) if (!skinOwned(sks[i])) tb.rows.push({ id: sks[i].id, tier: GACHA_SKIN_TIER, p: 0 });
tb.left = tb.rows.length;
for (i = 0; i < tb.rows.length; i++) tb.rows[i].p = 1 / tb.left;
return tb;
}
if (kind === 'friend') {
var left = [];
for (i = 0; i < GACHA_FRIEND_IDS.length; i++) if (!friendOwned(GACHA_FRIEND_IDS[i])) left.push(GACHA_FRIEND_IDS[i]);
tb.all = GACHA_FRIEND_IDS.length;
tb.left = left.length;
tb.rows = friendRowsOf(left);
for (j = 0; j < GACHA_TIERS.length; j++) {
tier = GACHA_TIERS[j]; p = 0; n = 0;
for (i = 0; i < tb.rows.length; i++) if (tb.rows[i].tier === tier) { p += tb.rows[i].p; n++; }
if (n) tb.tiers.push({ tier: tier, p: p, n: n, each: p / n });
}
return tb;
}
var TP = GACHA_TIER_P[kind] || {};
for (j = 0; j < GACHA_TIERS.length; j++) {
tier = GACHA_TIERS[j];
if (!TP[tier]) continue;
ids = gachaItemsOf(tier);
tb.tiers.push({ tier: tier, p: TP[tier], n: ids.length, each: ids.length ? TP[tier] / ids.length : 0 });
for (i = 0; i < ids.length; i++) tb.rows.push({ id: ids[i], tier: tier, p: TP[tier] / ids.length });
}
tb.pityAt = (kind === 'item') ? GACHA_ITEM_PITY : GACHA_GOLD_PITY;
tb.pity = (kind === 'item') ? (store.gacha.itemPity | 0) : (store.gacha.goldPity | 0);
return tb;
}
function gachaPick(rows, rng) {
var u = rng(), acc = 0;
for (var i = 0; i < rows.length; i++) { acc += rows[i].p; if (u < acc) return rows[i]; }
return rows[rows.length - 1];
}
function gachaDrawItem(tb, rng, forced) {
var tierRows = [], i;
if (forced === 'epic') tierRows = [{ tier: 'epic', p: 1 }];
else if (forced === 'up') tierRows = [{ tier: 'rare', p: GACHA_TEN_UP.rare }, { tier: 'epic', p: GACHA_TEN_UP.epic }];
else for (i = 0; i < tb.tiers.length; i++) tierRows.push({ tier: tb.tiers[i].tier, p: tb.tiers[i].p });
var tier = gachaPick(tierRows, rng).tier, inTier = [];
for (i = 0; i < tb.rows.length; i++) if (tb.rows[i].tier === tier) inTier.push({ id: tb.rows[i].id, tier: tier, p: 0 });
for (i = 0; i < inTier.length; i++) inTier[i].p = 1 / inTier.length;
return gachaPick(inTier, rng);
}
function gachaPull(kind, count, rng) {
var r = (typeof rng === 'function') ? rng : Math.random;
var tb = gachaTable(kind), out = [], g = store.gacha, i, k;
if (kind === 'skin') {   /* [rc1009] 1회만 — 표의 p 그대로(표시 = 추첨) */
if (tb.rows.length) { var sp = gachaPick(tb.rows, r); out.push({ id: sp.id, tier: sp.tier, how: '' }); }
return out;
}
if (kind === 'friend') {
var rows = tb.rows, ids;
for (i = 0; i < count && rows.length; i++) {
var f = gachaPick(rows, r);                       /* 첫 칸은 표의 p 그대로 — 표시 = 추첨 */
out.push({ id: f.id, tier: f.tier, how: '' });
ids = [];
for (k = 0; k < rows.length; k++) if (rows[k].id !== f.id) ids.push(rows[k].id);
rows = friendRowsOf(ids);                         /* 다음 칸(count > 1)은 남은 친구로 같은 도우미가 다시 나눈다(수정 1회차 M-7) */
}
return out;
}
var cap = (kind === 'item') ? GACHA_ITEM_PITY : GACHA_GOLD_PITY, allCommon = true;
for (i = 0; i < count; i++) {
var pityNow = (kind === 'item') ? g.itemPity : g.goldPity, forced = '', how = '';
if (pityNow >= cap) { forced = 'epic'; how = 'pity'; }
else if (kind === 'item' && count === GACHA_TEN && i === GACHA_TEN - 1 && allCommon) { forced = 'up'; how = 'ten'; }
var d = gachaDrawItem(tb, r, forced);
if (d.tier !== 'common') allCommon = false;
if (d.tier === 'epic') { if (kind === 'item') g.itemPity = 0; else g.goldPity = 0; }
else if (kind === 'item') g.itemPity = Math.min(cap, (g.itemPity | 0) + 1);
else g.goldPity = Math.min(cap, (g.goldPity | 0) + 1);
out.push({ id: d.id, tier: d.tier, how: how });
}
return out;
}
function grantFriend(id, src) {
if (GACHA_FRIEND_IDS.indexOf(id) < 0 || friendOwned(id)) return false;
if (id === 'jelly') { store.jellyOn = true; syncCharPick(); }
else if (!grantPet(id, true)) return false;
if (src === 'gacha' || src === 'gift') store.gacha.petSrc[id] = src;
persist();
return true;
}
function gachaBuy(kind, count, how, rng) {
if (GACHA_KINDS.indexOf(kind) < 0) return { err: 'bad' };
p3Ensure();
var n = (kind === 'item' && count === GACHA_TEN) ? GACHA_TEN : 1, g = store.gacha, cur = GACHA_CUR[kind], cost = 0;
if (kind === 'friend' && gachaTable('friend').left <= 0) return { err: 'allfriends' };
if (kind === 'skin' && gachaTable('skin').left <= 0) return { err: 'allskins' };   /* [rc1009] 후보 0 은 차감 전에 거른다 */
if (kind !== 'friend' && kind !== 'skin') {   /* 수정 1회차 M-4 — 어느 등급이든 켜진 장비가 0종이면 차감 **전**에 거른다(빈 등급에서 추첨이 던지면 코인만 사라진다) */
var tiers = gachaTable(kind).tiers, ti;
for (ti = 0; ti < tiers.length; ti++) if (!(tiers[ti].n > 0)) return { err: 'bad' };
}
if (how === 'free') { if (kind !== 'item' || n !== 1 || g.freeDay === todayKey()) return { err: 'used' }; }
else if (how === 'first') {
if (n !== 1 || kind === 'gold' || kind === 'skin') return { err: 'used' };
if (kind === 'item' ? g.firstItem : g.firstFriend) return { err: 'used' };
} else if (how === 'ad') { if (n !== 1 || kind === 'gold' || kind === 'skin') return { err: 'bad' }; }
else if (how === 'coin' || how === 'star') {
if (how !== cur) return { err: 'bad' };
cost = (n === GACHA_TEN) ? GACHA_PRICE.item10 : GACHA_PRICE[kind];
var have = (cur === 'coin') ? coinBalance() : (store.jstar | 0);
if (have < cost) return { err: cur, need: cost - have };
} else return { err: 'bad' };
if (cost > 0 && !(cur === 'coin' ? coinSpend(cost, 'gacha-' + kind) : starSpend(cost, 'gacha-' + kind))) {
return { err: cur, need: cost - (cur === 'coin' ? coinBalance() : (store.jstar | 0)) };   /* 수정 1회차 M-3 — 검사 단계와 같은 뜻(모자란 양) */
}
if (how === 'free') g.freeDay = todayKey();
if (how === 'first') { if (kind === 'item') g.firstItem = 1; else g.firstFriend = 1; }
var picks = gachaPull(kind, n, rng), items = [], i, res;
for (i = 0; i < picks.length; i++) {
if (kind === 'friend') {
res = { id: picks[i].id, tier: picks[i].tier, isNew: grantFriend(picks[i].id, 'gacha'), friend: true };   /* 수정 1회차 M-1 — 합류가 안 됐으면 isNew false */
} else if (kind === 'skin') {
res = { id: picks[i].id, tier: picks[i].tier, isNew: grantSkin(picks[i].id), skin: true };   /* [rc1009] 지급만 — 장착은 안 한다 */
} else {
res = grantItemOrRefund(picks[i].id, 'gacha') || { id: picks[i].id, tier: picks[i].tier, lv: 0 };
}
res.how = picks[i].how;
items.push(res);
}
g.log.push({ t: Date.now(), k: kind, h: how, r: items.map(function (x) { return x.id + ':' + x.tier + ':' + (x.lv | 0); }) });
if (g.log.length > GACHA_LOG_MAX) g.log.splice(0, g.log.length - GACHA_LOG_MAX);
persist();
return { ok: true, kind: kind, n: n, how: how, items: items };
}
var P3_DUP_STAR = 10;
var dupTray = null;
function friendDupMsg(id) { return t('gacha.dup.star', { name: t('char.' + id + '.name'), n: P3_DUP_STAR }); }
function friendDupPay(id, quiet) {
var g = store.gacha;
if (!g || !g.petSrc[id] || g.dupPaid[id]) return false;
if (!starGrant(P3_DUP_STAR, 'dup-friend')) return false;
g.dupPaid[id] = 1;
persist();
if (quiet) return true;
if (dupTray) dupTray.push(id);
else toast(friendDupMsg(id));
return true;
}
var MK_GEAR_LO = MK_AWK_HI;   // 장비 과일 띠 시작 = 각성 띠 끝(= 펫 .03 + 스킬 .015 + 각성 .015) — 띠 경계의 출처는 하나
var MK_GEAR_BUF = [];         // 매치 경로가 장비 과일을 모아 두는 버퍼 하나(resolveMatch 가 매치마다 비워 다시 쓴다)
var GEAR_RATE_MAX = 0.085;    // 띠 끝이 선물 상자 띠(MK_GIFT_LO .145)를 넘지 않는 상한
var GEAR_RATE_CH = [0.0043, 0.0043, 0.0043, 0.0057, 0.0057, 0.0057, 0.0071, 0.0071, 0.0071, 0.0086];   // 챕터별 스폰 칸당 = 목표 판당 평균 ÷ 70(아래 GEAR_AVG_CH 주석) — Task 10 하네스
var GEAR_TIER_CH = [[90, 10, 0], [90, 10, 0], [90, 10, 0], [75, 22, 3], [75, 22, 3], [75, 22, 3],
[60, 32, 8], [60, 32, 8], [60, 32, 8], [50, 38, 12]];            // [일반, 희귀, 영웅] % (스펙 §D-2)
var GEAR_LEAD_CYCLE = ['power', 'agility', 'steady', 'luck'];   // 챕터 우세 스탯: 텐 → 트윈 → 기본 → 잭팟 순환
var GEAR_LEAD_P = 40;                                           // 우세 스탯 %, 나머지 셋 20%씩
var GEAR_BOSS_TIER = [0, 60, 40];                               // 보스 클리어 확정 1개 — 4챕부터
var GEAR_BOSS_TIER_EARLY = [0, 100, 0];                         // 1~3챕 보스 — 영웅은 4챕부터(스펙 §D-2 티어 게이트)
var GEAR_AVG_CH = [0.3, 0.3, 0.3, 0.4, 0.4, 0.4, 0.5, 0.5, 0.5, 0.6];   // 판당 평균(표시) = rate 설계 기대값 70 × rate. 70 = 판당 수확 ÷ rate(0.03 대표본 57 · 0.01 표본 72 · 0.0045 대 표본 69.5, 낮은 rate 일수록 70 으로 모인다) — Task 10 하네스
var GEAR_TIERS = ['common', 'rare', 'epic'];
var GEAR_TIER_TOK = { common: '--role-rw-shard-steady-3', rare: '--role-rw-shard-agility-3', epic: '--role-rw-item-3' };
var GEAR_TIER_INK = { common: '', rare: '', epic: '' };   // JS 연출 색 — 부팅 때 gearInkInit() 이 위 토큰에서 한 번 채운다(JS 색 리터럴 0, 점검 W7)
function gearInkInit() {
var cs = null;
try { cs = getComputedStyle(document.documentElement); } catch (e) { cs = null; }
for (var k in GEAR_TIER_TOK) {
if (Object.prototype.hasOwnProperty.call(GEAR_TIER_TOK, k)) GEAR_TIER_INK[k] = cs ? String(cs.getPropertyValue(GEAR_TIER_TOK[k]) || '').trim() : '';
}
}
function gearChapter(n) {
var c = advChapter(n) | 0;
return c < 1 ? 1 : (c > GEAR_TIER_CH.length ? GEAR_TIER_CH.length : c);
}
var GEAR_POOL = null;
var GEAR_POOL_NONE = [];
function gearPoolInit() {
var tbl = {}, i, j, k;
for (i = 0; i < STAT_KEYS.length; i++) {
tbl[STAT_KEYS[i]] = {};
for (j = 0; j < GEAR_TIERS.length; j++) {
var arr = [];
for (k = 0; k < ITEM_POOL.length; k++) {
var it = ITEM_POOL[k];
if (it.kind === 'stat' && it.enabled !== false && it.stat === STAT_KEYS[i] && it.tier === GEAR_TIERS[j]) arr.push(it.id);
}
tbl[STAT_KEYS[i]][GEAR_TIERS[j]] = arr;
}
}
GEAR_POOL = tbl;
}
function gearPool(stat, tier) {
if (!GEAR_POOL) gearPoolInit();   /* 부팅 단계가 먼저 돌지만, 그 앞에서 불려도 같은 표가 선다 */
var row = GEAR_POOL[stat];
return (row && row[tier]) || GEAR_POOL_NONE;
}
function dropTableFor(n) {
var ch = gearChapter(n), tp = GEAR_TIER_CH[ch - 1];
var lead = GEAR_LEAD_CYCLE[(ch - 1) % GEAR_LEAD_CYCLE.length];
var tiers = { common: tp[0] / 100, rare: tp[1] / 100, epic: tp[2] / 100 };
var statP = {}, items = [], i, j, q;
for (i = 0; i < STAT_KEYS.length; i++) {
statP[STAT_KEYS[i]] = (STAT_KEYS[i] === lead ? GEAR_LEAD_P : (100 - GEAR_LEAD_P) / 3) / 100;
}
for (i = 0; i < GEAR_TIERS.length; i++) {
var tr = GEAR_TIERS[i];
if (!(tiers[tr] > 0)) continue;
for (j = 0; j < STAT_KEYS.length; j++) {
var pool = gearPool(STAT_KEYS[j], tr);
for (q = 0; q < pool.length; q++) {
items.push({ id: pool[q], tier: tr, stat: STAT_KEYS[j], p: tiers[tr] * statP[STAT_KEYS[j]] / pool.length });
}
}
}
var bt = advIsBoss(n) ? (ch >= 4 ? GEAR_BOSS_TIER : GEAR_BOSS_TIER_EARLY) : null;
return {
n: n, chapter: ch, lead: lead, rate: Math.min(GEAR_RATE_MAX, GEAR_RATE_CH[ch - 1]),
tiers: tiers, statP: statP, items: items, avg: GEAR_AVG_CH[ch - 1],
boss: bt ? { common: bt[0] / 100, rare: bt[1] / 100, epic: bt[2] / 100 } : null,
use: { pet: MK_PET_RATE, star: MK_STAR_RATE, awk: MK_AWK_RATE },
gift: isGachaStage(n) ? { stageP: GACHA_STAGE_P, item: GACHA_OPEN_WEIGHTS.item, rare: GACHA_OPEN_WEIGHTS.rare } : null
};
}
function gearRollFrom(tiers, statP, rng) {
var r1 = rng(), r2 = rng(), r3 = rng();
var tier = r1 < tiers.common ? 'common' : (r1 < tiers.common + tiers.rare ? 'rare' : 'epic');
var acc = 0, stat = STAT_KEYS[STAT_KEYS.length - 1];
for (var i = 0; i < STAT_KEYS.length; i++) { acc += statP[STAT_KEYS[i]]; if (r2 < acc) { stat = STAT_KEYS[i]; break; } }
var pool = gearPool(stat, tier);
return { id: pool.length ? pool[Math.min(pool.length - 1, (r3 * pool.length) | 0)] : '', tier: tier, stat: stat };
}
function gearRoll(n, rng) { var d = dropTableFor(n); return gearRollFrom(d.tiers, d.statP, rng); }
function gearBossRoll(n, rng) { var d = dropTableFor(n); return d.boss ? gearRollFrom(d.boss, d.statP, rng) : null; }
var dropsN = 0;
function pctTxt(p) { return String(Math.round((+p || 0) * 1000) / 10); }
var DROPS_USE_ART = { pet: 'catalog/medal-pet-v3-90.webp', star: 'catalog/medal-awaken-v3-90.webp',
awk: 'catalog/medal-special-v3-90.webp', gift: 'catalog/lib-glyph-giftbox.webp' };   /* 중립 칸 그림(itemTile o.art) */
function dropsTab(which) {
var tabs = document.querySelectorAll('#modal-drops .dr-tab');
for (var i = 0; i < tabs.length; i++) {
var on = tabs[i].getAttribute('data-dtab') === which;
tabs[i].setAttribute('aria-selected', on ? 'true' : 'false');
if (on) tabs[i].removeAttribute('data-variant'); else tabs[i].setAttribute('data-variant', 'soft');
}
var g = $('dr-sec-gear'), u = $('dr-sec-use');
if (g) g.hidden = which !== 'gear';
if (u) u.hidden = which !== 'use';
var body = document.querySelector('#modal-drops .dr-body');
if (body) body.scrollTop = 0;
}
function dropsUseRow(key, name, desc, pill) {
var li = document.createElement('li');
li.className = 'dr-urow';
li.setAttribute('data-use', key);
li.appendChild(itemTile(null, { art: DROPS_USE_ART[key] }));   /* 중립 칸(data-state neutral · 수정 1회차 A3a — 소비처가 그림 배경을 덮어쓰던 길은 은퇴) */
var bx = document.createElement('span'); bx.className = 'dr-ub';
var b = document.createElement('b'); b.className = 'dr-un'; b.textContent = name; bx.appendChild(b);
var s = document.createElement('span'); s.className = 'dr-ud'; s.textContent = desc; bx.appendChild(s);   /* 제목 + 문장 — 콜론 공식 금지(점검 W1) */
var p = document.createElement('span'); p.className = 'dr-up kit-pill-v2'; p.setAttribute('data-variant', 'soft'); p.textContent = pill; bx.appendChild(p);   /* 확률 알약 = 크림 알약 부품(soft 변주) — 설명 아래 */
li.appendChild(bx);
li.setAttribute('aria-label', name + ', ' + desc + ', ' + pill);
return li;
}
function openDrops(n) {
var d = dropTableFor(n), own = (store.items && store.items.own) || {}, i;
dropsN = n;
setText('drops-title', t('drops.title', { n: n }));
setText('dr-cap', t('drops.gear.cap', { r: pctTxt(d.rate), a: d.avg }));
var chips = $('dr-chips');
if (chips) {
chips.innerHTML = '';
for (i = 0; i < GEAR_TIERS.length; i++) {
var tr = GEAR_TIERS[i], c = document.createElement('span');
c.className = 'tchip';
c.setAttribute('data-tier', tr);
if (!(d.tiers[tr] > 0)) c.setAttribute('data-zero', '');
var cl = document.createElement('i'); cl.textContent = t('drops.tier.' + tr); c.appendChild(cl);
var cv = document.createElement('b'); cv.textContent = t('drops.chance', { p: pctTxt(d.tiers[tr]) }); c.appendChild(cv);
chips.appendChild(c);
}
}
var bs = $('dr-boss');
if (bs) { bs.hidden = !d.boss; if (d.boss) setText('dr-boss-sub', t('drops.boss.sub', { r: pctTxt(d.boss.rare), e: pctTxt(d.boss.epic) })); }
var ul = $('dr-items');
if (ul) {
ul.innerHTML = '';
var rows = d.items.slice().sort(function (a, b) { return (GEAR_TIERS.indexOf(b.tier) - GEAR_TIERS.indexOf(a.tier)) || (b.p - a.p); });
for (i = 0; i < rows.length; i++) {
var r = rows[i], lv = own[r.id] | 0, nm = t('item.' + r.id + '.nm');
var li = document.createElement('li');
li.className = 'dr-cell';
li.setAttribute('data-item', r.id);
li.setAttribute('data-tier', r.tier);
li.setAttribute('aria-label', nm + ', ' + t('drops.tier.' + r.tier) + ', ' + t('stat.k' + (STAT_KEYS.indexOf(r.stat) + 1))
+ (lv > 0 ? ', ' + t('drops.lv', { lv: lv, max: ITEM_LV_MAX }) : '') + ', ' + t('drops.chance', { p: pctTxt(r.p) }));
li.appendChild(itemTile(r.id, { tier: r.tier, lv: lv, size: 96 }));
var b = document.createElement('b'); b.className = 'dr-name'; b.textContent = nm; li.appendChild(b);
var pc = document.createElement('span'); pc.className = 'dr-p'; pc.textContent = t('drops.chance', { p: pctTxt(r.p) }); li.appendChild(pc);
ul.appendChild(li);
}
}
var use = $('dr-use');
if (use) {
use.innerHTML = '';
['pet', 'star', 'awk'].forEach(function (k) {
use.appendChild(dropsUseRow(k, t('drops.use.' + k), t('drops.use.' + k + '.d'), t('drops.use.p', { x: pctTxt(d.use[k]) })));
});
if (d.gift) {
var gr = dropsUseRow('gift', t('drops.gift.h'), t('drops.gift.d', { i: pctTxt(d.gift.item), x: pctTxt(d.gift.rare) }),
t('drops.gift.p', { p: pctTxt(d.gift.stageP) }));
gr.id = 'dr-gift';
var gs = gr.querySelector('.dr-ud'); if (gs) gs.id = 'dr-gift-sub';
use.appendChild(gr);
}
}
dropsTab('gear');   /* 창을 다시 열면 장비 과일로 돌아온다 */
openModal('modal-drops');
J.sfx.ui();
}
function closeDrops() { dropsN = 0; closeModal('modal-drops'); J.sfx.ui(); }
function harvestGear(g, x, y, quiet) {
var it = g && g.id ? itemById(g.id) : null;
if (!it) return null;
var own = (store.items && store.items.own) || {};
var had = own[g.id] | 0, res;
if (had >= ITEM_LV_MAX) {
var back = GACHA_REFUND[it.tier || g.tier] | 0, before = coinBalance();
if (back > 0) store.coin = Math.min(COIN_MAX, before + back);
res = { id: g.id, lv: had, tier: g.tier, max: true, isNew: false, refund: coinBalance() - before };
} else {
var gr = grantItem(g.id, 'farm');
if (!gr) return null;
res = { id: gr.id, lv: gr.lv, tier: g.tier, max: false, isNew: gr.isNew };
}
S.gainGear.push(res);
store.gearEver = (store.gearEver | 0) + 1;
petGearCheck();
persist();
if (!quiet) gearPopFx(res, x, y);
return res;
}
var MK_FX_POOL_N = 4, GEAR_FLY_N = 3, GEAR_ARC_LIFT = 0.77, GEAR_PLUS_LIFT = 0.15;
var mkFxPool = [], gearFlyPool = [], gearFlyNext = 0;
var GEAR_FX = { d1: 0, d2: 0, d3: 0 };
var GEAR_GEO = { ok: false, has: false, dx: 0, dy: 0, dtop: 0, fx: 0, fy: 0 };
function gearGeoRead() {
var dst = $('duel-me-av'), r = (dst && dst.getBoundingClientRect) ? dst.getBoundingClientRect() : null;
GEAR_GEO.has = !!r;
if (r) { GEAR_GEO.dx = r.left + r.width / 2; GEAR_GEO.dy = r.top + r.height / 2; GEAR_GEO.dtop = r.top; }
GEAR_GEO.ok = true;
}
function gearCellFrom(i, a, ax, ay) {
GEAR_GEO.fx = ax + ((i % COLS) - (a % COLS)) * (ts + GAP);
GEAR_GEO.fy = ay + (((i / COLS) | 0) - ((a / COLS) | 0)) * (ts + GAP);
}
var GEAR_KF_UP = [{ transform: 'translate(-50%,-50%) scale(1)', opacity: 1 }, { transform: 'translate(-50%,-50%) scale(1.35)', opacity: 1 }];
var GEAR_KF_ARC = [{ transform: 'translate(-50%,-50%) scale(1.35)', opacity: 1 }, { transform: '', opacity: 1, offset: 0.5 },
{ transform: '', opacity: 1 }];
var GEAR_KF_BUMP = [{ transform: 'scale(1)' }, { transform: 'scale(1.22)' }, { transform: 'scale(1)' }];
var GEAR_OPT_UP = { duration: 0, easing: 'linear', fill: 'forwards' };
var GEAR_OPT_ARC = { duration: 0, easing: 'linear', fill: 'forwards' };
var GEAR_OPT_BUMP = { duration: 0, easing: 'linear' };
function gearFxInit() {
if (typeof document === 'undefined' || mkFxPool.length) return;
var cs = null, i;
try { cs = getComputedStyle(document.documentElement); } catch (e) { cs = null; }
function tok(n) { return cs ? String(cs.getPropertyValue(n) || '').trim() : ''; }
GEAR_FX.d1 = parseFloat(tok('--dur-1')) || 0;
GEAR_FX.d2 = parseFloat(tok('--dur-2')) || 0;
GEAR_FX.d3 = parseFloat(tok('--dur-3')) || 0;
var spring = tok('--spring'), easeOut = tok('--ease-out');   /* 토큰이 없으면 옵션 객체의 처음 값을 둔다(그때는 길이도 0) — 리터럴 이징 대체값 0 */
GEAR_OPT_UP.duration = GEAR_FX.d1; GEAR_OPT_ARC.duration = GEAR_FX.d3; GEAR_OPT_BUMP.duration = GEAR_FX.d2;
if (spring) { GEAR_OPT_UP.easing = spring; GEAR_OPT_BUMP.easing = spring; }
if (easeOut) GEAR_OPT_ARC.easing = easeOut;
for (i = 0; i < MK_FX_POOL_N; i++) {
var fx = document.createElement('i');
fx.className = 'mk-fx';
fx.setAttribute('aria-hidden', 'true');
fx.innerHTML = '<i class="mk-aura"></i><i class="mk-ring"></i><i class="mk-burst"></i><i class="mk-halo"></i>' +
'<i class="mk-badge"><i class="mk-ico"></i></i><i class="mk-spark"></i><i class="mk-spark b"></i><i class="mk-sweep"></i>';
fx.__ico = fx.querySelector('.mk-ico');
fx.__tile = null;
fx.__item = null;
mkFxPool.push(fx);
}
var host = $('app') || document.body;
for (i = 0; i < GEAR_FLY_N; i++) {
var f = document.createElement('i');
f.className = 'mk-fly';   /* 시안 mock-fruit-get .fly — 원반 배지(CSS) + 안의 그림(자식 <i>) */
f.setAttribute('aria-hidden', 'true');
f.innerHTML = '<i></i>';
f.__ico = f.firstChild;
f.__item = null;
f.hidden = true;
host.appendChild(f);
gearFlyPool.push(f);
}
}
function mkFxTake(el) {
for (var i = 0; i < mkFxPool.length; i++) {
var f = mkFxPool[i], owner = f.__tile;
if (!owner || !owner.isConnected || f.parentNode !== owner) {
if (owner && owner.__mkFx === f) owner.__mkFx = null;
f.__tile = el;
el.__mkFx = f;
return f;
}
}
return null;
}
function mkFxDrop(el) {
var f = el.__mkFx;
el.__mkFx = null;
if (!f) return;
if (f.parentNode === el) el.removeChild(f);
f.__tile = null;
}
function gearPopFx(res, x, y) {
var anim = typeof window !== 'undefined' && !fxReduced() && gearFlyPool.length > 0;
if (anim && !GEAR_GEO.ok) gearGeoRead();   /* ok 는 resolveMatch 머리가 매치마다 내리고 다시 채운다 */
var name = t('item.' + res.id + '.nm');
toast(res.max ? ((res.refund | 0) > 0 ? t('mk.gearmax', { name: name, c: res.refund | 0 }) : t('mk.gearmax0', { name: name }))
: t('mk.gear', { tier: t('drops.tier.' + res.tier), name: name }));   /* 환급이 0(상한)이면 숫자 없는 문장 */
J.sfx.mission();
J.vibrate(res.tier === 'epic' ? 40 : 22);
if (!anim) return;
var fly = gearFlyPool[gearFlyNext];
gearFlyNext = (gearFlyNext + 1) % gearFlyPool.length;
fly.__tx = GEAR_GEO.has ? (GEAR_GEO.dx - x) : 0;
fly.__ty = GEAR_GEO.has ? (GEAR_GEO.dy - y) : -ts * 3;
fly.__has = GEAR_GEO.has;
fly.__lx = GEAR_GEO.dx;
fly.__ltop = GEAR_GEO.dtop;
fly.__tier = res.tier;
fly.style.setProperty('--ts', ts + 'px');   /* 판 밖 층이라 칸 크기를 인라인으로 준다(.mk-fly 크기 = --ts 비율) */
if (fly.__item !== res.id) { fly.__item = res.id; fly.__ico.style.setProperty('background-image', itemArtCss(res.id, 96)); }
fly.setAttribute('data-tier', res.tier);     /* CSS .mk-fly[data-tier] 가 원반 · 테 색(등급 별칭)을 읽는다 */
fly.style.left = x + 'px';
fly.style.top = y + 'px';
fly.hidden = false;
fly.animate(GEAR_KF_UP, GEAR_OPT_UP).onfinish = gearFlyArc;
}
function gearFlyArc(ev) {
var fly = ev && ev.target && ev.target.effect ? ev.target.effect.target : null;
if (!fly) return;
GEAR_KF_ARC[1].transform = 'translate(calc(-50% + ' + (fly.__tx * 0.45) + 'px), calc(-50% + ' + (fly.__ty * 0.2 - ts * GEAR_ARC_LIFT) + 'px)) scale(1.1)';
GEAR_KF_ARC[2].transform = 'translate(calc(-50% + ' + fly.__tx + 'px), calc(-50% + ' + fly.__ty + 'px)) scale(.8)';
fly.animate(GEAR_KF_ARC, GEAR_OPT_ARC).onfinish = gearFlyLand;
}
function gearFlyLand(ev) {
var fly = ev && ev.target && ev.target.effect ? ev.target.effect.target : null;
if (!fly) return;
fly.hidden = true;
var dst = $('duel-me-av');
if (dst && dst.animate) dst.animate(GEAR_KF_BUMP, GEAR_OPT_BUMP);
if (fly.__has) J.floatText(fly.__lx, fly.__ltop - ts * GEAR_PLUS_LIFT, '+1', GEAR_TIER_INK[fly.__tier] || GEAR_TIER_INK.common);   /* 크기 = floatText 기본값 */
}
var GACHA_BOX_STAGES = [3, 6, 9];
var GACHA_STAGE_P = 0.60;
var GACHA_OPEN_WEIGHTS = { item: 0.95, rare: 0.05 };   /* 74 — 파편 칸 은퇴(스펙 §D-2 「개봉표 장비 95 / 희귀 5」) */
var GACHA_PITY = 12;
var GACHA_FALLBACK_JSTAR = 3;   /* 풀이 비는 경우(이론상 없음)의 안전판 */
var GACHA_ITEM_RARE_P = 0.30;
function isGachaStage(n) {
var m = ((n | 0) % ADV_CHAPTER + ADV_CHAPTER) % ADV_CHAPTER;
for (var i = 0; i < GACHA_BOX_STAGES.length; i++) {
if (m === GACHA_BOX_STAGES[i]) return true;
}
return false;
}
function gachaPickItem(tier, r) {
var pool = [], i;
for (i = 0; i < ITEM_POOL.length; i++) {
if (ITEM_POOL[i].enabled === false) continue;
if (ITEM_POOL[i].tier === tier) pool.push(ITEM_POOL[i].id);
}
if (!pool.length) return '';
return pool[Math.min(pool.length - 1, (r() * pool.length) | 0)];
}
function openGachaRoll(rnd) {
var r = (typeof rnd === 'function') ? rnd : Math.random;
var roll = r();
var forced = (store.giftNoItem | 0) >= GACHA_PITY;
var kind = (forced || roll < 1 - petRareP()) ? 'item' : 'rare';
if (kind === 'item') {
store.giftNoItem = 0;
var tier = (r() < GACHA_ITEM_RARE_P) ? 'rare' : 'common';
var g = grantItem(gachaPickItem(tier, r), 'farm');
if (g) return { kind: 'item', id: g.id, lv: g.lv, isNew: g.isNew, tier: tier };
return gachaFallback();
}
var want = petGachaPool();
if (want.length) {
var pid = want[Math.min(want.length - 1, (r() * want.length) | 0)];
if (grantPet(pid)) return { kind: 'pet', id: pid };
}
store.giftNoItem = 0;
var eg = grantItem(gachaPickItem('epic', r), 'farm');
if (eg) return { kind: 'item', id: eg.id, lv: eg.lv, isNew: eg.isNew, tier: 'epic' };
return gachaFallback();
}
function gachaFallback() {
store.jstar = (store.jstar | 0) + GACHA_FALLBACK_JSTAR;
return { kind: 'gem', n: GACHA_FALLBACK_JSTAR };
}
var PET_FREE = ['ppyak', 'mungchi'];                    // §14.1 ⓐ
var PET_BOSS = { 20: 'mukmul', 30: 'banjjak', 40: 'bangul' };
var PET_AWK_NEED = 3;        // §14.2 ⓒ 째깍이 — 각성 연쇄 3회 (= EXPL_STREAK_CAP)
var PET_NODELAY_NEED = 10;   // §14.2 ⓒ 몽글 — 무딜레이 10연속 매칭
var PET_TEN_NEED = 500;
var PET_GACHA = ['churup'];
var PET_LEGACY_ALL = ['ppyak', 'mungchi', 'mongle', 'churup',
'mukmul', 'tiktok', 'kkultteok', 'bangul'];
var PET_LV_MAX = 20, PET_EVO_MAX = 3;
var PET_UP_LV_MAX = 10;      // 저장된 강화 단수의 소독 상한(은퇴한 레버 칸 — v1to2 가 환급한 뒤에도 기록으로 보존)
var PET_UP_KEYS   = ['pwr', 'std', 'agi', 'luk'];
var DAILY_JSTAR = 1;   /* 74 — 옛 데일리 파편 5알(= 10:1 환율로 0.5) → 젤리별 1(올림, 잃는 값 0) */
function makePetUp(src) {
var o = (src && typeof src === 'object') ? src : null, out = {}, i, k, v;
for (i = 0; i < PET_UP_KEYS.length; i++) {
k = PET_UP_KEYS[i];
v = o ? o[k] : 0;
out[k] = (typeof v === 'number' && isFinite(v)) ? clamp(v | 0, 0, PET_UP_LV_MAX) : 0;
}
return out;
}
function makePetEntry(id, src) {
var o = (src && typeof src === 'object') ? src : null;
var lv = o ? (o.lv | 0) : 1;
var ev = o ? (o.evo | 0) : 0;
return { id: id, lv: clamp(lv || 1, 1, PET_LV_MAX), evo: clamp(ev, 0, PET_EVO_MAX),
up: makePetUp(o ? o.up : null) };
}
function petPowN(n) { return Math.max(1, n | 0); }
function petDurMs(ms) { return ms | 0; }
function petUses() { return DUEL_PET_MAX; }
function petRareP() { return GACHA_OPEN_WEIGHTS.rare; }
function petEntry(id) {
if (!store || !Array.isArray(store.pets)) return null;
for (var i = 0; i < store.pets.length; i++) {
var e = store.pets[i];
if (e && typeof e === 'object' && e.id === id) return e;
if (typeof e === 'string' && e === id) return null;   /* 미변환 잔재 */
}
return null;
}
function petIds() {
var out = [];
if (!store || !Array.isArray(store.pets)) return out;
for (var i = 0; i < store.pets.length; i++) {
var e = store.pets[i];
var id = (typeof e === 'string') ? e : (e && e.id);
if (typeof id === 'string' && out.indexOf(id) < 0) out.push(id);
}
return out;
}
function petOwned(id) {
return petIds().indexOf(id) >= 0;
}
function petGachaPool() {
var out = [];
for (var i = 0; i < PET_GACHA.length; i++) {
if (!petOwned(PET_GACHA[i])) out.push(PET_GACHA[i]);
}
return out;
}
function grantPet(id, quiet) {
if (MATE_IDS.indexOf(id) < 0) return false;
if (!Array.isArray(store.pets)) {
store.pets = [];
for (var gi = 0; gi < PET_FREE.length; gi++) {
store.pets.push(makePetEntry(PET_FREE[gi], null));
}
}
if (petOwned(id)) return false;
store.pets.push(makePetEntry(id, null));
persist();
if (!quiet) {
S.gainPets.push(id);
toast(t('pet.get', { n: t('char.' + id + '.name') }));
J.sfx.tierUp(4);
J.vibrate(70);
if (typeof window !== 'undefined') {
J.confetti(window.innerWidth / 2, window.innerHeight * 0.42);
}
}
syncMateLocks();
achvCheck();                    /* 판정판 50 — pet1/pet3/petall 축 */
return true;
}
function petCondBump() {
var dirty = false;
if (awkStreak > (store.awkChainMax | 0)) { store.awkChainMax = awkStreak; dirty = true; }
if (stdyRun > (store.noDelayMax | 0)) { store.noDelayMax = stdyRun; dirty = true; }
if ((store.awkChainMax | 0) >= PET_AWK_NEED && !petOwned('tiktok')) grantPet('tiktok');
if ((store.awkChainMax | 0) >= PET_AWK_NEED) friendDupPay('tiktok');   /* P3 — 뽑기로 먼저 온 째깍이면 별 +10 한 번 */
if ((store.noDelayMax | 0) >= PET_NODELAY_NEED && !petOwned('mongle')) grantPet('mongle');
if ((store.noDelayMax | 0) >= PET_NODELAY_NEED) friendDupPay('mongle');   /* P3 — 뽑기로 먼저 온 몽글이면 별 +10 한 번 */
if (dirty) persist();
}
var PET_GEAR_NEED = 30;   /* 74 — 꿀떡이: 장비 과일 누적 30개(옛 파편 누적 300 과 같은 비율 — 이전기가 진행을 ÷10 으로 옮긴다) */
function petGearCheck() {
if (!petOwned('kkultteok') && (store.gearEver | 0) >= PET_GEAR_NEED) grantPet('kkultteok');
if ((store.gearEver | 0) >= PET_GEAR_NEED) friendDupPay('kkultteok');   /* P3 — 뽑기로 먼저 온 꿀떡이면 별 +10 한 번 */
}
function v74NoticeReady() {
if (!splashDone) return false;
var kd = $('screen-kingdom');
if (!kd || !kd.classList.contains('active')) return false;
return !document.querySelector('.modal:not([hidden])');
}
var V74_NOTICE_DELAY = 360;   /* 스플래시 퇴장(320ms) 뒤 — 걷히는 판 밑에 알림이 깔리지 않게 */
var v74DueAt = 0;             /* P3 수정 1회차 m4 — splashDismiss 가 건 v74Notice 타이머가 울릴 시각(now() 시계). p3Notice 가 이보다 이르면 미룬다 */
var v74ArcTimer = 0;          /* arc-dmg 안내 대기(맨 setTimeout) — 도는 동안에는 enterKingdom 이 먼저 띄우지 않는다 */
function v74ArcNotice() {
v74ArcTimer = 0;
var v = store.v74;
if (!v || !v.arcdmg || v.shownArc || !v74NoticeReady()) return false;   /* 판 중 · 모달 위면 다음 왕국으로 미룬다 */
toast(t('v74.arcdmg'));
v.shownArc = 1;
persist();
return true;
}
function v74Notice() {
if (!v74NoticeReady()) return false;
petGearCheck();
var v = store.v74;
if (!v) return false;
var lv = v.lv | 0, js = v.jstar | 0, msg = '';
if (!v.shown) {
var key = (lv > 0 && js > 0) ? 'v74.convert' : (lv > 0 ? 'v74.convert.gear' : (js > 0 ? 'v74.convert.star' : ''));
if (key) { msg = t(key, { g: lv, s: js }); toast(msg); }
v.shown = 1;
persist();
}
if (v.arcdmg && !v.shownArc && !v74ArcTimer) {
if (msg) v74ArcTimer = setTimeout(v74ArcNotice, toastMs(msg, 2));
else return v74ArcNotice();
}
return !!msg;
}
function petTenBump() {
store.tenTotal = (store.tenTotal | 0) + 1;
if (!petOwned('sseokssak') && (store.tenTotal | 0) >= PET_TEN_NEED) {
grantPet('sseokssak');
}
if ((store.tenTotal | 0) >= PET_TEN_NEED) friendDupPay('sseokssak');   /* P3 — 뽑기로 먼저 온 썩싹이면 별 +10 한 번 */
}
function petLockText(id) {
var k = 'pet.lock.' + id, s = t(k);
return (s && s !== k) ? s : t('char.locked.hint');
}
function syncMateLocks() {
var wrap = $('mate-pick');
if (!wrap || !wrap.querySelectorAll) return;
var cards = wrap.querySelectorAll('.char-card');
for (var i = 0; i < cards.length; i++) {
var id = cards[i].getAttribute('data-char') || '';
var lock = !!id && !petOwned(id);
cards[i].classList.toggle('locked', lock);
if (lock && !cards[i].querySelector('.cc-lock')) {
var lk = document.createElement('span');
lk.className = 'cc-lock';
lk.setAttribute('aria-hidden', 'true');
var q = document.createElement('span');
q.className = 'cl-q';
q.textContent = '???';
lk.appendChild(q);
cards[i].appendChild(lk);
}
if (lock) {
cards[i].setAttribute('aria-disabled', 'true');
cards[i].setAttribute('aria-label', t('char.locked.aria'));
} else {
cards[i].removeAttribute('aria-disabled');
cards[i].removeAttribute('aria-label');
}
}
}
var CP_XTAL_SET =
'<span class="wxtal-set wxtal-set--ref" aria-hidden="true">' +
'<svg class="wxtal wxtal--tl" viewBox="0 0 100 100" preserveAspectRatio="none"><use href="#wxtalGem" xlink:href="#wxtalGem"/></svg>' +
'<svg class="wxtal wxtal--tr" viewBox="0 0 100 100" preserveAspectRatio="none"><use href="#wxtalGem" xlink:href="#wxtalGem"/></svg>' +
'<svg class="wxtal wxtal--bl" viewBox="0 0 100 100" preserveAspectRatio="none"><use href="#wxtalGem" xlink:href="#wxtalGem"/></svg>' +
'<svg class="wxtal wxtal--br" viewBox="0 0 100 100" preserveAspectRatio="none"><use href="#wxtalGem" xlink:href="#wxtalGem"/></svg>' +
'</span>';
function cpItemCell(state, slot, ico, val, id, tier, label, tap) {
var btn = !!tap || state !== 'empty';
var b = document.createElement(btn ? 'button' : 'span');
b.className = 'cp-crystal cp-gem cp-islot';
b.setAttribute('data-state', state);
b.setAttribute('data-slot', slot);
if (!btn) {
b.setAttribute('aria-hidden', 'true');
} else {
b.type = 'button';
if (id) b.setAttribute('data-item', id);
if (tier) b.setAttribute('data-tier', tier);
b.setAttribute('aria-haspopup', 'dialog');
b.setAttribute('aria-label', label);
}
var ic = document.createElement('span');
ic.className = 'cp-cr-ic';
ic.setAttribute('aria-hidden', 'true');
if (id && ITEM_ART[id]) { ic.textContent = ''; ic.setAttribute('data-art', ''); ic.style.setProperty('background-image', itemArtCss(id, 64)); } else { ic.textContent = ico; }
b.appendChild(ic);
if (val) {
var vb = document.createElement('b');
vb.className = 'cp-gem-n';
vb.setAttribute('aria-hidden', 'true');
vb.textContent = val;
b.appendChild(vb);
}
b.insertAdjacentHTML('beforeend', CP_XTAL_SET);
return b;
}
function cpItemCharId() {
var el = $('charpanel');
if (!el || el.hidden) return charId();
return HERO_IDS[cpIdx] || charId();
}
function gearSlotItem(cid, slot) {
var eq = itemsEq(cid), own = (store.items && store.items.own) || {};
for (var i = 0; i < eq.length; i++) {
var it = itemById(eq[i]);
if (it && it.slot === slot && it.enabled !== false && (own[it.id] | 0) > 0) return it.id;
}
return '';
}
function syncItemList() {
var wrap = $('cp-item-list');
if (!wrap) return;
var cid = cpItemCharId(), own = (store.items && store.items.own) || {};
wrap.innerHTML = '';
for (var s = 0; s < ITEM_SLOTS.length; s++) {
var slot = ITEM_SLOTS[s], id = gearSlotItem(cid, slot), sn = t('gear.slot.' + slot);
if (id) {
var it = itemById(id), lv = own[id] | 0;
wrap.appendChild(cpItemCell('eq', slot, it.ico, it.kind === 'stat' ? ('+' + itemEffOf(id, lv)) : '',
id, it.tier, sn + ' · ' + t('item.' + id + '.nm'), true));
} else {
wrap.appendChild(cpItemCell('empty', slot, '', t('gear.empty'), '', '', sn + ' · ' + t('gear.empty'), true));
}
}
}
function gearEqCommit(cid, eq) {
store.items.eq[cid] = eq;
persist();
syncItemList();            /* 방 오른쪽 장비 줄 */
gearPaint();               /* 장비 창이 떠 있으면 낀 장비 줄 · 탭 개수 · 가방 ✓ 를 같은 상태로 */
applyHeroStats();          /* 막대가 곧바로 새 실효값을 그린다 */
J.sfx.ui();
}
function toggleItem(id) {
var it = itemById(id);
if (!it) return;
var own = (store.items && store.items.own) || {};
if (!(own[id] | 0)) return;
var cid = cpItemCharId(), eq = itemsEq(cid).slice(), at = eq.indexOf(id);
if (at >= 0) {
eq.splice(at, 1);
} else {
gearEqPut(eq, id);
dqBump('item', 1);            /* 판정판 50 — 「아이템 장착」 축(끼울 때만) */
}
gearEqCommit(cid, eq);
}
function gearEqPut(eq, id) {
var it = itemById(id), j;
for (j = eq.length - 1; j >= 0; j--) {
var e = itemById(eq[j]);
if (e && it && e.slot === it.slot) eq.splice(j, 1);
}
eq.push(id);
while (eq.length > ITEM_SLOTS.length) eq.shift();
return eq;
}
var gearSlotCur = 'weapon';   /* 장비 창이 보여 주는 부위 — 탭 · 낀 장비 줄 ▼ 가 늘 같이 가리킨다 */
var gearInfoId = '';          /* 정보 카드가 보여 주는 장비 */
function gearBagList(slot) {
var own = (store.items && store.items.own) || {}, out = [];
for (var i = 0; i < ITEM_POOL.length; i++) {
var it = ITEM_POOL[i], lv = own[it.id] | 0;
if (it.enabled === false || it.slot !== slot || lv <= 0) continue;
out.push({ it: it, lv: lv, i: i });
}
out.sort(function (a, b) { return (ITEM_TIER_EFF[b.it.tier] - ITEM_TIER_EFF[a.it.tier]) || (b.lv - a.lv) || (a.i - b.i); });
return out;
}
function gearWornIds(id, cid) {
var ids = [];
for (var i = 0; i < HERO_IDS.length; i++) {
if (HERO_IDS[i] !== cid && itemsEq(HERO_IDS[i]).indexOf(id) >= 0) ids.push(HERO_IDS[i]);
}
return ids;
}
function gearWornBy(id, cid) {
var ids = gearWornIds(id, cid), names = [];
for (var i = 0; i < ids.length; i++) names.push(t('char.' + ids[i] + '.name'));
return names.join(' · ');
}
function gearAria(id, cid) {
var it = itemById(id), own = (store.items && store.items.own) || {}, who = gearWornBy(id, cid);
if (!it) return '';
return t('item.' + id + '.nm') + ', ' + t('drops.tier.' + it.tier) + ', ' + t('drops.lv', { lv: own[id] | 0, max: ITEM_LV_MAX })
+ (itemsEq(cid).indexOf(id) >= 0 ? ', ' + t('gear.on') : '') + (who ? ', ' + t('gear.wornby', { names: who }) : '');
}
function itemEffParams(id) {
if (id === 'chainbracelet') return { c: String(ITEM_CHAIN_COMBO), n: String(Math.round((ITEM_CHAIN_MULT - 1) * 100)) };
if (id === 'firstcharm') return { x: String(ITEM_FIRST_MULT) };
if (id === 'lastcharm') return { s: String(ITEM_LAST_SEC), n: String(Math.round((ITEM_LAST_MULT - 1) * 100)) };
if (id === 'crossnecklace') return { n: String(Math.round(ITEM_CROSS_GAUGE_K * 100)) };
return {};   /* puddingcharm — 수 상수가 없다(판당 1회 · duelHitMe 의 d.itemGuardUsed) */
}
function gearEffLines(id, lv) {
var it = itemById(id);
if (!it) return [];
if (it.kind !== 'stat') return [t('item.' + id + '.eff', itemEffParams(id))];
var i = STAT_KEYS.indexOf(it.stat), n = statPctText(it.stat, itemEffOf(id, lv), 1);
return statTipLines(i, '+' + n + '%', n);
}
function gearEffShort(id, lv) {
var it = itemById(id);
if (!it) return '';
if (it.kind !== 'stat') return t('item.' + id + '.eff', itemEffParams(id));
return t('stat.k' + (STAT_KEYS.indexOf(it.stat) + 1)) + ' +' + itemEffOf(id, lv);
}
function gearPaint() {
var m = $('modal-gear');
if (!m || m.hidden) return;
var cid = cpItemCharId(), own = (store.items && store.items.own) || {}, s;
var wrap = $('gm-slots');
if (wrap) {
wrap.innerHTML = '';
for (s = 0; s < ITEM_SLOTS.length; s++) {
var slot = ITEM_SLOTS[s], on = slot === gearSlotCur, id = gearSlotItem(cid, slot), sn = t('gear.slot.' + slot);
var b = document.createElement('button');
b.type = 'button';
b.className = 'gm-slot';
b.setAttribute('data-slot', slot);
if (on) b.setAttribute('aria-current', 'true');
if (id) b.setAttribute('data-item', id);
b.appendChild(id ? itemTile(id, { lv: own[id] | 0, size: 96, sel: on }) : itemTile(null, { empty: true, slot: slot, size: 96, sel: on }));
var nm = document.createElement('span');
nm.className = 'gm-slot-n ci-tag-v kit-pill-v2';      /* 부위 이름표 = 방 「전략가」 알약(soft) */
nm.setAttribute('data-variant', 'soft');
nm.textContent = sn;
b.appendChild(nm);
b.setAttribute('aria-label', id ? sn + ', ' + gearAria(id, cid) : sn);
wrap.appendChild(b);
}
}
var tabs = $('gm-tabs');
if (tabs && tabs.querySelectorAll) {
var tb = tabs.querySelectorAll('.cp-tab');
for (s = 0; s < tb.length; s++) {
var ts = tb[s].getAttribute('data-gmtab'), cnt = '(' + gearBagList(ts).length + ')';
tb[s].setAttribute('aria-selected', ts === gearSlotCur ? 'true' : 'false');
var nb = tb[s].querySelector('.gm-n');
if (nb) nb.textContent = cnt;
var ic = tb[s].querySelector('.gm-ic');
if (ic && !ic.hasAttribute('data-art') && ITILE_EMPTY_ART[ts]) {
var mu = 'url("' + itemArtUrl(ITILE_EMPTY_ART[ts], 64) + '")';
ic.style.setProperty('-webkit-mask-image', mu);
ic.style.setProperty('mask-image', mu);
ic.setAttribute('data-art', '');
}
tb[s].setAttribute('aria-label', t('gear.slot.' + ts) + cnt);   /* 낭독 = 부위 + 개수 — 좁은 탭에서 개수 글자를 빼도 그대로(8b 2차 판정 6) */
}
}
var grid = $('gm-grid'), none = $('gm-none');
if (grid) {
var list = gearBagList(gearSlotCur);
grid.innerHTML = '';
grid.setAttribute('data-slot', gearSlotCur);
if (!list.length) {
var li0 = document.createElement('li');
li0.className = 'gm-cell gm-empty';
li0.appendChild(itemTile(null, { empty: true, slot: gearSlotCur, size: 96 }));
grid.appendChild(li0);
}
for (s = 0; s < list.length; s++) {
var gi = list[s].it.id, mine = itemsEq(cid).indexOf(gi) >= 0, wids = gearWornIds(gi, cid);
var li = document.createElement('li');
li.className = 'gm-li';
var cb = document.createElement('button');
cb.type = 'button';
cb.className = 'gm-cell';
cb.setAttribute('data-item', gi);
cb.setAttribute('aria-haspopup', 'dialog');
cb.setAttribute('aria-label', gearAria(gi, cid));
cb.appendChild(itemTile(gi, { lv: list[s].lv, eq: mine, size: 96 }));
if (wids.length) {
var who = document.createElement('i');
who.className = 'gm-who';
who.setAttribute('aria-hidden', 'true');
who.setAttribute('data-char', wids[0]);
setStdArt(who, wids[0], 'face', '--who-face');
cb.appendChild(who);
}
li.appendChild(cb);
grid.appendChild(li);
}
if (none) none.hidden = list.length > 0;
}
gearLayout();
}
function gearLayout() {
gearTabFit();
gearBagFill();
gearMore($('gm-grid'));
}
function gearTabFit() {
var tabs = $('gm-tabs');
if (!tabs || !tabs.querySelectorAll || !tabs.removeAttribute) return;
tabs.removeAttribute('data-compact');
var tb = tabs.querySelectorAll('.cp-tab'), over = false, s, k;
for (s = 0; s < tb.length && !over; s++) {
var cw = tb[s].clientWidth;
if (!cw) return;                                  /* 숨은 창 — 보이게 되면 다시 부른다 */
var cs = getComputedStyle(tb[s]), gap = parseFloat(cs.columnGap) || 0, fs = parseFloat(cs.fontSize) || 0, w = 0, n = 0;
for (k = 0; k < tb[s].children.length; k++) {
var r = tb[s].children[k].getBoundingClientRect();
if (r.width > 0) { w += r.width; n++; }
}
if (n > 1) w += gap * (n - 1);
if (w + fs > cw + 0.5) over = true;               /* 좌우 여백 .5em 씩 = 글자 1em */
}
if (over) tabs.setAttribute('data-compact', '');
}
function gearBagFill() {
var m = $('modal-gear'), grid = $('gm-grid');
if (!m || m.hidden || !grid || !grid.querySelectorAll) return;
var stack = m.querySelector('.gm-stack'), bag = $('gm-bag'), note = $('gm-none');
var head = m.querySelector('.cp-head'), slots = $('gm-slots'), card = m.querySelector('.cp-card'), band = $('gm-tabs');
var old = grid.querySelectorAll('.gm-frame'), kids = grid.children, n = 0, first = null, i;
for (i = 0; i < kids.length; i++) if (!kids[i].classList.contains('gm-frame')) { n++; if (!first) first = kids[i]; }
if (!first || !stack || !bag || !head || !slots || !card || !band) return;
var fr = first.getBoundingClientRect();
if (!fr.width) return;                              /* 숨은 창 — 보이게 되면 다시 부른다 */
stack.style.setProperty('--gm-tile', fr.width + 'px');
var wasRow = stack.hasAttribute('data-head-row');
if (wasRow) stack.removeAttribute('data-head-row');
var u = (parseFloat(getComputedStyle(grid).columnGap) || 0) / 3, tile = fr.height, ring = fr.width * 0.08;
var noteH = note ? (parseFloat(getComputedStyle(note).fontSize) || 0) * 1.35 : 0;
var ms = getComputedStyle(m), mh = m.clientHeight - (parseFloat(ms.paddingTop) || 0) - (parseFloat(ms.paddingBottom) || 0);
var headH = head.getBoundingClientRect().height;                          /* 두 줄 짜임 머리 상자 = 캡슐 바깥 상자 */
var gapN = parseFloat(getComputedStyle(band).marginBottom) || 0;          /* --cs-gap8 = 무리 틈(① · ②) */
var cardFix = card.getBoundingClientRect().height - bag.getBoundingClientRect().height;   /* 탭 띠 · 단추 줄 몫(박자 무관) */
var avail = mh - headH - slots.getBoundingClientRect().height - 2 * gapN - cardFix;
var step = ((2.4 * u + tile + 3 * u) + 2 * u + noteH + 2 * u <= avail) ? 1
: ((ring + tile + ring) + 1.4 * u + noteH + 1.4 * u <= avail) ? 2 : 3;
if (step >= 2) { bag.setAttribute('data-tight', ''); bag.style.setProperty('--cb-ring', ring + 'px'); }
else { bag.removeAttribute('data-tight'); bag.style.removeProperty('--cb-ring'); }
if (step === 3) stack.setAttribute('data-head-row', ''); else stack.removeAttribute('data-head-row');
for (i = 0; i < old.length; i++) grid.removeChild(old[i]);
var cols = 4, want = Math.max(cols, Math.ceil(n / cols) * cols);
for (i = n; i < want; i++) {
var li = document.createElement('li');
li.className = 'gm-li gm-frame';
li.setAttribute('aria-hidden', 'true');
li.appendChild(itemTile(null, { empty: true }));   /* 빈 칸(부위 없음 = 그림 없음) — 테 · 면은 CSS(.gm-frame) */
grid.appendChild(li);
}
}
function gearMore(el) {
if (!el || !el.hasAttribute) return;
var more = el.scrollHeight - el.clientHeight - Math.ceil(el.scrollTop) > 0;
if (more) { if (!el.hasAttribute('data-more')) el.setAttribute('data-more', ''); }
else if (el.hasAttribute('data-more')) el.removeAttribute('data-more');
}
function gearRoomInert() {
var cp = $('charpanel');
if (!cp || cp.hidden || cp.hasAttribute('data-under')) return;
var g = $('modal-gear'), gi = $('modal-gear-info');
var up = function (m) { return !!m && !m.hidden && !m.hasAttribute('data-under'); };
winInert(cp, up(g) || up(gi));
}
function openGear(slot) {
var m = $('modal-gear');
if (!m) return;
if (ITEM_SLOTS.indexOf(slot) >= 0) gearSlotCur = slot;
winShow(m, $('charpanel'));      /* 방 inert = winShow 끝의 gearRoomInert(수정 1회차 F5 — 주인 하나) */
healHeads(m);
gearPaint();
var gr = $('gm-grid');
if (gr) gr.scrollTop = 0;
J.sfx.ui();
}
function closeGear(quiet) {
if (gearInfoId) closeGearInfo(true);
closeModal('modal-gear');        /* winHide 끝에서 방 inert 를 다시 센다 */
if (!quiet) J.sfx.ui();
}
function gearSlotTap(slot) {
if (ITEM_SLOTS.indexOf(slot) < 0 || slot === gearSlotCur) return;
gearSlotCur = slot;
gearPaint();
var gr = $('gm-grid');
if (gr) { gr.scrollTop = 0; gearMore(gr); }
J.sfx.ui();
}
function gearAutoEquip() {
var cid = cpItemCharId(), eq = itemsEq(cid).slice(), changed = 0, s;
for (s = 0; s < ITEM_SLOTS.length; s++) {
var slot = ITEM_SLOTS[s], best = gearBagList(slot)[0];
if (!best || gearSlotItem(cid, slot) === best.it.id) continue;
gearEqPut(eq, best.it.id);    /* toggleItem 과 같은 끼우기 · 장착 수 가드(M9) */
changed++;
}
toast(t(changed ? 'gear.auto.done' : 'gear.auto.same'));
if (changed) { gearEqCommit(cid, eq); dqBump('item', changed); }
else J.sfx.ui();
}
function paintGearInfo() {
var id = gearInfoId, it = itemById(id);
if (!it) return;
var cid = cpItemCharId(), own = (store.items && store.items.own) || {}, lv = own[id] | 0, on = itemsEq(cid).indexOf(id) >= 0;
var art = $('gi-art');
if (art) {
art.innerHTML = '';
art.appendChild(itemTile(id, { lv: lv, eq: on, size: 256 }));   /* 큰 장비 칸(판 안 폭 36% — CSS) */
}
setText('gi-name', t('item.' + id + '.nm'));
var chip = $('gi-chip');
if (chip) {
chip.setAttribute('data-tier', it.tier);
var ci = chip.firstElementChild || chip.appendChild(document.createElement('i'));
ci.textContent = t('drops.tier.' + it.tier);
}
setText('gi-meta', t('gear.slot.' + it.slot) + ' · ' + t('drops.lv', { lv: lv, max: ITEM_LV_MAX }));
var eff = $('gi-eff'), effd = $('gi-effd'), lines = gearEffLines(id, lv);
if (eff) {
eff.innerHTML = '';
eff.setAttribute('data-kind', it.kind === 'stat' ? 'stat' : 'act');
if (it.kind === 'stat') {
var ek = document.createElement('span'); ek.className = 'gi-eff-k'; ek.textContent = t('stat.k' + (STAT_KEYS.indexOf(it.stat) + 1)); eff.appendChild(ek);
var ev = document.createElement('b'); ev.className = 'gi-eff-v'; ev.textContent = '+' + itemEffOf(id, lv); eff.appendChild(ev);
} else {
eff.textContent = lines[0] || '';
}
}
if (effd) { effd.textContent = it.kind === 'stat' ? (lines[1] || '') : ''; effd.hidden = it.kind !== 'stat'; }
setText('gi-fl', t('item.' + id + '.fl'));
var cmp = $('gi-cmp'), cur = gearSlotItem(cid, it.slot);
if (cmp) {
cmp.hidden = !(cur && cur !== id);
var ca = $('gi-cmp-art'), cv = $('gi-cmp-v');
if (ca) ca.innerHTML = '';
if (cv) cv.innerHTML = '';
if (!cmp.hidden) {
var c = itemById(cur), clv = own[cur] | 0;
if (ca) ca.appendChild(itemTile(cur, { lv: clv, size: 64 }));
if (cv) {
var cn = document.createElement('b'); cn.className = 'gi-cmp-n'; cn.textContent = t('item.' + cur + '.nm'); cv.appendChild(cn);
var ce = document.createElement('span'); ce.className = 'gi-cmp-e'; ce.textContent = gearEffShort(cur, clv); cv.appendChild(ce);
if (c && c.kind === 'stat' && it.kind === 'stat' && c.stat === it.stat) {
var d = itemEffOf(id, lv) - itemEffOf(cur, clv);
if (d) {
var cd = document.createElement('b'); cd.className = 'gi-cmp-d';
cd.setAttribute('data-dir', d > 0 ? 'up' : 'down');
cd.textContent = (d > 0 ? '▲' : '▼') + Math.abs(d);
cv.appendChild(cd);
}
}
}
}
}
var who = $('gi-who'), wb = gearWornBy(id, cid);
if (who) { who.textContent = wb ? t('gear.wornby', { names: wb }) : ''; who.hidden = !wb; }
var b = $('gi-act');
if (b) {
b.textContent = t(on ? 'gear.unequip' : 'gear.equip');
b.setAttribute('data-kind', on ? 'secondary' : 'primary');
}
gearInfoFit();
}
function gearInfoFit() {
var m = $('modal-gear-info'), card = m && m.querySelector('.cp-card'), main = m && m.querySelector('.gi-main');
if (!card || !main || m.hidden) return;
card.classList.remove('gi-tight');
if (main.scrollHeight > main.clientHeight + 4) card.classList.add('gi-tight');
gearMore(main);
}
function openGearInfo(id) {
var own = (store.items && store.items.own) || {};
if (!itemById(id) || (own[id] | 0) <= 0) return;
var m = $('modal-gear-info');
if (!m) return;
gearInfoId = id;
winShow(m, $('charpanel'));      /* 방 inert = winShow 끝의 gearRoomInert(수정 1회차 F5) */
healHeads(m);
paintGearInfo();
var main = m.querySelector('.gi-main');
if (main) { main.scrollTop = 0; gearMore(main); }
J.sfx.ui();
}
function closeGearInfo(quiet) {
gearInfoId = '';
closeModal('modal-gear-info');   /* winHide 끝에서 방 inert 를 다시 센다 */
if (!quiet) J.sfx.ui();
}
function gearAct() {
if (!gearInfoId) return;
toggleItem(gearInfoId);
closeGearInfo(true);
}
var pairPCache = null;
function pairTypeP() {
if (pairPCache) return pairPCache;
var p = { same: 1 / 9, sum10: 8 / 81 };     // 균등분포 폴백
try {
var cells = genBoard(1, 20260812);        // PURE 함수 — 읽기만 한다
var cnt = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], n = 0, i;
for (i = 0; i < cells.length; i++) {
var v = cells[i] | 0;
if (v >= 1 && v <= 9) { cnt[v]++; n++; }
}
if (n >= 2) {
var tot = n * (n - 1) / 2, same = 0, s10 = 0;
for (i = 1; i <= 9; i++) same += cnt[i] * (cnt[i] - 1) / 2;
for (i = 1; i <= 4; i++) s10 += cnt[i] * cnt[10 - i];
if (tot > 0) p = { same: same / tot, sum10: s10 / tot };
}
} catch (e) { /* 폴백 유지 */ }
pairPCache = p;
return p;
}
function heroStatRaw(id) {
var s = HERO_STATS[id] || HERO_STATS[CHAR_DEFAULT];
return { power: s.pwr, steady: s.std, agility: s.agi, luck: s.luk };
}
function heroStatDerived(id) {
var pp = pairTypeP();
var p, M;
if (id === 'ten' || id === 'pudding') { p = pp.sum10; M = TEN_SUM10_MULT; }
else if (id === 'twin')  { p = pp.same;  M = TWIN_SAME_MULT; }
else                     { p = JELLY_P;  M = JELLY_MULT; }
var d = M - 1;
var E = 1 + p * d;
var sd = Math.sqrt(Math.max(0, p * (1 - p))) * d;
var cv = E > 0 ? sd / E : 0;
return {
power:   M,
steady:  cv > 0 ? 1 / cv : 99,
agility: p,
luck:    cv
};
}
function heroStatPct() {
var out = {}, i, m, k;
for (i = 0; i < HERO_IDS.length; i++) {
var id = HERO_IDS[i], base = STAT_BASE[id] || STAT_BASE.ten, eff = statEff(id);
out[id] = [];
for (m = 0; m < STAT_KEYS.length; m++) {
k = STAT_KEYS[m];
out[id].push({
base: clamp(Math.round(100 * (base[k] | 0) / STAT_BAR_MAX), 0, 100),
eff:  clamp(Math.round(100 * eff[k] / STAT_BAR_MAX), 0, 100),
v:    eff[k] | 0
});
}
}
return out;
}
function applyHeroStats() {
if (typeof document === 'undefined' || !document.querySelectorAll) return;
var pct = heroStatPct();
for (var i = 0; i < HERO_IDS.length; i++) {
var id = HERO_IDS[i];
var row = pct[id];
if (!row) continue;
var bars = document.querySelectorAll('#cp-info .ci[data-char="' + id + '"] .cs-bar');
if (!bars) continue;
for (var b = 0; b < bars.length && b < 4; b++) {
var el = bars[b];
if (!el || !el.style) continue;
el.style.setProperty('--v', row[b].eff + '%');
el.style.setProperty('--v0', row[b].base + '%');
el.style.setProperty('--f2-gv', String(row[b].v / STAT_BAR_MAX));
var chip = el.parentNode && el.parentNode.querySelector ? el.parentNode.querySelector('.cs-up-n') : null;
if (chip) chip.textContent = String(row[b].v);
el.classList.toggle('is-b0same', row[b].base === row[b].eff);  /* [E31-0903] base == eff 면 기본선 마커를 숨긴다(CSS 가 받는다). `is-` 접두사인 이유: 배포본 델타표 하네스(scratchpad/boxdelta-0903/analyze.py)의 NOISE 목록이 `is-*` 를 지워 짝짓기 서명을 안 흔든다 — 처음 쓴 `cs-b0-same` 은 charpanel-char 의 짝 수를 74에서 70으로 움직였다 */
if (el.querySelector && !el.querySelector('.cs-b0')) {
var mk0 = document.createElement('i');
mk0.className = 'cs-b0';
mk0.setAttribute('aria-hidden', 'true');
el.appendChild(mk0);
}
}
}
buildStatInfo();   /* [SI-0909] ⓘ 칩도 같은 틱에 자리를 다시 잡는다 */
}
var STAT_DESC_KEY = ['stat.d1', 'stat.d2', 'stat.d3', 'stat.d4'];   // 막대 순서 = STAT_KEYS(power, steady, agility, luck)
var statTipOpen = null;          /* 열려 있는 말풍선은 언제나 하나뿐이다 */
var STAT_TIP_DEC = { power: 0, steady: 0, agility: 0, luck: 1 };  // 잭팟만 소수 한 자리(4.5%)
function statPctText(k, v, dec) {
var h = (v | 0) * (STAT_UNIT_H[k] | 0);
var p = Math.pow(10, dec !== undefined ? dec : (STAT_TIP_DEC[k] || 0));
return String(Math.round(h * p / 100) / p);
}
function statTipLines(i, v, n) {
return [t('stat.tip.t', { k: t('stat.k' + (i + 1)), v: v }), t(STAT_DESC_KEY[i], { n: n })];
}
function statTipText(id, i) {
var k = STAT_KEYS[i];
if (!k) return '';
var v = (statEff(id) || {})[k] | 0;
return statTipLines(i, v, statPctText(k, v)).join('\n');
}
function closeStatTip() {
var tip = statTipOpen;
if (!tip) return;
statTipOpen = null;
if (tip.classList) tip.classList.remove('show');
tip.hidden = true;
var btn = tip.__csBtn;
if (btn && btn.setAttribute) btn.setAttribute('aria-expanded', 'false');
tip.__csBtn = null;
}
function statRowTop(ci, row) {
var stats = ci.querySelector ? ci.querySelector('.cc-stats') : null;
return (stats && row) ? (stats.offsetTop + row.offsetTop) : 0;
}
function buildStatInfo() {
if (typeof document === 'undefined' || !document.querySelector) return;
for (var h = 0; h < HERO_IDS.length; h++) {
var id = HERO_IDS[h];
var ci = document.querySelector('#cp-info .ci[data-char="' + id + '"]');
if (!ci || ci.id === 'cp-petinfo' || !ci.querySelectorAll) continue;
var rows = ci.querySelectorAll('.cc-stats .cs');
if (!rows || rows.length < 2) continue;
var pitch = rows[1].offsetTop - rows[0].offsetTop;
var half = Math.max(0, (pitch - rows[0].offsetHeight) / 2);
var tip = ci.querySelector('.cs-tip');
if (!tip) {
tip = document.createElement('p');
tip.className = 'cs-tip kit-box-v2';
tip.hidden = true;
tip.setAttribute('role', 'status');
ci.appendChild(tip);
}
for (var i = 0; i < rows.length && i < 4; i++) {
var btn = ci.querySelector('.cs-hit[data-cs="' + i + '"]');
if (!btn) {
btn = document.createElement('button');
btn.type = 'button';
btn.className = 'cs-hit';
btn.setAttribute('data-cs', String(i));
btn.setAttribute('aria-expanded', 'false');
btn.setAttribute('data-i18n-aria', 'aria.statinfo');
btn.setAttribute('aria-label', t('aria.statinfo'));
var ic = document.createElement('i');
ic.className = 'cs-ic';
ic.setAttribute('aria-hidden', 'true');
ic.textContent = 'i';
btn.appendChild(ic);
ci.appendChild(btn);
on(btn, 'click', statTipClick);
}
btn.style.setProperty('--cs-hit-y',
(statRowTop(ci, rows[i]) - half).toFixed(1) + 'px');
}
}
}
function statTipClick(ev) {
if (ev && ev.stopPropagation) ev.stopPropagation();
var btn = this, ci = btn.parentNode;
if (!ci || !ci.querySelector) return;
var i = btn.getAttribute('data-cs') | 0;
var tip = ci.querySelector('.cs-tip');
var rows = ci.querySelectorAll('.cc-stats .cs');
var row = rows && rows[i];
var again = (statTipOpen === tip && tip.__csBtn === btn);
closeStatTip();
if (again || !tip || !row) { J.sfx.ui(); return; }
tip.textContent = statTipText(ci.getAttribute('data-char'), i);
tip.style.setProperty('--cs-tip-y',
(statRowTop(ci, row) + row.offsetHeight / 2).toFixed(1) + 'px');
tip.hidden = false;
tip.__csBtn = btn;
statTipOpen = tip;
btn.setAttribute('aria-expanded', 'true');
if (typeof requestAnimationFrame === 'function') {
requestAnimationFrame(function () { if (statTipOpen === tip) tip.classList.add('show'); });
} else { tip.classList.add('show'); }
J.sfx.ui();
}
var SPARKS = [[16, 22, 0], [80, 30, .8], [24, 62, 1.5], [76, 66, 2.1]];
function cpDecorate(card) {
if (!card || card.getAttribute('data-deco') === '1') return;
card.setAttribute('data-deco', '1');
var sh = document.createElement('span');
sh.className = 'cp-shadow';
sh.setAttribute('aria-hidden', 'true');
card.appendChild(sh);
for (var i = 0; i < SPARKS.length; i++) {
var s = document.createElement('span');
s.className = 'cp-spark';
s.setAttribute('aria-hidden', 'true');
s.style.setProperty('--sx', String(SPARKS[i][0]));
s.style.setProperty('--sy', String(SPARKS[i][1]));
s.style.setProperty('--sd', String(SPARKS[i][2]));
card.appendChild(s);
}
}
var cpPopTimer = 0;
function cpStage(idx) {
if (typeof document === 'undefined' || !document.querySelectorAll) return;
var cards = document.querySelectorAll('#char-pick .char-card');
for (var i = 0; i < cards.length; i++) {
var on = (i === idx);
if (cards[i].classList) cards[i].classList.toggle('cp-cur', on);
if (on) cpDecorate(cards[i]);
}
var st = document.querySelector ? document.querySelector('.cp-stage') : null;
if (!st || !st.classList) return;
st.classList.remove('cp-pop');
void st.offsetWidth;
st.classList.add('cp-pop');
if (cpPopTimer) clearTimeout(cpPopTimer);
cpPopTimer = setTimeout(function () {
cpPopTimer = 0;
if (st.classList) st.classList.remove('cp-pop');
}, 560);
}
function toggleSound() {
store.sound = !store.sound;
J.setSound(store.sound);
persist();
syncToggleLabels();
J.sfx.ui();
}
function toggleVibe() {
store.vibrate = !store.vibrate;
J.setVibrate(store.vibrate);
persist();
syncToggleLabels();
J.sfx.ui();
}
function onResize() {
if (resizeTimer) clearTimeout(resizeTimer);
resizeTimer = setTimeout(function () { resizeTimer = 0; layout(); }, 120);
// An orientationchange fires while the viewport still reports the OLD size
// on iOS Safari, so a single debounced pass can lay out against stale
// numbers. A second settling pass after the rotation animation fixes it;
// layout() is idempotent, so running it twice costs one reflow.
if (resizeSettle) clearTimeout(resizeSettle);
resizeSettle = setTimeout(function () { resizeSettle = 0; layout(); }, 420);
var ms = $('screen-map');
if (ms && ms.classList && ms.classList.contains('active')) {
mapFit();
later(mapFit, 440);   // iOS 회전 직후의 낡은 뷰포트 값 대비 (layout() 과 같은 이유)
}
}
function wire() {
on($('portal-acct-login'), 'click', function () {
TW_PORTAL.requestLogin(function (u) { twApplyAccountUI(u); });
});
// --- menu ---
on($('btn-play'), 'click', openModeSheet);
on($('btn-cont'), 'click', openClassicHub);
on($('classic-close'), 'click', function () { closeClassicHub(); J.sfx.ui(); });
on($('classic-skills'), 'click', toggleClassicSkills);
on($('classic-arcade'), 'click', function () {
closeClassicHub(); J.sfx.ui();
if (classicSkillsOn()) startEndless(false);
else startClassic(false);
});
on($('classic-rush'), 'click', function () {
closeClassicHub(); J.sfx.ui();
if (classicSkillsOn()) {
// 스킬판 러시를 처음 누르는 것이 NEW 배지를 은퇴시킨다(W7.5 규약 그대로).
if (!store.rushSeen) { store.rushSeen = true; persist(); }
startRush();
} else {
startClassicRush();
}
});
on($('classic-daily'), 'click', function () {
closeClassicHub();
J.sfx.ui();
if (classicSkillsOn()) {
if (store.dailyBest && store.dailyBest.date === todayKey()) showDailyResult(0, false);
else startDaily(false);
} else {
if (classicDailyDoneToday()) showDailyResult(0, true);
else startClassicDaily(false);
}
});
on($('arcrow-time'), 'click', function () { closeModeSheet(); J.sfx.ui(); startArcade('arc-time'); });
on($('arcrow-surv'), 'click', function () { closeModeSheet(); J.sfx.ui(); startArcade('arc-surv'); });
on($('arcrow-dmg'), 'click', function () { closeModeSheet(); J.sfx.ui(); startArcade('arc-dmg'); });
on($('arc-again'), 'click', function () {
closeModal('modal-arc');
J.sfx.ui();
var bd0 = $('board');
if (bd0) bd0.classList.remove('grayed');
startArcade(arcLast || 'arc-time');
});
on($('arc-share'), 'click', function () {
var txt = arcShareText();
shareCardOut('arc', txt, function () { shareOut(txt); });
});
on($('arc-menu'), 'click', goMenu);
on($('mode-close'), 'click', function () { closeModeSheet(); J.sfx.ui(); });
on($('mode-adv'), 'click', function () { closeModeSheet(); J.sfx.ui(); openAdventure(); });
on($('map-back'), 'click', function () { J.sfx.ui(); leaveMap(); });
on($('map-gear'), 'click', openSettings);
on($('map-char'), 'click', openCharPanel);
on($('map-rec'), 'click', function () { J.sfx.ui(); openRank('endless'); });
on($('map-mission'), 'click', function () { openQuest('daily'); });   /* openQuest 가 ui 소리를 낸다 — 한 번만 */
var barTap = function (e) {
var b = e.target && e.target.closest ? e.target.closest('[data-kd]') : null;
if (!b) return;
kdBldgTap(b.getAttribute('data-kd') || '');
};
on($('kd-bot'), 'click', barTap);
on($('map-bot'), 'click', barTap);
on($('kd-menu'), 'click', function (e) {
var b = e.target && e.target.closest ? e.target.closest('.kd-mbtn') : null;
if (!b) return;
kdBldgTap(b.getAttribute('data-kd') || '');
});
on($('pg-close'), 'click', function () { closePlayground(); J.sfx.ui(); });
on($('pg-classic'), 'click', function () { closePlayground(); openClassicHub(); });
on($('pg-arcade'), 'click', function () { closePlayground(); openModeSheet({ arcadeOnly: true }); });
on($('kd-bot-plate'), 'click', function () { J.sfx.ui(); openMap(); });
on($('kd-bot-char'), 'click', openCharPanel);
on($('kd-top-rec'), 'click', function () { J.sfx.ui(); openRank('endless'); });
on($('kd-top-gear'), 'click', openSettings);
on($('kd-top-avatar'), 'click', openCharPanel);
on($('kd-top-mission'), 'click', function () { openQuest('daily'); });   /* openQuest 가 ui 소리를 낸다 — 한 번만 */
on($('map-ch-prev'), 'click', function () { mapGoChapter(-1); });
on($('map-ch-next'), 'click', function () { mapGoChapter(1); });
on($('map-chapter'), 'click', function () { openMinimap(); });
on($('mm-close'), 'click', function () { closeMinimap(); });
on($('mm-grid'), 'click', function (e) {
var el = e && e.target;
var cell = (el && el.closest) ? el.closest('.mm-cell') : null;
if (!cell) return;
mmPick(parseInt(cell.getAttribute('data-c'), 10) || 0);
});
buildMinimap();
buildTheater();
on($('th-close'), 'click', function () { closeTheater(); });
on($('th-grid'), 'click', function (e) {
var el = e && e.target;
var cell = (el && el.closest) ? el.closest('.mm-cell') : null;
if (!cell) return;
theaterPick(parseInt(cell.getAttribute('data-c'), 10) || 0);
});
on($('map-path'), 'click', function (ev) {
if (mapMoved > 6) return;
var el = ev && ev.target;
while (el && el !== this && !(el.classList && el.classList.contains('map-node'))) {
el = el.parentNode;
}
if (!el || el === this) return;
var n = parseInt(el.getAttribute('data-n'), 10) | 0;
if (n < 1) return;
if (advStatus(n) === 'lock') { toast(t('adv.locked')); J.sfx.fail(); return; }
J.sfx.ui();
openNodeCard(n);
});
var mv = $('map-view');
on(mv, 'pointerdown', mapDown);
on(mv, 'pointermove', mapMove, { passive: false });
on(mv, 'pointerup', mapUp);
on(mv, 'pointercancel', mapUp);
on(mv, 'pointerleave', mapUp);
on($('node-mates'), 'click', function (ev) {
var el = ev && ev.target;
while (el && el !== this && !(el.classList && el.classList.contains('nmate'))) {
el = el.parentNode;
}
if (!el || el === this) return;
setMate(el.getAttribute('data-mate') || '');
buildNodeMates();
});
on($('skill-btn'), 'click', function () { fireSkill(); });
on($('cutin'), 'click', function () { endCutin(true); });
on($('iv-no'), 'click', closeInvite);
on($('iv-yes'), 'click', inviteBuy);
on($('charget'), 'click', function () { charGetEnd(); });
on($('cin-next'), 'click', function (ev) { if (ev && ev.stopPropagation) ev.stopPropagation(); cinNext(); });
on($('charintro'), 'click', function () { cinNext(); });
on($('unlock-go'), 'click', closeUnlock);
on($('node-close'), 'click', function () { closeModal('modal-node'); J.sfx.ui(); });
on($('drops-close'), 'click', closeDrops);   /* 74 T12 */
on(document.querySelector('#modal-drops .dr-tabs'), 'click', function (ev) {
var b = ev && ev.target && ev.target.closest ? ev.target.closest('.dr-tab') : null;
if (!b || b.getAttribute('aria-selected') === 'true') return;
dropsTab(b.getAttribute('data-dtab'));
J.sfx.ui();
});
var ncInfoBs = document.querySelectorAll('#modal-node .nc-info');   /* 74 T13 — ⓘ 시간 종료 판정 + 별 조건 · [판정판 122 ②] 악당 기술 칩 ⓘ 도 같은 함수 */
for (var nib = 0; nib < ncInfoBs.length; nib++) on(ncInfoBs[nib], 'click', ncInfoToggle);
on(document.querySelector('#modal-node .nc-swap'), 'click', function () { openCharPanel(); });   /* 74 T13 — ⇄ 캐릭터 창 */
(function () {   /* 74 T13 수정 2회차 N1 — 구획 넘침 표시(ncBodyMore) 배선 */
var nb = document.querySelector('#modal-node .nc-body');
if (!nb) return;
on(nb, 'scroll', ncBodyMore);
if (typeof ResizeObserver === 'function') {
var ro = new ResizeObserver(ncBodyMore);
ro.observe(nb);
for (var ci = 0; ci < nb.children.length; ci++) ro.observe(nb.children[ci]);
}
})();
var resBodies = document.querySelectorAll('.res-body');   /* P3 T2 수정 2회차 · T9 — 작은 폰 결과 창(게임오버 · 데일리 · 아케이드)의 중간 구획 .res-body 넘침 표시. ncBodyMore 와 같은 무늬(읽기 한 묶음 → 속성 쓰기 하나) */
for (var rbi = 0; rbi < resBodies.length; rbi++) (function (ob) {
function overBodyMore() {
var more = ob.scrollHeight - ob.clientHeight - Math.ceil(ob.scrollTop) > 0;
if (more) { if (!ob.hasAttribute('data-more')) ob.setAttribute('data-more', ''); }
else if (ob.hasAttribute('data-more')) ob.removeAttribute('data-more');
}
on(ob, 'scroll', overBodyMore);
if (typeof ResizeObserver === 'function') {
var oro = new ResizeObserver(overBodyMore);
oro.observe(ob);
for (var oi = 0; oi < ob.children.length; oi++) oro.observe(ob.children[oi]);
}
})(resBodies[rbi]);
on(document, 'click', function (e) {
var n = e && e.target, x = null;
while (n && n !== document) {
if (n.classList && n.classList.contains('r10-x') && n.getAttribute('data-w6x')) { x = n; break; }
n = n.parentNode;
}
if (!x) return;
var tgt = $(x.getAttribute('data-w6x'));
if (tgt && tgt !== x) tgt.click();
});
on($('node-go'), 'click', function () {
advStart(parseInt(this.getAttribute('data-n'), 10) | 0);
});
on($('node-ad'), 'click', function () {
twWatchAdForHeart(this);
});
on($('adv-ad'), 'click', function () {
var btn = this;
twWatchAdForHeart(btn, function () {
setText('adv-hearts', t('adv.heartlost', { n: Math.max(0, store.hearts) }));
btn.hidden = true;
});
});
var cx2 = document.querySelectorAll('.coin-x2'); for (var cxi = 0; cxi < cx2.length; cxi++) on(cx2[cxi], 'click', coinX2Click);
on(window, 'resize', cx2Refit);   /* [Task 8d 수정 1회차 I1 · 덧붙임 D] 2배 줄 나란히/쌓기는 폭 · 방향 · 글꼴에 달려 있다(프레임당 한 번) */
try { if (document.fonts && document.fonts.ready) document.fonts.ready.then(cx2Refit); } catch (e) {}
on($('adv-map'), 'click', function () {
closeModal('modal-adv');
J.sfx.ui();
var b = $('board');
if (b) b.classList.remove('grayed');
openMap();
});
on($('adv-again'), 'click', function () {
closeModal('modal-adv');
var b = $('board');
if (b) b.classList.remove('grayed');
advStart(parseInt(this.getAttribute('data-n'), 10) | 0);
});
function pickTarget(ev, root) {
var el = ev && ev.target;
while (el && el !== root && !(el.hasAttribute && el.hasAttribute('data-char'))) {
el = el.parentNode;
}
return (el && el.hasAttribute && el.hasAttribute('data-char')) ? el : null;
}
on($('char-pick'), 'click', function (ev) {
if (now() - cpSwipeAt < 400) return;
var el = pickTarget(ev, this);
if (el) setChar(el.getAttribute('data-char'));
});
on($('mate-pick'), 'click', function (ev) {
if (now() - cpSwipeAt < 400) return;   /* 스와이프 직후의 합성 클릭 무시(캐릭터 줄 탭과 같다) */
var el = pickTarget(ev, this);
if (!el) return;
var pos = Array.prototype.indexOf.call(this.children, el);
if (pos < 0) return;
carSelectPos(CP_PET, pos, true, 'tap');
});
on($('cp-item-list'), 'click', function (ev) {
var el = ev.target;
while (el && el !== this && !(el.getAttribute && el.getAttribute('data-slot'))) {
el = el.parentNode;
}
if (!el || el === this) return;
openGear(el.getAttribute('data-slot'));
});
function gearPick(ev, root, cls) {
var el = ev && ev.target;
while (el && el !== root && !(el.classList && el.classList.contains(cls))) el = el.parentNode;
return (el && el !== root) ? el : null;
}
on($('gm-slots'), 'click', function (ev) {
var el = gearPick(ev, this, 'gm-slot');
if (el) gearSlotTap(el.getAttribute('data-slot'));
});
on($('gm-tabs'), 'click', function (ev) {
var el = gearPick(ev, this, 'cp-tab');
if (el) gearSlotTap(el.getAttribute('data-gmtab'));
});
on($('gm-grid'), 'click', function (ev) {
var el = gearPick(ev, this, 'gm-cell');
var id = el && el.getAttribute('data-item');
if (id) openGearInfo(id);
});
on($('gm-auto'), 'click', gearAutoEquip);
on($('gm-done'), 'click', function () { closeGear(); });
on($('gear-close'), 'click', function () { closeGear(); });
on($('gi-close'), 'click', function () { closeGearInfo(); });
on($('gi-act'), 'click', gearAct);
on($('modal-gear'), 'click', function (ev) { if (ev && ev.target === this) closeGear(); });
on($('modal-gear-info'), 'click', function (ev) { if (ev && ev.target === this) closeGearInfo(); });
on($('gm-grid'), 'scroll', function () { gearMore(this); });
(function () {
var gim = $('modal-gear-info'), main = gim && gim.querySelector ? gim.querySelector('.gi-main') : null;
if (main) on(main, 'scroll', function () { gearMore(this); });
if (typeof ResizeObserver !== 'function') return;
var ro = new ResizeObserver(function () { gearLayout(); gearInfoFit(); });
if ($('modal-gear')) ro.observe($('modal-gear'));
if (gim) ro.observe(gim);
})();
on($('char-open'), 'click', openCharPanel);
on($('cp-close'), 'click', closeCharPanel);
on($('cp-go'), 'click', cpConfirm);
on($('cp-tabs'), 'click', function (ev) {
var el = ev.target;
while (el && el !== this && !(el.classList && el.classList.contains('cp-tab'))) {
el = el.parentNode;
}
if (!el || el === this) return;
var k = el.getAttribute('data-cptab');
if (k === cpTabCur) return;
cpTab(k);
J.sfx.ui();
});
on(document, 'keydown', function (ev) {
if (!ev || (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight')) return;
if (ev.altKey || ev.ctrlKey || ev.metaKey) return;
var panel = $('charpanel');
var gw = $('modal-gear'), gwi = $('modal-gear-info');
if (!panel || panel.hidden || panel.hasAttribute('data-under') || (gw && !gw.hidden) || (gwi && !gwi.hidden)) return;
var tag = ev.target && ev.target.tagName;
if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
ev.preventDefault();
cpStep(ev.key === 'ArrowRight' ? 1 : -1);   /* [rc1011] 펫 탭 = 펫 줄 · 캐릭터 탭 = 캐릭터 줄 */
});
on($('charpanel'), 'click', function (ev) {
closeStatTip();
if (ev && ev.target === this) closeCharPanel();
});
(function () {
var view = (typeof document !== 'undefined' && document.querySelector)
? document.querySelector('#charpanel .cp-view') : null;
var sx = 0, sy = 0, live = false, drag = false;
function setDrag(panel, px) {
if (!panel || !panel.style) return;
if (px === null) {
panel.style.removeProperty('--cp-drag');
if (panel.removeAttribute) panel.removeAttribute('data-cp-drag');
return;
}
if (panel.setAttribute) panel.setAttribute('data-cp-drag', '1');
panel.style.setProperty('--cp-drag', px.toFixed(1) + 'px');
}
on(view, 'touchstart', function (ev) {
var tc = ev.touches && ev.touches.length === 1 ? ev.touches[0] : null;
if (!tc) { live = false; drag = false; setDrag($('charpanel'), null); return; }
sx = tc.clientX; sy = tc.clientY; live = true; drag = false;
}, { passive: true });
on(view, 'touchmove', function (ev) {
if (!live) return;
var tc = ev.touches && ev.touches.length === 1 ? ev.touches[0] : null;
if (!tc) return;
var dx = tc.clientX - sx, dy = tc.clientY - sy;
if (!drag && (Math.abs(dx) < 8 || Math.abs(dx) < Math.abs(dy) * 1.4)) return;
drag = true;
if (cpTabCur === 'pet') return;
var px = dx * .5;
if (px > 64) px = 64; else if (px < -64) px = -64;
setDrag($('charpanel'), px);
}, { passive: true });
on(view, 'touchend', function (ev) {
setDrag($('charpanel'), null);
if (!live) return;
live = false; drag = false;
var tc = ev.changedTouches && ev.changedTouches[0];
if (!tc) return;
var dx = tc.clientX - sx, dy = tc.clientY - sy;
if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy) * 1.4) return;
cpSwipeAt = now();
cpStep(dx < 0 ? 1 : -1);   /* [rc1011] 펫 탭 = 펫 줄 · 캐릭터 탭 = 캐릭터 줄 */
}, { passive: true });
on(view, 'touchcancel', function () {
live = false; drag = false; setDrag($('charpanel'), null);
}, { passive: true });
})();
on($('btn-settings'), 'click', openSettings);
on($('st-close'), 'click', closeSettings);
on($('modal-settings'), 'click', function (ev) { if (ev && ev.target === this) closeSettings(); });
on($('st-sound'), 'click', toggleSound);
on($('st-vibe'), 'click', toggleVibe);
on($('st-theme'), 'click', toggleTheme);
on($('st-lang'), 'click', toggleLang);
on($('st-howto'), 'click', function () { closeSettings(); openHowto(false); });
on($('screen-story'), 'click', function (ev) {
var tid = ev && ev.target && ev.target.id;
if (tid === 'cut-skip' || tid === 'cut-skipall') return;
cutNext();
});
on($('cut-skip'), 'click', function (ev) {
if (ev && ev.stopPropagation) ev.stopPropagation();
cutFinish(true);
});
on($('cut-skipall'), 'click', function (ev) {
if (ev && ev.stopPropagation) ev.stopPropagation();
cutFinishAll();
});
on($('cp-skin'), 'click', openSkins);
on($('cp-prev'), 'click', function () { cpShow(cpIdx - 1); J.sfx.ui(); });
on($('cp-next'), 'click', function () { cpShow(cpIdx + 1); J.sfx.ui(); });
on($('cp-pet-prev'), 'click', function () { carShow(CP_PET, CP_PET.getIdx() - 1, 'nav'); });
on($('cp-pet-next'), 'click', function () { carShow(CP_PET, CP_PET.getIdx() + 1, 'nav'); });
on($('sk-close'), 'click', closeSkins);
on($('cf-yes'), 'click', function () {
var m = $('modal-confirm');
if (!m || m.hidden) return;
var fn = confirmPending;
confirmPending = null;
if (fn) fn(); else closeConfirm();
});
on($('cf-no'), 'click', closeConfirm);
on($('modal-skin'), 'click', function (ev) { if (ev && ev.target === this) closeSkins(); });
on($('sk-list'), 'click', skinListClick);   /* P3 T5 — 이름 있는 함수(buildSkinList 옆) */
on($('cp-rack'), 'click', function (ev) {
if (now() - cpSwipeAt < 400) return;   /* 스와이프 직후의 합성 클릭 무시 */
var el = ev && ev.target;
while (el && el !== this && !(el.classList && el.classList.contains('cp-th'))) el = el.parentNode;
if (!el || el === this || !el.classList) return;
var track = $('cp-track');
var pos = track ? Array.prototype.indexOf.call(track.children, el) : -1;
if (pos < 0) return;
cpSelectPos(pos, true);
J.sfx.ui();
});
on($('btn-howto'), 'click', function () { openHowto(false); });
on($('btn-sound'), 'click', toggleSound);
on($('btn-vibe'), 'click', toggleVibe);
on($('btn-theme'), 'click', toggleTheme);
on($('btn-lang'), 'click', toggleLang);
// --- how to ---
on($('howto-prev'), 'click', function () { setHowto(howtoIdx - 1); J.sfx.ui(); });
// On the last panel Next has nothing to advance to (see setHowto): it is the
// tutorial entry instead, which is also the only way back in once it is done.
on($('howto-next'), 'click', function () {
if (howtoIdx >= 11) { openTutorial(true); return; }  // #34: 5→6→7장 · ⑥-c: →12장
setHowto(howtoIdx + 1);
J.sfx.ui();
});
on($('howto-close'), 'click', closeHowto);
// --- first-run tutorial ---
on($('tut-skip'), 'click', function () { finishTutorial(tutDone); });
on($('tut-stage'), 'pointerdown', onTutPointerDown);
var ts0 = $('tut-stage');
if (ts0 && ts0.style) ts0.style.touchAction = 'manipulation';
// --- game ---
var board = $('board');
if (board) {
board.style.touchAction = 'manipulation';
on(board, 'pointerdown', onBoardPointerDown);
on(board, 'dblclick', function (e) { if (e && e.preventDefault) e.preventDefault(); });
on(board, 'contextmenu', function (e) { if (e && e.preventDefault) e.preventDefault(); });
}
on($('btn-add'), 'click', function () { if (battleBoard()) return; doAdd(); });   /* [판정판 130] 전투에서는 단추가 은퇴(숨김) — 판 규약상 추가도 막힌다 */
on($('btn-hint'), 'click', function () { if (battleOn()) doSpecial(); else doHint(); });
on($('btn-undo'), 'click', function () { if (battleOn()) doPetSkill(); else doUndo(); });
on($('btn-shuffle'), 'click', function () { if (battleOn()) doAwaken(); else doShuffle(false); });
on($('btn-pause'), 'click', pause);
// --- pause modal ---
on($('pz-sound'), 'click', toggleSound);
on($('pz-vibe'), 'click', toggleVibe);
on($('pz-theme'), 'click', toggleTheme);
on($('pz-lang'), 'click', toggleLang);
on($('pz-howto'), 'click', function () { openHowto(true); });
on($('pz-restart'), 'click', restartStage);
on($('pz-menu'), 'click', function () {
if (S.mode === 'adv') { closeModal('modal-pause'); advAbandon(); return; }
goMenu();
});
on($('pz-resume'), 'click', resume);
// --- clear / over / daily ---
on($('btn-next'), 'click', nextStage);
on($('btn-continue'), 'click', doContinue);
on($('btn-shop'), 'click', function () { openShopScreen('jewel'); });
on($('sh-gear'), 'click', openSettings);
on($('sh-avatar'), 'click', openCharPanel);
on($('sh-rec'), 'click', function () { J.sfx.ui(); openRank('endless'); });
on($('sh-mission'), 'click', function () { openQuest('daily'); });   /* openQuest 가 ui 소리를 낸다 — 한 번만 */
on(window, 'resize', function () { if (shopActive()) shopFitCards(); });
var mmRefitRaf = 0;
var mmRefit = function () {
if (mmRefitRaf) return;
mmRefitRaf = requestAnimationFrame(function () {
mmRefitRaf = 0;
['mm-grid', 'th-grid'].forEach(function (id) { var g = $(id), m = g && g.closest ? g.closest('.modal') : null; if (m && !m.hidden) mmFitCols(g); });
});
};
on(window, 'resize', mmRefit);
on(window, 'resize', function () { mfFitFoots(document); });   /* [Task 8d 덧붙임 A] 결과 창 단추 줄 한 줄/쌓기도 폭 · 방향에 달려 있다 */
try { if (document.fonts && document.fonts.ready) document.fonts.ready.then(mmRefit); } catch (e) {}
try { if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { if (shopActive()) shopFitCards(); }); } catch (e) {}
on($('screen-shop'), 'click', function (ev) {
var el = ev && ev.target;
while (el && el !== this && !(el.getAttribute && (el.getAttribute('data-sh-act') || el.id === 'sh-close' ||
(el.classList && el.classList.contains('sh-tab'))))) el = el.parentNode;
if (!el || el === this || !el.getAttribute) return;
if (el.id === 'sh-close') { closeShopScreen(); return; }
if (el.classList && el.classList.contains('sh-tab')) { setShopTab(el.getAttribute('data-stab')); return; }
if (!el.disabled) shopAct2(el.getAttribute('data-sh-act'), el);
});
portalAdsSync(); on(window, 'tw:portal', portalAdsSync);   /* P3 — 부팅 때 게이트를 세우고, SDK 준비(env 확정) 알림에 다시 칠한다 — 상점을 안 연 세션도 결과 창 2배 줄이 산다 */
on($('shop-close'), 'click', closeShop);
on($('modal-shop'), 'click', function (ev) { if (ev && ev.target === this) closeShop(); });
on($('odds-close'), 'click', closeOdds);
on($('odds-tabs'), 'click', function (ev) {
var el = ev.target && ev.target.closest ? ev.target.closest('[data-otab]') : null;
if (el) { oddsKind = el.getAttribute('data-otab'); oddsPaint(); var ob = $('odds-body'); if (ob) ob.scrollTop = 0; J.sfx.ui(); }
});
on($('modal-odds'), 'click', function (ev) { if (ev && ev.target === this) closeOdds(); });
on($('gres-grid'), 'click', function (ev) { var li = ev.target && ev.target.closest ? ev.target.closest('.gres-card') : null; if (li) gresFlip(li, rwReduced()); });
on($('gres-all'), 'click', function () { gresOpenAll(rwReduced()); });
on($('gres-ok'), 'click', gresClose);
on($('gres-again'), 'click', function () { var a = (this.getAttribute('data-again') || '').split(':'); gresClose(); if (a.length === 3) gachaRun(a[0], parseInt(a[1], 10) || 1, a[2]); });
on($('modal-gres'), 'click', function (ev) { var tg = ev && ev.target; if (tg === this || (tg && tg.parentNode === this && tg.classList && tg.classList.contains('cut-dim'))) gresClose(); });
gresTokPrime();   /* 모션 토큰 일곱을 부팅 때 미리 읽는다 — 첫 뽑기의 여는 프레임에 강제 스타일 재계산 0(리뷰 I-5 · 모션 규칙 5) */
on($('shop-tabs'), 'click', function (ev) {
var el = ev && ev.target;
while (el && el !== this && !(el.getAttribute && el.getAttribute('data-shop-tab'))) el = el.parentNode;
if (!el || el === this || !el.getAttribute) return;
shopTab(el.getAttribute('data-shop-tab'));
J.sfx.ui();
});
on($('shop-body'), 'click', function (ev) {
var el = ev && ev.target;
while (el && el !== this && !(el.getAttribute && el.getAttribute('data-shop-act'))) el = el.parentNode;
if (!el || el === this || !el.getAttribute || el.disabled) return;
shopAct(el.getAttribute('data-shop-act'));
});
paintShopBalance();
on($('btn-over-retry'), 'click', function () { var rb = $('btn-retry'); if (rb) rb.click(); });
on($('btn-retry'), 'click', function () {
closeModal('modal-over');
J.sfx.ui();
if (S.mode === 'rush') { startRush(); return; }
S.score = 0; S.matches = 0; S.maxCombo = 1; S.startedAt = Date.now();
if (S.mode === 'daily') { startStage(1, dailySeed()); startTimer(); }
else startStage(1, (Math.random() * 0x7fffffff) | 0);
});
on($('btn-over-share'), 'click', function () {
shareCardOut('over', scoreShareText(), shareScore);
});
on($('btn-menu'), 'click', goMenu);
on($('btn-share'), 'click', function () {
shareCardOut('daily', shareText(), copyShare);
});
on($('btn-daily-menu'), 'click', goMenu);
on($('btn-rank'), 'click', function () {
// From the menu there is no run to be proud of yet, so nothing is fresh.
clearRankFresh();
openRank('endless');
});
on($('btn-over-rank'), 'click', function () { openRank(S.mode); });
on($('btn-clear-rank'), 'click', function () { openRank(S.mode); });
for (var rti = 0; rti < RANK_MODES.length; rti++) {
// The mode is captured per iteration; a plain `var` in the loop body would
// be shared by all three handlers and every tab would show the last one.
(function (m) {
on($('rank-tab-' + m), 'click', function () { setRankTab(m); });
}(RANK_MODES[rti]));
}
on($('rank-close'), 'click', closeRank);
on($('quest-close'), 'click', closeQuest);
on($('soon-close'), 'click', function () { closeModal('modal-soon'); J.sfx.ui(); });
on($('quest-tabs'), 'click', function (ev) {
var el = ev && ev.target;
while (el && el !== this && !(el.classList && el.classList.contains('qs-tab'))) {
el = el.parentNode;
}
if (!el || el === this) return;
setQuestTab(el.getAttribute('data-qtab'));
});
on($('quest-list'), 'click', function (ev) {
var el = ev && ev.target;
while (el && el !== this && !(el.classList && el.classList.contains('qs-get'))) {
el = el.parentNode;
}
if (!el || el === this || el.disabled) return;
questClaim(el.getAttribute('data-qtab'), el.getAttribute('data-qid'));
});
on($('quest-all'), 'click', function () {
if (questClaimAll(questTab) <= 0) { toast(t('quest.none')); J.sfx.fail(); }
});
// --- global ---
on(window, 'resize', onResize);
on(window, 'orientationchange', onResize);
on(document, 'keydown', function (e) {
if (!e) return;
if (cutList) {
if (e.key === 'Escape') { cutFinish(true); return; }
if (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowRight') {
if (e.preventDefault) e.preventDefault();
cutNext();
}
return;
}
if (e.key === 'Escape') {
if ($('charintro') && !$('charintro').hidden) { cinNext(); return; }
if ($('charget') && !$('charget').hidden) { charGetEnd(); return; }
if ($('modal-confirm') && !$('modal-confirm').hidden) { closeConfirm(); return; }
var cpEsc = $('charpanel');
if (cpEsc && !cpEsc.hidden && cpEsc.getClientRects && cpEsc.getClientRects().length) {
if ($('modal-gear-info') && !$('modal-gear-info').hidden) { closeGearInfo(); return; }
if ($('modal-gear') && !$('modal-gear').hidden) { closeGear(); return; }
if ($('modal-invite') && !$('modal-invite').hidden) { closeInvite(); return; }
if ($('modal-skin') && !$('modal-skin').hidden) { closeSkins(); return; }
if (statTipOpen) { closeStatTip(); J.sfx.ui(); return; }
closeCharPanel();
return;
}
if ($('modal-invite') && !$('modal-invite').hidden) { closeInvite(); return; }
if ($('modal-skin') && !$('modal-skin').hidden) { closeSkins(); return; }
if ($('modal-rank') && !$('modal-rank').hidden) { closeRank(); return; }
if ($('modal-quest') && !$('modal-quest').hidden) { closeQuest(); return; }
if ($('modal-settings') && !$('modal-settings').hidden) { closeSettings(); return; }
if ($('modal-soon') && !$('modal-soon').hidden) { closeModal('modal-soon'); return; }
if ($('modal-theater') && !$('modal-theater').hidden) { closeTheater(); return; }
// 10차 §C: 모드 시트는 메뉴 위에 떠 있는 한 겹이라 가장 먼저 닫힌다.
if ($('modal-mode') && !$('modal-mode').hidden) { closeModeSheet(); return; }
if ($('modal-playground') && !$('modal-playground').hidden) { closePlayground(); J.sfx.ui(); return; }
if ($('modal-shop') && !$('modal-shop').hidden &&
!($('modal-skin') && !$('modal-skin').hidden)) { closeShop(); return; }
if ($('modal-odds') && !$('modal-odds').hidden) { closeOdds(); return; }   /* P3 T7 — 확률 창은 상점 화면 위의 한 겹이라 먼저 닫힌다 */
if ($('modal-gres') && !$('modal-gres').hidden) { gresClose(); return; }   /* P3 T8 — 결과 창도 상점 화면 위의 한 겹 · 닫으면 gachaBusy 가 풀린다 */
if ($('screen-shop') && $('screen-shop').classList.contains('active')) { closeShopScreen(); return; }   /* P3 — 상점 화면 = 왕국 위 한 겹 */
// W7.5 — 클래식 허브도 메뉴 위의 한 겹이라 모드 시트와 같은 우선순위다.
if ($('modal-classic') && !$('modal-classic').hidden) { closeClassicHub(); return; }
if ($('modal-minimap') && !$('modal-minimap').hidden) { closeMinimap(); return; }
if ($('modal-drops') && !$('modal-drops').hidden) { closeDrops(); return; }
if ($('modal-node') && !$('modal-node').hidden) { closeModal('modal-node'); return; }
if ($('modal-clear') && !$('modal-clear').hidden) { goMenu(); return; }
if ($('modal-over') && !$('modal-over').hidden) { goMenu(); return; }
if ($('modal-arc') && !$('modal-arc').hidden) { goMenu(); return; }
if ($('modal-daily') && !$('modal-daily').hidden) { goMenu(); return; }
if ($('modal-adv') && !$('modal-adv').hidden) {
closeModal('modal-adv');
var bd = $('board');
if (bd) bd.classList.remove('grayed');
openMap();
return;
}
var msc = $('screen-map');
if (msc && msc.classList && msc.classList.contains('active')) { leaveMap(); return; }
// The tutorial is checked next: it can be opened from the How-to, so
// both sheets can be in play and the topmost one owns the key.
if ($('modal-tutorial') && !$('modal-tutorial').hidden) { finishTutorial(tutDone); return; }
if ($('modal-howto') && !$('modal-howto').hidden) { closeHowto(); return; }
if (S.paused) resume();
else if (S.running) pause();
}
});
if (typeof document !== 'undefined') {
document.addEventListener('pointerdown', function (ev) {
var t = ev && ev.target;
if (!t || typeof t.closest !== 'function') return;
var b = t.closest('button');
if (!b || b.disabled) return;
J.sfx.ui();
}, { passive: true });
}
// Single audio unlock on the very first pointer interaction.
var UNLOCK_EVENTS = ['pointerdown', 'touchstart', 'keydown'];
var unlock = function () {
if (audioUnlocked) return;
audioUnlocked = true;
J.unlockAudio();      // 무음 1샘플 start() = 그 자리에서 컨텍스트를 연다
J.resumeAudio();      // 구버전 juice.js 폴백(unlockAudio 가 no-op 인 경우)
// The loop BGM (review #4) can only start after a user gesture has unlocked
// audio. juice.js owns everything after this call — mute, tab-hide and tab-return
// are all handled there via bgmWanted — so this is the only start() the game
// needs, and it is deliberately never stopped: bgmStop() does NOT clear
// bgmWanted, so a stop here would be undone by the next tab return.
try {
var gsc = $('screen-game');
var inGame = !!(gsc && gsc.classList && gsc.classList.contains('active'));
if (J.bgm.scene !== noop) J.bgm.scene(inGame ? 'game' : 'menu');
else J.bgm.start();
} catch (e) { /* 소리 때문에 입력이 죽는 일은 없다 */ }
for (var ui = 0; ui < UNLOCK_EVENTS.length; ui++) {
document.removeEventListener(UNLOCK_EVENTS[ui], unlock, true);
}
};
if (typeof document !== 'undefined') {
for (var uj = 0; uj < UNLOCK_EVENTS.length; uj++) {
document.addEventListener(UNLOCK_EVENTS[uj], unlock, { capture: true, passive: true });
}
}
// A background tab freezes requestAnimationFrame, so feverLoop/comboLoop
// stop ticking and their wall-clock deadlines can pass unnoticed — the
// fever aura, gauge and combo label linger until the next match. Both loops
// already settle themselves when they find an expired deadline, so kicking
// each once on return is enough. Scoring is unaffected either way: an
// expired fever is never counted, this only clears the stale visuals.
if (typeof document !== 'undefined') {
on(document, 'visibilitychange', function () {
if (document.hidden || S.paused || !S.running) return;
stopFeverLoop(); feverLoop();
stopComboLoop(); comboLoop();
});
}
on(window, 'pagehide', function () { if (S.running) saveProgress(); });
on(window, 'beforeunload', function () { if (S.running) saveProgress(); });
}
var splashBooted = false;
var splashDone = false;
function splashAudioHook() {
if (!audioUnlocked) return;   // 제스처가 없었다 = 아직 소리를 낼 자격이 없다
try {
if (J.bgm.scene !== noop) J.bgm.scene('menu');
else J.bgm.start();
} catch (e) { /* 소리 때문에 화면 전환이 죽는 일은 없다 */ }
}
var splashBgmKicked = false;
// 2026-08-20 결함B 근본수리 — 아래는 교체 전 원본 전문(보존). 본문 안에 블록
// 주석이 들어 있어 블록 주석으로 감싸면 중첩이 깨지므로 줄주석으로 보존한다.
//   function splashBgmNow() {
//     if (!store.sound) return;              // 음악 OFF 존중
//     if (splashBgmKicked) { splashAudioHook(); return; }
//     splashBgmKicked = true;
//     try {
//       if (J.bgm.mainStop !== noop) J.bgm.mainStop(0);   // 헛돌던 running 을 내린다
//       if (J.bgm.scene !== noop) J.bgm.scene('menu');    // 제스처 태스크 안의 진짜 start()
//       else J.bgm.start();
//     } catch (e) { /* 소리 때문에 스플래시가 안 걷히는 일은 없다 */ }
//     try {
//       setTimeout(function () {
//         if (!store.sound) return;
//         /* 0.6초 사이에 이미 판이 열렸다면 로비 곡을 되돌려 씌우지 않는다 —
//            그 화면의 scene('game') 이 이미 옳은 판단을 했다. */
//         var gsc = $('screen-game');
//         if (gsc && gsc.classList && gsc.classList.contains('active')) return;
//         try {
//           if (J.bgm.scene !== noop) J.bgm.scene('menu');
//           else J.bgm.start();
//         } catch (e2) { /* 조용히 무시 — 다음 상호작용이 이어받는다 */ }
//       }, 600);
//     } catch (e3) { /* setTimeout 이 없는 환경은 폴백 없이 그대로 간다 */ }
//   }
// (원본 끝)
function splashBgmNow() {
if (!store.sound) return;
if (splashBgmKicked) { splashAudioHook(); return; }
splashBgmKicked = true;
var kick = function () {
if (!store.sound) return;
var gsc = $('screen-game');
if (gsc && gsc.classList && gsc.classList.contains('active')) return;
try {
if (J.bgm.mainStop !== noop) J.bgm.mainStop(0);
if (J.bgm.scene !== noop) J.bgm.scene('menu');
else J.bgm.start();
} catch (e) {}
};
var pr;
try { pr = J.resumeAudio(); } catch (e1) {}
if (pr && typeof pr.then === 'function') pr.then(kick, kick);
else { try { setTimeout(kick, 300); } catch (e2) {} }
}
var splashAutoTried = false;
function splashAudioBoot() {
if (splashAutoTried) return;
splashAutoTried = true;
try { window.__twWarmLow = true; } catch (e0) {}
try {
J.resumeAudio();
if (J.bgm.scene !== noop) J.bgm.scene('menu');
else J.bgm.start();
} catch (e) { /* 조용히 대기 — 첫 제스처가 이어받는다 */ }
finally { try { window.__twWarmLow = false; } catch (e1) {} }
}
function splashAudioBootSchedule() {
if (typeof document === 'undefined') return;
var boot = function () { try { window.setTimeout(splashAudioBoot, 1200); } catch (e) { splashAudioBoot(); } };
try {
if (document.readyState === 'complete') boot();
else window.addEventListener('load', boot, { once: true });
} catch (e) { /* 조용히 무시 */ }
}
var SPLASH_SHIELD_MS = 400;
var splashShieldUntil = 0;
function splashClickShield(ev) {
if (Date.now() > splashShieldUntil) {
splashDisarmShield();
return;                      // 이미 지났다 = 이 클릭은 사용자의 진짜 조작이다
}
try {
if (ev.cancelable) ev.preventDefault();
ev.stopPropagation();
if (ev.stopImmediatePropagation) ev.stopImmediatePropagation();
} catch (e) { /* 막는 데 실패해도 게임은 계속 돈다 */ }
}
function splashDisarmShield() {
try { document.removeEventListener('click', splashClickShield, true); } catch (e) {}
}
function splashArmShield() {
if (typeof document === 'undefined') return;
splashShieldUntil = Date.now() + SPLASH_SHIELD_MS;
try {
document.addEventListener('click', splashClickShield, true);
setTimeout(splashDisarmShield, SPLASH_SHIELD_MS + 40);
} catch (e) { /* 조용히 무시 */ }
}
function splashDismiss() {
if (splashDone) return;
splashDone = true;
splashArmShield();
var el = document.getElementById('splash');
if (!el) { splashAudioHook(); saveROFlush(); return; }
el.classList.add('is-out');
setTimeout(function () { el.hidden = true; }, 320);
splashAudioHook();
var roHold = saveROHoldMs();
setTimeout(saveROFlush, 320);   /* 대기가 없으면 아무 일도 안 한다 */
v74DueAt = now() + V74_NOTICE_DELAY + roHold;
setTimeout(v74Notice, V74_NOTICE_DELAY + roHold);   /* 74 — 첫 사용자 탭으로 스플래시가 걷히면 그 왕국에서 이전 알림(C4) */
setTimeout(p3Notice, P3_NOTICE_DELAY + roHold);   /* P3 — 첫 사용자 탭으로 스플래시가 걷히면 74 알림 사슬 뒤에 지갑 안내(C7) */
}
function splashDown() {
if (splashDone) return;
try { J.unlockAudio(); J.resumeAudio(); } catch (e) {}
audioUnlocked = true;
splashBgmNow();
J.sfx.ui();
}
function splashUp(ev) {
try { if (ev && ev.cancelable) ev.preventDefault(); } catch (e) {}
splashDismiss();
}
function splashBind() {
var el = document.getElementById('splash');
if (!el) return;
el.addEventListener('pointerdown', splashDown, { passive: true });
el.addEventListener('touchstart', splashDown, { passive: true });
el.addEventListener('pointerup', splashUp);
el.addEventListener('touchend', splashUp);
el.addEventListener('pointercancel', splashUp);
el.addEventListener('touchcancel', splashUp);
el.addEventListener('click', splashUp);
document.addEventListener('keydown', function () {
if (splashDone) return;
splashDown();
splashDismiss();
});
try { el.focus({ preventScroll: true }); } catch (e) {}
}
function introIsApp() {
try {
return !!(window.TW && window.TW.isApp) && !!document.getElementById('app-loading');
} catch (e) { return false; }
}
function introReduce() {
try { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); }
catch (e) { return false; }
}
var INTRO_SEEN_KEY = 'tentwin.introSeen.v1';
function introSeen() {
try { return window.localStorage.getItem(INTRO_SEEN_KEY) === '1'; } catch (e) { return false; }
}
function introMarkSeen() {
try { window.localStorage.setItem(INTRO_SEEN_KEY, '1'); } catch (e) { /* 사파리 프라이빗 등 */ }
}
var APL_MIN_MS = 600;
var aplEl = null, aplBar = null, aplCta = null;
var aplDone = 0, aplTotal = 0, aplShownAt = 0;
var aplReady = false, aplTapped = false, aplLeft = false;
function aplNode() {
if (!aplEl) aplEl = document.getElementById('app-loading');
return aplEl;
}
function aplProgress(done, total) {
aplDone = done; aplTotal = total;
var el = aplNode(); if (!el) return;
if (!aplBar) aplBar = el.querySelector('.apl-bar');
if (!aplBar) return;
var p = total > 0 ? (done / total) : 0;
if (p < 0.02) p = 0.02;
try {
aplBar.style.setProperty('--f2-gv', String(p));
aplBar.style.setProperty('--v', (p * 100).toFixed(1) + '%');
aplBar.setAttribute('aria-valuemax', String(total));
aplBar.setAttribute('aria-valuenow', String(done));
} catch (e) { /* 진행바 때문에 부팅이 죽지 않는다 */ }
}
function aplTip() {
var el = aplNode(); if (!el) return;
var p = el.querySelector('.apl-tip'); if (!p) return;
var key = 'load.tip' + (1 + Math.floor(Math.random() * 8));
try {
p.setAttribute('data-i18n', key);   /* 언어 전환이 와도 applyI18n 이 잇는다 */
p.textContent = t(key);
} catch (e) { /* 문구 때문에 부팅이 죽지 않는다 */ }
}
function aplMarkReady() {
var el = aplNode(); if (!el || aplReady) return;
var wait = APL_MIN_MS - (Date.now() - aplShownAt);
if (!(wait > 0)) wait = 0;
setTimeout(function () {
aplReady = true;
try { el.classList.add('is-ready'); } catch (e) {}
}, wait);
}
function aplHide() {
var el = aplNode(); if (!el) return;
try { el.classList.add('is-gone'); } catch (e) {}
}
function aplBindTap() {
var el = aplNode(); if (!el) return;
var down = function () {
if (aplTapped || !aplReady || aplLeft) return;
if (window.TW && window.TW.__holdLoading) return;   /* 하네스 정지 훅 */
aplTapped = true;
try { J.setSound(store.sound); } catch (e) {}
try { splashDown(); } catch (e2) {}
};
var up = function () {
if (!aplTapped || aplLeft) return;
aplLeft = true;
aplHide();
introStart();
};
el.addEventListener('pointerdown', down, { passive: true });
el.addEventListener('touchstart', down, { passive: true });
el.addEventListener('pointerup', up, { passive: true });
el.addEventListener('touchend', up, { passive: true });
el.addEventListener('pointercancel', up, { passive: true });
el.addEventListener('touchcancel', up, { passive: true });
el.addEventListener('click', function () { down(); up(); });
document.addEventListener('keydown', function () {
if (aplLeft || !aplReady) return;
down(); up();
});
}
var INTRO_ARM_MS = 260;   /* 합성 click 이 도착하는 창. 이 사이 스킵 입력 무시 */
var introEl = null, introTimer = 0, introDone = false, introArmAt = 0;
function introNode() {
if (!introEl) introEl = document.getElementById('app-intro');
return introEl;
}
function introMs(el, first) {
var v = '';
try {
v = getComputedStyle(el).getPropertyValue(first ? '--api-full' : '--api-short');
} catch (e) { v = ''; }
var n = parseFloat(String(v).trim());
if (!(n > 0)) return first ? 2400 : 1000;   /* 토큰이 사라진 경우의 폴백 */
return (String(v).indexOf('ms') >= 0) ? n : n * 1000;
}
function introSkip() {
if (Date.now() < introArmAt) return;
introFinish();
}
function introStart() {
var el = introNode();
if (!el) { introFinish(); return; }
var first = !introSeen();
introMarkSeen();
try { el.classList.add('is-on'); } catch (e) {}
introArmAt = Date.now() + INTRO_ARM_MS;
el.addEventListener('pointerup', introSkip, { passive: true });
el.addEventListener('touchend', introSkip, { passive: true });
el.addEventListener('click', introSkip);
document.addEventListener('keydown', introSkip);
if (window.TW && window.TW.__holdIntro) {
try { el.classList.add('is-hold'); } catch (e2) {}
return;
}
if (introReduce()) {
try { requestAnimationFrame(function () { requestAnimationFrame(introFinish); }); }
catch (e3) { introFinish(); }
return;
}
introTimer = setTimeout(introFinish, introMs(el, first));
}
function introFinish() {
if (introDone) return;
introDone = true;
try { clearTimeout(introTimer); } catch (e) {}
var el = introNode();
if (el) {
try {
el.classList.add('is-out');
setTimeout(function () { el.classList.remove('is-on'); el.classList.remove('is-out'); }, 320);
} catch (e2) {}
}
try { splashDismiss(); } catch (e3) {}
}
function bootYield(fn) {
var idle = function () {
try {
if (typeof window.requestIdleCallback === 'function') {
window.requestIdleCallback(fn, { timeout: 120 });
} else { setTimeout(fn, 0); }
} catch (e) { setTimeout(fn, 0); }
};
try { requestAnimationFrame(idle); } catch (e2) { setTimeout(idle, 0); }
}
function bootChunked(steps) {
aplShownAt = Date.now();
aplProgress(0, steps.length);
var i = 0;
var run = function () {
var f = steps[i++];
try { f(); }
catch (e) {
try { console.error('[tentwin] boot chunk ' + i + ' 실패', e); } catch (e2) {}
if (i === 1 && !storeLoaded) noteSaveReadOnly();   // final-fix I-4
}
aplProgress(i, steps.length);
if (i < steps.length) { bootYield(run); return; }
aplBindTap();
aplMarkReady();
};
bootYield(run);
}
try {
window.TW = window.TW || {};
window.TW.__appBoot = {
progress: function () { return [aplDone, aplTotal]; },
ready: function () { return aplReady; },
tap: function () { aplTapped = false; aplReady = true; aplLeft = false; },
introSeenKey: INTRO_SEEN_KEY,
introSkip: introSkip,
introFinish: introFinish
};
} catch (e) { /* 손잡이 때문에 부팅이 죽지 않는다 */ }
function init() {
TW_PORTAL.loadingStart();   /* Task 12 — 부팅 시작 신호. 포털 밖이면 no-op */
var APP = introIsApp();
var steps = [
function () {
if (FRUIT_TILES) {
try { document.documentElement.setAttribute('data-fruit', '1'); } catch (e) { /* ignore */ }
}
if (tileRasterReady()) {
try { document.documentElement.setAttribute('data-tileart', '1'); } catch (e) { /* ignore */ }
}
bindJuice();
loadStore();
// applyTheme() existed but was never called at startup, so a saved
// store.theme was silently ignored on every reload. It must run before the
// first paint, and before applyI18n()/syncToggleLabels() derive their labels.
applyTheme();
applyI18n();
if (APP) aplTip();
},
function () { J.init(); },
function () {
if (APP) { if (!store.sound) J.setSound(false); }
else { J.setSound(store.sound); }
J.setVibrate(store.vibrate);
},
function () {
wire();
setHowto(0);
gearInkInit();   /* 74 — 장비 과일 연출색을 보상 토큰에서 한 번 읽는다(JS 색 리터럴 0) */
gearFxInit();    /* 74 T11 — 장비 과일 빛 층 풀 4 · 획득 비행 풀 3 · 시간·이징 토큰을 한 번 만든다(판 중 DOM 생성 0) */
gearPoolInit();  /* 74 — 장비 (스탯, 등급) 표를 한 번 만든다(판 중 새 배열 0) */
},
function () {
applyHeroStats();
syncMenu();
syncHud();
},
// Daily already finished today? The menu button routes to the result screen.
function () { enterKingdom(); },
// review #2: the connection rule was never taught, so the tutorial is forced on
// first run. store.tutorialDone is set by BOTH completing and skipping it.
function () { if (!store.tutorialDone) openTutorial(false); },
function () {
splashBind();
splashBooted = true;
splashAudioBootSchedule();
},
function () { dailyLinkBoot(); }
];
var stepNames = ['loadStore', 'J.init', 'setSound', 'wire', 'applyHeroStats',
'enterKingdom', 'openTutorial', 'splashBind', 'dailyLinkBoot'];
if (stepNames.length !== steps.length) {
try { console.warn('[boot] stepNames.length(' + stepNames.length + ') != steps.length(' + steps.length + ')'); } catch (e0) {}
}
if (!APP) {
for (var i = 0; i < steps.length; i++) {
var _n = stepNames[i];
try {
if (window.TW_BOOT_HOOK && window.TW_BOOT_HOOK.step === _n && window.TW_BOOT_HOOK.fail) {
throw new Error('[TW_BOOT_HOOK] ' + _n);
}
steps[i]();
} catch (e) {
try { console.error('[boot]', _n, e); } catch (e2) {}
if (i === 0 && !storeLoaded) noteSaveReadOnly();   // final-fix I-4
}
}
return;
}
bootChunked(steps);
}
if (typeof document !== 'undefined') {
if (document.readyState === 'loading') {
document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
init();
}
}
window.Game = {
// pure rules
idxToRC: idxToRC, canMatch: canMatch,
isReadingConnected: isReadingConnected, isLineConnected: isLineConnected,
isConnected: isConnected, isValidPair: isValidPair,
findAnyPair: findAnyPair, countPairs: countPairs,
findFullDeadRows: findFullDeadRows, collapseRows: collapseRows,
buildAddCells: buildAddCells, mulberry32: mulberry32, genBoard: genBoard,
// EXT rules (special tiles) — exported so the layer can be unit-tested
spOf: spOf, iceOf: iceOf, isWild: isWild, canMatchEx: canMatchEx,
isValidPairEx: isValidPairEx, findAnyPairEx: findAnyPairEx,
countPairsEx: countPairsEx, bombTargets: bombTargets,
countSpecials: countSpecials, applySpecials: applySpecials,
applyBombs: applyBombs, cloneCells: cloneCells,
specialKinds: specialKinds, shuffleSeeded: shuffleSeeded,
genBoardBanded: genBoardBanded, pairDensityTarget: pairDensityTarget,
battleRefill: battleRefill, battleRefillEx: battleRefillEx,
battleFitBoard: battleFitBoard, battleRows: battleRows, battleOn: battleOn,
isArcadeDuel: isArcadeDuel, battleBoard: battleBoard,
startArcade: startArcade, arcFinish: arcFinish, arcSubmitBest: arcSubmitBest,
syncDuel: syncDuel,
duelTick: duelTick, duelHitFoe: duelHitFoe, duelHitMe: duelHitMe,
duelFoeGauge: duelFoeGauge, duelMeAttack: duelMeAttack,
duelOnMatch: duelOnMatch, duelInit: duelInit, duelTimeoutWin: duelTimeoutWin,
duelAtkMax: duelAtkMax, duelFoeHpMax: duelFoeHpMax, duelFoeHit: duelFoeHit,
duelNeedHits: duelNeedHits, arcFoeHpMax: arcFoeHpMax,
foeDriver: foeDriver,
doSpecial: doSpecial, doPetSkill: doPetSkill,
doAwaken: doAwaken, petPeck: petPeck, petShield: petShield,
awakenOn: awakenOn, awakenMult: awakenMult, awakenStart: awakenStart, awakenLeftMs: awakenLeftMs,
AWAKEN_MS: AWAKEN_MS, get lastGain() { return lastGainRec; },
duelFoeSkill: duelFoeSkill, duelTell: duelTell,
duelChillTick: duelChillTick, duelChillSync: duelChillSync,
runCutin: runCutin, hitStop: hitStop, shakeScreen: shakeScreen,
impactWord: impactWord, awakenBlast: awakenBlast, finishBlast: finishBlast,
multBandWord: multBandWord, multBandGap: multBandGap,
fullCue: fullCue, tipOnce: tipOnce, gaugeBump: gaugeBump,
bossDefeatFx: bossDefeatFx, applySkill: applySkill,
petFreeze4s_mongle: petFreeze4s_mongle, petRowShuffle_churup: petRowShuffle_churup,
duelAtkPct: duelAtkPct, duelSpPct: duelSpPct, syncBattleActs: syncBattleActs,
genBoardExt: genBoardExt, extRows: extRows, extBoardSize: extBoardSize,
extFillP: extFillP,
// v4 EXT: shuffle + blocked-path explanation, exported so both can be
// determinism-tested outside the DOM.
shuffleSeedFor: shuffleSeedFor, shuffleCellsEx: shuffleCellsEx,
shuffleBoardEx: shuffleBoardEx, blockersBetween: blockersBetween,
rejectReason: rejectReason,
applyStage1Gold: applyStage1Gold,
pickMission: pickMission, missionPool: missionPool,
missionGoals: MISSION_GOALS, gradeFor: gradeFor,
addsForStage: addsForStage,
// debug handles
openTutorial: openTutorial, tutLoadStep: tutLoadStep, finishTutorial: finishTutorial,
state: S, layout: layout, render: renderAll, boardArea: boardArea,
syncHud: syncHud,          /* 관문 하네스가 HUD 페인트를 직접 태우는 손잡이 */
startEndless: startEndless, startDaily: startDaily, startRush: startRush,
startClassic: startClassic, startClassicRush: startClassicRush,
startClassicDaily: startClassicDaily, openClassicHub: openClassicHub,
isClassic: isClassic, bestKey: bestKey, rankKeyOf: rankKeyOf,
menu: goMenu, advAbandon: advAbandon,   /* [T14 I-11] 뒤로가기 파수꾼(F4.2)이 부른다 */
reconcileRanks: reconcileRanks, submitRank: submitRank,
celebrateRank: celebrateRank, openRankModal: openRank, setRankTab: setRankTab,
onGameOver: onGameOver, onStageClear: onStageClear, finishDaily: finishDaily,
startStage: startStage, advFinish: advFinish, arcFinish: arcFinish, restoreSave: restoreSave,
showDailyResult: showDailyResult,   /* Phase B 우려4 — viaFinish 갈래 직접 검증용 */
checkMilestone: checkMilestone,
openQuest: openQuest, setQuestTab: setQuestTab, questsEnsure: questsEnsure,
dqBump: dqBump, achvCheck: achvCheck, questClaim: questClaim,
questClaimAll: questClaimAll, questClaimable: questClaimable,
questPaint: questPaint, weekKey: weekKey, dqRoll: dqRoll, wqRoll: wqRoll,
ACHV: ACHV, DAILY_QUESTS: DAILY_QUESTS, WEEKLY_QUESTS: WEEKLY_QUESTS,
DQ_REWARD: DQ_REWARD,
store: store,
jewelGrant: jewelGrant, jewelSpend: jewelSpend, jewelBalance: jewelBalance,
jewelRefillHearts: jewelRefillHearts, jewelBuyHeart: jewelBuyHeart,
appGemContinue: appGemContinue, jewelPayContinue: jewelPayContinue,
claimDailyFree: claimDailyFree, dailyFreeLeft: dailyFreeLeft,
openShop: openShop, closeShop: closeShop, shopTab: shopTab,
paintShopBalance: paintShopBalance,
coinBalance: coinBalance, coinGrant: coinGrant, coinSpend: coinSpend, starGrant: starGrant, starSpend: starSpend, grantItemOrRefund: grantItemOrRefund, p3Roll: p3Roll, p3Ensure: p3Ensure, advStarTotal: advStarTotal, advStarMax: advStarMax, GACHA_REFUND: GACHA_REFUND, COIN_MAX: COIN_MAX, P3_AD_CAP: P3_AD_CAP, P3_DEAL_CAP: P3_DEAL_CAP,
coinForAdv: coinForAdv, coinForRank: coinForRank, coinForArc: coinForArc, runCoinPay: runCoinPay, COIN_RUN: COIN_RUN,
shopPayForce: function (v) { shopPayForce = v ? 1 : 0; shopSyncPay(); },
rewardReveal: rewardReveal, rewardItems: rewardItems, openAdvSheet: openAdvSheet,
J: J,
advStarNote: advStarNote,
advPlan: advPlan, advBase: advBase, advDensityPct: advDensityPct,
advPctToDensity: advPctToDensity, advHand: advHand, advGoalType: advGoalType,
advPar: advPar, advStarsFor: advStarsFor, advStatus: advStatus,
advZig: advZig, advChapter: advChapter, advIsBoss: advIsBoss,
advDiffK: advDiffK,                       /* 0826 챕터 난이도 계수 D(ch) */
advStar2Need: advStar2Need, advStar3Need: advStar3Need,  /* 0910 탄별 별 문턱 */
heartsTick: heartsTick, heartNextMs: heartNextMs,
spendHeart: spendHeart, grantHearts: grantHearts,
applyHandicaps: applyHandicaps, isBlocker: isBlocker,
releaseBlockers: releaseBlockers, crumbleBlockers: crumbleBlockers,
advStart: advStart, openMap: openMap, openNodeCard: openNodeCard,
ncTeam: ncTeam, duelFoeDef: duelFoeDef,   /* 74 T13 — 편성 줄 · 악당 정의(스모크 t13b 가 읽는다) */
ncAtkArgs: ncAtkArgs, DUEL_SKILL_BLK: DUEL_SKILL_BLK, DUEL_SKILL_MASK: DUEL_SKILL_MASK, DUEL_SKILL_MASK_MS: DUEL_SKILL_MASK_MS,
DUEL_SKILL_QUAKE: DUEL_SKILL_QUAKE, DUEL_SKILL_CYCLE_MS: DUEL_SKILL_CYCLE_MS,   /* 74 T13 수정 1회차 — 기술 설명 수 · 시간(스모크 t13v) */
MAP_ANCHORS_CH: MAP_ANCHORS_CH, MAP_GATES: MAP_GATES,
get MAP_ANCHORS() { return mapAnchors(); },
get MAP_GATE() { return MAP_GATES[Math.min(Math.max(1, mapChap), MAP_GATES.length) - 1]; },
mapAnchors: mapAnchors, mapLowBottom: mapLowBottom,
mapFit: mapFit, mapCenterCurrent: mapCenterCurrent, mapGoChapter: mapGoChapter,
pairTypeP: pairTypeP, heroStatRaw: heroStatRaw, heroStatPct: heroStatPct,
heroStatDerived: heroStatDerived, HERO_STATS: HERO_STATS,
HERO_DEFS: HERO_DEFS, PET_STATS: PET_STATS,
STAT_BASE: STAT_BASE, STAT_UNIT: STAT_UNIT, STAT_UNIT_H: STAT_UNIT_H, STAT_BAR_MAX: STAT_BAR_MAX,
JACKPOT_MULT: JACKPOT_MULT, SKILL_JP_ADD: SKILL_JP_ADD, SKILL_SODA_MULT: SKILL_SODA_MULT,
statEff: statEff, statMult: statMult, statTipText: statTipText, statPctText: statPctText,
applyHeroStats: applyHeroStats,   /* skillKindOf 는 아래 gaugeGain 줄 묶음에 이미 있다(판정 M3 — 중복 키 금지) */
statCounters: function (v) {
if (v) { awkStreak = v.awk | 0; stdyRun = v.stdy | 0; statAgil = !!v.agil; }
return { awk: awkStreak, stdy: stdyRun, agil: statAgil };
},
ITEM_POOL: ITEM_POOL, ITEM_SLOTS: ITEM_SLOTS, ITEM_TIER_EFF: ITEM_TIER_EFF,
GACHA_OPEN_WEIGHTS: GACHA_OPEN_WEIGHTS, GACHA_BOX_STAGES: GACHA_BOX_STAGES,
GACHA_STAGE_P: GACHA_STAGE_P, GACHA_PITY: GACHA_PITY,
GIFT_SPAWN_RATE: GIFT_SPAWN_RATE,
persist: persist,
petPowN: petPowN, petDurMs: petDurMs, petUses: petUses, petRareP: petRareP,
PET_UP_LV_MAX: PET_UP_LV_MAX,
V74_NUM_CAP: V74_NUM_CAP, v74Notice: v74Notice, petGearCheck: petGearCheck, PET_GEAR_NEED: PET_GEAR_NEED,
openGachaRoll: openGachaRoll, isGachaStage: isGachaStage,
itemById: itemById, itemEffOf: itemEffOf, itemStatBonus: itemStatBonus,
itemScoreMult: itemScoreMult, itemOn: itemOn, ITEM_POOL: ITEM_POOL,
grantItem: grantItem, toggleItem: toggleItem, syncItemList: syncItemList,
openGear: openGear, closeGear: closeGear, openGearInfo: openGearInfo, closeGearInfo: closeGearInfo,
gearSlotTap: gearSlotTap, gearAutoEquip: gearAutoEquip,
itemArtUrl: itemArtUrl, itemArtCss: itemArtCss, ITEM_ART: ITEM_ART, itemSrcOf: itemSrcOf, ITEM_SRC: ITEM_SRC,
itemTile: itemTile, dropsTab: dropsTab,   /* [판정판 121 · Task 8a] 장비 칸 시트(t8a/sheet) · 획득표 탭 손잡이 — 게임 코드는 이 문을 안 거친다 */
petOwned: petOwned, grantPet: grantPet, petCondBump: petCondBump,
dropTableFor: dropTableFor, gearRoll: gearRoll, gearRollFrom: gearRollFrom, gearBossRoll: gearBossRoll,
harvestGear: harvestGear, gearPopFx: gearPopFx, MK_AWK_RATE: MK_AWK_RATE, GEAR_RATE_CH: GEAR_RATE_CH,
GEAR_TIER_CH: GEAR_TIER_CH, GEAR_AVG_CH: GEAR_AVG_CH, GEAR_LEAD_CYCLE: GEAR_LEAD_CYCLE,
MK_GEAR_LO: MK_GEAR_LO, MK_GEAR_BUF: MK_GEAR_BUF,
openDrops: openDrops, closeDrops: closeDrops, pctTxt: pctTxt, get dropsN() { return dropsN; },   /* 74 T12 — 획득표(smoke-v74-t12 · Task 13 카드가 pctTxt 를 쓴다) */
mkFxPool: mkFxPool,   /* 74 T11 — 장비 과일 빛 층 풀(smoke-v74-t11 t11f) */
INVITE_ORDER: INVITE_ORDER, INVITE_COST: INVITE_COST,
inviteCost: inviteCost, invitable: invitable, charOwned: charOwned,
openInvite: openInvite, closeInvite: closeInvite, inviteBuy: inviteBuy,
syncInvite: syncInvite, charStatPct: charStatPct,
charGetFx: charGetFx, charGetEnd: charGetEnd, getLifeMs: getLifeMs,
introDue: introDue, introPlay: introPlay, introLines: introLines,
cinNext: cinNext, introSeenChar: introSeenChar,
petGachaPool: petGachaPool,
syncMateLocks: syncMateLocks,
PET_FREE: PET_FREE, PET_BOSS: PET_BOSS, MATE_IDS: MATE_IDS,
petIds: petIds, petEntry: petEntry, makePetEntry: makePetEntry,
petTenBump: petTenBump, petLockText: petLockText,
PET_TEN_NEED: PET_TEN_NEED, PET_LEGACY_ALL: PET_LEGACY_ALL,
playCuts: playCuts, CUTS_OPEN: CUTS_OPEN, CUTS_SORTIE: CUTS_SORTIE,
CUTS_FREE: CUTS_FREE, CUTS_CHAP: CUTS_CHAP, CUTS_END: CUTS_END,
advFinish: advFinish, runUnlock: runUnlock,
harvestFinale: harvestFinale, harvestGain: harvestGain,
harvestSpec: { perTile: HARVEST_PER_TILE, lead: HV_LEAD_MS, span: HV_SPAN_MS,
stepMin: HV_STEP_MIN, stepMax: HV_STEP_MAX,
hold: HV_HOLD_MS, tail: HV_TAIL_MS },
enterKingdom: enterKingdom, buildKingdom: buildKingdom, kdBldgTap: kdBldgTap,
kdUnlocked: kdUnlocked, kdBuilding: kdBuilding,   /* [116] kdResTap · kdResidents 은퇴 */
kdStore: kdStore, homeScreen: homeScreen,
KD_BUILDINGS: KD_BUILDINGS, KD_ZONES: KD_ZONES, KD_DECO: KD_DECO,
KD_TAP_CAP: KD_TAP_CAP,
openShopScreen: openShopScreen, closeShopScreen: closeShopScreen, setShopTab: setShopTab, portalAdsOk: portalAdsOk, portalAdsSync: portalAdsSync, SHOP_ART: SHOP_ART, shopFreeCount: shopFreeCount,
dealBuy: dealBuy, dealGearOf: dealGearOf, dealLeft: dealLeft,   /* P3 T5 — 특가 */
gachaTable: gachaTable, gachaPull: gachaPull, gachaBuy: gachaBuy, gachaPick: gachaPick, gachaDrawItem: gachaDrawItem, friendOwned: friendOwned, grantFriend: grantFriend, GACHA_PRICE: GACHA_PRICE, GACHA_TIER_P: GACHA_TIER_P, GACHA_TEN_UP: GACHA_TEN_UP,   /* P3 T6 — 뽑기 엔진(표 한 출처) */
gachaKindSet: gachaKindSet, gachaRun: gachaRun, gachaPlay: gachaPlay, openOdds: openOdds, closeOdds: closeOdds, pctText: pctText,   /* P3 T7 — 뽑기 탭 · 확률 정보 창 */
gresOpenAll: gresOpenAll, gresClose: gresClose, gresOpen: gresOpen,   /* P3 T8 — 뽑기 결과 창(캡슐 · 카드 뒤집기). gresOpen 은 수정 1회차(결제 없이 여는 손잡이 — 성능 귀속 측정 · 뒤 태스크) */
adCapLeft: adCapLeft, adRowOk: adRowOk, watchAdFor: watchAdFor, paintCoinX2: paintCoinX2, twWatchAdForHeart: twWatchAdForHeart, P3_AD_COIN: P3_AD_COIN, P3_AD_STAR: P3_AD_STAR,   /* P3 T9 — 보상형 광고 */
friendDupPay: friendDupPay, P3_DUP_STAR: P3_DUP_STAR,   /* P3 T10 — 중복 친구 별 +10 */
paintShopTab: paintShopTab, SHOP_PAINT: SHOP_PAINT, SHOP_DOTS: SHOP_DOTS,   /* 수정 1회차 M-2 · M-6 — 탭 태스크 스모크가 표에 자기 함수를 넣어 본다 */
mateId: mateId, setMate: setMate, cpTab: cpTab, openCharPanel: openCharPanel,
duelFoeFull: duelFoeFull, PET_SKILL: PET_SKILL,
openModeSheet: openModeSheet, openAdventure: openAdventure,
gaugeGain: gaugeGain, gaugeBump: gaugeBump, gaugeFull: gaugeFull,
skillKindOf: skillKindOf, skillCastOf: skillCastOf, skillOn: skillOn,
canFireSkill: canFireSkill, fireSkill: fireSkill,
castSkill: castSkill, applySkill: applySkill, endSkill: endSkill,
skillTick: skillTick, skillReset: skillReset, endCutin: endCutin,
fxBusy: fxBusy, twinApply: twinApply,
matchKind: matchKind, twMultOf: twMultOf, passiveReset: passiveReset,
bossDefOf: bossDefOf, bossUltDmg: bossUltDmg, bossHpMax: bossHpMax,
bossAtkIdOf: bossAtkIdOf, advSeedOf: advSeedOf, ADV_MISSION_FIXED: ADV_MISSION_FIXED,
bossFinishOf: bossFinishOf, enterFinish: enterFinish, missionBump: missionBump,
finishLeftMs: finishLeftMs, DUEL_FINISH_MS: DUEL_FINISH_MS,
bossUltNeed: bossUltNeed,                 /* 0826 챕터별 필요 필살기 수 */
bossOnMatch: bossOnMatch, bossOnMissionDone: bossOnMissionDone,
bossOnMissionFail: bossOnMissionFail, bossDamage: bossDamage,
bossTick: bossTick, bossStart: bossStart, bossReset: bossReset,
bossDropBlockers: bossDropBlockers, bossCondText: bossCondText,
bossAtkNow: bossAtkNow, bossAtkText: bossAtkText, bossSkillFire: bossSkillFire,
bossFreezeCol: bossFreezeCol, bossMaskCells: bossMaskCells,
bossMaskClear: bossMaskClear, bossMaskTick: bossMaskTick,
bossQuakeRows: bossQuakeRows, bossSkillStat: bossSkillStat,
bossCondMatch: bossCondMatch, bossCondReward: bossCondReward,
BOSS_DEFS: BOSS_DEFS,
heroUnlocked: heroUnlocked, charId: charId, setChar: setChar,
readStore: readStore, runHurry: runHurry, endHurry: endHurry,
runBang: runBang, endBang: endBang, maybeHurry: maybeHurry,
shiftDeadlines: shiftDeadlines,
shareText: shareText, arcShareText: arcShareText, scoreShareText: scoreShareText,
SHARE_URL: SHARE_URL,
buildShareCard: buildShareCard, CARD_L: CARD_L,
dailyKey: dailyKey, dailyIsReplay: dailyIsReplay, dailyShareUrl: dailyShareUrl,
SKILL_MS: SKILL_MS, fmtSec: fmtSec,
cutFinishAll: cutFinishAll, cutSeen: cutSeen,
// i18n
setLang: setLang, t: t, lang: currentLang, dict: I18N
};
})();
