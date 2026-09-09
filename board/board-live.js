/* board-live.js — 관제탑 라이브화 (2026-09-08)
 * 이미지 덩이 대신 **진짜 구현**을 보인다:
 *   1. .live-screen  게임 자체를 iframe(../tentwin.html?screen=<키>)으로 띄운다. 390×844 를 칸 폭에 맞춰 축소.
 *      로드 실패/시간 초과에만 캡처 이미지로 물러나고 "캡처(폴백)" 칩을 단다. 첫 라이브 화면은 id="preview" 로
 *      board-factory.js(교체 후보·pending-swaps·훅 주입)의 프리뷰가 된다. preview-shim.js 를 iframe 에 주입한다.
 *   2. .part[data-live-sel]  부품 타일을 누르면 같은 화면 카드의 라이브 iframe 안 그 요소를 스포트라이트.
 *   3. 라이브 인스턴스: 정본 CSS(engine+theme) data-part · 게임 인라인 CSS 추출본(game-parts.css)으로 그리는
 *      고정 마크업(game:키) 및 게임 DOM 에서 뽑은 살아 있는 스니펫(snip:키, game-markup.json) · 레터링 · 실제 프레임 파일.
 *      .state-bar 로 크기·Mode·State 를 실제 DOM 속성으로 바꾼다.
 *   4. board-frames.json(매니페스트에서 편 것)을 데이터 원천으로 창고 「프레임 선반」을 그리고,
 *      화면 페이지에는 window.GF_SCREEN / GF_CANDIDATES 를 세워 board-factory.js 를 붙인다(중복 구현 없음).
 * 인라인 style 0 — 값은 board-live.css / board.css 토큰. 게임 파일은 읽기만(iframe) 한다. */
(function () {
  'use strict';
  var GAME = '../tentwin.html';
  var W = 390, H = 844;
  var MARKUP = null, FRAMES = null, CATALOG = null;
  var KIT = !!(document.body && document.body.classList.contains('kit-page'));

  function el(html) { var t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstChild; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function chip(cls, txt) { return '<span class="state ' + cls + '">' + esc(txt) + '</span>'; }
  function getJSON(url) { return fetch(url).then(function (r) { if (!r.ok) throw new Error(url + ' ' + r.status); return r.json(); }); }

  /* ------------------------------------------------------------ 1. 라이브 화면 */
  var MAX_LIVE = 2, live = [], previewTaken = false;
  function fitScale(box) { var w = box.clientWidth || W; box.style.setProperty('--live-scale', Math.min(1, w / W).toFixed(4)); }
  function injectShim(ifr) {
    try {
      var d = ifr.contentDocument; if (!d || d.getElementById('gf-preview-shim')) return true;
      var sc = d.createElement('script'); sc.id = 'gf-preview-shim'; sc.src = new URL('preview-shim.js', location.href).href; d.head.appendChild(sc);
      return true;
    } catch (e) { return false; }
  }
  function mountScreen(box) {
    var key = box.getAttribute('data-screen'), fb = box.getAttribute('data-fallback');
    var src = GAME + '?screen=' + encodeURIComponent(key);
    var isPreview = !previewTaken; previewTaken = true;
    var frame = el('<div class="live-frame"><iframe class="live-iframe"' + (isPreview ? ' id="preview" data-src="' + esc(src) + '" data-shim="preview-shim.js"' : '') + ' title="' + esc(key) + ' 라이브"></iframe></div>');
    var status = el('<div class="live-status">' + chip('state-partial', '불러오는 중') + '<span class="mono live-src">?screen=' + esc(key) + '</span></div>');
    box.appendChild(frame); box.appendChild(status); fitScale(box);
    var ifr = frame.querySelector('iframe'), done = false;
    function fallback(reason) {
      if (done) return; done = true; frame.remove();
      if (fb) box.appendChild(el('<img class="live-fallback" src="' + esc(fb) + '" alt="' + esc(key) + ' 캡처">'));
      status.innerHTML = chip('state-none', '캡처(폴백)') + '<span class="mono live-src">' + esc(reason) + '</span>';
      box.classList.add('is-fallback');
    }
    function ok() {
      if (done) return; done = true;
      var shim = injectShim(ifr);
      /* 0908 — 첫 실행 프로필에서 ?screen=game 은 1탄 진입 때 여는 컷툰(screen-story)에 멈춘다. 게임 파일은 무접촉,
         관제탑 쪽에서 컷툰이 떠 있으면 게임 자체의 건너뛰기(#cut-skip)를 눌러 준다(최대 20초, 80ms 간격). */
      (function skipStory(t0) {
        try {
          var d = ifr.contentDocument, st = d && d.getElementById('screen-story'), sk = d && d.getElementById('cut-skip');
          if (st && st.classList.contains('active') && sk && !sk.hidden) sk.click();
        } catch (e) {}
        if (Date.now() - t0 < 20000 && ifr.isConnected) setTimeout(function () { skipStory(t0); }, 80);
      })(Date.now());
      status.innerHTML = chip('state-ok', '라이브') + '<span class="mono live-src">' + esc(src) + (shim ? ' · 껍데기 주입' : '') + '</span>';
      box.classList.add('is-live'); live.push(box);
      while (live.length > MAX_LIVE) unmount(live.shift());
    }
    var timer = setTimeout(function () { fallback('시간 초과 12s'); }, 12000);
    ifr.addEventListener('load', function () {
      clearTimeout(timer);
      try { var d = ifr.contentDocument; if (!d || !d.body || d.body.childElementCount === 0) return fallback('문서 접근 불가'); ok(); }
      catch (e) { fallback('동일 출처 아님'); }
    });
    ifr.addEventListener('error', function () { clearTimeout(timer); fallback('로드 오류'); });
    ifr.src = src; box._ifr = ifr;
  }
  function unmount(box) {
    if (box.querySelector('#preview')) return;           /* 프리뷰(board-factory) 는 내리지 않는다 */
    var f = box.querySelector('.live-frame'); if (f) f.remove();
    var s = box.querySelector('.live-status'); if (s) s.innerHTML = chip('state-partial', '잠시 내림 (스크롤하면 다시 켬)');
    box.classList.remove('is-live'); box._ifr = null; box._mounted = false;
    var i = live.indexOf(box); if (i >= 0) live.splice(i, 1);
  }
  function initScreens() {
    var boxes = document.querySelectorAll('.live-screen'); if (!boxes.length) return;
    var io = ('IntersectionObserver' in window) ? new IntersectionObserver(function (es) {
      es.forEach(function (e) { var b = e.target; if (e.isIntersecting && !b._mounted) { b._mounted = true; mountScreen(b); } });
    }, { rootMargin: '200px' }) : null;
    boxes.forEach(function (b) { if (io) io.observe(b); else { b._mounted = true; mountScreen(b); } });
    window.addEventListener('resize', function () { boxes.forEach(fitScale); });
  }

  /* ------------------------------------------------------------ 2. 스포트라이트 */
  var SPOT_CSS = '[data-gf-spot]{outline:3px solid #37c46a !important;outline-offset:2px !important;' +
    'box-shadow:0 0 0 4px rgba(55,196,106,.35),0 0 0 9999px rgba(0,0,0,.55) !important;position:relative;z-index:2147483000 !important;}';
  function spotlight(box, sel) {
    var ifr = box && box._ifr; if (!ifr) return false;
    var d; try { d = ifr.contentDocument; } catch (e) { return false; }
    if (!d) return false;
    var st = d.getElementById('gf-spot-style');
    if (!st) { st = d.createElement('style'); st.id = 'gf-spot-style'; st.textContent = SPOT_CSS; d.head.appendChild(st); }
    d.querySelectorAll('[data-gf-spot]').forEach(function (n) { n.removeAttribute('data-gf-spot'); });
    if (!sel) return true;
    var t = null; try { t = d.querySelector(sel); } catch (e) { t = null; }
    if (!t) return false;
    t.setAttribute('data-gf-spot', '1');
    try { t.scrollIntoView({ block: 'center', inline: 'center' }); } catch (e) { }
    return true;
  }
  function initSpot() {
    document.querySelectorAll('.part[data-live-sel]').forEach(function (p) {
      var lab = p.querySelector('.part-label');
      if (lab && !KIT && !lab.querySelector('.part-live-sel')) lab.appendChild(el('<div class="part-live-sel mono">' + esc(p.getAttribute('data-live-sel')) + '</div>'));
      if (KIT) p.title = (p.title ? p.title + ' · ' : '') + p.getAttribute('data-live-sel');
      p.addEventListener('click', function (ev) {
        if (ev.target.closest('.gf-swap, select, button')) return;
        var card = p.closest('.screen-card') || document;
        var box = card.querySelector('.live-screen') || document.querySelector('.live-screen.is-live') || document.querySelector('.live-screen'); if (!box) return;
        ev.preventDefault();
        var on = !p.classList.contains('is-spot');
        card.querySelectorAll('.part.is-spot').forEach(function (x) { x.classList.remove('is-spot'); });
        var hit = spotlight(box, on ? p.getAttribute('data-live-sel') : null);
        if (on) {
          p.classList.add('is-spot');
          var s = box.querySelector('.live-status');
          if (s) s.innerHTML = (hit ? chip('state-ok', '스포트라이트') : chip('state-none', box._ifr ? '요소 없음(숨김 상태)' : '라이브 아님'))
            + '<span class="mono live-src">' + esc(p.getAttribute('data-live-sel')) + '</span>';
          box.scrollIntoView({ block: 'nearest' });
        }
      });
    });
  }

  /* ------------------------------------------------------------ 3. 라이브 렌더러 */
  var FX = '<div class="work-frame__body"></div><i class="wf-fx wf-fx--L20"></i><i class="wf-fx wf-fx--L2a"></i><i class="wf-fx wf-fx--L2b"></i><i class="wf-fx wf-fx--L2c"></i><i class="wf-fx wf-fx--L2d"></i><i class="wf-fx wf-fx--L3"></i>';
  var SHAPE = { modal: 'rect', capsule: 'stadium', hud: 'step', wing: 'step', chip: 'circle', slot: 'rect', charsel: 'rect' };
  var GAME_MARKUP = {
    'btn-primary': function (t) { return '<button class="btn btn-primary gp-stage-btn" type="button">' + esc(t || 'Play') + '</button>'; },
    'btn-secondary': function (t) { return '<button class="btn btn-secondary gp-stage-btn" type="button">' + esc(t || 'Ranking') + '</button>'; },
    'btn-ghost': function (t) { return '<button class="btn btn-ghost gp-stage-btn" type="button">' + esc(t || 'How to play') + '</button>'; },
    'toggle': function (t) { return '<button class="set-tg" type="button" aria-pressed="true">' + esc(t || 'ON') + '</button>'; },
    'dots': function () { var s = ''; for (var i = 0; i < 7; i++) s += '<i class="dot' + (i === 0 ? ' on' : '') + '"></i>'; return '<div id="howto-dots">' + s + '</div>'; },
    'hcard': function () { return '<div id="modal-howto" class="gp-hcard-host"><div class="howto-art rules-card gp-hcard"></div></div>'; },
    'chip': function () { return '<div id="charpanel" class="gp-chip-host"><div class="cp-info"><div class="ci ci-ten"><span class="ci-chip kit-slot-v2 kit-slot-v2--portrait ch-ten" aria-hidden="true"></span></div></div></div>'; },
    'icon-btn': function () { return '<button class="icon-btn" type="button" aria-label="Pause"><svg class="ic" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M7 5h4v14H7zM13 5h4v14h-4z"/></svg></button>'; }
  };
  var STATE_DEFS = {
    part: { pressed: false, disabled: false, selected: false },
    'btn-primary': { pressed: true, disabled: false, selected: false }, 'btn-secondary': { pressed: true, disabled: false, selected: false },
    'btn-ghost': { pressed: true, disabled: false, selected: false }, toggle: { pressed: true, disabled: false, selected: true },
    'icon-btn': { pressed: true, disabled: true, selected: true }, dots: { pressed: false, disabled: false, selected: true },
    hcard: { pressed: false, disabled: false, selected: false }, chip: { pressed: false, disabled: true, selected: false },
    snip: { pressed: true, disabled: false, selected: true }, letter: { pressed: false, disabled: false, selected: false }, file: { pressed: false, disabled: false, selected: false }
  };
  /* 스니펫: 조상 껍데기(wrap 체인)를 id/class 로 세워 CSS 조상 선택자를 맞춘다 — 껍데기 레이아웃 규칙은 추출에서 뺐다 */
  function snipHtml(key) {
    var s = MARKUP && MARKUP.snippets && MARKUP.snippets[key]; if (!s || !s.html) return null;
    var open = '', close = '';
    (s.wrap || []).forEach(function (w) {
      open += w.charAt(0) === '#' ? '<div id="' + esc(w.slice(1)) + '" class="gp-wrap">' : '<div class="gp-wrap ' + esc(w.slice(1)) + '">';
      close += '</div>';
    });
    var html = s.html.replace(/^(<[a-z0-9]+)(\s+class=")/i, '$1$2gp-root ').replace(/^(<[a-z0-9]+)(?![^>]*\sclass=)/i, '$1 class="gp-root"');
    return '<div class="gp-snip" data-snip="' + esc(key) + '" data-snip-sel="' + esc(s.sel) + '">' + open + html + close + '</div>';
  }
  function renderLive(lv, o) {
    o = o || {}; if (!lv) return null;
    if (lv.type === 'part') {
      return '<div class="wf-wrap live-inst" data-live-kind="part" data-shape="' + esc(SHAPE[lv.part] || 'rect') + '" data-size="' + esc(o.size || 'm') + '">'
        + '<div class="work-frame" data-part="' + esc(lv.part) + '" data-theme="' + esc(o.theme || lv.theme || 'pink') + '">' + FX + '</div></div>';
    }
    if (lv.type === 'game') { var f = GAME_MARKUP[lv.key]; if (!f) return null;
      return '<div class="live-inst gp-size-' + esc(o.size || 'm') + '" data-live-kind="' + esc(lv.key) + '"><div class="gp-scope">' + f(o.text) + '</div></div>'; }
    if (lv.type === 'snip') { var h = snipHtml(lv.key); if (!h) return null;
      return '<div class="live-inst gp-size-' + esc(o.size || 'm') + '" data-live-kind="snip"><div class="gp-scope">' + h + '</div></div>'; }
    if (lv.type === 'letter') return '<div class="live-inst gp-size-' + esc(o.size || 'm') + '" data-live-kind="letter"><div class="modal-v2 gp-letter"><h2 class="mvh-title">' + esc(o.text || '게임 방법') + '</h2></div></div>';
    if (lv.type === 'file') { var src = (o.file && o.file.src) || lv.src; if (!src) return null;
      return '<div class="live-inst" data-live-kind="file"><img class="frame-file" src="' + esc(src) + '" alt="' + esc(o.id || '') + '" loading="lazy"></div>'; }
    return null;
  }
  function applyState(scope, kind, val) {
    scope.querySelectorAll('.live-inst').forEach(function (inst) {
      var k = inst.getAttribute('data-live-kind'), defs = STATE_DEFS[k] || STATE_DEFS.file;
      if (kind === 'theme') {
        inst.querySelectorAll('.work-frame').forEach(function (n) { n.setAttribute('data-theme', val); });
      } else if (kind === 'size') {
        inst.querySelectorAll('.wf-wrap').forEach(function (n) { n.setAttribute('data-size', val); });
        if (inst.classList.contains('wf-wrap')) inst.setAttribute('data-size', val);
        inst.classList.remove('gp-size-s', 'gp-size-m', 'gp-size-l'); inst.classList.add('gp-size-' + val);
      } else {
        var b = inst.querySelector('button, .work-frame, .mvh-title, .frame-file, .gp-snip > *');
        inst.querySelectorAll('.gp-pressed,.gp-disabled,.is-selected').forEach(function (n) { n.classList.remove('gp-pressed', 'gp-disabled', 'is-selected'); });
        inst.querySelectorAll('[disabled]').forEach(function (n) { n.removeAttribute('disabled'); });
        inst.querySelectorAll('.set-tg').forEach(function (n) { n.setAttribute('aria-pressed', 'true'); });
        inst.querySelectorAll('.icon-btn').forEach(function (n) { n.classList.remove('off'); });
        inst.querySelectorAll('#howto-dots .dot').forEach(function (n, i) { n.classList.toggle('on', i === 0); });
        inst.setAttribute('data-state', val);
        var has = val === 'default' ? true : !!defs[val];
        inst.classList.toggle('is-undefined-state', !has);
        if (!b || !has) return;
        if (val === 'pressed') { b.classList.add('gp-pressed'); inst.querySelectorAll('button').forEach(function (n) { n.classList.add('gp-pressed'); }); }
        if (val === 'disabled') { b.classList.add('gp-disabled'); b.setAttribute('disabled', ''); if (b.classList.contains('icon-btn')) b.classList.add('off'); }
        if (val === 'selected') {
          if (b.classList.contains('set-tg')) b.setAttribute('aria-pressed', 'false');
          else if (k === 'dots') inst.querySelectorAll('#howto-dots .dot').forEach(function (n, i) { n.classList.toggle('on', i === 3); });
          else { b.classList.add('is-selected'); inst.querySelectorAll('.set-tg').forEach(function (n) { n.setAttribute('aria-pressed', 'false'); }); inst.querySelectorAll('.cp-tab, .cpt, .char-card').forEach(function (n) { n.classList.add('on', 'active', 'is-selected'); }); }
        }
      }
    });
  }
  function stateBar() {
    return '<div class="state-bar">'
      + '<span class="state-bar-k">크기</span><button type="button" class="state-btn" data-set-size="s">S</button><button type="button" class="state-btn is-current" data-set-size="m">M</button><button type="button" class="state-btn" data-set-size="l">L</button>'
      + '<span class="state-bar-k">Mode</span><button type="button" class="state-btn is-current" data-set-theme="pink">A 모달</button><button type="button" class="state-btn" data-set-theme="sky">B 모달 밖</button>'
      + '<span class="state-bar-k">State</span><button type="button" class="state-btn is-current" data-set-state="default">Default</button><button type="button" class="state-btn" data-set-state="pressed">Pressed</button><button type="button" class="state-btn" data-set-state="disabled">Disabled</button><button type="button" class="state-btn" data-set-state="selected">Selected</button>'
      + '<span class="state-bar-note">실제 DOM 속성(data-size · data-theme · class/aria) 전환. 정본에 그 상태 규칙이 없으면 <span class="state state-none">정의 없음</span>.</span></div>';
  }
  function initStateBars() {
    document.querySelectorAll('.state-bar').forEach(function (bar) {
      if (bar._wired) return; bar._wired = true;
      var scope = bar.closest('.frame-card, .screen-card, .shelf-frames, .page') || bar.parentNode;
      bar.addEventListener('click', function (ev) {
        var b = ev.target.closest('.state-btn'); if (!b) return;
        var kind = b.hasAttribute('data-set-size') ? 'size' : b.hasAttribute('data-set-theme') ? 'theme' : 'state';
        var val = b.getAttribute('data-set-size') || b.getAttribute('data-set-theme') || b.getAttribute('data-set-state');
        bar.querySelectorAll('[data-set-' + kind + ']').forEach(function (x) { x.classList.remove('is-current'); });
        b.classList.add('is-current'); applyState(scope, kind, val);
      });
    });
  }
  function parseSpec(spec) {
    var m, lv = null, o = {};
    if ((m = /^part:([a-z]+)(?::([a-z]+))?$/.exec(spec))) lv = { type: 'part', part: m[1], theme: m[2] || 'pink' };
    else if ((m = /^game:([a-z-]+)(?::(.*))?$/.exec(spec))) { lv = { type: 'game', key: m[1] }; o.text = m[2]; }
    else if ((m = /^snip:([a-z-]+)$/.exec(spec))) lv = { type: 'snip', key: m[1] };
    else if ((m = /^letter(?::(.*))?$/.exec(spec))) { lv = { type: 'letter' }; o.text = m[1]; }
    else if ((m = /^file:(.+)$/.exec(spec))) { lv = { type: 'file' }; o.file = { src: m[1] }; }
    return { lv: lv, o: o };
  }
  function initPanes() {
    document.querySelectorAll('[data-live]').forEach(function (pane) {
      if (pane.querySelector('.live-inst, .live-none')) return;
      var p = parseSpec(pane.getAttribute('data-live')); p.o.size = pane.getAttribute('data-live-size') || 'm';
      var html = renderLive(p.lv, p.o);
      pane.insertAdjacentHTML('beforeend', html || '<div class="live-none">' + chip('state-none', '미구현') + ' 라이브 렌더 없음</div>');
    });
    document.querySelectorAll('[data-state-bar]').forEach(function (h) { if (!h.querySelector('.state-bar')) h.insertAdjacentHTML('afterbegin', stateBar()); });
  }


  /* ------------------------------------------------------------ 3.5 킷 판 배율
     킷 시트 규칙 ④ "같은 줄 = 같은 크기 기준선". 게임 DOM 조각은 제 크기대로 나오므로
     타일 안에 꽉 차도록 배율(--kit-fit) 을 재서 준다. 값은 CSS 변수 하나 — 레이아웃은 안 건드린다. */
  function fitKit() {
    if (!KIT) return;
    document.querySelectorAll('.kit-panel .part-stage--live').forEach(function (st) {
      var c = st.firstElementChild; if (!c || c.classList.contains('live-none')) return;
      c.style.setProperty('--kit-fit', '1');
      var r = c.getBoundingClientRect(), W = st.clientWidth, H = st.clientHeight;
      if (!r.width || !r.height || !W || !H) return;
      var s = Math.min(W / r.width, H / r.height);
      /* 글이 든 조각을 키우면 글씨만 커져 제 틀 밖으로 샌다 — 줄이기만 한다.
         그림뿐인 조각(화살표·방울·아이콘)은 타일에 꽉 차게 키운다. */
      var cap = (c.textContent || '').trim() ? 1 : 2.2;
      s = Math.max(0.12, Math.min(cap, s));
      c.style.setProperty('--kit-fit', s.toFixed(3));
    });
  }

  /* ------------------------------------------------------------ 4. 프레임 선반 · board-factory 연결 */
  var TIER_NAME = { T1: '화면', T2: '컨테이너', T3: '제어', T4: '내용물', T5: '효과' };
  function tierBadge(t) { return '<span class="tier tier-' + (t ? t.toLowerCase() : 'none') + '">' + esc(t || '—') + '</span>'; }
  function liveChip(f) {
    var lv = f.live;
    if (!lv) return chip('state-none', f.kind === 'preview' ? '합성 미리보기 — 표시 금지' : '미구현(발주·배선 대기)');
    if (lv.type === 'part') return chip('state-ok', '라이브 · engine+theme');
    if (lv.type === 'game') return chip('state-ok', '라이브 · 게임 CSS 추출본');
    if (lv.type === 'snip') return chip('state-ok', '라이브 · 게임 DOM+CSS');
    if (lv.type === 'letter') return chip('state-ok', '라이브 · 레터링');
    if (lv.type === 'file') {
      if (f.kind === 'source') return chip('state-partial', '원본 파일 · 출처/은퇴');
      if (f.origin === 'vector') return chip('state-partial', '원본 파일 · 벡터 재렌더(배선 대기)');
      return chip('state-ok', '원본 파일 그대로');
    }
    return chip('state-none', '미구현');
  }
  var KIT = document.body && document.body.classList.contains('kit-page');
  function frameTile(f) {
    var body = renderLive(f.live, { id: f.id, file: f.file, size: 'm', theme: f.live && f.live.theme });
    if (KIT) {
      /* 킷 격자: 그림 + 이름 한 낱말(역할)만. 자세한 것은 title 로만 — 눈에 보이는 글 0 */
      var st = !f.live ? 'is-none' : 'is-live';
      var tip = f.id + ' · ' + (f.impl || '') + '/' + (f.kind || '') + ' · hook ' + (f.hook || 'null') + ' · 소비처 ' + (f.consumers ? f.consumers.length : 0) + (f.file && !f.file.missing ? ' · ' + f.file.src : '');
      return '<div class="part frame-tile ' + st + '" data-frame-id="' + esc(f.id) + '" data-tier="' + esc(f.tier) + '" title="' + esc(tip) + '">'
        + '<div class="part-stage part-stage--live">' + (body || '<div class="live-none"></div>') + '</div>'
        + (st === 'is-none' ? '' : '<div class="part-label"><div class="part-name">' + esc(f.role || '부품') + '</div></div>') + '</div>';
    }
    var fm = f.file && !f.file.missing ? f.file : null;
    var fileLine = fm ? esc(fm.src.replace(/^.*\//, '')) + (fm.w ? ' · ' + fm.w + '×' + fm.h : '') + (fm.kb ? ' · ' + fm.kb + 'KB' : '') : '파일 없음(코드 프레임)';
    return '<div class="part frame-tile" data-frame-id="' + esc(f.id) + '" data-hook="' + esc(f.hook_obj ? f.hook_obj.name : '') + '" data-tier="' + esc(f.tier) + '" data-impl="' + esc(f.impl) + '">'
      + '<div class="part-stage part-stage--live">' + (body || '<div class="live-none">' + chip('state-none', '미구현') + '</div>') + '</div>'
      + '<div class="part-label"><div class="part-name">' + tierBadge(f.tier) + esc(f.id) + '</div>'
      + '<div class="part-file">' + fileLine + '</div>'
      + '<div class="part-hook mono">hook ' + (f.hook ? esc(f.hook) : '<span class="value-missing">null(미정규화)</span>') + (f.hook && !f.hook_obj ? ' <span class="state state-none">🔴 형식 불가</span>' : '') + '</div>'
      + '<div class="part-tags"><span class="verdict verdict-' + esc(f.impl || 'ambiguous') + '">' + esc(f.impl) + '</span><span class="tag">' + esc(f.kind) + '</span>' + liveChip(f)
      + '<span class="tag">소비처 ' + (f.consumers ? f.consumers.length : 0) + '</span>' + (f.todo_n ? '<span class="tag">todo ' + f.todo_n + '</span>' : '') + '</div>'
      + '<div class="gf-swap"></div>'
      + '<div class="part-goto">' + esc(f.screen) + ' · ' + esc(f.role) + ' · ' + esc((f.source || '').slice(0, 60)) + '</div>'
      + '</div></div>';
  }
  function renderShelf(host, frames) {
    var by = {}; frames.forEach(function (f) { (by[f.tier || '—'] = by[f.tier || '—'] || []).push(f); });
    var html = '', tot = { live: 0, file: 0, none: 0 };
    ['T1', 'T2', 'T3', 'T4', 'T5', '—'].forEach(function (t) {
      var g = by[t]; if (!g || !g.length) return;
      var n = { live: 0, file: 0, none: 0 };
      g.forEach(function (f) { var k = !f.live ? 'none' : (f.live.type === 'file' ? 'file' : 'live'); n[k]++; tot[k]++; });
      html += '<div class="shelf-group" data-tier="' + esc(t) + '">';
      html += '<div class="shelf-tier">' + tierBadge(t) + '<span class="shelf-name">' + esc(TIER_NAME[t] || '미분류') + '</span>'
        + (KIT ? '' : '<span class="shelf-tally">프레임 ' + g.length + ' · 라이브 ' + n.live + ' · 원본 파일 ' + n.file + ' · 미구현 ' + n.none + '</span>') + '</div>';
      html += '<div class="shelf-frames"><div class="part-list part-list--frames">' + g.map(frameTile).join('') + '</div></div>';
      html += '</div>';
    });
    host.innerHTML = html; return tot;
  }
  function candidates() {
    var ROLE_TIER = { '배경': 'T1', '판': 'T2', '캡슐': 'T2', '바·게이지': 'T2', '버튼': 'T3', '그림버튼': 'T3', '탭': 'T3', '토글': 'T3', '슬롯': 'T3', '칩·방울': 'T3', 'X': 'T3', '제목그림': 'T4', '아이콘': 'T4', '배지': 'T4', '전신·초상': 'T4', '효과': 'T5' };
    return (CATALOG || []).map(function (c) { return { tier: ROLE_TIER[c.role] || '—', role: c.role, value: '../catalog/' + c.stem + '.webp', label: c.stem + ' (' + c.w + '×' + c.h + ')' }; });
  }
  function screenFrames(id) {
    var map = { hud: 'HUD', modal: 'modal', charsel: 'charsel', map: 'map' };
    return (FRAMES || []).filter(function (f) { return f.screen === map[id]; }).map(function (f) {
      return { id: f.id, tier: f.tier, role: f.role, hook: f.hook_obj ? { type: f.hook_obj.type, name: f.hook_obj.name, scope: f.hook_obj.scope, value: f.hook_obj.value || (f.file && f.file.src) || '' } : null };
    });
  }
  function loadFactory() {
    if (KIT) return;               /* 교체 UI(select) 는 공장·관문실 전용 — 킷 페이지에는 그림만 */
    if (!document.querySelector('[data-frame-id]')) return;
    /* 페이지가 이미 GF_SCREEN 을 들고 있으면(공장 페이지 = 생성기가 매니페스트에서 직접 심는다)
       덮어쓰지 않는다. 덮어쓰면 진실원이 board-frames.json 과 매니페스트 둘로 갈려
       훅 수가 달라진다(교체점 50 ↔ 40) — CONTRACT.md §1 「매니페스트 = 유일 진실원」. */
    if (window.GF_SCREEN) return;
    var page = (location.pathname.match(/screen-([a-z]+)\.html/) || [])[1] || 'warehouse';
    var GAME_KEY = { hud: 'game', modal: 'howto', charsel: 'character', map: 'map' }[page] || '';
    window.GF_SCREEN = { id: page, frames: (page === 'warehouse' ? (FRAMES || []).map(function (f) { return { id: f.id, tier: f.tier, role: f.role, hook: f.hook_obj ? { type: f.hook_obj.type, name: f.hook_obj.name, scope: f.hook_obj.scope, value: f.hook_obj.value || '' } : null }; }) : screenFrames(page)), game_key: GAME_KEY };
    window.GF_CANDIDATES = candidates();
    var sc = document.createElement('script'); sc.src = 'board-factory.js'; document.body.appendChild(sc);
  }
  function initFrameShelf() {
    var host = document.getElementById('frame-shelf'); if (!host) return;
    var tot = renderShelf(host, FRAMES || []);
    var tally = document.getElementById('frame-tally');
    if (tally) tally.innerHTML = '매니페스트 프레임 <b>' + FRAMES.length + '</b> · 라이브 렌더 <b>' + tot.live + '</b> · 원본 파일 <b>' + tot.file + '</b> · 미구현 <b>' + tot.none + '</b>';
    initStateBars();
  }
  /* 화면 페이지 부품 타일에 data-frame-id 가 있으면 매니페스트 정보줄 + .gf-swap 호스트를 붙인다 */
  function decorateTiles() {
    if (!FRAMES) return;
    document.querySelectorAll('.part[data-frame-id]').forEach(function (p) {
      var f = FRAMES.filter(function (x) { return x.id === p.getAttribute('data-frame-id'); })[0]; if (!f) return;
      var lab = p.querySelector('.part-label'); if (lab && lab.querySelector('.part-hook')) return;
      if (!lab && !KIT) return;
      p.setAttribute('data-hook', f.hook_obj ? f.hook_obj.name : '');
      if (KIT) { p.title = f.id + ' · hook ' + (f.hook || 'null') + (f.hook && !f.hook_obj ? ' (형식 불가)' : '') + (p.title ? ' · ' + p.title : ''); if (!f.live && !f.file && !p.querySelector('.part-stage img, .part-stage [data-live], .part-stage .live-inst')) p.classList.add('is-none'); return; }
      lab.insertAdjacentHTML('beforeend', '<div class="part-hook mono">' + esc(f.id) + ' · hook ' + (f.hook ? esc(f.hook) : '<span class="value-missing">null</span>') + (f.hook && !f.hook_obj ? ' <span class="state state-none">🔴 형식 불가</span>' : '') + '</div><div class="gf-swap"></div>');
    });
  }

  /* ------------------------------------------------------------ 시작 */
  function init() {
    Promise.all([
      getJSON('game-markup.json').catch(function () { return null; }),
      getJSON('board-frames.json').catch(function () { return null; }),
      getJSON('board-data.json').catch(function () { return null; })
    ]).then(function (r) {
      MARKUP = r[0]; FRAMES = r[1] && r[1].frames; CATALOG = r[2] && r[2].catalog;
      initPanes(); initStateBars(); initScreens(); initSpot(); initFrameShelf(); decorateTiles(); loadFactory();
      fitKit(); setTimeout(fitKit, 400); setTimeout(fitKit, 1400);
      window.addEventListener('resize', fitKit);
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  window.GFLive = { renderLive: renderLive, spotlight: spotlight };
})();
