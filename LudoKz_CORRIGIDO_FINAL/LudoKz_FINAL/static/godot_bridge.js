/**
 * godot_bridge.js — LudoKz
 * Substitui o jogo canvas JS pelo Godot exportado para HTML5.
 *
 * INSTALAÇÃO: no index.html, as últimas linhas de script ficam assim:
 *
 *   <script src="/static/ludo_board.js"></script>
 *   <script src="/static/game_patch.js"></script>
 *   <script src="/static/godot_bridge.js"></script>
 *   <script src="/static/ludo_game/index.js"></script>
 *
 * FICHEIROS DO GODOT em /static/ludo_game/:
 *   index.js  index.wasm  index.pck  index.audio.worklet.js
 */

(function () {
  'use strict';

  // ── Dados passados ao Godot via JS globals ──────────────────────────────
  window.GODOT_USER_ID     = null;
  window.GODOT_USER_NAME   = '';
  window.GODOT_ROOM_ID     = '';
  window.GODOT_BACKEND_URL = window.location.origin;

  // Buffer SSE para o Godot ler via _process()
  window._godotSSEEvent = null;

  // ── Criar container do Godot (uma única vez) ────────────────────────────
  function _createContainer() {
    if (document.getElementById('godot-container')) return;

    var c = document.createElement('div');
    c.id = 'godot-container';
    c.style.cssText = [
      'display:none',
      'position:fixed',
      'inset:0',
      'background:#000',
      'z-index:9999',
      'flex-direction:column',
      'align-items:center',
      'justify-content:center',
    ].join(';');

    // Canvas onde o Godot renderiza (o export HTML5 procura id="canvas")
    var canvas = document.createElement('canvas');
    canvas.id  = 'canvas';
    canvas.style.cssText = [
      'width:min(100vw,100vh)',
      'height:min(100vw,100vh)',
      'display:block',
      'image-rendering:pixelated',
    ].join(';');

    // Botão sair
    var btn = document.createElement('button');
    btn.textContent = '× Sair';
    btn.style.cssText = [
      'position:absolute',
      'top:12px',
      'right:12px',
      'background:rgba(255,45,85,.9)',
      'color:#fff',
      'border:none',
      'border-radius:9px',
      'padding:9px 18px',
      'font-size:14px',
      'font-weight:800',
      'cursor:pointer',
      'z-index:10000',
      'font-family:Plus Jakarta Sans,sans-serif',
    ].join(';');
    btn.onclick = _onLeave;

    // Loading
    var loader = document.createElement('div');
    loader.id = 'godot-loader';
    loader.textContent = '⏳ A carregar jogo...';
    loader.style.cssText = [
      'position:absolute',
      'bottom:30px',
      'color:#f5c518',
      'font-family:Plus Jakarta Sans,sans-serif',
      'font-size:13px',
      'font-weight:700',
      'letter-spacing:1px',
    ].join(';');

    c.appendChild(canvas);
    c.appendChild(btn);
    c.appendChild(loader);
    document.body.appendChild(c);
  }

  // ── Mostrar / esconder ──────────────────────────────────────────────────
  function _show() {
    var c = document.getElementById('godot-container');
    if (c) c.style.display = 'flex';
  }

  function _hide() {
    var c = document.getElementById('godot-container');
    if (c) c.style.display = 'none';
  }

  function _hideLoader() {
    var l = document.getElementById('godot-loader');
    if (l) l.style.display = 'none';
  }

  // ── Sair do jogo ────────────────────────────────────────────────────────
  function _onLeave() {
    _hide();
    if (window.RID) {
      fetch('/api/game/leave', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ room_id: window.RID }),
        credentials: 'same-origin',
      }).catch(function () {});
      window.RID = null;
    }
    if (typeof pg === 'function') pg('home');
    window.dispatchEvent(new CustomEvent('ludokz:leave'));
  }

  // ── Iniciar instância Godot ─────────────────────────────────────────────
  var _godotStarted = false;

  function _startGodot() {
    if (_godotStarted) {
      _hideLoader();
      return;
    }

    if (typeof Engine === 'undefined') {
      console.warn('[GodotBridge] Engine não carregado — fallback canvas JS');
      _hide();
      _fallback();
      return;
    }

    _godotStarted = true;

    var engine = new Engine({
      args:               [],
      canvasResizePolicy: 1,
      executable:         '/static/ludo_game/index',
      experimentalVK:     false,
      fileSizes:          {},
      focusCanvas:        true,
      gdextensionLibs:    [],
    });

    engine.startGame({
      canvas: document.getElementById('canvas'),
    }).then(function () {
      _hideLoader();
      console.log('[GodotBridge] Godot iniciado ✓');
    }).catch(function (err) {
      console.error('[GodotBridge] Erro Godot:', err);
      _hide();
      _fallback();
    });
  }

  // ── Fallback canvas JS ──────────────────────────────────────────────────
  function _fallback() {
    if (typeof pg === 'function') pg('game');
    if (typeof window.buildBoard === 'function') window.buildBoard();
    if (window.CUR_STATE && typeof window.renderState === 'function')
      window.renderState(window.CUR_STATE);
  }

  // ── Interceptar onGameStarted ───────────────────────────────────────────
  // game_patch.js define window.onGameStarted — substituímos aqui.
  window.onGameStarted = function (state) {
    window.RID       = state.room_id;
    window.CUR_STATE = state;

    // Actualizar globals para o Godot
    window.GODOT_USER_ID   = window.U ? window.U.id   : -1;
    window.GODOT_USER_NAME = window.U ? window.U.name : '';
    window.GODOT_ROOM_ID   = state.room_id || '';

    // Esconder ecrã de jogo JS, mostrar Godot
    var s = document.getElementById('s-game');
    if (s) s.style.display = 'none';
    _show();

    _startGodot();

    window.dispatchEvent(new CustomEvent('ludokz:gamestarted', { detail: state }));
  };

  // ── Interceptar onGameUpdate ────────────────────────────────────────────
  // O Godot recebe updates via SSE directamente.
  // Só mantemos CUR_STATE actualizado.
  window.onGameUpdate = function (state) {
    window.CUR_STATE = state;
  };

  // ── Game over vindo do Godot (via JavaScriptBridge.eval) ────────────────
  window.onGodotGameOver = function (data) {
    _hide();

    var goo = document.getElementById('goo');
    if (!goo) return;
    goo.classList.remove('hidden');

    var goic = document.getElementById('goic');
    var gott = document.getElementById('gott');
    var gosb = document.getElementById('gosb');
    var gopr = document.getElementById('gopr');
    var gocd = document.getElementById('gocd');

    if (goic) goic.textContent = data.won ? '🏆' : '💀';
    if (gott) gott.textContent = data.won ? 'VITÓRIA!' : 'DERROTA';
    if (gosb) gosb.textContent = data.won ? 'Parabéns, venceste!' : 'Boa sorte da próxima!';
    if (gopr) {
      var prize = data.won ? (data.prize || 0) : 0;
      gopr.textContent = (data.won ? '+' : '') +
        (typeof fmt === 'function' ? fmt(prize) : prize) + ' KZ';
      gopr.style.color = data.won ? 'var(--jade)' : 'var(--red)';
    }
    if (gocd) gocd.className = 'gocd' + (data.won ? '' : ' lose');

    if (data.balance != null && window.U) {
      window.U.balance = data.balance;
      if (typeof updN === 'function') updN();
    }
    if (data.won && typeof coinRain  === 'function') coinRain();
    if (data.won && typeof showFlash === 'function') showFlash('🏆');

    window.dispatchEvent(new CustomEvent('ludokz:gameover', { detail: data }));
  };

  // ── Abandonar (chamado pelo Godot via JavaScriptBridge) ─────────────────
  window.onGodotLeave = _onLeave;

  // ── Ligar SSE → buffer do Godot ─────────────────────────────────────────
  // O NetworkManager.gd lê window._godotSSEEvent a cada frame.
  function _hookSSE() {
    var tries = 0;
    var iv = setInterval(function () {
      tries++;
      if (window.SSE) {
        clearInterval(iv);
        window.SSE.addEventListener('game_started', function (e) {
          window._godotSSEEvent = { type: 'game_started', data: e.data };
        });
        window.SSE.addEventListener('game_update', function (e) {
          window._godotSSEEvent = { type: 'game_update', data: e.data };
        });
        window.SSE.addEventListener('game_over', function (e) {
          window._godotSSEEvent = { type: 'game_over', data: e.data };
        });
        console.log('[GodotBridge] SSE → Godot ligado ✓');
      }
      if (tries > 60) clearInterval(iv);
    }, 500);
  }

  // ── Init ────────────────────────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      _createContainer();
      _hookSSE();
    });
  } else {
    _createContainer();
    _hookSSE();
  }

  console.log('[GodotBridge] carregado ✓');
})();
