/**
 * game_patch.js — LudoKz v5
 * Formato backend: players[].tokens[].{ id, colour, x, y, is_locked, has_reached_home }
 */

const COLOUR_NAME = { red:'Vermelho', green:'Verde', blue:'Azul', yellow:'Amarelo' };
const COLOUR_CSS  = { red:'#ff0002', green:'#049645', blue:'#1295e7', yellow:'#ffde15' };

// ── initCanvas / buildBoard ─────────────────────────────────────────────────
window.initCanvas = function() {
  var canvas = document.getElementById('ludo-canvas');
  if (!canvas) return;
  if (window.BOARD) { window.BOARD.destroy(); window.BOARD = null; }
  var size = Math.min(460, window.innerWidth - 30);
  canvas.width  = size;
  canvas.height = size;
  canvas.style.width  = size + 'px';
  canvas.style.height = size + 'px';
  window.BOARD = new LudoBoard(canvas, size);
  if (window._canvasClickHandler) canvas.removeEventListener('click', window._canvasClickHandler);
  window._canvasClickHandler = window.onCanvasClick;
  canvas.addEventListener('click', window._canvasClickHandler);
  window.startRenderLoop();
};

window.buildBoard = function() { window.initCanvas(); };

// ── drawGameState — loop de renderização ────────────────────────────────────
window.drawGameState = function(state) {
  if (!window.BOARD || !state || !state.players) return;
  var canvas = document.getElementById('ludo-canvas');
  if (!canvas) return;

  window.BOARD.drawBoard();

  for (var pi = 0; pi < state.players.length; pi++) {
    var pl     = state.players[pi];
    var colour = pl.colour || pl.color || 'blue';
    if (!pl.tokens || !pl.tokens.length) continue;

    for (var ti = 0; ti < pl.tokens.length; ti++) {
      var token  = pl.tokens[ti];
      var tid    = token.id !== undefined ? token.id : ti;
      var key    = colour + '_' + tid;
      var piece  = window.BOARD.pieces[key];
      var sx, sy, scale = 1, opacity = 1;

      if (piece && piece.animating) {
        sx = piece.sx; sy = piece.sy;
        scale   = piece.scale   !== undefined ? piece.scale   : 1;
        opacity = piece.opacity !== undefined ? piece.opacity : 1;
      } else {
        var s = window.BOARD._toScreen(token.x, token.y);
        sx = s.sx; sy = s.sy;
        if (piece) {
          piece.sx = sx; piece.sy = sy;
          scale   = piece.scale   !== undefined ? piece.scale   : 1;
          opacity = piece.opacity !== undefined ? piece.opacity : 1;
        } else {
          window.BOARD.pieces[key] = { sx: sx, sy: sy, scale: 1, opacity: 1, animating: false };
        }
      }

      var isSelectable = false;
      if (window.SELECTABLE_PIECES && window.U && _isMeTurn(state)) {
        isSelectable = window.SELECTABLE_PIECES.indexOf(ti) !== -1 &&
                       pl.user_id === window.U.id;
      }

      window.BOARD.drawPiece(sx, sy, colour, tid + 1, isSelectable, window.PULSE_T, scale, opacity);
    }
  }
};

// ── renderState — actualiza UI ──────────────────────────────────────────────
window.renderState = function(state) {
  window.CUR_STATE = state;
  window.CUR_MV    = [];
  if (!state || !state.players) return;

  // Player cards
  var pc = document.getElementById('player-cards');
  if (pc) {
    var mid = '<div class="gmid"><div class="ttx" id="ttx">' +
      (_isMeTurn(state) ? 'Teu turno 🟢' : 'Aguarda 🔵') +
      '</div><div class="rtx">RND ' + (state.round || 0) + '</div></div>';

    var cards = '';
    for (var i = 0; i < state.players.length; i++) {
      var p      = state.players[i];
      var colour = p.colour || p.color || 'blue';
      var fin    = p.fin !== undefined ? p.fin :
                   (p.tokens ? p.tokens.filter(function(t){ return t.has_reached_home; }).length : 0);
      cards += '<div class="pc ' + (p.idx === state.turn ? 'mt' : '') + '">' +
        '<div class="pdot" style="background:' + (COLOUR_CSS[colour] || '#888') + '"></div>' +
        '<div><div class="pnm2">' + p.name +
          (p.user_id === (window.U && window.U.id) ? ' (Tu)' : '') + '</div>' +
        '<div class="pft">' + (COLOUR_NAME[colour] || colour) + ' · ' + fin + '/4</div></div></div>';
      if (i === Math.floor(state.players.length / 2) - 1) cards += mid;
    }
    pc.innerHTML = cards;
  }

  // Aposta
  var gbv = document.getElementById('gbv');
  if (gbv) gbv.textContent = (typeof fmt === 'function' ? fmt(state.bet) : state.bet) + ' KZ';

  // Botão dado
  var rb = document.getElementById('rb');
  if (rb) {
    var myTurn = _isMeTurn(state);
    rb.disabled = !myTurn || state.phase !== 0 || state.over;
    if (myTurn && !state.over) rb.classList.add('my-turn-glow');
    else rb.classList.remove('my-turn-glow');
  }

  // Log
  if (state.log && state.log.length) {
    var le = document.getElementById('glog');
    if (le) {
      var logHtml = '';
      var recent  = state.log.slice(-20).reverse();
      for (var li = 0; li < recent.length; li++) {
        var l   = recent[li];
        var cls = l.indexOf('VENCEU') !== -1 || l.indexOf('🏆') !== -1 ? ' gli-w' :
                  l.indexOf('💀') !== -1 ? ' gli-d' : '';
        logHtml += '<div class="gli' + cls + '">' + l + '</div>';
      }
      le.innerHTML = logHtml;
    }
  }

  // Chat count
  var co = document.getElementById('chat-online');
  if (co) co.textContent = state.players.length + ' online';

  // Dado visual
  var faces = ['⚀','⚁','⚂','⚃','⚄','⚅'];
  if (state.dice > 0) {
    var dfc = document.getElementById('dfc');
    var dnm = document.getElementById('dnm');
    if (dfc) dfc.textContent = faces[state.dice - 1];
    if (dnm) dnm.textContent = state.dice;
  }

  window.SELECTABLE_PIECES = [];
};

// ── highlightPcs ────────────────────────────────────────────────────────────
window.highlightPcs = function(mv) {
  window.CUR_MV = mv || [];
  window.SELECTABLE_PIECES = mv || [];
};

// ── onGameStarted ───────────────────────────────────────────────────────────
window.onGameStarted = function(state) {
  window.RID        = state.room_id;
  window.CUR_STATE  = state;
  window.PREV_STATE = null;

  if (typeof pg === 'function') pg('game');
  window.buildBoard();
  window.renderState(state);

  var chatEl = document.getElementById('chat-msgs');
  if (chatEl) chatEl.innerHTML = '';

  if (typeof addChat === 'function') {
    addChat('Sistema', 'Jogo iniciado com ' + state.players.length + ' jogadores!', true);
    for (var i = 0; i < state.players.length; i++) {
      var p      = state.players[i];
      var colour = p.colour || p.color || 'blue';
      addChat('Sistema', (COLOUR_NAME[colour] || colour) + ': ' + p.name, true);
    }
  }

  if (typeof SFX !== 'undefined') SFX.myTurn();
};

// ── onGameUpdate ────────────────────────────────────────────────────────────
window.onGameUpdate = function(state) {
  if (window.PREV_STATE && window.BOARD) {
    window._triggerMoveAnimations(window.PREV_STATE, state);
  }
  window.PREV_STATE = window.CUR_STATE;
  window.CUR_STATE  = state;
  window.renderState(state);
};

// ── _triggerMoveAnimations ──────────────────────────────────────────────────
window._triggerMoveAnimations = function(prev, next) {
  if (!prev || !prev.players || !next || !next.players || !window.BOARD) return;

  for (var pi = 0; pi < next.players.length; pi++) {
    var pl     = next.players[pi];
    var colour = pl.colour || pl.color || 'blue';
    if (!pl.tokens) continue;

    var prevPl = null;
    for (var xi = 0; xi < prev.players.length; xi++) {
      if (prev.players[xi].user_id === pl.user_id) { prevPl = prev.players[xi]; break; }
    }
    if (!prevPl || !prevPl.tokens) continue;

    for (var ti = 0; ti < pl.tokens.length; ti++) {
      var token     = pl.tokens[ti];
      var prevToken = prevPl.tokens[ti];
      if (!prevToken) continue;
      var tid = token.id !== undefined ? token.id : ti;

      // Sem mudança
      if (token.x === prevToken.x && token.y === prevToken.y &&
          token.is_locked === prevToken.is_locked &&
          token.has_reached_home === prevToken.has_reached_home) continue;

      // Captura (voltou para a base)
      if (token.is_locked && !prevToken.is_locked) {
        window.BOARD.animateCaptureAt(colour, tid);
        continue;
      }

      // Movimento
      window.BOARD.animateMove(
        colour, tid,
        prevToken.x, prevToken.y,
        token.x,     token.y,
        prevToken.is_locked && !token.is_locked,
        null
      );
    }
  }
};

// ── doRoll ──────────────────────────────────────────────────────────────────
window.doRoll = async function() {
  if (!window.RID) return;
  var rb = document.getElementById('rb');
  if (rb) rb.disabled = true;
  var faceEl = document.getElementById('dfc');
  if (faceEl) faceEl.classList.add('rolling');

  var d = await (typeof api === 'function'
    ? api('/api/game/roll', 'POST', { room_id: window.RID })
    : fetch('/api/game/roll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ room_id: window.RID }),
        credentials: 'same-origin'
      }).then(function(r){ return r.json(); })
  );

  if (faceEl) faceEl.classList.remove('rolling');
  if (d.error) { if (typeof toast === 'function') toast('❌ ' + d.error, 'ter'); return; }

  if (window.BOARD) {
    window.BOARD.animateDice(d.dice, async function() {
      window.renderState(d);
      var mv = await (typeof api === 'function'
        ? api('/api/game/movable', 'POST', { room_id: window.RID })
        : { movable: [] }
      );
      if (mv.movable && mv.movable.length) window.highlightPcs(mv.movable);
    });
  } else {
    var faces = ['⚀','⚁','⚂','⚃','⚄','⚅'];
    if (faceEl) faceEl.textContent = faces[d.dice - 1];
    var dnm = document.getElementById('dnm');
    if (dnm) dnm.textContent = d.dice;
    window.renderState(d);
    var mv2 = await (typeof api === 'function'
      ? api('/api/game/movable', 'POST', { room_id: window.RID })
      : { movable: [] }
    );
    if (mv2.movable && mv2.movable.length) window.highlightPcs(mv2.movable);
  }
};

// ── movePc ──────────────────────────────────────────────────────────────────
window.movePc = async function(idx) {
  if (!window.RID) return;
  window.PREV_STATE = window.CUR_STATE ? JSON.parse(JSON.stringify(window.CUR_STATE)) : null;

  var d = await (typeof api === 'function'
    ? api('/api/game/move', 'POST', { room_id: window.RID, piece: idx })
    : fetch('/api/game/move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ room_id: window.RID, piece: idx }),
        credentials: 'same-origin'
      }).then(function(r){ return r.json(); })
  );

  if (d.error) {
    if (typeof toast === 'function') toast('❌ ' + d.error, 'ter');
    return;
  }

  if (window.PREV_STATE && window.BOARD)
    window._triggerMoveAnimations(window.PREV_STATE, d);

  window.PREV_STATE = window.CUR_STATE;
  window.renderState(d);
};

// ── leaveGame ───────────────────────────────────────────────────────────────
window.leaveGame = async function() {
  if (!confirm('Abandonar? Perdes a aposta.')) return;
  if (window.RID) {
    await (typeof api === 'function'
      ? api('/api/game/leave', 'POST', { room_id: window.RID })
      : fetch('/api/game/leave', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ room_id: window.RID }), credentials: 'same-origin'
        })
    );
  }
  window.RID = null;
  if (typeof pg === 'function') pg('home');
};

// ── onGameOver ──────────────────────────────────────────────────────────────
window.onGameOver = function(d) {
  if (d.won && typeof SFX !== 'undefined') SFX.win();
  if (d.won && typeof coinRain === 'function') coinRain();
  if (d.won && typeof showFlash === 'function') showFlash('🏆');

  var goo  = document.getElementById('goo');  if (goo)  goo.classList.remove('hidden');
  var goic = document.getElementById('goic'); if (goic) goic.textContent = d.won ? '🏆' : '💀';
  var gott = document.getElementById('gott'); if (gott) gott.textContent = d.won ? 'VITÓRIA!' : 'DERROTA';
  var gosb = document.getElementById('gosb'); if (gosb) gosb.textContent = d.won ? 'Parabéns, venceste!' : 'Boa sorte da próxima!';
  var gopr = document.getElementById('gopr');
  if (gopr) {
    var prize = d.won ? (d.prize || 0) : 0;
    gopr.textContent = (d.won ? '+' : '') + (typeof fmt === 'function' ? fmt(prize) : prize) + ' KZ';
    gopr.style.color = d.won ? 'var(--jade)' : 'var(--red)';
  }
  var gocd = document.getElementById('gocd');
  if (gocd) gocd.className = 'gocd' + (d.won ? '' : ' lose');
  if (d.balance != null && window.U) {
    window.U.balance = d.balance;
    if (typeof updN === 'function') updN();
  }
};

// ── onCanvasClick ───────────────────────────────────────────────────────────
window.onCanvasClick = function(e) {
  if (!window.CUR_STATE || !window.BOARD) return;
  if (!_isMeTurn(window.CUR_STATE)) return;
  if (window.CUR_STATE.phase !== 1) return;

  var rect = e.target.getBoundingClientRect();
  var scaleX = e.target.width  / rect.width;
  var scaleY = e.target.height / rect.height;
  var x = (e.clientX - rect.left) * scaleX;
  var y = (e.clientY - rect.top)  * scaleY;
  var cs = e.target.width / 15;

  var myPlayer = null;
  for (var i = 0; i < window.CUR_STATE.players.length; i++) {
    if (window.CUR_STATE.players[i].user_id === (window.U && window.U.id)) {
      myPlayer = window.CUR_STATE.players[i]; break;
    }
  }
  if (!myPlayer || !myPlayer.tokens) return;

  var colour  = myPlayer.colour || myPlayer.color || 'blue';
  var clicked = false;

  for (var ti = 0; ti < myPlayer.tokens.length; ti++) {
    if (clicked) break;
    if (!window.SELECTABLE_PIECES || window.SELECTABLE_PIECES.indexOf(ti) === -1) continue;

    var token = myPlayer.tokens[ti];
    var tid   = token.id !== undefined ? token.id : ti;
    var key   = colour + '_' + tid;
    var piece = window.BOARD.pieces[key];
    var s     = window.BOARD._toScreen(token.x, token.y);
    var px    = piece ? piece.sx : s.sx;
    var py    = piece ? piece.sy : s.sy;
    var dist  = Math.sqrt((x - px) * (x - px) + (y - py) * (y - py));

    if (dist <= cs * 0.40) {
      clicked = true;
      if (typeof SFX !== 'undefined') SFX.tick();
      window.movePc(ti);
    }
  }
};

// ── _isMeTurn ───────────────────────────────────────────────────────────────
function _isMeTurn(state) {
  if (!state || !state.players || !window.U) return false;
  var p = state.players[state.turn];
  return p && p.user_id === window.U.id && state.phase === 0;
}

// ── startRenderLoop ──────────────────────────────────────────────────────────
window.startRenderLoop = function() {
  cancelAnimationFrame(window.CANVAS_ANIM_FRAME);
  window.PULSE_T = 0;
  function loop() {
    window.PULSE_T = (window.PULSE_T || 0) + 0.05;
    if (window.CUR_STATE && window.BOARD) window.drawGameState(window.CUR_STATE);
    window.CANVAS_ANIM_FRAME = requestAnimationFrame(loop);
  }
  window.CANVAS_ANIM_FRAME = requestAnimationFrame(loop);
};

// ── Indicador de turno ───────────────────────────────────────────────────────
setInterval(function() {
  var rb = document.getElementById('rb');
  if (!rb || !window.CUR_STATE) return;
  if (_isMeTurn(window.CUR_STATE) && !window.CUR_STATE.over) rb.classList.add('my-turn-glow');
  else rb.classList.remove('my-turn-glow');
}, 500);

console.log('[LudoKz] game_patch.js v5 carregado ✓');
