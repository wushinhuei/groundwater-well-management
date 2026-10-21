# 地下水井管理系統

版本 **2.0.0**；2026-10-21。本版由 Windows PC 執行資料同步、索引產製及 GitHub 提交，**不依賴 Apps Script，也不派送 GitHub Actions 資料更新工作**。GitHub Pages 仍是網站託管服務；它部署提交後的網站，本機負責比對公開 JSON 才回報 published-verified。

## 系統目的

1. 管理地下水井基本資料：從 Google Drive 抽水井一覽表匯入井名、站別、水權狀號、位置、井深、設備、受益面積與水權期限，更新索引與公開井籍。
2. 每月從水利署讀取歷史抽水紀錄：依井號／民國年／月份查詢最近三個已結束月份，處理晚補報及修正，保存歷年紀錄。
3. 保存每月逐井日誌：井名、站別、水權狀號、原值、新值、缺值及錯誤原因均可追查。

照片及水權狀附件沿用既有資料；附件自動配對尚未完成驗收，不宣稱本版已解決所有附件問題。

## 本機流程

每天或手動啟動時先由 PC 讀 Drive 基本資料與抽水來源 → 在 PC 產生及回寫 Drive 索引 → 在 PC 產生公開 JSON → 經 GitHub CLI 登入授權提交 GitHub → 比對網站公開資料。接著處理一批到期的水利署查詢；有新數值時再次在 PC 完成抽水資料發布。

沒有變動不提交。網站最多檢查六輪、每輪間隔 30 秒，尚未部署完成即報待查／失敗，不能當成功。重新執行 Publish-Now.cmd 可重新檢查與續辦；不需要重新查水利署。Drive 索引寫入失敗會中止，GitHub 同時有人更新時拒絕強制覆蓋。

## 安裝及升級

1. 安裝 Chrome、Node.js 22+、Python 3.10+、GitHub CLI（gh），Windows 時區設為台北。
2. 完整解壓到固定的「地下水井管理系統」資料夾。新用戶執行 Setup.cmd，指定既有 Google 服務帳號金鑰及起始月份。舊用戶保留 LocalAppData 設定，不重跑 Setup。
3. 在本機執行 `gh auth login`，使用對 wushinhuei/groundwater-well-management 有寫入權限的帳號登入。
4. 執行 Configure-Local.cmd：安裝 Python 依賴，補入 Python／gh 路徑；不在設定檔保存 GitHub token。
5. 執行 Login.cmd，自行在水利署頁面輸入帳密；執行 Verify.cmd 做唯讀單井驗證。
6. 執行 Publish-Now.cmd 驗收井籍、索引及網站發布，再執行「手動執行更新.bat」驗收一批抽水查詢。
7. 驗證成功後 24 小時內執行 Install-Task.cmd。已有任務不需重建，只需原程式路徑相同、先停用再覆蓋，測試後重新啟用。

舊版 Apps Script 觸發器應停用，避免和本機同時更新。**本次僅修改本機套件，沒有登入 Google 替你刪除或停用既有觸發器。**新程式不再設定 browserSync 發送標記，但已排隊的舊雲端工作仍須確認結束。只有一台 PC 應啟用更新任務。

## 回溯與缺值

每月 6–8、16–18、26–28 日依序到期三組井號的上月、前二月、前三月；每日最多處理一批、每次查詢至少間隔 15 秒。每月有獨立 review 輪次，已完成月份也會在新輪次重新檢查。較早尚未完成的初次資料仍排入補漏，最近三個月優先。

空白不覆蓋原值；明確 0 是有效數值。重複、格式不明、HTTP 限流等會停止；沒有新數值就不寫 Drive 抽水來源。與設定起始月份相比，最近三個完整月份始終納入回溯。

## 狀態及日誌

本機資料在 `%LOCALAPPDATA%\GroundwaterPC`，水利署 session 使用 Windows DPAPI 加密。不要分享 session、browser-profile 或 Google 私鑰。

- logs／抽水更新-115-09.log：按資料月份追加、含逐井修改前後值。
- local-publish-status.json：本機同步／提交／網站比對結果。
- local-sync／pipeline.log：Python 同步詳細輸出。
- local-sync／baseline、indexes、public：本機來源快照及產製結果。
- status.json、review-*.json：抽水批次與補查進度。

只有 published-verified 代表該次網站 JSON 已與本機產製結果一致。若沒有到期抽水批次，仍會先執行本機井籍及現有來源同步。

## 驗證

19 項 Node 離線測試 + 4 項 Python 發布邏輯測試通過。執行 `npm test` 及 `python publish-tests.py`。**尚未用實際帳號驗收此版的 Drive／GitHub 寫入、Windows 排程及網站部署**。

完整用途見 [檔案清冊.md](檔案清冊.md)，維護交接見 [AGENTS.md](AGENTS.md)。隨附九月日誌是先前資料更新的事後整理，不是本版實站驗收。


## Git 儲存庫版本

本程式位於儲存庫 desktop/，完整 clone 可取得。九月實際更新日誌留在本機交付包，不加入公開 Git 原始碼；文件對該日誌的說明為歷史背景。原始井籍／水權／電費與憑證不在本目錄，仍須另外準備。
