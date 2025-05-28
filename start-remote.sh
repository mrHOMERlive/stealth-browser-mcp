#!/bin/bash
# Скрипт для запуска MCP сервера в режиме HTTP для удаленного доступа

# Установите переменные окружения для настройки сервера
export PORT=3000
export HOST=0.0.0.0
export AUTH_TOKEN=your-secret-token
export TRANSPORT_TYPE=http

# Запуск сервера
echo "Запуск MCP сервера с настройками:"
echo "PORT: $PORT"
echo "HOST: $HOST"
echo "AUTH_TOKEN: $AUTH_TOKEN"
echo "TRANSPORT_TYPE: $TRANSPORT_TYPE"

# Используем bun или node в зависимости от того, что доступно
if command -v bun >/dev/null 2>&1; then
  bun run index.ts
else
  npx tsx index.ts
fi
