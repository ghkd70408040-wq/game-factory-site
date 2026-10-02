
(function(){
var L=("jelly-box-c,duel-title-play,sian2-ribbon,sian2-btn-pink,sian2-btn-purple,"
+"sian2-btn-orange,sian2-btn-mint,"
+"stage-btn_back,stage-btn_settings,stage-btn_chars,stage-btn_records,"
+"stage-pill_life,stage-pill_coin,stage-pill_star,stage-pill_chapter,"
+"stage-jelly-1,stage-jelly-2,stage-jelly-3,stage-jelly-4,stage-jelly-5,"
+"stage-star-on,stage-star-off,"
+"medal-attack-ko@3x,medal-special-ko@3x,medal-pet-ko@3x,medal-awaken-ko@3x,"
+"duel-btn-pause,"          /* 3단계: duel-hpbar-bone·-wing 은 참조 0 */
+"duel-castle-hd,duel-demon-full,"   /* 3단계: duel-cloud-big/-baby 는 참조 0 */
+"tmr-0,tmr-1,tmr-2,tmr-3,tmr-4,tmr-5,tmr-6,tmr-7,tmr-8,tmr-9,tmr-colon,"
+"cut-free-1,cut-free-2,"
+"glass-capsule-v4,glass-band-v2,glass-hud-bar-st,"
+"sian3-close,art-logo-en,"
+"art-tenten,art-jelly,art-map-bg,ch-boss-face,lib-glyph-target,lib-chapter-plate,"
+"lib-glyph-heart,lib-panel-cream,art-twin-bear-blue-portrait,art-twin-bear-mint-portrait,art-twin-bear-lavender-portrait,art-twin-bear-coral-portrait,"
+"art-twin-bear-rose-portrait,art-twin-bear-blue,art-twin-bear-lavender,art-twin-bear-mint,art-twin-bear-coral,art-twin-bear-rose,"
+"art-throne,art-cut-kick,ch-twin-full,ch-jelly-full,ch-twin-portrait,ch-jelly-portrait,"
+"art-menu-day-w,ch-boss-full,art-twin,art-jelly-royal-portrait,art-menu-night-w,ch-boss-portrait,"
+"ch-ppyak-full,ch-ppyak-portrait,art-cut-smirk,ch-mungchi-full,ch-mungchi-portrait,art-prison,"
+"art-stage,ch-twin-face,art-jelly-royal,ch-jelly-face,ch-boss-face-soda,ch-boss-face-berry,"
+"ch-ten-face,ch-ppyak-face,ch-jelly-thumb-v2,lib-tile-04-peach,lib-tile-02-blueberry,lib-tile-03-grape,"
+"lib-tile-01-soda,ch-twin-thumb-v2,lib-tile-09-strawberry,lib-tile-06-lime,lib-tile-08-lemon,ch-boss-thumb,"
+"lib-tile-07-greengrape,lib-tile-05-tangerine,ch-ten-thumb-v2,ch-mungchi-face,lib-flag-current,"
+"ch-ppyak-thumb-v2,lib-badge-s,lib-medal-silver,lib-medal-gold,lib-badge-c,"
+"lib-badge-a,lib-badge-b,lib-medal-bronze,ch-mungchi-thumb-v2,"
+"lib-glyph-inf,lib-star-gold,lib-glyph-gear,"
+"lib-btn-purple,lib-btn-orange,lib-thumb-frame,lib-glyph-clock,"
+"lib-glyph-flag,lib-btn-mint,lib-glyph-star-empty,lib-glyph-lock,lib-btn-yellow,"
+"lib-glyph-crown,lib-glyph-score,lib-glyph-cal,lib-btn-red,lib-btn-cta-blue,"
+"lib-chip,lib-btn-pink,lib-glyph-back,lib-btn-main-menu,lib-btn-stage-select,lib-thumb-frame-active,"
+"lib-statbar-track,lib-hud-bar,lib-nameplate,"
+"sian3-btn-adventure-blank,sian3-btn-arcade-blank,sian3-btn-daily-blank,sian3-btn-timerush-blank,"
+"sian3-btn-timeattack-blank,sian3-btn-survival-blank,sian3-btn-accum90-blank,"
+"ttl-howto-ko,ttl-settings-ko,ttl-skin-ko,ttl-pause-ko,ttl-over-ko,ttl-rank-ko,"
+"ttl-howto-en,ttl-settings-en,ttl-skin-en,ttl-pause-en,ttl-over-en,ttl-rank-en,"
+"ch-mukmul-face,ch-tiktok-face,ch-kkultteok-face,ch-bangul-face,"
+"ch-tiktok-full").split(",");
var V="stage-btn_back,stage-pill_coin,stage-btn_records,stage-pill_star,stage-btn_settings";
var VQ="?v=9";                                     /* CSS 5곳과 반드시 같은 값 */
var i=0,bgmQueued=0;
function next(){
if(i>=L.length){ if(!bgmQueued){ bgmQueued=1; warmBgm(); } return; }  /* 그림 끝 → BGM */
var n=L[i++],im=new Image();
im.onload=im.onerror=next;                       /* 실패해도 다음 장으로 */
im.src="catalog/"+n+".webp"+(V.indexOf(n)<0?"":VQ);
}
function warm(){ for(var k=0;k<4;k++) next(); }    /* 동시 4장 유지 */
function warmBgm(){
var M=window.TT_AUDIO; if(!M||typeof fetch!=="function") return;
try{ var c=navigator.connection; if(c&&(c.saveData||/(^|-)2g$|^3g$/.test(c.effectiveType||''))) return; }catch(e){}   /* perf2-0908: 3g 도 제외(7.4MB 는 재생 직전 로드) */
if(location.protocol==="file:") return;           /* file:// 은 CORS 로 막힌다 — 소음만 난다 */
var K=["main","mainNight","ingame1","ingame2"],j=0;
(function step(){
if(j>=K.length) return;
var u=M[K[j++]];
if(!u||String(u).indexOf("data:")===0){ step(); return; }   /* 인라인이면 데울 게 없다 */
try{
fetch(u,{credentials:"omit",priority:"low"})   /* perf-0908: 이미지·본문 뒤로 양보(우선순위 힌트, 미지원 브라우저는 무시) */
.then(function(r){ return r.arrayBuffer(); })  /* 본문까지 읽어야 캐시에 앉는다 */
.then(step,step);                              /* 버퍼는 바로 버린다 */
}catch(e){ step(); }
})();
}
var armed=0,loaded=(document.readyState==="complete"),gest=0;
function start(){
if(armed) return; armed=1;
(window.requestIdleCallback||function(f){setTimeout(f,600);})(warm,{timeout:1500});
}
function maybe(){ if(loaded&&gest) start(); }
function onGest(){ gest=1; maybe(); }
["pointerdown","touchstart","keydown"].forEach(function(t){ window.addEventListener(t,onGest,{once:true,passive:true,capture:true}); });
function armSafety(){ setTimeout(function(){ gest=1; maybe(); },30000); }
if(loaded){ maybe(); armSafety(); }
else window.addEventListener("load",function(){ loaded=1; maybe(); armSafety(); });
})();
