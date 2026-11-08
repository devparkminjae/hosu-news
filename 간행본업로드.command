#!/bin/zsh

cd -- "$(dirname -- "$0")"

if ! command -v node >/dev/null 2>&1; then
  osascript -e 'display alert "업로드 도구를 실행할 수 없습니다" message "Node.js가 설치되어 있지 않습니다. Codex에게 설치를 요청해 주세요." as critical'
  exit 1
fi

node tools/publication-manager.mjs
