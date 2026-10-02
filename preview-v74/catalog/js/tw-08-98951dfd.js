
(function () {
if (typeof window === 'undefined' || !window.history || !window.history.pushState) return;
var d = window.document;
var SENTINEL = 'tw-back';
function guard() {
try {
if (!history.state || history.state.tw !== SENTINEL) {
history.pushState({ tw: SENTINEL }, '');
}
} catch (e) { /* 사파리 사생활 모드 등: 뒤로가기는 원래대로 동작한다 */ }
}
function vis(el) { return !!(el && !el.hidden && el.getClientRects().length); }
function isOpen(id) { var e = d.getElementById(id); return !!(e && !e.hidden); }
function tap(id) {
var b = d.getElementById(id);
if (!vis(b) || !b.click) return false;
try { b.click(); } catch (e) { return false; }
return true;
}
var SELF_BACK = [
['modal-skin',     'sk-close'],
['modal-settings', 'st-close'],
['modal-over',     'btn-menu'],
['modal-arc',      'arc-menu'],
['modal-daily',    'btn-daily-menu'],
['modal-clear',    '']
];
function selfBackId(id) {
for (var i = 0; i < SELF_BACK.length; i++) { if (SELF_BACK[i][0] === id) return true; }
return false;
}
function selfBack() {
for (var i = 0; i < SELF_BACK.length; i++) {
if (!isOpen(SELF_BACK[i][0])) continue;
if (SELF_BACK[i][1] && tap(SELF_BACK[i][1])) return true;
var G = window.Game;
if (G && G.menu) { G.menu(); return true; }
return true;   /* 손잡이를 못 찾아도 앱을 닫지는 않는다 */
}
return false;
}
function openSheet() {
try {
var ms = d.querySelectorAll('.modal');
for (var i = 0; i < ms.length; i++) {
if (ms[i].id === 'modal-pause') continue;   /* 일시정지는 아래에서 따로 */
if (selfBackId(ms[i].id)) continue;         /* 위 SELF_BACK 이 가져간다 */
if (!ms[i].hidden) return ms[i];
}
} catch (e) {}
return null;
}
function esc() {
try {
d.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
} catch (e) {
}
}
function step() {
var G = window.Game, S = G && G.state;
if (vis(d.getElementById('charintro')) || vis(d.getElementById('charget'))) {
esc(); return true;
}
if (isOpen('modal-confirm')) { esc(); return true; }
if (isOpen('modal-rank')) { esc(); return true; }
if (selfBack()) return true;
if (isOpen('modal-minimap')) { esc(); return true; }
if (openSheet()) { esc(); return true; }
var cp = d.getElementById('charpanel');
if (vis(cp)) { tap('cp-close'); return true; }
var story = d.getElementById('screen-story');
if (story && story.classList && story.classList.contains('active')) {
if (!tap('cut-skip')) esc();
if (story.classList.contains('active') && !vis(d.getElementById('charpanel'))
&& G && G.menu) { G.menu(); }
return true;
}
if (S && S.paused) {
if (S.mode === 'adv' && G.advAbandon) { G.advAbandon(); return true; }
if (G.menu) { G.menu(); return true; }
return true;
}
var map = d.getElementById('screen-map');
if (map && map.classList && map.classList.contains('active')) { esc(); return true; }
if (S && S.running) { esc(); return true; }
return false;
}
window.addEventListener('popstate', function () {
if (!step()) return;   /* 루트: 파수꾼을 다시 쌓지 않는다 = 종료 허용 */
guard();
});
if (d.readyState === 'complete' || d.readyState === 'interactive') guard();
else window.addEventListener('DOMContentLoaded', guard);
})();
