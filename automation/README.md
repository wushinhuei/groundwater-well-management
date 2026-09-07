# Groundwater Weekly Sync Automation

這個設計讓使用者只需要把原始 Excel、水權狀 PDF、抽水紀錄來源檔放到 Google Drive。Apps Script 每週觸發 GitHub Actions，GitHub Actions 再依照 `groundwater-well-sync` 與 `groundwater-pumping-sync` 的規則更新公開頁面的 `data/wells.json` 與 `data/pumping-history.json`。

## 架構

1. Google Drive 保存原始資料與索引資料。
2. Apps Script 每週一早上 6 點觸發 GitHub repository dispatch。
3. GitHub Actions 下載 Drive 來源、比對 Drive 索引、只處理有變動的 Excel / 水權狀 / 抽水紀錄。
4. GitHub Actions 產生公開頁 JSON、同步報告與 `groundwater-drive-indexes` artifact。
5. Apps Script 下載 `groundwater-drive-indexes` artifact，使用 `shinhuei0928307617@gmail.com` 的 Drive 權限寫回 `00_系統索引資料`。
6. 有變更時才 commit 到 GitHub Pages repository。

## Apps Script 設定

把 `apps-script/Code.gs` 貼到 Apps Script 專案，並在「專案設定 > 指令碼屬性」設定：

| 名稱 | 必填 | 說明 |
| --- | --- | --- |
| `GITHUB_TOKEN` | 是 | GitHub token，需要可呼叫 repository dispatch。 |
| `GITHUB_OWNER` | 是 | repository owner，例如 `wushinhuei`。 |
| `GITHUB_REPO` | 是 | repository 名稱，例如 `groundwater-well-management`。 |
| `GITHUB_EVENT_TYPE` | 否 | 預設 `groundwater-sync`。 |
| `GROUNDWATER_ROOT_FOLDER_ID` | 否 | `shinhuei0928307617@gmail.com` 的 `農業用水資料統計` 根目錄。 |
| `DRIVE_INDEX_FOLDER_ID` | 否 | `00_系統索引資料` 資料夾 ID。留空時 Apps Script 會從根目錄尋找，找不到就用你的帳號建立。 |
| `REGISTRY_FOLDER_ID` | 否 | 可留空；程式會從根目錄尋找 `抽水井一覽表`。 |
| `WELL_INDEX_FOLDER_ID` | 否 | 可留空；程式會從根目錄尋找 `00_系統索引資料`。 |
| `PUMPING_INDEX_FOLDER_ID` | 否 | 可留空；目前共用 `00_系統索引資料`。 |
| `WATER_RIGHT_FOLDER_ID` | 否 | 可留空；程式會從根目錄尋找 `地下水水權狀`。 |

第一次設定後，手動執行一次 `installWeeklyTrigger()`，授權完成後會建立每週一 06:00 的排程。若要立即測試，執行 `testTriggerGroundwaterSync()`；GitHub Actions 完成後，Apps Script 會自動延後檢查並寫回索引。若只想把最近一次成功 workflow 的索引補寫回 Drive，執行 `testSyncDriveIndexesFromLatestGitHubRun()`。

## GitHub 設定

把 `github-actions/groundwater-sync.yml` 放到 repository 的 `.github/workflows/groundwater-sync.yml`。

需要設定 GitHub secret：

| 名稱 | 說明 |
| --- | --- |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Google service account JSON。該 service account 必須被分享進地下水井 Drive 根目錄與索引資料夾。 |

GitHub Actions 仍會嘗試直接更新 Drive 索引；若因 service account 沒有個人 Drive 儲存空間而失敗，流程會繼續。穩定寫回 Drive 的責任由 Apps Script 接手，因為 Apps Script 是用 `shinhuei0928307617@gmail.com` 的 Google 帳號權限建立與更新檔案。

建議設定 repository variables，作為 Apps Script payload 缺漏時的備援：

| 名稱 | 目前建議值 |
| --- | --- |
| `GROUNDWATER_ROOT_FOLDER_ID` | `1TLw8JdrVw_OagddkzZz96effiJ51q3F5` |
| `REGISTRY_FOLDER_ID` | 留空 |
| `WELL_INDEX_FOLDER_ID` | 留空 |
| `PUMPING_INDEX_FOLDER_ID` | 留空 |
| `WATER_RIGHT_FOLDER_ID` | 留空 |

## Repository 內需要的同步程式

workflow 會呼叫兩段程式：

1. `scripts/groundwater_drive_sync.py`
   - 從 Drive 找最新一覽表 Excel。
   - 依登錄日期優先、Drive modifiedTime 備援，判斷是否需要重讀 Excel。
   - 若 Excel 未變，不重新解析全部內容。
   - 若 Excel 變了，只解析一次，拆成每口井索引。
   - 從 Excel 抽出內嵌照片 hash，用每口井 `photoHash` 判斷照片是否變更。
   - 掃描 Drive 水權狀資料夾 metadata，只下載新增或已修改的檔案。
   - 更新 Drive 的 `well-index.json`、`station-index.json`、`warnings.csv`、抽水紀錄索引與 `sync-index.json`。
   - 本工作區已建立雲端執行版範本：[scripts/groundwater_drive_sync.py](../scripts/groundwater_drive_sync.py)。

2. `work/sync_public_data.py`
   - 讀取最新 Drive 索引與目前公開頁資料。
   - 合併成公開頁 `data/wells.json` 與 `data/pumping-history.json`。
   - 檢查過期與即將過期水權狀。
   - 產出同步摘要。

目前本工作區已有 `scripts/groundwater_drive_sync.py` 與 `work/sync_public_data.py`。搬到實際 GitHub Pages repository 時，建議把兩支都放進 repository，或把 `work/sync_public_data.py` 移到 `scripts/sync_public_data.py`。

## 每週更新策略

- 固定每週一 06:00 由 Apps Script 觸發。
- 若一覽表 Excel 的登錄日期與 Drive metadata 都未改變，跳過 Excel 全檔解析。
- 若只有一口井照片變更，仍需讀取該 Excel 一次來取得內嵌圖片，但公開頁只更新該井相關資料與 hash。
- 若水權狀 PDF 在 Drive 有更新，只處理該檔案匹配到的井。
- 若抽水紀錄來源檔未變，跳過抽水紀錄重建。
- 若水權期限已過期，摘要中提醒更換掃描最新水權狀；無法判斷期限或匹配關係時才需要人工確認。

## Apps Script 寫回 Drive 的索引檔

`syncDriveIndexesFromLatestGitHubRun()` 會從 GitHub Actions 的 `groundwater-drive-indexes` artifact 寫回以下檔案：

- `well-index.json`
- `station-index.json`
- `warnings.csv`
- `water-right-attachment-index.json`
- `pumping-index.json`
- `pumping-month-index.json`
- `pumping-warnings.json`
- `sync-index.json`
- `sync-summary.md`
