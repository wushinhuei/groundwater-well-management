# 地下水井管理系統

## 完整程式 clone 與 Windows 更新程式

此儲存庫同時保存網站程式（docs/public/server/src）與完整 Windows 更新工具（desktop）。GitHub Pages 維持使用 docs；desktop 包含本機排程、手動 BAT、資料同步、Python 發布流程、測試及接手文件，不需要 Apps Script。

```powershell
git clone https://github.com/wushinhuei/groundwater-well-management.git
cd groundwater-well-management\desktop
.\Setup.cmd
.\Configure-Local.cmd
```

依序閱讀 [桌面版 README](desktop/README.md)、[檔案清冊](desktop/檔案清冊.md)、[接手 AGENTS](desktop/AGENTS.md)。水利署登入、Google 服務帳號及 GitHub gh 登入必須在新 PC 自行設定。clone 不會帶走密碼、金鑰、登入 cookie 或私人原始資料。

目前使用者本機原始資料目錄為 `D:\地下水井管理系統`，包含井籍 Excel、水權狀及電費表。這些檔案未在本次提交上傳。**desktop 目前仍從設定的 Google Drive 匯入正式資料，沒有自動改成讀 D 槽 Excel／PDF**；D 槽檔案是本機來源備份，若要改為直接匯入，需另行實作來源設定與欄位驗證。電費分析不包含在本版更新流程。

舊 automation/apps-script 為歷史程式，不是 desktop 的必要相依；切換正式排程時須停用既有舊觸發器，避免同時寫入。實站登入、排程與發布尚待驗收，不能以 clone 或單元測試成功代表全部完成。


雲端網頁版地下水井管理系統第一版。系統提供公開查詢、GIS 井點圖台、井籍明細、現場照片顯示，以及管理端井籍維護流程。

## 功能

- 公開查詢：依行政區、工作站別、狀態篩選井籍。
- GIS 圖台：顯示井點位置，點選井點可查看井籍摘要。
- 井籍明細：顯示地址、座標系統、井深、管徑、水權資料、完工日期等欄位。
- 現場照片：公開明細右側顯示現場照片。
- 水權狀：可由井籍卡片開啟水權狀 PDF。
- 歷史抽水紀錄：在井籍明細查看臺中及苗栗水權的歷年每月抽水量，並區分未填報與填報值 0。
- 後台管理：管理人員可登入新增、編輯、停用井籍並上傳附件。

## 本機啟動

```powershell
npm start
```

或使用 Codex 內建 Node.js：

```powershell
& "C:\Users\a0802\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" server.js
```

啟動後開啟：

```text
http://localhost:4173/
```

## 後台登入

預設帳號密碼僅供本機測試：

```text
帳號：admin
密碼：admin123
```

正式環境請改用環境變數設定：

```text
ADMIN_USER
ADMIN_PASSWORD
```

## 測試

```powershell
npm test
```

## 資料安全

正式井籍資料、現場照片、水權狀 PDF、整理輸出檔，以及含內網路徑的匯入工具，預設不放入 GitHub。這些資料應存放在內部伺服器、資料庫或受控物件儲存空間。
