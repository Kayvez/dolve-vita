#!/bin/bash
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js non è installato."
  echo "Scaricalo da https://nodejs.org (versione LTS), installalo e riprova."
  read -p "Premi Invio per chiudere"
  exit 1
fi
node server.js
