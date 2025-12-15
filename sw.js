// キャッシュ名のバージョンを更新
// ⭐必ずバージョンを上げて、新しいService Workerを強制的にインストールさせる
const CACHE_NAME = 'dmplayer-v2.0.18'; 
const RUNTIME_CACHE = 'dmplayer-runtime-v1';

// ⭐【重要】GitHub Pagesのプロジェクトパスを定義
const REPO_PATH = '/dmplayer45.github.io/';
// ⭐【重要】メインHTMLファイル名
const MAIN_HTML_FILE = 'index.html';
// 最終的なフォールバックHTMLのキャッシュキー
const FALLBACK_HTML_PATH = REPO_PATH + MAIN_HTML_FILE; // /dmplayer45.github.io/index.html


// オフラインで使用したいリソースのリスト（アプリシェル）
const urlsToCache = [
    REPO_PATH, // Project root URL (e.g., /dmplayer45.github.io/)
    FALLBACK_HTML_PATH, // Explicit index.html path
    REPO_PATH + 'manifest.json',
    REPO_PATH + 'icon-192x192.png',
    REPO_PATH + 'icon-512x512.png',
    // jsmediatagsはCDNなので、ここでは含めず runtime cache に任せます。
];

self.addEventListener('install', (event) => {
    console.log(`[SW:${CACHE_NAME}] Installation started.`);
    console.log(`[SW:${CACHE_NAME}] Attempting to cache the following URLs:`, urlsToCache); // ⭐ デバッグログ
    
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(urlsToCache).then(() => {
                console.log(`[SW:${CACHE_NAME}] All core assets successfully pre-cached.`);
            }).catch((err) => {
                // ⭐ パスの間違いやファイル不足があればここでエラーが出ます
                console.error('[SW ERROR] Failed to pre-cache some assets. Check server files/paths:', err);
                throw err; // インストール失敗をブラウザに伝達する
            });
        })
    );
});

self.addEventListener('activate', (event) => {
    console.log(`[SW:${CACHE_NAME}] Activation started.`);
    event.waitUntil(
        (async () => {
            // 古いキャッシュを削除
            const cacheNames = await caches.keys();
            await Promise.all(cacheNames.map(name => {
                if (name !== CACHE_NAME && name !== RUNTIME_CACHE) {
                    console.log(`[SW:${CACHE_NAME}] Deleting old cache: ${name}`);
                    return caches.delete(name);
                }
            }));
            // クライアントの制御を要求 (即座に新しい Service Worker を有効化)
            await self.clients.claim();
            console.log(`[SW:${CACHE_NAME}] Activation successful and clients claimed.`);
        })()
    );
});

self.addEventListener('fetch', (event) => {
    const req = event.request;
    const url = new URL(req.url);

    // Skip non-GET and chrome-extension requests
    if (req.method !== 'GET' || url.protocol === 'chrome-extension:') return;
    
    // オーディオファイルのキャッシュはスキップ（大容量ファイルのため）
    if (req.destination === 'audio' || req.destination === 'media') return;

    // 1. Navigation Request (HTMLページ) の処理: FALLBACK_HTML_PATH を返す
    if (req.mode === 'navigate') {
        event.respondWith(
            caches.match(FALLBACK_HTML_PATH).then(cached => {
                if(cached) {
                    console.log(`[SW:NAVIGATE] Serving ${FALLBACK_HTML_PATH} from cache for: ${url.pathname}`);
                    return cached;
                }
                return fetch(req).catch(() => caches.match(FALLBACK_HTML_PATH));
            })
        );
        return;
    }

    // ... (3. CDN と 4. Other same-origin static assets のロジックは前回通り) ...
    // 3. CDN (jsdelivr) -> network-first then cache
    if (url.origin !== location.origin && url.hostname.includes('jsdelivr.net')) {
        event.respondWith(
            fetch(req).then(networkRes => {
                return caches.open(RUNTIME_CACHE).then(cache => {
                    cache.put(req, networkRes.clone());
                    return networkRes;
                });
            }).catch(() => caches.match(req))
        );
        return;
    }

    // 4. Other same-origin static assets -> cache-first/runtime-caching
    event.respondWith(
        caches.match(req).then(cached => cached || fetch(req).then(networkRes => {
            return caches.open(RUNTIME_CACHE).then(cache => {
                try { cache.put(req, networkRes.clone()); } catch (e) { /* ignore */ }
                return networkRes;
            });
        }).catch(() => {
            // Last resort fallback to index.html
            return caches.match(FALLBACK_HTML_PATH);
        }))
    );
});

// Allow clients to message the SW
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});
