/**
 * game_patch.js — Motor Visual LudoKz v3
 * Compatível com novo game_manager.py (sistema LibreLudo)
 * Tokens: { id, colour, x(row), y(col), is_locked, has_reached_home }
 * Cores: "blue" | "red" | "green" | "yellow"
 */

// ══════════════════════════════════════════
//  MAPEAMENTOS para o novo sistema
// ══════════════════════════════════════════
const COLOUR_NAME = {
  red:    'Vermelho',
  green:  'Verde',
  blue:   'Azul',
  yellow: 'Amarelo',
};

const COLOUR_CSS = {
  red:    '#ff0002',
  green:  '#049645',
  blue:   '#1295e7',
  yellow: '#ffde15',
};

// ── initCanvas ─────────────────────────────
window.initCanvas = function () {
  const canvas = document.getElementById('ludo-canvas');
  if (!canvas) return;
  if (window.BOARD) { window.BOARD.destroy(); window.BOARD = null; }
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

// ── buildBoard ─────────────────────────────
window.buildBoard = function () { window.initCanvas(); };

// ── renderState ────────────────────────────
// Novo estado: players[].colour (string completa), players[].tokens[]
window.renderState = function (state) {
  window.CUR_STATE = state;
  window.CUR_MV    = [];
  if (!state || !state.players) return;

  // Player cards
  const pc = document.getElementById('player-cards');
  if (pc) {
    const mid = `<div class="gmid">
      <div class="ttx" id="ttx">${_isMeTurn(state) ? 'Teu turno 🟢' : 'Aguarda 🔵'}</div>
      <div class="rtx">RND ${state.round || 0}</div>
    </div>`;
    pc.innerHTML = state.players.map((p, i) => {
      const colour = p.colour || p.color || 'blue';
      const fin    = p.fin !== undefined ? p.fin : (p.tokens||[]).filter(t=>t.has_reached_home).length;
      return `<div class="pc ${p.idx === state.turn ? 'mt' : ''}">
        <div class="pdot" style="background:${COLOUR_CSS[colour]||'#888'}"></div>
        <div>
          <div class="pnm2">${p.name}${p.user_id === window.U?.id ? ' (Tu)' : ''}</div>
          <div class="pft">${COLOUR_NAME[colour]||colour} · ${fin}/4</div>
        </div>
      </div>`;
    }).reduce((a,h,i)=>i===Math.floor(state.players.length/2)?a+mid+h:a+h,'');
  }

  // Aposta
  const gbv = document.getElementById('gbv');
  if (gbv) gbv.textContent = (typeof fmt==='function'?fmt(state.bet):state.bet)+' KZ';

  // Botão dado
  const rb = document.getElementById('rb');
  if (rb) {
    const myTurn = _isMeTurn(state);
    rb.disabled = !myTurn || state.phase !== 0 || state.over;
    rb.classList.toggle('my-turn-glow', myTurn && !state.over);
  }

  // Log
  if (state.log && state.log.length) {
    const le = document.getElementById('glog');
    if (le) le.innerHTML = state.log.slice(-20).reverse().map(l =>
      `<div class="gli ${l.includes('VENCEU')||l.includes('🏆')?' gli-w':l.includes('💀')?' gli-d':''}">${l}</div>`
    ).join('');
  }

  // Chat online
  const co = document.getElementById('chat-online');
  if (co) co.textContent = state.players.length + ' online';

  // Dado visual
  const faces = ['⚀','⚁','⚂','⚃','⚄','⚅'];
  const dfc = document.getElementById('dfc');
  if (dfc && state.dice > 0) dfc.textContent = faces[state.dice - 1];
  const dnm = document.getElementById('dnm');
  if (dnm && state.dice > 0) dnm.textContent = state.dice;

  window.SELECTABLE_PIECES = [];
};

// ── highlightPcs ───────────────────────────
window.highlightPcs = function (mv) {
  window.CUR_MV = mv || [];
  window.SELECTABLE_PIECES = mv || [];
};

window.renderPieces = function (state, mv) {
  window.SELECTABLE_PIECES = mv || [];
};

// ── drawGameState (loop principal) ─────────
// Usa o novo sistema de coordenadas (x=row, y=col)
window.drawGameState = function (state) {
  if (!window.BOARD || !state || !state.players) return;
  const canvas = document.getElementById('ludo-canvas');
  if (!canvas) return;

  window.BOARD.drawBoard();

  state.players.forEach(pl => {
    const colour = pl.colour || pl.color || 'blue';
    if (!pl.tokens) return;

    pl.tokens.forEach((token, i) => {
      const tid = token.id !== undefined ? token.id : i;
      const key = colour + '_' + tid;
      let sx, sy, scale = 1, opacity = 1;
      const piece = window.BOARD.pieces[key];

      if (piece && piece.animating) {
        sx = piece.sx; sy = piece.sy;
        scale   = piece.scale   ?? 1;
        opacity = piece.opacity ?? 1;
      } else {
        const s = window.BOARD._gameToScreen(token.x, token.y);
        sx = s.sx; sy = s.sy;
        if (piece) {
          piece.sx = sx; piece.sy = sy;
          scale   = piece.scale   ?? 1;
          opacity = piece.opacity ?? 1;
        } else {
          window.BOARD.pieces[key] = { sx, sy, scale: 1, opacity: 1, animating: false };
        }
      }

      const isSelectable = (window.SELECTABLE_PIECES || []).includes(i)
        && pl.user_id === window.U?.id
        && _isMeTurn(state);

      window.BOARD.drawPiece(sx, sy, colour, tid + 1, isSelectable, window.PULSE_T, scale, opacity);
    });
  });
};

// ── onGameStarted ──────────────────────────
window.onGameStarted = function (state) {
  window.RID        = state.room_id;
  window.CUR_STATE  = state;
  window.PREV_STATE = null;

  if (typeof pg === 'function') pg('game');
  buildBoard();
  renderState(state);

  const chatEl = document.getElementById('chat-msgs');
  if (chatEl) chatEl.innerHTML = '';

  if (typeof addChat === 'function') {
    addChat('Sistema', 'Jogo iniciado com ' + state.players.length + ' jogadores!', true);
    state.players.forEach(p => {
      const colour = p.colour || p.color || 'blue';
      addChat('Sistema', (COLOUR_NAME[colour]||colour) + ': ' + p.name, true);
    });
  }

  if (typeof SFX !== 'undefined') {
    SFX.tick();
    setTimeout(() => SFX.tick(), 120);
    setTimeout(() => SFX.tick(), 240);
  }
};

// ── onGameUpdate ───────────────────────────
window.onGameUpdate = function (state) {
  if (window.PREV_STATE && window.BOARD) {
    _triggerMoveAnimations(window.PREV_STATE, state);
  }
  window.PREV_STATE = window.CUR_STATE;
  window.CUR_STATE  = state;
  renderState(state);
};

// ── _triggerMoveAnimations ─────────────────
// Novo sistema: compara tokens[].x/y/is_locked/has_reached_home
window._triggerMoveAnimations = function (prev, next) {
  if (!prev || !prev.players || !next || !next.players || !window.BOARD) return;

  next.players.forEach(pl => {
    const colour  = pl.colour || pl.color || 'blue';
    const prevPl  = prev.players.find(p => p.user_id === pl.user_id);
    if (!prevPl || !pl.tokens) return;

    pl.tokens.forEach((token, i) => {
      const prevToken = (prevPl.tokens || [])[i];
      if (!prevToken) return;
      const tid = token.id !== undefined ? token.id : i;

      // Sem mudança
      if (token.x === prevToken.x && token.y === prevToken.y &&
          token.is_locked === prevToken.is_locked &&
          token.has_reached_home === prevToken.has_reached_home) return;

      // Captura — peça voltou para a base
      if (token.is_locked && !prevToken.is_locked) {
        window.BOARD.animateCaptureAt(colour, tid);
        return;
      }

      // Movimento normal ou saída da base
      window.BOARD.animatePieceTo(
        colour, tid,
        prevToken.x, prevToken.y,
        token.x,     token.y,
        prevToken.is_locked && !token.is_locked,
        null
      );
    });
  });
};

// ── doRoll ─────────────────────────────────
window.doRoll = async function () {
  if (!window.RID) return;
  const rb = document.getElementById('rb');
  if (rb) rb.disabled = true;
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
  if (d.error) { if (typeof toast==='function') toast('❌ '+d.error,'ter'); return; }

  if (window.BOARD) {
    window.BOARD.animateDice(d.dice, async () => {
      renderState(d);
      const mv = await (typeof api==='function'
        ? api('/api/game/movable','POST',{room_id:window.RID})
        : {movable:[]}
      );
      if (mv.movable && mv.movable.length) highlightPcs(mv.movable);
    });
  } else {
    const faces=['⚀','⚁','⚂','⚃','⚄','⚅'];
    if (faceEl) faceEl.textContent=faces[d.dice-1];
    const dnm=document.getElementById('dnm');
    if (dnm) dnm.textContent=d.dice;
    renderState(d);
    const mv=await (typeof api==='function'?api('/api/game/movable','POST',{room_id:window.RID}):{movable:[]});
    if (mv.movable && mv.movable.length) highlightPcs(mv.movable);
  }
};

// ── movePc ─────────────────────────────────
window.movePc = async function (idx) {
  if (!window.RID) return;
  window.PREV_STATE = window.CUR_STATE ? JSON.parse(JSON.stringify(window.CUR_STATE)) : null;

  const d = await (typeof api==='function'
    ? api('/api/game/move','POST',{room_id:window.RID,piece:idx})
    : fetch('/api/game/move',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({room_id:window.RID,piece:idx}),
        credentials:'same-origin'
      }).then(r=>r.json())
  );

  if (d.error) {
    if (typeof toast==='function') toast('❌ '+d.error,'ter');
    if (d.error.includes('bloqueada') && typeof SFX!=='undefined') SFX.blocked();
    return;
  }

  if (window.PREV_STATE && window.BOARD) _triggerMoveAnimations(window.PREV_STATE, d);
  window.PREV_STATE = window.CUR_STATE;
  renderState(d);
};

// ── onGameOver ─────────────────────────────
window.onGameOver = function (d) {
  if (d.won && typeof SFX!=='undefined') SFX.win();
  if (d.won && typeof coinRain==='function') coinRain();
  if (d.won && typeof showFlash==='function') showFlash('🏆');

  const goEl=document.getElementById('goo'); if(goEl) goEl.classList.remove('hidden');
  const goic=document.getElementById('goic'); if(goic) goic.textContent=d.won?'🏆':'💀';
  const gott=document.getElementById('gott'); if(gott) gott.textContent=d.won?'VITÓRIA!':'DERROTA';
  const gosb=document.getElementById('gosb'); if(gosb) gosb.textContent=d.won?'Parabéns, venceste!':'Boa sorte da próxima!';
  const gopr=document.getElementById('gopr');
  if (gopr) {
    gopr.textContent=(d.won?'+':'')+(typeof fmt==='function'?fmt(d.won?d.prize:0):(d.won?d.prize:0))+' KZ';
    gopr.style.color=d.won?'var(--jade)':'var(--red)';
  }
  const gocd=document.getElementById('gocd'); if(gocd) gocd.className='gocd'+(d.won?'':' lose');
  if (d.balance!=null&&window.U) { window.U.balance=d.balance; if(typeof updN==='function') updN(); }
};

// ── onCanvasClick ──────────────────────────
// Usa novo sistema: myPlayer.tokens[i].x/y em vez de pos/in_base
window.onCanvasClick = function (e) {
  if (!window.CUR_STATE || !window.BOARD) return;
  if (!_isMeTurn(window.CUR_STATE)) return;
  if (window.CUR_STATE.phase !== 1) return;

  const rect = e.target.getBoundingClientRect();
  const x = (e.clientX - rect.left) * (e.target.width / rect.width);
  const y = (e.clientY - rect.top)  * (e.target.height / rect.height);
  const cs = e.target.width / 15;

  const myPlayer = window.CUR_STATE.players.find(p => p.user_id === window.U?.id);
  if (!myPlayer || !myPlayer.tokens) return;

  const colour = myPlayer.colour || myPlayer.color || 'blue';
  let clicked = false;

  myPlayer.tokens.forEach((token, i) => {
    if (clicked) return;
    if (!(window.SELECTABLE_PIECES || []).includes(i)) return;
    const tid   = token.id !== undefined ? token.id : i;
    const key   = colour + '_' + tid;
    const piece = window.BOARD.pieces[key];
    const s     = window.BOARD._gameToScreen(token.x, token.y);
    const px    = piece ? piece.sx : s.sx;
    const py    = piece ? piece.sy : s.sy;
    const dist  = Math.sqrt((x-px)**2 + (y-py)**2);
    if (dist <= cs * 0.38) {
      clicked = true;
      if (typeof SFX !== 'undefined') SFX.tick();
      movePc(i);
    }
  });
};

// ── _isMeTurn ──────────────────────────────
function _isMeTurn(state) {
  if (!state || !state.players || !window.U) return false;
  const p = state.players[state.turn];
  return p && p.user_id === window.U.id && state.phase === 0;
}

// ── startRenderLoop ────────────────────────
window.startRenderLoop = function () {
  cancelAnimationFrame(window.CANVAS_ANIM_FRAME);
  function loop() {
    window.PULSE_T = (window.PULSE_T || 0) + 0.05;
    if (window.CUR_STATE && window.BOARD) drawGameState(window.CUR_STATE);
    window.CANVAS_ANIM_FRAME = requestAnimationFrame(loop);
  }
  window.CANVAS_ANIM_FRAME = requestAnimationFrame(loop);
};

// ── Indicador de turno ─────────────────────
setInterval(() => {
  const state = window.CUR_STATE;
  const rb    = document.getElementById('rb');
  if (!state || !rb) return;
  rb.classList.toggle('my-turn-glow', _isMeTurn(state) && !state.over);
}, 500);

console.log('[LudoKz] Motor visual v3 carregado ✓');
