/**
 * admin_board_patch.js
 * Substitui o canvas do painel admin pelo mesmo sistema de LudoBoardV2:
 * uma <div> com ludo_board.png de fundo + peças HTML absolutas por cima.
 *
 * Incluir DEPOIS de ludo_board_v2.js no admin.html:
 *   <script src="/static/ludo_board_v2.js"></script>
 *   <script src="/static/admin_board_patch.js"></script>
 */

// ── Mapeamento cor do servidor → player key do LudoBoardV2 ─────────────────
// O servidor devolve players com .color = 'r'|'g'|'b'|'y'
// O LudoBoardV2 usa P1(azul) P2(verde) P3(vermelho) P4(amarelo)
// Layout da imagem: Verde=cima-esq(P2), Amarelo=cima-dir(P4), Vermelho=baixo-esq(P3), Azul=baixo-dir(P1)
const COLOR_TO_PLAYER = { g:'P2', y:'P4', r:'P3', b:'P1' };

// Posições base por player (para inicializar peças na base)
const ADMIN_BASE = {
  P1: [500,501,502,503],
  P2: [600,601,602,603],
  P3: [700,701,702,703],
  P4: [800,801,802,803]
};

// ── Estado do tabuleiro admin ───────────────────────────────────────────────
let ADMIN_LUDO_BOARD = null;   // instância de LudoBoardV2
let ADMIN_BOARD_DIV  = null;   // div contentor do tabuleiro

// ── Substitui buildTestBoard() original ────────────────────────────────────
window.buildTestBoard = function() {
  // Remove canvas antigo se existir
  const oldCanvas = document.getElementById('test-board-canvas');
  if (oldCanvas) oldCanvas.style.display = 'none';

  // Destrói tabuleiro anterior
  if (ADMIN_LUDO_BOARD) {
    ADMIN_LUDO_BOARD.destroy();
    ADMIN_LUDO_BOARD = null;
  }
  if (ADMIN_BOARD_DIV) {
    ADMIN_BOARD_DIV.remove();
    ADMIN_BOARD_DIV = null;
  }

  // Cria div contentor com tamanho responsivo
  const size = Math.min(460, window.innerWidth - 80);
  const div = document.createElement('div');
  div.id = 'admin-ludo-div';
  div.style.cssText = `
    position: relative;
    width: ${size}px;
    height: ${size}px;
    border-radius: 12px;
    box-shadow: 0 0 40px rgba(0,0,0,0.7);
    overflow: hidden;
    flex-shrink: 0;
    background: #1a1a2e;
  `;

  // Insere no lugar do canvas
  if (oldCanvas) {
    oldCanvas.parentNode.insertBefore(div, oldCanvas);
  } else {
    // Fallback: insere no contentor do jogo
    const sec = document.getElementById('test-game-section');
    if (sec) {
      const wrap = sec.querySelector('div[style*="display:flex"]') ||
                   sec.querySelector('div');
      if (wrap) wrap.prepend(div);
      else sec.appendChild(div);
    }
  }

  ADMIN_BOARD_DIV = div;
  ADMIN_LUDO_BOARD = new LudoBoardV2(div);

  // Inicializa todas as peças nas bases
  ['P1','P2','P3','P4'].forEach(player => {
    ADMIN_BASE[player].forEach((pos, i) => {
      ADMIN_LUDO_BOARD.setPiecePosition(player, i, pos);
    });
  });

  // Adiciona CSS de pulse se não existir
  if (!document.getElementById('admin-ludo-pulse-css')) {
    const style = document.createElement('style');
    style.id = 'admin-ludo-pulse-css';
    style.textContent = `
      @keyframes ludo-pulse {
        from { box-shadow:0 0 4px rgba(255,255,255,0.5); transform:translate(50%,50%) scale(1); }
        to   { box-shadow:0 0 16px #fff, 0 0 6px gold; transform:translate(50%,50%) scale(1.2); }
      }
    `;
    document.head.appendChild(style);
  }
};

// ── Substitui renderTestPieces() original ──────────────────────────────────
// Chamada sempre que o estado do jogo muda
window.renderTestPieces = function(state) {
  if (!ADMIN_LUDO_BOARD || !state || !state.players) return;

  TEST_SELECTABLE = [];

  // Para cada jogador do servidor, mapeia para o player correto e actualiza posições
  state.players.forEach(pl => {
    const playerKey = COLOR_TO_PLAYER[pl.color] || COLOR_TO_PLAYER[pl.colour];
    if (!playerKey) return;

    pl.pos.forEach((pos, pieceIdx) => {
      // pos=0 significa na base
      let boardPos;
      if (pl.in_base && pl.in_base[pieceIdx]) {
        boardPos = ADMIN_BASE[playerKey][pieceIdx];
      } else {
        boardPos = serverPosToBoardPos(playerKey, pos);
      }
      ADMIN_LUDO_BOARD.setPiecePosition(playerKey, pieceIdx, boardPos);
    });
  });

  // Destaca peças movíveis do jogador actual
  ADMIN_LUDO_BOARD.unhighlightAll();
  if (state.phase === 1 && TEST_SELECTABLE.length > 0) {
    const curPlayer = state.players[state.turn];
    if (curPlayer) {
      const pk = COLOR_TO_PLAYER[curPlayer.color] || COLOR_TO_PLAYER[curPlayer.colour];
      if (pk) {
        ADMIN_LUDO_BOARD.highlightPieces(pk, TEST_SELECTABLE);
        // Adiciona clique nas peças destacadas
        TEST_SELECTABLE.forEach(pieceIdx => {
          const el = ADMIN_LUDO_BOARD.pieceEls[pk][pieceIdx];
          if (el) {
            el.style.cursor = 'pointer';
            el.onclick = () => testMove(pieceIdx);
          }
        });
      }
    }
  }
};

// ── Substitui highlightTestMovable() original ──────────────────────────────
window.highlightTestMovable = async function() {
  if (!TEST_STATE || !TEST_RID || !ADMIN_LUDO_BOARD) return;

  const curUid = TEST_UIDS[TEST_STATE.turn || 0];
  const d = await adminApi('/api/admin/play/movable', 'POST', { room_id: TEST_RID, uid: curUid });
  TEST_SELECTABLE = d.movable || [];

  ADMIN_LUDO_BOARD.unhighlightAll();

  const curPlayer = TEST_STATE.players[TEST_STATE.turn];
  if (!curPlayer || TEST_SELECTABLE.length === 0) return;

  const pk = COLOR_TO_PLAYER[curPlayer.color] || COLOR_TO_PLAYER[curPlayer.colour];
  if (!pk) return;

  ADMIN_LUDO_BOARD.highlightPieces(pk, TEST_SELECTABLE);

  TEST_SELECTABLE.forEach(pieceIdx => {
    const el = ADMIN_LUDO_BOARD.pieceEls[pk][pieceIdx];
    if (el) {
      el.style.cursor = 'pointer';
      el.onclick = () => testMove(pieceIdx);
    }
  });
};

// ── Converte posição do servidor para posição do COORDINATES_MAP ───────────
// O servidor usa pos: 0=base, 1-52=caminho externo, 53-58=reta final, 59=home
function serverPosToBoardPos(playerKey, pos) {
  if (pos <= 0) return ADMIN_BASE[playerKey][0]; // fallback base

  // Home completo
  if (pos >= 59) return HOME_POSITIONS[playerKey];

  // Reta final (pos 53-58 → HOME_ENTRANCE indices 0-5)
  if (pos >= 53) {
    const homeIdx = pos - 53;
    const homeEntr = HOME_ENTRANCE[playerKey];
    return homeEntr[Math.min(homeIdx, homeEntr.length - 1)];
  }

  // Caminho externo (pos 1-52)
  // Cada jogador tem um offset de saída diferente
  const offsets = { P1:0, P2:26, P3:39, P4:13 };
  const offset = offsets[playerKey];
  const pathPos = ((pos - 1 + offset) % 52);
  return pathPos; // COORDINATES_MAP tem estas posições directamente (0-51)
}

// ── Fallback: cancela o loop de render do canvas (se estava activo) ─────────
window.TEST_RENDER_FRAME && cancelAnimationFrame(window.TEST_RENDER_FRAME);
window.startTestRenderLoop = function() { /* não é necessário com divs */ };

console.log('[LudoKz Admin] admin_board_patch.js carregado ✓');
