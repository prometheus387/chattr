#!/bin/bash

# Farben für hübschere Terminal-Ausgaben
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}[Chattr-Migrator] Starte Migrations-Prozess...${NC}"

# 1. Name für die Migration abfragen, falls keiner übergeben wurde
MIGRATION_NAME=$1
if [ -z "$MIGRATION_NAME" ]; then
    echo -e "${BLUE}Wie soll die Migration heißen? (z.B. AddUserTable):${NC}"
    read -r MIGRATION_NAME
fi

# 2. Arch-Linux spezifische Variablen für .NET 10 setzen
export DOTNET_ROOT=/usr/share/dotnet
export PATH=$DOTNET_ROOT:$PATH
export DOTNET_ROLL_FORWARD=Major

echo -e "${BLUE}[1/3] Räume alte Build-Reste auf...${NC}"
dotnet clean > /dev/null

# 3. Migration generieren
echo -e "${BLUE}[2/3] Generiere Migrations-Dateien für '$MIGRATION_NAME'...${NC}"
dotnet tool run dotnet-ef migrations add "$MIGRATION_NAME" \
    --project Chattr.Infrastructure \
    --startup-project Chattr.Api

# Prüfen, ob das Erstellen der Migration geklappt hat
if [ $? -eq 0 ]; then
    echo -e "${GREEN}--> Migration '$MIGRATION_NAME' erfolgreich erstellt!${NC}"
    
    # 4. API direkt starten (wodurch die DB im Docker geupdatet wird)
    echo -e "${BLUE}[3/3] Starte Chattr.Api (Datenbank-Update läuft automatisch)...${NC}"
    echo -e "${GREEN}======================================================${NC}"
    dotnet run --project Chattr.Api
else
    echo -e "${RED}[FEHLER] Die Migration konnte nicht erstellt werden. Check die Build-Fehler oben!${NC}"
    exit 1
fi