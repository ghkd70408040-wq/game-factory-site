
(function(){
var KEY=new URLSearchParams(location.search).get('screen');
if(!KEY) return;                                   /* 파라미터 없음 = 부수효과 0 */
function $(i){return document.getElementById(i);}
function open_(i){var e=$(i);return !!(e&&!e.hidden);}
function act(i){var e=$(i);return !!(e&&e.classList&&e.classList.contains('active'));}
function tap(i){var e=$(i);if(!e||e.hidden)return false;try{e.click();}catch(err){}return true;}
function G(){return window.Game;}
function call(n,a){var g=G();if(g&&typeof g[n]==='function'){try{g[n](a);}catch(err){}}}
function till(ok,go){return function(){if(ok())return true;go();return false;};}
var t0=0;
var PRE=[
function(){var g=G();return !!(g&&g.state)&&document.readyState!=='loading';},
function(){var s=$('splash');if(!s||s.hidden)return true;try{s.click();}catch(e){}return false;},
function(){if(!t0)t0=Date.now();return Date.now()-t0>440;},
function(){if(!open_('modal-tutorial'))return true;call('finishTutorial',false);return false;}
];
var SET =till(function(){return open_('modal-settings');},function(){tap('btn-settings');});
var CHAR=till(function(){return open_('charpanel');},function(){tap('char-open');});
var MAP =till(function(){return act('screen-map');},function(){call('openMap');});
var NODE=till(function(){return open_('modal-node');},function(){
if(!tap('map-cur')){var g=G();if(g&&g.store)call('openNodeCard',(g.store.advMax|0)||1);}});
var PLAY=till(function(){return act('screen-game');},function(){tap('node-go');});
var SEQ={
menu:[],
play:[till(function(){return open_('modal-mode');},function(){tap('btn-play');})],
character:[CHAR],
skin:[CHAR,till(function(){return open_('modal-skin');},function(){tap('cp-skin');})],
settings:[SET],
records:[till(function(){return open_('modal-rank');},function(){tap('kd-bot-rec');})],
howto:[SET,till(function(){return open_('modal-howto');},function(){tap('st-howto');})],
story:[till(function(){return act('screen-story');},function(){
var g=G();if(g&&g.playCuts&&g.CUTS_OPEN){try{g.playCuts(g.CUTS_OPEN,'',null);}catch(e){}}})],
map:[MAP],
stageinfo:[MAP,NODE],
game:[MAP,NODE,PLAY],
pause:[MAP,NODE,PLAY,till(function(){return open_('modal-pause');},function(){tap('btn-pause');})],
clear:[MAP,NODE,PLAY,till(function(){return open_('modal-adv');},function(){call('onStageClear');})],
over: [MAP,NODE,PLAY,till(function(){return open_('modal-adv');},function(){call('onGameOver');})]
};
var steps=SEQ[KEY];
if(!steps) return;                                 /* 모르는 키 = 무동작 */
steps=PRE.concat(steps);
var i=0,end=Date.now()+8000;                       /* 최대 8초까지만 재시도 */
(function tick(){
if(i>=steps.length||Date.now()>end) return;
var done=false;
try{done=!!steps[i]();}catch(e){}
if(done)i++;
setTimeout(tick,80);
})();
})();
