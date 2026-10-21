# 地下水井管理系統：維護交接（2.0.0）

先讀 README.md 與檔案清冊。使用者要求全部資料更新工作由本機 PC 執行，禁止重新引入 Apps Script 作為必要流程。本版從既有 upstream 腳本移植本機流程，尚未推送 upstream；不宣稱已改動或停用線上觸發器。

## 架構

run.cjs：本機發布 all → WRA 一批查詢 → 有新值時寫 Drive → 本機發布 pumping。local-publish.cjs 呼叫 Python；local-sync/publish.py 下載固定 GitHub commit 的基線，執行本機 Drive／公開資料腳本，以單一 tree/commit 更新 docs 與 public；非 force 更新分支，最多六輪檢查網站。GitHub Pages 只是託管，沒有呼叫 Actions dispatch。browserSync 清為 null，避免觸發舊 Apps Script listener。

local-sync/groundwater_drive_sync.py、sync_public_data.py、pumping_sync.py、pumping_excel.py 從舊 repository 移植；索引回寫錯誤改為拋出例外，不得吞錯。完整井籍更新不含新照片／附件可靠自動配對，此為待辦。

## 不可破壞的規則

null 不等於 0；空白不覆蓋原值。只在有效新數值時變更抽水來源；回溯最近三個完整月份，按 cycle 保留檢查點。單機互斥、至少 15 秒間隔、無無限重試。缺井有明確訊息才接受；結構不明及重複仍停止。日誌必須列井名、水權號及 before/after；發布成功須有網站資料比對，不得只用 commit 成功替代。

本機登入密碼由使用者輸入；不得輸出金鑰、cookie、JWT。GitHub 使用 gh 認證，不保存 token 到 config。測試只用假資料。不要把 LocalAppData、node_modules、__pycache__、金鑰或 session 打包。

## 待驗證及限制

23 項離線測試通過（Node 19，Python 4），主程式整合測試中的本機發布呼叫是 stub；尚未驗收真實 Drive、Python 依賴、GitHub 分支權限及 Pages 部署。Configure-Local 必須由用戶在可存取本機設定的位置執行。跨 PC 無全域鎖；Drive 的寫前比較非原子鎖。舊 Apps Script 觸發器尚未停用，應在部署切換時處理。

本機井籍由原腳本選來源與建立索引；維護來源選擇時務必遵守最新日期一覽表規則。水權附件舊流程曾有檔名無水權號造成無法配對的問題，不得宣稱已修復。

## 交付

npm test；python publish-tests.py；對 JS／PowerShell／Python 做語法檢查。ZIP 根目錄「地下水井管理系統」。重新計算遞迴檔案 SHA256.json，排除相依及暫存；覆蓋地下水井管理系統.zip 與兩個 Groundwater-PC 舊下載路徑。版本以 package.json 為準。


## Git 儲存庫版本

本程式位於儲存庫 desktop/，完整 clone 可取得。九月實際更新日誌留在本機交付包，不加入公開 Git 原始碼；文件對該日誌的說明為歷史背景。原始井籍／水權／電費與憑證不在本目錄，仍須另外準備。
