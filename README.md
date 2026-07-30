# 地下水井管理系統

雲端網頁版地下水井管理系統第一版。系統提供公開查詢、GIS 井點圖台、井籍明細、現場照片顯示，以及管理端井籍維護流程。

## 功能

- 公開查詢：依行政區、工作站別、狀態篩選井籍。
- GIS 圖台：顯示井點位置，點選井點可查看井籍摘要。
- 井籍明細：顯示地址、座標系統、井深、管徑、水權資料、完工日期等欄位。
- 現場照片：公開明細右側顯示現場照片。
- 水權狀：可由井籍卡片開啟水權狀 PDF。
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
