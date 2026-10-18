Phase 5 雙人部署包

本次畫面與特效由遊戲網站發布，Cloudflare 戰鬥伺服器不需因純視覺變更重新上傳。此包提供目前相容的後端部署檔。

手機 GitHub：解壓縮後，上傳 worker.mjs、wrangler.jsonc、package.json 至連接第四階段 Worker 的儲存庫根目錄。不要直接上傳 ZIP。
Cloudflare：專案 sky-resonance-battle-phase4；建置命令留空；部署命令 npx wrangler deploy。
保留既有 BATTLE_SECRET 秘密，不要更換；保留 BATTLE_ROOMS 綁定與 v1 migration。
設定檔的 SITE_ORIGIN、SITE_PUBLIC_KEY 已沿用此遊戲專案。不要套用到第三階段 Worker。

驗證網址：https://sky-resonance-battle-phase4.jerryty5yang.workers.dev/health
前端：https://sky-resonance-phase4-20261016.divinelamp256.chatgpt.site
