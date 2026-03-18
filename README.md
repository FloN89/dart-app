# 🎯 Steeldart Scoreboard (301/501)

Eine kleine **Vanilla-JS Web-App** zum Zählen von Steeldart-Spielen (z.B. 301/501) – inklusive **Double-Out**, **Bust-Regeln**, **Undo** und einem **Checkout-Hint** (≤ 3 Darts).



---

## Features

- ✅ 301 / 501 Startscore auswählbar
- ✅ Double-Out optional (Single-Out ebenfalls möglich)
- ✅ Spielerverwaltung (bis zu 20 Spieler)
- ✅ Pro Aufnahme max. 3 Darts
- ✅ Bust-Logik (inkl. Rücksetzen auf Turn-Startscore)
- ✅ Finish-Handling (Spieler wird als ✅ markiert)
- ✅ Undo-Funktion (History)
- ✅ Checkout-Hinweis: mögliche Kombination in ≤ 3 Darts
- ✅ “R” Button (Shot): zählt als 0 Punkte, erhöht aber einen Shot-Counter je Spieler

---

## Tech Stack

- HTML5
- CSS3
- JavaScript (Vanilla / keine Frameworks)

---

## Projektstruktur

```text
.
├─ index.html
├─ style.css
├─ script.js
└─ img/
   ├─ background-img.png
   └─ shot-img.png