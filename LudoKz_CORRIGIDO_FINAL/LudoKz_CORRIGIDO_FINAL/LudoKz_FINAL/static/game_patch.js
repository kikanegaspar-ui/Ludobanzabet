
/**
 * game_patch.js — Substitui o motor visual do jogo LudoKz
 * Carregado DEPOIS do ludo_board.js
 * Mantém todo o sistema de salas/apostas/SSE intacto
 */

// ══════════════════════════════════════════
//  SUBSTITUIÇÃO DE FUNÇÕES DO INDEX.HTML
// ══════════════════════════════════════════

// Guardar referências originais (caso precise reverter)
const _origBuildBoard   = window.buildBoard;
const _origRenderState  = window.renderState;
const _origHighlightPcs = window.highlightPcs;
const _origDoRoll       = window.doRoll;

// ── Override: initCanvas ───────────────────
window.initCanvas = function () {
  const canvas = document.getElementById('ludo-canvas');
  if (!canvas) return;

  // Destroy instância anterior
  if (window.BOARD) {
    window.BOARD.destroy();
    window.BOARD = null;
  }

  const size = Math.min(460, window.innerWidth - 30);
  canvas.width  = size;
  canvas.height = size;
  canvas.style.width  = size + 'px';
  canvas.style.height = size + 'px';

  window.BOARD = new LudoBoard(canvas, size);

  canvas.removeEventListener('click', window._canvasClickHandler);
  window._canvasClickHandler = onCanvasClick;
  canvas.addEventListener('click', window._canvasClickHandler);

  startRenderLoop();
};

// ── Override: buildBoard ───────────────────
window.buildBoard = function () {
  window.initCanvas();
};

// ── Override: renderState ──────────────────
window.renderState = function (state) {
  window.CUR_STATE = state;
  window.CUR_MV    = [];

  if (!state || !state.players) return;

  // Player cards
  const pc = document.getElementById('player-cards');
  if (pc) {
    const CNAME_MAP = { r:'Vermelho', g:'Verde', b:'Azul', y:'Amarelo' };
    const CCSS_fn   = c => c==='r'?'var(--R)':c==='g'?'var(--G)':c==='b'?'var(--B)':'var(--Y)';
    const mid = `<div class="gmid">
      <div class="ttx" id="ttx">${_isMeTurn(state) ? 'Teu turno 🟢' : 'Aguarda 🔵'}</div>
      <div class="rtx">RND ${state.round || 0}</div>
    </div>`;

    pc.innerHTML = state.players.map((p, i) =>
      `<div class="pc ${p.idx === state.turn ? 'mt' : ''}">
        <div class="pdot" style="background:${CCSS_fn(p.color)}"></div>
        <div>
          <div class="pnm2">${p.name}${p.user_id === window.U?.id ? ' (Tu)' : ''}</div>
          <div class="pft">${CNAME_MAP[p.color] || p.color} · ${p.fin}/4</div>
        </div>
      </div>`
    ).reduce((a, h, i) => i === Math.floor(state.players.length / 2) ? a + mid + h : a + h, '');
  }

  // Aposta
  const gbv = document.getElementById('gbv');
  if (gbv) gbv.textContent = (typeof fmt === 'function' ? fmt(state.bet) : state.bet) + ' KZ';

  // Botão de lançar dado
  const rb = document.getElementById('rb');
  if (rb) {
    const myTurn = _isMeTurn(state);
    rb.disabled = !myTurn || state.phase !== 0 || state.over;
    if (myTurn && !state.over) {
      rb.classList.add('my-turn-glow');
    } else {
      rb.classList.remove('my-turn-glow');
    }
  }

  // Log de jogo
  if (state.log && state.log.length) {
    const le = document.getElementById('glog');
    if (le) {
      le.innerHTML = state.log.slice(-20).reverse().map(l =>
        `<div class="gli ${l.includes('VENCEU')||l.includes('🏆')?' gli-w':l.includes('💀')?' gli-d':''}">${l}</div>`
      ).join('');
    }
  }

  // Chat online count
  const co = document.getElementById('chat-online');
  if (co) co.textContent = state.players.length + ' online';

  // Actualizar dado visual
  const faces = ['⚀','⚁','⚂','⚃','⚄','⚅'];
  const dfc = document.getElementById('dfc');
  if (dfc && state.dice > 0) dfc.textContent = faces[state.dice - 1];
  const dnm = document.getElementById('dnm');
  if (dnm && state.dice > 0) dnm.textContent = state.dice;

  window.SELECTABLE_PIECES = [];
};

// ── Override: highlightPcs ─────────────────
window.highlightPcs = function (mv, state) {
  window.CUR_MV = mv || [];
  window.SELECTABLE_PIECES = mv || [];
};

// ── Override: renderPieces ─────────────────
window.renderPieces = function (state, mv) {
  window.SELECTABLE_PIECES = mv || [];
};

// ── Override: drawGameState (loop principal) ─
window.drawGameState = function (state) {
  if (!window.BOARD || !state || !state.players) return;
  const canvas = document.getElementById('ludo-canvas');
  if (!canvas) return;

  window.BOARD.drawBoard();

  state.players.forEach(pl => {
    pl.pos.forEach((pos, i) => {
      const key   = pl.color + '_' + i;
      const coord = window.BOARD.getPieceCoord(pl.color, pos, !!pl.in_base[i], i);
      const piece = window.BOARD.pieces[key];

      let drawX = coord.x, drawY = coord.y;
      let scale = 1, opacity = 1;

      if (piece) {
        if (piece.animating) {
          drawX   = piece.x;
          drawY   = piece.y;
          scale   = piece.scale   ?? 1;
          opacity = piece.opacity ?? 1;
        } else {
          piece.x = coord.x;
          piece.y = coord.y;
          drawX   = coord.x;
          drawY   = coord.y;
          scale   = piece.scale   ?? 1;
          opacity = piece.opacity ?? 1;
        }
      } else {
        window.BOARD.pieces[key] = { x: coord.x, y: coord.y, animating: false, scale: 1, opacity: 1 };
      }

      const isSelectable = (window.SELECTABLE_PIECES || []).includes(i)
        && pl.user_id === window.U?.id
        && _isMeTurn(state);

      window.BOARD.drawPiece(
        drawX, drawY, pl.color, i + 1,
        isSelectable, window.PULSE_T,
        scale, opacity
      );
    });
  });

  // Partículas
  // (já são desenhadas no loop interno do LudoBoard._updateParticles)
};

// ── Override: onGameStarted ────────────────
const _origOnGameStarted = window.onGameStarted;
window.onGameStarted = function (state) {
  window.RID        = state.room_id;
  window.CUR_STATE  = state;
  window.PREV_STATE = null;

  // Ir para o ecrã de jogo
  if (typeof pg === 'function') pg('game');

  buildBoard();
  renderState(state);

  const chatEl = document.getElementById('chat-msgs');
  if (chatEl) chatEl.innerHTML = '';

  if (typeof addChat === 'function') {
    addChat('Sistema', 'Jogo iniciado com ' + state.players.length + ' jogadores!', true);
    state.players.forEach(p => {
      const cn = { r:'Vermelho', g:'Verde', b:'Azul', y:'Amarelo' }[p.color] || p.color;
      addChat('Sistema', cn + ': ' + p.name, true);
    });
  }

  // Som de início
  SFX.tick();
  setTimeout(() => SFX.tick(), 120);
  setTimeout(() => SFX.tick(), 240);
};

// ── Override: onGameUpdate ─────────────────
const _origOnGameUpdate = window.onGameUpdate;
window.onGameUpdate = function (state) {
  if (window.PREV_STATE && window.BOARD) {
    _triggerMoveAnimations(window.PREV_STATE, state);
  }
  window.PREV_STATE = window.CUR_STATE;
  window.CUR_STATE  = state;
  renderState(state);
};

// ── Override: _triggerMoveAnimations ──────
window._triggerMoveAnimations = function (prev, next) {
  if (!prev.players || !next.players || !window.BOARD) return;

  next.players.forEach(pl => {
    const prevPl = prev.players.find(p => p.user_id === pl.user_id);
    if (!prevPl) return;

    pl.pos.forEach((pos, i) => {
      const prevPos  = prevPl.pos[i];
      const prevBase = !!prevPl.in_base[i];
      const nextBase = !!pl.in_base[i];

      if (pos === prevPos && prevBase === nextBase) return;

      // Verificar captura: peça voltou para a base?
      if (nextBase && !prevBase && prevPos > 0) {
        window.BOARD.animateCapture(pl.color, i);
        return;
      }

      window.BOARD.animateMove(pl.color, i, prevPos, prevBase, pos, nextBase, null);
    });
  });
};

// ── Override: doRoll ──────────────────────
window.doRoll = async function () {
  if (!window.RID) return;
  const rb = document.getElementById('rb');
  if (rb) rb.disabled = true;

  // Animar dado
  const faceEl = document.getElementById('dfc');
  if (faceEl) faceEl.classList.add('rolling');

  const d = await (typeof api === 'function'
    ? api('/api/game/roll', 'POST', { room_id: window.RID })
    : fetch('/api/game/roll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ room_id: window.RID }),
        credentials: 'same-origin'
      }).then(r => r.json())
  );

  if (faceEl) faceEl.classList.remove('rolling');

  if (d.error) {
    if (typeof toast === 'function') toast('❌ ' + d.error, 'ter');
    return;
  }

  // Animar dado com som
  if (window.BOARD) {
    window.BOARD.animateDice(d.dice, async () => {
      renderState(d);
      const mv = await (typeof api === 'function'
        ? api('/api/game/movable', 'POST', { room_id: window.RID })
        : fetch('/api/game/movable', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ room_id: window.RID }),
            credentials: 'same-origin'
          }).then(r => r.json())
      );
      if (mv.movable && mv.movable.length) {
        highlightPcs(mv.movable, d);
      }
    });
  } else {
    const faces = ['⚀','⚁','⚂','⚃','⚄','⚅'];
    if (faceEl) faceEl.textContent = faces[d.dice - 1];
    const dnm = document.getElementById('dnm');
    if (dnm) dnm.textContent = d.dice;
    renderState(d);
    const mv = await (typeof api === 'function'
      ? api('/api/game/movable', 'POST', { room_id: window.RID })
      : { movable: [] }
    );
    if (mv.movable && mv.movable.length) highlightPcs(mv.movable, d);
  }
};

// ── Override: movePc ──────────────────────
window.movePc = async function (idx) {
  if (!window.RID) return;

  window.PREV_STATE = window.CUR_STATE
    ? JSON.parse(JSON.stringify(window.CUR_STATE))
    : null;

  const d = await (typeof api === 'function'
    ? api('/api/game/move', 'POST', { room_id: window.RID, piece: idx })
    : fetch('/api/game/move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ room_id: window.RID, piece: idx }),
        credentials: 'same-origin'
      }).then(r => r.json())
  );

  if (d.error) {
    if (typeof toast === 'function') toast('❌ ' + d.error, 'ter');
    if (d.error.includes('bloqueada')) SFX.blocked();
    return;
  }

  if (window.PREV_STATE && window.BOARD) {
    _triggerMoveAnimations(window.PREV_STATE, d);
  }
  window.PREV_STATE = window.CUR_STATE;
  renderState(d);
};

// ── Override: onGameOver ──────────────────
const _origOnGameOver = window.onGameOver;
window.onGameOver = function (d) {
  if (d.won) {
    SFX.win();
    // Chuva de confetti
    if (typeof coinRain === 'function') coinRain();
    if (typeof showFlash === 'function') showFlash('🏆');
  }

  const goEl  = document.getElementById('goo');
  if (goEl) goEl.classList.remove('hidden');

  const gocd  = document.getElementById('gocd');
  const goic  = document.getElementById('goic');
  const gott  = document.getElementById('gott');
  const gosb  = document.getElementById('gosb');
  const gopr  = document.getElementById('gopr');
  const gopl  = document.getElementById('gopl');

  if (goic)  goic.textContent  = d.won ? '🏆' : '💀';
  if (gott)  gott.textContent  = d.won ? 'VITÓRIA!' : 'DERROTA';
  if (gosb)  gosb.textContent  = d.won ? 'Parabéns, venceste!' : 'Boa sorte da próxima!';
  if (gopr)  { gopr.textContent = (d.won ? '+' : '') + (typeof fmt === 'function' ? fmt(d.won ? d.prize : 0) : (d.won ? d.prize : 0)) + ' KZ'; gopr.style.color = d.won ? 'var(--jade)' : 'var(--red)'; }
  if (gocd)  gocd.className = 'gocd' + (d.won ? '' : ' lose');

  if (d.balance != null && window.U) {
    window.U.balance = d.balance;
    if (typeof updN === 'function') updN();
  }
};

// ── Override: onCanvasClick ────────────────
window.onCanvasClick = function (e) {
  if (!window.CUR_STATE || !window.BOARD) return;
  if (!_isMeTurn(window.CUR_STATE))        return;
  if (window.CUR_STATE.phase !== 1)        return;

  const rect = e.target.getBoundingClientRect();
  const x = (e.clientX - rect.left) * (e.target.width / rect.width);
  const y = (e.clientY - rect.top)  * (e.target.height / rect.height);
  const cs = e.target.width / 15;

  const myPlayer = window.CUR_STATE.players.find(p => p.user_id === window.U?.id);
  if (!myPlayer) return;

  let clicked = false;
  myPlayer.pos.forEach((pos, i) => {
    if (clicked) return;
    if (!(window.SELECTABLE_PIECES || []).includes(i)) return;
    const coord = window.BOARD.getPieceCoord(myPlayer.color, pos, !!myPlayer.in_base[i], i);
    const piece = window.BOARD.pieces[myPlayer.color + '_' + i];
    const px    = piece ? piece.x : coord.x;
    const py    = piece ? piece.y : coord.y;
    const dist  = Math.sqrt((x - px) ** 2 + (y - py) ** 2);
    if (dist <= cs * 0.38) {
      clicked = true;
      SFX.tick();
      movePc(i);
    }
  });
};

// ── Helper: é o meu turno? ─────────────────
function _isMeTurn(state) {
  if (!state || !state.players || !window.U) return false;
  const p = state.players[state.turn];
  return p && p.user_id === window.U.id && state.phase === 0;
}

// ══════════════════════════════════════════
//  LOOP DE RENDER (sobrescreve o original)
// ══════════════════════════════════════════
window.startRenderLoop = function () {
  cancelAnimationFrame(window.CANVAS_ANIM_FRAME);
  function loop() {
    window.PULSE_T = (window.PULSE_T || 0) + 0.05;
    if (window.CUR_STATE && window.BOARD) {
      drawGameState(window.CUR_STATE);
    }
    window.CANVAS_ANIM_FRAME = requestAnimationFrame(loop);
  }
  window.CANVAS_ANIM_FRAME = requestAnimationFrame(loop);
};

// ══════════════════════════════════════════
//  INDICADOR DE TURNO MELHORADO
// ══════════════════════════════════════════
setInterval(() => {
  const state = window.CUR_STATE;
  const rb    = document.getElementById('rb');
  if (!state || !rb) return;
  const myTurn = _isMeTurn(state);
  rb.classList.toggle('my-turn-glow', myTurn && !state.over);
}, 500);

console.log('[LudoKz] Motor visual v2 carregado ✓');
