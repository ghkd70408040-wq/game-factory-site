
(function (global) {
'use strict';
var POOL_SIZE      = 600;      // 사전 할당 파티클 수 (계약: 최대 600)
var SFX_DEBOUNCE   = 12;       // ms — 동일 sfx 12ms 내 재호출 무시 (기본값)
var SFX_DEBOUNCE_MAP = { match: 70, combo: 70, cheer: 340, voice: 300, tierUp: 300, jackpot: 240,
spBlast: 300, petBell: 300, foeStab: 300, awakenMax: 900 };
var MATCH_PEAK = 0.20;
var VOICE_GAIN = 1.26;
var JELLY_ROOT  = 620;
var JELLY_STACK = [0, -5, -12, -17, -24, -29];
var MASTER_BASE    = 0.55;     // 마스터 게인 기준값 (덕킹/음소거 복귀는 항상 이 값으로)
var RESIZE_DEBOUNCE = 120;     // ms
var MAX_DT         = 0.05;     // s — 탭 복귀 시 폭주 방지
var CANVAS_RETRY   = 500;      // ms — canvas 미존재 시 재획득 주기
var FONT_STACK = 'ui-sans-serif, -apple-system, "Segoe UI", Roboto, ' +
'"Helvetica Neue", Arial, "Apple Color Emoji", sans-serif';
var DEFAULT_COLOR = '#ffd166';
var CONFETTI_COLORS = [
'#ff6b8b', '#ffd166', '#7bdff2', '#b892ff',
'#8ce99a', '#ffa45c', '#5ad2f4', '#ff8fab'
];
var FEVER_COLORS = ['#ffd166', '#ff9a3c', '#ff7ab8', '#b892ff'];
var AURA_INTERVAL   = 60;   // ms — feverAura 입자 생성 최소 간격 (계약: 레이트 제한)
var AURA_POOL_GUARD = 90;   // 자유 슬롯이 이보다 적으면 앰비언트 생성 중단(핵심 이펙트 우선)
var CB_SHARD = [0, 16, 28, 34, 42, 48, 58, 64, 70];   // 방사형 파편(줄무늬 스파크)
var CB_RAY   = [0,  0,  0,  0,  5,  7,  9, 10, 12];   // 광선(T_BEAM) — L4에서 등장
var CB_RING  = [0,  0,  1,  2,  2,  3,  3,  4,  4];   // 충격파 링 — L2에서 등장
var CB_EMBER = [0,  0,  1,  2,  3,  4,  6,  7,  9];   // 잔광 불티(T_SPARK soft)
var CB_FLASH = 6;                                     // 이 콤보부터 화면 플래시 + 강셰이크
var COMBO_LATCH_TTL = 1400;  // ms — 매치 sfx 가 이 시간 이상 없으면 레벨 1 로 감쇠
var SPEND_WINDOW = 80;    // ms — 슬라이딩 윈도
var SPEND_BUDGET = 150;   // 윈도당 "정가" 파티클 수. 60% 초과분부터 요청량을 깎는다.
var GUARD_FULL = 300;     // freeN 이 이상이면 전량 스폰
var GUARD_MID  = 170;     // 이상이면 70%
var GUARD_LOW  = 90;      // 이상이면 40%, 미만이면 코어+파편 최소한만(18%)
var MERGE_R2   = 34 * 34; // px² — 이 반경 안 + MERGE_MS 안이면 코어를 새로 만들지 않고 보강
var MERGE_MS   = 66;
var CORE_SLOTS = 6;       // 동시 추적하는 코어 플래시 개수(고정 링버퍼 — 런타임 new 없음)
var RAY_WINDOW = 90;      // ms — 광선 세트 동시 상한 윈도
var RAY_MAX    = 2;       // 윈도당 최대 광선 세트 수
var TAU = 6.28318;
var T_SPARK = 'spark', T_CONFETTI = 'confetti', T_TEXT = 'text',
T_BEAM  = 'beam',  T_SWEEP    = 'sweepline', T_RING = 'ring',
T_DASH  = 'dash',   // 끊어진 점선 + 중앙 X (brokenLink)
T_GUIDE = 'guide';  // 8방향 직선 안내 스포크 (lineGuide)
var BROKEN_COLOR = 'rgba(196,201,214,0.92)';
var GUIDE_R_IN   = 0.70;  // 시작 안쪽 반지름 — 타일 자기 숫자를 절대 덮지 않는 거리
var GUIDE_R_OUT  = 1.55;  // 시작 바깥 반지름
var GUIDE_TRAVEL = 0.72;  // 수명 동안 안팎이 함께 바깥으로 밀려나는 거리(= '스침')
var GUIDE_PEAK   = 0.85;  // 최대 알파 — 위 실측 근거로 .55 에서 상향
var GUIDE_WIDTH  = 2.25;  // 스포크 굵기(px) — brokenLink 점선(2.5px)보다는 가늘게
var GUIDE_COLOR  = 'rgba(126,132,150,0.95)';
var GUIDE_DIR = [ 0, -1,  0.7071, -0.7071,  1, 0,  0.7071, 0.7071,
0,  1, -0.7071,  0.7071, -1, 0, -0.7071, -0.7071 ];
function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
function rand(a, b) { return a + Math.random() * (b - a); }
function easeOutCubic(t) { var u = 1 - t; return 1 - u * u * u; }
function easeOutQuint(t) { var u = 1 - t; return 1 - u * u * u * u * u; }
function nowMs() {
return (global.performance && global.performance.now)
? global.performance.now() : Date.now();
}
function hidden() { return !!(global.document && global.document.hidden); }
var mixCache = Object.create(null), mixCacheN = 0;
function toDeep(col, amt) {
var s = (col === undefined || col === null) ? DEFAULT_COLOR : String(col);
var key = 'd|' + s + '|' + amt;
var hit = mixCache[key];
if (hit !== undefined) return hit;
var out = s;
try {
if (s.charAt(0) === '#') {
var hex = s.slice(1);
if (hex.length === 3) {
hex = hex.charAt(0) + hex.charAt(0) + hex.charAt(1) + hex.charAt(1) +
hex.charAt(2) + hex.charAt(2);
}
if (hex.length >= 6) {
var r = parseInt(hex.substr(0, 2), 16);
var g = parseInt(hex.substr(2, 2), 16);
var b = parseInt(hex.substr(4, 2), 16);
if (r === r && g === g && b === b) {
var a = 1 - clamp(+amt || 0, 0, 1);
out = 'rgb(' + Math.round(r * a) + ',' + Math.round(g * a) + ',' +
Math.round(b * a) + ')';
}
}
}
} catch (e) { out = s; }
if (mixCacheN > 192) { mixCache = Object.create(null); mixCacheN = 0; }
mixCache[key] = out; mixCacheN++;
return out;
}
function toWhite(col, amt) {
var s = (col === undefined || col === null) ? DEFAULT_COLOR : String(col);
var key = s + '|' + amt;
var hit = mixCache[key];
if (hit !== undefined) return hit;
var out = s;
try {
if (s.charAt(0) === '#') {
var hex = s.slice(1);
if (hex.length === 3) {
hex = hex.charAt(0) + hex.charAt(0) + hex.charAt(1) + hex.charAt(1) +
hex.charAt(2) + hex.charAt(2);
}
if (hex.length >= 6) {
var r = parseInt(hex.substr(0, 2), 16);
var g = parseInt(hex.substr(2, 2), 16);
var b = parseInt(hex.substr(4, 2), 16);
if (r === r && g === g && b === b) {   // NaN 배제
var a = clamp(+amt || 0, 0, 1);
out = 'rgb(' + Math.round(r + (255 - r) * a) + ',' +
Math.round(g + (255 - g) * a) + ',' +
Math.round(b + (255 - b) * a) + ')';
}
}
}
} catch (e) { out = s; }
if (mixCacheN > 192) { mixCache = Object.create(null); mixCacheN = 0; }   // 무한 증식 방지
mixCache[key] = out; mixCacheN++;
return out;
}
var reducedMotion = false, rmProbed = false;
function ensureRM() {
if (rmProbed) return;
rmProbed = true;
try {
if (!global.matchMedia) return;
var q = global.matchMedia('(prefers-reduced-motion: reduce)');
if (!q) return;
reducedMotion = !!q.matches;
var onCh = function (e) { reducedMotion = !!(e && e.matches); };
if (q.addEventListener) q.addEventListener('change', onCh);
else if (q.addListener) q.addListener(onCh);
} catch (e) { reducedMotion = false; }
}
var inited     = false;
var rafId      = 0;
var canvas     = null;
var ctx        = null;
var dpr        = 1;
var viewW      = 0, viewH = 0;
var lastT      = 0;
var lastCanvasTry = 0;
var needsClear = false;   // 직전 프레임에 뭔가 그렸는가 (idle 시 불필요한 clear 방지)
var soundOn  = true;
var vibeOn   = true;
var pool  = new Array(POOL_SIZE);
var free  = new Array(POOL_SIZE);   // 자유 인덱스 스택
var freeN = 0;
var seqNo = 0;                      // 재활용 대상(가장 오래된 것) 판별용
var activeCount = 0;
var nSpark = 0, nConfetti = 0, nText = 0, nBeam = 0, nSweep = 0, nRing = 0, nDash = 0, nGuide = 0;
(function buildPool() {
for (var i = 0; i < POOL_SIZE; i++) {
pool[i] = {
_idx: i,
active: false, type: T_SPARK, seq: 0,
x: 0, y: 0, x2: 0, y2: 0,
vx: 0, vy: 0,
w: 0, h: 0, size: 0,
rot: 0, vr: 0, flip: 0, vflip: 0,
life: 0, ttl: 1, delay: 0,
alpha: 1, drag: 1, grav: 0, rise: 0,
amul: 1, soft: 0, fr: 0,
color: DEFAULT_COLOR, text: ''
};
free[i] = i;
}
freeN = POOL_SIZE;
})();
function bumpType(type, d) {
if      (type === T_SPARK)    nSpark    += d;
else if (type === T_CONFETTI) nConfetti += d;
else if (type === T_TEXT)     nText     += d;
else if (type === T_BEAM)     nBeam     += d;
else if (type === T_RING)     nRing     += d;
else if (type === T_DASH)     nDash     += d;
else if (type === T_GUIDE)    nGuide    += d;
else                          nSweep    += d;
}
function release(p) {
if (!p.active) return;
p.active = false;
p.text = '';
bumpType(p.type, -1);
activeCount--;
if (freeN < POOL_SIZE) free[freeN++] = p._idx;
}
function alloc(type) {
var p;
if (freeN > 0) {
p = pool[free[--freeN]];
} else {
var best = -1, bestSeq = Infinity;
for (var i = 0; i < POOL_SIZE; i++) {
if (pool[i].active && pool[i].seq < bestSeq) { bestSeq = pool[i].seq; best = i; }
}
if (best < 0) return null;           // 이론상 도달 불가 — 조용히 드롭
p = pool[best];
bumpType(p.type, -1);
activeCount--;
p.active = false;
}
p.type = type;  p.seq = ++seqNo;
p.x = 0; p.y = 0; p.x2 = 0; p.y2 = 0;
p.vx = 0; p.vy = 0;
p.w = 0; p.h = 0; p.size = 3;
p.rot = 0; p.vr = 0; p.flip = 0; p.vflip = 0;
p.life = 0; p.ttl = 1; p.delay = 0;
p.alpha = 1; p.drag = 1; p.grav = 0; p.rise = 0;
p.amul = 1; p.soft = 0; p.fr = 0;
p.color = DEFAULT_COLOR; p.text = '';
p.active = true;
activeCount++;
bumpType(type, 1);
return p;
}
var auraOn  = false;
var auraAcc = 0;      // ms 누적기 — AURA_INTERVAL 마다 1개만 방출
var comboLatch = 1, comboLatchAt = 0;
function setComboLatch(lv) {
var n = +lv;
var v = (typeof n === 'number' && isFinite(n)) ? Math.floor(n) : 1;
if (!(v > 1)) v = 1;
if (v > 8) v = 8;
comboLatch = v;
comboLatchAt = nowMs();
}
function comboLevel() {
if (comboLatchAt === 0) return 1;
if ((nowMs() - comboLatchAt) > COMBO_LATCH_TTL) { comboLatch = 1; comboLatchAt = 0; }
return comboLatch;
}
var spendN = 0, spendAt = 0;
function governorScale() {
var t = nowMs();
if (t - spendAt > SPEND_WINDOW) { spendAt = t; spendN = 0; }
var used = spendN / SPEND_BUDGET;
if (used <= 0.6) return 1;
if (used >= 1.6) return 0.16;
return 1 - (used - 0.6) * 0.84;      // 0.6→1.0, 1.6→0.16 선형
}
function spendNote(n) { spendN += n; }
function spawnQuality() {
ensureRM();
var q;
if      (freeN >= GUARD_FULL) q = 1;
else if (freeN >= GUARD_MID)  q = 0.70;
else if (freeN >= GUARD_LOW)  q = 0.40;
else                          q = 0.18;
var g = governorScale();
if (g < q) q = g;
if (reducedMotion) q *= 0.45;
return q;
}
function decorOK() { return freeN >= GUARD_LOW && !reducedMotion; }
var coreRec = new Array(CORE_SLOTS);
(function () {
for (var i = 0; i < CORE_SLOTS; i++) {
coreRec[i] = { x: 0, y: 0, t: -1e9, p: null, seq: -1, ring: null, rseq: -1 };
}
})();
var coreRecI = 0;
function registerCore(x, y, p, ring) {
var c = coreRec[coreRecI];
coreRecI = (coreRecI + 1) % CORE_SLOTS;
c.x = x; c.y = y; c.t = nowMs();
c.p = p; c.seq = p ? p.seq : -1;
c.ring = ring || null; c.rseq = ring ? ring.seq : -1;
}
function findCore(x, y, t) {
for (var i = 0; i < CORE_SLOTS; i++) {
var c = coreRec[i];
if (!c.p) continue;
if (t - c.t > MERGE_MS) continue;
if (!c.p.active || c.p.seq !== c.seq) { c.p = null; continue; }
var dx = c.x - x, dy = c.y - y;
if (dx * dx + dy * dy <= MERGE_R2) return c;
}
return null;
}
function reinforceCore(c) {
var p = c.p;
if (!p || !p.active) return;
p.life *= 0.55;
p.ttl = Math.min(0.26, p.ttl + 0.05);
p.w = Math.min(p.w * 1.22, 78);
p.amul = Math.min(1, p.amul + 0.10);
c.t = nowMs();
var r = c.ring;
if (r && r.active && r.seq === c.rseq) {
r.life *= 0.70;
r.w = Math.min(r.w * 1.18, 240);
r.amul = Math.min(1, r.amul + 0.08);
}
}
var rayAt = 0, rayN = 0;
function rayAllowed() {
var t = nowMs();
if (t - rayAt > RAY_WINDOW) { rayAt = t; rayN = 0; }
if (rayN >= RAY_MAX) return false;
rayN++;
return true;
}
var vig = { t: 0, dur: 0, strength: 0 };
var vigGrad = null;
function vigActive() { return vig.dur > 0 && vig.t < vig.dur; }
function acquireCanvas() {
if (ctx) return true;
try {
var el = global.document && global.document.getElementById('fx');
if (!el || !el.getContext) return false;
var c = el.getContext('2d', { alpha: true });
if (!c) return false;
canvas = el;
ctx = c;
resizeNow();
return true;
} catch (e) { /* 조용히 무시 */ }
return false;
}
function resizeNow() {
if (!canvas || !ctx) return;
try {
viewW = global.innerWidth  || canvas.clientWidth  || 360;
viewH = global.innerHeight || canvas.clientHeight || 640;
dpr   = clamp(global.devicePixelRatio || 1, 1, 3);
var bw = Math.max(1, Math.round(viewW * dpr));
var bh = Math.max(1, Math.round(viewH * dpr));
if (canvas.width !== bw)  canvas.width  = bw;
if (canvas.height !== bh) canvas.height = bh;
ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
ctx.lineCap  = 'round';
ctx.lineJoin = 'round';
ctx.textAlign = 'center';
ctx.textBaseline = 'middle';
buildVignetteGradient();
needsClear = true;
} catch (e) { /* 조용히 무시 */ }
}
function buildVignetteGradient() {
vigGrad = null;
if (!ctx) return;
try {
var cx = viewW * 0.5, cy = viewH * 0.5;
var r0 = Math.min(viewW, viewH) * 0.30;
var r1 = Math.max(viewW, viewH) * 0.78;
var g = ctx.createRadialGradient(cx, cy, r0, cx, cy, r1);
g.addColorStop(0.0, 'rgba(255,170,90,0)');
g.addColorStop(0.55, 'rgba(255,140,70,0.16)');
g.addColorStop(1.0, 'rgba(255,105,60,0.62)');
vigGrad = g;
} catch (e) { vigGrad = null; }
}
var resizeTimer = 0;
function onResize() {
if (resizeTimer) clearTimeout(resizeTimer);
resizeTimer = setTimeout(function () { resizeTimer = 0; resizeNow(); }, RESIZE_DEBOUNCE);
}
function loop(ts) {
rafId = global.requestAnimationFrame(loop);
var t = (typeof ts === 'number') ? ts : nowMs();
var dt = (lastT ? (t - lastT) : 16) / 1000;
lastT = t;
if (dt > MAX_DT) dt = MAX_DT;
if (dt < 0) dt = 0;
if (!ctx) {
if (t - lastCanvasTry > CANVAS_RETRY) { lastCanvasTry = t; acquireCanvas(); }
return;
}
step(dt);
if (activeCount === 0 && !vigActive()) {
if (needsClear) { ctx.clearRect(0, 0, viewW, viewH); needsClear = false; }
return;
}
ctx.clearRect(0, 0, viewW, viewH);
draw(dt);
needsClear = true;
}
function startLoop() {
if (rafId) return;                        // 중복 시작 금지
lastT = 0;
if (global.requestAnimationFrame) {
rafId = global.requestAnimationFrame(loop);
}
}
function step(dt) {
if (vig.dur > 0) {
vig.t += dt;
if (vig.t >= vig.dur) { vig.dur = 0; vig.t = 0; vig.strength = 0; }
}
if (auraOn) {
auraAcc += dt * 1000;
if (auraAcc >= AURA_INTERVAL) {
auraAcc = 0;                       // 누적 폭주 방지 — 밀린 만큼 몰아서 뿜지 않는다
spawnAura();
}
}
if (activeCount === 0) return;
for (var i = 0; i < POOL_SIZE; i++) {
var p = pool[i];
if (!p.active) continue;
if (p.delay > 0) { p.delay -= dt; continue; }
p.life += dt;
if (p.life >= p.ttl) { release(p); continue; }
var k = p.life / p.ttl;
if (p.type === T_SPARK) {
var d = Math.pow(p.drag, dt * 60);
p.vx *= d; p.vy *= d;
p.vy += p.grav * dt;
p.x += p.vx * dt; p.y += p.vy * dt;
p.alpha = p.soft
? (k < 0.22 ? k / 0.22 : 1 - (k - 0.22) / 0.78)  // 앰비언트: 스르르 등장·소멸
: 1 - k * k;                                     // 일반: 후반부 급격 페이드
} else if (p.type === T_CONFETTI) {
p.vy += p.grav * dt;                          // 중력
p.vx *= Math.pow(0.985, dt * 60);
p.x += p.vx * dt; p.y += p.vy * dt;
p.rot += p.vr * dt;                           // 각속도
p.flip += p.vflip * dt;                       // 3D 플립 느낌(가로 스쿼시)
p.alpha = k < 0.72 ? 1 : (1 - (k - 0.72) / 0.28);
} else if (p.type === T_TEXT) {
p.y = p.y2 - p.rise * easeOutQuint(k);        // ease-out 상승
p.alpha = k < 0.55 ? 1 : (1 - (k - 0.55) / 0.45);
} else if (p.type === T_BEAM) {
p.alpha = k < 0.25 ? (k / 0.25) : (1 - (k - 0.25) / 0.75);
} else if (p.type === T_RING) {
var rf = k < 0.10 ? (k / 0.10) : (1 - (k - 0.10) / 0.90);
p.alpha = rf * rf;                           // 제곱 → 꼬리가 부드럽게 사라짐
} else if (p.type === T_DASH) {
p.alpha = k < 0.12 ? (k / 0.12) : (1 - (k - 0.12) / 0.88);
} else if (p.type === T_GUIDE) {
p.alpha = GUIDE_PEAK * (k < 0.18 ? (k / 0.18) : (1 - (k - 0.18) / 0.82));
} else { // sweepline
p.alpha = 1 - k * 0.35;
}
}
}
  /* ==FRUITPATH:BEGIN== generated by tools/fruit-tiles.js — do not edit by hand */
var FRUIT_D = [null,
'M0 -0.49L0.045 -0.488L0.096 -0.481L0.145 -0.468L0.188 -0.453L0.228 -0.434L0.272 -0.407L0.313 -0.377L0.346 -0.346L0.377 -0.313L0.407 -0.272L0.431 -0.234L0.453 -0.188L0.47 -0.139L0.481 -0.096L0.487 -0.051L0.49 0L0.488 0.045L0.481 0.096L0.47 0.139L0.453 0.188L0.434 0.228L0.407 0.272L0.377 0.313L0.346 0.346L0.308 0.381L0.272 0.407L0.234 0.431L0.188 0.453L0.139 0.47L0.096 0.481L0.051 0.487L0 0.49L-0.045 0.488L-0.096 0.481L-0.145 0.468L-0.188 0.453L-0.234 0.431L-0.272 0.407L-0.308 0.381L-0.346 0.346L-0.377 0.313L-0.407 0.272L-0.431 0.234L-0.453 0.188L-0.468 0.145L-0.481 0.096L-0.487 0.051L-0.49 0L-0.487 -0.051L-0.481 -0.096L-0.47 -0.139L-0.453 -0.188L-0.434 -0.228L-0.407 -0.272L-0.381 -0.308L-0.346 -0.346L-0.313 -0.377L-0.272 -0.407L-0.228 -0.434L-0.188 -0.453L-0.145 -0.468L-0.096 -0.481L-0.051 -0.487Z',
'M0 -0.449L0.039 -0.455L0.145 -0.49L0.176 -0.497L0.208 -0.5L0.247 -0.498L0.279 -0.492L0.309 -0.481L0.344 -0.463L0.374 -0.441L0.406 -0.409L0.433 -0.373L0.458 -0.328L0.475 -0.287L0.489 -0.238L0.497 -0.187L0.5 -0.136L0.498 -0.085L0.489 -0.028L0.476 0.022L0.456 0.077L0.429 0.137L0.396 0.195L0.355 0.261L0.316 0.314L0.281 0.356L0.242 0.396L0.204 0.428L0.169 0.451L0.124 0.474L0.084 0.488L0.042 0.497L0 0.5L-0.042 0.497L-0.084 0.488L-0.124 0.474L-0.169 0.451L-0.204 0.428L-0.242 0.396L-0.281 0.356L-0.316 0.314L-0.355 0.261L-0.396 0.195L-0.429 0.137L-0.456 0.077L-0.476 0.022L-0.489 -0.028L-0.498 -0.085L-0.5 -0.136L-0.497 -0.187L-0.489 -0.238L-0.475 -0.287L-0.458 -0.328L-0.433 -0.373L-0.406 -0.409L-0.374 -0.441L-0.344 -0.463L-0.309 -0.481L-0.279 -0.492L-0.247 -0.498L-0.208 -0.5L-0.176 -0.497L-0.145 -0.49L-0.039 -0.455Z',
'M0 -0.5L0.035 -0.495L0.073 -0.481L0.116 -0.459L0.162 -0.43L0.211 -0.393L0.256 -0.354L0.3 -0.31L0.343 -0.261L0.378 -0.215L0.41 -0.167L0.439 -0.117L0.46 -0.072L0.477 -0.026L0.489 0.02L0.497 0.065L0.5 0.11L0.498 0.155L0.491 0.191L0.479 0.233L0.464 0.267L0.445 0.299L0.422 0.33L0.396 0.358L0.361 0.389L0.328 0.412L0.285 0.436L0.246 0.454L0.197 0.471L0.153 0.483L0.101 0.493L0.054 0.498L0 0.5L-0.054 0.498L-0.101 0.493L-0.153 0.483L-0.197 0.471L-0.246 0.454L-0.285 0.436L-0.328 0.412L-0.361 0.389L-0.396 0.358L-0.422 0.33L-0.445 0.299L-0.464 0.267L-0.479 0.233L-0.491 0.191L-0.498 0.155L-0.5 0.11L-0.497 0.065L-0.489 0.02L-0.477 -0.026L-0.46 -0.072L-0.439 -0.117L-0.41 -0.167L-0.378 -0.215L-0.343 -0.261L-0.3 -0.31L-0.256 -0.354L-0.211 -0.393L-0.162 -0.43L-0.116 -0.459L-0.073 -0.481L-0.035 -0.495Z',
'M0 -0.5L0.034 -0.496L0.066 -0.484L0.096 -0.465L0.128 -0.435L0.151 -0.404L0.172 -0.363L0.207 -0.259L0.285 -0.259L0.321 -0.256L0.365 -0.246L0.4 -0.233L0.437 -0.21L0.462 -0.185L0.482 -0.156L0.495 -0.123L0.5 -0.088L0.498 -0.053L0.488 -0.017L0.472 0.017L0.451 0.048L0.42 0.082L0.335 0.148L0.363 0.239L0.371 0.292L0.37 0.346L0.358 0.397L0.338 0.435L0.315 0.461L0.287 0.481L0.249 0.495L0.221 0.5L0.192 0.499L0.164 0.495L0.135 0.486L0.108 0.474L0.075 0.455L0 0.4L-0.088 0.463L-0.128 0.483L-0.164 0.495L-0.207 0.5L-0.242 0.497L-0.275 0.487L-0.304 0.469L-0.329 0.446L-0.349 0.416L-0.363 0.383L-0.371 0.339L-0.372 0.3L-0.366 0.254L-0.335 0.148L-0.409 0.092L-0.446 0.054L-0.476 0.01L-0.495 -0.038L-0.499 -0.067L-0.5 -0.088L-0.493 -0.13L-0.475 -0.168L-0.448 -0.2L-0.431 -0.214L-0.406 -0.229L-0.379 -0.241L-0.351 -0.25L-0.299 -0.258L-0.207 -0.259L-0.172 -0.363L-0.151 -0.404L-0.128 -0.435L-0.096 -0.465L-0.066 -0.484L-0.034 -0.496Z',
'M0 -0.5L0.052 -0.495L0.108 -0.478L0.154 -0.454L0.199 -0.417L0.224 -0.388L0.248 -0.351L0.263 -0.316L0.275 -0.275L0.328 -0.258L0.372 -0.235L0.412 -0.203L0.446 -0.165L0.47 -0.126L0.487 -0.084L0.497 -0.039L0.5 0L0.495 0.052L0.478 0.108L0.454 0.154L0.417 0.199L0.388 0.224L0.351 0.248L0.316 0.263L0.275 0.275L0.258 0.328L0.235 0.372L0.203 0.412L0.165 0.446L0.126 0.47L0.084 0.487L0.039 0.497L0 0.5L-0.052 0.495L-0.108 0.478L-0.154 0.454L-0.199 0.417L-0.224 0.388L-0.248 0.351L-0.263 0.316L-0.275 0.275L-0.328 0.258L-0.372 0.235L-0.412 0.203L-0.446 0.165L-0.47 0.126L-0.487 0.084L-0.497 0.039L-0.5 0L-0.497 -0.039L-0.487 -0.084L-0.47 -0.126L-0.446 -0.165L-0.412 -0.203L-0.372 -0.235L-0.328 -0.258L-0.275 -0.275L-0.263 -0.316L-0.248 -0.351L-0.224 -0.388L-0.199 -0.417L-0.154 -0.454L-0.108 -0.478L-0.052 -0.495Z',
'M0.5 0L0.249 0.5L-0.249 0.5L-0.5 0L-0.249 -0.5L0.249 -0.5Z',
'M0 -0.5L0.029 -0.495L0.067 -0.484L0.11 -0.465L0.151 -0.443L0.192 -0.417L0.234 -0.386L0.275 -0.352L0.315 -0.315L0.352 -0.275L0.386 -0.234L0.417 -0.192L0.443 -0.151L0.465 -0.11L0.484 -0.067L0.495 -0.029L0.5 0L0.495 0.029L0.484 0.067L0.465 0.11L0.443 0.151L0.417 0.192L0.386 0.234L0.352 0.275L0.315 0.315L0.275 0.352L0.234 0.386L0.192 0.417L0.151 0.443L0.11 0.465L0.067 0.484L0.029 0.495L0 0.5L-0.029 0.495L-0.067 0.484L-0.11 0.465L-0.151 0.443L-0.192 0.417L-0.234 0.386L-0.275 0.352L-0.315 0.315L-0.352 0.275L-0.386 0.234L-0.417 0.192L-0.443 0.151L-0.465 0.11L-0.484 0.067L-0.495 0.029L-0.5 0L-0.495 -0.029L-0.484 -0.067L-0.465 -0.11L-0.443 -0.151L-0.417 -0.192L-0.386 -0.234L-0.352 -0.275L-0.315 -0.315L-0.275 -0.352L-0.234 -0.386L-0.192 -0.417L-0.151 -0.443L-0.11 -0.465L-0.067 -0.484L-0.029 -0.495Z',
'M0 -0.5L0.046 -0.498L0.098 -0.49L0.148 -0.478L0.191 -0.462L0.233 -0.442L0.278 -0.416L0.315 -0.389L0.354 -0.354L0.384 -0.32L0.416 -0.278L0.442 -0.233L0.462 -0.191L0.479 -0.142L0.49 -0.098L0.497 -0.052L0.5 0L0.497 0.052L0.49 0.098L0.479 0.142L0.462 0.191L0.439 0.239L0.416 0.278L0.389 0.315L0.354 0.354L0.315 0.389L0.278 0.416L0.239 0.439L0.191 0.462L0.148 0.478L0.098 0.49L0.046 0.498L0 0.5L-0.046 0.498L-0.098 0.49L-0.142 0.479L-0.191 0.462L-0.239 0.439L-0.278 0.416L-0.315 0.389L-0.354 0.354L-0.384 0.32L-0.416 0.278L-0.439 0.239L-0.462 0.191L-0.479 0.142L-0.49 0.098L-0.497 0.052L-0.5 0L-0.497 -0.052L-0.49 -0.098L-0.478 -0.148L-0.462 -0.191L-0.442 -0.233L-0.416 -0.278L-0.384 -0.32L-0.354 -0.354L-0.315 -0.389L-0.278 -0.416L-0.239 -0.439L-0.191 -0.462L-0.148 -0.478L-0.098 -0.49L-0.046 -0.498Z',
'M0 -0.5L0.067 -0.498L0.129 -0.492L0.193 -0.481L0.26 -0.466L0.323 -0.446L0.384 -0.423L0.441 -0.398L0.5 -0.366L0.498 -0.299L0.492 -0.237L0.481 -0.173L0.466 -0.108L0.446 -0.042L0.423 0.018L0.397 0.075L0.366 0.134L0.331 0.191L0.295 0.241L0.253 0.291L0.207 0.342L0.158 0.387L0.107 0.428L0.057 0.465L0 0.5L-0.057 0.465L-0.107 0.428L-0.158 0.387L-0.207 0.342L-0.253 0.291L-0.295 0.241L-0.331 0.191L-0.366 0.134L-0.397 0.075L-0.423 0.018L-0.446 -0.042L-0.466 -0.108L-0.481 -0.173L-0.492 -0.237L-0.498 -0.299L-0.5 -0.366L-0.441 -0.398L-0.384 -0.423L-0.323 -0.446L-0.26 -0.466L-0.193 -0.481L-0.129 -0.492L-0.067 -0.498Z'];
var FRUIT_P2D = null;
function fruitPath(n) {
if (!FRUIT_D[n] || typeof Path2D === 'undefined') return null;
if (!FRUIT_P2D) {
FRUIT_P2D = [null];
for (var i = 1; i < FRUIT_D.length; i++) FRUIT_P2D[i] = new Path2D(FRUIT_D[i]);
}
return FRUIT_P2D[n] || null;
}
  /* ==FRUITPATH:END== */
function draw() {
var i, p;
if (vigActive() && vigGrad) {
var vk = vig.t / vig.dur;
var va = (vk < 0.28 ? vk / 0.28 : 1 - (vk - 0.28) / 0.72) * vig.strength;
if (va > 0) {
ctx.globalCompositeOperation = 'lighter';
ctx.globalAlpha = clamp(va, 0, 1);
ctx.fillStyle = vigGrad;
ctx.fillRect(0, 0, viewW, viewH);
ctx.globalCompositeOperation = 'source-over';
}
}
if (nSweep > 0) {
for (i = 0; i < POOL_SIZE; i++) {
p = pool[i];
if (!p.active || p.delay > 0 || p.type !== T_SWEEP) continue;
var pr = easeOutCubic(p.life / p.ttl);
var head = p.x + p.w * pr;
var barW = Math.max(26, p.w * 0.20);
ctx.fillStyle = p.color;
for (var s = 0; s < 4; s++) {
var segR = head - (barW * s) / 4;
var segL = head - (barW * (s + 1)) / 4;
if (segL < p.x) segL = p.x;
if (segR > p.x + p.w) segR = p.x + p.w;
if (segR <= segL) continue;
ctx.globalAlpha = clamp(p.alpha * (0.85 - s * 0.18), 0, 1);
ctx.fillRect(segL, p.y, segR - segL, p.h);
}
}
}
if (nBeam > 0) {
ctx.globalCompositeOperation = 'lighter';
for (i = 0; i < POOL_SIZE; i++) {
p = pool[i];
if (!p.active || p.delay > 0 || p.type !== T_BEAM) continue;
var bk = p.life / p.ttl;
ctx.strokeStyle = p.color;
ctx.globalAlpha = clamp(p.alpha * 0.42, 0, 1);
ctx.lineWidth = p.size * (1.6 - bk * 0.9);
ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x2, p.y2); ctx.stroke();
ctx.globalAlpha = clamp(p.alpha, 0, 1);
ctx.lineWidth = Math.max(1, p.size * (0.45 - bk * 0.25));
ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x2, p.y2); ctx.stroke();
}
ctx.globalCompositeOperation = 'source-over';
}
if (nRing > 0) {
ctx.globalCompositeOperation = 'lighter';
var rFill = '', rStroke = '';
for (i = 0; i < POOL_SIZE; i++) {
p = pool[i];
if (!p.active || p.delay > 0 || p.type !== T_RING) continue;
var re = easeOutCubic(p.life / p.ttl);
var rr = p.size + (p.w - p.size) * re;       // size=시작 반경, w=끝 반경
if (rr <= 0.5) continue;
ctx.globalAlpha = clamp(p.alpha * p.amul, 0, 1);
if (p.soft) {
if (p.color !== rFill) { ctx.fillStyle = p.color; rFill = p.color; }
ctx.beginPath();
ctx.arc(p.x, p.y, rr, 0, TAU);
ctx.fill();
} else {
if (p.color !== rStroke) { ctx.strokeStyle = p.color; rStroke = p.color; }
ctx.lineWidth = Math.max(0.7, p.h * (1 - re * 0.82));
ctx.beginPath();
ctx.arc(p.x, p.y, rr, 0, TAU);
ctx.stroke();
}
}
ctx.globalCompositeOperation = 'source-over';
}
if (nSpark > 0) {
ctx.globalCompositeOperation = 'lighter';
var sFill = '', sStroke = '';
for (i = 0; i < POOL_SIZE; i++) {
p = pool[i];
if (!p.active || p.delay > 0 || p.type !== T_SPARK) continue;
var sr = Math.max(0.4, p.size * (1 - p.life / p.ttl * 0.55));
ctx.globalAlpha = clamp(p.alpha * p.amul, 0, 1);
if (p.h > 0) {
var sv = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
if (sv > 24) {
var sl = sv * p.h;
if (sl < 2) sl = 2; else if (sl > 46) sl = 46;
var iv = 1 / sv;
if (p.color !== sStroke) { ctx.strokeStyle = p.color; sStroke = p.color; }
ctx.lineWidth = Math.max(0.7, sr * 1.65);   // lineCap:'round' → 캡슐
ctx.beginPath();
ctx.moveTo(p.x, p.y);
ctx.lineTo(p.x - p.vx * iv * sl, p.y - p.vy * iv * sl);
ctx.stroke();
continue;
}
}
if (p.soft === 2 && p.fr) {
var fpp = fruitPath(p.fr);
if (fpp) {
var fsz = sr * 2.35;                       // 패스는 -0.5..0.5 = 지름 1
var fco = Math.cos(p.rot) * fsz, fsi = Math.sin(p.rot) * fsz;
ctx.setTransform(dpr * fco, dpr * fsi, -dpr * fsi, dpr * fco, dpr * p.x, dpr * p.y);
if (p.color !== sFill) { ctx.fillStyle = p.color; sFill = p.color; }
ctx.fill(fpp);
ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
continue;
}
}
if (p.color !== sFill) { ctx.fillStyle = p.color; sFill = p.color; }
ctx.beginPath();
ctx.arc(p.x, p.y, sr, 0, TAU);
ctx.fill();
if (p.soft === 2 && sr > 1.6) {
ctx.fillStyle = '#ffffff'; sFill = '#ffffff';
ctx.globalAlpha = clamp(p.alpha * p.amul * 0.55, 0, 1);
ctx.beginPath();
ctx.arc(p.x - sr * 0.34, p.y - sr * 0.36, sr * 0.34, 0, TAU);
ctx.fill();
}
}
ctx.globalCompositeOperation = 'source-over';
}
if (nConfetti > 0) {
for (i = 0; i < POOL_SIZE; i++) {
p = pool[i];
if (!p.active || p.delay > 0 || p.type !== T_CONFETTI) continue;
var c = Math.cos(p.rot), sn = Math.sin(p.rot);
var sq = Math.abs(Math.cos(p.flip)) * 0.85 + 0.15;   // 얇아졌다 두꺼워지는 플립
ctx.setTransform(
dpr * c, dpr * sn,
-dpr * sn * sq, dpr * c * sq,
dpr * p.x, dpr * p.y
);
ctx.globalAlpha = clamp(p.alpha, 0, 1);
ctx.fillStyle = p.color;
ctx.fillRect(-p.w * 0.5, -p.h * 0.5, p.w, p.h);
}
ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
if (nText > 0) {
ctx.strokeStyle = 'rgba(8,10,20,0.62)';
for (i = 0; i < POOL_SIZE; i++) {
p = pool[i];
if (!p.active || p.delay > 0 || p.type !== T_TEXT) continue;
var tk = p.life / p.ttl;
var pop = tk < 0.16 ? (0.75 + 0.25 * easeOutCubic(tk / 0.16) * 1.35) : 1;
var px = Math.round(p.size * pop);
ctx.font = fontFor(px);
ctx.globalAlpha = clamp(p.alpha, 0, 1);
ctx.lineWidth = Math.max(2, px * 0.22);
ctx.strokeText(p.text, p.x, p.y);
ctx.fillStyle = p.color;
ctx.fillText(p.text, p.x, p.y);
}
}
if (nDash > 0) {
var hasDash = !!ctx.setLineDash;
for (i = 0; i < POOL_SIZE; i++) {
p = pool[i];
if (!p.active || p.delay > 0 || p.type !== T_DASH) continue;
ctx.globalAlpha = clamp(p.alpha, 0, 1);
ctx.strokeStyle = p.color;
if (hasDash) ctx.setLineDash([6, 5]);
ctx.lineWidth = 2.5;
ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x2, p.y2); ctx.stroke();
if (hasDash) ctx.setLineDash([]);      // X 는 반드시 실선으로
var mx = (p.x + p.x2) * 0.5, my = (p.y + p.y2) * 0.5;
var arm = p.size;
ctx.lineWidth = 3;
ctx.beginPath();
ctx.moveTo(mx - arm, my - arm); ctx.lineTo(mx + arm, my + arm);
ctx.moveTo(mx + arm, my - arm); ctx.lineTo(mx - arm, my + arm);
ctx.stroke();
}
if (hasDash) ctx.setLineDash([]);        // 다른 패스가 점선을 물려받지 않도록 최종 초기화
}
if (nGuide > 0) {
var hasDashG = !!ctx.setLineDash;
if (hasDashG) ctx.setLineDash([]);        // 스포크는 반드시 실선
for (i = 0; i < POOL_SIZE; i++) {
p = pool[i];
if (!p.active || p.delay > 0 || p.type !== T_GUIDE) continue;
var gk = p.life / p.ttl; if (gk > 1) gk = 1;
var gpush = GUIDE_TRAVEL * easeOutCubic(gk) * p.amul;
var gstep = p.size;                     // 타일 피치(px)
var gr0 = gstep * (GUIDE_R_IN  + gpush);
var gr1 = gstep * (GUIDE_R_OUT + gpush);
ctx.globalAlpha = clamp(p.alpha, 0, 1);
ctx.strokeStyle = p.color;
ctx.lineWidth = GUIDE_WIDTH;
ctx.beginPath();
for (var gd = 0; gd < 8; gd++) {
var gux = GUIDE_DIR[gd * 2], guy = GUIDE_DIR[gd * 2 + 1];
ctx.moveTo(p.x + gux * gr0, p.y + guy * gr0);
ctx.lineTo(p.x + gux * gr1, p.y + guy * gr1);
}
ctx.stroke();                           // 8줄을 한 번의 stroke 로
}
}
ctx.globalAlpha = 1;
}
var fontCache = Object.create(null);
function fontFor(px) {
var f = fontCache[px];
if (!f) { f = '800 ' + px + 'px ' + FONT_STACK; fontCache[px] = f; }
return f;
}
var actx = null, master = null, limiter = null, noiseBuffer = null;
var audioFailed = false;
var lastSfxAt = Object.create(null);
var feverVoice     = null;   // { g: GainNode, oscs: [] } — 재생 중인 라이저
var feverBusyUntil = 0;      // actx.currentTime 기준 종료 예정 시각
var feverActive = false;     // 피버 진행 중? (rowClear 덕킹 / BGM 필터 판단용)
var duckUntil   = 0;         // actx.currentTime 기준 덕킹 복귀 예정 시각
function createAudio() {
if (actx || audioFailed || !soundOn) return actx;
try {
var AC = global.AudioContext || global.webkitAudioContext;
if (!AC) { audioFailed = true; return null; }
var c = new AC();
var g = c.createGain();
g.gain.value = MASTER_BASE;
var lim = c.createDynamicsCompressor();
try {
lim.threshold.value = -10;
lim.knee.value = 0;
lim.ratio.value = 12;
lim.attack.value = 0.003;
lim.release.value = 0.25;
} catch (e) { /* 파라미터 미지원 브라우저 무시 */ }
g.connect(lim);
lim.connect(c.destination);
actx = c; master = g; limiter = lim;
} catch (e) {
audioFailed = true; actx = null; master = null;
}
return actx;
}
function gate(name) {
if (!soundOn || !actx || !master) return false;
if (hidden()) return false;
var t = nowMs();
var deb = SFX_DEBOUNCE_MAP[name] !== undefined ? SFX_DEBOUNCE_MAP[name] : SFX_DEBOUNCE;
if (lastSfxAt[name] !== undefined && (t - lastSfxAt[name]) < deb) return false;
lastSfxAt[name] = t;
if (actx.state === 'suspended') { try { actx.resume(); } catch (e) {} }
return true;
}
function at() { return actx.currentTime; }
function envelope(t0, dur, peak, attack) {
var g = actx.createGain();
var a = attack === undefined ? 0.006 : attack;
g.gain.setValueAtTime(0.0001, t0);
g.gain.linearRampToValueAtTime(Math.max(0.0002, peak), t0 + a);
g.gain.exponentialRampToValueAtTime(0.0001, t0 + Math.max(a + 0.02, dur));
g.connect(master);
return g;
}
function tone(type, f0, f1, t0, dur, peak, attack) {
if (!actx) return;
try {
var o = actx.createOscillator();
o.type = type;
o.frequency.setValueAtTime(Math.max(20, f0), t0);
if (f1 && f1 !== f0) {
o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur * 0.92);
}
var g = envelope(t0, dur, peak, attack);
o.connect(g);
o.start(t0);
o.stop(t0 + dur + 0.04);
o.onended = function () { try { o.disconnect(); g.disconnect(); } catch (e) {} };
} catch (e) { /* 조용히 무시 */ }
}
function getNoiseBuffer() {
if (noiseBuffer) return noiseBuffer;
try {
var len = Math.floor(actx.sampleRate * 1.0);
var b = actx.createBuffer(1, len, actx.sampleRate);
var d = b.getChannelData(0);
for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
noiseBuffer = b;
} catch (e) { noiseBuffer = null; }
return noiseBuffer;
}
function noise(t0, dur, peak, filterType, f0, f1, q, attack) {
if (!actx) return;
try {
var buf = getNoiseBuffer();
if (!buf) return;
var src = actx.createBufferSource();
src.buffer = buf;
src.loop = true;
var bq = actx.createBiquadFilter();
bq.type = filterType || 'bandpass';
try { bq.Q.value = q || 1; } catch (e) {}
bq.frequency.setValueAtTime(Math.max(40, f0), t0);
if (f1 && f1 !== f0) {
bq.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t0 + dur * 0.95);
}
var g = envelope(t0, dur, peak, attack === undefined ? 0.004 : attack);
src.connect(bq); bq.connect(g);
src.start(t0);
src.stop(t0 + dur + 0.03);
src.onended = function () { try { src.disconnect(); bq.disconnect(); g.disconnect(); } catch (e) {} };
} catch (e) { /* 조용히 무시 */ }
}
function jellyDrop(t0, f, peak, dur, bend) {
if (!actx) return;
var b = bend === undefined ? 0.46 : bend;
tone('sine', f, f * b, t0, dur, peak, dur * 0.16);
if (peak > 0.030) {
tone('sine', f * 2.02, f * b * 1.94, t0, dur * 0.52, peak * 0.20, dur * 0.12);
}
}
function stopFeverRiser(fade) {
var v = feverVoice;
feverVoice = null;
feverBusyUntil = 0;
if (!v || !actx) return;
var f = fade === undefined ? 0.08 : fade;
try {
var t = at();
var cur = v.g.gain.value;
v.g.gain.cancelScheduledValues(t);
v.g.gain.setValueAtTime(Math.max(0.0001, cur), t);
v.g.gain.exponentialRampToValueAtTime(0.0001, t + f);
for (var i = 0; i < v.oscs.length; i++) {
try { v.oscs[i].stop(t + f + 0.02); } catch (e) {}
}
} catch (e) { /* 조용히 무시 */ }
}
var voiceBusyUntil = 0;   // actx 시계 기준. 이 시각 전에는 새 보이스를 시작하지 않는다.
var VOICE_CLIPS = {};       // 예: { 'jelly/6': 'data:audio/mpeg;base64,...' }
var voiceClipBuf = {};      // url -> AudioBuffer | 'load' | 'bad'
function voiceClipUrl(charId, tier) {
var k = charId + '/' + tier;
if (typeof VOICE_CLIPS[k] === 'string') return VOICE_CLIPS[k];
if (typeof VOICE_CLIPS[charId] === 'string') return VOICE_CLIPS[charId];
return '';
}
function playVoiceClip(url, t0, gain) {
if (!actx || !master) return false;
var st = voiceClipBuf[url];
if (st === 'bad' || st === 'load') return false;
if (!st) {
voiceClipBuf[url] = 'load';
try {
var xhr = new XMLHttpRequest();
xhr.open('GET', url, true);
xhr.responseType = 'arraybuffer';
xhr.onload = function () {
try {
actx.decodeAudioData(xhr.response, function (b) { voiceClipBuf[url] = b; },
function () { voiceClipBuf[url] = 'bad'; });
} catch (e) { voiceClipBuf[url] = 'bad'; }
};
xhr.onerror = function () { voiceClipBuf[url] = 'bad'; };
xhr.send();
} catch (e) { voiceClipBuf[url] = 'bad'; }
return false;
}
try {
var src = actx.createBufferSource();
src.buffer = st;
var g = actx.createGain();
g.gain.value = gain;
src.connect(g); g.connect(master);
src.onended = function () { try { src.disconnect(); g.disconnect(); } catch (e) {} };
src.start(t0);
voiceBusyUntil = t0 + st.duration + 0.06;
return true;
} catch (e) { return false; }
}
var SFX_CLIPS = {};      // 예: { 'match-pop': 'data:audio/mpeg;base64,...' }
var sfxClipBuf = {};     // url -> { buf: AudioBuffer, off: Number } | 'load' | 'bad'
function sfxClipUrl(slot, step) {
var k = (step === undefined || step === null || step === '') ? '' : (slot + '/' + step);
if (k && typeof SFX_CLIPS[k] === 'string' && SFX_CLIPS[k]) return SFX_CLIPS[k];
if (typeof SFX_CLIPS[slot] === 'string' && SFX_CLIPS[slot]) return SFX_CLIPS[slot];
var m = (typeof global !== 'undefined') ? global.TT_SFX : null;   // 지연 조회
if (m) {
if (k && typeof m[k] === 'string' && m[k]) return m[k];
if (typeof m[slot] === 'string' && m[slot]) return m[slot];
}
return '';
}
function sfxHeadOffset(buf) {
try {
var ch = Math.min(2, buf.numberOfChannels), n = buf.length;
var L = buf.getChannelData(0);
var R = ch > 1 ? buf.getChannelData(1) : null;
var i, v, w;
for (i = 0; i < n; i++) {
v = L[i]; if (v < 0) v = -v;
if (R) { w = R[i]; if (w < 0) w = -w; if (w > v) v = w; }
if (v >= MAIN_SIL) return i / buf.sampleRate;
}
return 0;                       // 통째로 무음인 파일 방어 — 오프셋 없이 둔다
} catch (e) { return 0; }
}
function playSfxClip(slot, t0, gain, step) {
if (!actx || !master) return false;
var url = sfxClipUrl(slot, step);
if (!url) return false;
var st = sfxClipBuf[url];
if (st === 'bad' || st === 'load') return false;
if (!st) {
sfxClipBuf[url] = 'load';
var ab = mainBytes(url);
if (!ab) { sfxClipBuf[url] = 'bad'; return false; }
var done = function (b) {
try { sfxClipBuf[url] = { buf: b, off: sfxHeadOffset(b) }; }
catch (e) { sfxClipBuf[url] = 'bad'; }
};
var bad = function () { sfxClipBuf[url] = 'bad'; };
var once = false, done1 = function (b) { if (once) return; once = true; done(b); };   /* perf-0908: 1회 */
var bad1 = function () { if (once) return; once = true; bad(); };
try {
var pr = actx.decodeAudioData(ab, done1, bad1);
if (pr && typeof pr.then === 'function') pr.then(done1, bad1);
} catch (e) { sfxClipBuf[url] = 'bad'; }
return false;
}
try {
var src = actx.createBufferSource();
src.buffer = st.buf;
var g = actx.createGain();
g.gain.value = gain;
src.connect(g); g.connect(master);
src.onended = function () { try { src.disconnect(); g.disconnect(); } catch (e) {} };
src.start(t0, st.off);           // 앞 패딩을 건너뛰고 첫 소리부터
return true;
} catch (e) { return false; }
}
function comboTier(n) {
var v = n | 0;
if (v < 8) return 0;
var tr = 1 + Math.floor((v - 8) / 4);
return tr > 4 ? 4 : tr;
}
var VOICE_CHARS = {
ten: {
f0: 225, type: 'sawtooth', det: 7,          // 14차 확정: 텐텐 높음·트윈 낮음 (비숑=가벼움 / 곰=묵직)
vow: [[540, 950, 2592], [734, 1210, 2700]], // 14차 확정: 포먼트 ×1.08 (jellyer 'ten-alt')
fg: [1.0, 0.46, 0.13],
syl: 0.125, gap: 0.148, step: [0, 2, 5],
vib: 3.2, vibD: 5, peak: 0.30
},
ppyak: {
f0: 352, type: 'sawtooth', det: 12,
vow: [[330, 2250, 3150], [420, 2500, 3300]],
fg: [0.62, 1.0, 0.34],
syl: 0.072, gap: 0.092, step: [0, 5, 9],
vib: 6.5, vibD: 14, peak: 0.24
},
mungchi: {
f0: 268, type: 'triangle', det: 9,
vow: [[380, 780, 2150], [430, 900, 2200]],
fg: [1.0, 0.72, 0.10],
syl: 0.155, gap: 0.170, step: [0, 2, 4],
vib: 5.0, vibD: 22, peak: 0.34
},
jelly: {
f0: 418, type: 'triangle', det: 10,
vow: [[400, 1080, 2650], [318, 2080, 3050]],
fg: [0.88, 0.92, 0.30],
syl: 0.058, gap: 0.082, step: [0, 7, 12],
vib: 7.6, vibD: 9, peak: 0.27
},
twin: {
f0: 168, type: 'sawtooth', det: 8,          // 14차 확정: 텐텐 높음·트윈 낮음 (비숑=가벼움 / 곰=묵직)
vow: [[519, 902, 2401], [696, 1156, 2509]], // 14차 확정: 포먼트 ×0.98 (jellyer 'twin-alt')
fg: [1.0, 0.50, 0.15],
syl: 0.104, gap: 0.121, step: [0, 3, 7],
vib: 3.8, vibD: 8, peak: 0.29
},
pudding: {
f0: 196, type: 'triangle', det: 9,
vow: [[420, 820, 2100], [500, 940, 2180]],
fg: [1.0, 0.66, 0.12],
syl: 0.170, gap: 0.186, step: [0, 2, 3],
vib: 3.0, vibD: 10, peak: 0.33
},
sodawitch: {
f0: 386, type: 'sawtooth', det: 14,
vow: [[380, 1150, 2700], [300, 2180, 3200]],
fg: [0.80, 0.98, 0.40],
syl: 0.066, gap: 0.090, step: [0, 4, 11],
vib: 8.4, vibD: 26, peak: 0.25
},
mongle: {
f0: 310, type: 'triangle', det: 8,
vow: [[400, 860, 2200], [450, 980, 2260]],
fg: [0.96, 0.74, 0.14],
syl: 0.140, gap: 0.160, step: [0, 3, 5],
vib: 5.6, vibD: 20, peak: 0.30
},
churup: {
f0: 336, type: 'sawtooth', det: 11,
vow: [[350, 2100, 3050], [400, 2320, 3180]],
fg: [0.66, 0.94, 0.30],
syl: 0.128, gap: 0.150, step: [0, 3, 5],
vib: 5.2, vibD: 16, peak: 0.24
}
};
function voiceSyllable(t0, C, f0, vFrom, vTo, dur, peak, vibD) {
if (!actx) return;
try {
var i;
var glot = actx.createGain();          // 성문 진폭(모든 오실레이터의 합류점)
glot.gain.value = 1;
var oscs = [], lfo = null, lfoG = null;
for (i = 0; i < 2; i++) {
var o = actx.createOscillator();
o.type = C.type;
o.frequency.setValueAtTime(Math.max(40, f0), t0);
o.frequency.exponentialRampToValueAtTime(Math.max(40, f0 * 1.035), t0 + dur * 0.9);
try { o.detune.setValueAtTime(i === 0 ? 0 : C.det, t0); } catch (e) {}
o.connect(glot);
oscs.push(o);
}
if (vibD > 0) {
lfo = actx.createOscillator();
lfo.type = 'sine';
lfo.frequency.setValueAtTime(C.vib, t0);
lfoG = actx.createGain();
lfoG.gain.setValueAtTime(vibD, t0);
lfo.connect(lfoG);
for (i = 0; i < oscs.length; i++) {
try { lfoG.connect(oscs[i].detune); } catch (e) {}
}
lfo.start(t0);
lfo.stop(t0 + dur + 0.05);
}
var env = actx.createGain();
env.gain.setValueAtTime(0.0001, t0);
env.gain.linearRampToValueAtTime(Math.max(0.0002, peak), t0 + dur * 0.20);
env.gain.setValueAtTime(Math.max(0.0002, peak), t0 + dur * 0.58);
env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
env.connect(master);
var a = C.vow[vFrom], b = C.vow[vTo];
var made = [];
for (i = 0; i < 3; i++) {
var bp = actx.createBiquadFilter();
bp.type = 'bandpass';
try { bp.Q.value = i === 0 ? 7.5 : (i === 1 ? 9.5 : 6.0); } catch (e) {}
bp.frequency.setValueAtTime(a[i], t0);
if (b[i] !== a[i]) bp.frequency.linearRampToValueAtTime(b[i], t0 + dur * 0.85);
var fg = actx.createGain();
fg.gain.value = C.fg[i];
glot.connect(bp); bp.connect(fg); fg.connect(env);
made.push(bp); made.push(fg);
}
for (i = 0; i < oscs.length; i++) { oscs[i].start(t0); oscs[i].stop(t0 + dur + 0.05); }
oscs[0].onended = function () {
try {
for (var k = 0; k < oscs.length; k++) oscs[k].disconnect();
for (k = 0; k < made.length; k++) made[k].disconnect();
glot.disconnect(); env.disconnect();
if (lfo) lfo.disconnect();
if (lfoG) lfoG.disconnect();
} catch (e) {}
};
} catch (e) { /* 조용히 무시 */ }
}
var SFX = {
select: function (value) {
if (!gate('select')) return;
var v = clamp(value | 0 || 1, 1, 9);
var f = 520 * Math.pow(2, (v - 1) / 12);
jellyDrop(at(), f, 0.115, 0.085, 0.66);
},
match: function (comboLevel) {
setComboLatch(comboLevel);
if (!gate('match')) return;
if (playSfxClip('match-pop', at(), MATCH_PEAK,
clamp(((comboLevel | 0) || 1), 1, 8) - 1)) return;
var raw = (comboLevel | 0) || 1;
var lv = clamp(raw, 1, 8);         // 피치·기본 두께는 8에서 포화 (대역 보호)
var tr = comboTier(raw);           // 그 위는 티어가 이어받는다
var t0 = at();
var drops = lv >= 7 ? 4 : (lv >= 5 ? 3 : (lv >= 3 ? 2 : 1));
if (tr >= 2) drops++;
if (drops > 5) drops = 5;                    // 5알 넘어가면 방울이 아니라 진창이다
jellyDrop(t0, JELLY_ROOT, MATCH_PEAK, 0.135 + lv * 0.004, 0.44);
for (var i = 1; i < drops; i++) {
var df = JELLY_ROOT * Math.pow(2, JELLY_STACK[i] / 12);
jellyDrop(t0 + 0.009 * i + rand(0, 0.007), df,
MATCH_PEAK * (0.40 / Math.sqrt(i)), 0.115 + i * 0.016, 0.50);
}
noise(t0 + 0.003, 0.040 + lv * 0.005 + tr * 0.006,
0.026 + lv * 0.003 + tr * 0.005,
'bandpass', 880, 2400 + lv * 120, 0.85, 0.008);
if (lv >= 3) {
tone('sine', 168 - lv * 5 - tr * 5, 58, t0 + 0.004, 0.085 + tr * 0.010, 0.070, 0.010);
}
},
tierUp: function (tier) {
if (!gate('tierUp')) return;
if (playSfxClip('combo-tier', at(), MATCH_PEAK * 0.55)) return;   // 14차: 파일 클립 우선
var tr = clamp((tier | 0) || 1, 1, 4);
var t0 = at();
var f = JELLY_ROOT;
tone('sine', f * 1.5, f * 1.5, t0, 0.42 + tr * 0.03, 0.062, 0.030);
tone('sine', f * 1.5 * 2.76, f * 1.5 * 2.76, t0, 0.22, 0.016, 0.026);
var arp = [0, 4, 7, 12, 16];
var an = Math.min(arp.length, 2 + tr);
for (var ai = 0; ai < an; ai++) {
var afq = f * Math.pow(2, arp[ai] / 12);
if (afq > 4800) continue;
jellyDrop(t0 + 0.03 + ai * 0.052, afq, 0.055, 0.13, 0.62);
}
noise(t0 + 0.02, 0.34, 0.024, 'highpass', 3400, 8200, 0.6, 0.040);
tone('sine', 146 - tr * 12, 52, t0, 0.20 + tr * 0.02, 0.085, 0.014);
},
cheer: function (tier) {
if (!gate('cheer')) return;
var k = clamp(tier | 0, 0, 3);
var t0 = at() + (k === 0 ? 0.45 : 0.10);
if (k === 0) {
tone('triangle', 392.00, 349.23, t0, 0.16, 0.048, 0.008);
tone('triangle', 293.66, 246.94, t0 + 0.15, 0.30, 0.042, 0.010);
tone('sine', 146.83, 130.81, t0 + 0.15, 0.26, 0.020, 0.010);
return;
}
var base = 587.33 * Math.pow(2, (k - 1) * 2 / 12);      // D5 / E5 / F#5
var seq  = k >= 3 ? [0, 4, 7, 12] : (k >= 2 ? [0, 5, 9] : [0, 7]);
var pk   = 0.043 + k * 0.016;                            // 0.059 / 0.075 / 0.091
for (var i = 0; i < seq.length; i++) {
var f = base * Math.pow(2, seq[i] / 12);
tone('triangle', f, f * 1.02, t0 + i * 0.051, 0.075, pk, 0.004);
tone('sine', f * 2, f * 2, t0 + i * 0.051, 0.042, pk * 0.34, 0.003);
}
},
fail: function () {
if (!gate('fail')) return;
var t0 = at();
tone('sine', 168, 104, t0, 0.20, 0.10, 0.010);
tone('triangle', 84, 62, t0, 0.16, 0.055, 0.012);
},
rowClear: function () {
if (!gate('rowClear')) return;
if (feverActive) duck(320);
var t0 = at();
noise(t0, 0.36, 0.13, 'bandpass', 420, 6400, 0.9, 0.02);
noise(t0 + 0.02, 0.24, 0.05, 'highpass', 2200, 5200, 0.7, 0.015);
var b = 987.77;                              // B5 벨
tone('sine', b, b, t0 + 0.10, 0.70, 0.13, 0.004);
tone('sine', b * 2, b * 2, t0 + 0.10, 0.42, 0.045, 0.004);
tone('sine', b * 3.01, b * 3.01, t0 + 0.10, 0.26, 0.018, 0.004);
},
combo: function (level) {
setComboLatch(level);                        // 게이트보다 먼저 — 연출 레벨은 항상 갱신
if (!gate('combo')) return;
var raw = (level | 0) || 1;
var lv = clamp(raw, 1, 8);
var tr = comboTier(raw);
var t0 = at();
var f0  = JELLY_ROOT * 0.5;
var dur = 0.17 + lv * 0.012 + tr * 0.010;
var stack  = [0, -7, -12];
var voices = tr >= 2 ? 3 : (lv >= 5 ? 2 : 1);
var vg = 0.100 / Math.sqrt(voices);
for (var i = 0; i < voices; i++) {
var vf = f0 * Math.pow(2, stack[i] / 12);
tone('sine', vf, vf * 0.72, t0 + i * 0.012,
dur - i * 0.02, vg * (1 - i * 0.18), dur * 0.20);
}
noise(t0 + 0.006, 0.09 + lv * 0.010 + tr * 0.012, 0.020 + tr * 0.005,
'bandpass', 620, 1500 + tr * 260, 0.7, 0.012);
},
voice: function (charId, tier, pri, nSyl) {
if (!soundOn || !actx || !master) return;
if (hidden()) return;
var C = VOICE_CHARS[charId] || VOICE_CHARS.ten;
var k = clamp((tier | 0) || 1, 1, 6);
var e = k - 1;                                        // 흥분도 0..5
var t0   = at() + 0.12;                               // 사건 → 반응 순서
var evt = !!pri;
if (at() < voiceBusyUntil) {
if (!evt) return;             // 콤보 추임새는 종전대로 조용히 포기
var wait = voiceBusyUntil + 0.05;
if (wait - at() > 0.50) return;
t0 = wait;
} else if (!gate('voice')) {
if (!evt) return;
}
var f0   = C.f0 * Math.pow(2, e * 1.7 / 12);
var syl  = C.syl * (1 - e * 0.045);                   // 흥분하면 말이 빨라진다
var gap  = C.gap * (1 - e * 0.050);
var peak = C.peak * (1 + e * 0.055) * VOICE_GAIN;
var vibD = C.vibD * (1 + e * 0.26);
var n    = (nSyl | 0) > 0 ? Math.min(nSyl | 0, 8) : (k <= 1 ? 2 : 3);   // 음절 수 — 스킬 외침은 이름 글자 수(74 T2)
var clip = voiceClipUrl(charId, k);
if (clip && playVoiceClip(clip, t0, MATCH_PEAK * 0.63)) { bgmDuck(400); return; }
bgmDuck(400);
for (var i = 0; i < n; i++) {
var st = C.step[Math.min(i, C.step.length - 1)];
var sf = f0 * Math.pow(2, st / 12);
var last = (i === n - 1);
var vTo = last && k >= 5 ? 1 : (last ? 1 : 0);
voiceSyllable(t0 + i * gap, C, last && k >= 5 ? sf * 1.06 : sf,
i === 0 ? 0 : 1, vTo, syl, peak, vibD);
}
var total = (n - 1) * gap + syl;
if (k >= 5) {
noise(t0 + total * 0.92, 0.075, 0.022, 'bandpass', 2400, 4200, 1.4, 0.012);
}
voiceBusyUntil = t0 + total + 0.06;
},
deal: function (i) {
if (!gate('deal')) return;
var n = (i | 0) || 0;
var f = 1800 + (n % 6) * 130;
var t0 = at();
noise(t0, 0.035, 0.10, 'bandpass', f, f * 0.72, 1.6, 0.002);
tone('triangle', 240 + (n % 4) * 18, 180, t0, 0.045, 0.035, 0.002);
},
win: function () {
if (!gate('win')) return;
if (playSfxClip('win-stinger', at(), MATCH_PEAK * 0.70)) return;  // 14차: 파일 클립 우선
var t0 = at();
var arp = [523.25, 659.25, 783.99];          // C5 E5 G5
for (var i = 0; i < 3; i++) {
tone('triangle', arp[i], arp[i], t0 + i * 0.085, 0.22, 0.15, 0.005);
tone('sine', arp[i] * 2, arp[i] * 2, t0 + i * 0.085, 0.14, 0.045, 0.004);
}
var ct = t0 + 0.30;
var chord = [523.25, 659.25, 783.99, 1046.5];
for (var j = 0; j < 4; j++) {
tone('triangle', chord[j], chord[j], ct, 0.95, 0.11, 0.010);
tone('sine', chord[j] * 2, chord[j] * 2, ct, 0.55, 0.028, 0.010);
}
noise(ct, 0.5, 0.035, 'highpass', 3000, 7000, 0.7, 0.02);
},
lose: function () {
if (!gate('lose')) return;
if (playSfxClip('lose-stinger', at(), MATCH_PEAK * 0.75)) return; // 14차: 파일 클립 우선
var t0 = at();
var notes = [392.0, 311.13, 233.08];         // G4 - Eb4 - Bb3
for (var i = 0; i < 3; i++) {
tone('triangle', notes[i], notes[i] * 0.985, t0 + i * 0.16, 0.30, 0.11, 0.010);
tone('sine', notes[i] * 0.5, notes[i] * 0.5, t0 + i * 0.16, 0.24, 0.04, 0.012);
}
},
ui: function () {
if (!gate('ui')) return;
if (playSfxClip('ui-button', at(), MATCH_PEAK * 0.30)) return;    // 14차: 파일 클립 우선
var t0 = at();
tone('triangle', 660, 620, t0, 0.055, 0.11, 0.003);
noise(t0, 0.022, 0.05, 'highpass', 2600, 3400, 0.8, 0.002);
},
feverOn: function () {
if (!gate('feverOn')) return;
var t0 = at();
if (feverVoice && t0 < feverBusyUntil) return;   // 이미 울리는 중 → 무시
var dur = 1.20;
try {
var lp = actx.createBiquadFilter();
lp.type = 'lowpass';
try { lp.Q.value = 5; } catch (e) {}
lp.frequency.setValueAtTime(320, t0);
lp.frequency.exponentialRampToValueAtTime(7000, t0 + dur);
var g = actx.createGain();
g.gain.setValueAtTime(0.0001, t0);
g.gain.exponentialRampToValueAtTime(0.15, t0 + dur * 0.88);   // 서서히 차오름
g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur + 0.12);
lp.connect(g); g.connect(master);
var oscs = [];
var specs = [['sawtooth', 110, 880], ['sawtooth', 55, 440]];
for (var i = 0; i < specs.length; i++) {
var o = actx.createOscillator();
o.type = specs[i][0];
o.frequency.setValueAtTime(specs[i][1], t0);
o.frequency.exponentialRampToValueAtTime(specs[i][2], t0 + dur);
o.connect(lp);
o.start(t0);
o.stop(t0 + dur + 0.20);
oscs.push(o);
}
feverVoice = { g: g, oscs: oscs };
feverBusyUntil = t0 + dur + 0.20;
oscs[0].onended = function () {
feverVoice = null;
try { lp.disconnect(); g.disconnect(); } catch (e) {}
for (var k = 0; k < oscs.length; k++) { try { oscs[k].disconnect(); } catch (e) {} }
};
} catch (e) { feverVoice = null; }
noise(t0, dur, 0.055, 'bandpass', 400, 9000, 1.1, dur * 0.86);
var ct = t0 + dur;
tone('triangle', 1046.50, 1046.50, ct, 0.50, 0.13, 0.004);
tone('triangle', 1318.51, 1318.51, ct, 0.50, 0.09, 0.004);
tone('sine',     2093.00, 2093.00, ct, 0.30, 0.045, 0.004);
noise(ct, 0.34, 0.045, 'highpass', 3200, 8200, 0.7, 0.006);
},
feverOff: function () {
feverActive = false;
bgmFever    = false;
bgmApplyMix();                  // BGM 필터를 다시 어둡게 (게이트 통과 여부와 무관하게 상태는 맞춘다)
if (!gate('feverOff')) return;
if (feverVoice) stopFeverRiser(0.06);
var t0 = at();
tone('triangle', 660, 300, t0, 0.30, 0.12, 0.006);
tone('sine',     330, 150, t0, 0.34, 0.065, 0.009);
noise(t0, 0.22, 0.045, 'bandpass', 4200, 520, 1.0, 0.006);
},
bomb: function () {
if (!gate('bomb')) return;
var t0 = at();
tone('sine',     120, 38, t0, 0.46, 0.30, 0.004);   // 서브 임팩트
tone('triangle',  90, 30, t0, 0.34, 0.14, 0.005);   // 바디
noise(t0, 0.40, 0.15, 'lowpass', 900, 90, 0.8, 0.002);
noise(t0, 0.08, 0.055, 'highpass', 4800, 1600, 0.7, 0.001);  // 짧은 크랙
},
spBlast: function () {
if (!gate('spBlast')) return;
var t0 = at();
tone('sawtooth', 220, 1760, t0, 0.32, 0.070, 0.020);
tone('sine',     110,  880, t0, 0.32, 0.052, 0.024);
noise(t0, 0.30, 0.050, 'bandpass', 700, 6200, 0.9, 0.030);
tone('sine',     150, 44, t0 + 0.28, 0.36, 0.270, 0.003);
tone('triangle',  96, 34, t0 + 0.28, 0.26, 0.115, 0.004);
noise(t0 + 0.28, 0.09, 0.058, 'highpass', 5200, 1800, 0.7, 0.001);
tone('sine', 293.66, 293.66, t0 + 0.30, 0.40, 0.042, 0.010);
},
awakenMax: function () {
if (!gate('awakenMax')) return;
var t0 = at();
tone('triangle', 329.63, 2093.00, t0, 0.52, 0.086, 0.026);
tone('sine', 494.44, 3139.50, t0, 0.52, 0.048, 0.030);
var tri = [1046.50, 1318.51, 1567.98];
for (var i = 0; i < 3; i++) {
var st = t0 + 0.46 + i * 0.040;
tone('triangle', tri[i], tri[i], st, 0.46, 0.105, 0.006);
tone('sine', tri[i] * 2, tri[i] * 2, st, 0.28, 0.030, 0.006);
}
tone('sine', 2093.00, 2093.00, t0 + 0.50, 0.30, 0.036, 0.004);
noise(t0 + 0.44, 0.26, 0.026, 'highpass', 4200, 9000, 0.7, 0.040);
tone('sine', 261.63, 261.63, t0 + 0.48, 0.42, 0.038, 0.012);
},
petBell: function () {
if (!gate('petBell')) return;
var t0 = at();
var arp = [1318.51, 1661.22, 1975.53, 2637.02];
for (var i = 0; i < 4; i++) {
var f = arp[i], st = t0 + i * 0.048;
tone('sine', f,        f,        st, 0.32, 0.078, 0.006);
tone('sine', f * 2.76, f * 2.76, st, 0.14, 0.013, 0.006);   // 비정수 배음 = 종
}
jellyDrop(t0 + 0.02, 659.26, 0.068, 0.16, 0.58);
noise(t0 + 0.03, 0.22, 0.019, 'highpass', 4800, 9000, 0.6, 0.030);
},
foeStab: function () {
if (!gate('foeStab')) return;
var t0 = at();
tone('sawtooth', 138, 58, t0, 0.22, 0.110, 0.004);
tone('square',    69, 29, t0, 0.26, 0.066, 0.006);
tone('sine',      46, 30, t0, 0.34, 0.135, 0.008);
noise(t0,        0.18, 0.052, 'lowpass',  1400, 220, 0.9, 0.002);
noise(t0 + 0.02, 0.06, 0.028, 'highpass', 3600, 1400, 0.7, 0.001);
},
gold: function () {
if (!gate('gold')) return;
if (playSfxClip('golden-fruit', at(), MATCH_PEAK * 0.70)) return; // 14차: 파일 클립 우선
var t0 = at();
var arp = [1046.50, 1318.51, 1567.98, 2093.00];
for (var i = 0; i < 4; i++) {
var f  = arp[i];
var st = t0 + i * 0.055;
tone('sine', f,        f,        st, 0.46, 0.105, 0.003);
tone('sine', f * 2,    f * 2,    st, 0.24, 0.030, 0.003);
tone('sine', f * 3.01, f * 3.01, st, 0.14, 0.014, 0.003);
}
noise(t0 + 0.03, 0.34, 0.030, 'highpass', 5200, 9500, 0.6, 0.02);
},
ice: function () {
if (!gate('ice')) return;
var t0 = at();
noise(t0, 0.14, 0.105, 'highpass', 6200, 2400, 0.8, 0.001);
noise(t0 + 0.01, 0.09, 0.050, 'bandpass', 3200, 900, 1.4, 0.001);
tone('sine', 2637.02, 2637.02, t0 + 0.005, 0.22, 0.045, 0.002);   // E7
tone('sine', 3520.00, 3520.00, t0 + 0.005, 0.16, 0.030, 0.002);   // A7
tone('triangle', 1975.53, 1900, t0, 0.06, 0.035, 0.002);          // 틱
},
mission: function () {
if (!gate('mission')) return;
var t0 = at();
var n = [783.99, 987.77, 1174.66];                  // G5 - B5 - D6
for (var i = 0; i < 3; i++) {
var st = t0 + i * 0.085;
tone('triangle', n[i],     n[i],     st, 0.24, 0.140, 0.004);
tone('sine',     n[i] * 2, n[i] * 2, st, 0.15, 0.042, 0.004);
}
var ct = t0 + 0.27;
tone('triangle', 1567.98, 1567.98, ct, 0.55, 0.075, 0.008);       // G6
tone('sine',      391.99,  391.99, ct, 0.55, 0.045, 0.010);       // G4 받침
},
heartbeat: function () {
if (!gate('heartbeat')) return;
var t0 = at();
tone('sine', 62, 40, t0, 0.13, 0.26, 0.006);
noise(t0, 0.07, 0.035, 'lowpass', 220, 80, 0.7, 0.003);
tone('sine', 55, 34, t0 + 0.20, 0.16, 0.185, 0.007);
noise(t0 + 0.20, 0.08, 0.026, 'lowpass', 200, 70, 0.7, 0.003);
},
grade: function (rank) {
if (!gate('grade')) return;
var r = String(rank || 'C').toUpperCase().charAt(0);
var t0 = at();
var C5 = 523.25, E5 = 659.25, G5 = 783.99, C6 = 1046.50,
E6 = 1318.51, G6 = 1567.98, C3 = 130.81;
var run, gap, peak, i, st, f;
if      (r === 'S') { run = [C5, E5, G5, C6, E6]; gap = 0.075; peak = 0.150; }
else if (r === 'A') { run = [C5, E5, G5, C6];     gap = 0.085; peak = 0.135; }
else if (r === 'B') { run = [C5, E5, G5];         gap = 0.095; peak = 0.120; }
else                { run = [C5, E5];             gap = 0.110; peak = 0.100; }
for (i = 0; i < run.length; i++) {
f = run[i]; st = t0 + i * gap;
tone('triangle', f, f, st, 0.22, peak, 0.005);
tone('sine', f * 2, f * 2, st, 0.13, peak * 0.28, 0.004);
}
var ct = t0 + run.length * gap + 0.03;
if (r === 'S') {
var chS = [C5, E5, G5, C6, G6];
for (i = 0; i < chS.length; i++) {
tone('triangle', chS[i], chS[i], ct, 1.20, 0.090, 0.012);
tone('sine', chS[i] * 2, chS[i] * 2, ct, 0.65, 0.024, 0.012);
}
tone('sine', C3, C3, ct, 0.90, 0.130, 0.010);                  // 무게감
noise(ct, 0.70, 0.045, 'highpass', 3000, 9500, 0.6, 0.05);
noise(ct + 0.18, 0.55, 0.028, 'highpass', 5000, 11000, 0.6, 0.10);
} else if (r === 'A') {
var chA = [C5, E5, G5, C6];
for (i = 0; i < chA.length; i++) {
tone('triangle', chA[i], chA[i], ct, 0.75, 0.075, 0.012);
tone('sine', chA[i] * 2, chA[i] * 2, ct, 0.40, 0.020, 0.012);
}
noise(ct, 0.45, 0.032, 'highpass', 3200, 8000, 0.6, 0.04);
}
},
milestone: function () {
if (!gate('milestone')) return;
var t0 = at();
var n = [880.00, 1108.73, 1318.51];                 // A5 - C#6 - E6
for (var i = 0; i < 3; i++) {
var st = t0 + i * 0.05;
tone('triangle', n[i], n[i], st, 0.18, 0.130, 0.004);
}
var bt = t0 + 0.17;
tone('sine', 1760.00, 1760.00, bt, 0.85, 0.100, 0.004);          // A6 벨
tone('sine', 3520.00, 3520.00, bt, 0.40, 0.026, 0.004);
tone('sine', 5297.00, 5297.00, bt, 0.22, 0.011, 0.004);
tone('sine',  440.00,  440.00, bt, 0.70, 0.045, 0.010);          // A4 받침
noise(bt, 0.50, 0.035, 'highpass', 2500, 9000, 0.6, 0.06);
},
jackpot: function () {
if (!gate('jackpot')) return;
var t0 = at();
tone('triangle',  520, 1180, t0,         0.055, 0.150, 0.002);
tone('triangle', 1180,  760, t0 + 0.055, 0.070, 0.110, 0.002);
tone('triangle',  760,  980, t0 + 0.125, 0.060, 0.060, 0.002);
tone('triangle',  980,  880, t0 + 0.185, 0.075, 0.032, 0.002);
var arp = [1318.51, 1661.22, 1975.53];                 // E6 - G#6 - B6
for (var i = 0; i < 3; i++) {
var st = t0 + 0.10 + i * 0.058;
tone('triangle', arp[i], arp[i], st, 0.20, 0.105, 0.004);
tone('sine', arp[i] * 2, arp[i] * 2, st, 0.12, 0.028, 0.004);
}
var bt = t0 + 0.30;
tone('sine', 2637.02, 2637.02, bt, 0.55, 0.085, 0.004);   // E7
tone('sine',  659.25,  659.25, bt, 0.60, 0.050, 0.008);   // E5 받침
noise(bt, 0.34, 0.030, 'highpass', 3600, 9000, 0.6, 0.03);
tone('sine', 150, 96, t0, 0.16, 0.075, 0.003);
},
hurry: function () {
if (!soundOn || !actx || !master) return;
var t0 = at();
tone('sine', 180, 52, t0, 0.42, 0.30, 0.002);
tone('sine',  90, 44, t0, 0.55, 0.16, 0.004);
tone('triangle', 220.00, 146.83, t0 + 0.02, 0.34, 0.115, 0.004);
tone('triangle', 329.63, 220.00, t0 + 0.02, 0.34, 0.085, 0.004);
noise(t0, 0.30, 0.085, 'bandpass', 2600, 420, 0.55, 0.003);
noise(t0 + 0.16, 0.36, 0.030, 'highpass', 2400, 6200, 0.6, 0.02);
},
cry: function () {
if (!soundOn || !actx || !master) return;
if (at() < voiceBusyUntil) return;
var C = VOICE_CHARS.jelly;
var t0 = at() + 0.04;
var f0 = C.f0 * 0.88;                  // 평소보다 낮게 시작한다(기운이 없다)
var syl = 0.115, gap = 0.150;
var down = [0, -2, -4];                // 음절마다 내려간다
for (var i = 0; i < 3; i++) {
var last = (i === 2);
var sf = f0 * Math.pow(2, down[i] / 12);
voiceSyllable(t0 + i * gap, C, last ? sf * 0.94 : sf,
last ? 1 : 0, last ? 0 : 1,
last ? syl * 1.5 : syl, C.peak * 0.82 * VOICE_GAIN, 34);
}
noise(t0 + 3 * gap + 0.04, 0.11, 0.020, 'bandpass', 1800, 3400, 1.6, 0.05);
voiceBusyUntil = t0 + 3 * gap + syl * 1.5 + 0.10;
},
timestop: function () {
if (!gate('timestop')) return;
playSfxClip('timestop', at(), MATCH_PEAK * 0.75);
},
timestopRelease: function () {
if (!gate('timestopRelease')) return;
playSfxClip('timestop-release', at(), MATCH_PEAK * 0.75);
},
inkShot: function () {
if (!gate('inkShot')) return;
playSfxClip('ink-shot', at(), MATCH_PEAK * 0.75);
},
inkSplat: function () {
if (!gate('inkSplat')) return;
playSfxClip('ink-splat', at(), MATCH_PEAK * 0.75);
},
bossShuffle: function () {
if (!gate('bossShuffle')) return;
playSfxClip('boss-shuffle', at(), MATCH_PEAK * 0.75);
},
bossSticky: function () {
if (!gate('bossSticky')) return;
playSfxClip('boss-sticky', at(), MATCH_PEAK * 0.75);
},
bossDrain: function () {
if (!gate('bossDrain')) return;
playSfxClip('boss-drain', at(), MATCH_PEAK * 0.75);
},
bossEggcrack: function () {
if (!gate('bossEggcrack')) return;
playSfxClip('boss-eggcrack', at(), MATCH_PEAK * 0.75);
},
bossHitChip: function () {
if (!gate('bossHitChip')) return;
playSfxClip('boss-hit-chip', at(), MATCH_PEAK * 0.75);
},
bossHitBig: function () {
if (!gate('bossHitBig')) return;
playSfxClip('boss-hit-big', at(), MATCH_PEAK * 0.75);
},
starGet: function (n) {
if (!gate('starGet')) return;
playSfxClip('star-get', at(), MATCH_PEAK * 0.70, clamp(n | 0, 0, 2));
},
uiPanel: function (close) {
if (!gate('uiPanel')) return;
if (playSfxClip('ui-panel', at(), MATCH_PEAK * 0.75,
close ? 'close' : undefined)) return;
SFX.ui();
},
confirmPop: function () {
if (!gate('confirmPop')) return;
if (playSfxClip('confirm-pop', at(), MATCH_PEAK * 0.70)) return;
SFX.match(1);          // 1 = 콤보 없는 단발. game.js 튜토리얼과 같은 호출 형태다.
},
missionFail: function () {
if (!gate('missionFail')) return;
if (playSfxClip('mission-fail', at(), MATCH_PEAK * 0.75)) return;
SFX.fail();
},
reward: function (step) {
if (!gate('reward')) return;
var n = clamp(step | 0, 0, 5);
var t0 = at();
var f  = 1108.73 * Math.pow(2, (n * 2) / 12);        // C#6 에서 2반음씩
tone('triangle', f, f, t0, 0.16, 0.105, 0.004);
tone('sine', f * 2, f * 2, t0, 0.10, 0.030, 0.004);
var bt = t0 + 0.055;
tone('sine', f * 1.5, f * 1.5, bt, 0.46, 0.062, 0.005);
tone('sine', f * 0.5, f * 0.5, bt, 0.40, 0.036, 0.010);
noise(bt, 0.26, 0.022, 'highpass', 3000, 8600, 0.6, 0.03);
}
};
function duck(ms) {
if (!soundOn || !actx || !master) return;
try {
var d = (typeof ms === 'number' && isFinite(ms)) ? ms : 240;
d = clamp(d, 40, 2000) / 1000;
var t   = at();
var end = t + d;
if (end < duckUntil) end = duckUntil;      // 진행 중인 더 긴 덕킹 우선
duckUntil = end;
var cur = master.gain.value;
master.gain.cancelScheduledValues(t);
master.gain.setValueAtTime(Math.max(0.0001, cur), t);
master.gain.linearRampToValueAtTime(MASTER_BASE * 0.5, t + 0.03);
master.gain.setValueAtTime(MASTER_BASE * 0.5, end);
master.gain.linearRampToValueAtTime(MASTER_BASE, end + 0.12);
} catch (e) { /* 조용히 무시 */ }
}
var BGM_DUCK = 0.708;      // -3.0 dB
var bgmDuckUntil = 0;
function bgmDuck(ms) {
if (!soundOn || !actx) return;
var d = clamp((typeof ms === 'number' && isFinite(ms)) ? ms : 400, 60, 1200) / 1000;
var t = at(), end = t + d;
if (end < bgmDuckUntil) end = bgmDuckUntil;
bgmDuckUntil = end;
if (bgmGain && bgmRunning) duckBus(bgmGain.gain, BGM_GAIN, t, end);
trkAll(function (T) {
if (T.gain && T.running) duckBus(T.gain.gain, T.level, t, end);
});
}
function duckBus(g, base, t, end) {
try {
var cur = Math.max(0.0001, g.value);
g.cancelScheduledValues(t);
g.setValueAtTime(cur, t);
g.linearRampToValueAtTime(base * BGM_DUCK, t + 0.06);
g.setValueAtTime(base * BGM_DUCK, end);
g.linearRampToValueAtTime(base, end + 0.18);
} catch (e) { /* 조용히 무시 */ }
}
var MAIN_PEAK_T = MATCH_PEAK * 0.3162;   // -10 dB (피크 상한)
var MAIN_RMS_T  = MATCH_PEAK * 0.1000;   // -20 dB (체감 크기 상한)
var MAIN_SIL    = 0.003;                 // 무음 판정 진폭 (§F)
var MAIN_SIL_MS = 20;                    // 이 길이 이상 이어져야 무음으로 친다
var MAIN_FADE   = 0.6;                   // 크로스페이드 (§F)
var MAIN_FADE_IN = 0.5;                  // 시작 페이드인 (14차 #35)
function trkNew(key) {
return {
key: key,
buf: null,          // 디코드된 AudioBuffer
src: null,          // 재생 중인 소스 노드
gain: null,         // 전용 버스 (master 로 간다)
level: 0,           // 이 곡에 맞춰 계산된 평시 게인
loopA: 0, loopB: 0, // 무음을 걷어 낸 루프 지점 (초)
running: false,     // 실제로 울리는 중
wanted: false,      // 게임이 원하는 상태 (탭 복귀·음소거 해제용)
state: 'idle',
report: null        // 디코드 측정 결과 (보고·검증용)
};
}
var MAIN = trkNew('main');            // 로비(메뉴·지도·스토리) — 낮
var MAIN_NIGHT = trkNew('mainNight'); // 같은 자리의 밤 곡
var lobbyNight = false;
var lobbyScene = false;   // 지금 화면이 로비인가 (그 자리에서 갈아 끼울지 판단)
var ING_KEYS = ['ingame1', 'ingame2'];
var ING = [];                       // 임베드된 인게임 트랙 (0~2개)
var ingBuilt = false;
var ingIdx = -1;                    // 마지막으로 고른 인게임 트랙
var ingCur = null;                  // 지금 판에 깔린 인게임 트랙
var ingScene = false;               // 지금 화면이 판인가 (실패 폴백 판단용)
var ING_PANIC_RATE = 1.12;
var ingRate = 1;
function ingList() {
if (ingBuilt) return ING;
var map = (typeof global !== 'undefined') ? global.TT_AUDIO : null;
if (!map) return ING;              // 아직 안 실렸다 — 다음 호출에서 다시 본다
ingBuilt = true;
for (var i = 0; i < ING_KEYS.length; i++) {
if (map[ING_KEYS[i]]) ING.push(trkNew(ING_KEYS[i]));
}
return ING;
}
function trkAll(fn) {
fn(MAIN); fn(MAIN_NIGHT);
var L = ingList();
for (var i = 0; i < L.length; i++) fn(L[i]);
}
function trkUri(T) {
var map = (typeof global !== 'undefined') ? global.TT_AUDIO : null;
if (map && map[T.key]) return map[T.key];
if (T.key === 'main' && typeof global !== 'undefined' && global.TT_BGM_MAIN) {
return global.TT_BGM_MAIN;
}
return null;
}
function mainBytes(uri) {
try {
var at$ = String(uri).indexOf('base64,');
if (at$ < 0 || typeof atob !== 'function') return null;
var bin = atob(String(uri).slice(at$ + 7));
var n = bin.length, u8 = new Uint8Array(n);
for (var i = 0; i < n; i++) u8[i] = bin.charCodeAt(i) & 255;
return u8.buffer;
} catch (e) { return null; }
}
function mainSrcBytes(uri, cb) {
var u = String(uri);
if (u.indexOf('data:') === 0) { cb(mainBytes(u)); return; }
try {
if (global.location && global.location.protocol === 'file:') { cb(null); return; }
} catch (e0) {}
var fired = false;
var once = function (ab) { if (fired) return; fired = true; try { cb(ab); } catch (e0) {} };
try {
if (typeof fetch === 'function') {
fetch(u, { credentials: 'omit', priority: (global.__twWarmLow ? 'low' : 'auto') }).then(function (r) {
if (!r || !r.ok) { once(null); return null; }
return r.arrayBuffer();
}).then(function (ab) { if (ab) once(ab); }, function () { once(null); });
return;
}
} catch (e1) { /* fetch 자체가 던지면 XHR 로 */ }
try {
var x = new XMLHttpRequest();
x.open('GET', u, true);
x.responseType = 'arraybuffer';
x.onload = function () {
var ok = (x.status === 0 || (x.status >= 200 && x.status < 300));
once(ok ? x.response : null);
};
x.onerror = function () { once(null); };
x.onabort = function () { once(null); };
x.send();
} catch (e2) { once(null); }
}
function mainScanAsync(buf, cb) {
var ch = Math.min(2, buf.numberOfChannels), n = buf.length;
var L = buf.getChannelData(0);
var R = ch > 1 ? buf.getChannelData(1) : null;
var run = Math.max(1, Math.round(buf.sampleRate * MAIN_SIL_MS / 1000));
var CHUNK = 65536, peak = 0, sum = 0, i = 0, a = -1, b = -1;
function pass1() {
var end = Math.min(n, i + CHUNK), v, w;
for (; i < end; i++) {
v = L[i]; if (v < 0) v = -v;
if (R) { w = R[i]; if (w < 0) w = -w; if (w > v) v = w; }
if (v > peak) peak = v;
sum += v * v;
}
if (i < n) { setTimeout(pass1, 0); return; }
i = 0; setTimeout(pass2, 0);
}
function pass2() {
var end = Math.min(n, i + CHUNK), v, w2;
for (; i < end; i++) {
v = L[i]; if (v < 0) v = -v;
if (R) { w2 = R[i]; if (w2 < 0) w2 = -w2; if (w2 > v) v = w2; }
if (v >= MAIN_SIL) { a = i; break; }
}
if (a < 0 && i < n) { setTimeout(pass2, 0); return; }
if (a < 0) a = 0;
if (a < run) a = 0;
i = n - 1; setTimeout(pass3, 0);
}
function pass3() {
var end = Math.max(-1, i - CHUNK), v, w3;
for (; i > end; i--) {
v = L[i]; if (v < 0) v = -v;
if (R) { w3 = R[i]; if (w3 < 0) w3 = -w3; if (w3 > v) v = w3; }
if (v >= MAIN_SIL) { b = i + 1; break; }
}
if (b < 0 && i >= 0) { setTimeout(pass3, 0); return; }
if (b < 0) b = n;
if (n - b < run) b = n;
if (b <= a) { a = 0; b = n; }
cb({ a: a, b: b, peak: peak, rms: Math.sqrt(sum / Math.max(1, n)) });
}
setTimeout(pass1, 0);
}
function mainScan(buf) {
var ch = Math.min(2, buf.numberOfChannels), n = buf.length;
var L = buf.getChannelData(0);
var R = ch > 1 ? buf.getChannelData(1) : null;
var run = Math.max(1, Math.round(buf.sampleRate * MAIN_SIL_MS / 1000));
var peak = 0, sum = 0, i, v;
for (i = 0; i < n; i++) {
v = L[i]; if (v < 0) v = -v;
if (R) { var w = R[i]; if (w < 0) w = -w; if (w > v) v = w; }
if (v > peak) peak = v;
sum += v * v;
}
var a = 0;
for (i = 0; i < n; i++) {
v = L[i]; if (v < 0) v = -v;
if (R) { var w2 = R[i]; if (w2 < 0) w2 = -w2; if (w2 > v) v = w2; }
if (v >= MAIN_SIL) { a = i; break; }
}
if (a < run) a = 0;                      // 앞 무음이 20ms 미만이면 트림하지 않는다
var b = n;
for (i = n - 1; i >= 0; i--) {
v = L[i]; if (v < 0) v = -v;
if (R) { var w3 = R[i]; if (w3 < 0) w3 = -w3; if (w3 > v) v = w3; }
if (v >= MAIN_SIL) { b = i + 1; break; }
}
if (n - b < run) b = n;                  // 뒤 무음이 20ms 미만이면 그대로
if (b <= a) { a = 0; b = n; }            // 통째로 무음인 파일 방어
return { a: a, b: b, peak: peak, rms: Math.sqrt(sum / Math.max(1, n)) };
}
function trkBuild(T) {
if (T.gain) return true;
if (!actx || !master) return false;
try {
T.gain = actx.createGain();
T.gain.gain.value = 0.0001;
T.gain.connect(master);
return true;
} catch (e) { T.gain = null; return false; }
}
function trkFail(T) {
T.state = 'fail';
T.wanted = false;
if (T === MAIN_NIGHT) { if (lobbyScene) mainStart(); return; }
if (T !== MAIN && ingCur === T && ingScene) { ingCur = null; bgmStart(); }
}
function trkLoad(T, then) {
if (T.state === 'ready' || T.state === 'loading') { if (then) then(); return; }
var uri = trkUri(T);
if (!uri) { trkFail(T); return; }
if (!actx) createAudio();
if (!actx) return;
T.state = 'loading';
var done = function (buf) {
mainScanAsync(buf, function (s) { done2(buf, s); });
};
var done2 = function (buf, s) {
try {
T.buf = buf;
T.loopA = s.a / buf.sampleRate;
T.loopB = s.b / buf.sampleRate;
var byPeak = s.peak > 0 ? (MAIN_PEAK_T / s.peak) : 1;
var byRms  = s.rms  > 0 ? (MAIN_RMS_T  / s.rms)  : 1;
T.level = clamp(Math.min(byPeak, byRms), 0.0005, 1);
T.state = 'ready';
T.report = {
sec: buf.duration, hz: buf.sampleRate, ch: buf.numberOfChannels,
headMs: T.loopA * 1000, tailMs: (buf.duration - T.loopB) * 1000,
peak: s.peak, rms: s.rms, gain: T.level,
loopSec: T.loopB - T.loopA
};
try {
if (global.console && console.info) {
console.info('[BGM ' + T.key + '] ' + buf.duration.toFixed(3) + 's · ' +
buf.sampleRate + 'Hz · ' + buf.numberOfChannels + 'ch | 앞 무음 ' +
T.report.headMs.toFixed(1) + 'ms · 뒤 무음 ' + T.report.tailMs.toFixed(1) +
'ms | 루프 ' + T.report.loopSec.toFixed(3) + 's | peak ' +
s.peak.toFixed(4) + ' · RMS ' + s.rms.toFixed(4) + ' → gain ' +
T.level.toFixed(5) + ' (재생 RMS ' + (s.rms * T.level).toFixed(5) + ')');
}
} catch (e2) {}
if (then) then();
if (T.wanted) trkStart(T);
} catch (e3) { trkFail(T); }
};
mainSrcBytes(uri, function (ab) {
if (!ab) { trkFail(T); return; }      // 못 받았다 → 조용히 신스로 (무음 폴백)
var once = false, done1 = function (b) { if (once) return; once = true; done(b); };
var fail1 = function () { if (once) return; once = true; trkFail(T); };
try {
var pr = actx.decodeAudioData(ab, done1, fail1);
if (pr && typeof pr.then === 'function') pr.then(done1, fail1);
} catch (e) { fail1(); }
});
}
function trkStart(T) {
T.wanted = true;
if (!soundOn || hidden()) return;
if (T.running) return;
if (T.state === 'fail') return;
if (!actx) createAudio();
if (!actx || !master) return;
if (T.state !== 'ready') { trkLoad(T); return; }
if (!trkBuild(T)) return;
try {
if (actx.state === 'suspended') {
var pr = actx.resume();
if (pr && typeof pr.catch === 'function') pr.catch(function () {});
}
var s = actx.createBufferSource();
s.buffer = T.buf;
s.loop = true;
s.loopStart = T.loopA;
s.loopEnd = T.loopB;
try {
s.playbackRate.value = (T === MAIN || T === MAIN_NIGHT) ? 1 : ingRate;
} catch (eR) {}
s.connect(T.gain);
var t = at();
T.gain.gain.cancelScheduledValues(t);
T.gain.gain.setValueAtTime(0.0001, t);
T.gain.gain.exponentialRampToValueAtTime(T.level, t + MAIN_FADE_IN);
s.start(t, T.loopA);                   // 앞 패딩을 건너뛰고 첫 소리부터
T.src = s;
T.running = true;
} catch (e) { T.running = false; }
}
function trkStop(T, fadeSec) {
if (!T.running) return;
T.running = false;
var d = (typeof fadeSec === 'number' && fadeSec >= 0) ? fadeSec : MAIN_FADE;
var s = T.src;
T.src = null;
if (!actx || !T.gain) return;
try {
var t = at(), cur = Math.max(0.0001, T.gain.gain.value);
T.gain.gain.cancelScheduledValues(t);
T.gain.gain.setValueAtTime(cur, t);
T.gain.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(0.02, d));
if (s) { try { s.stop(t + Math.max(0.02, d) + 0.05); } catch (e2) {} }
} catch (e) {
if (s) { try { s.stop(); } catch (e3) {} }
}
}
function lobbyTrk() {
if (lobbyNight && MAIN_NIGHT.state !== 'fail' && trkUri(MAIN_NIGHT)) return MAIN_NIGHT;
return MAIN;
}
function mainStart() {
var T = lobbyTrk(), O = (T === MAIN) ? MAIN_NIGHT : MAIN;
if (O.wanted || O.running) { O.wanted = false; trkStop(O, MAIN_FADE); }
trkStart(T);
}
function mainStop(fadeSec) { trkStop(MAIN, fadeSec); trkStop(MAIN_NIGHT, fadeSec); }
var warmDone = false;
function bgmWarm() {
if (warmDone) return;
if (!soundOn) return;                  // 음소거면 데울 이유도, 컨텍스트를 만들 이유도 없다
var T = lobbyTrk();
if (!T || T.state !== 'idle') { warmDone = true; return; }
if (!trkUri(T)) return;                // bgm.js 가 아직 안 실렸다 — 다음 기회에
warmDone = true;
global.__twWarmLow = true;
try { trkLoad(T); } catch (e) { /* 조용히 실패 — 첫 탭 때 예전처럼 로드된다 */ }
finally { global.__twWarmLow = false; }
}
function bgmWarmSchedule() {
if (typeof global === 'undefined' || !global.document) return;
var idle = function () {
try {
if (typeof global.requestIdleCallback === 'function') {
global.requestIdleCallback(bgmWarm, { timeout: 800 });
} else {
global.setTimeout(bgmWarm, 200);
}
} catch (e) { try { global.setTimeout(bgmWarm, 200); } catch (e2) {} }
};
var after = function () { try { global.setTimeout(idle, 1200); } catch (e) { idle(); } };
try {
if (global.document.readyState === 'complete') after();
else global.addEventListener('load', after, { once: true });
} catch (e) { /* 조용히 무시 */ }
}
var sfxWarmDone = false;
var sfxWarmTried = 0;
var SFX_WARM_WAIT = 200;        // 재양보 상한. 넘으면 조용히 포기한다.
function sfxWarmUrls() {
var out = [], seen = {}, k, v;
try {
for (k in SFX_CLIPS) {
if (!Object.prototype.hasOwnProperty.call(SFX_CLIPS, k)) continue;
v = SFX_CLIPS[k];
if (typeof v === 'string' && v && !seen[v]) { seen[v] = 1; out.push(v); }
}
var m = (typeof global !== 'undefined') ? global.TT_SFX : null;   // 지연 조회
if (m) {
for (k in m) {
if (!Object.prototype.hasOwnProperty.call(m, k)) continue;
v = m[k];
if (typeof v === 'string' && v && !seen[v]) { seen[v] = 1; out.push(v); }
}
}
} catch (e) { /* 조용히 — 못 모으면 그냥 안 데운다 */ }
return out;
}
function sfxWarmOne(url) {
if (!actx || !master || !url) return;
if (sfxClipBuf[url]) return;           // 멱등 — 진행 중이든 끝났든 다시 걸지 않는다
try {
sfxClipBuf[url] = 'load';
var ab = mainBytes(url);
if (!ab) { sfxClipBuf[url] = 'bad'; return; }
var done = function (b) {
try { sfxClipBuf[url] = { buf: b, off: sfxHeadOffset(b) }; }
catch (e) { sfxClipBuf[url] = 'bad'; }
};
var bad = function () { sfxClipBuf[url] = 'bad'; };
var once = false, done1 = function (b) { if (once) return; once = true; done(b); };   /* perf-0908: 1회 */
var bad1 = function () { if (once) return; once = true; bad(); };
try {
var pr = actx.decodeAudioData(ab, done1, bad1);
if (pr && typeof pr.then === 'function') pr.then(done1, bad1);   // 콜백형/Promise형 둘 다 — 한 번만 받는다
} catch (e) { sfxClipBuf[url] = 'bad'; }
} catch (e) { try { sfxClipBuf[url] = 'bad'; } catch (e2) {} }
}
function sfxWarmIdle(ms) {
try {
if (typeof global === 'undefined') return;
if (typeof global.requestIdleCallback === 'function') {
global.requestIdleCallback(sfxWarm, { timeout: ms });
} else {
global.setTimeout(sfxWarm, 120);
}
} catch (e) { try { global.setTimeout(sfxWarm, 120); } catch (e2) {} }
}
function sfxWarm() {
if (sfxWarmDone) return;
if (!soundOn) return;                  // 음소거면 데울 이유가 없다
if (!actx) return;                     // 컨텍스트가 아직 없다 — 여기서 만들지 않는다
var T = lobbyTrk();
if (T && T.state !== 'ready' && T.state !== 'fail' && trkUri(T)) {
if (++sfxWarmTried > SFX_WARM_WAIT) { sfxWarmDone = true; return; }
sfxWarmIdle(400);
return;
}
var list = sfxWarmUrls(), i, url;
for (i = 0; i < list.length; i++) {
url = list[i];
if (!sfxClipBuf[url]) {              // 아직 안 데운 첫 놈 하나만
sfxWarmOne(url);
sfxWarmIdle(1000);
return;
}
}
sfxWarmDone = true;                    // 남은 것이 없다 — 끝
}
function sfxWarmSchedule() {
if (typeof global === 'undefined' || !global.document) return;
var idle = function () { sfxWarmIdle(1500); };
try {
if (global.document.readyState === 'complete') idle();
else global.addEventListener('load', idle, { once: true });
} catch (e) { /* 조용히 무시 */ }
}
function lobbyStopAll(fadeSec) {
MAIN.wanted = false; trkStop(MAIN, fadeSec);
MAIN_NIGHT.wanted = false; trkStop(MAIN_NIGHT, fadeSec);
}
function bgmSetNight(v) {
var n = !!v;
if (n === lobbyNight) return;
lobbyNight = n;
if (lobbyScene) mainStart();
}
function ingNext() {
var L = ingList(), n = L.length;
if (!n) return false;
var i, k, T = null;
for (i = 1; i <= n; i++) {
k = (ingIdx + i) % n;
if (L[k].state !== 'fail') { T = L[k]; ingIdx = k; break; }
}
if (!T) return false;
for (i = 0; i < n; i++) {
if (L[i] !== T) { L[i].wanted = false; trkStop(L[i], MAIN_FADE); }
}
ingCur = T;
trkStart(T);
return true;
}
function ingStopAll(fadeSec) {
var L = ingList();
ingCur = null;
for (var i = 0; i < L.length; i++) { L[i].wanted = false; trkStop(L[i], fadeSec); }
}
function ingSetRate(r) {
ingRate = r;
var L = ingList();
for (var i = 0; i < L.length; i++) {
var s = L[i].src;
if (!s || !L[i].running) continue;
try {
if (actx && s.playbackRate.linearRampToValueAtTime) {
var t = at();
s.playbackRate.cancelScheduledValues(t);
s.playbackRate.setValueAtTime(s.playbackRate.value, t);
s.playbackRate.linearRampToValueAtTime(r, t + 0.25);
} else {
s.playbackRate.value = r;
}
} catch (e) { /* 조용히 무시 */ }
}
}
function trkRelease(T) {
if (!T || T.wanted || T.running) return;
if (T.state !== 'ready') return;
T.buf = null; T.state = 'idle'; T.report = null;
}
function trkReleaseLater(list) {
setTimeout(function () {
for (var i = 0; i < list.length; i++) trkRelease(list[i]);
}, (MAIN_FADE + 0.4) * 1000);
}
function bgmScene(which) {
if (which === 'game') {
lobbyScene = false;
lobbyStopAll(MAIN_FADE);
trkReleaseLater([MAIN, MAIN_NIGHT]);            /* perf-0908: 로비 곡 PCM 해제 */
ingScene = true;
if (ingNext() && ingCur) {
bgmWanted = false;
bgmStop();                // 파일이 깔리면 신스는 물러난다
} else {
bgmStart();               // 폴백: 인게임 곡이 없는 빌드 = 9차와 동일
}
} else {
ingScene = false;
lobbyScene = true;
ingStopAll(MAIN_FADE);
trkReleaseLater(ingList());                     /* perf-0908: 인게임 곡 PCM 해제 */
bgmWanted = false;
bgmStop();
mainStart();                // 로비 트랙(낮·밤)의 wanted 는 여기서 켜진다
}
}
function forceMasterGain(v) {
duckUntil = 0;
if (!master) return;
try {
if (actx) {
var t = at();
master.gain.cancelScheduledValues(t);
master.gain.setValueAtTime(v, t);
}
master.gain.value = v;
} catch (e) {
try { master.gain.value = v; } catch (e2) {}
}
}
var BGM_BPM   = 132;
var BGM_BEAT  = 60 / BGM_BPM;          // 0.454545454545455 s
var BGM_STEP  = BGM_BEAT / 4;          // 16분음표 0.113636363636364 s
var BGM_BAR   = 16;                    // 1마디 = 16스텝
var BGM_BARS  = 32;                    // 곡 1회 = 32마디 (A A' B B')
var BGM_LOOP  = BGM_BAR * BGM_BARS;    // 512스텝 = 58.181818 s
var BGM_INTRO_BARS  = 4;
var BGM_INTRO_STEPS = BGM_BAR * BGM_INTRO_BARS;   // 64스텝 = 7.27 s
var BGM_INTRO_CHORD = [0, 3, 2, 1];               // C F Am G — G 로 끝나 A 첫 마디 C 로 풀린다
var BGM_INTRO_MEL   = [1, 2, 20, 21];             // 훅 앞·뒤 → 마무리 → 턴어라운드
var BGM_INTRO_LEAD_W = [1, 1, 0, 0];              // 얇은 12.5% 로 시작해 25% 로 두꺼워진다
var BGM_PANIC_RATE = 1.15;
var BGM_PANIC_HATD = 0.75;   // 패닉 동안 16분 하이햇 게이트 최저 보장치
var BGM_TICK_MS    = 120;   // 스케줄러 주기 (프레임 예산 13.3ms 를 절대 건드리지 않는 크기)
var BGM_HORIZON    = 0.50;  // s — 룩어헤드. 주기의 4배 → 최대 380ms 스톨까지 무손실
var BGM_MAX_STEPS  = 8;     // tick 당 최대 스텝 수 (정상 구간은 1~2, 시작 tick 만 5)
var BGM_MAX_VOICES = 60;    // tick 당 최대 보이스 수 (보이스 1개 = 노드 2개)
var BGM_STEP_COST  = 14;    // 이만큼 안 남으면 스텝을 아예 시작하지 않는다(스텝이 잘리지 않게)
var BGM_GAIN    = 0.060;
var BGM_G_KICK  = 0.78;
var BGM_G_BASS  = 0.52;
var BGM_G_PLUCK = 0.42;
var BGM_G_STAB  = 0.26;    // intensity 게이트 목표 (intensity 0 에서는 0)
var BGM_G_HAT   = 0.26;
var BGM_G_LEAD  = 0.22;    // 피버 카운터 플럭 게이트 목표 (평상시 0)
var BGM_G_HATD  = 1.00;    // 더블타임 하이햇 게이트 목표 (피버 1.00 / intensity3 0.55)
var BGM_G_SNR   = 0.34;    // 스네어 몸통(사인) 게이트 목표
var BGM_G_SNRN  = 0.27;    // 스네어 살(하이햇 버스 노이즈) 게이트 목표
var BGM_G_CNT   = 0.19;    // 카운터 멜로디 게이트 목표
var BGM_LAYERS = [
[0.00, 0.00, 0.00, 0.00],
[0.85, 1.00, 0.00, 0.00],
[1.00, 1.00, 1.00, 0.00],
[1.00, 1.00, 1.00, 0.55]
];
var BGM_LAYER_RAMP = 0.9;   // s — 레이어가 들고 나는 시간 (2박, 클릭 없이 스며든다)
var BGM_CUT_NORMAL = 1150;
var BGM_CUT_FEVER  = 2200;
var BGM_BASS_CUT   = 700;    // square 베이스 배음 상한
var BGM_HAT_HP     = 6200;
var BGM_HAT_BP     = 8400;
var BGM_KICK_A = [1.00, 0, 0, 0,  0.84, 0, 0, 0,     0.94, 0, 0,    0,     0.84, 0,    0,    0];
var BGM_KICK_B = [1.00, 0, 0, 0,  0.84, 0, 0, 0,     0.94, 0, 0,    0,     0.84, 0,    0.58, 0];
var BGM_KICK_F = [1.00, 0, 0, 0,  0.84, 0, 0, 0,     0.90, 0, 0.50, 0,     0.70, 0,    0.70, 0];
var BGM_KICK_FF= [1.00, 0, 0, 0,  0.84, 0, 0, 0,     0.90, 0, 0.50, 0.60,  0.70, 0.58, 0.70, 0.90];
var BGM_HAT   = [0.55, 0, 0.88, 0,     0.50, 0, 0.88, 0.30,  0.55, 0, 0.88, 0,     0.50, 0, 0.88, 0.34];
var BGM_HAT_D = [0, 0.30, 0, 0.34,     0, 0.30, 0, 0,        0, 0.30, 0, 0.34,     0, 0.30, 0, 0];
var BGM_SNR    = [0, 0, 0, 0,  1.00, 0, 0, 0.26,  0, 0,    0,    0,     1.00, 0,    0,    0.30];
var BGM_SNR_F  = [0, 0, 0, 0,  1.00, 0, 0, 0.26,  0, 0,    0,    0,     0.55, 0.62, 0.72, 0.85];
var BGM_SNR_FF = [0, 0, 0, 0,  1.00, 0, 0, 0,     0.45, 0.50, 0.55, 0.62, 0.68, 0.75, 0.85, 1.00];
var BGM_BASS_A  = [1, 0, 0, 1,  0, 0, 2, 0,  1, 0, 0, 3,  0, 0, 2, 0];
var BGM_BASS_A2 = [1, 0, 0, 1,  0, 0, 2, 0,  1, 0, 2, 0,  0, 3, 0, 2];
var BGM_BASS_B  = [1, 0, 2, 0,  0, 1, 0, 2,  1, 0, 2, 0,  0, 1, 0, 3];
var BGM_BASS_F  = [1, 0, 0, 2,  0, 0, 3, 0,  1, 0, 0, 0,  4, 0, 3, 0];
var BGM_STAB_PA = [0, 0, 0, 0,  0, 0, 1, 0,  0, 0, 0, 0,  0, 0, 1, 0];
var BGM_STAB_PB = [0, 0, 0, 2,  0, 0, 1, 0,  0, 0, 0, 2,  0, 0, 1, 0];
var BGM_BASS_R = [65.41, 49.00, 55.00, 43.65, 73.42, 82.41];      // C2  G1  A1  F1  D2  E2
var BGM_BASS_O = [130.81, 98.00, 110.00, 87.31, 146.83, 164.81];  // C3  G2  A2  F2  D3  E3
var BGM_BASS_5 = [98.00, 73.42, 82.41, 65.41, 110.00, 123.47];    // G2  D2  E2  C2  A2  B2
var BGM_BASS_3 = [82.41, 61.74, 65.41, 55.00, 87.31, 98.00];      // E2  B1  C2  A1  F2  G2
var BGM_STAB_A = [196.00, 196.00, 220.00, 220.00, 220.00, 246.94];  // G3 G3 A3 A3 A3 B3
var BGM_STAB_B = [329.63, 293.66, 329.63, 261.63, 293.66, 329.63];  // E4 D4 E4 C4 D4 E4
var BGM_STAB_C = [261.63, 246.94, 261.63, 174.61, 174.61, 196.00];  // C4 B3 C4 F3 F3 G3
var BGM_CHORD = [
    /* A  */ 0, 1, 2, 3,  0, 1, 3, 1,
    /* A' */ 0, 1, 2, 3,  0, 1, 3, 1,
    /* B  */ 2, 3, 0, 1,  2, 3, 4, 1,
    /* B' */ 3, 1, 5, 2,  3, 1, 0, 1
];
var BGM_MEL_HZ = [196.00, 220.00, 246.94, 261.63, 293.66, 329.63, 349.23, 392.00, 440.00];
var BGM_WAVE_SPEC = [
[0.250, 3], [0.125, 3], [0.500, 3], [0.500, 6]
];
var BGM_W_BASS = 3;
var BGM_W_STAB = 2;
var BGM_LEAD_W = [
    /* A  */ 0, 0, 1, 1,  0, 0, 1, 1,
    /* A' */ 0, 0, 1, 1,  0, 0, 1, 2,
    /* B  */ 2, 2, 0, 0,  2, 2, 0, 2,
    /* B' */ 0, 0, 1, 1,  0, 0, 2, 2
];
var BGM_LEAD_WF = [1, 1, 0];
var BGM_MOTIF = [
    /*  0 쉼      */ [-1, -1, -1, -1,  -1, -1, -1, -1,  -1, -1, -1, -1,  -1, -1, -1, -1],
    /*  1 훅 앞   */ [ 5, -1, -1,  7,  -1, -1,  5, -1,   3, -1, -1,  4,  -1, -1,  5, -1],
    /*  2 훅 뒤   */ [ 7, -1, -1, -1,  -1, -1,  5, -1,   4, -1, -1,  2,  -1, -1, -1, -1],
    /*  3 응답 앞 */ [-1, -1,  5, -1,  -1, -1,  7, -1,   8, -1, -1, -1,  -1, -1,  7, -1],
    /*  4 응답 뒤 */ [ 6, -1, -1,  5,  -1, -1,  3, -1,  -1, -1, -1, -1,  -1, -1, -1, -1],
    /*  5 종지 앞 */ [-1, -1,  3, -1,  -1,  4, -1,  5,  -1, -1,  6, -1,  -1, -1,  5, -1],
    /*  6 종지 뒤 */ [ 4, -1, -1, -1,  -1, -1, -1, -1,   2, -1, -1, -1,  -1, -1,  4,  5],
    /*  7 응답'앞 */ [-1, -1,  8, -1,  -1,  7, -1, -1,   8, -1, -1,  7,  -1, -1,  5, -1],
    /*  8 응답'뒤 */ [ 6, -1, -1, -1,  -1, -1,  5, -1,   3, -1, -1, -1,  -1, -1, -1, -1],
    /*  9 종지'뒤 */ [ 4, -1, -1,  5,  -1, -1,  4, -1,   2, -1, -1, -1,   4, -1,  5,  7],
    /* 10 B 1     */ [ 8, -1, -1, -1,  -1, -1,  7, -1,   8, -1, -1, -1,  -1, -1, -1, -1],
    /* 11 B 2     */ [ 7, -1, -1, -1,  -1, -1,  6, -1,   5, -1, -1, -1,  -1, -1,  4, -1],
    /* 12 B 3     */ [ 5, -1, -1,  7,  -1, -1,  8, -1,   7, -1, -1, -1,  -1, -1,  5, -1],
    /* 13 B 4     */ [ 4, -1, -1, -1,  -1, -1,  2, -1,   4, -1, -1, -1,  -1, -1, -1, -1],
    /* 14 B 5(Dm) */ [ 6, -1, -1,  5,  -1, -1,  4, -1,  -1, -1,  6, -1,  -1, -1,  5, -1],
    /* 15 B 6     */ [ 4, -1, -1, -1,   2, -1, -1, -1,  -1, -1, -1, -1,  -1, -1,  5,  7],
    /* 16 B' 1    */ [ 8, -1, -1, -1,  -1, -1,  7, -1,  -1, -1,  8, -1,  -1, -1, -1, -1],
    /* 17 B' 2    */ [ 7, -1, -1,  8,  -1, -1,  7, -1,   4, -1, -1, -1,  -1, -1, -1, -1],
    /* 18 B' 3    */ [ 5, -1, -1, -1,  -1, -1,  7, -1,   8, -1, -1,  7,  -1, -1,  5, -1],
    /* 19 B' 4    */ [ 8, -1, -1,  7,  -1, -1,  5, -1,  -1, -1, -1, -1,  -1, -1, -1, -1],
    /* 20 마무리  */ [ 5, -1, -1,  7,  -1, -1,  8, -1,   7, -1, -1,  5,  -1, -1,  4, -1],
    /* 21 턴어라운드 */ [ 4, -1, -1, -1,  -1, -1, -1, -1,   2, -1,  3, -1,   4, -1,  5,  7]
];
var BGM_MEL_MAP = [
    /* A  */  1,  2,  3,  4,   1,  2,  5,  6,
    /* A' */  1,  2,  7,  8,   1,  2,  5,  9,
    /* B  */ 10, 11, 12, 13,  10, 11, 14, 15,
    /* B' */ 16, 17, 18, 19,   1,  2, 20, 21
];
var BGM_CNT_MOTIF = [
    /*  0 쉼   */ [-1, -1, -1, -1,  -1, -1, -1, -1,  -1, -1, -1, -1,  -1, -1, -1, -1],
    /*  1 ↔훅앞*/ [-1, -1, -1, -1,   2, -1, -1, -1,  -1, -1,  0, -1,  -1, -1, -1, -1],
    /*  2 ↔훅뒤*/ [-1, -1, -1, -1,   0, -1, -1, -1,  -1, -1, -1, -1,   2, -1,  4, -1],
    /*  3 ↔응답'앞 */ [ 1, -1, -1, -1,  -1, -1,  3, -1,  -1, -1, -1, -1,   1, -1, -1, -1],
    /*  4 ↔응답'뒤 */ [-1, -1, -1, -1,   0, -1, -1, -1,  -1, -1,  2, -1,  -1,  3, -1, -1],
    /*  5 ↔종지앞 */ [ 3, -1, -1, -1,  -1, -1, -1, -1,   1, -1, -1, -1,   0, -1, -1, -1],
    /*  6 ↔종지'뒤 */ [-1, -1, -1, -1,   4, -1, -1, -1,  -1, -1,  2, -1,  -1, -1, -1, -1],
    /*  7 ↔B1  */ [-1, -1,  3, -1,  -1, -1, -1, -1,  -1, -1,  1, -1,  -1, -1,  0, -1],
    /*  8 ↔B2  */ [-1, -1,  1, -1,  -1, -1, -1, -1,  -1, -1,  3, -1,  -1, -1, -1, -1],
    /*  9 ↔B3  */ [-1, -1, -1, -1,   0, -1, -1, -1,  -1, -1,  2, -1,  -1, -1, -1, -1],
    /* 10 ↔B4  */ [-1, -1,  4, -1,  -1, -1, -1, -1,  -1, -1,  2, -1,  -1, -1,  0, -1],
    /* 11 ↔B5  */ [-1, -1, -1, -1,   1, -1, -1, -1,   3, -1, -1, -1,  -1, -1, -1, -1],
    /* 12 ↔B6  */ [-1, -1, -1, -1,  -1, -1,  2, -1,  -1, -1,  4, -1,  -1, -1, -1, -1],
    /* 13 ↔B'1 */ [-1, -1,  3, -1,  -1, -1, -1, -1,   1, -1, -1, -1,  -1, -1,  0, -1],
    /* 14 ↔B'2 */ [-1, -1, -1, -1,   2, -1, -1, -1,  -1, -1,  4, -1,  -1, -1,  3, -1],
    /* 15 ↔B'3 */ [-1, -1,  2, -1,   4, -1, -1, -1,  -1, -1, -1, -1,  -1, -1, -1, -1],
    /* 16 ↔B'4 */ [-1, -1, -1, -1,  -1, -1, -1, -1,   2, -1, -1, -1,   4, -1,  5, -1],
    /* 17 ↔마무리 */ [-1, -1, -1, -1,   2, -1, -1, -1,  -1, -1,  0, -1,  -1, -1, -1, -1],
    /* 18 ↔턴  */ [-1, -1, -1, -1,   0, -1, -1, -1,  -1, -1, -1, -1,  -1, -1, -1, -1]
];
var BGM_CNT_MAP = [
    /* A  */  0,  0,  0,  0,   0,  0,  0,  0,
    /* A' */  1,  2,  3,  4,   1,  2,  5,  6,
    /* B  */  7,  8,  9, 10,   7,  8, 11, 12,
    /* B' */ 13, 14, 15, 16,   1,  2, 17, 18
];
var bgmGain   = null;   // 버스 페이더 (start/stop 램프는 여기서만)
var bgmToneLP = null;   // 톤 버스 lowpass (피버 때 이 컷오프가 열린다)
var bgmKickG  = null, bgmBassG = null, bgmBassLP = null;
var bgmPluckG = null, bgmStabG = null, bgmLeadG = null, bgmCntG = null;
var bgmHatG   = null, bgmHatDG = null, bgmHatHP = null, bgmHatBP = null;
var bgmSnrG   = null, bgmSnrNG = null;   // 스네어 몸통(톤 버스) / 살(하이햇 버스)
var bgmWaves  = null;   // PeriodicWave 테이블 — 노트마다 만들지 않고 여기서 재사용
var bgmTimer   = 0;
var bgmRunning = false;   // 실제로 울리는 중
var bgmWanted  = false;   // 게임이 원하는 상태 (탭 복귀/음소거 해제 시 자동 재개용)
var bgmFever   = false;
var bgmIntensity = 0;     // 0~3 레이어 단계 (게임이 스테이지/콤보로 올린다)
var bgmStep    = 0;       // 정수 스텝 인덱스 (모듈로 없이 계속 증가 → 시각 계산의 기준)
var bgmT0      = 0;       // 현재 템포 구간의 격자 원점 (actx.currentTime 기준)
var bgmBudget  = 0;       // 이번 tick 에 남은 보이스 예산
var bgmPanic   = false;   // 타임어택 잔여 10초 — 템포 가속
var bgmStepDur = BGM_STEP;// 현재 템포의 한 스텝 길이
var bgmEpoch   = 0;       // 현재 템포 구간이 시작된 스텝 인덱스
function bgmStepTime(n) { return bgmT0 + (n - bgmEpoch) * bgmStepDur; }
function bgmMakeGain(v, dest) {
var g = actx.createGain();
g.gain.value = v;
g.connect(dest);
return g;
}
function bgmPulseWave(d, N) {
if (!actx || !actx.createPeriodicWave || typeof Float32Array === 'undefined') return null;
try {
var re = new Float32Array(N + 1), im = new Float32Array(N + 1);
var n, i, v, th, peak = 0;
for (n = 1; n <= N; n++) re[n] = (2 / (n * Math.PI)) * Math.sin(n * Math.PI * d);
for (i = 0; i < 256; i++) {
th = i * 2 * Math.PI / 256; v = 0;
for (n = 1; n <= N; n++) v += re[n] * Math.cos(n * th);
if (v < 0) v = -v;
if (v > peak) peak = v;
}
if (peak > 0) { for (n = 1; n <= N; n++) re[n] = re[n] / peak; }
try { return actx.createPeriodicWave(re, im, { disableNormalization: true }); }
catch (e2) { return actx.createPeriodicWave(re, im); }
} catch (e) { return null; }
}
function bgmBuildWaves() {
if (bgmWaves) return;
var t = [];
for (var i = 0; i < BGM_WAVE_SPEC.length; i++) {
t.push(bgmPulseWave(BGM_WAVE_SPEC[i][0], BGM_WAVE_SPEC[i][1]));
}
bgmWaves = t;
}
function bgmBuild() {
if (bgmGain) return true;
if (!actx || !master) return false;
try {
bgmGain = actx.createGain();
bgmGain.gain.value = 0.0001;
bgmGain.connect(master);
bgmToneLP = actx.createBiquadFilter();
bgmToneLP.type = 'lowpass';
try { bgmToneLP.Q.value = 0.7; } catch (e) {}
bgmToneLP.frequency.value = bgmFever ? BGM_CUT_FEVER : BGM_CUT_NORMAL;
bgmToneLP.connect(bgmGain);
bgmKickG  = bgmMakeGain(BGM_G_KICK,  bgmToneLP);
bgmPluckG = bgmMakeGain(BGM_G_PLUCK, bgmToneLP);
bgmStabG  = bgmMakeGain(0, bgmToneLP);
bgmCntG   = bgmMakeGain(0, bgmToneLP);
bgmSnrG   = bgmMakeGain(0, bgmToneLP);
bgmLeadG  = bgmMakeGain(0, bgmToneLP);
bgmBassLP = actx.createBiquadFilter();
bgmBassLP.type = 'lowpass';
try { bgmBassLP.Q.value = 0.7; } catch (e) {}
bgmBassLP.frequency.value = BGM_BASS_CUT;
bgmBassLP.connect(bgmToneLP);
bgmBassG = bgmMakeGain(BGM_G_BASS, bgmBassLP);
bgmHatBP = actx.createBiquadFilter();
bgmHatBP.type = 'bandpass';
try { bgmHatBP.Q.value = 1.4; } catch (e) {}
bgmHatBP.frequency.value = BGM_HAT_BP;
bgmHatBP.connect(bgmGain);
bgmHatHP = actx.createBiquadFilter();
bgmHatHP.type = 'highpass';
try { bgmHatHP.Q.value = 0.7; } catch (e) {}
bgmHatHP.frequency.value = BGM_HAT_HP;
bgmHatHP.connect(bgmHatBP);
bgmHatG  = bgmMakeGain(BGM_G_HAT, bgmHatHP);
bgmHatDG = bgmMakeGain(0, bgmHatG);
bgmSnrNG = bgmMakeGain(0, bgmHatHP);
bgmBuildWaves();
bgmApplyMix(0.001);      // 현재 fever/intensity 상태를 즉시 반영(램프 없이)
return true;
} catch (e) {
bgmGain = null; bgmToneLP = null; bgmKickG = null; bgmPluckG = null;
bgmStabG = null; bgmLeadG = null; bgmBassLP = null; bgmBassG = null;
bgmHatBP = null; bgmHatHP = null; bgmHatG = null; bgmHatDG = null;
bgmCntG = null; bgmSnrG = null; bgmSnrNG = null;
return false;
}
}
function bgmRampGate(node, target, t, dur) {
if (!node) return;
try {
var cur = node.gain.value;
node.gain.cancelScheduledValues(t);
node.gain.setValueAtTime(cur, t);          // 현재값 고정 → 점프 없음
node.gain.linearRampToValueAtTime(target, t + dur);
} catch (e) { /* 조용히 무시 */ }
}
function bgmApplyMix(ramp) {
if (!actx) return;
try {
var t = at();
var d = (typeof ramp === 'number') ? ramp : BGM_LAYER_RAMP;
var lv = BGM_LAYERS[clamp(bgmIntensity | 0, 0, BGM_LAYERS.length - 1)];
if (bgmToneLP) {
var target = bgmFever ? BGM_CUT_FEVER : BGM_CUT_NORMAL;
var cur = bgmToneLP.frequency.value;
bgmToneLP.frequency.cancelScheduledValues(t);
bgmToneLP.frequency.setValueAtTime(Math.max(40, cur), t);
bgmToneLP.frequency.exponentialRampToValueAtTime(target, t + 0.6);
}
bgmRampGate(bgmLeadG, bgmFever ? BGM_G_LEAD : 0, t, 0.6);
bgmRampGate(bgmStabG, BGM_G_STAB  * lv[0], t, d);
bgmRampGate(bgmSnrG,  BGM_G_SNR   * lv[1], t, d);
bgmRampGate(bgmSnrNG, BGM_G_SNRN  * lv[1], t, d);
bgmRampGate(bgmCntG,  BGM_G_CNT   * lv[2], t, d);
bgmRampGate(bgmHatDG,
Math.max(bgmFever ? BGM_G_HATD : 0, lv[3], bgmPanic ? BGM_PANIC_HATD : 0),
t, d);
} catch (e) { /* 조용히 무시 */ }
}
function bgmVoice(dest, wave, f0, f1, t0, dur, peak, atk) {
if (!actx || !dest || bgmBudget <= 0) return;
try {
var o = actx.createOscillator();
if (typeof wave === 'number') {
var pw = bgmWaves ? bgmWaves[wave] : null;
if (pw) { try { o.setPeriodicWave(pw); } catch (e1) { o.type = 'triangle'; } }
else o.type = 'triangle';
} else {
o.type = wave;
}
o.frequency.setValueAtTime(Math.max(20, f0), t0);
if (f1 && f1 !== f0) {
o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur * 0.9);
}
var g = actx.createGain();
var a = atk === undefined ? 0.004 : atk;
g.gain.setValueAtTime(0.0001, t0);
g.gain.linearRampToValueAtTime(Math.max(0.0002, peak), t0 + a);
g.gain.exponentialRampToValueAtTime(0.0001, t0 + Math.max(a + 0.02, dur));
o.connect(g); g.connect(dest);
o.start(t0);
o.stop(t0 + dur + 0.03);
o.onended = function () { try { o.disconnect(); g.disconnect(); } catch (e) {} };
bgmBudget--;
} catch (e) { /* 조용히 무시 */ }
}
function bgmHat(dest, t0, peak, n) {
if (!actx || !dest || bgmBudget <= 0) return;
try {
var buf = getNoiseBuffer();
if (!buf) return;
var s = actx.createBufferSource();
s.buffer = buf;
s.loop = true;
var g = actx.createGain();
g.gain.setValueAtTime(0.0001, t0);
g.gain.linearRampToValueAtTime(Math.max(0.0002, peak), t0 + 0.002);
g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.045);
s.connect(g); g.connect(dest);
s.start(t0, (n % 19) * 0.041);
s.stop(t0 + 0.06);
s.onended = function () { try { s.disconnect(); g.disconnect(); } catch (e) {} };
bgmBudget--;
} catch (e) { /* 조용히 무시 */ }
}
function bgmSnare(t0, v, n) {
if (!actx) return;
bgmVoice(bgmSnrG, 'sine', 190, 120, t0, 0.075, v, 0.002);
if (!bgmSnrNG || bgmBudget <= 0) return;
try {
var buf = getNoiseBuffer();
if (!buf) return;
var s = actx.createBufferSource();
s.buffer = buf;
s.loop = true;
var g = actx.createGain();
g.gain.setValueAtTime(0.0001, t0);
g.gain.linearRampToValueAtTime(Math.max(0.0002, v), t0 + 0.003);
g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.11);
s.connect(g); g.connect(bgmSnrNG);
s.start(t0, (n % 23) * 0.037);
s.stop(t0 + 0.13);
s.onended = function () { try { s.disconnect(); g.disconnect(); } catch (e) {} };
bgmBudget--;
} catch (e) { /* 조용히 무시 */ }
}
function bgmScheduleIntro(n) {
var t    = bgmStepTime(n);
var bar  = (n / BGM_BAR) | 0;          // 0..3
var s    = n % BGM_BAR;
var ch   = BGM_INTRO_CHORD[bar];
var last = bar === (BGM_INTRO_BARS - 1);
var v, f;
if (bar >= 2) {
v = last ? BGM_KICK_FF[s] : BGM_KICK_A[s];
if (v > 0) {
f = (last && s >= 10) ? (128 + (s - 10) * 15) : 155;
bgmVoice(bgmKickG, 'sine', f, 47, t, 0.13, v, 0.0025);
}
}
if (bar >= 1 && !(last && s >= 8)) {
v = BGM_HAT[s];
if (v > 0) bgmHat(bgmHatG, t, v, n);
}
if (bar >= 2) {
v = (last ? BGM_BASS_F : BGM_BASS_A)[s];
if (v > 0) {
f = (v === 1) ? BGM_BASS_R[ch]
: (v === 2) ? BGM_BASS_O[ch]
: (v === 3) ? BGM_BASS_5[ch] : BGM_BASS_3[ch];
bgmVoice(bgmBassG, BGM_W_BASS, f, 0, t,
0.155, (v === 2) ? 0.88 : ((v === 1) ? 1.00 : 0.92), 0.005);
}
}
v = BGM_MOTIF[BGM_INTRO_MEL[bar]][s];
if (v >= 0) {
f = BGM_MEL_HZ[v];
var wi = BGM_INTRO_LEAD_W[bar];
if (bgmFever) wi = BGM_LEAD_WF[wi];
bgmVoice(bgmPluckG, wi, f, 0, t, 0.18, (s & 3) === 0 ? 0.92 : 1.00, 0.004);
bgmVoice(bgmLeadG, 'sine', f * 2, 0, t + bgmStepDur, 0.22, 1.00, 0.006);
}
}
function bgmSchedule(n) {
if (n < BGM_INTRO_STEPS) { bgmScheduleIntro(n); return; }
var t    = bgmStepTime(n);
var p    = (n - BGM_INTRO_STEPS) % BGM_LOOP;
var bar  = (p / BGM_BAR) | 0;   // 0..31
var s    = p % BGM_BAR;         // 마디 안 16분 위치
var ch   = BGM_CHORD[bar];      // 0=C 1=G 2=Am 3=F 4=Dm 5=Em
var sect = (bar >> 3);          // 0=A 1=A' 2=B 3=B'
var fill = (bar & 7) === 7;     // 8마디마다 마지막 마디
var big  = fill && (bar === 15 || bar === 31);   // 섹션 경계의 큰 필
var v, f;
v = big ? BGM_KICK_FF[s]
: (fill ? BGM_KICK_F[s] : ((bar & 1) ? BGM_KICK_B[s] : BGM_KICK_A[s]));
if (v > 0) {
f = (fill && s >= 10) ? (128 + (s - 10) * 15) : 155;
bgmVoice(bgmKickG, 'sine', f, 47, t, 0.13, v, 0.0025);
}
v = big ? BGM_SNR_FF[s] : (fill ? BGM_SNR_F[s] : BGM_SNR[s]);
if (v > 0) bgmSnare(t, v, n);
var bp = fill ? BGM_BASS_F : (sect === 0 ? BGM_BASS_A
: (sect === 1 ? BGM_BASS_A2 : BGM_BASS_B));
v = bp[s];
if (v > 0) {
f = (v === 1) ? BGM_BASS_R[ch]
: (v === 2) ? BGM_BASS_O[ch]
: (v === 3) ? BGM_BASS_5[ch] : BGM_BASS_3[ch];
bgmVoice(bgmBassG, BGM_W_BASS, f, 0, t,
0.155, (v === 2) ? 0.88 : ((v === 1) ? 1.00 : 0.92), 0.005);
}
v = (sect >= 2 ? BGM_STAB_PB : BGM_STAB_PA)[s];
if (v > 0) {
bgmVoice(bgmStabG, BGM_W_STAB, BGM_STAB_A[ch], 0, t, 0.10, 1.00, 0.004);
bgmVoice(bgmStabG, BGM_W_STAB, BGM_STAB_B[ch], 0, t, 0.10, 0.80, 0.004);
if (v >= 2) bgmVoice(bgmStabG, BGM_W_STAB, BGM_STAB_C[ch], 0, t, 0.10, 0.70, 0.004);
}
var hush = fill && (s >= (big ? 8 : 12));
if (!hush) {
v = BGM_HAT[s];
if (v > 0) bgmHat(bgmHatG, t, v, n);
v = BGM_HAT_D[s];
if (v > 0) bgmHat(bgmHatDG, t, v, n + 7);
}
v = BGM_MOTIF[BGM_MEL_MAP[bar]][s];
if (v >= 0) {
f = BGM_MEL_HZ[v];
var wi = BGM_LEAD_W[bar];
if (bgmFever) wi = BGM_LEAD_WF[wi];
bgmVoice(bgmPluckG, wi, f, 0, t, 0.18, (s & 3) === 0 ? 0.92 : 1.00, 0.004);
bgmVoice(bgmLeadG, 'sine', f * 2, 0, t + bgmStepDur, 0.22, 1.00, 0.006);
}
v = BGM_CNT_MOTIF[BGM_CNT_MAP[bar]][s];
if (v >= 0) {
bgmVoice(bgmCntG, BGM_W_STAB, BGM_MEL_HZ[v], 0, t, 0.16, 1.00, 0.005);
}
}
function bgmTick() {
if (!bgmRunning || !actx || !bgmGain) return;
try {
if (!soundOn || hidden()) { bgmStop(); return; }
var now = actx.currentTime;
if (bgmStepTime(bgmStep) < now) {
var k = bgmEpoch + Math.ceil((now - bgmT0) / bgmStepDur);
if (isFinite(k) && k > bgmStep) bgmStep = k;
}
var horizon = now + BGM_HORIZON;
var guard = 0;
bgmBudget = BGM_MAX_VOICES;
while (bgmStepTime(bgmStep) < horizon &&
guard++ < BGM_MAX_STEPS && bgmBudget >= BGM_STEP_COST) {
bgmSchedule(bgmStep);
bgmStep++;
}
} catch (e) { /* 조용히 무시 */ }
}
function bgmStart() {
bgmWanted = true;                       // 의사는 항상 기억한다
if (!soundOn || hidden()) return;       // 음소거·백그라운드에서는 울리지 않음
if (bgmRunning) return;                 // 멱등
if (!actx) createAudio();
if (!actx || !master) return;
if (!bgmBuild()) return;
try {
if (actx.state === 'suspended') {
var pr = actx.resume();
if (pr && typeof pr.catch === 'function') pr.catch(function () {});
}
var t0 = at();
bgmGain.gain.cancelScheduledValues(t0);
bgmGain.gain.setValueAtTime(0.0001, t0);
bgmGain.gain.exponentialRampToValueAtTime(BGM_GAIN, t0 + 1.2);
bgmT0      = t0 + 0.12;               // 격자 원점 (= 인트로 0마디 1박)
bgmStep    = 0;
bgmEpoch   = 0;                       // 새 판 = 새 템포 구간
bgmStepDur = bgmPanic ? (BGM_STEP / BGM_PANIC_RATE) : BGM_STEP;
bgmRunning = true;
bgmApplyMix();
bgmTick();                            // 첫 구간을 즉시 채운다
bgmTimer = setInterval(bgmTick, BGM_TICK_MS);
} catch (e) {
bgmRunning = false;
}
}
function bgmStop() {
if (bgmTimer) { try { clearInterval(bgmTimer); } catch (e) {} bgmTimer = 0; }
if (!bgmRunning) return;
bgmRunning = false;
if (!actx || !bgmGain) return;
try {
var t = at();
var cur = bgmGain.gain.value;
bgmGain.gain.cancelScheduledValues(t);
bgmGain.gain.setValueAtTime(Math.max(0.0001, cur), t);
bgmGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
bgmGain.gain.setValueAtTime(0.0001, t + 0.35);
} catch (e) { /* 조용히 무시 */ }
}
function bgmSetFever(on) {
bgmFever    = !!on;
feverActive = !!on;   // sfx.feverOff 과 같은 방어적 동기화 (rowClear 덕킹 판단용)
bgmApplyMix();
}
function bgmSetPanic(on) {
on = !!on;
if (on === bgmPanic) return;
bgmPanic = on;
ingSetRate(on ? ING_PANIC_RATE : 1);
if (bgmRunning) {
bgmT0    = bgmStepTime(bgmStep);
bgmEpoch = bgmStep;
}
bgmStepDur = on ? (BGM_STEP / BGM_PANIC_RATE) : BGM_STEP;
bgmApplyMix();
}
function bgmSetIntensity(level) {
var lv = clamp((level | 0) || 0, 0, BGM_LAYERS.length - 1);
if (lv === bgmIntensity) return;
bgmIntensity = lv;
bgmApplyMix();
}
var BGM = {
start: bgmStart, stop: bgmStop,
setFever: bgmSetFever, setIntensity: bgmSetIntensity,
setPanic: bgmSetPanic,
scene: bgmScene,
mainStart: mainStart, mainStop: mainStop,
warm: bgmWarm,
warmed: function () { return warmDone; },
setNight: bgmSetNight,
nightOn: function () { return lobbyNight; },
lobbyKey: function () { return lobbyTrk().key; },
mainInfo: function () { return lobbyTrk().report; },
mainState: function () { return lobbyTrk().state; },
ingKeys: function () {
var L = ingList(), out = [];
for (var i = 0; i < L.length; i++) out.push(L[i].key);
return out;
},
ingCur: function () { return ingCur ? ingCur.key : null; },
ingInfo: function (key) {
var L = ingList();
for (var i = 0; i < L.length; i++) {
if (L[i].key === key) return L[i].report;
}
return null;
},
ingRate: function () { return ingRate; },
duck: bgmDuck
};
function canSpawn() { return !!ctx && !hidden(); }
function burst(x, y, color, count, fruit) {
if (!canSpawn()) return;
var bx = (typeof x === 'number' && isFinite(x)) ? x : viewW * 0.5;
var by = (typeof y === 'number' && isFinite(y)) ? y : viewH * 0.5;
var rawN = (count === undefined || count === null) ? 22 : (count | 0);
var n = clamp(rawN || 22, 1, 56);
var col = color || DEFAULT_COLOR;
var L  = comboLevel();
var sz = clamp(0.6 + 0.4 * (n / 14), 0.5, 1.5);   // 크기 배율
var q  = spawnQuality();                          // 거버너 + 슬롯 가드 + reduced-motion
var t  = nowMs();
var i, p, ang, cs, sn;
var hit = findCore(bx, by, t);
if (hit) {
reinforceCore(hit);
var mShards = Math.round(CB_SHARD[L] * sz * q * 0.55);
if (mShards > 0) spawnShards(bx, by, col, L, sz, mShards, fruit);
pulseForCombo(L);
return;
}
var core = alloc(T_RING);
var ring0 = null;
if (core) {
core.x = bx; core.y = by;
core.size = 2;
core.w    = (13 + L * 2.2) * sz;
core.h    = 0;
core.ttl  = 0.13 + L * 0.008;
core.amul = clamp(0.80 + L * 0.025, 0, 1);
core.soft = 1;                                  // ★ 채워진 디스크로 그린다
core.color = toWhite(col, 0.84);                // 백열 — 바깥 레이어만 타일색을 갖는다
spendNote(1);
}
var rings = Math.round(CB_RING[L] * q);
if (rings < 1 && freeN >= GUARD_LOW) rings = 1;   // 최소 1겹은 보장
for (i = 0; i < rings; i++) {
p = alloc(T_RING);
if (!p) break;
p.x = bx; p.y = by;
p.size  = 4 + i * 7;
p.w     = (26 + L * 5.5) * sz * (i === 0 ? 1 : 0.68);
p.h     = Math.max(2, 7 - i * 2);
p.ttl   = 0.32 + i * 0.06 + L * 0.010;
p.delay = i * 0.045;
p.color = col;
if (i === 0) ring0 = p;
spendNote(1);
}
if (core) registerCore(bx, by, core, ring0);
var rays = decorOK() ? Math.round(CB_RAY[L] * q) : 0;
if (rays > 0 && rayAllowed()) {
var ra0 = Math.random() * TAU;
var inR = 3 + L * 0.4;
var outR = (20 + L * 4.2) * sz;
var rayCol = toWhite(col, 0.52);
for (i = 0; i < rays; i++) {
p = alloc(T_BEAM);
if (!p) break;
ang = ra0 + (i / rays) * TAU;
cs = Math.cos(ang); sn = Math.sin(ang);
p.x  = bx + cs * inR;  p.y  = by + sn * inR;
p.x2 = bx + cs * outR; p.y2 = by + sn * outR;
p.size = 6 + L * 0.55;
p.ttl  = 0.14 + L * 0.007;
p.color = rayCol;
spendNote(1);
}
}
var shards = Math.round(CB_SHARD[L] * sz * q);
if (shards < 4) shards = 4;                       // 최악의 상황에도 폭발은 폭발로 보인다
spawnShards(bx, by, col, L, sz, shards, fruit);
var embers = decorOK() ? Math.round(CB_EMBER[L] * q) : 0;
var emCol = toWhite(col, 0.28);
for (i = 0; i < embers; i++) {
p = alloc(T_SPARK);
if (!p) break;
p.x = bx + rand(-7, 7); p.y = by + rand(-7, 7);
p.vx = rand(-38, 38);
p.vy = -rand(16, 52);
p.drag = 0.985;
p.grav = 0;
p.h = 0;                                        // 원형 유지
p.size = rand(1.6, 3.4) * sz;
p.ttl = rand(0.70, 1.25);
p.soft = 1;
p.amul = clamp(0.40 + L * 0.022, 0, 1);
p.delay = rand(0.05, 0.18);
p.color = emCol;
spendNote(1);
}
pulseForCombo(L);
}
function spawnShards(bx, by, col, L, sz, n, fruit) {
if (n <= 0) return;
var a0 = Math.random() * TAU;
var spdMul  = (0.78 + L * 0.048) * sz;
var sizeMul = (1.02 + L * 0.038) * sz;
var streak  = 0.010 + L * 0.0013;                 // 길이 = 속도 × streak
var milky   = toWhite(col, 0.30);                 // 우윳빛이 아니라 과육빛
var juice   = toDeep(col, 0.16);                  // 껍질보다 진한 즙
for (var i = 0; i < n; i++) {
var p = alloc(T_SPARK);
if (!p) return;
var ang = a0 + (i / n) * TAU + rand(-0.20, 0.20);
var spd = rand(150, 340) * spdMul;
p.x = bx; p.y = by;
p.vx = Math.cos(ang) * spd;
p.vy = Math.sin(ang) * spd - rand(10, 70);
p.drag = 0.900;
p.grav = 420;
p.size = rand(2.6, 5.4) * sizeMul;
p.ttl  = rand(0.46, 0.86);
if (i % 4 === 0) {
p.h = 0; p.soft = 2; p.color = milky;         // ★ 반사점 붙은 동그란 방울
p.fr = fruit | 0;                             // 11차: 열매 모양 조각으로 승격
p.rot = Math.random() * TAU;                  // 정지 회전 1회 — 물리는 그대로
} else {
p.h = streak; p.soft = 0; p.color = juice;    // ★ 짧은 캡슐 = 튀는 과즙
}
spendNote(1);
}
}
function beam(x1, y1, x2, y2, color) {
if (!canSpawn()) return;
var ax = (typeof x1 === 'number' && isFinite(x1)) ? x1 : 0;
var ay = (typeof y1 === 'number' && isFinite(y1)) ? y1 : 0;
var bx = (typeof x2 === 'number' && isFinite(x2)) ? x2 : ax;
var by = (typeof y2 === 'number' && isFinite(y2)) ? y2 : ay;
var col = color || DEFAULT_COLOR;
var L = comboLevel();
var q = spawnQuality();
var p = alloc(T_BEAM);
if (!p) return;
p.x = ax; p.y = ay; p.x2 = bx; p.y2 = by;
p.size = 17 + L * 0.6;
p.ttl = 0.26;
p.color = col;
spendNote(1);
var h = alloc(T_BEAM);
if (h) {
h.x = ax; h.y = ay; h.x2 = bx; h.y2 = by;
h.size = 7;
h.ttl = 0.17;
h.color = toWhite(col, 0.70);
spendNote(1);
}
var e, k;
for (k = 0; k < 2; k++) {
e = alloc(T_RING);
if (!e) break;
e.x = k === 0 ? ax : bx;
e.y = k === 0 ? ay : by;
e.size = 1.5;
e.w = 9 + L * 1.1;
e.ttl = 0.16;
e.soft = 1;
e.amul = 0.85;
e.color = toWhite(col, 0.78);
spendNote(1);
}
var dx = bx - ax, dy = by - ay;
var len = Math.sqrt(dx * dx + dy * dy);
var ux = len > 0.001 ? dx / len : 1, uy = len > 0.001 ? dy / len : 0;
var ns = Math.round(7 * clamp(q, 0.3, 1));
for (var i = 0; i < ns; i++) {
var s = alloc(T_SPARK);
if (!s) return;
var t = (i + 0.5) / 7;
var flow = rand(120, 260) * (i % 2 === 0 ? 1 : -1);
s.x = ax + dx * t;
s.y = ay + dy * t;
s.vx = ux * flow + rand(-45, 45);
s.vy = uy * flow + rand(-70, 15);
s.drag = 0.88;
s.grav = 260;
s.size = rand(2.2, 4.4);
s.h = 0.032;                     // 스트릭
s.ttl = rand(0.26, 0.46);
s.delay = t * 0.06;
s.color = (i % 3 === 0) ? toWhite(col, 0.5) : col;
spendNote(1);
}
}
function sweep(x, y, w, h, color) {
if (!canSpawn()) return;
var col = color || DEFAULT_COLOR;
var p = alloc(T_SWEEP);
if (!p) return;
p.x = x; p.y = y; p.w = Math.max(1, w); p.h = Math.max(1, h);
p.ttl = 0.40;
p.color = col;
var n = 16;
for (var i = 0; i < n; i++) {
var s = alloc(T_SPARK);
if (!s) return;
var f = i / (n - 1);
s.x = x + w * f;
s.y = y + h * rand(0.25, 0.75);
s.vx = rand(-40, 190);
s.vy = rand(-230, -60);
s.drag = 0.91;
s.grav = 620;
s.size = rand(1.6, 3.8);
s.ttl = rand(0.45, 0.85);
s.delay = f * 0.30;
s.color = col;
}
}
function confetti(x, y) {
if (!canSpawn()) return;
var cx = (x === undefined || x === null) ? viewW * 0.5 : x;
var cy = (y === undefined || y === null) ? viewH * 0.55 : y;
for (var side = 0; side < 2; side++) {
var dir = side === 0 ? 1 : -1;
var ox = cx + dir * -viewW * 0.30;
for (var i = 0; i < 34; i++) {
var p = alloc(T_CONFETTI);
if (!p) return;
var ang = (-Math.PI / 2) + dir * rand(0.12, 0.72);
var sp = rand(430, 820);
p.x = ox;
p.y = cy + rand(-14, 14);
p.vx = Math.cos(ang) * sp;
p.vy = Math.sin(ang) * sp;
p.grav = 900;
p.w = rand(5, 11);
p.h = rand(7, 15);
p.rot = Math.random() * 6.28318;
p.vr = rand(-9, 9);
p.flip = Math.random() * 3.14159;
p.vflip = rand(4, 12);
p.ttl = rand(1.5, 2.5);
p.color = CONFETTI_COLORS[(Math.random() * CONFETTI_COLORS.length) | 0];
p.delay = Math.random() * 0.10;
}
}
}
function floatRise(size) {
var sz = (typeof size === 'number' && isFinite(size)) ? clamp(size, 12, 72) : 22;
return 54 + (sz - 22) * 1.1;
}
function floatText(x, y, text, color, size) {
if (!canSpawn()) return;
if (text === undefined || text === null || text === '') return;
for (var ci = 0; ci < POOL_SIZE; ci++) {
var q = pool[ci];
if (!q.active || q.type !== T_TEXT) continue;
if (q.life > q.ttl * 0.35) continue;
if (Math.abs(q.x - x) > 56 || Math.abs(q.y - y) > 56) continue;
q.ttl = Math.min(q.ttl, q.life + 0.16);
}
var p = alloc(T_TEXT);
if (!p) return;
var sz = (typeof size === 'number' && isFinite(size)) ? clamp(size, 12, 72) : 22;
p.x = x;
p.y = y;
p.y2 = y;                 // 기준선 (상승은 rise로)
p.rise = floatRise(sz);            // 식은 floatRise 한 곳에만 산다
p.size = sz;
p.ttl = 0.95 + (sz - 22) * 0.012;
p.color = color || '#ffffff';
p.text = String(text);
}
function shockwave(x, y, color, opts) {
if (!canSpawn()) return;
var o = opts || {};
var sx = (typeof x === 'number' && isFinite(x)) ? x : viewW * 0.5;
var sy = (typeof y === 'number' && isFinite(y)) ? y : viewH * 0.5;
var col = color || '#ff9a3c';
var scale = (typeof o.scale === 'number' && isFinite(o.scale)) ? clamp(o.scale, 0.2, 4) : 1;
var maxR = clamp(Math.min(viewW, viewH) * 0.30, 80, 220) * scale;
var nRings = (typeof o.rings === 'number') ? clamp(o.rings | 0, 0, 2) : 2;
var nSpk = (typeof o.sparks === 'number') ? clamp(o.sparks | 0, 0, 24) : 12;
var fill = (typeof o.fill === 'number' && isFinite(o.fill)) ? clamp(o.fill, 0, 1) : 0;
var i, p, ring0 = null;
if (fill > 0) {
var disc = alloc(T_RING);
if (disc) {
disc.x = sx; disc.y = sy;
disc.size = maxR * 0.34;       // 시작 반경 — 최고 알파 시점에 이미 굵다
disc.w = maxR * 1.15;          // 끝 반경
disc.ttl = 0.55;
disc.soft = 1;                 // ← 채운 원 가지
disc.amul = fill;
disc.color = toWhite(col, 0.22);
spendNote(1);
}
}
var core = alloc(T_RING);
if (core) {
core.x = sx; core.y = sy;
core.size = 3;
core.w = 26;
core.ttl = 0.17;
core.soft = 1;
core.amul = 0.95;
core.color = toWhite(col, 0.82);
spendNote(1);
}
for (i = 0; i < nRings; i++) {
p = alloc(T_RING);
if (!p) return;
p.x = sx; p.y = sy;
p.size = 6 + i * 12;                 // 시작 반경
p.w    = maxR * (i === 0 ? 1 : 0.62); // 끝 반경
p.h    = i === 0 ? 9 : 4;             // 시작 선폭
p.ttl  = i === 0 ? 0.52 : 0.38;
p.delay = i * 0.06;
p.color = col;
if (i === 0) ring0 = p;
spendNote(1);
}
if (core) registerCore(sx, sy, core, ring0);
var a0 = Math.random() * TAU;
var hot = toWhite(col, 0.46);
for (i = 0; i < nSpk; i++) {
p = alloc(T_SPARK);
if (!p) return;
var ang = a0 + (i / nSpk) * TAU + rand(-0.14, 0.14);
var sp  = rand(240, 470);
p.x = sx; p.y = sy;
p.vx = Math.cos(ang) * sp;
p.vy = Math.sin(ang) * sp;
p.drag = 0.86;
p.grav = 160;
p.size = rand(2.0, 4.6);
p.h    = 0.042;                       // 스트릭 — 점이 아니라 파편으로 읽힌다
p.ttl  = rand(0.34, 0.60);
p.color = (i % 4 === 0) ? hot : col;
spendNote(1);
}
}
function spawnAura() {
if (!canSpawn()) return;
if (freeN < AURA_POOL_GUARD) return;    // 핵심 이펙트용 여유 확보 — 풀 고갈 유발 금지
var p = alloc(T_SPARK);
if (!p) return;
p.x = rand(0, viewW);
p.y = rand(viewH * 0.72, viewH * 1.02);
p.vx = rand(-14, 14);
p.vy = -rand(20, 46);                   // 천천히 위로 떠오름
p.drag = 0.998;
p.grav = 0;
p.size = rand(1.4, 3.4);
p.ttl  = rand(1.9, 3.2);
p.soft = 1;                             // 페이드 인/아웃
p.amul = 0.40;                          // 은은하게 — 보드 가독성 방해 금지
p.color = FEVER_COLORS[(Math.random() * FEVER_COLORS.length) | 0];
}
function feverAura(on) {
var next = !!on;
feverActive = next;                     // rowClear 덕킹 판단에 쓰인다
if (next === auraOn) return;
auraOn  = next;
auraAcc = 0;
}
function brokenLink(x1, y1, x2, y2) {
if (!canSpawn()) return;
var p = alloc(T_DASH);
if (!p) return;
p.x  = +x1 || 0; p.y  = +y1 || 0;
p.x2 = +x2 || 0; p.y2 = +y2 || 0;
p.size = 9;                             // 중앙 X 팔 길이
p.ttl = 0.42;
p.color = BROKEN_COLOR;
}
function lineGuide(x, y, step) {
if (!canSpawn()) return;
ensureRM();
var s = +step;
if (!isFinite(s) || s <= 0) s = 34;         // step 이 안 넘어와도 보드 기본 피치로 버틴다
var p = alloc(T_GUIDE);
if (!p) return;
p.x = +x || 0; p.y = +y || 0;
p.size = s;                                 // 광선 길이의 기준(타일 피치)
p.amul = reducedMotion ? 0 : 1;             // 모션 감소면 밀려나지 않고 그 자리에서만 명멸
p.ttl = 0.5;
p.color = GUIDE_COLOR;
}
function feverEnter(cx, cy) {
var gx = (cx === undefined || cx === null || !isFinite(cx)) ? viewW * 0.5 : cx;
var gy = (cy === undefined || cy === null || !isFinite(cy)) ? viewH * 0.5 : cy;
var col = '#ffd166';
var lv = comboLevel();
setComboLatch(lv > 7 ? lv : 7);
burst(gx, gy, col, 26);
shockwave(gx, gy, col);
if (canSpawn()) {
var p = alloc(T_RING);
if (p) {
p.x = gx; p.y = gy;
p.size = 18;
p.w = clamp(Math.max(viewW, viewH) * 0.62, 160, 520);
p.h = 6;
p.ttl = 0.85;
p.delay = 0.09;
p.color = col;
spendNote(1);
}
}
applyPulse(PULSE_LG);
vignette(0.9);
feverAura(true);
}
var styleInjected = false;
function injectStyle() {
if (styleInjected) return;
styleInjected = true;
try {
var d = global.document;
if (!d || !d.head) return;
if (d.getElementById('juice-css')) return;
var st = d.createElement('style');
st.id = 'juice-css';
st.textContent =
'@keyframes juice-screen-pulse{' +
'0%{transform:scale(1)}38%{transform:scale(1.005)}100%{transform:scale(1)}}' +
'.pulse{animation:juice-screen-pulse 200ms cubic-bezier(.34,1.56,.64,1)}' +
'@keyframes juice-screen-pulse-sm{' +
'0%{transform:scale(1)}40%{transform:scale(1.003)}100%{transform:scale(1)}}' +
'.pulse-sm{animation:juice-screen-pulse-sm 150ms ease-out}' +
'@keyframes juice-screen-pulse-lg{' +
'0%{transform:scale(1) translate3d(0,0,0)}' +
'20%{transform:scale(1.012) translate3d(-2px,1px,0)}' +
'46%{transform:scale(1.007) translate3d(2px,-1px,0)}' +
'72%{transform:scale(1.003) translate3d(-1px,0,0)}' +
'100%{transform:scale(1) translate3d(0,0,0)}}' +
'.pulse-lg{animation:juice-screen-pulse-lg 280ms cubic-bezier(.34,1.56,.64,1)}' +
'@media (prefers-reduced-motion:reduce){' +
'.pulse,.pulse-sm,.pulse-lg{animation:none}}';
d.head.appendChild(st);
} catch (e) { /* 조용히 무시 */ }
}
var PULSE_SM = 1, PULSE_MD = 2, PULSE_LG = 3;
var PULSE_CLASS = ['', 'pulse-sm', 'pulse', 'pulse-lg'];
var PULSE_MS    = [0, 180, 240, 300];
var pulseTimer = 0, pulseTier = 0, pulseEl = null, lastLightAt = 0;
function applyPulse(tier) {
if (!(tier >= PULSE_SM)) return;
if (tier > PULSE_LG) tier = PULSE_LG;
if (tier < pulseTier) return;                 // 진행 중인 더 큰 펄스에 양보
ensureRM();
if (reducedMotion) return;                    // CSS 도 막지만 DOM 작업 자체를 아낀다
if (tier === PULSE_SM) {
var t = nowMs();
if (t - lastLightAt < 130) return;          // 소형 펄스만 스로틀
lastLightAt = t;
}
try {
var d = global.document;
if (!d) return;
injectStyle();
var el = d.getElementById('app') || d.body;
if (!el) return;
if (pulseTimer) { clearTimeout(pulseTimer); pulseTimer = 0; }
if (pulseEl && pulseEl !== el) {
try { clearPulseClasses(pulseEl); } catch (e) {}
}
clearPulseClasses(el);
void el.offsetWidth;                        // 리플로우 강제 → 연타에도 애니메이션 재시작
var cls = PULSE_CLASS[tier];
el.classList.add(cls);
pulseTier = tier;
pulseEl = el;
pulseTimer = setTimeout(function () {
pulseTimer = 0; pulseTier = 0;
try { el.classList.remove(cls); } catch (e) {}
}, PULSE_MS[tier]);
} catch (e) { /* 조용히 무시 */ }
}
function clearPulseClasses(el) {
el.classList.remove('pulse-sm');
el.classList.remove('pulse');
el.classList.remove('pulse-lg');
}
function screenPulse() { applyPulse(PULSE_MD); }
function pulseForCombo(L) {
applyPulse(L >= 6 ? PULSE_LG : (L >= 3 ? PULSE_MD : PULSE_SM));
}
function vignette(strength) {
if (!canSpawn()) return;
var s = (strength === undefined || strength === null) ? 0.55 : strength;
s = clamp(s, 0, 1);
if (s <= 0) return;
vig.strength = Math.max(vig.strength * (vigActive() ? 0.6 : 0), s);
vig.t = 0;
vig.dur = 0.62;
needsClear = true;
}
function vibrate(ms) {
if (!vibeOn) return;
try {
if (global.navigator && typeof global.navigator.vibrate === 'function') {
global.navigator.vibrate(clamp((ms | 0) || 12, 1, 400));
}
} catch (e) { /* 조용히 무시 */ }
}
function clearAll() {
for (var i = 0; i < POOL_SIZE; i++) {
if (pool[i].active) release(pool[i]);
}
activeCount = 0;
nSpark = nConfetti = nText = nBeam = nSweep = nRing = nDash = nGuide = 0;
freeN = 0;
for (var j = 0; j < POOL_SIZE; j++) { pool[j].active = false; free[freeN++] = j; }
vig.t = 0; vig.dur = 0; vig.strength = 0;
for (var c = 0; c < CORE_SLOTS; c++) {
coreRec[c].p = null; coreRec[c].ring = null;
coreRec[c].seq = -1; coreRec[c].rseq = -1; coreRec[c].t = -1e9;
}
spendN = 0; spendAt = 0;
rayN = 0; rayAt = 0;
try { if (ctx) ctx.clearRect(0, 0, viewW, viewH); } catch (e) {}
needsClear = false;
}
function setSound(on) {
soundOn = !!on;
try {
if (!soundOn) {
if (feverVoice) stopFeverRiser(0.02);   // 재생 중인 긴 라이저부터 정리
bgmStop();                              // BGM 도 함께 정지 (bgmWanted 는 유지)
trkAll(function (T) { trkStop(T, 0.05); });   // 실음원 전부 (wanted 는 유지)
forceMasterGain(0);
if (actx && actx.state === 'running') { try { actx.suspend(); } catch (e) {} }
} else {
if (!actx) createAudio();
if (actx && actx.state === 'suspended') {
var pr = actx.resume();
if (pr && typeof pr.catch === 'function') pr.catch(function () {});
}
forceMasterGain(MASTER_BASE);
if (bgmWanted && !hidden()) bgmStart();
if (!hidden()) trkAll(function (T) { if (T.wanted) trkStart(T); });
}
} catch (e) { /* 조용히 무시 */ }
}
function setVibrate(on) { vibeOn = !!on; }
function resumeAudio() {
if (!soundOn) return;                 // 음소거면 컨텍스트 생성 자체를 회피
try {
if (!actx) createAudio();
if (actx && actx.state !== 'running') {
var pr = actx.resume();
if (pr && typeof pr.catch === 'function') pr.catch(function () {});
return pr;   /* 2026-08-20 결함B — 첫 터치가 running 전이에 매달릴 수 있게.
기존 호출부는 전부 반환값을 쓰지 않는다(전수 확인). */
}
} catch (e) { /* 조용히 무시 */ }
}
function unlockAudio() {
if (!soundOn) return;
try {
if (!actx) createAudio();
if (!actx) return;
if (actx.state !== 'running') {
var pr = actx.resume();
if (pr && typeof pr.catch === 'function') pr.catch(function () {});
}
var b = actx.createBufferSource();
b.buffer = actx.createBuffer(1, 1, actx.sampleRate || 44100);
b.connect(actx.destination);        // master 를 거치지 않는다 — 음소거 게인과 무관하게 언락만 한다
if (b.start) b.start(0);
else if (b.noteOn) b.noteOn(0);     // 아주 오래된 webkit 표기
} catch (e) { /* 언락 실패로 입력이 죽는 일은 없다 */ }
}
var listenersBound = false;
function bindListeners() {
if (listenersBound) return;
listenersBound = true;
try {
global.addEventListener('resize', onResize, { passive: true });
global.addEventListener('orientationchange', onResize, { passive: true });
if (global.document) {
global.document.addEventListener('visibilitychange', function () {
if (global.document.hidden) {
clearAll();                    // 백그라운드 폭주 방지
bgmStop();                     // BGM 정지 (원하던 상태는 bgmWanted 에 남는다)
trkAll(function (T) { trkStop(T, 0.05); });   // 실음원도 (wanted 에 남는다)
} else {
lastT = 0;
resizeNow();
if (bgmWanted && soundOn) bgmStart();    // 복귀 시 자동 재개
if (soundOn) trkAll(function (T) { if (T.wanted) trkStart(T); });
}
}, { passive: true });
}
} catch (e) { /* 조용히 무시 */ }
}
function init() {
try {
ensureRM();
acquireCanvas();
injectStyle();
bindListeners();
if (!ctx && global.document && global.document.readyState === 'loading') {
global.document.addEventListener('DOMContentLoaded', function () {
acquireCanvas();
}, { once: true });
}
if (!inited) { inited = true; }
startLoop();
bgmWarmSchedule();
sfxWarmSchedule();
} catch (e) { /* 절대 throw 하지 않는다 */ }
return API;
}
var API = {
init: init,
setSound: setSound,
soundOn: function () { return soundOn; },
setVibrate: setVibrate,
resumeAudio: resumeAudio,
unlockAudio: unlockAudio,
sfx: SFX,
burst: burst,
beam: beam,
sweep: sweep,
confetti: confetti,
floatText: floatText,
floatRise: floatRise,
shockwave: shockwave,
feverAura: feverAura,
screenPulse: screenPulse,
vignette: vignette,
vibrate: vibrate,
clear: clearAll,
brokenLink: brokenLink,
lineGuide: lineGuide,
feverEnter: feverEnter,
bgm: BGM,
duck: duck,
voiceClips: VOICE_CLIPS,
sfxClips: SFX_CLIPS
};
global.Juice = API;
})(typeof window !== 'undefined' ? window : this);
