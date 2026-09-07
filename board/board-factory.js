/* board-factory.js — 관제탑 화면 페이지의 공장 기능.
 * build-board.py 가 out 디렉터리로 복사한다. 데이터는 페이지에 박힌
 * window.GF_SCREEN(프레임 목록) · window.GF_CANDIDATES(창고 후보)에서만 읽는다.
 *
 * 하는 일 3가지
 *  1) 교체 후보 선택 UI — 훅 있는 프레임만. 훅 없는 부품(🔴)은 select 비활성 + 클릭 차단.
 *  2) pending-swaps 초안 — localStorage 에 쌓고 "내보내기"로 json 텍스트를 보여준다
 *     (정적 페이지라 다운로드 대신 텍스트 + 복사).
 *  3) iframe 프리뷰 — ?screen= 로 게임을 띄우고 preview-shim 을 주입해 훅 값을 미리 본다.
 */
(function () {
  'use strict';

  var SCREEN = window.GF_SCREEN || { id: 'unknown', frames: [], game_key: '' };
  var CANDS = window.GF_CANDIDATES || [];
  var LSKEY = 'gf.pending-swaps';

  /* ── 초안 저장소 ─────────────────────────────────────────────── */
  function loadDraft() {
    try { return JSON.parse(localStorage.getItem(LSKEY) || '{}') || {}; }
    catch (e) { return {}; }
  }
  function saveDraft(d) {
    try { localStorage.setItem(LSKEY, JSON.stringify(d)); } catch (e) {}
  }
  var draft = loadDraft();

  /* ── 후보 목록: 같은 계층 + 같은 역할만 ───────────────────────── */
  function candidatesFor(fr) {
    var out = [];
    for (var i = 0; i < CANDS.length; i++) {
      var c = CANDS[i];
      if (c.tier !== fr.tier) continue;
      if (c.role !== fr.role) continue;
      out.push(c);
    }
    return out;
  }

  /* ── 프레임 칸 배선 ──────────────────────────────────────────── */
  function wireTiles() {
    var tiles = document.querySelectorAll('[data-frame-id]');
    for (var i = 0; i < tiles.length; i++) wireTile(tiles[i]);
  }

  function frameById(id) {
    for (var i = 0; i < SCREEN.frames.length; i++) {
      if (SCREEN.frames[i].id === id) return SCREEN.frames[i];
    }
    return null;
  }

  function wireTile(el) {
    var fr = frameById(el.getAttribute('data-frame-id'));
    if (!fr) return;
    var host = el.querySelector('.gf-swap');
    if (!host) return;

    if (!fr.hook) {
      /* 계약 §4 — 훅 없는 부품은 교체 UI 자체가 잠긴다. */
      host.innerHTML = '<span class="gf-swaplock" title="교체점(hook) 없음 — 정규화 선행">'
        + '🔴 교체 불가 · 교체점 없음</span>';
      el.classList.add('gf-nohook');
      return;
    }

    var list = candidatesFor(fr);
    var cur = draft[fr.id];
    var html = '<select class="gf-swapsel" aria-label="' + fr.id + ' 교체 후보">';
    html += '<option value="">— 현재 값 유지 —</option>';
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      var sel = (cur === c.value) ? ' selected' : '';
      html += '<option value="' + esc(c.value) + '"' + sel + '>' + esc(c.label) + '</option>';
    }
    html += '</select>';
    html += '<button class="gf-swapclr" type="button" title="이 부품 초안 지우기">↺</button>';
    if (!list.length) {
      /* 훅은 있는데 창고에 같은 계층·역할 후보가 없는 경우.
         "교체점 없음(🔴 계약상 차단)"과는 전혀 다른 상태이므로 다른 배지를 쓴다. */
      html = '<span class="gf-swapempty" title="교체점은 있으나 창고에 후보가 없다">'
        + '🟡 후보 0 — 같은 ' + fr.tier + '·' + fr.role + ' 자산 없음</span>';
    }
    host.innerHTML = html;

    var sel = host.querySelector('.gf-swapsel');
    if (sel) {
      sel.onchange = function () {
        if (this.value) { draft[fr.id] = this.value; }
        else { delete draft[fr.id]; }
        saveDraft(draft); renderPending(); markTile(el, fr);
      };
    }
    var clr = host.querySelector('.gf-swapclr');
    if (clr) clr.onclick = function () {
      delete draft[fr.id]; saveDraft(draft);
      if (sel) sel.value = '';
      renderPending(); markTile(el, fr);
    };
    markTile(el, fr);
  }

  function markTile(el, fr) {
    if (draft[fr.id]) el.classList.add('gf-swapped');
    else el.classList.remove('gf-swapped');
  }

  /* ── pending-swaps 패널 ─────────────────────────────────────── */
  function pendingDoc() {
    var swaps = [], id;
    for (id in draft) {
      var fr = frameById(id);
      if (!fr || !fr.hook) continue;      /* 훅 없는 것은 절대 내보내지 않는다 */
      swaps.push({
        frame_id: id,
        screen: SCREEN.id,
        hook: fr.hook,
        from: fr.hook.value,
        to: draft[id]
      });
    }
    swaps.sort(function (a, b) { return a.frame_id < b.frame_id ? -1 : 1; });
    return {
      schema: 'pending-swaps/v1',
      generated_by: 'site/board/screen-' + SCREEN.id + '.html',
      generated_at: new Date().toISOString(),
      screen: SCREEN.id,
      swaps: swaps
    };
  }

  function renderPending() {
    var host = document.getElementById('pending');
    if (!host) return;
    var doc = pendingDoc();
    var n = doc.swaps.length;
    var head = '<div class="gf-pendhead"><b>교체 초안 (pending-swaps)</b>'
      + '<span class="gf-n">' + n + '건</span>'
      + '<button id="pend-export" type="button">내보내기</button>'
      + '<button id="pend-copy" type="button">복사</button>'
      + '<button id="pend-clear" type="button">전부 지우기</button></div>';
    var rows = '';
    for (var i = 0; i < n; i++) {
      var s = doc.swaps[i];
      rows += '<div class="gf-pendrow"><code>' + esc(s.frame_id) + '</code>'
        + '<span class="gf-hk">' + esc(s.hook.name) + '</span>'
        + '<span class="gf-fromto">' + esc(String(s.from)) + ' → <b>' + esc(String(s.to)) + '</b></span></div>';
    }
    if (!n) rows = '<div class="gf-pendrow empty">초안 없음 — 위 칸에서 후보를 고르면 여기에 쌓인다.</div>';
    host.innerHTML = head + rows + '<pre class="gf-pendjson" id="pend-json" hidden></pre>';

    document.getElementById('pend-export').onclick = function () {
      var pre = document.getElementById('pend-json');
      pre.textContent = JSON.stringify(doc, null, 2);
      pre.hidden = false;
      pre.scrollIntoView({ block: 'nearest' });
    };
    document.getElementById('pend-copy').onclick = function () {
      var txt = JSON.stringify(doc, null, 2);
      var pre = document.getElementById('pend-json');
      pre.textContent = txt; pre.hidden = false;
      try {
        var r = document.createRange(); r.selectNodeContents(pre);
        var s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
        document.execCommand('copy');
        this.textContent = '복사됨';
        var b = this;
        setTimeout(function () { b.textContent = '복사'; }, 1200);
      } catch (e) {}
    };
    document.getElementById('pend-clear').onclick = function () {
      draft = {}; saveDraft(draft);
      wireTiles(); renderPending();
    };
  }

  /* ── iframe 프리뷰 ──────────────────────────────────────────── */
  var previewReady = false;

  function shimInject(fr) {
    /* A. 동일 출처 직접 주입. file:// 이거나 교차 출처면 예외가 나고 B 로 간다. */
    try {
      var doc = fr.contentDocument;
      if (!doc) return false;
      if (fr.contentWindow.__gfPreviewShim) return true;
      var s = doc.createElement('script');
      s.src = new URL(fr.getAttribute('data-shim'), location.href).href;
      doc.head.appendChild(s);
      return true;
    } catch (e) { return false; }
  }

  function currentHooks() {
    var hooks = [], i;
    for (i = 0; i < SCREEN.frames.length; i++) {
      var f = SCREEN.frames[i];
      if (!f.hook) continue;
      var v = draft[f.id] || f.hook.value;
      hooks.push({ scope: f.hook.scope || ':root', name: f.hook.name, value: hookCss(f.hook, v) });
    }
    return hooks;
  }
  function hookCss(hook, v) {
    if (hook.type !== 'url') return v;
    if (/^(url\(|var\()/i.test(v)) return v;
    return 'url("' + String(v).replace(/"/g, '\\"') + '")';
  }

  function pushHooks() {
    var fr = document.getElementById('preview');
    if (!fr) return;
    var hooks = currentHooks();
    var status = document.getElementById('prev-status');
    try {
      if (fr.contentWindow && fr.contentWindow.__gfApplyHooks) {
        var n = fr.contentWindow.__gfApplyHooks(hooks);
        if (status) status.textContent = '주입 ' + n + '개 (동일 출처 직접)';
        return;
      }
    } catch (e) {}
    try {
      fr.contentWindow.postMessage({ source: 'gf-board', type: 'hook:batch', hooks: hooks }, '*');
      if (status) status.textContent = previewReady
        ? '주입 요청 ' + hooks.length + '개 (postMessage)'
        : '껍데기 미응답 — file:// 이면 http 로 서빙해야 한다';
    } catch (e2) {
      if (status) status.textContent = '주입 실패: ' + e2;
    }
  }

  function wirePreview() {
    var fr = document.getElementById('preview');
    if (!fr) return;
    var status = document.getElementById('prev-status');
    if (status) status.textContent = '대기 — 「불러오기」를 누르면 게임을 띄운다';

    var load = document.getElementById('prev-load');
    if (load) load.onclick = function () {
      fr.src = fr.getAttribute('data-src');
      if (status) status.textContent = '불러오는 중… (?screen=' + SCREEN.game_key + ')';
    };
    var apply = document.getElementById('prev-apply');
    if (apply) apply.onclick = pushHooks;
    var reset = document.getElementById('prev-reset');
    if (reset) reset.onclick = function () {
      try {
        if (fr.contentWindow && fr.contentWindow.__gfClearHooks) fr.contentWindow.__gfClearHooks();
        else fr.contentWindow.postMessage({ source: 'gf-board', type: 'hook:clear' }, '*');
      } catch (e) {}
      if (status) status.textContent = '초기화';
    };

    fr.addEventListener('load', function () {
      var ok = shimInject(fr);
      if (status) {
        status.textContent = ok
          ? '게임 로드됨 · 껍데기 주입됨 — 「값 주입」으로 미리보기'
          : '게임 로드됨 · 껍데기 주입 불가(교차 출처) — http 로 서빙할 것';
      }
    });

    window.addEventListener('message', function (ev) {
      var d = ev.data;
      if (!d || d.source !== 'gf-preview-shim') return;
      if (d.type === 'ready') { previewReady = true; }
      if (d.type === 'applied' && status) status.textContent = '주입 완료 ' + d.n + '개';
    }, false);
  }

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  wireTiles();
  renderPending();
  wirePreview();
})();
