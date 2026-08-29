# ☁️ E2E-Vault Cloudflare Worker (trans.themitta.com)

这是 **E2E-Vault** 的零知识密件短链与一键配对 Worker 桥梁，运行在 Cloudflare 全球边缘节点上。

---

## 🌟 核心特性

1. **零知识解密 (Zero-Knowledge)**：
   - 客户端在本地生成 AES-256-GCM 密钥并将密钥置于 URL 的 `#k=...` 锚点之后。
   - Cloudflare 服务器**只存储加密后的密文**，永远拿不到解密密钥。
2. **阅后即焚 (Burn-After-Reading)**：
   - 接收方点开链接后，Cloudflare KV **立即物理销毁**该密文，防止二次泄露。
3. **免复制一键好友配对 (`/pair#name=Alice&pub=...`)**：
   - 发送一条网页链接，朋友点击即可自动唤醒桌面端保存联系人，无需手动复制公钥。
4. **纯前端 WebCrypto 解密**：
   - 接收方手机微信直接打开网页即可完成解密，无需安装任何软件。

---

## 🚀 极速部署指南 (2 分钟)

### 1. 安装与登录 Wrangler (如已登录可跳过)
```bash
npx wrangler login
```

### 2. 创建 Cloudflare KV 命名空间
在 `worker/` 目录下执行：
```bash
cd worker
npx wrangler kv namespace create VAULT_KV
```
执行后会输出类似如下内容：
```toml
[[kv_namespaces]]
binding = "VAULT_KV"
id = "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
```

### 3. 将 ID 填入 `wrangler.toml`
打开 `worker/wrangler.toml`，将 `id = "VAULT_KV_PLACEHOLDER"` 替换为上一步生成的 ID：
```toml
name = "e2e-vault-worker"
main = "src/index.js"
compatibility_date = "2024-09-01"

routes = [
  { pattern = "trans.themitta.com/*", zone_name = "themitta.com", custom_domain = true }
]

[[kv_namespaces]]
binding = "VAULT_KV"
id = "你的KV_ID填在这里"
```

### 4. 部署上线 (Deploy)
```bash
npx wrangler deploy
```

部署成功后，访问 **`https://trans.themitta.com`** 即可立即体验！
