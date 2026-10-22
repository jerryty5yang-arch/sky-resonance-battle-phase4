# 第四階段獨立連線伺服器
建立新的 GitHub 儲存庫 sky-resonance-battle-phase4，將本套件四個檔案放在根目錄。不要覆蓋第三階段儲存庫。
Cloudflare Workers 連接新儲存庫，組建命令留空，部署命令 npx wrangler deploy。
部署完成後，在新 Worker 設定中新增秘密 BATTLE_SECRET（密碼產生器建立的至少32字元隨機字串）。不要將秘密貼進聊天或儲存庫。
SITE_PUBLIC_KEY 已設定，僅包含公開金鑰。Sites 的第四階段簽署金鑰已獨立設定。
把新的 Worker 正式網址提供給 Codex，以設定第四階段的 BATTLE_SERVICE_URL；目前尚未啟用第四階段連線作戰。
更新內容：歌姬支援前奏結束後存活玩家 HP +20，上限100、不復活；精英敵機射擊間隔1.4秒、三發扇形彈幕。無補給品。
Phase 5 deployment
Backend v41
