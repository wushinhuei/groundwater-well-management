# 地下水井管理系統 2.1.0

## 正式資料與發布流程

**D 槽是正式主檔；Google Drive 是備份及網站發布來源；GitHub 仍使用從 Drive 讀取的資料。所有同步及產製工作由 PC 執行，不依賴 Apps Script。**

流程：D 槽井籍／抽水主檔 → PC 驗證並同步到指定 Drive 檔案 → 讀回 checksum 確認相同 → PC 從 Drive 重新讀取並產製索引／網站 JSON → 再確認 D 槽與 Drive 未變 → GitHub 提交 → 公開網站 JSON 比對。

任何 D 槽來源遺失、資料驗證或同步失敗，都停止發布，不會偷偷使用 Drive 舊資料，也不會自動從 Drive 還原覆蓋 D 槽。GitHub Pages 僅負責託管。

## 本機目錄

預設 dataRoot：`D:\地下水井管理系統`，可在 Configure-Local.cmd 改選。

- 根目錄 `*抽水井一覽*.xlsx`：正式井籍。多份時優先比較檔名日期，再比較修改時間；可在 config 的 registryPath 指定確切檔案。
- `抽水紀錄/pumping-history.json`：正式歷史抽水主檔，水利署查詢結果先更新此檔；空白不覆蓋原值。
- `系統索引/well-index.json`：從本機 Excel 產製，供查詢井號及井名。
- `系統索引/drive-mirror-status.json`：主檔同步 Drive 的校驗紀錄。
- `地下水水權狀`、`水井電費統計表`：本機保留的原始文件。目前自動同步涵蓋井籍 Excel 及抽水 JSON；PDF 附件／電費整批備份與附件配對仍未實作，不能據此認為所有 D 槽檔案都有雲端備份。

2026-10-21 此 PC 首次移轉：從現有 Drive 來源建立 D 槽 828 筆年度抽水紀錄；本機井籍讀取 111 口井。這是初始化，非新一輪水利署更新。新 PC 必須自行帶入正式抽水主檔，程式缺檔即停止，不自動以雲端覆蓋。

## 設定與操作

需要 Windows、Chrome、Node.js 22+、Python 3.10+、GitHub CLI。首次執行 Setup.cmd，接著在本機 gh auth login，再執行 Configure-Local.cmd 指定資料根目錄。舊用戶直接重跑 Configure-Local.cmd 更新設定，不重跑 Setup。

設定中的 registryBackupFileId 是井籍的 Drive 備份檔 ID（目前沿用原既有檔），sourceFileId 是抽水備份檔 ID。Drive 井籍檔名可能仍是舊名，程式以明確 ID 讀取，不以雲端名稱選主檔。備份內容會以 D 槽為準更新；來源不明時勿任意指定其他檔案 ID。

執行 Publish-Now.cmd 可在不查水利署的情況下驗證 D→Drive→GitHub。Login.cmd 由使用者輸入水利署帳密，Verify.cmd 做唯讀單井查詢。手動執行更新.bat 或每日 Windows 任務會先同步基本資料及網站，再查一批到期井號；有新數值時先寫 D 槽，再經 Drive 發布。

最近三個已結束月份每月重新查：6–8／16–18／26–28 日三組井號，逐井至少間隔 15 秒。每月獨立 review 輪次，原值與新值及缺漏原因寫在資料月份日誌。只有 published-verified 表示網站資料比對完成。

請停用舊 Apps Script 觸發器及其他 PC 的重複任務；本次沒有操作線上觸發器。私鑰、cookie、設定及主檔不要提交公開 Git。只有程式、文件與測試可 clone。

## 驗證狀態

27 項離線測試通過（Node 21、Python 6）；已實際讀取本機 Excel 並初始化歷史主檔。尚未實際執行本版 D→Drive 寫入與網站發布，沒有更動 Drive 的井籍備份內容或網站資料。執行 npm test、python publish-tests.py、python local-source-tests.py 可重跑離線測試。

詳見 [檔案清冊.md](檔案清冊.md) 與 [AGENTS.md](AGENTS.md)。
