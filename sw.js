/* 텐트윈 젤리팡 월드 — 서비스 워커 (보수적 오프라인 전략)
 * 버전 키 = 빌드 스탬프. tentwin.html <meta name="build">와 같은 값으로 갱신한다(release 스크립트가 치환).
 * 전략:
 *   - HTML(tentwin.html, 내비게이션): network-first, 실패 시 캐시 폴백 → 옛 파일이 영구 고정되는 사고 방지
 *   - catalog/* (이미지·정적 자산): cache-first + 백그라운드 갱신 없음(파일명이 정본, 바뀌면 HTML이 새 이름을 부른다)
 *   - 그 외 동일 출처 GET: network-first
 *   - 다른 출처·비 GET·Range 요청은 건드리지 않는다
 * 갱신 정책:
 *   - install: 앱 셸(HTML + 매니페스트 + 아이콘)만 미리 캐시
 *   - activate: 이 버전이 아닌 캐시 전부 삭제, clients.claim
 *   - skipWaiting은 자동으로 하지 않는다 → 새 SW는 다음 로드에서 조용히 적용(플레이 중 파일 교체 방지).
 *     페이지가 postMessage('SKIP_WAITING')을 보내면 즉시 교체(향후 "새 버전" 토스트용, 지금은 미사용)
 * 우회: 페이지 URL에 ?nosw=1 이 있으면 등록 자체를 건너뛰고 기존 등록을 해제한다(개발용, tentwin.html 등록 코드 참조)
 */
const BUILD = 'd221f1c-20260908-1654';
const CACHE = 'tentwin-' + BUILD;
const SHELL = [
  './tentwin.html',
  './tentwin.webmanifest',
  './catalog/pwa-icon-192.png',
  './catalog/pwa-icon-512.png',
  './catalog/pwa-icon-192-maskable.png',
  './catalog/pwa-icon-512-maskable.png',
  './catalog/apple-touch-icon.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {})
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (e) => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});

function isHtml(req) {
  return req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html');
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  if (req.headers.has('range')) return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.search.includes('nosw=1')) return;

  if (url.pathname.includes('/catalog/')) {
    // cache-first: 정본 자산은 파일명이 곧 버전
    e.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const hit = await cache.match(req, { ignoreSearch: true });
      if (hit) return hit;
      try {
        const res = await fetch(req);
        if (res && res.ok) cache.put(req, res.clone());
        return res;
      } catch (err) {
        return hit || Response.error();
      }
    })());
    return;
  }

  // HTML·기타 동일 출처: network-first, 실패 시 캐시
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const res = await fetch(req);
      /* perf2-0908: .css 추가 — 배포 빌드(critical-split)가 본체 뒤 CSS 를 루트 tw-late-*.css 로 내보낸다. 오프라인 재로드에 필요. */
      if (res && res.ok && (isHtml(req) || url.pathname.endsWith('.webmanifest') || url.pathname.endsWith('.js') || url.pathname.endsWith('.css'))) {
        cache.put(req, res.clone());
      }
      return res;
    } catch (err) {
      const hit = await cache.match(req, { ignoreSearch: true })
        || (isHtml(req) ? await cache.match('./tentwin.html') : null);
      return hit || Response.error();
    }
  })());
});
