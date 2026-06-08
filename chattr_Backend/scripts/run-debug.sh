#!/bin/bash

cd "$(dirname "$0")/.." || exit

# Farben für das Terminal
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}[Chattr-Runner] Bereite Debug-Umgebung für .NET 10 vor...${NC}"

# 1. Arch-Linux spezifische Variablen setzen
export DOTNET_ROOT=/usr/share/dotnet
export PATH=$DOTNET_ROOT:$PATH
export DOTNET_ROLL_FORWARD=Major

# 2. Kurzer Clean, um alte Caches loszuwerden
echo -e "${BLUE}[1/2] Bereinige alte Build-Dateien...${NC}"
dotnet clean > /dev/null

# 3. API im Watch-Modus starten
echo -e "${BLUE}[2/2] Starte Chattr.Api im Watch-Modus (Hot Reload aktiv)...${NC}"
echo -e "${GREEN}======================================================${NC}"

# "dotnet watch" überwacht deinen Code. Wenn du speicherst, lädt er es direkt neu.
dotnet watch run --project Chattr.Api