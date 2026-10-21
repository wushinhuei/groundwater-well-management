# Repository maintenance

網站由 docs 託管；desktop 是完整本機更新工具。維護 desktop 前先讀 desktop/AGENTS.md 及 README。保留既有網站與公開資料，不要將私人 Excel、電費、Google 金鑰、session 或本機設定提交。desktop 原始來源仍為 Drive，D 槽原始資料未直接接入。

Node 測試：在 desktop 執行 npm test；Python 測試：python publish-tests.py。網站另有既有 root npm test。不要以離線測試代替實際登入／部署驗收。發布桌面套件時更新 desktop/SHA256.json，排除 node_modules、__pycache__ 與所有登入／執行狀態。
