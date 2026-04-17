#!/bin/bash

# Abre 3 tabs en Terminal y levanta el entorno local de forecast-v2

osascript <<EOF
tell application "Terminal"
  activate

  -- Tab 1: PostgreSQL
  do script "/opt/homebrew/opt/postgresql@16/bin/postgres -D /opt/homebrew/var/postgresql@16"

  -- Tab 2: Backend
  tell application "System Events" to keystroke "t" using command down
  delay 0.5
  do script "cd /Users/kurai/Desktop/CLAUDEEEE/DOT4/forecast-v2/backend && DATABASE_URL=postgresql://localhost/forecast_dev npm run dev" in front window

  -- Tab 3: Frontend
  tell application "System Events" to keystroke "t" using command down
  delay 0.5
  do script "cd /Users/kurai/Desktop/CLAUDEEEE/DOT4/forecast-v2/frontend && npm run dev" in front window
end tell
EOF

echo "Abriendo http://localhost:5173 en 4 segundos..."
sleep 4
open http://localhost:5173
