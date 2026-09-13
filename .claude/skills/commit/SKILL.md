---
name: commit
description: 將當前所有 Local Changes 在 master 分支上做一次 commit，subject 為 feat(v<上一版號+1>)：<變更大綱>，body 為變更內容條列。不 push。使用者輸入 /commit 時使用。
---

# /commit

把工作區「所有」尚未提交的變更（已修改、新增、刪除、未追蹤檔案）整理成一個 commit。

## 步驟

1. **確認狀態與分支**

   ```bash
   git status --short
   git branch --show-current
   git log -1 --format='%s'
   ```

   - 若沒有任何變更，直接回報「沒有可提交的變更」並結束。
   - 若當前分支不是 `master`，**停下來**告訴使用者目前在哪個分支，詢問是否要切到 `master`。不要自行切換分支。

2. **讀取變更內容**

   ```bash
   git add -A
   git diff --cached --stat
   git diff --cached
   ```

   diff 很大時可先看 `--stat`，再針對重點檔案看細節。要真的讀懂改了什麼，不要只憑檔名猜測。

3. **算出新版號**

   從 `git log -1 --format='%s'` 取出上一個 commit subject 裡的版號，格式為 `feat(vX.Y.Z): ...`，把最後一碼 +1。

   - `v0.0.5` → `v0.0.6`
   - `v0.0.9` → `v0.0.10`（就是純數字 +1，不進位到 minor）
   - 若上一個 commit 沒有版號可解析，改用 `git log --format='%s' | grep -oE 'v[0-9]+\.[0-9]+\.[0-9]+' | head -1` 找最近一個有版號的 commit 為基準；仍找不到就用 `v0.0.1`。

4. **提交**

   Subject：`feat(<新版號>): <變更大綱>`
   Body：條列這次的變更內容，每行以 `* ` 開頭。

   - 全部用**繁體中文**撰寫，跟既有 commit 風格一致。
   - 大綱一句話講完這次改動的重點；變更單純時 body 可以省略。
   - 不要加 `Co-Authored-By`、`Generated with Claude Code` 之類的尾註 —— 這個 repo 的歷史沒有。

   ```bash
   git commit -m "feat(v0.0.6): 變更大綱" -m "* 變更內容一
   * 變更內容二"
   ```

5. **收尾**

   ```bash
   git log -1 --stat
   ```

   回報 commit 結果。**不要 push**，也不要建立 tag 或分支。

## 規則

- 只在 `master` 分支上 commit。
- 一律不 push。
- 一次只做一個 commit，把所有變更放進去，不要拆。
