#!/bin/bash
# Agentic Engineering — Стартер-кит: установка
# Запуск: bash setup.sh [путь-к-проекту]
#
# Скрипт копирует все файлы конфигурации в проект,
# переименовывает шаблоны и устанавливает глобальные настройки Claude.

set -euo pipefail

# Определяем директорию, где лежит скрипт
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# Целевая директория — аргумент или текущая
TARGET_DIR="${1:-.}"
TARGET_DIR="$(cd "$TARGET_DIR" && pwd)"

echo "=== Agentic Engineering — Стартер-кит ==="
echo ""
echo "Источник:  $SCRIPT_DIR"
echo "Проект:    $TARGET_DIR"
echo ""

# --- 1. Копирование файлов в проект ---
echo "1/4  Копирование файлов в проект..."

# Список папок и файлов для копирования (включая скрытые)
ITEMS=(
  ".agents"
  ".claude"
  ".github"
  ".memory_bank"
  ".vscode"
  ".cursorignore"
  "CLAUDE.md.template"
  "CLAUDE-core.md.template"
)

COPIED=0
SKIPPED=0

for item in "${ITEMS[@]}"; do
  src="$SCRIPT_DIR/$item"
  dst="$TARGET_DIR/$item"

  if [ ! -e "$src" ]; then
    echo "   ⚠ Не найден: $item"
    continue
  fi

  if [ -d "$src" ]; then
    # Папка — копируем содержимое, не перезаписывая
    mkdir -p "$dst"
    # Копируем каждый файл из папки
    find "$src" -type f | while read -r file; do
      rel="${file#$src/}"
      dst_file="$dst/$rel"
      if [ -e "$dst_file" ]; then
        echo "   ⏭ Уже есть: $item/$rel"
        ((SKIPPED++)) || true
      else
        mkdir -p "$(dirname "$dst_file")"
        cp "$file" "$dst_file"
        echo "   ✓ $item/$rel"
        ((COPIED++)) || true
      fi
    done
  else
    # Файл
    if [ -e "$dst" ]; then
      echo "   ⏭ Уже есть: $item"
      ((SKIPPED++)) || true
    else
      cp "$src" "$dst"
      echo "   ✓ $item"
      ((COPIED++)) || true
    fi
  fi
done

echo ""

# --- 2. Переименование шаблонов ---
echo "2/4  Переименование шаблонов (.template → без суффикса)..."

RENAMED=0
# Переименовываем только файлы из известных директорий стартер-кита
TEMPLATE_DIRS=(
  "$TARGET_DIR/CLAUDE.md.template"
  "$TARGET_DIR/CLAUDE-core.md.template"
)
TEMPLATE_SEARCH_DIRS=(
  "$TARGET_DIR/.agents"
  "$TARGET_DIR/.github"
  "$TARGET_DIR/.memory_bank"
)

for f in "${TEMPLATE_DIRS[@]}"; do
  if [ -f "$f" ]; then
    target="${f%.template}"
    if [ -e "$target" ]; then
      echo "   ⏭ Уже есть: $(basename "$target")"
    else
      mv "$f" "$target"
      echo "   ✓ $(basename "$f") → $(basename "$target")"
      ((RENAMED++)) || true
    fi
  fi
done

for dir in "${TEMPLATE_SEARCH_DIRS[@]}"; do
  if [ -d "$dir" ]; then
    find "$dir" -name "*.template" -print | while read -r f; do
      target="${f%.template}"
      if [ -e "$target" ]; then
        echo "   ⏭ Уже есть: $(basename "$target")"
      else
        mv "$f" "$target"
        echo "   ✓ $(basename "$f") → $(basename "$target")"
        ((RENAMED++)) || true
      fi
    done
  fi
done

echo ""

# --- 3. Глобальные настройки Claude ---
echo "3/4  Глобальные настройки Claude (~/.claude/settings.json)..."

GLOBAL_SRC="$SCRIPT_DIR/.claude/settings.global.json"
GLOBAL_DST="$HOME/.claude/settings.json"

if [ -f "$GLOBAL_SRC" ]; then
  if [ -f "$GLOBAL_DST" ]; then
    echo "   ⏭ ~/.claude/settings.json уже существует (не перезаписываем)"
    echo "   ℹ Сравните вручную: diff $GLOBAL_SRC $GLOBAL_DST"
  else
    mkdir -p "$HOME/.claude"
    cp "$GLOBAL_SRC" "$GLOBAL_DST"
    echo "   ✓ Установлен ~/.claude/settings.json"
  fi
else
  echo "   ⚠ settings.global.json не найден в пакете"
fi

echo ""

# --- 4. Удаление settings.global.json из проекта ---
echo "4/4  Очистка..."

PROJECT_GLOBAL="$TARGET_DIR/.claude/settings.global.json"
if [ -f "$PROJECT_GLOBAL" ]; then
  rm "$PROJECT_GLOBAL"
  echo "   ✓ Удалён .claude/settings.global.json (он нужен только в ~/.claude/)"
fi

echo ""
echo "=== Готово! ==="
echo ""
echo "Следующие шаги:"
echo "  1. Замените плейсхолдеры [PROJECT_NAME], [BUILD_CMD] и др. (см. README.md)"
echo "  2. Заполните .memory_bank/projectbrief.md и techContext.md"
echo "  3. Запустите: claude"
echo "  4. Проверьте: агент отвечает на русском и знает имя проекта"
echo ""
