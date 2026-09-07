/* preview-shim.js — 관제탑 iframe 프리뷰 안에서 교체점(hook)을 주입하는 껍데기.
 *
 * 왜 필요한가
 *   site/tentwin.html 은 ?screen=<키> 점프 훅(<script id="screen-preview-hook">)은
 *   갖고 있지만 postMessage 수신 코드는 **없다**(grep: postMessage 0건).
 *   게임 파일은 수정 금지이므로, 수신부를 게임에 넣는 대신 관제탑이 iframe 안으로
 *   이 껍데기를 밀어 넣는다. 게임 바이트는 1바이트도 바뀌지 않는다.
 *
 * 주입 경로 2가지 (board-factory.js 가 A → B 순으로 시도한다)
 *   A. 동일 출처 직접 주입 (권장 · http://localhost 로 서빙할 때)
 *        iframe.contentDocument 에 <script> 로 이 파일을 붙인다.
 *        board-factory.js 의 injectShim() 이 하는 일.
 *   B. srcdoc 부트스트랩 (file:// 처럼 A 가 막힐 때)
 *        게임을 감싸는 srcdoc 문서를 만들어 그 안에서 이 껍데기를 먼저 실행시키고,
 *        게임을 다시 중첩 iframe 으로 띄운다. file:// 에서는 중첩 문서도 서로
 *        불투명(opaque origin)이라 값 주입이 막힐 수 있다 → 그때는 프리뷰를
 *        "정지 화면"으로만 쓰고 교체 확인은 apply-manifest 후 실캡처로 한다.
 *
 * 프로토콜 (부모 → iframe)
 *   { source:"gf-board", type:"hook:set",   scope:":root", name:"--wf-face", value:"…" }
 *   { source:"gf-board", type:"hook:batch", hooks:[{scope,name,value}, …] }
 *   { source:"gf-board", type:"hook:clear" }
 *   { source:"gf-board", type:"ping" }
 * (iframe → 부모)
 *   { source:"gf-preview-shim", type:"ready"|"applied"|"pong", n:<적용 수> }
 *
 * 주입된 값은 게임의 <style id="factory-overrides"> 와 **같은 계약**을 쓴다.
 * 즉 프리뷰에서 보이는 것 = apply-manifest 가 써넣을 것. 두 경로가 어긋나면
 * "부분 변경 = 거짓 통과" 사고가 난다(METHOD-AUDIT-3 B ①).
 */
(function () {
  if (window.__gfPreviewShim) return;
  window.__gfPreviewShim = true;

  var STYLE_ID = 'factory-overrides-preview';

  function styleEl() {
    var el = document.getElementById(STYLE_ID);
    if (!el) {
      el = document.createElement('style');
      el.id = STYLE_ID;
      /* 게임의 factory-overrides 블록보다 뒤에 놓여야 이긴다. */
      (document.head || document.documentElement).appendChild(el);
    }
    return el;
  }

  var live = {};                       /* scope -> { name: value } */

  function render() {
    var css = '', n = 0, scope;
    for (scope in live) {
      var body = '', name;
      for (name in live[scope]) { body += name + ':' + live[scope][name] + ';'; n++; }
      if (body) css += scope + '{' + body + '}\n';
    }
    styleEl().textContent = css;
    return n;
  }

  function set(h) {
    if (!h || !h.name || String(h.name).slice(0, 2) !== '--') return;
    var scope = h.scope || ':root';
    (live[scope] = live[scope] || {})[h.name] = String(h.value);
  }

  function reply(type, extra) {
    var msg = { source: 'gf-preview-shim', type: type };
    if (extra) for (var k in extra) msg[k] = extra[k];
    try { parent.postMessage(msg, '*'); } catch (e) {}
  }

  window.addEventListener('message', function (ev) {
    var d = ev.data;
    if (!d || d.source !== 'gf-board') return;
    if (d.type === 'ping') { reply('pong'); return; }
    if (d.type === 'hook:clear') { live = {}; reply('applied', { n: render() }); return; }
    if (d.type === 'hook:set') { set(d); reply('applied', { n: render() }); return; }
    if (d.type === 'hook:batch') {
      var hooks = d.hooks || [];
      for (var i = 0; i < hooks.length; i++) set(hooks[i]);
      reply('applied', { n: render() });
    }
  }, false);

  /* 부모가 직접 호출할 수도 있다(동일 출처 주입일 때가 더 빠르고 확실하다). */
  window.__gfApplyHooks = function (hooks) {
    for (var i = 0; i < (hooks || []).length; i++) set(hooks[i]);
    return render();
  };
  window.__gfClearHooks = function () { live = {}; return render(); };

  reply('ready');
})();
