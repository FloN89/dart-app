(() => {
  /**
   * Steeldart Scoreboard
   * Features:
   * - 301/501 Startscore
   * - (Optional) Double-Out Regel
   * - Spielerverwaltung (max. 20)
   * - Aufnahme-Logik (max. 3 Darts pro Spieler)
   * - Bust-Regeln + Undo (History)
   * - Checkout-Hint (≤ 3 Darts)
   *
   * Hinweis:
   * - "R" zählt als 0 Punkte, erhöht aber den Shot-Zähler (rCount).
   */

  // ---------- State ----------
  const state = {
    startScore: 501,
    doubleOut: true,

    players: [],        // { name, score, rCount, finished }
    active: 0,          // Index im players-Array

    multiplier: 1,      // 1 / 2 / 3 (Single ist Default ohne Button)
    turnDarts: [],      // Darts dieser Aufnahme [{label, points, isDouble, isTriple, isR}]
    turnStartScore: null,

    history: [],        // Snapshots für Undo
    turnLocked: false,  // Aufnahme ist zu Ende (Bust / Finish / 3 Darts)
    turnResult: null    // "BUST" | "FINISH" | null
  };

  // ---------- DOM Refs ----------
  const el = {
    modeSel: document.getElementById('modeSel'),
    doubleOut: document.getElementById('doubleOut'),
    newGameBtn: document.getElementById('newGameBtn'),

    players: document.getElementById('players'),
    playerCount: document.getElementById('playerCount'),
    playerName: document.getElementById('playerName'),
    addPlayerBtn: document.getElementById('addPlayerBtn'),
    removePlayerBtn: document.getElementById('removePlayerBtn'),

    turnInfo: document.getElementById('turnInfo'),
    activeName: document.getElementById('activeName'),
    activeR: document.getElementById('activeR'),
    activeRemain: document.getElementById('activeRemain'),
    darts: document.getElementById('darts'),
    checkoutHint: document.getElementById('checkoutHint'),

    doubleBtn: document.getElementById('doubleBtn'),
    tripleBtn: document.getElementById('tripleBtn'),

    keypad: document.getElementById('keypad'),
    undoBtn: document.getElementById('undoBtn'),
    nextBtn: document.getElementById('nextBtn'),
    toast: document.getElementById('toast')
  };

  // Keypad-Reihenfolge (4 Spalten Layout)
  const keys = [
    1,2,3,4,
    5,6,7,8,
    9,10,11,12,
    13,14,15,16,
    17,18,19,20,
    0,25,"R"
  ];

  // ---------- Helpers ----------
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const deepCopy = (obj) => JSON.parse(JSON.stringify(obj));

  function toast(msg) {
    el.toast.textContent = msg;
    el.toast.classList.add("show");
    setTimeout(() => el.toast.classList.remove("show"), 1400);
  }

  /**
   * Snapshot für Undo speichern.
   * Wir speichern nur Daten, keine DOM-Referenzen.
   */
  function pushHistory() {
    state.history.push(deepCopy({
      players: state.players,
      active: state.active,
      multiplier: state.multiplier,
      turnDarts: state.turnDarts,
      turnStartScore: state.turnStartScore,
      startScore: state.startScore,
      doubleOut: state.doubleOut,
      turnLocked: state.turnLocked,
      turnResult: state.turnResult
    }));

    // Begrenzen, damit das Array nicht ewig wächst
    if (state.history.length > 80) state.history.shift();
  }

  function restoreFromHistory() {
    const snap = state.history.pop();
    if (!snap) return;

    state.players = snap.players;
    state.active = snap.active;
    state.multiplier = snap.multiplier;
    state.turnDarts = snap.turnDarts;
    state.turnStartScore = snap.turnStartScore;
    state.startScore = snap.startScore;
    state.doubleOut = snap.doubleOut;
    state.turnLocked = snap.turnLocked ?? false;
    state.turnResult = snap.turnResult ?? null;

    // UI-State synchronisieren
    el.modeSel.value = String(state.startScore);
    el.doubleOut.checked = state.doubleOut;

    render();
  }

  function activePlayer() {
    return state.players[state.active] || null;
  }

  /**
   * Merkt sich den Score am Anfang der Aufnahme,
   * um bei Bust auf den Start der Aufnahme zurückzugehen.
   */
  function ensureTurnStart() {
    const p = activePlayer();
    if (!p) return;
    if (state.turnStartScore === null) state.turnStartScore = p.score;
  }

  // ---------- Checkout (≤3 darts) ----------
  function buildDartOptions() {
    const opts = [];

    // Singles 0..20 (0 ist technisch möglich fürs Rechnen), plus 25
    for (let n = 0; n <= 20; n++) {
      opts.push({ label: `S${n}`, points: n, isDouble: false, isTriple: false });
    }
    opts.push({ label: `S25`, points: 25, isDouble: false, isTriple: false });

    // Doubles 1..20 + Bull (D25=50)
    for (let n = 1; n <= 20; n++) {
      opts.push({ label: `D${n}`, points: n * 2, isDouble: true, isTriple: false });
    }
    opts.push({ label: `D25`, points: 50, isDouble: true, isTriple: false });

    // Triples 1..20 + optional T25 (falls man Triple+25 erlauben will)
    for (let n = 1; n <= 20; n++) {
      opts.push({ label: `T${n}`, points: n * 3, isDouble: false, isTriple: true });
    }
    
    // Größte Punkte zuerst (macht Suche “schöner”)
    opts.sort((a, b) => b.points - a.points);
    return opts;
  }
  const DART_OPTS = buildDartOptions();

  /**
   * Findet eine Checkout-Sequence (1–3 Darts).
   * Bei doubleOut=true muss der letzte Dart ein Double sein.
   */
  function findCheckout(remain, doubleOut) {
    if (remain <= 0) return null;

    for (let darts = 1; darts <= 3; darts++) {
      if (darts === 1) {
        for (const a of DART_OPTS) {
          if (a.points !== remain) continue;
          if (doubleOut && !a.isDouble) continue;
          return [a];
        }
      } else if (darts === 2) {
        for (const a of DART_OPTS) {
          const r1 = remain - a.points;
          if (r1 < 0) continue;

          for (const b of DART_OPTS) {
            if (b.points !== r1) continue;
            if (doubleOut && !b.isDouble) continue;
            return [a, b];
          }
        }
      } else {
        for (const a of DART_OPTS) {
          const r1 = remain - a.points;
          if (r1 < 0) continue;

          for (const b of DART_OPTS) {
            const r2 = r1 - b.points;
            if (r2 < 0) continue;

            for (const c of DART_OPTS) {
              if (c.points !== r2) continue;
              if (doubleOut && !c.isDouble) continue;
              return [a, b, c];
            }
          }
        }
      }
    }

    return null;
  }

  // ---------- Rules ----------
  /**
   * Bust-Bedingungen:
   * - newRemain < 0 => Bust
   * - Double-Out:
   *   - newRemain === 1 => Bust (man kann nicht auf 1 ausmachen)
   *   - newRemain === 0 und letzter Dart kein Double => Bust
   */
  function isBust(newRemain, lastDart) {
    if (newRemain < 0) return true;

    if (state.doubleOut) {
      if (newRemain === 1) return true;
      if (newRemain === 0 && !lastDart.isDouble) return true;
    }

    return false;
  }

  /**
   * Wendet einen Dart an (inkl. R/Shot).
   * Lockt die Aufnahme bei:
   * - Bust
   * - Finish (Score 0)
   * - 3 Darts geworfen
   */
  function applyDart(d) {
    const p = activePlayer();
    if (!p) {
      toast("Bitte erst Spieler hinzufügen.");
      return;
    }

    if (state.turnLocked) {
      toast("Aufnahme ist fertig – bitte \"Nächster Spieler\" drücken.");
      return;
    }

    ensureTurnStart();
    pushHistory();

    // R/Shot zählt als 0 Punkte, erhöht aber rCount
    if (d.isR) {
      p.rCount = (p.rCount || 0) + 1;
    }

    const before = p.score;
    const after = before - d.points;

    // Bust: Dart wird angezeigt, Score geht zurück auf Start der Aufnahme
    if (isBust(after, d)) {
      state.turnDarts.push(d);

      p.score = state.turnStartScore;
      state.multiplier = 1;

      state.turnLocked = true;
      state.turnResult = "BUST";

      toast("BUST! Bitte \"Nächster Spieler\" drücken.");
      render();
      return;
    }

    // Normaler Wurf
    p.score = after;
    state.turnDarts.push(d);

    // Finish
    if (p.score === 0) {
      p.finished = true;

      state.multiplier = 1;
      state.turnLocked = true;
      state.turnResult = "FINISH";

      toast(`🎯 ${p.name} macht aus! Bitte "Nächster Spieler" drücken.`);
      render();
      return;
    }

    // Aufnahme zu Ende nach 3 Darts
    if (state.turnDarts.length >= 3) {
      state.multiplier = 1;

      state.turnLocked = true;
      state.turnResult = null;

      toast("3 Darts geworfen. Bitte \"Nächster Spieler\" drücken.");
      render();
      return;
    }

    // Nach jedem Dart wieder auf Single (kein 1× Button)
    state.multiplier = 1;
    render();
  }

  /**
   * Wechselt den aktiven Spieler (manuell).
   * skipFinished könnte genutzt werden, um fertige Spieler zu überspringen.
   */
  function nextPlayer(skipFinished) {
    if (state.players.length === 0) return;

    let i = state.active;
    for (let step = 0; step < state.players.length; step++) {
      i = (i + 1) % state.players.length;
      if (!skipFinished || !state.players[i].finished) {
        state.active = i;
        break;
      }
    }

    render();
  }

  // ---------- Keypad ----------
  function multiplierLabel(mult, n) {
    const base = Number(n);
    const points = base * mult;

    if (mult === 1) return { label: `${base}`, points };
    if (mult === 2) return { label: `D${base}`, points };
    return { label: `T${base}`, points };
  }

  function makeKeypad() {
    el.keypad.innerHTML = "";

    keys.forEach(k => {
      const b = document.createElement("button");
      b.className = "k";

      if (k === "R") b.classList.add("r");
      if (k === 0) b.classList.add("zero");

      b.textContent = String(k);

      b.addEventListener("click", () => {
        if (k === "R") {
          applyDart({ label: "R", points: 0, isR: true, isDouble: false, isTriple: false });
          return;
        }

        let mult = state.multiplier;

      // 👉 Für 25 nur Single oder Double erlauben
      if (k === 25) {
        if (mult === 3) {
          toast("Triple 25 ist nicht erlaubt.");
          return;
        }
      }

const m = multiplierLabel(mult, k);

        applyDart({
          label: m.label,
          points: m.points,
          isR: false,
          isDouble: (mult === 2),
          isTriple: (mult === 3)
        });
      });

      el.keypad.appendChild(b);
    });
  }

  // ---------- Render ----------
  function renderPlayers() {
    el.players.innerHTML = "";

    state.players.forEach((p, idx) => {
      const row = document.createElement("div");
      row.className = "player" + (idx === state.active ? " active" : "");

      // Spieler anklicken => aktiven Spieler wechseln (reset current turn)
      row.addEventListener("click", () => {
        if (idx === state.active) return;

        pushHistory();

        // Aufnahme resetten 
        state.turnDarts = [];
        state.turnStartScore = null;
        state.multiplier = 1;
        state.turnLocked = false;
        state.turnResult = null;

        state.active = idx;
        render();
      });

      const left = document.createElement("div");
      left.className = "pname";

      const name = document.createElement("div");
      name.className = "name";
      name.textContent = p.name + (p.finished ? " ✅" : "");
      left.appendChild(name);

      // Shot Badge (R Counter)
      const badge = document.createElement("div");
      badge.className = "badge";

      const img = document.createElement("img");
      img.src = "img/shot-img.png";
      img.alt = "shot";

      const t = document.createElement("span");
      t.textContent = "× " + (p.rCount || 0);

      badge.appendChild(img);
      badge.appendChild(t);
      left.appendChild(badge);

      const right = document.createElement("div");
      right.className = "pmeta";

      const sc = document.createElement("div");
      sc.className = "score";
      sc.textContent = p.score;

      right.appendChild(sc);

      row.appendChild(left);
      row.appendChild(right);

      el.players.appendChild(row);
    });

    el.playerCount.textContent = `${state.players.length} / 20`;
  }

  function renderTurn() {
    const p = activePlayer();

    if (!p) {
      el.activeName.textContent = "–";
      el.activeR.textContent = "0";
      el.activeRemain.textContent = "–";
      el.turnInfo.textContent = "Keine Spieler";
      el.darts.innerHTML = "";
      el.checkoutHint.style.display = "none";
      return;
    }

    el.activeName.textContent = p.name;
    el.activeR.textContent = String(p.rCount || 0);
    el.activeRemain.textContent = String(p.score);

    // Turn Info
    const dartNo = state.turnDarts.length + 1;
    el.turnInfo.textContent =
      `Dart ${clamp(dartNo, 1, 3)} / 3 • Start ${state.startScore} • ${state.doubleOut ? "Double-Out" : "Single-Out"}`;

    if (state.turnLocked && state.turnResult) {
      el.turnInfo.textContent += ` • ${state.turnResult}`;
    }

    // Dart Anzeige (3 Slots)
    el.darts.innerHTML = "";
    for (let i = 0; i < 3; i++) {
      const d = document.createElement("div");
      d.className = "dart";
      d.textContent = state.turnDarts[i]?.label ?? "–";
      el.darts.appendChild(d);
    }

    // Checkout Hint (nur wenn Spieler nicht fertig)
    if (!p.finished) {
      const hint = findCheckout(p.score, state.doubleOut);
      if (hint) {
        el.checkoutHint.style.display = "block";
        el.checkoutHint.innerHTML =
          `💡 Checkout möglich in ≤ 3 Darts: <strong>${hint.map(x => x.label).join(" • ")}</strong>`;
      } else {
        el.checkoutHint.style.display = "none";
      }
    } else {
      el.checkoutHint.style.display = "none";
    }
  }

  function renderMultiplier() {
    el.doubleBtn.classList.toggle("active", state.multiplier === 2);
    el.tripleBtn.classList.toggle("active", state.multiplier === 3);
  }

  function render() {
    renderPlayers();
    renderTurn();
    renderMultiplier();
  }

  // ---------- Player Actions ----------
  function addPlayer(name) {
    const trimmed = (name || "").trim();
    if (!trimmed) { toast("Name fehlt."); return; }
    if (state.players.length >= 20) { toast("Maximal 20 Spieler."); return; }

    pushHistory();

    state.players.push({
      name: trimmed,
      score: state.startScore,
      rCount: 0,
      finished: false
    });

    if (state.players.length === 1) state.active = 0;

    el.playerName.value = "";
    render();
  }

  function removeActivePlayer() {
    if (state.players.length === 0) return;

    pushHistory();

    state.players.splice(state.active, 1);
    state.active = clamp(state.active, 0, state.players.length - 1);

    // Aufnahme reset
    state.turnDarts = [];
    state.turnStartScore = null;
    state.multiplier = 1;
    state.turnLocked = false;
    state.turnResult = null;

    render();
  }

  /**
   * "Neues Spiel":
   * - übernimmt UI Startscore + DoubleOut
   * - setzt Scores & finished zurück
   * - setzt R/Shot Counter zurück
   * - Spieler bleiben bestehen
   */
  function abortAndNewGame() {
    if (state.players.length === 0) {
      toast("Füge erst Spieler hinzu.");
      return;
    }

    pushHistory();

    state.startScore = Number(el.modeSel.value);
    state.doubleOut = el.doubleOut.checked;

    state.players.forEach(p => {
      p.score = state.startScore;
      p.finished = false;
      p.rCount = 0;
    });

    state.active = 0;
    state.turnDarts = [];
    state.turnStartScore = null;
    state.multiplier = 1;
    state.turnLocked = false;
    state.turnResult = null;

    render();
    toast("Spiel abgebrochen. Neues Spiel gestartet.");
  }

  // ---------- Events ----------
  el.addPlayerBtn.addEventListener("click", () => addPlayer(el.playerName.value));
  el.playerName.addEventListener("keydown", (e) => {
    if (e.key === "Enter") addPlayer(el.playerName.value);
  });
  el.removePlayerBtn.addEventListener("click", removeActivePlayer);

  // Regel toggle
  el.doubleOut.addEventListener("change", () => {
    state.doubleOut = el.doubleOut.checked;
    render();
  });

  // Double/Triple toggles (zurück auf Single bei erneutem Klick)
  el.doubleBtn.addEventListener("click", () => {
    state.multiplier = (state.multiplier === 2) ? 1 : 2;
    renderMultiplier();
  });

  el.tripleBtn.addEventListener("click", () => {
    state.multiplier = (state.multiplier === 3) ? 1 : 3;
    renderMultiplier();
  });

  // Undo
  el.undoBtn.addEventListener("click", () => {
    if (state.history.length === 0) { toast("Nichts zum Undo."); return; }
    restoreFromHistory();
    toast("Undo.");
  });

  // Manueller Spielerwechsel (kein Auto-Sprung)
  el.nextBtn.addEventListener("click", () => {
    if (!activePlayer()) { toast("Keine Spieler."); return; }

    pushHistory();

    // Aufnahme reset
    state.turnDarts = [];
    state.turnStartScore = null;
    state.multiplier = 1;
    state.turnLocked = false;
    state.turnResult = null;

    nextPlayer(false);
  });

  // Neues Spiel
  el.newGameBtn.addEventListener("click", abortAndNewGame);

  // ---------- Init ----------
  makeKeypad();
  render();
})();