#!/usr/bin/env bash
# 以 Cocos Creator 3.8.8 命令列建置 web-desktop。
# 建置成功（退出碼 36）後執行 /commit，將所有變更（含 build/web-desktop 產物）提交到 master。
#
#   pnpm build:web
#
# 可用環境變數覆寫路徑：
#   COCOS_CREATOR  Cocos Creator 3.8.8 執行檔
#   CLAUDE_BIN     Claude Code CLI 執行檔（用於執行 /commit）
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD_SUCCESS=36

# Git Bash 下將路徑轉為 Windows 格式再交給原生執行檔
native_path() {
    if command -v cygpath >/dev/null 2>&1; then cygpath -w "$1"; else printf '%s' "$1"; fi
}

find_cocos() {
    local candidate
    for candidate in \
        "/c/ProgramData/cocos/editors/Creator/3.8.8/CocosCreator.exe" \
        "/Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/MacOS/CocosCreator"; do
        if [[ -x "$candidate" ]]; then
            printf '%s' "$candidate"
            return
        fi
    done
}

find_claude() {
    if command -v claude >/dev/null 2>&1; then
        command -v claude
        return
    fi
    # VS Code 擴充套件內附的 CLI，取版本最新的一個
    ls -d "$HOME"/.vscode/extensions/anthropic.claude-code-*/resources/native-binary/claude* 2>/dev/null | sort -V | tail -n 1
}

COCOS_CREATOR="${COCOS_CREATOR:-$(find_cocos)}"
if [[ -z "$COCOS_CREATOR" || ! -x "$COCOS_CREATOR" ]]; then
    echo "✖ 找不到 Cocos Creator 3.8.8，請以 COCOS_CREATOR 環境變數指定執行檔路徑。" >&2
    exit 1
fi

CLAUDE="${CLAUDE_BIN:-$(find_claude)}"
if [[ -z "$CLAUDE" ]]; then
    echo "✖ 找不到 Claude Code CLI，請以 CLAUDE_BIN 環境變數指定執行檔路徑。" >&2
    exit 1
fi

# 在 VS Code 等 Electron 應用的終端機中，此變數會讓 CocosCreator.exe 以 Node 模式啟動而無法建置
unset ELECTRON_RUN_AS_NODE

echo "▶ Building web-desktop with Cocos Creator 3.8.8 ..."
"$COCOS_CREATOR" \
    --project "$(native_path "$ROOT")" \
    --build "configPath=$(native_path "$ROOT/tools/build-web-desktop.json")"
exit_code=$?

if [[ $exit_code -ne $BUILD_SUCCESS ]]; then
    echo "✖ Build failed (exit code $exit_code), skip commit." >&2
    exit 1
fi
echo "✔ Build succeeded: build/web-desktop"

echo "▶ Running /commit ..."
cd "$ROOT"
"$CLAUDE" -p "/commit" --allowedTools "Bash(git:*)"
