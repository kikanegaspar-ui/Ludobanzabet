/**
 * ludo_board_v2.js — LudoKz v5 (UNIFICADO)
 * Contém: constantes, sons, LudoBoard canvas completo, dado 3D, lógica local e game_patch.
 * Substitui ludo_board_v2.js + game_patch.js em produção.
 */

// ══════════════════════════════════════════════════════════════════
//  CONSTANTES DO TABULEIRO
// ══════════════════════════════════════════════════════════════════
const COLOUR_NAME = { red:'Vermelho', green:'Verde', blue:'Azul', yellow:'Amarelo' };
const COLOUR_CSS  = { red:'#ff0002', green:'#049645', blue:'#1295e7', yellow:'#ffde15' };

// Mapeamento de posições lógicas para coordenadas na grelha 15×15
const LUDO_COORD_MAP = {
  // Caminho principal (0–51)
  0:[6,13],1:[6,12],2:[6,11],3:[6,10],4:[6,9],5:[5,8],6:[4,8],7:[3,8],8:[2,8],9:[1,8],10:[0,8],
  11:[0,7],12:[0,6],13:[1,6],14:[2,6],15:[3,6],16:[4,6],17:[5,6],18:[6,5],19:[6,4],20:[6,3],
  21:[6,2],22:[6,1],23:[6,0],24:[7,0],25:[8,0],26:[8,1],27:[8,2],28:[8,3],29:[8,4],30:[8,5],
  31:[9,6],32:[10,6],33:[11,6],34:[12,6],35:[13,6],36:[14,6],37:[14,7],38:[14,8],39:[13,8],
  40:[12,8],41:[11,8],42:[10,8],43:[9,8],44:[8,9],45:[8,10],46:[8,11],47:[8,12],48:[8,13],
  49:[8,14],50:[7,14],51:[6,14],
  // Corredores de casa
  100:[7,13],101:[7,12],102:[7,11],103:[7,10],104:[7,9],105:[7,7],
  200:[7,1], 201:[7,2], 202:[7,3], 203:[7,4], 204:[7,5], 205:[7,7],
  300:[13,7],301:[12,7],302:[11,7],303:[10,7],304:[9,7], 305:[7,7],
  400:[1,7], 401:[2,7], 402:[3,7], 403:[4,7], 404:[5,7], 405:[7,7],
  // Bases (quadrados coloridos)
  500:[1.5,10.58],501:[3.57,10.58],502:[1.5,12.43],503:[3.57,12.43],
  600:[10.5,1.58], 601:[12.54,1.58],602:[10.5,3.45], 603:[12.54,3.45],
  700:[10.5,10.58],701:[12.57,10.58],702:[10.5,12.43],703:[12.57,12.43],
  800:[1.5,1.58], 801:[3.57,1.58], 802:[1.5,3.45],  803:[3.55,3.45]
};

const SAFE_POSITIONS = [0,8,13,21,26,34,39,47];
const TURN_ORDER     = [0,2,1,3];
const PLAYERS_LIST   = ['P1','P2','P3','P4'];

const BASE_POSITIONS = {
  P1:[500,501,502,503], P2:[600,601,602,603],
  P3:[700,701,702,703], P4:[800,801,802,803]
};
const START_POSITIONS  = { P1:0,  P2:26, P3:39, P4:13 };
const HOME_ENTRANCE    = {
  P1:[100,101,102,103,104], P2:[200,201,202,203,204],
  P3:[300,301,302,303,304], P4:[400,401,402,403,404]
};
const HOME_POSITIONS   = { P1:105, P2:205, P3:305, P4:405 };
const TURNING_POINTS   = { P1:50,  P2:24,  P3:37,  P4:11  };

// Cores dos jogadores
const PLAYER_COLORS = {
  P1: { fill:'#1295e7', shadow:'rgba(18,149,231,0.6)', home:'rgba(18,149,231,0.15)'  },
  P2: { fill:'#049645', shadow:'rgba(4,150,69,0.6)',   home:'rgba(4,150,69,0.15)'    },
  P3: { fill:'#ff0002', shadow:'rgba(255,0,2,0.6)',    home:'rgba(255,0,2,0.15)'     },
  P4: { fill:'#ffde15', shadow:'rgba(255,222,21,0.6)', home:'rgba(255,222,21,0.15)'  }
};

// Mapeamento cor backend → jogador
const COLOUR_TO_PLAYER = { blue:'P1', green:'P2', red:'P3', yellow:'P4' };
const PLAYER_TO_COLOUR = { P1:'blue', P2:'green', P3:'red', P4:'yellow' };

// ══════════════════════════════════════════════════════════════════
//  SONS
// ══════════════════════════════════════════════════════════════════
const SFX = (() => {
  const cache = {};
  function play(name, vol) {
    vol = vol === undefined ? 1.0 : vol;
    try {
      if (!cache[name]) cache[name] = new Audio('/static/' + name + '.mp3');
      const s = cache[name].cloneNode();
      s.volume = Math.min(1, Math.max(0, vol));
      s.play().catch(function(){});
    } catch(e) {}
  }
  return {
    dice:    function() { play('sfx_dice_roll', 0.8); },
    move:    function() { play('sfx_token_move', 0.9); },
    capture: function() { play('sfx_token_killed', 1.0); },
    finish:  function() { play('sfx_in_home', 1.0); },
    win:     function() { play('sfx_win', 1.0); },
    tick:    function() { play('sfx_click', 0.3); },
    myTurn:  function() { play('sfx_click', 0.5); }
  };
})();

// Alias para compatibilidade com game_patch.js
window.SFX = SFX;

// ══════════════════════════════════════════════════════════════════
//  CLASSE LudoBoard — CANVAS COMPLETO
// ══════════════════════════════════════════════════════════════════
class LudoBoard {
  constructor(canvas, size) {
    this.canvas  = canvas;
    this.ctx     = canvas.getContext('2d');
    this.size    = size;
    this.cell    = size / 15;
    this.pieces  = {};          // key: "colour_tokenId" → { sx, sy, scale, opacity, animating }
    this._diceVal = 0;
    this._diceCb  = null;
    this._diceAnim = 0;
    this._buildBoardImage();
  }

  // ── Converte coordenada lógica (x,y na grelha) → pixel no canvas ──
  _toScreen(gx, gy) {
    const c = this.cell;
    return { sx: gx * c + c * 0.5, sy: gy * c + c * 0.5 };
  }

  // ── Converte posição lógica do jogo → pixel ──
  _posToScreen(pos) {
    const coord = LUDO_COORD_MAP[pos];
    if (!coord) return { sx: this.size / 2, sy: this.size / 2 };
    return this._toScreen(coord[0], coord[1]);
  }

  // ── Constrói imagem do tabuleiro offscreen ──
  _buildBoardImage() {
    const off = document.createElement('canvas');
    off.width = off.height = this.size;
    const ctx = off.getContext('2d');
    this._drawBoardToCtx(ctx);
    this._boardImg = off;
  }

  // ── Desenha tabuleiro no contexto dado ──
  _drawBoardToCtx(ctx) {
    const c  = this.cell;
    const sz = this.size;

    // Fundo
    ctx.fillStyle = '#f0ece0';
    ctx.fillRect(0, 0, sz, sz);

    // Grade de células 15×15
    const BOARD_LAYOUT = this._getBoardLayout();

    for (let row = 0; row < 15; row++) {
      for (let col = 0; col < 15; col++) {
        const cell  = BOARD_LAYOUT[row][col];
        const x     = col * c;
        const y     = row * c;

        // Fundo da célula
        ctx.fillStyle = cell.bg || '#ffffff';
        ctx.fillRect(x, y, c, c);

        // Borda
        ctx.strokeStyle = 'rgba(0,0,0,0.12)';
        ctx.lineWidth   = 0.5;
        ctx.strokeRect(x + 0.25, y + 0.25, c - 0.5, c - 0.5);

        // Estrela em posições seguras
        if (cell.star) {
          ctx.save();
          ctx.translate(x + c / 2, y + c / 2);
          this._drawStar(ctx, 0, 0, c * 0.38, c * 0.19, 5);
          ctx.fillStyle = 'rgba(255,255,255,0.85)';
          ctx.fill();
          ctx.restore();
        }

        // Seta nos corredores de casa
        if (cell.arrow) {
          this._drawArrow(ctx, x + c / 2, y + c / 2, c * 0.32, cell.arrow, cell.arrowColor || '#aaa');
        }
      }
    }

    // Quadrados das bases (cantos)
    this._drawBase(ctx, 0,    0,    6, 6, '#1295e7', 'P1');  // Azul  — canto inferior-esq
    this._drawBase(ctx, 9,    0,    6, 6, '#049645', 'P2');  // Verde — canto superior-dir
    this._drawBase(ctx, 9,    9,    6, 6, '#ff0002', 'P3');  // Verm  — canto inferior-dir
    this._drawBase(ctx, 0,    9,    6, 6, '#ffde15', 'P4');  // Amar  — canto superior-esq

    // Centro (triângulos coloridos)
    this._drawCenter(ctx);
  }

  // ── Quadrado de base com casas ──
  _drawBase(ctx, col, row, w, h, color, player) {
    const c   = this.cell;
    const x   = col * c;
    const y   = row * c;
    const pad = c * 0.18;

    // Fundo colorido
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w * c, h * c);

    // Placa branca interior
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    this._roundRect(ctx, x + pad, y + pad, w * c - pad * 2, h * c - pad * 2, c * 0.3);
    ctx.fill();

    // 4 círculos de peças
    const positions = BASE_POSITIONS[player];
    const offsets   = [
      [1.5, 1.5], [3.5, 1.5],
      [1.5, 3.5], [3.5, 3.5]
    ];
    offsets.forEach((off, i) => {
      const cx = (col + off[0]) * c;
      const cy = (row + off[1]) * c;
      const r  = c * 0.42;

      // Sombra
      ctx.beginPath();
      ctx.arc(cx, cy + 2, r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,0,0,0.15)';
      ctx.fill();

      // Círculo base
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth   = c * 0.06;
      ctx.stroke();
    });
  }

  // ── Centro com triângulos ──
  _drawCenter(ctx) {
    const c  = this.cell;
    const cx = 7.5 * c;
    const cy = 7.5 * c;
    const r  = 2.5 * c;

    const triangles = [
      { points: [[cx, cy], [cx - r, cy - r], [cx + r, cy - r]], color: '#049645' }, // cima  = verde
      { points: [[cx, cy], [cx + r, cy - r], [cx + r, cy + r]], color: '#ff0002' }, // dir   = verm
      { points: [[cx, cy], [cx + r, cy + r], [cx - r, cy + r]], color: '#ffde15' }, // baixo = amar
      { points: [[cx, cy], [cx - r, cy + r], [cx - r, cy - r]], color: '#1295e7' }, // esq   = azul
    ];

    triangles.forEach(t => {
      ctx.beginPath();
      ctx.moveTo(t.points[0][0], t.points[0][1]);
      ctx.lineTo(t.points[1][0], t.points[1][1]);
      ctx.lineTo(t.points[2][0], t.points[2][1]);
      ctx.closePath();
      ctx.fillStyle = t.color;
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.3)';
      ctx.lineWidth   = 1;
      ctx.stroke();
    });

    // Círculo dourado central
    ctx.beginPath();
    ctx.arc(cx, cy, c * 0.6, 0, Math.PI * 2);
    const g = ctx.createRadialGradient(cx, cy - c * 0.15, 0, cx, cy, c * 0.6);
    g.addColorStop(0, '#fff8e1');
    g.addColorStop(1, '#f5c518');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth   = c * 0.06;
    ctx.stroke();

    // Estrela central
    ctx.save();
    ctx.translate(cx, cy);
    this._drawStar(ctx, 0, 0, c * 0.38, c * 0.18, 6);
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fill();
    ctx.restore();
  }

  // ── Desenha estrela ──
  _drawStar(ctx, cx, cy, outerR, innerR, points) {
    ctx.beginPath();
    for (let i = 0; i < points * 2; i++) {
      const r     = i % 2 === 0 ? outerR : innerR;
      const angle = (i * Math.PI) / points - Math.PI / 2;
      if (i === 0) ctx.moveTo(cx + r * Math.cos(angle), cy + r * Math.sin(angle));
      else ctx.lineTo(cx + r * Math.cos(angle), cy + r * Math.sin(angle));
    }
    ctx.closePath();
  }

  // ── Seta de direção ──
  _drawArrow(ctx, cx, cy, size, dir, color) {
    ctx.save();
    ctx.translate(cx, cy);
    const angles = { up: -Math.PI/2, down: Math.PI/2, left: Math.PI, right: 0 };
    ctx.rotate(angles[dir] || 0);
    ctx.beginPath();
    ctx.moveTo(size, 0);
    ctx.lineTo(-size * 0.6, -size * 0.6);
    ctx.lineTo(-size * 0.6,  size * 0.6);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.55;
    ctx.fill();
    ctx.restore();
  }

  // ── roundRect helper ──
  _roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  // ── Layout do tabuleiro 15×15 ──
  _getBoardLayout() {
    const W = '#ffffff';
    const E = '#f0ece0';  // exterior (bases)
    const B = '#1295e7';  // azul
    const G = '#049645';  // verde
    const R = '#ff0002';  // vermelho
    const Y = '#ffde15';  // amarelo
    const LB = '#b3d9f5'; // azul claro (corredor)
    const LG = '#b3f5c8'; // verde claro
    const LR = '#f5b3b3'; // vermelho claro
    const LY = '#f5eab3'; // amarelo claro

    // Simplificado: constrói grelha com cores
    const grid = [];
    for (let r = 0; r < 15; r++) {
      grid[r] = [];
      for (let c = 0; c < 15; c++) {
        grid[r][c] = { bg: W };
      }
    }

    // Regiões das bases (cantos 6×6)
    for (let r = 0; r < 6;  r++) for (let c = 0; c < 6;  c++) grid[r][c].bg = E;   // sup-esq (P4 amarelo)
    for (let r = 0; r < 6;  r++) for (let c = 9; c < 15; c++) grid[r][c].bg = E;   // sup-dir (P2 verde)
    for (let r = 9; r < 15; r++) for (let c = 0; c < 6;  c++) grid[r][c].bg = E;   // inf-esq (P1 azul)
    for (let r = 9; r < 15; r++) for (let c = 9; c < 15; c++) grid[r][c].bg = E;   // inf-dir (P3 vermelho)

    // Centro (será desenhado por _drawCenter)
    for (let r = 6; r < 9; r++) for (let c = 6; c < 9; c++) grid[r][c].bg = '#fafafa';

    // Corredores de casa
    // Azul P1 — coluna 7, linhas 9–13 (baixo)
    for (let r = 9; r < 14; r++) grid[r][7].bg = LB;
    // Verde P2 — coluna 7, linhas 1–5 (cima)
    for (let r = 1; r < 6;  r++) grid[r][7].bg = LG;
    // Vermelho P3 — linha 7, colunas 9–13 (dir)
    for (let c = 9; c < 14; c++) grid[7][c].bg = LR;
    // Amarelo P4 — linha 7, colunas 1–5 (esq)
    for (let c = 1; c < 6;  c++) grid[7][c].bg = LY;

    // Posições seguras (estrela)
    const safeCells = [[8,6],[6,2],[6,12],[2,8],[12,8],[8,13],[6,8],[8,1]];
    // Usando SAFE_POSITIONS do mapa de coordenadas
    SAFE_POSITIONS.forEach(pos => {
      const coord = LUDO_COORD_MAP[pos];
      if (coord) {
        grid[coord[1]][coord[0]].star = true;
        grid[coord[1]][coord[0]].bg   = '#fff9e6';
      }
    });

    // Posições de início (coloridas)
    const starts = [
      { pos: 0,  color: B }, { pos: 26, color: G },
      { pos: 39, color: R }, { pos: 13, color: Y }
    ];
    starts.forEach(s => {
      const coord = LUDO_COORD_MAP[s.pos];
      if (coord) { grid[coord[1]][coord[0]].bg = s.color; grid[coord[1]][coord[0]].start = true; }
    });

    return grid;
  }

  // ══════════════════════════════════════════════════════
  //  RENDER
  // ══════════════════════════════════════════════════════

  drawBoard() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.size, this.size);
    ctx.drawImage(this._boardImg, 0, 0);
  }

  drawPiece(sx, sy, colour, label, isSelectable, pulseT, scale, opacity) {
    const ctx  = this.ctx;
    const c    = this.cell;
    const r    = c * 0.36 * (scale || 1);
    const css  = COLOUR_CSS[colour] || '#888';

    ctx.save();
    ctx.globalAlpha = opacity !== undefined ? opacity : 1;
    ctx.translate(sx, sy);

    // Sombra
    ctx.shadowColor   = css;
    ctx.shadowBlur    = isSelectable ? 14 + Math.sin(pulseT || 0) * 6 : 6;
    ctx.shadowOffsetY = 2;

    // Corpo
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    const g = ctx.createRadialGradient(-r * 0.3, -r * 0.3, 0, 0, 0, r);
    g.addColorStop(0, this._lighten(css, 60));
    g.addColorStop(1, css);
    ctx.fillStyle = g;
    ctx.fill();

    // Anel de seleção pulsante
    if (isSelectable) {
      const pulse = 0.55 + 0.45 * Math.sin((pulseT || 0) * 2);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth   = c * 0.07 * pulse;
      ctx.globalAlpha = pulse * (opacity !== undefined ? opacity : 1);
      ctx.stroke();
    }

    // Brilho superior
    ctx.shadowBlur    = 0;
    ctx.shadowOffsetY = 0;
    ctx.beginPath();
    ctx.arc(-r * 0.22, -r * 0.28, r * 0.42, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fill();

    // Número
    ctx.shadowBlur  = 0;
    ctx.globalAlpha = opacity !== undefined ? opacity : 1;
    ctx.fillStyle   = '#fff';
    ctx.font        = `bold ${Math.round(r * 0.95)}px "Plus Jakarta Sans", sans-serif`;
    ctx.textAlign   = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, 0, 1);

    ctx.restore();
  }

  _lighten(hex, amount) {
    const n  = parseInt(hex.replace('#', ''), 16);
    const r  = Math.min(255, (n >> 16) + amount);
    const g  = Math.min(255, ((n >> 8) & 0xff) + amount);
    const b  = Math.min(255, (n & 0xff) + amount);
    return `rgb(${r},${g},${b})`;
  }

  // ══════════════════════════════════════════════════════
  //  ANIMAÇÕES
  // ══════════════════════════════════════════════════════

  animateMove(colour, tokenId, fromX, fromY, toX, toY, isLeaving, cb) {
    const key  = colour + '_' + tokenId;
    const from = this._posFromXY(colour, fromX, fromY, isLeaving);
    const to   = this._posFromXY(colour, toX,   toY,   false);

    if (!this.pieces[key]) this.pieces[key] = { sx: from.sx, sy: from.sy, scale: 1, opacity: 1, animating: false };
    const piece = this.pieces[key];
    piece.animating = true;
    piece.sx        = from.sx;
    piece.sy        = from.sy;

    const dur   = 380;
    const start = performance.now();
    SFX.move();

    const step = (now) => {
      const t = Math.min((now - start) / dur, 1);
      const e = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; // ease-in-out
      piece.sx = from.sx + (to.sx - from.sx) * e;
      piece.sy = from.sy + (to.sy - from.sy) * e;
      if (t < 1) {
        requestAnimationFrame(step);
      } else {
        piece.sx        = to.sx;
        piece.sy        = to.sy;
        piece.animating = false;
        if (cb) cb();
      }
    };
    requestAnimationFrame(step);
  }

  animateCaptureAt(colour, tokenId) {
    const key   = colour + '_' + tokenId;
    const piece = this.pieces[key];
    if (!piece) return;
    SFX.capture();
    piece.animating = true;
    const dur   = 320;
    const start = performance.now();
    const origSx = piece.sx;
    const origSy = piece.sy;

    const step = (now) => {
      const t = Math.min((now - start) / dur, 1);
      piece.scale   = 1 + Math.sin(t * Math.PI) * 0.6;
      piece.opacity = t < 0.5 ? 1 : 1 - (t - 0.5) * 2;
      if (t < 1) {
        requestAnimationFrame(step);
      } else {
        piece.scale     = 1;
        piece.opacity   = 1;
        piece.animating = false;
      }
    };
    requestAnimationFrame(step);
  }

  animateDice(value, cb) {
    SFX.dice();
    this._diceVal  = value;
    this._diceAnim = 12; // frames de rolamento
    const faces    = ['⚀','⚁','⚂','⚃','⚄','⚅'];
    const faceEl   = document.getElementById('dfc');
    const dnmEl    = document.getElementById('dnm');

    let frames = 0;
    const roll = () => {
      if (frames < 10) {
        if (faceEl) faceEl.textContent = faces[Math.floor(Math.random() * 6)];
        frames++;
        setTimeout(roll, 80);
      } else {
        if (faceEl) faceEl.textContent = faces[value - 1];
        if (dnmEl)  dnmEl.textContent  = value;
        if (cb)     cb();
      }
    };
    roll();
  }

  // Converte token.x, token.y do backend → pixel no canvas
  _posFromXY(colour, gx, gy, isLocked) {
    // Backend envia coordenadas de grelha directamente
    return this._toScreen(gx, gy);
  }

  destroy() {
    // Cleanup
  }
}

// Expõe a classe globalmente
window.LudoBoard = LudoBoard;

// ══════════════════════════════════════════════════════════════════
//  INICIALIZAÇÃO DO CANVAS
// ══════════════════════════════════════════════════════════════════
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

// ══════════════════════════════════════════════════════════════════
//  LOOP DE RENDER
// ══════════════════════════════════════════════════════════════════
window.drawGameState = function(state) {
  if (!window.BOARD || !state || !state.players) return;

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

// ══════════════════════════════════════════════════════════════════
//  RENDER STATE — ATUALIZA UI
// ══════════════════════════════════════════════════════════════════
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
  if (gbv && typeof fmt === 'function') gbv.textContent = fmt(state.bet) + ' KZ';

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

  // Chat online count
  var co = document.getElementById('chat-online');
  if (co) co.textContent = state.players.length + ' online';

  // Dado visual (emoji + número)
  var faces = ['⚀','⚁','⚂','⚃','⚄','⚅'];
  if (state.dice > 0) {
    var dfc = document.getElementById('dfc');
    var dnm = document.getElementById('dnm');
    if (dfc && !dfc.classList.contains('rolling')) dfc.textContent = faces[state.dice - 1];
    if (dnm) dnm.textContent = state.dice;
  }

  window.SELECTABLE_PIECES = [];
};

// ══════════════════════════════════════════════════════════════════
//  HIGHLIGHT DE PEÇAS
// ══════════════════════════════════════════════════════════════════
window.highlightPcs = function(mv) {
  window.CUR_MV            = mv || [];
  window.SELECTABLE_PIECES = mv || [];
};

// ══════════════════════════════════════════════════════════════════
//  EVENTOS DE JOGO (SSE)
// ══════════════════════════════════════════════════════════════════
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

  SFX.myTurn();
};

window.onGameUpdate = function(state) {
  if (window.PREV_STATE && window.BOARD) {
    window._triggerMoveAnimations(window.PREV_STATE, state);
  }
  window.PREV_STATE = window.CUR_STATE;
  window.CUR_STATE  = state;
  window.renderState(state);
};

// ══════════════════════════════════════════════════════════════════
//  ANIMAÇÕES DE MOVIMENTO (diff entre estados)
// ══════════════════════════════════════════════════════════════════
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

      if (token.x === prevToken.x && token.y === prevToken.y &&
          token.is_locked === prevToken.is_locked &&
          token.has_reached_home === prevToken.has_reached_home) continue;

      if (token.is_locked && !prevToken.is_locked) {
        window.BOARD.animateCaptureAt(colour, tid);
        continue;
      }

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

// ══════════════════════════════════════════════════════════════════
//  AÇÕES DO JOGO
// ══════════════════════════════════════════════════════════════════
window.doRoll = async function() {
  if (!window.RID) return;
  var rb = document.getElementById('rb');
  if (rb) rb.disabled = true;
  var faceEl = document.getElementById('dfc');
  if (faceEl) faceEl.classList.add('rolling');

  var d;
  try {
    var r = await fetch('/api/game/roll', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ room_id: window.RID }),
      credentials: 'same-origin'
    });
    d = await r.json();
  } catch(e) {
    if (faceEl) faceEl.classList.remove('rolling');
    if (rb) rb.disabled = false;
    return;
  }

  if (faceEl) faceEl.classList.remove('rolling');
  if (d.error) { if (typeof toast === 'function') toast('❌ ' + d.error, 'ter'); return; }

  if (window.BOARD) {
    window.BOARD.animateDice(d.dice, async function() {
      window.renderState(d);
      try {
        var mv = await (typeof api === 'function'
          ? api('/api/game/movable', 'POST', { room_id: window.RID })
          : fetch('/api/game/movable', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({room_id:window.RID}), credentials:'same-origin' }).then(function(r){ return r.json(); })
        );
        if (mv.movable && mv.movable.length) window.highlightPcs(mv.movable);
      } catch(e) {}
    });
  } else {
    var faces = ['⚀','⚁','⚂','⚃','⚄','⚅'];
    if (faceEl) faceEl.textContent = faces[d.dice - 1];
    var dnm = document.getElementById('dnm');
    if (dnm) dnm.textContent = d.dice;
    window.renderState(d);
  }
};

window.movePc = async function(idx) {
  if (!window.RID) return;
  window.PREV_STATE = window.CUR_STATE ? JSON.parse(JSON.stringify(window.CUR_STATE)) : null;

  var d;
  try {
    var r = await fetch('/api/game/move', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ room_id: window.RID, piece: idx }),
      credentials: 'same-origin'
    });
    d = await r.json();
  } catch(e) { return; }

  if (d.error) {
    if (typeof toast === 'function') toast('❌ ' + d.error, 'ter');
    return;
  }

  if (window.PREV_STATE && window.BOARD)
    window._triggerMoveAnimations(window.PREV_STATE, d);

  window.PREV_STATE = window.CUR_STATE;
  window.renderState(d);
};

window.leaveGame = async function() {
  if (!confirm('Abandonar? Perdes a aposta.')) return;
  if (window.RID) {
    try {
      await fetch('/api/game/leave', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ room_id: window.RID }), credentials: 'same-origin'
      });
    } catch(e) {}
  }
  window.RID = null;
  if (typeof pg === 'function') pg('home');
};

// ══════════════════════════════════════════════════════════════════
//  FIM DE JOGO
// ══════════════════════════════════════════════════════════════════
window.onGameOver = function(d) {
  if (d.won) SFX.win();
  if (d.won && typeof coinRain === 'function')  coinRain();
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

// ══════════════════════════════════════════════════════════════════
//  CLIQUE NO CANVAS
// ══════════════════════════════════════════════════════════════════
window.onCanvasClick = function(e) {
  if (!window.CUR_STATE || !window.BOARD) return;
  if (!_isMeTurn(window.CUR_STATE)) return;
  if (window.CUR_STATE.phase !== 1) return;

  var rect   = e.target.getBoundingClientRect();
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

    if (dist <= cs * 0.45) {
      clicked = true;
      SFX.tick();
      window.movePc(ti);
    }
  }
};

// ══════════════════════════════════════════════════════════════════
//  HELPERS
// ══════════════════════════════════════════════════════════════════
function _isMeTurn(state) {
  if (!state || !state.players || !window.U) return false;
  var p = state.players[state.turn];
  return p && p.user_id === window.U.id && state.phase === 0;
}

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

// Indicador de turno — pulsa o botão dado
setInterval(function() {
  var rb = document.getElementById('rb');
  if (!rb || !window.CUR_STATE) return;
  if (_isMeTurn(window.CUR_STATE) && !window.CUR_STATE.over) rb.classList.add('my-turn-glow');
  else rb.classList.remove('my-turn-glow');
}, 500);

console.log('[LudoKz] ludo_board_v2.js UNIFICADO v5 carregado ✓');
