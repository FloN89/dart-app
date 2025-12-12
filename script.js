(() => {
  const state = {
    startScore: 501,
    doubleOut: true,
    players: [],
    active: 0,
    multiplier: 1,      // 1 / 2 / 3 (1 ist Default, aber ohne Button)
    turnDarts: [],
    turnStartScore: null,
    history: [],
    turnLocked: false,
    turnResult: null
  };

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

  const keys = [
    1,2,3,4,
    5,6,7,8,
    9,10,11,12,
    13,14,15,16,
    17,18,19,20,
    0,25,"R"
  ];

  const clamp = (n,a,b)=>Math.max(a,Math.min(b,n));
  const deepCopy = (obj)=>JSON.parse(JSON.stringify(obj));

  function toast(msg){
    el.toast.textContent = msg;
    el.toast.classList.add("show");
    setTimeout(()=>el.toast.classList.remove("show"), 1400);
  }

  function pushHistory(){
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
    if(state.history.length > 80) state.history.shift();
  }

  function restoreFromHistory(){
    const snap = state.history.pop();
    if(!snap) return;
    state.players = snap.players;
    state.active = snap.active;
    state.multiplier = snap.multiplier;
    state.turnDarts = snap.turnDarts;
    state.turnStartScore = snap.turnStartScore;
    state.startScore = snap.startScore;
    state.doubleOut = snap.doubleOut;
    state.turnLocked = (snap.turnLocked ?? false);
    state.turnResult = (snap.turnResult ?? null);

    el.modeSel.value = String(state.startScore);
    el.doubleOut.checked = state.doubleOut;
    render();
  }

  function activePlayer(){
    return state.players[state.active] || null;
  }

  function ensureTurnStart(){
    const p = activePlayer();
    if(!p) return;
    if(state.turnStartScore === null) state.turnStartScore = p.score;
  }

  // ---------- Checkout (<=3 darts) ----------
  function buildDartOptions(){
    const opts = [];
    for(let n=0;n<=20;n++) opts.push({label:`S${n}`, points:n, isDouble:false, isTriple:false});
    opts.push({label:`S25`, points:25, isDouble:false, isTriple:false});

    for(let n=1;n<=20;n++) opts.push({label:`D${n}`, points:n*2, isDouble:true, isTriple:false});
    opts.push({label:`D25`, points:50, isDouble:true, isTriple:false}); // Bull als Double

    for(let n=1;n<=20;n++) opts.push({label:`T${n}`, points:n*3, isDouble:false, isTriple:true});
    opts.push({label:`T25`, points:75, isDouble:false, isTriple:true}); // optional, aber via Triple+25 möglich

    opts.sort((a,b)=>b.points-a.points);
    return opts;
  }
  const DART_OPTS = buildDartOptions();

  function findCheckout(remain, doubleOut){
    if(remain <= 0) return null;

    for(let darts=1; darts<=3; darts++){
      if(darts === 1){
        for(const a of DART_OPTS){
          if(a.points !== remain) continue;
          if(doubleOut && !a.isDouble) continue;
          return [a];
        }
      } else if(darts === 2){
        for(const a of DART_OPTS){
          const r1 = remain - a.points;
          if(r1 < 0) continue;
          for(const b of DART_OPTS){
            if(b.points !== r1) continue;
            if(doubleOut && !b.isDouble) continue;
            return [a,b];
          }
        }
      } else {
        for(const a of DART_OPTS){
          const r1 = remain - a.points;
          if(r1 < 0) continue;
          for(const b of DART_OPTS){
            const r2 = r1 - b.points;
            if(r2 < 0) continue;
            for(const c of DART_OPTS){
              if(c.points !== r2) continue;
              if(doubleOut && !c.isDouble) continue;
              return [a,b,c];
            }
          }
        }
      }
    }
    return null;
  }

  // ---------- Rules ----------
  function isBust(newRemain, lastDart){
    if(newRemain < 0) return true;
    if(state.doubleOut){
      if(newRemain === 1) return true;
      if(newRemain === 0 && !lastDart.isDouble) return true;
    }
    return false;
  }

  function applyDart(d){
    const p = activePlayer();
    if(!p){ toast("Bitte erst Spieler hinzufügen."); return; }

    if(state.turnLocked){
      toast("Aufnahme ist fertig – bitte \"Nächster Spieler\" drücken.");
      return;
    }

    ensureTurnStart();
    pushHistory();

    if(d.isR){
      p.rCount = (p.rCount || 0) + 1;
    }

    const before = p.score;
    const after = before - d.points;

    if(isBust(after, d)){
      // Bust-Dart trotzdem anzeigen:
      state.turnDarts.push(d);

      p.score = state.turnStartScore; // Score zurück auf Turn-Start
      state.multiplier = 1;

      state.turnLocked = true;
      state.turnResult = "BUST";

      toast("BUST! Bitte \"Nächster Spieler\" drücken.");
      render();
      return;
    }

    p.score = after;
    state.turnDarts.push(d);

    if(p.score === 0){
      p.finished = true;
      state.multiplier = 1;

      state.turnLocked = true;
      state.turnResult = "FINISH";

      toast(`🎯 ${p.name} macht aus! Bitte "Nächster Spieler" drücken.`);
      render();
      return;
    }

    if(state.turnDarts.length >= 3){
      state.multiplier = 1;

      state.turnLocked = true;
      state.turnResult = null;

      toast("3 Darts geworfen. Bitte \"Nächster Spieler\" drücken.");
      render();
      return;
    }

    // Nach jedem Dart wieder auf Single (ohne 1× Button)
    state.multiplier = 1;
    render();
  }

  function nextPlayer(skipFinished){
    if(state.players.length === 0) return;
    let i = state.active;
    for(let step=0; step<state.players.length; step++){
      i = (i + 1) % state.players.length;
      if(!skipFinished || !state.players[i].finished){
        state.active = i;
        break;
      }
    }
    render();
  }

  // ---------- Keypad ----------
  function multiplierLabel(mult, n){
    const base = Number(n);
    const points = base * mult;
    if(mult === 1) return {label:`${base}`, points};
    if(mult === 2) return {label:`D${base}`, points};
    return {label:`T${base}`, points};
  }

  function makeKeypad(){
    el.keypad.innerHTML = "";
    keys.forEach(k => {
      const b = document.createElement("button");
      b.className = "k";
      if(k === "R") b.classList.add("r");
      if(k === 0) b.classList.add("zero");
      b.textContent = String(k);

      b.addEventListener("click", () => {
        if(k === "R"){
          applyDart({label:"R", points:0, isR:true, isDouble:false, isTriple:false});
          return;
        }
        const mult = state.multiplier;
        const m = multiplierLabel(mult, k);
        applyDart({
          label: m.label,
          points: m.points,
          isR:false,
          isDouble: (mult === 2),
          isTriple: (mult === 3)
        });
      });

      el.keypad.appendChild(b);
    });
  }

  // ---------- Render ----------
  function renderPlayers(){
    el.players.innerHTML = "";
    state.players.forEach((p, idx) => {
      const row = document.createElement("div");
      row.className = "player" + (idx === state.active ? " active" : "");
      row.addEventListener("click", () => {
        if(idx === state.active) return;
        pushHistory();
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

  function renderTurn(){
    const p = activePlayer();
    if(!p){
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

    const dartNo = state.turnDarts.length + 1;
    el.turnInfo.textContent = `Dart ${clamp(dartNo,1,3)} / 3 • Start ${state.startScore} • ${state.doubleOut ? "Double-Out" : "Single-Out"}`;

    if(state.turnLocked && state.turnResult){
      el.turnInfo.textContent += ` • ${state.turnResult}`;
    }

    el.darts.innerHTML = "";
    for(let i=0;i<3;i++){
      const d = document.createElement("div");
      d.className = "dart";
      d.textContent = state.turnDarts[i]?.label ?? "–";
      el.darts.appendChild(d);
    }

    if(!p.finished){
      const hint = findCheckout(p.score, state.doubleOut);
      if(hint){
        el.checkoutHint.style.display = "block";
        el.checkoutHint.innerHTML =
          `💡 Checkout möglich in ≤ 3 Darts: <strong>${hint.map(x=>x.label).join(" • ")}</strong>`;
      } else {
        el.checkoutHint.style.display = "none";
      }
    } else {
      el.checkoutHint.style.display = "none";
    }
  }

  function renderMultiplier(){
    el.doubleBtn.classList.toggle("active", state.multiplier === 2);
    el.tripleBtn.classList.toggle("active", state.multiplier === 3);
  }

  function render(){
    renderPlayers();
    renderTurn();
    renderMultiplier();
  }

  function addPlayer(name){
    const trimmed = (name || "").trim();
    if(!trimmed){ toast("Name fehlt."); return; }
    if(state.players.length >= 20){ toast("Maximal 20 Spieler."); return; }

    pushHistory();
    state.players.push({ name: trimmed, score: state.startScore, rCount: 0, finished: false });
    if(state.players.length === 1) state.active = 0;
    el.playerName.value = "";
    render();
  }

  function removeActivePlayer(){
    if(state.players.length === 0) return;
    pushHistory();
    state.players.splice(state.active, 1);
    state.active = clamp(state.active, 0, state.players.length - 1);
    state.turnDarts = [];
    state.turnStartScore = null;
    state.multiplier = 1;
    state.turnLocked = false;
    state.turnResult = null;
    render();
  }

  // WICHTIG: Neues Spiel = Spiel abbrechen + reset
  function abortAndNewGame(){
    if(state.players.length === 0){
      toast("Füge erst Spieler hinzu.");
      return;
    }
    pushHistory();

    state.startScore = Number(el.modeSel.value);
    state.doubleOut = el.doubleOut.checked;

    state.players.forEach(p => {
      p.score = state.startScore;
      p.finished = false;
      p.rCount = 0;            // <- R wird beim Abbruch zurückgesetzt
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

  el.addPlayerBtn.addEventListener("click", () => addPlayer(el.playerName.value));
  el.playerName.addEventListener("keydown", (e) => { if(e.key === "Enter") addPlayer(el.playerName.value); });
  el.removePlayerBtn.addEventListener("click", removeActivePlayer);

  el.doubleOut.addEventListener("change", () => { state.doubleOut = el.doubleOut.checked; render(); });

  el.doubleBtn.addEventListener("click", () => {
    state.multiplier = (state.multiplier === 2) ? 1 : 2; // toggle (zurück auf Single)
    renderMultiplier();
  });

  el.tripleBtn.addEventListener("click", () => {
    state.multiplier = (state.multiplier === 3) ? 1 : 3;
    renderMultiplier();
  });

  el.undoBtn.addEventListener("click", () => {
    if(state.history.length === 0){ toast("Nichts zum Undo."); return; }
    restoreFromHistory();
    toast("Undo.");
  });

  // MANUELLER Wechsel (kein Auto-Sprung!)
  el.nextBtn.addEventListener("click", () => {
    if(!activePlayer()){ toast("Keine Spieler."); return; }
    pushHistory();

    state.turnDarts = [];
    state.turnStartScore = null;
    state.multiplier = 1;

    state.turnLocked = false;
    state.turnResult = null;

    nextPlayer(false);
  });

  el.newGameBtn.addEventListener("click", abortAndNewGame);

  // Init
  makeKeypad();
  render();
})();
