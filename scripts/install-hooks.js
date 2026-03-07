#!/usr/bin/env node
/**
 * Кроссплатформенная установка git hooks.
 * Работает на Windows (cmd/powershell) и POSIX (bash/zsh).
 * Запускается через postinstall в корневом package.json.
 */

const fs = require('fs');
const path = require('path');

const HOOKS_DIR = path.join(__dirname, '..', '.git', 'hooks');

// Защита main-ветки от прямых коммитов
const MAIN_GUARD = `
# --- main-branch protection (bonk-race) ---
BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null)"
if [ "$BRANCH" = "main" ] || [ "$BRANCH" = "master" ]; then
    echo "\\033[31mError: direct commits to '$BRANCH' are not allowed.\\033[0m" >&2
    echo "Create a feature branch: git checkout -b sprint-1/my-task" >&2
    exit 1
fi
# --- end main-branch protection ---
`;

function ensureHooksDir() {
    if (!fs.existsSync(HOOKS_DIR)) {
        // Не внутри git-репозитория — пропускаем
        console.log('Not a git repository, skipping hooks install.');
        process.exit(0);
    }
}

function patchPreCommit() {
    const hookPath = path.join(HOOKS_DIR, 'pre-commit');
    let content = '';

    if (fs.existsSync(hookPath)) {
        content = fs.readFileSync(hookPath, 'utf8');
        // Уже установлено — пропускаем
        if (content.includes('main-branch protection (bonk-race)')) {
            console.log('pre-commit hook: main-branch protection already installed.');
            return;
        }
    } else {
        content = '#!/bin/sh\n';
    }

    // Вставляем защиту после shebang, перед остальным содержимым
    const lines = content.split('\n');
    const shebangIdx = lines.findIndex(l => l.startsWith('#!'));
    const insertIdx = shebangIdx >= 0 ? shebangIdx + 1 : 0;

    lines.splice(insertIdx, 0, MAIN_GUARD);
    const updated = lines.join('\n');

    fs.writeFileSync(hookPath, updated, { mode: 0o755 });
    console.log('pre-commit hook: main-branch protection installed.');
}

try {
    ensureHooksDir();
    patchPreCommit();
} catch (err) {
    // Не блокируем npm install при ошибках с hooks
    console.warn('Warning: could not install git hooks:', err.message);
}
