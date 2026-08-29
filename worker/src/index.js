/**
 * E2E-Vault: Zero-Knowledge Secret Link & Pairing Bridge on Cloudflare Workers
 * Domain: trans.themitta.com
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, DELETE',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function generateId(length = 10) {
  const chars = '23456789abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => chars[byte % chars.length]).join('');
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // 1. Handle CORS Preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    // 2. API: Store Encrypted Secret
    if (path === '/api/secret' && request.method === 'POST') {
      try {
        const body = await request.json();
        const { ciphertext, burnAfterReading = true, ttlSeconds = 3600 } = body;

        if (!ciphertext || typeof ciphertext !== 'string') {
          return new Response(JSON.stringify({ error: 'Missing ciphertext' }), {
            status: 400,
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
          });
        }

        const id = generateId(10);
        const ttl = Math.min(Math.max(60, parseInt(ttlSeconds) || 3600), 86400 * 7); // 1 min to 7 days
        const data = {
          ciphertext,
          burnAfterReading: Boolean(burnAfterReading),
          createdAt: Date.now(),
          ttlSeconds: ttl,
        };

        if (env.VAULT_KV) {
          await env.VAULT_KV.put(id, JSON.stringify(data), { expirationTtl: ttl });
        } else {
          return new Response(JSON.stringify({ error: 'VAULT_KV not bound. Please bind KV in wrangler.toml' }), {
            status: 500,
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
          });
        }

        return new Response(
          JSON.stringify({
            id,
            expiresAt: Date.now() + ttl * 1000,
            burnAfterReading: data.burnAfterReading,
          }),
          { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
        );
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      }
    }

    // 3. API: Retrieve Ciphertext (and Burn if single-use)
    if (path.startsWith('/api/secret/') && request.method === 'GET') {
      const id = path.replace('/api/secret/', '').trim();
      if (!id || !env.VAULT_KV) {
        return new Response(JSON.stringify({ error: 'Not found' }), {
          status: 404,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      }

      const raw = await env.VAULT_KV.get(id);
      if (!raw) {
        return new Response(
          JSON.stringify({ error: 'Secret not found or has expired / already burned.' }),
          { status: 404, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
        );
      }

      const parsed = JSON.parse(raw);

      // Burn after reading
      if (parsed.burnAfterReading) {
        await env.VAULT_KV.delete(id);
      }

      return new Response(
        JSON.stringify({
          ciphertext: parsed.ciphertext,
          burned: parsed.burnAfterReading,
          createdAt: parsed.createdAt,
        }),
        { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    // 4. Web View: Secret Decrypt Page (/s/:id)
    if (path.startsWith('/s/')) {
      const id = path.replace('/s/', '').trim();
      return new Response(renderSecretViewerHtml(id), {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }

    // 5. Web View: 1-Click Contact Pairing Page (/pair)
    if (path === '/pair') {
      return new Response(renderPairingHtml(), {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }

    // 6. Web View: Home / Quick Web Encryptor (/)
    return new Response(renderHomeHtml(), {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  },
};

/**
 * ----------------------------------------------------
 * HTML Template: Secret Viewer & Client-side Decryptor
 * ----------------------------------------------------
 */
function renderSecretViewerHtml(secretId) {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>🔐 E2E-Vault 零知识密件查看</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    body { background-color: #030712; color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    .glass { background: rgba(15, 23, 42, 0.85); backdrop-filter: blur(16px); border: 1px solid rgba(51, 65, 85, 0.6); }
  </style>
</head>
<body class="min-h-screen flex flex-col items-center justify-center p-4 sm:p-6">
  <div class="w-full max-w-xl space-y-6">
    <!-- Brand Header -->
    <div class="text-center space-y-2">
      <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-950/80 border border-emerald-700/60 text-emerald-300 text-xs font-semibold">
        <span>🛡️</span>
        <span>E2E-Vault Zero-Knowledge Link</span>
      </div>
      <h1 class="text-2xl sm:text-3xl font-bold tracking-tight text-white">安全解密与密件查看</h1>
      <p class="text-xs sm:text-sm text-slate-400">本密件仅在您的本地浏览器中解密，服务器零知识无从获悉明文。</p>
    </div>

    <!-- Main Card -->
    <div class="glass rounded-2xl p-6 shadow-2xl space-y-5">
      <!-- Status Badge -->
      <div id="statusBanner" class="flex items-center gap-2.5 p-3 rounded-xl bg-blue-950/60 border border-blue-800/60 text-blue-300 text-xs">
        <span id="statusIcon" class="animate-spin">🔄</span>
        <span id="statusText" class="font-medium">正在拉取密文并执行本地解密...</span>
      </div>

      <!-- Decrypted Content View -->
      <div id="contentSection" class="hidden space-y-4">
        <div class="flex items-center justify-between">
          <span class="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
            <span>📄</span>
            <span>解密后的机密信息</span>
          </span>
          <span id="burnBadge" class="hidden px-2.5 py-0.5 rounded-full bg-rose-950 text-rose-300 border border-rose-800/60 text-[11px] font-semibold">
            🔥 阅后即焚（已从服务器物理销毁）
          </span>
        </div>

        <div class="relative">
          <pre id="secretContent" class="w-full bg-black/80 border border-slate-800 rounded-xl p-4 text-sm font-mono text-emerald-300 overflow-x-auto whitespace-pre-wrap break-all max-h-72 select-all"></pre>
        </div>

        <!-- Action Buttons -->
        <div class="grid grid-cols-2 gap-3 pt-2">
          <button id="copyBtn" class="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition active:scale-95 shadow-lg shadow-emerald-950/50">
            <span>📋</span>
            <span id="copyBtnText">一键复制明文</span>
          </button>

          <button id="openAppBtn" class="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-semibold border border-slate-700 transition active:scale-95">
            <span>🚀</span>
            <span>在桌面版中归档</span>
          </button>
        </div>
      </div>

      <!-- Error State View -->
      <div id="errorSection" class="hidden space-y-4 text-center py-6">
        <div class="text-4xl">⚠️</div>
        <h3 class="text-lg font-bold text-rose-400">无法解密或密件已失效</h3>
        <p id="errorDetails" class="text-xs text-slate-400 max-w-md mx-auto">该密件可能已被阅读销毁、链接已过期，或 URL 中的解密密钥参数缺失。</p>
        <a href="/" class="inline-block px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold">返回首页创建新密件</a>
      </div>
    </div>

    <!-- Footer Guide -->
    <div class="text-center text-xs text-slate-500 space-y-1">
      <p>Powered by <a href="https://github.com/bigbowl99/E2E-Vault" target="_blank" class="text-emerald-400 hover:underline">E2E-Vault Open Source</a> • Zero-Knowledge Architecture</p>
    </div>
  </div>

  <script>
    const secretId = "${secretId}";

    async function base64ToBytes(b64) {
      const bin = atob(b64.replace(/-/g, '+').replace(/_/g, '/'));
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return bytes;
    }

    async function decryptAesGcm(ciphertextB64, keyB64) {
      const combined = await base64ToBytes(ciphertextB64);
      const iv = combined.slice(0, 12);
      const data = combined.slice(12);

      const keyBytes = await base64ToBytes(keyB64);
      const cryptoKey = await crypto.subtle.importKey(
        'raw',
        keyBytes,
        { name: 'AES-GCM' },
        false,
        ['decrypt']
      );

      const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        cryptoKey,
        data
      );

      return new TextDecoder().decode(decrypted);
    }

    async function init() {
      const hash = window.location.hash.substring(1);
      const params = new URLSearchParams(hash);
      const keyB64 = params.get('k');

      if (!keyB64) {
        showError('URL 锚点中缺少解密密钥 (#k=...)，请确认复制了完整的分享链接。');
        return;
      }

      try {
        const res = await fetch('/api/secret/' + secretId);
        if (!res.ok) {
          const err = await res.json();
          showError(err.error || '密件不存在或已被阅读销毁。');
          return;
        }

        const data = await res.json();
        const plaintext = await decryptAesGcm(data.ciphertext, keyB64);

        // Success! Render plaintext
        document.getElementById('statusBanner').classList.add('hidden');
        document.getElementById('contentSection').classList.remove('hidden');
        document.getElementById('secretContent').textContent = plaintext;

        if (data.burned) {
          document.getElementById('burnBadge').classList.remove('hidden');
        }

        // Copy button handler
        document.getElementById('copyBtn').onclick = () => {
          navigator.clipboard.writeText(plaintext);
          document.getElementById('copyBtnText').textContent = '已复制到剪贴板！';
          setTimeout(() => {
            document.getElementById('copyBtnText').textContent = '一键复制明文';
          }, 2000);
        };

        // Open App handler
        document.getElementById('openAppBtn').onclick = () => {
          window.location.href = 'cryptim://open?secret=' + encodeURIComponent(plaintext);
        };

      } catch (err) {
        showError('本地解密失败：' + err.message);
      }
    }

    function showError(msg) {
      document.getElementById('statusBanner').classList.add('hidden');
      document.getElementById('errorSection').classList.remove('hidden');
      document.getElementById('errorDetails').textContent = msg;
    }

    window.onload = init;
  </script>
</body>
</html>`;
}

/**
 * ----------------------------------------------------
 * HTML Template: 1-Click Contact Pairing Page (/pair)
 * ----------------------------------------------------
 */
function renderPairingHtml() {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>🤝 E2E-Vault 一键联系人配对</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    body { background-color: #030712; color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    .glass { background: rgba(15, 23, 42, 0.85); backdrop-filter: blur(16px); border: 1px solid rgba(51, 65, 85, 0.6); }
  </style>
</head>
<body class="min-h-screen flex flex-col items-center justify-center p-4 sm:p-6">
  <div class="w-full max-w-md space-y-6">
    <!-- Header -->
    <div class="text-center space-y-2">
      <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-950/80 border border-emerald-700/60 text-emerald-300 text-xs font-semibold">
        <span>🔑</span>
        <span>E2E-Vault Instant Pairing</span>
      </div>
      <h1 class="text-2xl font-bold tracking-tight text-white">建立端到端加密通道</h1>
      <p class="text-xs text-slate-400">点击按钮即可自动导入好友公钥，免除手动复制。</p>
    </div>

    <!-- Contact Pairing Card -->
    <div class="glass rounded-2xl p-6 shadow-2xl space-y-5 text-center">
      <div class="w-16 h-16 mx-auto rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center text-2xl font-bold">
        👤
      </div>

      <div>
        <h3 id="contactName" class="text-lg font-bold text-slate-100">正在识别联系人...</h3>
        <p class="text-xs text-vault-400 text-slate-500 font-mono mt-1">X25519 Curve25519 Public Key</p>
      </div>

      <div class="bg-black/70 rounded-xl p-3 border border-slate-800 text-[11px] font-mono text-emerald-400 break-all select-all text-left" id="pubkeyDisplay">
        PUBKEY::...
      </div>

      <div class="space-y-2.5 pt-2">
        <button id="openAppBtn" class="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition active:scale-95 shadow-lg shadow-emerald-950/50">
          <span>🚀</span>
          <span>在 E2E-Vault 桌面端中一键保存</span>
        </button>

        <button id="copyPubkeyBtn" class="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition">
          <span>📋</span>
          <span id="copyBtnText">手动复制公钥文本</span>
        </button>

        <a href="https://github.com/bigbowl99/E2E-Vault/releases" target="_blank" class="block text-xs text-slate-500 hover:text-emerald-400 pt-2 transition">
          还没有安装桌面客户端？点击前往下载 (Mac / Windows)
        </a>
      </div>
    </div>
  </div>

  <script>
    window.onload = () => {
      const hash = window.location.hash.substring(1);
      const params = new URLSearchParams(hash);
      const name = params.get('name') || '好友';
      const pubkey = params.get('pub') || '';

      document.getElementById('contactName').textContent = name;
      document.getElementById('pubkeyDisplay').textContent = pubkey.startsWith('PUBKEY::') ? pubkey : ('PUBKEY::' + pubkey);

      document.getElementById('openAppBtn').onclick = () => {
        const cleanKey = pubkey.replace('PUBKEY::', '');
        window.location.href = 'cryptim://pair?name=' + encodeURIComponent(name) + '&pubkey=' + encodeURIComponent(cleanKey);
      };

      document.getElementById('copyPubkeyBtn').onclick = () => {
        navigator.clipboard.writeText(pubkey.startsWith('PUBKEY::') ? pubkey : ('PUBKEY::' + pubkey));
        document.getElementById('copyBtnText').textContent = '已复制公钥到剪贴板！';
        setTimeout(() => {
          document.getElementById('copyBtnText').textContent = '手动复制公钥文本';
        }, 2000);
      };
    };
  </script>
</body>
</html>`;
}

/**
 * ----------------------------------------------------
 * HTML Template: Web Encryptor Homepage (/)
 * ----------------------------------------------------
 */
function renderHomeHtml() {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>🛡️ E2E-Vault 零知识密件与配对短链中心</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    body { background-color: #030712; color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    .glass { background: rgba(15, 23, 42, 0.85); backdrop-filter: blur(16px); border: 1px solid rgba(51, 65, 85, 0.6); }
  </style>
</head>
<body class="min-h-screen flex flex-col items-center justify-center p-4 sm:p-6">
  <div class="w-full max-w-xl space-y-6">
    <!-- Header -->
    <div class="text-center space-y-2">
      <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-950/80 border border-emerald-700/60 text-emerald-300 text-xs font-semibold">
        <span>🌐</span>
        <span>trans.themitta.com • Zero-Knowledge Service</span>
      </div>
      <h1 class="text-2xl sm:text-3xl font-bold tracking-tight text-white">E2E-Vault 密件短链生成器</h1>
      <p class="text-xs sm:text-sm text-slate-400">在本地浏览器用 AES-256-GCM 加密，生成可直接在微信发送的安全短链。</p>
    </div>

    <!-- Encryptor Card -->
    <div class="glass rounded-2xl p-6 shadow-2xl space-y-4">
      <div class="space-y-1.5">
        <label class="text-xs font-bold text-slate-300 uppercase tracking-wider">输入机密文本 (密码、API Key、配置)</label>
        <textarea id="plainInput" rows="4" placeholder="粘贴需要安全分享的内容..." class="w-full bg-black/70 border border-slate-800 focus:border-emerald-500 rounded-xl p-3 text-sm font-mono text-slate-200 focus:outline-none transition"></textarea>
      </div>

      <div class="grid grid-cols-2 gap-3 text-xs">
        <div>
          <label class="font-semibold text-slate-400">有效时长 (TTL)</label>
          <select id="ttlSelect" class="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 mt-1 text-slate-200 focus:outline-none">
            <option value="600">10 分钟 (极速销毁)</option>
            <option value="3600" selected>1 小时 (推荐)</option>
            <option value="86400">24 小时</option>
            <option value="604800">7 天</option>
          </select>
        </div>

        <div class="flex flex-col justify-end">
          <label class="flex items-center gap-2 cursor-pointer bg-slate-900 border border-slate-700 rounded-lg p-2">
            <input type="checkbox" id="burnCheck" checked class="rounded text-emerald-500 focus:ring-0">
            <span class="text-slate-200">🔥 阅后即焚 (单次打开即删)</span>
          </label>
        </div>
      </div>

      <button id="createLinkBtn" class="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition active:scale-95 shadow-lg shadow-emerald-950/50 flex items-center justify-center gap-2">
        <span>🔗</span>
        <span>生成零知识安全短链</span>
      </button>

      <!-- Result View -->
      <div id="resultBox" class="hidden space-y-3 pt-3 border-t border-slate-800">
        <label class="text-xs font-bold text-emerald-400">🎉 安全短链生成成功 (密文在本地加密，密钥附加在 # 锚点后)：</label>
        <div class="flex items-center gap-2">
          <input type="text" id="linkOutput" readonly class="w-full bg-black/80 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono text-slate-200 select-all">
          <button id="copyResultBtn" class="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-semibold shrink-0">复制</button>
        </div>
      </div>
    </div>

    <!-- Client Download Banner -->
    <div class="glass rounded-xl p-4 flex items-center justify-between">
      <div class="flex items-center gap-3">
        <span class="text-2xl">💻</span>
        <div>
          <h4 class="text-xs font-bold text-slate-200">E2E-Vault 桌面端 (Mac &amp; Windows)</h4>
          <p class="text-[11px] text-slate-400">支持微信剪贴板无感监听与文件 .e2e 加密</p>
        </div>
      </div>
      <a href="https://github.com/bigbowl99/E2E-Vault/releases" target="_blank" class="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 font-semibold border border-slate-700 transition">下载客户端</a>
    </div>
  </div>

  <script>
    function bytesToBase64(bytes) {
      let bin = '';
      for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
      return btoa(bin).replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/, '');
    }

    async function encryptAesGcm(text) {
      const key = await crypto.subtle.generateKey(
        { name: 'AES-GCM', length: 256 },
        true,
        ['encrypt', 'decrypt']
      );

      const iv = crypto.getRandomValues(new Uint8Array(12));
      const encoded = new TextEncoder().encode(text);

      const encrypted = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        encoded
      );

      const combined = new Uint8Array(iv.length + encrypted.byteLength);
      combined.set(iv, 0);
      combined.set(new Uint8Array(encrypted), iv.length);

      const rawKey = await crypto.subtle.exportKey('raw', key);
      return {
        ciphertext: bytesToBase64(combined),
        keyB64: bytesToBase64(new Uint8Array(rawKey))
      };
    }

    document.getElementById('createLinkBtn').onclick = async () => {
      const text = document.getElementById('plainInput').value.trim();
      if (!text) {
        alert('请输入机密文本');
        return;
      }

      const ttlSeconds = document.getElementById('ttlSelect').value;
      const burnAfterReading = document.getElementById('burnCheck').checked;

      try {
        const { ciphertext, keyB64 } = await encryptAesGcm(text);

        const res = await fetch('/api/secret', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ciphertext, burnAfterReading, ttlSeconds })
        });

        if (!res.ok) {
          const err = await res.json();
          alert('生成失败：' + (err.error || '未知错误'));
          return;
        }

        const data = await res.json();
        const shareUrl = window.location.origin + '/s/' + data.id + '#k=' + keyB64;

        document.getElementById('linkOutput').value = shareUrl;
        document.getElementById('resultBox').classList.remove('hidden');
      } catch (err) {
        alert('加密失败：' + err.message);
      }
    };

    document.getElementById('copyResultBtn').onclick = () => {
      const link = document.getElementById('linkOutput').value;
      navigator.clipboard.writeText(link);
      document.getElementById('copyResultBtn').textContent = '已复制！';
      setTimeout(() => {
        document.getElementById('copyResultBtn').textContent = '复制';
      }, 2000);
    };
  </script>
</body>
</html>`;
}
