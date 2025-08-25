// Expect globals from vendor libs
// window.$ (jQuery), window.Chess, window.Chessboard

const el = {
  board: document.getElementById("board"),
  dataset: document.getElementById("dataset"),
  difficulty: document.getElementById("difficulty"),
  prev: document.getElementById("prev"),
  next: document.getElementById("next"),
  share: document.getElementById("share"),
  showSolution: document.getElementById("show-solution"),
  reset: document.getElementById("reset"),
  count: document.getElementById("count"),
  status: document.getElementById("status"),
  players: document.getElementById("players"),
  event: document.getElementById("event"),
  side: document.getElementById("side"),
  motifs: document.getElementById("motifs"),
  delta: document.getElementById("delta"),
  pv: document.getElementById("pv"),
  toggleSpoilers: document.getElementById("toggle-spoilers"),
  spoilerSection: document.querySelector(".spoiler-section"),
  pvPrev: document.getElementById("pv-prev"),
  pvNext: document.getElementById("pv-next"),
};

let allPuzzles = [];
let view = [];
let i = 0;
let game;
let solution = [];
let pvIndex = 0;
let board = null;

function sideGlyph(s) { return s === "w" ? "White ♔" : "Black ♚"; }

function uciToMove(uci) {
  if (!uci || uci.length < 4) return null;
  const from = uci.slice(0, 2);
  const to = uci.slice(2, 4);
  const promotion = uci.length > 4 ? uci[4] : undefined;
  return { from, to, promotion };
}

function equalUci(a, b) {
  if (!a || !b) return false;
  const base = s => s.slice(0,4);
  const promo = s => s.length > 4 ? s[4] : "";
  if (a === b) return true;
  if (base(a) === base(b)) {
    const pa = promo(a) || "q", pb = promo(b) || "q"; // default queen
    return pa === pb;
  }
  return false;
}

function sanitizePv(pvStringOrArray) {
  const ucire = /^[a-h][1-8][a-h][1-8][qrbn]?$/i;
  const arr = Array.isArray(pvStringOrArray)
    ? pvStringOrArray
    : String(pvStringOrArray).split(/\s+/);
  return arr.map(s => s.trim()).filter(s => ucire.test(s));
}

function onDragStart(source, piece) {
  const p = view[i];
  if (!p) return false;
  const side = p.side_to_move === "w" ? "w" : "b";
  return piece.startsWith(side); // only drag the moving side
}

async function checkMateInN(fen, expectedMateIn) {
  // For client-side mate validation, we'll do a simple depth-limited search
  const testGame = new window.Chess(fen);
  
  console.log(`Debug: Checking mate-in-${expectedMateIn} for position:`, fen);
  
  // Simple mate-in-1 check (opponent is already in checkmate)
  if (expectedMateIn === 1) {
    const result = testGame.in_checkmate();
    console.log(`Debug: Checkmate check result:`, result);
    return result;
  }
  
  // For mate-in-2, check if all opponent moves lead to mate-in-1
  if (expectedMateIn === 2) {
    if (testGame.in_checkmate()) {
      console.log(`Debug: Already checkmate`);
      return true;
    }
    
    const opponentMoves = testGame.moves({verbose: true});
    console.log(`Debug: Opponent has ${opponentMoves.length} moves:`, opponentMoves.map(m => m.san));
    
    if (opponentMoves.length === 0) {
      return testGame.in_checkmate();
    }
    
    // Check if after every opponent move, we have mate-in-1
    for (const move of opponentMoves) {
      const branchGame = new window.Chess(fen);
      branchGame.move(move);
      
      // Now check if we (the original side) have mate-in-1
      const ourMoves = branchGame.moves({verbose: true});
      let foundMateInThisBranch = false;
      
      for (const ourMove of ourMoves) {
        const mateTest = new window.Chess(branchGame.fen());
        mateTest.move(ourMove);
        if (mateTest.in_checkmate()) {
          foundMateInThisBranch = true;
          break;
        }
      }
      
      if (!foundMateInThisBranch) {
        console.log(`Debug: Branch after ${move.san} doesn't lead to mate`);
        return false; // This opponent move doesn't lead to mate
      }
    }
    
    console.log(`Debug: All opponent moves lead to mate-in-1`);
    return true; // All opponent moves lead to mate-in-1
  }
  
  // For mate-in-3+, too complex for client-side - return false to fall back to exact match
  console.log(`Debug: Mate-in-${expectedMateIn} too complex for validation`);
  return false;
}

let locked = false; // prevent moves while engine/opponent auto-plays

function onDrop(source, target) {
  const p = view[i];
  if (!p) return 'snapback';
  if (locked) return 'snapback';

  const mv = { from: source, to: target, promotion: 'q' };
  const move = game.move(mv);
  if (!move) return 'snapback';

  const playedUci = move.from + move.to + (move.promotion || "");
  board.position(game.fen());

  // FIRST MOVE of the puzzle: accept any of the backend-provided first moves
  if (pvIndex === 0) {
    const accepted = (p.accepted_first_moves && p.accepted_first_moves.length)
      ? p.accepted_first_moves
      : [p.best_move_uci];

    const isAccepted = accepted.some(m => equalUci(playedUci, m));
    if (!isAccepted) {
      const expectedDisplay = accepted.join(", ");
      el.status.textContent = `✖ Wrong first move. Expected one of: ${expectedDisplay}`;
      return;
    }

    // Switch to the branch PV that matches the user's first move (if provided)
    const canon = accepted.find(m => equalUci(playedUci, m)) || p.best_move_uci;
    if (p.alt_pvs && p.alt_pvs[canon]) {
      solution = sanitizePv(p.alt_pvs[canon]);
    } else {
      // fallback to whatever PV was shipped
      solution = sanitizePv(p.moves || p.pv || "");
    }

    pvIndex = 1; // first ply has been played by the user
    el.status.textContent = "✔ Correct! Playing opponent response...";
    locked = true;
    setTimeout(() => { playOpponentMove(); locked = false; }, 600);
    return;
  }

  // SUBSEQUENT MOVES: must match the current PV step OR be a valid mate move
  const expected = solution[pvIndex] || "";
  
  // First, try exact PV match
  if (equalUci(playedUci, expected)) {
    pvIndex++; // we played our PV move
    el.status.textContent = "✔ Correct!";
    // opponent reply (if any)
    if (pvIndex < solution.length) {
      el.status.textContent = "✔ Correct! Playing opponent response...";
      locked = true;
      setTimeout(() => { playOpponentMove(); locked = false; }, 400);
    } else {
      el.status.textContent = "✔ Puzzle solved! Great job!";
    }
    return;
  }
  
  // For mate puzzles, be more flexible - check if the move leads to mate
  const isMatepuzzle = p.motifs && p.motifs.some(m => m.startsWith('mate_in_'));
  if (isMatepuzzle) {
    // Debug: Check if Chess.js methods are available
    console.log('Debug: game object:', game);
    console.log('Debug: game.in_checkmate:', typeof game.in_checkmate);
    console.log('Debug: game.moves:', typeof game.moves);
    
    // Check if opponent is in checkmate after this move (older Chess.js uses in_checkmate)
    if (typeof game.in_checkmate === 'function' && game.in_checkmate()) {
      el.status.textContent = "✔ Checkmate! Puzzle solved!";
      pvIndex = solution.length; // mark as complete
      return;
    }
    
    // Check if opponent has very limited moves (likely mate threat)
    const opponentMoves = game.moves({verbose: true});
    console.log(`Debug: Alternative mate check - opponent has ${opponentMoves.length} moves after ${playedUci}`);
    
    if (opponentMoves.length <= 3) {
      // Check if all opponent moves lead to mate
      let allLeadToMate = true;
      for (const oppMove of opponentMoves) {
        const testGame = new window.Chess(game.fen());
        testGame.move(oppMove);
        
        // Check if we have any move that creates checkmate
        const ourMoves = testGame.moves({verbose: true});
        let foundMateInThisBranch = false;
        
        for (const ourMove of ourMoves) {
          const mateTest = new window.Chess(testGame.fen());
          mateTest.move(ourMove);
          if (mateTest.in_checkmate()) {
            foundMateInThisBranch = true;
            break;
          }
        }
        
        if (!foundMateInThisBranch) {
          allLeadToMate = false;
          break;
        }
      }
      
      if (allLeadToMate) {
        el.status.textContent = "✔ Alternative mate solution! Excellent!";
        // Complete the puzzle since we can't follow PV anymore
        pvIndex = solution.length;
        return;
      }
    }
  }
  
  el.status.textContent = `✖ Not the PV move here. Expected ${expected}`;
}


function playOpponentMove() {
  // Play the opponent's move (next move in PV sequence)
  if (pvIndex < solution.length) {
    const uci = solution[pvIndex];
    const mv = uciToMove(uci);
    if (mv) {
      const res = game.move(mv);
      if (res) {
        board.position(game.fen());
        pvIndex++;
        if (pvIndex < solution.length) {
          el.status.textContent = `Opponent plays ${res.san}. Your turn!`;
        } else {
          el.status.textContent = "✔ Puzzle solved! Great job!";
        }
        return;
      }
    }
    el.status.textContent = "✔ Your move was correct! Continue manually.";
  } else {
    el.status.textContent = "✔ Puzzle complete!";
  }
}

function playNextPVMove() {
  const p = view[i]; 
  if (!p || !solution.length || pvIndex >= solution.length) {
    if (pvIndex >= solution.length) {
      el.status.textContent = "Puzzle complete! Great job!";
    } else {
      el.status.textContent = "No more moves in the solution.";
    }
    return;
  }
  
  const moveUci = solution[pvIndex];
  if (!moveUci || moveUci.length < 4) {
    el.status.textContent = `Invalid move in PV: "${moveUci}"`;
    pvIndex++;
    return;
  }
  
  // Clean the UCI move (remove any extra characters)
  const cleanMoveUci = moveUci.trim();
  
  // Convert UCI to chess.js format
  const from = cleanMoveUci.slice(0, 2);
  const to = cleanMoveUci.slice(2, 4);
  const promotion = cleanMoveUci.length > 4 ? cleanMoveUci[4] : undefined;
  
  // Try the move
  let move = game.move({ from, to, promotion });
  
  // If that fails, try without promotion first
  if (!move && promotion) {
    move = game.move({ from, to });
  }
  
  // If still failing, try as SAN notation
  if (!move) {
    try {
      move = game.move(cleanMoveUci);
    } catch (e) {
      // SAN parsing failed too
    }
  }
  
  if (!move) {
    // Show detailed debugging info
    console.log(`Debug: Failed move "${cleanMoveUci}" from position:`, game.fen());
    console.log(`Debug: Legal moves:`, game.moves());
    console.log(`Debug: Legal UCI moves:`, game.moves({verbose: true}).map(m => `${m.from}${m.to}${m.promotion || ''}`));
    el.status.textContent = `Invalid move: ${from}-${to}${promotion || ""}. Check console for debug info.`;
    return;
  }
  
  pvIndex++;
  board.position(game.fen());
  el.status.textContent = `PV move ${pvIndex}/${solution.length}: ${move.san}`;
}

function onSnapEnd() {
  board.position(game.fen());
}

function applyHash() {
  const hash = location.hash.replace(/^#\/?/, "");
  if (!hash) return;
  const parts = hash.split("/");
  if (parts[0] === "p" && parts[1]) {
    const idx = view.findIndex(p => p.id === parts[1]);
    if (idx >= 0) { i = idx; render(); }
  }
}

async function loadDataset(name) {
  const res = await fetch(name, { cache: "no-store" });
  if (!res.ok) throw new Error(`failed to load ${name}`);
  const data = await res.json();
  allPuzzles = data.map(p => {
    // Better difficulty calculation based on actual data
    let difficultyTier;
    const delta = p.delta_cp || 0;
    
    if (delta < 2000) {
      difficultyTier = 1; // Easy - smaller blunders/mistakes
    } else if (delta < 5000) {
      difficultyTier = 2; // Medium - significant mistakes
    } else {
      difficultyTier = 3; // Hard - major blunders
    }
    
    // Adjust based on tactical complexity
    const motifs = p.motifs || [];
    const pvLength = (p.pv || "").split(" ").length;
    
    // Bonus for complex tactical motifs
    if (motifs.some(m => m.includes('sacrifice') || m.includes('mate'))) {
      difficultyTier = Math.min(3, difficultyTier + 1);
    }
    
    // Penalty for simple captures or long PVs (less tactical)
    if (pvLength > 8 || motifs.every(m => ['capture', 'blunder'].includes(m))) {
      difficultyTier = Math.max(1, difficultyTier - 1);
    }
    
    return {
      ...p,
      difficultyTier
    };
  });
}

function filterView() {
  const want = el.difficulty.value;
  view = allPuzzles.filter(p => want === "all" ? true : String(p.difficultyTier) === want);
  const curId = view[i]?.id;
  i = Math.max(0, view.findIndex(p => p.id === curId));
  if (i === -1) i = 0;
}

function render() {
  if (!view.length) { el.count.textContent = "0 / 0"; return; }
  
  const p = view[i];
  if (!p) {
    el.status.textContent = "Error: No puzzle data found.";
    return;
  }
  
  // Validate required puzzle fields
  if (!p.fen_before || !p.best_move_uci || !p.side_to_move) {
    el.status.textContent = `Error: Puzzle ${p.id || 'unknown'} is missing required data.`;
    return;
  }
  
  // Try to create the chess position
  try {
    game = new window.Chess(p.fen_before);
  } catch (error) {
    el.status.textContent = `Error: Invalid FEN position in puzzle ${p.id}`;
    return;
  }
  
  el.count.textContent = `${i + 1} / ${view.length}`;
  el.players.textContent = `${p.white || "?"} — ${p.black || "?"}`;
  el.event.textContent = `${p.event || "?"} / ${p.date || "?"}`;
  el.side.textContent = sideGlyph(p.side_to_move);
  el.motifs.textContent = (p.motifs || []).join(", ");
  el.delta.textContent = `${p.delta_cp || 0} cp`;
  el.pv.textContent = p.pv || (p.moves || []).join(" ") || "(no PV)";

  // Reset spoiler section to hidden for new puzzle
  el.spoilerSection.style.display = 'none';
  el.toggleSpoilers.textContent = '👁️ Show Hints';
  el.status.textContent = "Your move. Try to find the engine's best.";
  pvIndex = 0;

  // Support both p.pv (string) and p.moves (array) formats
  solution = p.moves && Array.isArray(p.moves)
    ? sanitizePv(p.moves)
    : sanitizePv(p.pv || "");
  console.log(`Debug: Loaded puzzle ${p.id} with solution:`, solution);

  if (board) {
    board.orientation(p.side_to_move === "w" ? "white" : "black");
    board.position(p.fen_before);
  }

  location.hash = `#/p/${p.id}`;
}

el.prev.onclick = () => { if (i > 0) { i--; render(); } };
el.next.onclick = () => { if (i < view.length - 1) { i++; render(); } };
el.reset.onclick = () => render();

// Spoiler toggle functionality
el.toggleSpoilers.onclick = () => {
  const isHidden = el.spoilerSection.style.display === 'none';
  el.spoilerSection.style.display = isHidden ? 'block' : 'none';
  el.toggleSpoilers.textContent = isHidden ? '🙈 Hide Hints' : '👁️ Show Hints';
};

el.showSolution.onclick = () => {
  const p = view[i]; if (!p || !solution.length) return;
  
  // Validate starting position first
  try {
    game = new window.Chess(p.fen_before);
    console.log(`Debug: Starting position: ${p.fen_before}`);
    console.log(`Debug: Legal moves at start:`, game.moves({verbose: true}).map(m => `${m.from}${m.to}${m.promotion || ''}`));
  } catch (error) {
    el.status.textContent = `Error: Invalid starting position ${p.fen_before}`;
    return;
  }
  
  // Default to best PV
  let pv = p.pv || "";
  
  // If we already advanced via an alternative move, keep that branch
  if (pvIndex > 0 && p.alt_pvs) {
    const first = solution[0];
    for (const k in p.alt_pvs) {
      if (equalUci(first, k)) { 
        pv = p.alt_pvs[k]; 
        console.log(`Debug: Using alternative PV for ${k}:`, pv);
        break; 
      }
    }
  }
  
  solution = sanitizePv(pv);
  pvIndex = 0;
  board.orientation(p.side_to_move === "w" ? "white" : "black");
  board.position(p.fen_before);
  el.status.textContent = "Solution loaded. Use the PV step buttons.";
};

el.pvNext.onclick = () => {
  playNextPVMove(false); // false = manual PV stepping
};
el.pvPrev.onclick = () => {
  if (pvIndex <= 0) {
    el.status.textContent = "Already at the start of the solution.";
    return;
  }
  
  pvIndex--;
  const undoMove = game.undo();
  if (!undoMove) {
    // If undo fails, reset to beginning
    const p = view[i];
    game = new window.Chess(p.fen_before);
    pvIndex = 0;
    el.status.textContent = "Reset to puzzle start.";
  } else {
    el.status.textContent = `PV move ${pvIndex}/${solution.length}`;
  }
  
  board.position(game.fen());
};

el.dataset.onchange = async () => { await loadDataset(el.dataset.value); filterView(); i = 0; render(); };
el.difficulty.onchange = () => { filterView(); i = 0; render(); };
el.share.onclick = async () => {
  try { await navigator.clipboard.writeText(location.href); el.status.textContent = "Link copied."; }
  catch { el.status.textContent = "Couldn't copy—use the address bar."; }
};

// Boot exactly once
(async function init() {
  if (!window.jQuery || !window.Chess || !window.Chessboard) {
    console.error("Missing libs. Check vendor/ files and script order in index.html");
    return;
  }

  board = window.Chessboard('board', {
    draggable: true,
    position: 'start',
    onDragStart,
    onDrop,
    onSnapEnd
  });

  await loadDataset(document.getElementById("dataset").value);
  filterView();
  render();
  window.addEventListener("hashchange", applyHash);
  applyHash();
})();
