# 地下水井資料更新規則

所有時間以 Asia/Taipei 計算。Apps Script 時間觸發器約有正負 15 分鐘誤差。

| 工作 | 日期 | 約定時間 | 範圍 |
|---|---|---|---|
| 井籍 | 每月 1、3、5…29 日 | 05:17 | 111 口井依井號排序，輪流更新一批，每批約 7–8 口 |
| 抽水量 | 每月 6、16、26 日 | 13:43 | 檢查來源版本，有變更才匯入 |

井籍觸發器每日醒來，但偶數日及 31 日立即返回，不發出網路請求。2 月按當月實際可用的 14 或 15 個日期分批，避免漏井。安裝函式是 `installStaggeredTriggers()`；舊安裝函式亦會轉到此函式，避免重新啟用舊週排程。

同一天同類工作只派送一次；Apps Script 使用執行鎖，偵測已排隊／執行中的同步便跳過。GitHub Actions 共用單一 concurrency group，不取消進行中的工作。Drive 請求依序處理，每次至少間隔 0.5 秒，暫時性失敗最多重試 3 次。索引回寫每 10 分鐘檢查，最多 6 次。這些措施降低請求量，不能保證第三方網站永遠不會限流。

## 抽水來源與匯入

目前來源：[115 年地下水水權用水紀錄表](https://docs.google.com/spreadsheets/d/1pYv1n_6dEsU0digJY-X1ZlpEPQPxsFkgrnK1Mz6G_1Q/edit)。GitHub variable `PUMPING_SOURCE_FILE_ID` 指向此檔案。Google 試算表透過 Drive API 匯出 Excel；亦支援指定 `.xlsx` 或 `.xlsm`。更換年度來源時更新此 variable，舊年度仍保留。

1. 先讀取索引和公開歷史資料，再比較來源 ID、修改時間、大小與 MD5（若來源提供）。未改變就不下載 Excel。
2. 解析「月實取水量表」，以水權狀號、民國年度、月份合併。公式須有快取結果；能確認為空白的跨表／IF 公式保留空白。
3. 區分未填報 `null` 與明確填報 `0`。空白不清除既有數值；有效的來源修正值會留下變更紀錄。負值、格式錯誤、衝突重複鍵、年度不明、合計差距超過 0.01 m³ 都中止匯入。
4. 未列在現行井籍的井號保留在索引並警示，不猜測對應關係、不加入公開井籍。重新計算公開筆數、空缺井號與既有異常規則。
5. 產出 `pumping-index.json`、`pumping-month-index.json`、`pumping-sync-index.json`、`pumping-warnings.json`、`pumping-changes.json` 和摘要。Apps Script 回寫 Drive，GitHub 保存來源版本供下次比對。
6. 抽水工作不改井籍檔案；井籍工作不改抽水檔案。失敗不發布部分結果。

首次修正於 2026-09-24 驗證：原始表 111 筆，與現行井籍相符 110 口；8 月已有值 109 口。`B1050080` 的 8 月仍空白，`K0124336` 未列在來源中，`B1150091` 不在現行井籍，未配對。公開歷史保留民國 100–114 年全部月數值，加入本年填報後共 828 筆年度紀錄。

## 驗證

```sh
python -m unittest discover -s scripts -p 'test_*.py'
node --test
```

手動同步在 GitHub Actions 的 `Groundwater public data sync` 選擇 `pumping` 或 `wells`，一次只啟動一項。執行結果與異常見 `groundwater-sync-report` artifact，公開更新摘要見 `sync-reports`。
