
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
var SCHEMA_VERSION = 1;
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
var FEVER_COMBO = 5;          // combo level that ignites fever
var FEVER_MS = 10000;         // initial duration
var FEVER_MAX_MS = 20000;     // remaining-time ceiling
var FEVER_STEP_MS = 1000;     // +1s per match while fevered
var FEVER_MULT = 2;           // all score ×2 during fever
var FEVER_CD_MS = 8000;       // re-entry lockout: fever must stay an event
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
{ id: 'item',   goal: [1, 1, 1],  fix: 1, ico: '--lib-glyph-coin' }, /* [T8-0926·65] 코인 원반으로 */
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
skin:      100,                  // §20.3 스킨 (젬리별 25 × 「1★ ≈ 4💎」)
shardPack:  60                   // §20.3 확정 파편 팩(색 선택)
};
var SHARD_PACK_N = 30;             // §20.3 「고른 색 30알」
var JSTAR_TRADE = [{ jewel: 25, star: 100 }, { jewel: 100, star: 400 }];
var JEWEL_PACKS = [
{ sku: 'jewel_s_60',   tier: 's',  krw: 1200,  n: 60 },
{ sku: 'jewel_m_180',  tier: 'm',  krw: 3300,  n: 180 },
{ sku: 'jewel_l_330',  tier: 'l',  krw: 5500,  n: 330 },
{ sku: 'jewel_xl_720', tier: 'xl', krw: 11000, n: 720 }
];
var START_PACK = { sku: 'jewel_start', krw: 1200, n: 60, hearts: 5, shards: 30 };
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
var DUEL_PET_FREEZE_MS = 6000;     // 뭉치 "덩어리 방패" — 적 게이지 동결 시간
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
if (!rush && stage < SP_STAGE_MIN) return applyStage1Gold(cells, rng);
var live = [];
for (var i = 0; i < cells.length; i++) {
if (cells[i] && !cells[i].dead && !cells[i].sp) live.push(i);
}
if (!live.length) return cells;
var density = Math.min(rush ? SP_DENSITY_RUSH : SP_DENSITY, SP_MAX_RATIO);
var room = Math.floor(cells.length * SP_MAX_RATIO) - countSpecials(cells);
var target = Math.round(live.length * density);
if (target > room) target = room;
if (target > live.length) target = live.length;
if (target <= 0) return cells;
shuffleSeeded(live, rng);
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
el.matches('.modal-v2 .mv2-sheet > h2, .modal-v2 .mv2-head > h2, #modal-node .r10-ribbon > h2, #modal-clear .sheet > h2, #modal-adv:not(.is-advfinish) .sheet > h2'));
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
'.modal-v2 .mv2-sheet > h2, .modal-v2 .mv2-head > h2, #modal-node .r10-ribbon > h2, #modal-clear .sheet > h2, #modal-adv:not(.is-advfinish) .sheet > h2');
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
'.modal-v2 .mv2-sheet > h2, .modal-v2 .mv2-head > h2, #modal-node .r10-ribbon > h2, #modal-clear .sheet > h2, #modal-adv:not(.is-advfinish) .sheet > h2');
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
var J = { sfx: {}, bgm: { start: noop, stop: noop, setFever: noop, setIntensity: noop,
setPanic: noop, scene: noop, mainStart: noop, mainStop: noop,
setNight: noop } };
var JUICE_FNS = ['init', 'setSound', 'setVibrate', 'resumeAudio',
'unlockAudio', 'burst', 'beam',
'sweep', 'confetti', 'floatText', 'screenPulse', 'vignette',
'vibrate', 'clear',
'shockwave', 'feverAura',
'brokenLink', 'feverEnter', 'duck',
'lineGuide'];
var JUICE_SFX = ['select', 'match', 'fail', 'rowClear', 'combo', 'deal', 'win', 'lose', 'ui',
'feverOn', 'feverOff', 'bomb', 'gold', 'ice', 'mission',
'heartbeat', 'grade', 'milestone',
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
var b = src.bgm || {};
J.bgm = {
start:    (typeof b.start === 'function') ? b.start.bind(b) : noop,
stop:     (typeof b.stop === 'function') ? b.stop.bind(b) : noop,
setFever: (typeof b.setFever === 'function') ? b.setFever.bind(b) : noop,
setIntensity: (typeof b.setIntensity === 'function') ? b.setIntensity.bind(b) : noop,
setPanic: (typeof b.setPanic === 'function') ? b.setPanic.bind(b) : noop,
scene:     (typeof b.scene === 'function') ? b.scene.bind(b) : noop,
mainStart: (typeof b.mainStart === 'function') ? b.mainStart.bind(b) : noop,
mainStop:  (typeof b.mainStop === 'function') ? b.mainStop.bind(b) : noop,
setNight:  (typeof b.setNight === 'function') ? b.setNight.bind(b) : noop,
mainInfo:  (typeof b.mainInfo === 'function') ? b.mainInfo.bind(b) : function () { return null; }
};
}
bindJuice(); // pre-bind to no-ops so nothing can throw before init()
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
bestRush: 0,        // Time Rush high score, kept apart from `best`
totalMatches: 0,    // lifetime matches, drives the milestone toasts
milestones: [],     // milestone values already celebrated
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
items: { own: {}, eq: {} },
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
kingdom: { unlocked: [], zones: [], deco: {}, lastVisit: 0, tapToday: 0 },
jewel: 0,
iap: {},
dailyFreeAt: 0,
firstBuy: false,
quests: null,
achv: {},
comboMax: 0,      // 계정 최고 콤보 (에픽 combo5/10/20)
duelWins: 0,      // 아케이드 대전 누적 승 (에픽 duel1/10 · 일일 duel)
awkTotal: 0       // 각성 누적 발동 (에픽 awaken50 · 일일 awaken)
};
function loadStore() {
readStore();
reconcileRanks();
ensureArcadeBest();     // 아케이드 대전 기록판 — 위 reconcile 과 같은 이유로 무조건
storeLoaded = true;
}
var SCHEMA_MIGRATIONS = [
function v0to1(o) { return o; }
];
var persistReadOnly = false;   // 미래 버전 저장을 만나면 true — 덮어쓰지 않는다
var storeLoaded = false;       // [F7.1-0925 fix1 M1] loadStore() 가 끝까지 돌면 true
var saveROWarned = false;      // final-fix I-4 — 세션당 1회만 아래 토스트
function noteSaveReadOnly() {
persistReadOnly = true;
if (saveROWarned) return; saveROWarned = true;
try { toast(t('toast.savero')); } catch (e) { /* 알림 때문에 부팅이 죽지 않는다 */ }
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
persistReadOnly = true;
try { console.warn('[tentwin] save schema v' + from + ' > v' + SCHEMA_VERSION + ': read-only, backup ' + LS_BAK_PREFIX + from); } catch (e) {}
return o;
}
for (var v = from; v < SCHEMA_VERSION; v++) {
try { o = SCHEMA_MIGRATIONS[v](o) || o; } catch (e) { break; }
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
if (typeof o.bestRush === 'number' && isFinite(o.bestRush)) store.bestRush = o.bestRush;
if (typeof o.totalMatches === 'number' && isFinite(o.totalMatches)) {
store.totalMatches = o.totalMatches;
}
if (Array.isArray(o.milestones)) {
store.milestones = o.milestones.filter(function (m) { return typeof m === 'number'; });
}
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
if (typeof o.tutorialDone === 'boolean') store.tutorialDone = o.tutorialDone;
if (typeof o.tutorialCleared === 'boolean') store.tutorialCleared = o.tutorialCleared;
if (o.theme === 'dark' || o.theme === 'light' || o.theme === '') store.theme = o.theme;
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
store.jstar = Math.max(0, o.jstar | 0);
} else {
store.jstar = advStarsTotalOf(store.advStars);
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
if (isRush() || S.mode === 'adv') { persist(); return; }
store[saveSlot()] = {
mode: S.mode, stage: S.stage, seed: S.seed,
cells: cloneCells(S.cells),
score: S.score, adds: S.adds, addsV: 2, hints: S.hints, startedAt: S.startedAt,
matches: S.matches, maxCombo: S.maxCombo, gridSeed: S.gridSeed,
addSeq: S.addSeq,
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
for (i = 0; i < RANK_MODES.length; i++) {
mode = RANK_MODES[i];
R[mode] = stableRankSort(R[mode], rankCmpFor(mode)).slice(0, RANK_CAP);
}
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
'load.tip3': 'Shard colour shows the stat it raises.',
'load.tip4': 'Tap the ⓘ next to a stat to read it.',
'load.tip5': 'Skill fires once the gauge is full.',
'load.tip6': 'Pet skills can turn a battle around.',
'load.tip7': 'The daily puzzle builds your streak.',
'load.tip8': 'Stuck? Shuffle makes new pairs.',
'aria.logo': 'Ten Twin Jelly Pang World',
'aria.splash': 'Tap the screen to start',
'aria.play': 'Play Endless mode',
'aria.daily': "Play today's daily puzzle",
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
'pause.sound.on': 'Sound: On',
'pause.sound.off': 'Sound: Off',
'pause.vibe.on': 'Vibration: On',
'pause.vibe.off': 'Vibration: Off',
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
'rw.gem': 'Jelly Stars',
'rw.heart': 'Hearts',
'rw.shard.power': 'Power shard',
'rw.shard.steady': 'Steady shard',
'rw.shard.agility': 'Agility shard',
'rw.shard.luck': 'Luck shard',
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
'cp.sk.eff': 'Effect',
'cp.sk.skill': 'Skill',
'cp.sk.use': 'Uses',
'cp.sk.usev': '{n} per match',
'cp.sk.perm': 'Always on',
'cp.sk.none': 'Going solo. No pet skill this run.',
'cp.pet.empty': 'Pick a pet and their skill shows up here. {free} are with you from the very first round.',
'cp.pet.sep': ' and ',
'cp.sk.lock': 'Locked',
'aria.loadout': 'Loadout',
'pet.up.btn': 'Upgrade',
'pet.up.max': 'MAX',
'pet.up.cost': '{n} shards',
'pet.up.bal': '{s}: {n}',
'pet.up.poor': '{s} short by {n}',
'pet.up.done': '{s} up! Lv.{lv}',
'pet.up.maxmsg': 'That lever is already at its peak.',
'pet.up.aria': 'Upgrade {s} to Lv.{lv} for {n} shards',
'pet.axis.link': 'Link',
'pet.axis.time': 'Time',
'pet.axis.cleanse': 'Cleanse',
'pet.axis.layout': 'Layout',
'pet.axis.value': 'Value',
'pet.axis.count': 'Harvest',
'pet.axis.sweep': 'Sweep',
'pet.axis.awaken': 'Skill',
'cp.items.none': 'No items yet. Pop a gift box in Adventure.',
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
'item.puddingcharm.nm': 'Pudding Shield',
'item.puddingcharm.fl': 'A piece the Pudding Knight handed over, saying he did not need it.',
'item.soon': 'Coming soon',
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
'char.ppyak.pass': 'For 8 seconds, tiles far apart can link too. Ice tiles break in one match while it lasts.',
'char.mungchi.name': 'Mungchi',
'char.mungchi.pass': 'Stops the clock and the villain gauge for 8 seconds. You can keep matching while they are stopped.',
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
'char.mongle.pass': 'Stops the clock and the villain gauge for 4 seconds. You can keep matching while they are stopped.',
'char.churup.name': 'Churup',
'char.churup.pass': 'Picks a row with two or more tiles left and reshuffles it. It also blocks the next board quake.',
'char.mukmul.name': 'Inky',
'char.mukmul.pass': 'Repaints 5 tiles into the most common number on the board.',
'char.tiktok.name': 'TikTok',
'char.tiktok.pass': 'Stops time for 6 seconds. You can keep matching while the clock and the villain gauge are stopped.',
'char.kkultteok.name': 'Honeybee',
'char.kkultteok.pass': 'Turns 2 fruits into golden fruits. A match with a golden fruit scores 3 times the points.',
'char.bangul.name': 'Bubbly',
'char.bangul.pass': 'Washes away 2 blocker or ice tiles. Hidden numbers come back all at once.',
'char.ppyak.pass2': 'For 8 seconds, tiles far apart can link too. Ice tiles break in one match while it lasts.',
'char.sseokssak.name': 'Sweepy',
'char.sseokssak.pass': 'Clears 7 of the remaining tiles at once. It also blocks the next board quake.',
'char.banjjak.name': 'Sparky',
'char.banjjak.pass': 'Fills the Skill gauge by 48% at once.',
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
'combo.tier1': 'ON FIRE!',
'combo.tier2': 'BLAZING!',
'combo.tier3': 'UNREAL!',
'combo.tier4': 'LEGENDARY!',
'lang.short': 'EN',
'menu.rush': 'Time Rush',
'menu.rushdesc': '90 seconds. Every match buys time.',
'menu.bestrush': 'Rush {score}',
'aria.rush': 'Play time rush mode',
'hud.rush': 'Time left',
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
'clear.grade': 'Rank',
'grade.s': 'S',
'grade.a': 'A',
'grade.b': 'B',
'grade.c': 'C',
'grade.s.msg': 'Flawless run!',
'grade.a.msg': 'Sharp work.',
'grade.b.msg': 'Solid clear.',
'grade.c.msg': 'Cleared. Try it faster.',
'milestone.title': 'Match #{n}!',
'milestone.title.rw': 'Match #{n}! Jelly Stars +{v}',
'milestone.sub': 'What a streak. Keep going.',
'over.share': 'Share',
'aria.overShare': 'Share your score with a result card image',
'tut.skip': 'Skip',
'aria.tutSkip': 'Skip the tutorial',
'aria.theme': 'Theme',
'aria.pzTheme': 'Change theme',
'pause.theme.dark': 'Theme: Dark',
'pause.theme.light': 'Theme: Light',
'tut.replay': 'Try it',
'tut.s1': 'Two <b>7</b>s, one above the other, in a straight line. Tap them.',
'tut.s2': 'Two <b>2</b>s up there. Try those.',
'tut.s2fail': 'See? Bent lines do not connect. Straight only, and diagonals count. <b>7</b> and <b>3</b> make <b>10</b>.',
'tut.s3': 'End of the row, start of the next. Those two <b>6</b>s still reach each other.',
'tut.s3fail': 'Not that one. Go from the <b>end</b> of a row to the <b>start</b> of the next.',
'tut.done': 'That\'s the basics. Now beat the villain!',
'rules.title': 'Three rules. That is all.',
'rules.c1': 'Ten & Twin',
'rules.c4': 'Overdrive',
'rules.c5': 'Finish',
'rules.r1': 'Same number, or two that make <b>10</b>.',
'rules.r2': 'Joined by a <b>straight path</b> across, down, or diagonally.',
'rules.r3': 'Or the <b>end</b> of a row to the <b>start</b> of the next.',
'rules.note': 'Either way, nothing may be left standing in between.',
'skills.title': 'Four buttons in battle',
'skills.s1': '<b>Attack</b> fills with every point you score and fires on its own when full.',
'skills.s2': '<b>Awakening</b> fills only when you <b>alternate</b> sum-10 and same-number matches. Tap it and every point you earn is <b>×{am}</b> for {awk}s.',
'skills.s3': "<b>Skill</b> fills with every match, faster at higher combos. Tap it to fire your hero's own skill.",
'skills.s4': '<b>Pet</b> calls your chosen pet\'s skill a set number of times each round.',
'skills.note': 'A <b>skill fruit</b> fills the skill gauge at once; a <b>pet fruit</b> gives one more Pet use.',
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
'menu.continueStage': 'Stage {stage}',
'hero.streak': 'Streak',
'streak.reward': '{d}-day streak reward!',
'hero.best': 'Best stage',
'menu.new': 'NEW',
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
'minimap.title': 'Chapters',
'minimap.locked': 'Clear stage {n} to unlock',
'minimap.sum': '{s} stars · {c}/10 chapters open',
'aria.minimap': 'See all chapters',
'aria.mmcell': 'Chapter {c}, {s} stars, {d} stages cleared',
'aria.mmlock': 'Chapter {c}, locked',
'theater.title': 'Story Theater',
'theater.locked': 'Reach Chapter {n} to unlock',
'aria.thcell': 'Chapter {c} story replay',
'mode.arcade': 'Endless',
'mode.arcade.d': 'Endless. Chase your best.',
'mode.daily.d': 'One board a day, for all.',
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
'aria.gallery': 'Story gallery',
'aria.credits': 'Credits',
'aria.cutskip': 'Skip the story',
'aria.cutskipall': 'Skip the whole story',
'settings.gallery': 'Story gallery',
'settings.credits': 'Credits',
'credits.body': 'Ten Twin: Jelly Pang World · Art & music by the author, built with the game factory.',
'pick.rec': 'Best for',
'pet.combo.k': 'Best team',
'pet.combo.why.ppyak.twin': "Far tiles link, so Twin's same-number +60% hits often.",
'pet.combo.why.mungchi.pudding': 'The clock stops for 8s. Pudding Knight stacks more points.',
'pet.combo.why.mongle.ten': 'The clock stops for 4s. Tenten gathers more sum-10 pairs.',
'pet.combo.why.churup.pudding': "A reshuffled row keeps Pudding Knight's chain alive.",
'pet.combo.why.mukmul.ten': "5 same-number tiles keep pairs flowing during Tenten's skill.",
'pet.combo.why.tiktok.twin': 'Time stops for 6s, so Twin can gather same-number pairs.',
'pet.combo.why.kkultteok.jelly': "Golden fruits' 3x stacks with both heroes' jackpots.",
'pet.combo.why.bangul.jelly': 'Fewer blockers mean more jackpot rolls for both heroes.',
'pet.combo.why.sseokssak.twin': 'Clearing 7 tiles at once speeds up speedrunner Twin.',
'pet.combo.why.banjjak.ten': "A 48% Skill gauge boost fires Tenten's skill sooner.",
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
'aria.adv': 'Open the adventure map',
'aria.mapback': 'Back to the menu',
'adv.title': 'Adventure',
'adv.stagen': 'Stage {n}',
'adv.stagebadge': 'S{n}',
'adv.bossn': 'Boss {n}',
'adv.chapn': 'Chapter {n}',
'adv.chap1': 'Green Grape Hills',
'adv.chap2': 'Soda Sea',
'adv.chap3': 'Strawberry Volcano',
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
'adv.hand.none': 'No handicap',
'adv.mission': 'Mission',
'adv.goal': 'Goal',
'adv.handicap': 'Handicap',
'adv.recommend': 'Recommended',
'adv.stars': 'Stars',
'adv.star1': '★ Clear the stage',
'adv.star2': '★★ Score {n}',
'adv.star3': '★★★ Score {n} + no shuffles + {t} sum-10 matches',
'node.bosshp': 'Boss HP',
'node.bossatk': 'Boss skill',
'node.foehp': 'Villain HP',
'node.foeatk': 'Villain skill',
'node.cond': 'Weak point',
'node.best': 'Your best',
'node.bestv': '{b} / ★★ line {g} = {p}%',
'node.bestnone': 'No record yet · ★★ line {g}',
'node.rec': 'Why this hero',
'node.recpet': 'Why this pet',
'node.pet': 'Pet pick',
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
'adv.close': 'Close',
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
'aria.attack': 'Attack gauge status',
'aria.special': 'Awaken. Every point you earn is ×{am} for {awk}s.',
'aria.pet': 'Use your pet skill',
'aria.awaken': 'Skill',
'duel.atkstat': 'Attack {n}%. It fills with every point you score, and fires on its own when full.',
'duel.spstat': 'Awakening {n}%. Alternate sum-10 and same-number matches to fill it.',
'duel.spgo': 'Awakened! Every point you earn is ×{am} for {awk}s',
'duel.awkon': 'Awakening is on. {n}s left.',
'duel.petnone': 'No pet yet. Pick one and you can use their skill a few times each round.',
'duel.petout': 'No pet skill left this round. Break a pet fruit on the board for one more.',
'duel.petempty': 'Nothing left to peck.',
'duel.petpeck': 'Peck! {n} tiles cleared',
'mk.pet': '+1 PET!',
'mk.star': 'SKILL MAX!',
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
'pet.lock.kkultteok': 'Collect 300 shards and Honeybee joins you.',
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
'adv.adsoon': 'Coming when the game goes live on the portal.',
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
'pick.change': 'Change',
'pick.go': 'Confirm',
'pick.locked': 'Locked',
'pick.passive': 'Passive',
'pick.ult': 'Skill',
'menu.sub': 'Jelly Pang World',
'pick.head': 'Heroes',
'adv.goal.k': 'Final goal',
'adv.goal.v': 'Jelly Castle',
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
'quest.got': 'Jelly Stars +{v}',
'quest.bonus': 'All daily missions cleared! Heart +{n}',
'quest.att.d': 'Day {n}',
'settings.quest': 'Missions',
'aria.quest': 'Open missions',
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
'skin.balance': 'Jelly Stars',
'skin.own': 'Owned',
'skin.equip': 'Equip',
'skin.equipped': 'Wearing',
'skin.buy': 'Buy',
'skin.soon': 'Coming soon',
'skin.soonhint': 'A hat for the bichon prince',
'skin.confirm': 'Spend {n} Jelly Stars on {name}?',
'skin.bought': '{name} unlocked!',
'skin.poor': 'Not enough Jelly Stars ({n} more)',
'aria.shop': 'Open shop',
'shop.btn': 'Shop',
'shop.title': 'Shop',
'shop.tab.jewel': 'Jewels',
'shop.tab.jstar': 'Stars',
'shop.tab.bundle': 'Bundles',
'shop.tab.skin': 'Skins',
'shop.krw': 'KRW {n}',
'shop.price.jewel': '\uD83D\uDC8E {n}',
'shop.soon': 'Coming soon',
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
'shop.start.d': '{n} jewels + {h} hearts + {s} shards',
'shop.trade': 'Jelly Stars {s}',
'shop.trade.d': 'Jewels to Jelly Stars. One way only.',
'shop.trade.ok': 'Jelly Stars +{s}',
'shop.heart5': 'Refill hearts',
'shop.heart5.d': 'Straight back to {n}',
'shop.heart1': 'One heart',
'shop.heart1.d': 'Skip the 30-minute wait',
'shop.heart.ok': 'Hearts restored!',
'shop.shard.power': 'Power shards',
'shop.shard.steady': 'Steady shards',
'shop.shard.agility': 'Agility shards',
'shop.shard.luck': 'Luck shards',
'shop.shard.d': 'Exactly {n} of the color you pick',
'shop.shard.ok': 'Shards +{n}',
'shop.bundle1': 'Adventure bundle',
'shop.bundle1.d': 'Hearts and items in one go',
'shop.bundle2': 'Heart bundle',
'shop.bundle2.d': 'A long evening of play',
'shop.skin': 'Skins',
'shop.skin.d': 'Buy any skin with {n} jewels',
'shop.skin.open': 'Open',
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
'intro.ppyak.l2': 'My skill is Free Link. For 8 seconds even far tiles connect.',
'intro.mungchi.l1': 'Mungchi. Nobody is sturdier than me.',
'intro.mungchi.l2': 'My skill is Squishy Shield. The clock and the villain gauge stop for 8 seconds.',
'intro.mongle.l1': 'Mongle here. Call me when time gets tight.',
'intro.mongle.l2': 'My skill is Time Puddle. The clock and the villain gauge stop for 4 seconds.',
'intro.tiktok.l1': 'Tick-tock! I am the one who counts the seconds.',
'intro.tiktok.l2': 'My skill is Time Stop. Time freezes for 6 seconds, and you can still match.',
'intro.churup.l1': 'Churup! One bite, one row. Leave it to me.',
'intro.churup.l2': 'My skill is Big Bite. A whole row gets reshuffled.',
'intro.kkultteok.l1': 'Honeybee here. Anything sweet belongs to me.',
'intro.kkultteok.l2': 'My skill is Golden Call. I summon 2 golden fruits.',
'intro.sseokssak.l1': 'Sweepy! A messy board is exactly my job.',
'intro.sseokssak.l2': 'My skill is Clean Sweep. 7 of the remaining tiles clear at once.',
'intro.mukmul.l1': 'Inky. Quietly, and for certain.',
'intro.mukmul.l2': 'My skill is Ink Splash. 5 tiles turn into the same number.',
'intro.banjjak.l1': 'Sparky! Leave anything that glitters to me.',
'intro.banjjak.l2': 'My skill is Spark Charge. Your Skill gauge fills by 48%.',
'intro.bangul.l1': 'Bubbly here. Stuck spots get loosened with bubbles.',
'intro.bangul.l2': 'My skill is Bubble Wave. 2 blocker tiles get washed away.',
'skin.gem': '+1 Jelly Star!',
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
'stat.ten.1': 'Arithmetic',
'stat.ten.2': 'Composure',
'stat.ten.3': 'Brotherhood',
'stat.ten.4': 'Love of 10',
'stat.twin.1': 'Reflexes',
'stat.twin.2': 'Mischief',
'stat.twin.3': 'Brotherhood',
'stat.twin.4': 'Twin bond',
'stat.jelly.1': 'Sweetness',
'stat.jelly.2': 'Luck',
'stat.jelly.3': 'Bounciness',
'stat.jelly.4': 'Courage',
'aria.charopen': 'Heroes: choose a character',
'aria.prevchar': 'Previous character',
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
'kd.playground': 'Playground',
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
'kd.pethouse.alljoined': 'Everyone has already joined!',
'soon.title': 'Coming Soon',
'soon.body': 'Under construction. Check back after the next update!',
'kd.visit': 'Yesterday-you saved up {n} Jelly Stars.',
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
'menu.continue': '클래식',
'menu.daily': '데일리',
'menu.howto': '게임 방법',
'menu.best': '최고 {score}점 · {stage}단계',
'menu.bestclassic': '클래식 {score}점',
'splash.tap': '화면을 터치하세요',
'load.tip1': '합이 10이거나 같은 숫자면 사라져요.',
'load.tip2': '하트는 30분에 하나씩 채워져요.',
'load.tip3': '파편 색이 곧 올라가는 스탯이에요.',
'load.tip4': '능력치 옆 ⓘ 를 누르면 설명이 나와요.',
'load.tip5': '스킬은 게이지가 가득 찼을 때 터져요.',
'load.tip6': '펫 스킬 한 방이 전투를 뒤집어요.',
'load.tip7': '데일리를 매일 풀면 연속 기록이 쌓여요.',
'load.tip8': '막히면 섞기로 새 짝을 만들어요.',
'aria.logo': 'Ten Twin 젤리 팡 월드',
'aria.splash': '화면을 터치하면 시작합니다',
'aria.play': '무한 모드 시작',
'aria.daily': '오늘의 데일리 퍼즐 풀기',
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
'pause.sound.on': '소리: 켜짐',
'pause.sound.off': '소리: 꺼짐',
'pause.vibe.on': '진동: 켜짐',
'pause.vibe.off': '진동: 꺼짐',
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
'rw.gem': '젤리별',
'rw.heart': '하트',
'rw.shard.power': '폭발력 파편',
'rw.shard.steady': '꾸준함 파편',
'rw.shard.agility': '순발력 파편',
'rw.shard.luck': '행운 파편',
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
'cp.sk.eff': '효과',
'cp.sk.skill': '스킬',
'cp.sk.use': '사용',
'cp.sk.usev': '한 판에 {n}회',
'cp.sk.perm': '영구',
'cp.sk.none': '혼자 가요. 이번 판에는 펫 스킬이 없어요.',
'cp.pet.empty': '펫을 고르면 여기에 스킬이 나와요. {free}는 처음부터 함께예요.',
'cp.pet.sep': '·',
'cp.sk.lock': '잠김',
'aria.loadout': '장비',
'pet.up.btn': '강화',
'pet.up.max': 'MAX',
'pet.up.cost': '파편 {n}개',
'pet.up.bal': '{s} {n}개',
'pet.up.poor': '{s}이 {n}개 부족해요',
'pet.up.done': '{s} 강화! Lv.{lv}',
'pet.up.maxmsg': '이 레버는 이미 만렙이에요',
'pet.up.aria': '{s}을 Lv.{lv}로 강화(파편 {n}개)',
'pet.axis.link': '연결',
'pet.axis.time': '시간',
'pet.axis.cleanse': '정화',
'pet.axis.layout': '재배치',
'pet.axis.value': '숫자',
'pet.axis.count': '수확',
'pet.axis.sweep': '청소',
'pet.axis.awaken': '스킬',
'cp.items.none': '아직 아이템이 없어요. 모험에서 선물 상자를 터뜨려 보세요.',
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
'item.puddingcharm.nm': '푸딩 방패',
'item.puddingcharm.fl': '푸딩 기사가 나눠준 조각. 본인은 필요 없다며 준다.',
'item.soon': '준비 중',
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
'char.ten.name': '텐텐 왕자',
'char.twin.name': '트윈 왕자',
'char.ppyak.name': '삐약',
'char.ppyak.pass': '8초 동안 멀리 떨어진 두 칸도 이어서 맞출 수 있어요. 그동안 얼음 칸은 한 번에 깨져요.',
'char.mungchi.name': '뭉치',
'char.mungchi.pass': '8초 동안 시계와 악당 게이지를 멈춰요. 멈춘 동안에도 매치는 계속할 수 있어요.',
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
'char.mongle.pass': '4초 동안 시계와 악당 게이지를 멈춰요. 멈춘 동안에도 매치는 계속할 수 있어요.',
'char.churup.name': '츄릅',
'char.churup.pass': '숫자가 두 칸 이상 남은 줄 하나를 골라 다시 섞어요. 다음 판 흔들기도 한 번 막아 줘요.',
'char.mukmul.name': '먹물이',
'char.mukmul.pass': '판에서 가장 많은 숫자로 5칸을 물들여요.',
'char.tiktok.name': '째깍이',
'char.tiktok.pass': '6초 동안 시간을 멈춰요. 시계와 악당 게이지가 멈춘 동안에도 매치할 수 있어요.',
'char.kkultteok.name': '꿀떡이',
'char.kkultteok.pass': '열매 2개를 황금 열매로 바꿔요. 황금 열매가 든 매치는 점수가 3배예요.',
'char.bangul.name': '방울이',
'char.bangul.pass': '방해 타일(블로커·얼음) 2개를 씻어 내요. 가려진 숫자도 한 번에 되돌려요.',
'char.ppyak.pass2': '8초 동안 멀리 떨어진 두 칸도 이어서 맞출 수 있어요. 그동안 얼음 칸은 한 번에 깨져요.',
'char.sseokssak.name': '썩싹이',
'char.sseokssak.pass': '남은 타일 중 7칸을 한 번에 지워요. 다음 판 흔들기도 한 번 막아 줘요.',
'char.banjjak.name': '반짝이',
'char.banjjak.pass': '스킬 게이지를 한 번에 48% 채워요.',
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
'menu.rush': '타임 러시',
'menu.rushdesc': '90초 승부. 짝을 지울수록 시간이 늘어요.',
'menu.bestrush': '러시 {score}점',
'aria.rush': '타임 러시 모드 시작',
'hud.rush': '남은 시간',
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
'clear.grade': '등급',
'grade.s': 'S',
'grade.a': 'A',
'grade.b': 'B',
'grade.c': 'C',
'grade.s.msg': '완벽했어요!',
'grade.a.msg': '아주 좋아요.',
'grade.b.msg': '무난하게 클리어!',
'grade.c.msg': '클리어! 다음엔 더 빠르게',
'milestone.title': '{n}번째 짝!',
'milestone.title.rw': '{n}번째 짝! 젤리별 +{v}',
'milestone.sub': '이 기세 그대로 가요.',
'over.share': '공유하기',
'aria.overShare': '결과 카드 이미지와 함께 점수 공유하기',
'tut.skip': '건너뛰기',
'aria.tutSkip': '튜토리얼 건너뛰기',
'aria.theme': '테마',
'aria.pzTheme': '테마 바꾸기',
'pause.theme.dark': '테마: 어둡게',
'pause.theme.light': '테마: 밝게',
'tut.replay': '직접 해보기',
'tut.s1': '<b>7</b>이 위아래로 둘. 곧게 이어지지? 눌러 봐.',
'tut.s2': '저기 <b>2</b>도 두 개네. 눌러 봐.',
'tut.s2fail': '봤지? 꺾이면 안 이어져. 곧은 길만 통해. 비스듬한 것도 곧은 길이야. <b>7</b>과 <b>3</b>, 합이 <b>10</b>.',
'tut.s3': '줄 끝이랑 다음 줄 첫 칸. 저 <b>6</b> 둘은 아직 닿아 있어.',
'tut.s3fail': '거기 말고. 줄 <b>끝</b>에서 다음 줄 <b>첫 칸</b>으로 이어 봐.',
'tut.done': '이게 기본이야. 이제 악당을 물리쳐 봐!',
'rules.title': '규칙은 셋뿐이야',
'rules.c1': '텐과 트윈',
'rules.c4': '폭주',
'rules.c5': '피니시',
'rules.r1': '같은 숫자, 또는 합이 <b>10</b>',
'rules.r2': '가로·세로·대각선 <b>곧은 길</b>로 이어질 것',
'rules.r3': '또는 줄 <b>끝</b>에서 다음 줄 <b>첫 칸</b>으로',
'rules.note': '어느 쪽이든 사이에 타일이 남아 있으면 안 돼.',
'skills.title': '전투의 네 버튼',
'skills.s1': '<b>공격</b> 게이지는 점수를 낼수록 차고, 가득 차면 저절로 공격해요.',
'skills.s2': '<b>각성</b> 게이지는 합이 10인 짝과 같은 숫자 짝을 <b>번갈아</b> 맞출 때만 차요. 누르면 {awk}초 동안 얻는 점수가 <b>{am}배</b>예요.',
'skills.s3': '<b>스킬</b> 게이지는 매치마다 차고, 콤보가 높을수록 빨리 차요. 누르면 캐릭터마다 다른 스킬이 발동해요.',
'skills.s4': '<b>펫소환</b>은 고른 펫의 스킬을 불러요. 한 판에 쓸 수 있는 횟수가 정해져 있어요.',
'skills.note': '<b>스킬 과일</b>은 스킬을 단번에 채우고, <b>펫 과일</b>은 펫 횟수를 하나 늘려 줘요.',
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
'menu.continueStage': '{stage}단계',
'hero.streak': '연속 출석',
'streak.reward': '연속 {d}일 보상!',
'hero.best': '최고 단계',
'menu.new': 'NEW',
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
'minimap.title': '챕터',
'minimap.locked': '{n}탄을 깨면 열려요',
'minimap.sum': '별 {s} · 열린 챕터 {c}/10',
'aria.minimap': '챕터 전체 보기',
'aria.mmcell': '챕터 {c}, 별 {s}개, {d}탄 클리어',
'aria.mmlock': '챕터 {c}, 잠김',
'theater.title': '스토리 극장',
'theater.locked': '{n}챕터에 도착하면 열려요',
'aria.thcell': '{c}장 이야기 다시 보기',
'mode.arcade': '무한 모드',
'mode.arcade.d': '끝없이. 최고 기록에 도전해요.',
'mode.daily.d': '하루 한 판, 모두가 같은 판이에요.',
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
'arc.menu': '메인메뉴',
'arc.share': '공유하기',
'aria.arcShare': '결과 카드 이미지와 함께 아케이드 기록 공유하기',
'rank.arc.title': '아케이드 대전',
'aria.cont': '클래식: 순수 실력 모드',
'aria.chprev': '이전 챕터',
'aria.chnext': '다음 챕터',
'aria.gallery': '스토리 갤러리',
'aria.credits': '제작진',
'aria.cutskip': '스토리 건너뛰기',
'aria.cutskipall': '이야기 전부 건너뛰기',
'settings.gallery': '스토리 갤러리',
'settings.credits': '제작진',
'credits.body': '텐트윈: 젤리팡 월드 · 그림·음악 제작자 제공, 게임 공장에서 만들었어요.',
'pick.rec': '추천',
'pet.combo.k': '추천 조합',
'pet.combo.why.ppyak.twin': '먼 칸도 이어져 트윈 왕자의 같은 숫자 +60%가 자주 터져요.',
'pet.combo.why.mungchi.pudding': '시계가 8초 멈춘 동안 푸딩 기사가 매치 점수를 더 쌓아요.',
'pet.combo.why.mongle.ten': '시계가 4초 멈춘 동안 텐텐 왕자가 합10 짝을 더 모아요.',
'pet.combo.why.churup.pudding': '막힌 줄을 다시 섞어 푸딩 기사의 사슬이 끊기지 않아요.',
'pet.combo.why.mukmul.ten': '같은 숫자 5칸이 생겨 텐텐 왕자의 스킬 동안 짝이 끊기지 않아요.',
'pet.combo.why.tiktok.twin': '시간이 6초 멈춘 동안 트윈 왕자가 같은 숫자 짝을 모아요.',
'pet.combo.why.kkultteok.jelly': '황금 열매의 점수 3배가 두 사람의 잭팟 배수와 함께 곱해져요.',
'pet.combo.why.bangul.jelly': '방해 타일이 씻겨 매치가 늘면 두 사람의 잭팟 기회도 늘어요.',
'pet.combo.why.sseokssak.twin': '7칸을 한 번에 치워 스피드러너 트윈 왕자의 판이 빨라져요.',
'pet.combo.why.banjjak.ten': '스킬 게이지가 48% 차서 텐텐 왕자의 스킬이 빨리 터져요.',
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
'aria.adv': '모험 지도 열기',
'aria.mapback': '메뉴로 돌아가기',
'adv.title': '모험',
'adv.stagen': '{n}탄',
'adv.stagebadge': '{n}탄',
'adv.bossn': '{n}탄 보스',
'adv.chapn': '{n}챕터',
'adv.chap1': '청포도 언덕',
'adv.chap2': '소다 바다',
'adv.chap3': '딸기 화산',
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
'adv.hand.none': '방해 없음',
'adv.mission': '미션',
'adv.goal': '목표',
'adv.handicap': '방해',
'adv.recommend': '추천',
'adv.stars': '별 조건',
'adv.star1': '★ 클리어',
'adv.star2': '★★ {n}점',
'adv.star3': '★★★ {n}점 + 셔플 0회 + 합10 {t}회',
'node.bosshp': '보스 체력',
'node.bossatk': '보스 기술',
'node.foehp': '악당 체력',
'node.foeatk': '악당 기술',
'node.cond': '약점',
'node.best': '내 최고',
'node.bestv': '{b}점 / ★★선 {g}점 = {p}%',
'node.bestnone': '아직 기록 없음 · ★★선 {g}점',
'node.rec': '이 캐릭인 이유',
'node.recpet': '이 펫인 이유',
'node.pet': '추천 펫',
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
'adv.close': '닫기',
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
'aria.attack': '공격 게이지 상태',
'aria.special': '각성. {awk}초 동안 얻는 점수가 {am}배가 돼요.',
'aria.pet': '펫 스킬 사용',
'aria.awaken': '스킬',
'duel.atkstat': '공격 {n}%. 점수를 낼수록 차고, 다 차면 저절로 나가요.',
'duel.spstat': '각성 게이지 {n}%예요. 합이 10인 짝과 같은 숫자 짝을 번갈아 맞추면 차요.',
'duel.spgo': '각성! {awk}초 동안 얻는 점수가 {am}배예요',
'duel.awkon': '각성 중이에요. {n}초 남았어요.',
'duel.petnone': '펫이 없어요. 펫을 고르면 그 스킬을 판마다 몇 번 쓸 수 있어요.',
'duel.petout': '이번 판 펫 스킬을 다 썼어요. 판 위의 펫 과일을 깨면 한 번 더 생겨요.',
'duel.petempty': '쪼아먹을 타일이 없어요.',
'duel.petpeck': '쪼아먹기! {n}칸 정리',
'mk.pet': '+1 펫!',
'mk.star': '스킬 MAX!',
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
'pet.lock.kkultteok': '파편을 300개 모으면 합류해요.',
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
'adv.adsoon': '포털 출시 후 제공돼요.',
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
'pick.change': '변경',
'pick.go': '선택 완료',
'pick.locked': '잠김',
'pick.passive': '패시브',
'pick.ult': '스킬',
'menu.sub': '젤리팡 월드',
'pick.head': '캐릭터 선택',
'adv.goal.k': '최종 목적지',
'adv.goal.v': '젤리 성',
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
'quest.got': '젤리별 +{v}',
'quest.bonus': '오늘 미션 전부 완료! 하트 +{n}',
'quest.att.d': '{n}일째',
'settings.quest': '미션',
'aria.quest': '미션 열기',
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
'skin.balance': '젤리별',
'skin.own': '보유',
'skin.equip': '장착',
'skin.equipped': '착용 중',
'skin.buy': '구매',
'skin.soon': '곧 만나요',
'skin.soonhint': '비숑 왕자의 모자',
'skin.confirm': '{name}을(를) 젤리별 {n}개로 살까요?',
'skin.bought': '{name} 해금!',
'skin.poor': '젤리별이 {n}개 부족해요',
'aria.shop': '상점 열기',
'shop.btn': '상점',
'shop.title': '상점',
'shop.tab.jewel': '보석',
'shop.tab.jstar': '젤리별',
'shop.tab.bundle': '번들',
'shop.tab.skin': '스킨',
'shop.krw': '{n}원',
'shop.price.jewel': '\uD83D\uDC8E {n}',
'shop.soon': '준비 중',
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
'shop.start.d': '보석 {n}개 + 하트 {h}개 + 파편 {s}알',
'shop.trade': '젤리별 {s}개',
'shop.trade.d': '보석을 젤리별로. 한 방향만 바꿀 수 있어요.',
'shop.trade.ok': '젤리별 +{s}개',
'shop.heart5': '하트 가득 채우기',
'shop.heart5.d': '기다림 없이 {n}개로',
'shop.heart1': '하트 1개',
'shop.heart1.d': '30분 기다림을 건너뛰어요',
'shop.heart.ok': '하트를 채웠어요!',
'shop.shard.power': '힘 파편',
'shop.shard.steady': '끈기 파편',
'shop.shard.agility': '민첩 파편',
'shop.shard.luck': '행운 파편',
'shop.shard.d': '고른 색으로 정확히 {n}알',
'shop.shard.ok': '파편 +{n}알',
'shop.bundle1': '모험 번들',
'shop.bundle1.d': '하트와 아이템을 한 번에',
'shop.bundle2': '하트 번들',
'shop.bundle2.d': '저녁 내내 놀 수 있는 만큼',
'shop.skin': '스킨',
'shop.skin.d': '보석 {n}개로 어떤 스킨이든',
'shop.skin.open': '열기',
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
'intro.ppyak.l2': '내 스킬은 「자유 연결」이야. 8초 동안 떨어진 두 칸도 이어져.',
'intro.mungchi.l1': '뭉치야. 든든한 건 내가 제일이지.',
'intro.mungchi.l2': '내 스킬은 「말랑 방패」야. 8초 동안 시계와 악당 게이지가 멈춰.',
'intro.mongle.l1': '몽글이에요. 시간이 급할 때 불러 주세요.',
'intro.mongle.l2': '내 스킬은 「시간 웅덩이」예요. 4초 동안 시계와 악당 게이지가 멈춰요.',
'intro.tiktok.l1': '째깍! 나는 시간을 세는 펫이야.',
'intro.tiktok.l2': '내 스킬은 「타임 스톱」이야. 6초 동안 멈춘 시간에도 매치할 수 있어.',
'intro.churup.l1': '츄릅! 한 입에 한 줄, 자신 있어요.',
'intro.churup.l2': '내 스킬은 「크게 한 입」이에요. 한 줄을 통째로 다시 섞어요.',
'intro.kkultteok.l1': '꿀떡이예요. 달콤한 건 다 제 몫이죠.',
'intro.kkultteok.l2': '내 스킬은 「황금 소환」이에요. 황금 열매를 2개 불러요.',
'intro.sseokssak.l1': '썩싹! 지저분한 판은 제가 싹 치워요.',
'intro.sseokssak.l2': '내 스킬은 「싹쓸이」예요. 남은 타일 7칸을 한 번에 없애요.',
'intro.mukmul.l1': '먹물이야. 조용히, 그리고 확실하게.',
'intro.mukmul.l2': '내 스킬은 「잉크 물들이기」야. 5칸을 같은 숫자로 바꿔.',
'intro.banjjak.l1': '반짝! 번쩍이는 건 다 나한테 맡겨.',
'intro.banjjak.l2': '내 스킬은 「번쩍 충전」이야. 스킬 게이지를 48% 채워 줘.',
'intro.bangul.l1': '방울이에요. 막힌 자리는 거품으로 풀어요.',
'intro.bangul.l2': '내 스킬은 「거품 파도」예요. 방해 타일 2개를 씻어 내요.',
'skin.gem': '젤리별 +1!',
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
'stat.ten.1': '계산력',
'stat.ten.2': '침착함',
'stat.ten.3': '우애',
'stat.ten.4': '합10 사랑',
'stat.twin.1': '순발력',
'stat.twin.2': '장난기',
'stat.twin.3': '우애',
'stat.twin.4': '트윈 사랑',
'stat.jelly.1': '달콤함',
'stat.jelly.2': '행운',
'stat.jelly.3': '탱글탱글',
'stat.jelly.4': '용기',
'aria.charopen': '캐릭터 선택 열기',
'aria.prevchar': '이전 캐릭터',
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
'kd.pethouse.alljoined': '모두 함께하고 있어요!',
'soon.title': '준비 중',
'soon.body': '공사 중이에요! 다음 업데이트를 기다려 주세요.',
'kd.visit': '어제의 내가 젤리별 {n}개를 모아 뒀어요.',
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
function applyI18n() {
if (typeof document === 'undefined') return;
try { document.documentElement.lang = currentLang(); } catch (e) { /* ignore */ }
var i, list;
list = document.querySelectorAll('[data-i18n]');
for (i = 0; i < list.length; i++) {
headText(list[i], t(list[i].getAttribute('data-i18n')));
}
list = document.querySelectorAll('[data-i18n-html]');
for (i = 0; i < list.length; i++) {
list[i].innerHTML = t(list[i].getAttribute('data-i18n-html'));
}
list = document.querySelectorAll('[data-i18n-aria]');
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
addSeq: 0,               // Add counter — seeds deterministic bomb rolls
stageStartedAt: 0,       // per-stage clock, feeds the clear grade
stageMaxCombo: 1,        // per-stage best combo, feeds the clear grade
mission: null,           // {id, goal, prog, done} — endless only
gainPet: 0, gainStar: 0,
gainShard: { power: 0, steady: 0, agility: 0, luck: 0 },
gainGift: [], gainPets: [], giftLeft: 0,
hitTaken: false,
gainGem: 0,
gainJstar: 0,
feverOn: false, feverUntil: 0, feverScore: 0, feverCdUntil: 0,
rushEndAt: 0, addCdUntil: 0, rushBeatAt: 0,
pausedAt: 0,             // wall clock at pause, used to shift deadlines
howtoFromPause: false,   // (a) fix: How-to opened from the pause modal
sprintTimes: [],         // match timestamps inside the `sprint` mission window
overInfo: null,          // frozen game-over figures; see paintOverModal()
rushStartedAt: 0,
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
var v = parseFloat(window.getComputedStyle(board).getPropertyValue('--board-max'));
if (isFinite(v) && v > 0) return v;
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
if (next < 12) next = 12;
ts = next;
board.style.setProperty('--ts', ts + 'px');
board.style.setProperty('--gap', GAP + 'px');
var bw = COLS * ts + (COLS - 1) * GAP;
var bh = rows * ts + Math.max(0, rows - 1) * GAP;
board.style.width = bw + 'px';
board.style.height = bh + 'px';
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
} else if (el.hasAttribute && el.hasAttribute('data-mk')) {
el.removeAttribute('data-mk');
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
if (id !== 'screen-kingdom') kdIdleStop();
}
function openModal(id) { var m = $(id); if (m) { m.hidden = false; healHeads(m); } }
function closeModal(id) { var m = $(id); if (m) m.hidden = true; }
function closeAllModals() {
tutFxRaise(false);
['modal-howto', 'modal-tutorial', 'modal-pause', 'modal-clear', 'modal-over', 'modal-daily',
'modal-rank',
'modal-quest',
'modal-soon',
'modal-playground',
'modal-theater',
'modal-node', 'modal-adv',
'modal-classic',
'modal-arc',
'modal-confirm']
.forEach(closeModal);
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
setText('stage-val', isDaily() ? ('#' + dailyNumber()) : S.stage);
var ss = $('stat-stage');
if (ss) {
if (ss.hidden !== isRush()) ss.hidden = isRush();
var sk = ss.querySelector ? ss.querySelector('.stat-k') : null;
var skv = isDaily() ? t('hud.daily') : t('hud.stage');
if (sk && sk.textContent !== skv) sk.textContent = skv;
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
var csh = $('modal-classic');
if (csh && !csh.hidden) syncClassicSheet();
var mb = $('menu-best');
if (mb) {
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
setHowto(howtoIdx);
var tm = $('modal-tutorial');
if (tm && !tm.hidden) {
tutSetText(tutDone ? 'tut.done' : tutTextKey);
tutSyncSkip();
}
syncTwChip();
var ct = $('clear-title');
if (ct) headText(ct, t('clear.title', { stage: S.stage }));
setText('clear-stage-hero', S.stage);
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
paintOverModal();
var mp = $('screen-map');
if (mp && mp.classList && mp.classList.contains('active')) buildMap();
var nd = $('modal-node');
if (nd && !nd.hidden && advCardN) openNodeCard(advCardN);
var pm2 = $('pz-menu');
if (pm2 && S.mode === 'adv') pm2.textContent = t('adv.leave');
syncCharSummary();
cpShow(cpIdx);
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
var TEN_SUM10_MULT = 1.6;
var TWIN_SAME_MULT = 1.6;
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
syncGems();
applyHeroStats();
syncPetInfo();            /* charsel v2 */
syncSidePanes();
fitAllDesc();             /* charsel v2 — 잘림 0 은 실측으로만 보장된다 */
}
function syncGems() {
setText('cp-gems', store.jstar | 0);
setText('sk-gems', store.jstar | 0);
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
var cpPos = 0;
var cpNormT = 0;
function cpBuild() {
if (typeof document === 'undefined') return;
var track = $('cp-track');
if (!track) return;
var n = HERO_IDS.length;
if (track.children && track.children.length === n * 3) return;
track.innerHTML = '';
for (var c = 0; c < 3; c++) {
for (var i = 0; i < n; i++) {
var id = HERO_IDS[i];
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
function cpApplyRing(pos) {
var track = $('cp-track');
if (!track || !track.children) return;
for (var k = 0; k < track.children.length; k++) {
var b = track.children[k];
if (!b.classList) continue;
if (k === pos) { b.classList.add('cp-center'); if (b.setAttribute) b.setAttribute('aria-current', 'true'); }
else { b.classList.remove('cp-center'); if (b.removeAttribute) b.removeAttribute('aria-current'); }
}
}
function cpTranslate(pos, animate) {
var track = $('cp-track'), win = $('cp-win');
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
function cpSelectPos(pos, animate) {
var n = HERO_IDS.length;
if (cpNormT) { clearTimeout(cpNormT); cpNormT = 0; }
if (animate && $('cp-win') && $('cp-win').clientWidth) {
var mid = (((cpPos % n) + n) % n) + n;
if (cpPos !== mid) {
var d0 = pos - cpPos;
cpPos = mid; pos = mid + d0;
cpApplyRing(cpPos);
cpTranslate(cpPos, false);
}
}
cpPos = pos;
cpIdx = ((pos % n) + n) % n;
cpApplyRing(pos);
cpTranslate(pos, animate);
cpTail();
if (animate) {
cpNormT = setTimeout(function () {
cpNormT = 0;
var mid2 = cpIdx + n;
if (cpPos !== mid2) { cpPos = mid2; cpApplyRing(mid2); cpTranslate(mid2, false); }
}, 200);
}
}
function cpShow(i) {
closeStatTip();          /* [SI-0909] 카드가 바뀌면 앞 카드의 설명은 끝난 말이다 */
var n = HERO_IDS.length;
var target = ((i % n) + n) % n;
var rack = $('cp-rack'), panel = $('charpanel'), track = $('cp-track');
var vis = panel && !panel.hidden && rack && rack.clientWidth > 0 &&
track && track.children && track.children.length;
if (!vis) { cpSeed(target); return; }
var d = target - cpIdx;
while (d > n / 2) d -= n;
while (d < -n / 2) d += n;
cpSelectPos(cpPos + d, true);
}
function cpSeed(i) {
closeStatTip();          /* [SI-0909] 위 cpShow 와 같은 이유 */
var n = HERO_IDS.length;
var target = ((i % n) + n) % n;
cpBuild();
if (cpNormT) { clearTimeout(cpNormT); cpNormT = 0; }
cpPos = target + n;
cpIdx = target;
cpApplyRing(cpPos);
cpTranslate(cpPos, false);
cpTail();
}
function openSettings() {
var el = $('modal-settings');
if (!el) return;
el.hidden = false;
syncToggleLabels();
TW_PORTAL.syncAccountUI(twApplyAccountUI);   /* Task 12 — 계정 줄 표시/숨김 */
try { questBadges(); } catch (eq) { /* 부팅 전 */ }
J.sfx.ui();
}
function closeSettings() {
var el = $('modal-settings');
if (el) el.hidden = true;
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
wrap.innerHTML = '';
for (var i = 0; i < list.length; i++) {
var sk = list[i];
var row = document.createElement('div');
row.className = 'sk-item' + (sk.soon ? ' soon' : '') +
(cur && cur.id === sk.id ? ' on' : '');
var th = document.createElement('span');
th.className = 'sk-th';
if (sk.img) th.style.setProperty('--sk-img', 'var(' + sk.img + ')');
if (sk.fit) th.setAttribute('data-fit', sk.fit);
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
act.textContent = t('skin.soon');
act.disabled = true;
} else if (!skinOwned(sk)) {
act.className += ' buy';
act.textContent = '★' + sk.cost;
act.setAttribute('data-buy', sk.id);
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
if (!sk.soon && !skinOwned(sk)) {
var jact = document.createElement('button');
jact.type = 'button';
jact.className = 'sk-act buy sk-act-jewel';
jact.setAttribute('data-app-only', '');
jact.setAttribute('data-buyjewel', sk.id);
jact.textContent = '\uD83D\uDC8E' + JEWEL_COST.skin;
row.appendChild(jact);
}
wrap.appendChild(row);
}
syncGems();
try { if (window.TW && window.TW.applyPlatformGates) window.TW.applyPlatformGates(wrap); } catch (e) {}
}
function openSkins() {
var el = $('modal-skin');
if (!el) return;
el.hidden = false;
buildSkinList();
J.sfx.ui();
}
function closeSkins() {
var el = $('modal-skin');
if (el) el.hidden = true;
J.sfx.ui();
}
function equipSkin(sid) {
var sk = skinById(sid);
if (!sk || !skinOwned(sk)) return;
store.equipped[skinTargetId()] = sk.id;
persist();
applySkins();
buildSkinList();
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
var p = PET_STATS[id];
if (p) {
return [Math.round(100 * p.pwr / 8), Math.round(100 * p.std / 8),
Math.round(100 * p.agi / 8), Math.round(100 * p.luk / 8)];
}
return [0, 0, 0, 0];
}
function paintStatBars(root, id) {
if (!root || !root.querySelectorAll) return;
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
var keys = PET_UP_KEYS;
var bars = box.querySelectorAll ? box.querySelectorAll('.cs-bar') : [];
for (i = 0; i < bars.length && i < 4; i++) {
var bk = keys[i];
var v = st ? clamp(Math.round(100 * petEff(id, bk) / PET_STAT_CAP), 0, 100) : 0;
var v0 = st ? clamp(Math.round(100 * st[bk] / PET_STAT_CAP), 0, 100) : 0;
if (!bars[i].style) continue;
bars[i].style.setProperty('--v', v + '%');
bars[i].style.setProperty('--v0', v0 + '%');
bars[i].style.setProperty('--f2-gv', String(v / 100));
if (bars[i].classList) bars[i].classList.toggle('is-b0same', v === v0);
}
syncPetUp(id, lock);        /* [PG-0910] 강화 버튼 넷 + 잔액 젬 */
var pk = $('cp-pet-passk');
cpTxt($('cp-pet-passname'), null, id ? (t('char.' + id + '.passname') || '') : '');
var emp = $('cp-pet-empty'), useln = $('cp-pet-useline');
if (useln) useln.hidden = true;
if (emp) {
if (id) emp.hidden = true;
else { emp.textContent = t('cp.pet.empty', { free: petFreeNames() }); emp.hidden = false; }
}
var comboRow = $('cp-pet-combo'), comboWho = $('cp-pet-combo-v'), comboWhy = $('cp-pet-combo-why');
var recIds = id ? petComboIds(id) : [];
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
var whyKey = recIds.length ? 'pet.combo.why.' + id + '.' + recIds[0] : '';
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
cpTxt($('cp-pet-use'), null,
lock ? petLockText(id)
: t('cp.sk.usev', { n: petUsesFrom(st ? petEff(id, 'agi') : PET_EFF_BASE) }));
}
var uk = $('cp-pet-use');
if (uk && uk.parentNode && uk.parentNode.firstChild) {
cpTxt(uk.parentNode.querySelector('.cc-k'), lock ? 'cp.sk.lock' : 'cp.sk.use');
}
fitDesc($('cp-pet-desc'));
fitDesc(comboRow);        /* 64-fix2 ⑥ — 추천 카드도 같은 「잘림 0」: 넘치면 글자를 줄인다(펫마다 다시 잰다) */
cpPetStage();             /* 구경 중인 펫이 무대에도 선다(없으면 히어로) */
cpCenterAll();
}
var cpPetLever = 'pwr', cpPetLeverFor = '';
function petLeadLever(id) {
var st = PET_STATS[id], best = 'pwr', i, k;
if (!st) return 'pwr';
for (i = 0; i < PET_UP_KEYS.length; i++) {
k = PET_UP_KEYS[i];
if (st[k] > st[best]) best = k;
}
return best;
}
function petComboIds(id) {
var lever = PET_UP_STAT[petLeadLever(id)] || 'power';
var pct = heroStatPct(), i, m, row, best, bestKeys, names = [];
for (i = 0; i < HERO_IDS.length; i++) {
row = pct[HERO_IDS[i]];
if (!row) continue;
best = -1; bestKeys = [];
for (m = 0; m < STAT_KEYS.length; m++) {
if (row[m].base > best) { best = row[m].base; bestKeys = [STAT_KEYS[m]]; }
else if (row[m].base === best) { bestKeys.push(STAT_KEYS[m]); }
}
if (bestKeys.indexOf(lever) >= 0) names.push(HERO_IDS[i]);
}
return names.slice(0, 2);
}
function syncPetUp(id, lock) {
var stats = $('cp-pet-stats');
if (!stats || !stats.querySelectorAll) return;
if (id && (cpPetLeverFor !== id || PET_UP_KEYS.indexOf(cpPetLever) < 0)) {
cpPetLever = petLeadLever(id);
cpPetLeverFor = id;
}
var btns = stats.querySelectorAll('.cs-up'), i;
for (i = 0; i < btns.length; i++) {
var b = btns[i], k = b.getAttribute('data-pet-up');
var sk = PET_UP_STAT[k] || 'power';
var lv = id ? petUpLv(id, k) : 0;
var maxed = !!id && lv >= PET_UP_LV_MAX;
var cost = maxed ? 0 : petUpCost(lv + 1);
var have = store.shards[sk] | 0;
var n = b.querySelector ? b.querySelector('.cs-up-n') : null;
if (n) n.textContent = !id ? '-' : (maxed ? t('pet.up.max') : String(cost));
b.setAttribute('data-stat', sk);
b.setAttribute('data-max', maxed ? '1' : '0');
b.disabled = !id || !!lock || maxed || have < cost;
b.setAttribute('aria-label', !id ? t('pet.up.btn')
: (maxed ? t('pet.up.max')
: t('pet.up.aria', { s: t('stat.k' + (i + 1)), lv: lv + 1, n: cost })));
}
var gem = $('cp-pet-shard');
if (gem) {
var gk = PET_UP_STAT[cpPetLever] || 'power';
var gn = gem.querySelector ? gem.querySelector('.cp-gem-n') : null;
gem.setAttribute('data-stat', gk);
if (gn) gn.textContent = String(store.shards[gk] | 0);
gem.setAttribute('aria-label',
t('pet.up.bal', { s: t('rw.shard.' + gk), n: store.shards[gk] | 0 }));
}
}
function petUpDo(k) {
var id = cpPetId();
if (!id) { toast(t('cp.pet.empty', { free: petFreeNames() })); J.sfx.fail(); return; }
if (!petOwned(id)) { toast(petLockText(id)); J.sfx.fail(); return; }
if (PET_UP_KEYS.indexOf(k) < 0) return;
var lv = petUpLv(id, k), sk = PET_UP_STAT[k];
if (lv >= PET_UP_LV_MAX) { toast(t('pet.up.maxmsg')); J.sfx.fail(); return; }
var cost = petUpCost(lv + 1), have = store.shards[sk] | 0;
if (have < cost) {
toast(t('pet.up.poor', { s: t('rw.shard.' + sk), n: cost - have }));
J.sfx.fail();
return;
}
var e = petEntry(id);
if (!e) { J.sfx.fail(); return; }
if (!shardSpend(sk, cost)) { J.sfx.fail(); return; }
if (!e.up || typeof e.up !== 'object') e.up = makePetUp(null);
e.up[k] = clamp(lv + 1, 0, PET_UP_LV_MAX);
persist();
syncPetInfo();
var bar = $('cp-pet-stats');
bar = bar && bar.querySelector ? bar.querySelector('.cs-bar[data-pet="' + k + '"]') : null;
if (bar && bar.classList) {
bar.classList.remove('is-up');
void bar.offsetWidth;
bar.classList.add('is-up');
}
toast(t('pet.up.done', { s: t('stat.k' + (PET_UP_KEYS.indexOf(k) + 1)), lv: lv + 1 }));
J.sfx.win();
J.vibrate(24);
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
function cpCenter(wrap, el) {
if (!wrap || !el || !wrap.clientWidth) return;
if (wrap.scrollWidth <= wrap.clientWidth) return;
var x = el.offsetLeft + el.offsetWidth / 2 - wrap.clientWidth / 2;
wrap.scrollLeft = Math.max(0, Math.min(x, wrap.scrollWidth - wrap.clientWidth));
}
function cpCenterAll() {
if (typeof document === 'undefined' || !document.querySelector) return;
var mrow = document.querySelector('#charpanel .pick-row.pick-mate');
if (mrow) {
var pid = cpPetId();
if (!pid) {
mrow.scrollLeft = 0;
} else {
cpCenter(mrow, document.querySelector('#mate-pick .char-card[data-char="' +
pid + '"]') || mrow.querySelector('[aria-checked="true"]'));
}
}
}
function syncSidePanes() {
var id = HERO_IDS[cpIdx] || charId();
cpTxt($('cp-side-rec'), 'char.' + id + '.tag');
syncItemList();
}
function openCharPanel() {
var el = $('charpanel');
if (!el) return;
el.hidden = false;
cpPetView = null;         /* 열 때마다 "구경"은 지금 고른 펫에서 시작한다 */
cpTab(cpTabCur);          /* W4 — 세션 안에서 마지막으로 보던 탭으로 연다 */
syncSidePanes();          /* 레일 — 배지 + 아이템 칸 그리드 */
syncCharPick();
var cur = HERO_IDS.indexOf(charId());
cpSeed(cur < 0 ? 0 : cur);   /* ⑰ 열 때는 애니 없이 정중앙 seed(가운데 벌) */
J.sfx.ui();
}
function closeCharPanel() {
closeStatTip();          /* [SI-0909] 닫힌 패널에 열린 말풍선을 남기지 않는다 */
var el = $('charpanel');
if (el) el.hidden = true;
syncCharSummary();
J.sfx.ui();
}
function cpConfirm() {
var id = HERO_IDS[cpIdx];
if (!heroUnlocked(id)) {
if (openInvite(id)) return;
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
if (openInvite(id)) return;
toast(t('char.locked.hint')); J.sfx.fail(); return;
}
store.charId = id;
persist();
syncCharPick();
applyCharSkin();
J.sfx.ui();
J.sfx.voice(id, 3);
introGate(id, null);
}
function setMate(id) {
var v = (id === '' || MATE_IDS.indexOf(id) >= 0) ? id : '';
if (v && !petOwned(v)) {
if (openInvite(v)) return;
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
var ids = ['duel-hud', 'classic-hud', 'topbar', 'tb-stats', 'hud-row', 'boss-bar'];
for (i = 0; i < ids.length; i++) {
el = $(ids[i]);
if (!el || el.hidden || !el.getBoundingClientRect) continue;
r = el.getBoundingClientRect();
if (r.width <= 0 || r.height <= 0) continue;
if (r.bottom > top) top = r.bottom;
}
var bot = 0;
el = $('board') || $('board-scroll');
if (el && el.getBoundingClientRect) {
r = el.getBoundingClientRect();
if (r.height > 0) bot = r.top;
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
var pool = ['sum10', 'same', 'rows', 'noadd', 'combo5', 'sprint'];
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
function achvCheck() {
if (!store.achv || typeof store.achv !== 'object') store.achv = {};
var got = 0, i, a;
for (i = 0; i < ACHV.length; i++) {
a = ACHV[i];
if (store.achv[a.id]) continue;
if (achvAxis(a.ax) < achvGoal(a)) continue;
store.achv[a.id] = { date: todayKey(), claimed: 0 };
if (!got) {
toast(t('quest.ready', { n: t('ach.' + a.id, { n: achvGoal(a) }) }));
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
S.gainGem = 0;
hvReset();
S.harvest = 0;
S.gainJstar = 0;
S.gainShard = { power: 0, steady: 0, agility: 0, luck: 0 };
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
capSpecialMission(S.mission);          /* W6.5b P0 — 있는 것보다 많이 요구 금지 */
if (S.mission && !advp) store.lastMissionId = S.mission.id;
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
TW_PORTAL.requestMidgameAd(function () { openModal('modal-arc'); });   /* Task 12 rev1(C-1) */
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
S.shuffles = typeof sv.shuffles === 'number' ? sv.shuffles : SHUFFLES_PER_STAGE;
S.shuffleCount = typeof sv.shuffleCount === 'number' ? sv.shuffleCount : 0;
S.stageStartedAt = Date.now();
S.stageMaxCombo = 1;
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
var cola = tileColor(a), colb = tileColor(b);
var mx = (ca.x + cb.x) / 2, my = (ca.y + cb.y) / 2;
var va = S.cells[a].v, vb = S.cells[b].v;
var spA = spOf(S.cells, a), spB = spOf(S.cells, b);
var gold = spA === 'gold' || spB === 'gold';
var specialsUsed = (spA ? 1 : 0) + (spB ? 1 : 0);
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
var iceOnly = dying.length === 0;
var rose = iceOnly ? false : bumpCombo();
for (var di = 0; di < dying.length; di++) S.cells[dying[di]].dead = true;
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
var mkPet = 0, mkStar = 0, mkGift = 0;
var mkShard = { power: 0, steady: 0, agility: 0, luck: 0 };
var mkShardAny = 0;
for (var mki = 0; mki < dying.length + blown.length; mki++) {
var mkIdx = mki < dying.length ? dying[mki] : blown[mki - dying.length];
var mkc = S.cells[mkIdx];
if (!mkc || !mkc.mk) continue;
if (mkc.mk === 'pet') mkPet++;
else if (mkc.mk === 'star') mkStar++;
else if (mkc.mk === 'gift') mkGift++;
else if (SHARD_STAT[mkc.mk]) { mkShard[SHARD_STAT[mkc.mk]]++; mkShardAny++; }
mkc.mk = '';
}
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
fx * tw.mult * mm * st.mult * aw;
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
if ((mkPet || mkStar || mkShardAny || mkGift) && battleOn()) {
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
if (mkShardAny) {
shardCredit(mkShard);
for (var shi = 0; shi < STAT_KEYS.length; shi++) {
var shk = STAT_KEYS[shi];
if (!mkShard[shk]) continue;
S.gainShard[shk] += mkShard[shk];
floatOnBoard(mkC.x, mkC.y - 44 - shi * 16,
SHARD_ICO + '+' + mkShard[shk], STAT_FX_COLOR[shk]);
}
petShardCheck();          // §14.2 ⓓ 꿀떡이 천장
persist();
J.sfx.mission();
J.vibrate(18);
}
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
function battleRows(n) {
var rows = 0;
try {
var area = boardArea();
var bmax = boardMaxPx();
var w = (bmax > 0 && area.w > bmax) ? bmax : area.w;
var tw = clamp(Math.floor((w - GAP * (BATTLE_COLS - 1)) / BATTLE_COLS),
TILE_MIN, TILE_MAX);
var hr = $('hud-row');
var hrH = hr ? hr.getBoundingClientRect().height : 0;
var reserve = hrH >= BATTLE_HUD_RESERVE ? 0 : (BATTLE_HUD_RESERVE - hrH);
var dh = $('duel-hud');
var dhH = (dh && dh.getBoundingClientRect) ? dh.getBoundingClientRect().height : 0;
if (dhH <= 1) reserve += Math.max(0, area.w / BATTLE_HUD_AR - BATTLE_HUD_WAS);
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
var MK_STAR_RATE = 0.015;    // ⭐ 각성 과일 — 스폰 칸당 1.5%
var MK_MAX_EACH  = 1;        // 판에 동시에 떠 있을 수 있는 수 (종류별)
var MK_PET_CAP   = DUEL_PET_MAX + 2;  // 펫 과일로 넘길 수 있는 잔여 상한 (기본 2 → 4)
var SHARD_RATE      = 0.10;
var MK_SHARD_MAX    = 2;
var GIFT_SPAWN_RATE = 0.02;
var MK_STAR_HI  = MK_PET_RATE + MK_STAR_RATE;
var MK_SHARD_HI = MK_STAR_HI + SHARD_RATE;
var MK_GIFT_HI  = MK_SHARD_HI + GIFT_SPAWN_RATE;
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
var mkHave = { pet: 0, star: 0 };
var mkShardHave = 0, mkGiftHave = 0;
for (var q = 0; q < out.length; q++) {
var oc = out[q];
if (!oc || oc.dead || !oc.mk) continue;
if (mkHave[oc.mk] !== undefined) mkHave[oc.mk]++;
else if (oc.mk === 'gift') mkGiftHave++;
else if (SHARD_STAT[oc.mk]) mkShardHave++;
}
for (var si = 0; si < spawns.length; si++) {
var r2 = rng();                                   // 상한과 무관하게 언제나 1회
var sc = out[spawns[si].to];
if (!sc || sc.sp) continue;
if (r2 < MK_PET_RATE) {
if (mkHave.pet < MK_MAX_EACH) { sc.mk = 'pet'; mkHave.pet++; }
} else if (r2 < MK_STAR_HI) {
if (mkHave.star < MK_MAX_EACH) { sc.mk = 'star'; mkHave.star++; }
} else if (r2 < MK_SHARD_HI) {
var sk = shardDropFor(S.stage, rng);
if (mkShardHave < MK_SHARD_MAX) { sc.mk = SHARD_MK[sk]; mkShardHave++; }
} else if (r2 < MK_GIFT_HI) {
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
var keep = [];
for (var i = 0; i < tileEls.length; i++) {
var el = tileEls[i], c = S.cells[i];
if (!el) continue;
if (!c || c.dead) { if (el.parentNode) el.parentNode.removeChild(el); }
else keep[i] = el;
}
var srcOf = [], stackOf = [], n;
for (n = 0; n < res.cells.length; n++) srcOf[n] = n;
for (n = 0; n < res.moves.length; n++) srcOf[res.moves[n].to] = res.moves[n].from;
for (n = 0; n < res.spawns.length; n++) {
srcOf[res.spawns[n].to] = -1;
stackOf[res.spawns[n].to] = res.spawns[n].stack;
}
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
for (n = 0; n < tileEls.length; n++) {
var s = srcOf[n];
if (s === n) continue;                              // 제자리 — 옮길 것이 없다
if (s >= 0) { positionTile(tileEls[n], s); continue; }
var rc = idxToRC(n);
tileEls[n].style.transform = 'translate3d(' + (rc.c * (ts + GAP)) + 'px,' +
(-(stackOf[n] | 0) * (ts + GAP) - ts) + 'px,0)';  // 컬럼 상단 바깥
}
if (board) void board.offsetWidth;                    // 리플로 강제 = 여기가 출발점
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
var FLASH_MS = 150;
for (var f = 0; f < rows.length; f++) {
for (var fc = 0; fc < COLS; fc++) {
var fe = tileEls[rows[f] * COLS + fc];
if (fe) fe.classList.add('rowflash');
}
}
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
S.addSeq = (S.addSeq | 0) + 1;
if (featuresOn()) {
applyBombs(S.cells, oldLen, S.mode,
mulberry32(((S.seed >>> 0) + S.addSeq * 0x9E3779B1) >>> 0));
}
if (addsCd()) S.addCdUntil = now() + RUSH_ADD_CD;
else if (!addsFree()) S.adds--;
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
var sc = $('board-scroll');
if (sc) later(function () { sc.scrollTop = sc.scrollHeight; }, 60);
}
function doHint() {
if (S.busy || S.paused || !S.running) return;
if (S.hints <= 0) {
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
for (var i = 0; i < tileEls.length; i++) {
if (tileEls[i] && tileEls[i].parentNode) tileEls[i].parentNode.removeChild(tileEls[i]);
}
tileEls.length = 0;
renderAll();
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
if ((o.gem | 0) > 0) {
out.push({ ico: '★', disc: 'gem', key: 'rw.gem', val: o.gem | 0, rar: 'normal' });
}
if ((o.heart | 0) > 0) {
out.push({ ico: '❤️', disc: 'heart', key: 'rw.heart', val: o.heart | 0, rar: 'normal' });
}
var i, k;
for (i = 0; i < STAT_KEYS.length; i++) {
k = STAT_KEYS[i];
if ((S.gainShard[k] | 0) > 0) {
out.push({ ico: SHARD_ICO, disc: 'shard-' + k, key: 'rw.shard.' + k,
val: S.gainShard[k] | 0, rar: 'common' });
}
}
for (i = 0; i < S.gainGift.length; i++) {
var g = S.gainGift[i];
if (!g) continue;
if (g.kind === 'shard') {
out.push({ ico: '🎁', disc: 'gift', key: 'rw.shard.' + g.stat,
val: g.n | 0, rar: 'common' });
} else if (g.kind === 'item') {
var gi = itemById(g.id);
out.push({ ico: (gi && gi.ico) || '🎁', disc: 'item', key: 'item.' + g.id + '.nm',
val: g.lv | 0,
rar: g.tier === 'epic' ? 'epic' : (g.tier === 'rare' ? 'rare' : 'normal') });
}
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
setText('clear-stage-hero', S.stage);
paintNextPreview();
var list = $('clear-rollup');
if (list) list.innerHTML = '';
var entries = [
rollupRow(list, 'clear.matches', S.matches),
rollupRow(list, 'clear.combo', S.maxCombo),
rollupRow(list, 'clear.adds', bonus)
];
var inter = document.querySelector('.ad-slot[data-ad-slot="interstitial"]');
if (inter) inter.hidden = !(S.stage % 3 === 0);
TW_PORTAL.requestMidgameAd(function () {
openModal('modal-clear');
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
celebrateRank(newRank);
rewardReveal('over-reward', rewardItems({ gem: S.gainJstar }), { sheetId: 'modal-over' });
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
cont.hidden = rush;
if (rush) return;
var used = !!S.continueUsed;
var gem  = used && appGemContinue();
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
var dsk = shardDropFor(0), dsg = {}, dsi;
for (dsi = 0; dsi < STAT_KEYS.length; dsi++) dsg[STAT_KEYS[dsi]] = 0;
dsg[dsk] = PET_DAILY_SHARD;
shardCredit(dsg);
S.gainShard[dsk] = (S.gainShard[dsk] | 0) + PET_DAILY_SHARD;   /* 결과 시트 보상 행 */
petShardCheck();
}
if (!classicRun) { dqBump('daily', 1); achvCheck(); }
var rec = {
date: todayKey(), seed: dailyKey(), n: dailyNumber(), timeSec: sec,
matches: S.matches, maxCombo: S.maxCombo, score: S.score,
grade: gradeFor(S.adds, S.maxCombo, sec, 3, extBoardSize(3)),
grid: buildEmojiGrid(S.gridSeed)
};
if (!replay) store[bestSlot] = rec;
dailyReward = rewardItems({
gem:   (S.gainJstar | 0) + (streakGot.jstar | 0),
heart: streakGot.heart | 0
});
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
if (img && res.url) { img.src = res.url; img.hidden = false; shareCardThumb = img; }
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
btn.className = 'rank-tab qs-get';
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
questAtt();
}
function questBadges() {
var n = questClaimable();
var b = $('kd-mission-badge');
if (b) {
b.textContent = n > 0 ? String(n) : '';
b.hidden = !(n > 0);
}
}
function openQuest(tab) {
questTab = (tab === 'weekly' || tab === 'epic') ? tab : 'daily';
questsEnsure();
achvCheck();
questPaint();
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
if (S.rushStartedAt > 0) S.rushStartedAt += held;
if (S.addCdUntil > 0) S.addCdUntil += held;
if (S.feverCdUntil > 0) S.feverCdUntil += held;
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
closeModal('modal-pause');
S.paused = false;
S.pausedAt = 0;
S.howtoFromPause = false;
hurryReset();          // 같은 이유 — 다시 시작하면 화면 상태도 처음으로
S.combo = 1;
S.comboUntil = 0;
var keepEnd = S.rushEndAt;
startStage(S.stage, isDaily() ? dailySeed() : S.seed);
if (isDaily()) { S.startedAt = Date.now(); startTimer(); }
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
if (b.classList) { b.classList.remove('btn-ghost'); b.classList.add('btn-primary'); }
} else {
b.textContent = t('tut.skip');
if (b.classList) { b.classList.remove('btn-primary'); b.classList.add('btn-ghost'); }
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
var cap = bossUltDmg(p.n) * BOSS_CHIP_CAP;
bossDamage(Math.min(gain * BOSS_CHIP, cap), false);
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
setText('duel-foe-name', d.def ? bossName(d.def) : '');
var lv = 'Lv.' + Math.max(1, S.stage | 0);
setText('duel-foe-lv', lv);
setText('duel-me-lv', lv);
var cid = charId();
setText('duel-me-name', t('char.' + cid + '.name'));
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
dhVar(c, 'ma', 'duel-me-atk', '--atk', m.atkMax > 0 ? Math.min(1, m.atk / m.atkMax) : 0);
dhHp(c, 'fn', 'duel-foe-n', Math.max(0, Math.ceil(f.hp)), f.hpMax);
dhHp(c, 'mn', 'duel-me-n', Math.max(0, Math.ceil(m.hp)), m.hpMax);
dhText(c, 'dm', 'duel-dmg', 'DMG ' + (d.dmg | 0) + bossCondSuffix());
}
function bossCondSuffix() {
var p = S.advPlan, d = p && p.bossDef;
if (!(S.mode === 'adv' && p && p.boss && d)) return '';
return '  \u25C6 ' + Math.min(S.bossProg | 0, d.need) + '/' + d.need;
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
function duelMeAttack() {
var d = S.duel;
if (!d || d.down) return;
var me = d.me;
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
var FOE_FULL = { grape: 'grape', soda: 'soda', berry: 'straw' };
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
function duelAtkInfo() {
if (!S.duel) return;
toast(t('duel.atkstat', { n: duelAtkPct() }));
J.sfx.ui();
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
var mms = petDurMs(DUEL_MONGLE_FREEZE_MS);   /* [PG-0910] 지속 레버 */
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
var tms = petDurMs(DUEL_TIKTOK_FREEZE_MS);   /* [PG-0910] 지속 레버 */
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
var PET2_SWEEP_POP = 6;      // 썩싹이 — 한 번에 지우는 산 칸 수 (DUEL_PET_POP 4 의 변주)
var PET2_BANJJAK_GAUGE = 40; // 반짝이 — 각성 게이지 가산 %p (CODEX P10)
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
function syncBattleActs(ba, bh, bu, bsh) {
var d = S.duel;
if (!d) return;
var spFull = d.me.sp >= d.me.spMax;
var gFull = gaugeFull() && !S.skillKind;
var petOk = (d.petLeft | 0) > 0 && !!mateId();
setText('add-badge', duelAtkPct() + '%');
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
setAppClass('skill-full', gFull);
setActLabel(ba, 'act.attack', 'aria.attack');
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
toast(t('skin.bought', { name: t(sk2.name) }));
J.sfx.win();
});
}
function jewelBuyShards(k) {
if (STAT_KEYS.indexOf(k) < 0) return false;
if (!jewelSpend(JEWEL_COST.shardPack, 'shard-pack')) return false;
store.shards[k] = clamp((store.shards[k] | 0) + SHARD_PACK_N, 0, SHARD_HOLD_MAX);
persist();
return true;
}
function jewelTradeStars(i) {
var d = JSTAR_TRADE[i | 0];
if (!d) return false;
if (!jewelSpend(d.jewel, 'jstar-trade')) return false;
store.jstar = (store.jstar | 0) + d.star;
persist();
syncGems();
paintShopBalance();
return true;
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
sub: t('shop.start.d', { n: START_PACK.n, h: START_PACK.hearts, s: START_PACK.shards }),
price: shopKrw(START_PACK.krw), dis: true
}));
wrap.appendChild(pay);
} else if (shopTabCur === 'jstar') {
for (i = 0; i < JSTAR_TRADE.length; i++) {
d = JSTAR_TRADE[i];
wrap.appendChild(shopCard({
ic: 'shop-ic-jstar-' + (i + 1),
title: t('shop.trade', { s: d.star }),
sub: t('shop.trade.d'),
price: t('shop.price.jewel', { n: d.jewel }),
act: 'star:' + i,
dis: jewelBalance() < d.jewel
}));
}
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
for (i = 0; i < STAT_KEYS.length; i++) {
wrap.appendChild(shopCard({
ic: 'shop-ic-bundle-2',
title: t('shop.shard.' + STAT_KEYS[i]),
sub: t('shop.shard.d', { n: SHARD_PACK_N }),
price: t('shop.price.jewel', { n: JEWEL_COST.shardPack }),
act: 'shard:' + STAT_KEYS[i],
dis: jewelBalance() < JEWEL_COST.shardPack
}));
}
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
} else {
wrap.appendChild(shopCard({
ic: 'shop-ic-jewel',
title: t('shop.skin'),
sub: t('shop.skin.d', { n: JEWEL_COST.skin }),
price: t('shop.skin.open'),
act: 'skin'
}));
}
shopSyncPay();
applyI18n();
}
function shopTab(k) {
var ok = ['jewel', 'jstar', 'bundle', 'skin'];
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
shopTab(shopTabCur);
el.hidden = false;
J.sfx.ui();
}
function closeShop() {
var el = $('modal-shop');
if (el) el.hidden = true;
J.sfx.ui();
}
function shopAct(a) {
if (a === 'daily') { claimDailyFree(); return; }
if (a === 'heart5') { if (jewelRefillHearts()) { toast(t('shop.heart.ok')); J.sfx.win(); } else J.sfx.fail(); buildShopBody(); return; }
if (a === 'heart1') { if (jewelBuyHeart()) { toast(t('shop.heart.ok')); J.sfx.win(); } else J.sfx.fail(); buildShopBody(); return; }
if (a.indexOf('star:') === 0) {
var si = parseInt(a.slice(5), 10);
if (jewelTradeStars(si)) { toast(t('shop.trade.ok', { s: JSTAR_TRADE[si].star })); J.sfx.win(); }
else J.sfx.fail();
buildShopBody();
return;
}
if (a.indexOf('shard:') === 0) {
var sk = a.slice(6);
if (jewelBuyShards(sk)) { toast(t('shop.shard.ok', { n: SHARD_PACK_N })); J.sfx.win(); }
else J.sfx.fail();
buildShopBody();
return;
}
if (a === 'skin') { openSkins(); return; }
}
function advStarK(arr, n, fb) {
var i = (n | 0) - 1;
var v = (i >= 0 && i < arr.length) ? arr[i] : fb;
return (v > 0) ? v : fb;
}
var ADV_STAR2_HP = 0.80;
var ADV_STAR3_HP = 1.10;
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
var live = S.mode === 'adv' && !!S.advPlan && !S.advPlan.boss && !battleOn();
if (el.hidden !== !live) el.hidden = !live;
if (!live) return;
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
}
if (p.boss && PET_BOSS[p.n]) grantPet(PET_BOSS[p.n]);
if (p.boss && !S.hitTaken) store.bossNoHit = (store.bossNoHit | 0) + 1;
persist();
achvCheck();                  /* 판정판 50 — 별·챕터·펫 축이 여기서 움직인다 */
J.sfx.win();
J.vibrate(40);
heroSay('clear', 6);
if (stars > 0) later(function () { heroSay('star'); }, 240);
if (gemGain > 0) later(function () { toast(t('skin.gem')); }, 700);
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
rewardReveal('adv-reward', rewardItems({ gem: (S.gainGem | 0) + (S.gainJstar | 0) }), {
starEl: 'adv-stars',
stars: full,
sheetId: 'modal-adv'
});
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
advAdBtn.hidden = !(!win && store.hearts <= 0 && TW_PORTAL.env === 'crazygames' && TW_PORTAL.canReward());
advAdBtn.disabled = false;
}
var again = $('adv-again');
if (again) {
again.textContent = win ? t('adv.next') : t('adv.retry');
if (again.classList) again.classList.toggle('cta-jelly', !win);
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
[ 7.62, 85.91, 5.20, 7.53, '--node-jelly-1'],   //  1 서쪽 숲가 초원(우체통 트레일헤드)
[12.50, 75.92, 4.10, 6.20, '--node-jelly-2'],   //  2 숲가 둔덕 (초원 위로)
[18.16, 86.31, 5.20, 7.53, '--node-jelly-3'],   //  3 초원, 아래로 굽이
[23.83, 74.33, 4.10, 6.20, '--node-jelly-4'],   //  4 숲 아래 오솔길
[29.30, 84.72, 4.60, 6.90, '--node-jelly-5'],   //  5 초원 바위 옆
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
[71.00, 25.50, 2.80, 4.30, '--node-jelly-4'],   // 49 정상 아래 초코 띠
[66.50, 24.50, 2.80, 4.30, '--node-jelly-5']    // 50 두 봉우리 사이 고개 = 보스
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
layer.style.setProperty('--map-n1-bottom', mapLowBottom(mapChap).toFixed(2) + '%');
layer.style.aspectRatio = ch.ar || '2600 / 1272';
if (ch.img) layer.style.backgroundImage = 'var(' + ch.img + ')';
else layer.style.backgroundImage = '';
}
var tint = $('map-tint');
if (tint && tint.style) {
tint.style.setProperty('--ch-tint', ch.tint || 'transparent');
tint.style.setProperty('--ch-tint-a', String(ch.alpha));
}
setText('map-ch-k', 'CHAPTER ' + mapChap);
setText('map-ch-n', t('map.plate' + mapChap));
var pv = $('map-ch-prev'), nx = $('map-ch-next');
var lastCh = Math.min(MAP_CHAPTERS.length, chapMax());
if (pv) pv.disabled = SIAN_MAP ? (mapChap <= 1 && mapPage <= 0) : mapChap <= 1;
if (nx) nx.disabled = SIAN_MAP ? (mapChap >= lastCh && mapPage >= sianPages() - 1) : mapChap >= lastCh;
setText('map-stars-v', advStarTotal());
setText('map-b1-v', advStarTotal());
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
var veil = document.createElement('span');
veil.className = 'mm-veil';
veil.setAttribute('aria-hidden', 'true');
b.appendChild(veil);
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
p.textContent = '\u2605 ' + st + '/' + (ADV_CHAPTER * 3)
+ ' \u00B7 \u2714 ' + dn + '/' + ADV_CHAPTER;
b.appendChild(p);
if (locked) {
var lk = document.createElement('span');
lk.className = 'mm-lock';
lk.setAttribute('aria-hidden', 'true');
b.appendChild(lk);
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
buildTheater();
openModal('modal-theater');
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
playCuts(theaterCutsFor(c), 'chap' + c, function () { syncMenu(); enterKingdom(); openTheater(); });
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
var mapX = 0, mapMin = 0, mapVel = 0, mapRaf = 0, mapPtr = -1, mapDragX = 0, mapBaseX = 0, mapLastX = 0, mapLastT = 0;
function mapApply() {
var l = $('map-layer');
if (l && l.style) l.style.setProperty('--mx', mapX.toFixed(2) + 'px');
}
function mapFit() {
var v = $('map-view'), l = $('map-layer');
if (!v || !l) return;
var vw = v.clientWidth || 0, lw = l.offsetWidth || 0;
mapMin = Math.min(0, vw - lw);
if (mapX < mapMin) mapX = mapMin;
if (mapX > 0) mapX = 0;
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
if (mapX > 0) mapX = 0;
mapVel = 0;
mapApply();
}
function mapGlide() {
mapRaf = 0;
if (Math.abs(mapVel) < 5) { mapVel = 0; return; }
mapX += mapVel / 60;
if (mapX < mapMin) { mapX = mapMin; mapVel = 0; }
if (mapX > 0) { mapX = 0; mapVel = 0; }
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
if (mapX > 0) mapX = 0;
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
heartsTick();
setText('map-hearts-v', store.hearts);
var w = $('map-heart-t');
if (!w) return;
var ms = heartNextMs();
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
buildMap();
closeAllModals();
showScreen('screen-map');
mapCenterCurrent(0);
startMapTicker();
}
function leaveMap() {
stopMapTicker();
closeModal('modal-node');
syncMenu();
enterKingdom();
}
function homeScreen() { return 'screen-kingdom'; }
var KD_TAP_CAP = 10;        // §26.6 — 거주자 탭으로 하루에 받을 수 있는 젤리별
var KD_TAP_JSTAR = 1;       // 한 번 탭의 보상. «캡 건 소액 반복»(패턴 ⑥)
var KD_VISIT_JSTAR = 3;     // §26.6 방문 보상 — 하루 1회 고정 소액
var KD_RES_MAX = 8;         // §26.3 동시 화면 거주자 상한
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
{ id: 'castle-top', l: 50, t: 16.5, w: 20, h: 9,  chap: 1, key: 'kd.castle', hit: true, notag: true,
go: function () { kdSoonModal(); } },
{ id: 'castle',     l: 50, t: 32, w: 22, h: 18, chap: 1, key: 'kd.castle', hit: true, tone: 'purple', ic: 'crown',
go: function () { kdSoonModal(); } },
{ id: 'circus',     l: 19, t: 41, w: 33, h: 15, chap: 1, key: 'kd.circus', tone: 'mint', ic: 'star-empty', roof: 4.5,
art: 'url("catalog/t3-bldg2-circus.webp")',
go: function () { openTheater(); } },
{ id: 'mission',    l: 85, t: 42, w: 26, h: 14.5, chap: 1, key: 'kd.mission', tone: 'mint', ic: 'target', roof: 18.1,
art: 'url("catalog/t3-bldg2-mission.webp")',
go: function () { openQuest('daily'); } },
{ id: 'shop',       l: 21, t: 58.4, w: 33, h: 14, chap: 1, key: 'kd.shop', tone: 'orange', ic: 'coin', roof: 8.8, /* [T8-0926·65] score(톱니 테두리 오자산) -> coin(상단 캡슐 파생 원반) */
art: 'url("catalog/t3-bldg2-shop.webp")',
go: function () {
var twa = false;
try { twa = !!(window.TW && window.TW.platform === 'twa'); } catch (e) { twa = false; }
if (twa) openShop(); else openSkins();
} },
{ id: 'post',       l: 81.7, t: 58.4, w: 33, h: 14.6, chap: 1, key: 'kd.post', tone: 'pink', ic: 'flag', roof: 5.8,
art: 'url("catalog/t3-bldg2-post.webp")',
go: function () { kdSoonModal(); } },
{ id: 'pethouse',   l: 17.4, t: 77.8, w: 29, h: 15, chap: 1, key: 'kd.pethouse', tone: 'orange', ic: 'heart', roof: 11.7,
art: 'url("catalog/t3-bldg2-pethouse.webp")',
go: function () {
var ids = INVITE_ORDER, i;
for (i = 0; i < ids.length; i++) { if (openInvite(ids[i])) return; }
kdAllJoined();
} },
{ id: 'playground', l: 82.7, t: 78.1, w: 33, h: 15, chap: 1, key: 'kd.playground', tone: 'violet', ic: 'inf', roof: 16.3,
art: 'url("catalog/t3-bldg2-playground.webp")',
go: function () { openPlayground(); } }
];
var KD_WALKS = [
{ l: 38, t: 50, w: 9,  h: 9,  x0: '-60%', x1: '160%', k: 1 },
{ l: 60, t: 50, w: 9,  h: 9,  x0: '120%', x1: '-80%', k: 1.18 },
{ l: 40, t: 67, w: 10, h: 10, x0: '-70%', x1: '110%', k: .88 },
{ l: 58, t: 67, w: 10, h: 10, x0: '90%',  x1: '-90%', k: 1.32 },
{ l: 50, t: 58, w: 9,  h: 9,  x0: '-80%', x1: '80%',  k: 1.05 },
{ l: 50, t: 77, w: 10, h: 10, x0: '110%', x1: '-110%', k: .78 }, /* [KD61-FIX] 84→77: t는 상자 상단이라 84+h10=94% 가 하단 바(약 88.2%) 아래로 내려가 하반신이 먹혔다. 77 로 올려 바 위(하단 87%)에 세운다. */
{ l: 44, t: 76, w: 9,  h: 9,  x0: '-30%', x1: '130%', k: 1.45 },
{ l: 56, t: 44, w: 8,  h: 8,  x0: '60%',  x1: '-70%', k: .95 }
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
function kdAllJoined() { toast(t('kd.pethouse.alljoined')); J.sfx.ui(); }
function kdSoonModal() { openModal('modal-soon'); J.sfx.ui(); }
function kdArtVar(id) {
var v = '';
try { v = getComputedStyle(document.documentElement).getPropertyValue('--ch-' + id + '-full'); } catch (e) { v = ''; }
return (v && v.replace(/\s/g, '')) ? 'var(--ch-' + id + '-full)' : '';
}
function kdResidents() {
var out = [], i;
for (i = 0; i < HERO_IDS.length; i++) {
if (!heroUnlocked(HERO_IDS[i])) continue;
var ha = kdArtVar(HERO_IDS[i]);
if (ha) out.push({ id: HERO_IDS[i], art: ha });
}
var pl = petIds();
for (i = 0; i < pl.length && out.length < KD_RES_MAX; i++) {
var pa = kdArtVar(pl[i]);
if (pa) out.push({ id: pl[i], art: pa });
}
return out.slice(0, KD_RES_MAX);
}
function buildKingdom() {
var wrap = $('kd-bldgs'), i, b, el;
if (wrap) {
wrap.innerHTML = '';
for (i = 0; i < KD_BUILDINGS.length; i++) {
b = KD_BUILDINGS[i];
el = document.createElement('button');
el.type = 'button';
el.className = 'kd-bldg';
el.id = 'kd-b-' + b.id;
el.setAttribute('data-kd', b.id);
el.style.setProperty('--l', b.l);
el.style.setProperty('--t', b.t);
el.style.setProperty('--w', b.w);
el.style.setProperty('--h', b.h);
if (b.art) { el.style.setProperty('--kd-art', b.art); el.classList.add('kd-has-art'); }
if (b.roof != null) el.style.setProperty('--kd-roof', b.roof);
if (b.app) el.setAttribute('data-app-only', '');
var open = kdUnlocked(b);
if (!open) el.classList.add('is-lock');
el.setAttribute('aria-disabled', open ? 'false' : 'true');
if (b.hit) el.classList.add('kd-hit');
el.setAttribute('aria-label', t(b.key));
el.setAttribute('data-i18n-aria', b.key);
if (!b.notag) {
var lab = document.createElement('span');
lab.className = 'kd-tag kit-pill-v2';
lab.setAttribute('data-tone', b.tone || 'purple');
var ic = document.createElement('i');
ic.className = 'kd-tag-ic';
ic.setAttribute('aria-hidden', 'true');
ic.style.setProperty('--kd-ic', 'var(--lib-glyph-' + (b.ic || 'crown') + ')');
var tx = document.createElement('b');
tx.setAttribute('data-i18n', b.key);
tx.textContent = t(b.key);
lab.appendChild(ic);
lab.appendChild(tx);
if (b.id === 'mission') {
var qb = document.createElement('b');
qb.id = 'kd-mission-badge';
qb.className = 'badge-new';
qb.hidden = true;
lab.appendChild(qb);
}
el.appendChild(lab);
}
wrap.appendChild(el);
}
try { if (window.TW && window.TW.applyPlatformGates) window.TW.applyPlatformGates(wrap); } catch (e) {}
}
var rw = $('kd-res');
if (rw) {
rw.innerHTML = '';
var list = kdResidents();
for (i = 0; i < list.length; i++) {
var w = KD_WALKS[i % KD_WALKS.length];
var res = document.createElement('button');
res.type = 'button';
res.className = 'kd-res';
res.setAttribute('data-kd-res', list[i].id);
res.setAttribute('aria-label', t('kd.res.aria'));
res.style.setProperty('--l', w.l);
res.style.setProperty('--t', w.t);
res.style.setProperty('--w', w.w);
res.style.setProperty('--h', w.h);
res.style.setProperty('--x0', w.x0);
res.style.setProperty('--x1', w.x1);
res.style.setProperty('--kd-k', w.k);
res.style.setProperty('--kd-delay', (-i * 700) + 'ms');
var walker = document.createElement('span');
walker.className = 'kd-walker';
var sp = document.createElement('span');
sp.className = 'kd-sprite';
sp.style.setProperty('--kd-art', list[i].art);
walker.appendChild(sp);
res.appendChild(walker);
rw.appendChild(res);
}
}
kdSync();
}
function kdSync() {
setText('kd-top-hearts-v', store.hearts | 0);
var ht = $('kd-top-heart-t');
if (ht) { var ms = heartNextMs(); ht.textContent = ms > 0 ? fmtHeartWait(ms) : t('adv.heartfull'); }
setText('kd-top-stars-v', advStarTotal());
setText('kd-bot-b1-v', store.jstar | 0);
setText('kd-bot-ch-n', t('map.plate' + chapMax()));
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
syncGems();
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
questBadges();   /* T14 I-3 — buildKingdom() 이 배지를 매번 새로(숨김) 지으므로 여기서 값을 채운다 */
showScreen(homeScreen());
kdPanClamp();
kdVisit();
kdIdleSchedule();
}
function kdBldgTap(id) {
var b = kdBuilding(id), el = $('kd-b-' + id);
if (!b) return;
if (el) { el.classList.remove('is-pop'); void el.offsetWidth; el.classList.add('is-pop'); }
if (!kdUnlocked(b)) {
toast(t('minimap.locked', { n: kdNeedStage(b) }));
J.sfx.fail();
return;
}
J.sfx.ui();
b.go();
}
var kdHeartPool = [];
function kdHeartMs() {
var v = 0;
try {
v = parseFloat(getComputedStyle(document.documentElement)
.getPropertyValue('--mo-kd-heart')) || 0;
} catch (e) { v = 0; }
return v > 0 ? v : 900;      /* 토큰을 못 읽는 환경의 안전값(multLifeMs 규약) */
}
function kdHeartAt(el) {
var fx = $('kd-fx');
if (!fx || !el) return;
var node = null, i;
for (i = 0; i < kdHeartPool.length; i++) {
if (!kdHeartPool[i].classList.contains('is-on')) { node = kdHeartPool[i]; break; }
}
if (!node) {
if (kdHeartPool.length >= 6) return;      /* 풀 상한 — 연타로 노드가 안 는다 */
node = document.createElement('span');
node.className = 'kd-heart';
fx.appendChild(node);
kdHeartPool.push(node);
}
var r = el.getBoundingClientRect(), p = fx.getBoundingClientRect();
node.style.left = (r.left - p.left + r.width / 2) + 'px';
node.style.top = (r.top - p.top - 8) + 'px';
node.classList.remove('is-on');
void node.offsetWidth;
node.classList.add('is-on');
var n = node;
setTimeout(function () { n.classList.remove('is-on'); }, kdHeartMs() + 60);
}
function kdResTap(el) {
if (!el) return;
var id = el.getAttribute('data-kd-res') || '';
var k = kdStore();
kdHeartAt(el);
var say = t('say.clear.' + id);
if (say && say !== 'say.clear.' + id) toast(say);
if ((k.tapToday | 0) >= KD_TAP_CAP) { J.sfx.ui(); return; }
k.tapToday = (k.tapToday | 0) + 1;
store.jstar = (store.jstar | 0) + KD_TAP_JSTAR;
persist();
syncGems();
kdSync();
J.sfx.petBell();
}
var kdIdleT = 0, kdIdleN = 0;
function kdIdleSchedule() {
if (kdIdleT) { clearTimeout(kdIdleT); kdIdleT = 0; }
var s = $('screen-kingdom');
if (!s || !s.classList.contains('active')) return;
kdIdleT = setTimeout(function () {
kdIdleT = 0;
var list = $('kd-res') ? $('kd-res').querySelectorAll('.kd-res') : null;
if (list && list.length) {
for (var i = 0; i < list.length; i++) list[i].classList.remove('is-idle');
list[kdIdleN % list.length].classList.add('is-idle');
kdIdleN++;
}
kdIdleSchedule();
}, 4200);
}
function kdIdleStop() { if (kdIdleT) { clearTimeout(kdIdleT); kdIdleT = 0; } }
var kdDrag = null, kdX = 0;
function kdPanMin() {
var v = $('kd-view'), l = $('kd-layer');
if (!v || !l) return 0;
var d = l.offsetWidth - v.offsetWidth;
return d > 0 ? -d : 0;
}
function kdPanSet(x) {
var l = $('kd-layer');
var lo = kdPanMin();
kdX = clamp(x, lo, 0);
if (l) l.style.setProperty('--kx', kdX + 'px');
}
function kdPanClamp() { kdPanSet(kdX || kdPanMin() / 2); }
function kdPanDown(e) {
var v = $('kd-view');
if (!v) return;
kdDrag = { x: e.clientX, x0: kdX, moved: 0 };
v.classList.add('dragging');
}
function kdPanMove(e) {
if (!kdDrag) return;
var dx = e.clientX - kdDrag.x;
if (Math.abs(dx) > kdDrag.moved) kdDrag.moved = Math.abs(dx);
kdPanSet(kdDrag.x0 + dx);
}
var kdWasDrag = false;
function kdPanUp() {
var v = $('kd-view');
if (v) v.classList.remove('dragging');
kdWasDrag = !!(kdDrag && kdDrag.moved > 12);
kdDrag = null;
}
function kdAteTap() { var w = kdWasDrag; kdWasDrag = false; return w; }
function paintNodeHearts() {
if (!advCardN) return;
heartsTick();
setText('node-hearts-v', store.hearts);
var empty = store.hearts <= 0;
var go = $('node-go'), wait = $('node-wait'), ad = $('node-ad');
if (go) go.hidden = empty;
if (wait) {
wait.hidden = !empty;
if (empty) wait.textContent = t('adv.heartwait', { t: fmtHeartWait(heartNextMs()) });
}
var nodeAdOk = TW_PORTAL.env === 'crazygames' && TW_PORTAL.canReward();
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
if (btn) btn.disabled = true;
TW_PORTAL.requestRewardedAd('heart', function (ok) {
if (btn) btn.disabled = false;
if (ok) {
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
paintNodeHearts();
openModal('modal-node');
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
var LUCK_MULT = 2;           // petRareP(상자 희귀 슬롯 .05 → .10)만 읽는다 — Task 7 이 지운다
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
var STAT_FX_COLOR = {
power:   '#FF7A59',
steady:  '#5FD08A',
agility: '#59B7FF',
luck:    '#FFD34D'
};
var SHARD_MK = {
power: 'shard-r', steady: 'shard-g', agility: 'shard-b', luck: 'shard-gold'
};
var SHARD_STAT = {
'shard-r': 'power', 'shard-g': 'steady', 'shard-b': 'agility', 'shard-gold': 'luck'
};
var SHARD_ICO = '💎';
var SHARD_PITY = 20;
var SHARD_DRY_W = 1;
var SHARD_W_LEAD = 4;      // §11.4 우세색
var SHARD_W_REST = 2;      // §11.4 나머지 (편중은 "유리"지 "강제" 아님)
var SHARD_HOLD_MAX = 999999;
var SHARD_LEAD_CYCLE = ['power', 'agility', 'steady'];
function shardLeadOf(ch) {
var i = ((ch | 0) - 1) % SHARD_LEAD_CYCLE.length;
if (i < 0) i += SHARD_LEAD_CYCLE.length;
return SHARD_LEAD_CYCLE[i];
}
function shardDryOf(k) {
var m = (store && store.shardDry && typeof store.shardDry === 'object')
? store.shardDry : null;
var v = m ? m[k] : 0;
return (typeof v === 'number' && isFinite(v)) ? clamp(v | 0, 0, SHARD_PITY) : 0;
}
function shardDropFor(stage, rnd) {
var r = (typeof rnd === 'function') ? rnd : Math.random;
var roll = r();
var n = stage | 0;
var lead = advIsBoss(n) ? '' : shardLeadOf(advChapter(n));
var w = [], tot = 0, i, k, dry, forced = '';
for (i = 0; i < STAT_KEYS.length; i++) {
k = STAT_KEYS[i];
dry = shardDryOf(k);
if (dry >= SHARD_PITY && !forced) forced = k;
var wv = (k === lead ? SHARD_W_LEAD : SHARD_W_REST) + dry * SHARD_DRY_W;
w.push(wv);
tot += wv;
}
if (forced) return forced;
var t2 = roll * tot;
for (i = 0; i < w.length; i++) {
t2 -= w[i];
if (t2 < 0) return STAT_KEYS[i];
}
return STAT_KEYS[STAT_KEYS.length - 1];     // 부동소수 꼬리 방어
}
function shardCredit(got) {
var any = 0, i, k, n;
for (i = 0; i < STAT_KEYS.length; i++) {
k = STAT_KEYS[i];
n = got[k] | 0;
if (n > 0) any = 1;
store.shards[k] = clamp((store.shards[k] | 0) + n, 0, SHARD_HOLD_MAX);
if (n > 0) {
store.shardEver[k] = clamp((store.shardEver[k] | 0) + n, 0, SHARD_HOLD_MAX);
}
}
if (!any) return;
for (i = 0; i < STAT_KEYS.length; i++) {
k = STAT_KEYS[i];
if ((got[k] | 0) > 0) store.shardDry[k] = 0;
else store.shardDry[k] = clamp(shardDryOf(k) + 1, 0, SHARD_PITY);
}
}
function shardTotal() {
var s = 0;
for (var i = 0; i < STAT_KEYS.length; i++) s += store.shards[STAT_KEYS[i]] | 0;
return s;
}
function shardEverTotal() {
var s = 0;
for (var i = 0; i < STAT_KEYS.length; i++) s += store.shardEver[STAT_KEYS[i]] | 0;
return s;
}
function shardSpend(k, n) {
n = n | 0;
if (n <= 0) return false;
if (STAT_KEYS.indexOf(k) < 0) return false;
if ((store.shards[k] | 0) < n) return false;
store.shards[k] = clamp((store.shards[k] | 0) - n, 0, SHARD_HOLD_MAX);
return true;
}
var ITEM_TENMATCH_MULT  = 1.15;   // I09 heatshard     — 텐(합10) 매치 점수
var ITEM_TWINMATCH_MULT = 1.15;   // I10 twinmirror    — 트윈(같은 수) 매치 점수
var ITEM_CHAIN_MULT     = 1.20;   // I12 chainbracelet — 콤보 문턱 위 점수
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
{ id: 'heatshard',     kind: 'act', stat: 'power',   tier: 'rare', slot: 'trinket', ico: '🔥', enabled: true,  codex: 'I09', eff: '텐 매치 점수 +15%' },
{ id: 'twinmirror',    kind: 'act', stat: 'power',   tier: 'rare', slot: 'trinket', ico: '🪞', enabled: true,  codex: 'I10', eff: '트윈 매치 점수 +15%' },
{ id: 'crossnecklace', kind: 'act', stat: 'agility', tier: 'epic', slot: 'trinket', ico: '📿', enabled: true,  codex: 'I11', eff: '텐↔트윈 교차 시 각성 게이지 +50%' },
{ id: 'chainbracelet', kind: 'act', stat: 'power',   tier: 'rare', slot: 'trinket', ico: '⛓',      enabled: true,  codex: 'I12', eff: '콤보 3+ 에서 점수 +20%' },
{ id: 'firstcharm',    kind: 'act', stat: 'luck',    tier: 'rare', slot: 'trinket', ico: '🎯', enabled: true,  codex: 'I13', eff: '첫 매치 점수 x3' },
{ id: 'lastcharm',     kind: 'act', stat: 'luck',    tier: 'epic', slot: 'trinket', ico: '⏳',      enabled: true,  codex: 'I14', eff: '남은 시간 10초 이하 점수 +40%' },
{ id: 'awakecatalyst', kind: 'act', stat: 'agility', tier: 'epic', slot: 'trinket', ico: '⭐',      enabled: false, codex: 'I15', eff: '각성 적립 +25%' },
{ id: 'puddingcharm',  kind: 'act', stat: 'steady',  tier: 'rare', slot: 'aux',     ico: '🍮', enabled: true,  codex: 'I16', eff: '적 첫 공격 1회 무효' }
];
function itemById(id) {
for (var i = 0; i < ITEM_POOL.length; i++) {
if (ITEM_POOL[i].id === id) return ITEM_POOL[i];
}
return null;
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
var m = 1, k = matchKind(va, vb);
if (k === 'sum10' && itemOn('heatshard')) m *= ITEM_TENMATCH_MULT;      // I09
if (k === 'same' && itemOn('twinmirror')) m *= ITEM_TWINMATCH_MULT;     // I10
if ((S.combo | 0) >= ITEM_CHAIN_COMBO && itemOn('chainbracelet')) m *= ITEM_CHAIN_MULT;  // I12
if ((S.matches | 0) === 0 && itemOn('firstcharm')) m *= ITEM_FIRST_MULT;  // I13
if (isRush() && rushLeftMs() > 0 && rushLeftMs() <= ITEM_LAST_SEC * 1000
&& itemOn('lastcharm')) m *= ITEM_LAST_MULT;                       // I14
return m;
}
function grantItem(id) {
var it = itemById(id);
if (!it) return null;
if (it.enabled === false) return null;
var own = store.items.own;
var had = own[id] | 0;
var lv = clamp(had + 1, 1, ITEM_LV_MAX);
own[id] = lv;
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
var GACHA_BOX_STAGES = [3, 6, 9];
var GACHA_STAGE_P = 0.60;
var GACHA_OPEN_WEIGHTS = { shard: 0.70, item: 0.25, rare: 0.05 };
var GACHA_PITY = 12;
var GACHA_SHARD_N = 3;
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
var w = GACHA_OPEN_WEIGHTS;
var forced = (store.giftNoItem | 0) >= GACHA_PITY;
var rareP = petRareP();
var kind;
if (forced) kind = 'item';
else if (roll < w.shard) kind = 'shard';
else if (roll < 1 - rareP) kind = 'item';
else kind = 'rare';
if (kind === 'shard') {
store.giftNoItem = (store.giftNoItem | 0) + 1;
var sk = shardDropFor(S.stage, r);
var got = {};
for (var i = 0; i < STAT_KEYS.length; i++) got[STAT_KEYS[i]] = 0;
got[sk] = GACHA_SHARD_N;
shardCredit(got);
return { kind: 'shard', stat: sk, n: GACHA_SHARD_N };
}
if (kind === 'item') {
store.giftNoItem = 0;
var tier = (r() < GACHA_ITEM_RARE_P) ? 'rare' : 'common';
var g = grantItem(gachaPickItem(tier, r));
if (g) return { kind: 'item', id: g.id, lv: g.lv, isNew: g.isNew, tier: tier };
return { kind: 'shard', stat: 'luck', n: GACHA_SHARD_N };   // 풀이 비면 폴백
}
var want = petGachaPool();
if (want.length) {
var pid = want[Math.min(want.length - 1, (r() * want.length) | 0)];
if (grantPet(pid)) return { kind: 'pet', id: pid };
}
store.giftNoItem = 0;
var eg = grantItem(gachaPickItem('epic', r));
if (eg) return { kind: 'item', id: eg.id, lv: eg.lv, isNew: eg.isNew, tier: 'epic' };
return { kind: 'shard', stat: 'luck', n: GACHA_SHARD_N };
}
var PET_FREE = ['ppyak', 'mungchi'];                    // §14.1 ⓐ
var PET_BOSS = { 20: 'mukmul', 30: 'banjjak', 40: 'bangul' };
var PET_AWK_NEED = 3;        // §14.2 ⓒ 째깍이 — 각성 연쇄 3회 (= EXPL_STREAK_CAP)
var PET_NODELAY_NEED = 10;   // §14.2 ⓒ 몽글 — 무딜레이 10연속 매칭
var PET_SHARD_NEED = 300;
var PET_TEN_NEED = 500;
var PET_GACHA = ['churup'];
var PET_LEGACY_ALL = ['ppyak', 'mungchi', 'mongle', 'churup',
'mukmul', 'tiktok', 'kkultteok', 'bangul'];
var PET_LV_MAX = 20, PET_EVO_MAX = 3;
var PET_UP_LV_MAX = 10;      // 레버 한 칸의 강화 상한 (§16.3-ⓑ)
var PET_UP_STEP   = 0.4;     // 레벨 1당 실효 스탯 가산(pt). 10레벨 = +4.0 -> 편중 8 이 상한 12 에 정확히 닿는다
var PET_STAT_CAP  = 12;      // 실효 상한. 상한이 **값 쪽**에 있다(statEff 와 같은 요점)
var PET_EFF_BASE  = 2;       // 비편중 기본값 — 네 수식이 여기서 항등이다
var PET_UP_C0     = 12;      // 첫 강화 비용 — «첫 강화 <= 3판» 최악 조건에서 나온 수(§16.3-ⓓ)
var PET_UP_CD     = 4;       // 단당 증분 — sum(12+4(n-1)) = 300 = PET_SHARD_NEED
var PET_UP_KEYS   = ['pwr', 'std', 'agi', 'luk'];
var PET_UP_STAT   = { pwr: 'power', std: 'steady', agi: 'agility', luk: 'luck' };
var PET_POW_K = 0.05;        // 위력 계수 (§16.3-ⓒ)
var PET_DUR_K = 0.05;        // 지속 계수
var PET_LUK_K = 0.10;        // 행운 계수 — lv5 에서 상한(§16.9 열린 항목 1)
var PET_DAILY_SHARD = 5;     // §16.3-ⓔ 데일리 1일 1회 완주 보상
function petUpCost(n) { return PET_UP_C0 + PET_UP_CD * ((n | 0) - 1); }
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
function petUpLv(id, k) {
var e = petEntry(id);
var m = (e && e.up && typeof e.up === 'object') ? e.up : null;
var v = m ? m[k] : 0;
return (typeof v === 'number' && isFinite(v)) ? clamp(v | 0, 0, PET_UP_LV_MAX) : 0;
}
function petEff(id, k) {
var st = PET_STATS[id];
if (!st) return PET_EFF_BASE;
return clamp(st[k] + petUpLv(id, k) * PET_UP_STEP, 0, PET_STAT_CAP);
}
function petGrowthOn() {
return TW_BATTLE && (S.mode === 'adv' || isArcadeDuel());
}
function petLeverEff(k) {
if (!petGrowthOn()) return PET_EFF_BASE;
var id = mateId();
return id ? petEff(id, k) : PET_EFF_BASE;
}
function petPowMult() { return 1 + PET_POW_K * (petLeverEff('pwr') - PET_EFF_BASE); }
function petPowN(n) { return Math.max(1, Math.round((n | 0) * petPowMult())); }
function petDurMs(ms) {
return Math.round((ms | 0) * (1 + PET_DUR_K * (petLeverEff('std') - PET_EFF_BASE)));
}
function petUsesFrom(eff) {
return clamp(DUEL_PET_MAX + Math.floor((eff - PET_EFF_BASE) / 5),
DUEL_PET_MAX, MK_PET_CAP);
}
function petUses() { return petUsesFrom(petLeverEff('agi')); }
function petRareP() {
var base = GACHA_OPEN_WEIGHTS.rare;
return clamp(base * (1 + PET_LUK_K * (petLeverEff('luk') - PET_EFF_BASE)),
base, base * LUCK_MULT);
}
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
if ((store.noDelayMax | 0) >= PET_NODELAY_NEED && !petOwned('mongle')) grantPet('mongle');
if (dirty) persist();
}
function petShardCheck() {
if (!petOwned('kkultteok') && shardEverTotal() >= PET_SHARD_NEED) grantPet('kkultteok');
}
function petTenBump() {
store.tenTotal = (store.tenTotal | 0) + 1;
if (!petOwned('sseokssak') && (store.tenTotal | 0) >= PET_TEN_NEED) {
grantPet('sseokssak');
}
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
var ITEM_CELL_MIN = 3;      /* «빈 레일» 방지 바닥 = ITEM_SLOTS 수 */
var CP_XTAL_SET =
'<span class="wxtal-set wxtal-set--ref" aria-hidden="true">' +
'<svg class="wxtal wxtal--tl" viewBox="0 0 100 100" preserveAspectRatio="none"><use href="#wxtalGem" xlink:href="#wxtalGem"/></svg>' +
'<svg class="wxtal wxtal--tr" viewBox="0 0 100 100" preserveAspectRatio="none"><use href="#wxtalGem" xlink:href="#wxtalGem"/></svg>' +
'<svg class="wxtal wxtal--bl" viewBox="0 0 100 100" preserveAspectRatio="none"><use href="#wxtalGem" xlink:href="#wxtalGem"/></svg>' +
'<svg class="wxtal wxtal--br" viewBox="0 0 100 100" preserveAspectRatio="none"><use href="#wxtalGem" xlink:href="#wxtalGem"/></svg>' +
'</span>';
function cpItemCell(state, slot, ico, val, id, tier, label) {
var b = document.createElement(state === 'empty' ? 'span' : 'button');
b.className = 'cp-crystal cp-gem cp-islot';
b.setAttribute('data-state', state);
b.setAttribute('data-slot', slot);
if (state === 'empty') {
b.setAttribute('aria-hidden', 'true');
} else {
b.type = 'button';
b.setAttribute('data-item', id);
if (tier) b.setAttribute('data-tier', tier);
b.setAttribute('aria-pressed', state === 'eq' ? 'true' : 'false');
b.setAttribute('aria-label', label);
}
var ic = document.createElement('span');
ic.className = 'cp-cr-ic';
ic.setAttribute('aria-hidden', 'true');
ic.textContent = ico;
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
function syncItemList() {
var wrap = $('cp-item-list');
if (!wrap) return;
var cid = cpItemCharId(), eq = itemsEq(cid), own = (store.items && store.items.own) || {};
wrap.innerHTML = '';
var n = 0, i, it, lv, val;
for (i = 0; i < ITEM_POOL.length; i++) {
it = ITEM_POOL[i];
if (it.enabled === false) continue;   /* 2c — 데이터만 있는 것은 안 그린다 */
lv = own[it.id] | 0;
if (lv <= 0) continue;
val = (it.kind === 'stat') ? ('+' + itemEffOf(it.id, lv) + '%') : '';
wrap.appendChild(cpItemCell(eq.indexOf(it.id) >= 0 ? 'eq' : 'own',
it.slot, it.ico, val, it.id, it.tier,
t('item.' + it.id + '.nm')));
n++;
}
for (i = n; i < ITEM_CELL_MIN; i++) {
wrap.appendChild(cpItemCell('empty', ITEM_SLOTS[i % ITEM_SLOTS.length],
'', '', '', '', ''));
}
var em = $('cp-item-none');
if (em) em.hidden = !!n;
}
function toggleItem(id) {
var it = itemById(id);
if (!it) return;
var own = (store.items && store.items.own) || {};
if (!(own[id] | 0)) return;
var cid = cpItemCharId(), eq = itemsEq(cid).slice(), at = eq.indexOf(id), j;
if (at >= 0) {
eq.splice(at, 1);
} else {
for (j = eq.length - 1; j >= 0; j--) {
var e = itemById(eq[j]);
if (e && e.slot === it.slot) eq.splice(j, 1);
}
eq.push(id);
if (eq.length > ITEM_SLOTS.length) eq.shift();
dqBump('item', 1);            /* 판정판 50 — 「아이템 장착」 축(끼울 때만) */
}
store.items.eq[cid] = eq;
persist();
syncItemList();
applyHeroStats();          /* 막대가 곧바로 새 실효값을 그린다 */
J.sfx.ui();
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
function statPctText(k, v) {
var h = (v | 0) * (STAT_UNIT_H[k] | 0);
var p = Math.pow(10, STAT_TIP_DEC[k] || 0);
return String(Math.round(h * p / 100) / p);
}
function statTipText(id, i) {
var k = STAT_KEYS[i];
if (!k) return '';
var v = (statEff(id) || {})[k] | 0;
return t('stat.tip.t', { k: t('stat.k' + (i + 1)), v: v }) + '\n' + t(STAT_DESC_KEY[i], { n: statPctText(k, v) });
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
on($('kd-bldgs'), 'click', function (e) {
var b = e.target && e.target.closest ? e.target.closest('.kd-bldg') : null;
if (!b || kdAteTap()) return;
kdBldgTap(b.getAttribute('data-kd') || '');
});
on($('kd-res'), 'click', function (e) {
var r = e.target && e.target.closest ? e.target.closest('.kd-res') : null;
if (!r || kdAteTap()) return;
kdResTap(r);
});
on($('pg-close'), 'click', function () { closePlayground(); J.sfx.ui(); });
on($('pg-classic'), 'click', function () { closePlayground(); openClassicHub(); });
on($('pg-arcade'), 'click', function () { closePlayground(); openModeSheet({ arcadeOnly: true }); });
on($('kd-bot-plate'), 'click', function () { J.sfx.ui(); openMap(); });
on($('kd-bot-char'), 'click', openCharPanel);
on($('kd-bot-rec'), 'click', function () { J.sfx.ui(); openRank('endless'); });
on($('kd-top-gear'), 'click', openSettings);
var kdv = $('kd-view');
on(kdv, 'pointerdown', kdPanDown);
on(kdv, 'pointermove', kdPanMove);
on(window, 'pointerup', kdPanUp);
on(window, 'pointercancel', kdPanUp);
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
on(document, 'click', function (e) {
var n = e && e.target, x = null;
while (n && n !== document) {
if (n.classList && n.classList.contains('r10-x') && n.getAttribute('data-w6x')) { x = n; break; }
n = n.parentNode;
}
if (!x) return;
var tgt = $(x.getAttribute('data-w6x'));
if (tgt) tgt.click();
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
var el = pickTarget(ev, this);
if (!el) return;
cpPetView = el.getAttribute('data-char') || '';
syncPetInfo();
setMate(cpPetView);
});
on($('cp-item-list'), 'click', function (ev) {
var el = ev.target;
while (el && el !== this && !(el.getAttribute && el.getAttribute('data-item'))) {
el = el.parentNode;
}
if (!el || el === this) return;
toggleItem(el.getAttribute('data-item'));
});
on($('char-open'), 'click', openCharPanel);
on($('cp-close'), 'click', closeCharPanel);
on($('cp-go'), 'click', cpConfirm);
on($('cp-pet-stats'), 'click', function (ev) {
var el = ev.target;
while (el && el !== this && !(el.classList && el.classList.contains('cs-up'))) {
el = el.parentNode;
}
if (!el || el === this) return;
ev.stopPropagation();          /* 패널 바깥 탭(닫기)까지 안 굴러간다 */
var k = el.getAttribute('data-pet-up');
cpPetLever = k;
cpPetLeverFor = cpPetId();     /* 누른 줄이 곧 지갑의 색이다 */
petUpDo(k);
syncPetUp(cpPetId(), !!cpPetId() && !petOwned(cpPetId()));
});
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
if (!panel || panel.hidden) return;
var tag = ev.target && ev.target.tagName;
if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
ev.preventDefault();
cpShow(cpIdx + (ev.key === 'ArrowRight' ? 1 : -1));
J.sfx.ui();
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
cpShow(cpIdx + (dx < 0 ? 1 : -1));
J.sfx.ui();
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
on($('sk-list'), 'click', function (ev) {
var el = ev && ev.target;
while (el && el !== this && !(el.getAttribute &&
(el.getAttribute('data-buy') || el.getAttribute('data-buyjewel') ||
el.getAttribute('data-equip')))) el = el.parentNode;
if (!el || el === this || !el.getAttribute) return;
var b = el.getAttribute('data-buy');
if (b) { buySkin(b); return; }
var bj = el.getAttribute('data-buyjewel');
if (bj) { buySkinJewel(bj); return; }
var e = el.getAttribute('data-equip');
if (e) equipSkin(e);
});
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
on($('howto-prev'), 'click', function () { setHowto(howtoIdx - 1); J.sfx.ui(); });
on($('howto-next'), 'click', function () {
if (howtoIdx >= 11) { openTutorial(true); return; }  // #34: 5→6→7장 · ⑥-c: →12장
setHowto(howtoIdx + 1);
J.sfx.ui();
});
on($('howto-close'), 'click', closeHowto);
on($('tut-skip'), 'click', function () { finishTutorial(tutDone); });
on($('tut-stage'), 'pointerdown', onTutPointerDown);
var ts0 = $('tut-stage');
if (ts0 && ts0.style) ts0.style.touchAction = 'manipulation';
var board = $('board');
if (board) {
board.style.touchAction = 'manipulation';
on(board, 'pointerdown', onBoardPointerDown);
on(board, 'dblclick', function (e) { if (e && e.preventDefault) e.preventDefault(); });
on(board, 'contextmenu', function (e) { if (e && e.preventDefault) e.preventDefault(); });
}
on($('btn-add'), 'click', function () { if (battleBoard()) duelAtkInfo(); else doAdd(); });
on($('btn-hint'), 'click', function () { if (battleOn()) doSpecial(); else doHint(); });
on($('btn-undo'), 'click', function () { if (battleOn()) doPetSkill(); else doUndo(); });
on($('btn-shuffle'), 'click', function () { if (battleOn()) doAwaken(); else doShuffle(false); });
on($('btn-pause'), 'click', pause);
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
on($('btn-next'), 'click', nextStage);
on($('btn-continue'), 'click', doContinue);
on($('btn-shop'), 'click', openShop);
on($('shop-close'), 'click', closeShop);
on($('modal-shop'), 'click', function (ev) { if (ev && ev.target === this) closeShop(); });
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
clearRankFresh();
openRank('endless');
});
on($('btn-over-rank'), 'click', function () { openRank(S.mode); });
on($('btn-clear-rank'), 'click', function () { openRank(S.mode); });
for (var rti = 0; rti < RANK_MODES.length; rti++) {
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
if ($('modal-mode') && !$('modal-mode').hidden) { closeModeSheet(); return; }
if ($('modal-playground') && !$('modal-playground').hidden) { closePlayground(); J.sfx.ui(); return; }
if ($('modal-shop') && !$('modal-shop').hidden &&
!($('modal-skin') && !$('modal-skin').hidden)) { closeShop(); return; }
if ($('modal-classic') && !$('modal-classic').hidden) { closeClassicHub(); return; }
if ($('modal-minimap') && !$('modal-minimap').hidden) { closeMinimap(); return; }
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
var UNLOCK_EVENTS = ['pointerdown', 'touchstart', 'keydown'];
var unlock = function () {
if (audioUnlocked) return;
audioUnlocked = true;
J.unlockAudio();      // 무음 1샘플 start() = 그 자리에서 컨텍스트를 연다
J.resumeAudio();      // 구버전 juice.js 폴백(unlockAudio 가 no-op 인 경우)
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
if (!el) { splashAudioHook(); return; }
el.classList.add('is-out');
setTimeout(function () { el.hidden = true; }, 320);
splashAudioHook();
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
},
function () {
applyHeroStats();
syncMenu();
syncHud();
},
function () { enterKingdom(); },
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
idxToRC: idxToRC, canMatch: canMatch,
isReadingConnected: isReadingConnected, isLineConnected: isLineConnected,
isConnected: isConnected, isValidPair: isValidPair,
findAnyPair: findAnyPair, countPairs: countPairs,
findFullDeadRows: findFullDeadRows, collapseRows: collapseRows,
buildAddCells: buildAddCells, mulberry32: mulberry32, genBoard: genBoard,
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
duelAtkInfo: duelAtkInfo, doSpecial: doSpecial, doPetSkill: doPetSkill,
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
shuffleSeedFor: shuffleSeedFor, shuffleCellsEx: shuffleCellsEx,
shuffleBoardEx: shuffleBoardEx, blockersBetween: blockersBetween,
rejectReason: rejectReason,
applyStage1Gold: applyStage1Gold,
pickMission: pickMission, missionPool: missionPool,
missionGoals: MISSION_GOALS, gradeFor: gradeFor,
addsForStage: addsForStage,
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
jewelBuyShards: jewelBuyShards, jewelTradeStars: jewelTradeStars,
appGemContinue: appGemContinue, jewelPayContinue: jewelPayContinue,
claimDailyFree: claimDailyFree, dailyFreeLeft: dailyFreeLeft,
openShop: openShop, closeShop: closeShop, shopTab: shopTab,
paintShopBalance: paintShopBalance,
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
SHARD_RATE: SHARD_RATE, SHARD_PITY: SHARD_PITY, SHARD_MK: SHARD_MK,
MK_SHARD_MAX: MK_SHARD_MAX, GIFT_SPAWN_RATE: GIFT_SPAWN_RATE,
shardDropFor: shardDropFor, shardCredit: shardCredit, shardTotal: shardTotal,
shardSpend: shardSpend, shardEverTotal: shardEverTotal, persist: persist,
petEff: petEff, petUpLv: petUpLv, petUpCost: petUpCost, petUpDo: petUpDo,
petPowMult: petPowMult, petPowN: petPowN, petDurMs: petDurMs,
petUses: petUses, petUsesFrom: petUsesFrom, petRareP: petRareP,
petGrowthOn: petGrowthOn, syncPetUp: syncPetUp,
PET_UP_LV_MAX: PET_UP_LV_MAX, PET_UP_STEP: PET_UP_STEP,
PET_STAT_CAP: PET_STAT_CAP, PET_UP_STAT: PET_UP_STAT,
PET_DAILY_SHARD: PET_DAILY_SHARD, PET_SHARD_NEED: PET_SHARD_NEED,
openGachaRoll: openGachaRoll, isGachaStage: isGachaStage,
itemById: itemById, itemEffOf: itemEffOf, itemStatBonus: itemStatBonus,
itemScoreMult: itemScoreMult, itemOn: itemOn, ITEM_POOL: ITEM_POOL,
grantItem: grantItem, toggleItem: toggleItem, syncItemList: syncItemList,
petOwned: petOwned, grantPet: grantPet, petCondBump: petCondBump,
INVITE_ORDER: INVITE_ORDER, INVITE_COST: INVITE_COST,
inviteCost: inviteCost, invitable: invitable, charOwned: charOwned,
openInvite: openInvite, closeInvite: closeInvite, inviteBuy: inviteBuy,
syncInvite: syncInvite, charStatPct: charStatPct,
charGetFx: charGetFx, charGetEnd: charGetEnd, getLifeMs: getLifeMs,
introDue: introDue, introPlay: introPlay, introLines: introLines,
cinNext: cinNext, introSeenChar: introSeenChar,
petShardCheck: petShardCheck, petGachaPool: petGachaPool,
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
kdResTap: kdResTap, kdUnlocked: kdUnlocked, kdBuilding: kdBuilding,
kdResidents: kdResidents, kdStore: kdStore, homeScreen: homeScreen,
KD_BUILDINGS: KD_BUILDINGS, KD_ZONES: KD_ZONES, KD_DECO: KD_DECO,
KD_TAP_CAP: KD_TAP_CAP,
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
setLang: setLang, t: t, lang: currentLang, dict: I18N
};
})();
