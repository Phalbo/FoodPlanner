import os, zipfile, textwrap

base = "/mnt/data/meal-planner-v2-full"
os.makedirs(base, exist_ok=True)

# README.md
readme = textwrap.dedent("""\
# Meal Planner V2 – README

## Overview
Un’app web **single-page** per pianificare i pasti settimanali (7 giorni × 4 pasti).
È scritta in **HTML + CSS + JavaScript vanilla**, con un database esterno in **XML** (`foods.xml`).
L’interfaccia è pensata per essere **responsive** (desktop e mobile).

## Features
- Calendario settimanale drag&drop (colazione, spuntino, pranzo, cena)
- Dispensa alimenti da `foods.xml`
- Filtri allergeni
- Randomizer 🎲 su slot e categorie
- Regole: max 2 carbo consecutivi, max 2 occorrenze/sett, rispetto allergeni
- Porzioni adulti/bambini + kcal medie giornaliere
- Lista spesa settimanale con quantità totali
- Salvataggio localStorage + export/import JSON

## File structure

meal-planner-v2/
├── index.html
├── styles.css
├── app.js
├── foods.xml
└── README.md


## foods.xml
Ogni `<item>` ha attributi:
- `name`
- `cat` (categoria)
- `allergens` (csv)
- `kcal100` (kcal/100g)
- `portion_adult_g`, `portion_child_g`

Esempio:
```xml
<item name="Pasta integrale" cat="carboidrati"
      allergens="glutine" kcal100="350"
      portion_adult_g="80" portion_child_g="60"/>


