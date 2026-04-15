/**
 * ludo_board_v2.js — LudoKz v6 (CORRIGIDO)
 * FIXES:
 *  - Tabuleiro agora renderiza correctamente (não fica preto)
 *  - Bases nos cantos correctos (P1=azul inf-esq, P2=verde sup-dir, P3=verm inf-dir, P4=amar sup-esq)
 *  - _posFromXY usa LUDO_COORD_MAP para converter posição lógica → pixel
 *  - drawGameState usa token.pos (posição lógica) em vez de token.x/token.y como grelha
 *  - Fallback seguro para tokens sem pos definido
 */

// ══════════════════════════════════════════════════════════════════
//  CONSTANTES DO TABULEIRO
// ══════════════════════════════════════════════════════════════════
const COLOUR_NAME = { red:'Vermelho', green:'Verde', blue:'Azul', yellow:'Amarelo' };
const COLOUR_CSS  = { red:'#ff0002', green:'#049645', blue:'#1295e7', yellow:'#ffde15' };

// Mapeamento posição lógica → [col, row] na grelha 15×15
// col = eixo X (horizontal), row = eixo Y (vertical)
const LUDO_COORD_MAP = {
  // Caminho principal (0–51) — sentido horário a partir do inicio azul
  0:[6,13], 1:[6,12], 2:[6,11], 3:[6,10], 4:[6,9],
  5:[5,8],  6:[4,8],  7:[3,8],  8:[2,8],  9:[1,8],  10:[0,8],
  11:[0,7], 12:[0,6],
  13:[1,6], 14:[2,6], 15:[3,6], 16:[4,6], 17:[5,6],
  18:[6,5], 19:[6,4], 20:[6,3], 21:[6,2], 22:[6,1], 23:[6,0],
  24:[7,0], 25:[8,0],
  26:[8,1], 27:[8,2], 28:[8,3], 29:[8,4], 30:[8,5],
  31:[9,6], 32:[10,6],33:[11,6],34:[12,6],35:[13,6],36:[14,6],
  37:[14,7],38:[14,8],
  39:[13,8],40:[12,8],41:[11,8],42:[10,8],43:[9,8],
  44:[8,9], 45:[8,10],46:[8,11],47:[8,12],48:[8,13],49:[8,14],
  50:[7,14],51:[6,14],

  // Corredores de casa (100=P1/azul, 200=P2/verde, 300=P3/verm, 400=P4/amar)
  100:[7,13],101:[7,12],102:[7,11],103:[7,10],104:[7,9], 105:[7,7],
  200:[7,1], 201:[7,2], 202:[7,3], 203:[7,4], 204:[7,5], 205:[7,7],
  300:[13,7],301:[12,7],302:[11,7],303:[10,7],304:[9,7], 305:[7,7],
  400:[1,7], 401:[2,7], 402:[3,7], 403:[4,7], 404:[5,7], 405:[7,7],

  // Bases — posições iniciais (peças em casa)
  // P1 azul — canto inferior-esquerdo (cols 0-5, rows 9-14)
  500:[1.5,10.5], 501:[3.5,10.5], 502:[1.5,12.5], 503:[3.5,12.5],
  // P2 verde — canto superior-direito (cols 9-14, rows 0-5)
  600:[10.5,1.5], 601:[12.5,1.5], 602:[10.5,3.5], 603:[12.5,3.5],
  // P3 vermelho — canto inferior-direito (cols 9-14, rows 9-14)
  700:[10.5,10.5],701:[12.5,10.5],702:[10.5,12.5],703:[12.5,12.5],
  // P4 amarelo — canto superior-esquerdo (cols 0-5, rows 0-5)
  800:[1.5,1.5],  801:[3.5,1.5],  802:[1.5,3.5],  803:[3.5,3.5]
};

const SAFE_POSITIONS  = [0,8,13,21,26,34,39,47];
const PLAYERS_LIST    = ['P1','P2','P3','P4'];

const BASE_POSITIONS  = {
  P1:[500,501,502,503], P2:[600,601,602,603],
  P3:[700,701,702,703], P4:[800,801,802,803]
};
const START_POSITIONS = { P1:0,  P2:26, P3:39, P4:13 };
const HOME_POSITIONS  = { P1:105, P2:205, P3:305, P4:405 };
const TURNING_POINTS  = { P1:50,  P2:24,  P3:37,  P4:11  };

const PLAYER_COLORS = {
  P1:{ fill:'#1295e7', home:'rgba(18,149,231,0.15)'  },
  P2:{ fill:'#049645', home:'rgba(4,150,69,0.15)'    },
  P3:{ fill:'#ff0002', home:'rgba(255,0,2,0.15)'     },
  P4:{ fill:'#ffde15', home:'rgba(255,222,21,0.15)'  }
};

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
window.SFX = SFX;

// ══════════════════════════════════════════════════════════════════
//  CLASSE LudoBoard
// ══════════════════════════════════════════════════════════════════
class LudoBoard {
  constructor(canvas, size) {
    this.canvas = canvas;
    this.ctx    = canvas.getContext('2d');
    this.size   = size;
    this.cell   = size / 15;
    this.pieces = {};
    this._buildBoardImage();
  }

  // Coordenada lógica (col, row) → pixel central
  _toScreen(col, row) {
    const c = this.cell;
    return { sx: col * c + c * 0.5, sy: row * c + c * 0.5 };
  }

  // Posição lógica do jogo → pixel
  // Suporta: pos numérico (0-51, 100-405, 500-803)
  // Também suporta token com campos x,y (coordenadas de grelha) ou pos
  _posToScreen(pos) {
    const coord = LUDO_COORD_MAP[pos];
    if (coord) return this._toScreen(coord[0], coord[1]);
    return { sx: this.size / 2, sy: this.size / 2 };
  }

  // Obtém pixel a partir de token do backend
  // Backend pode enviar: token.pos (int lógico) OU token.x,token.y (grelha)
  _tokenToScreen(token) {
    // Preferência: campo pos lógico
    if (token.pos !== undefined && LUDO_COORD_MAP[token.pos] !== undefined) {
      return this._posToScreen(token.pos);
    }
    // Se is_locked/em base: usa base position por id
    if (token.is_locked || token.locked) {
      // fallback — centro da base do jogador (será corrigido por drawGameState)
      return { sx: this.size / 2, sy: this.size / 2 };
    }
    // token.x, token.y como índices de grelha directamente
    if (token.x !== undefined && token.y !== undefined) {
      return this._toScreen(token.x, token.y);
    }
    return { sx: this.size / 2, sy: this.size / 2 };
  }

  // ── Constrói imagem offscreen do tabuleiro ──
  _buildBoardImage() {
    const off = document.createElement('canvas');
    off.width = off.height = this.size;
    const ctx = off.getContext('2d');
    this._drawBoardToCtx(ctx);
    this._boardImg = off;
  }

  _drawBoardToCtx(ctx) {
    const c  = this.cell;
    const sz = this.size;

    // Fundo geral
    ctx.fillStyle = '#e8e0c8';
    ctx.fillRect(0, 0, sz, sz);

    // ── Cantos das bases (6×6 células) ──
    // P1 azul — inf-esq: cols 0-5, rows 9-14
    this._drawBaseCorner(ctx, 0, 9,  '#1295e7', 'P1');
    // P2 verde — sup-dir: cols 9-14, rows 0-5
    this._drawBaseCorner(ctx, 9, 0,  '#049645', 'P2');
    // P3 vermelho — inf-dir: cols 9-14, rows 9-14
    this._drawBaseCorner(ctx, 9, 9,  '#ff0002', 'P3');
    // P4 amarelo — sup-esq: cols 0-5, rows 0-5
    this._drawBaseCorner(ctx, 0, 0,  '#ffde15', 'P4');

    // ── Caminho (células brancas) ──
    this._drawPathCells(ctx);

    // ── Corredores coloridos ──
    // P1 azul — col 7, rows 9-13
    for (let r = 9; r <= 13; r++) this._fillCell(ctx, 7, r, '#9fd4f5');
    // P2 verde — col 7, rows 1-5
    for (let r = 1; r <= 5;  r++) this._fillCell(ctx, 7, r, '#9fe8b8');
    // P3 verm — linha 7, cols 9-13
    for (let c2 = 9; c2 <= 13; c2++) this._fillCell(ctx, c2, 7, '#f5a0a0');
    // P4 amar — linha 7, cols 1-5
    for (let c2 = 1; c2 <= 5;  c2++) this._fillCell(ctx, c2, 7, '#f5e68a');

    // ── Células de início coloridas ──
    this._fillCell(ctx, 6, 13, '#1295e7'); // P1 start pos=0
    this._fillCell(ctx, 8, 1,  '#049645'); // P2 start pos=26
    this._fillCell(ctx, 13, 8, '#ff0002'); // P3 start pos=39
    this._fillCell(ctx, 1, 6,  '#ffde15'); // P4 start pos=13

    // ── Estrelas nas posições seguras ──
    SAFE_POSITIONS.forEach(pos => {
      const coord = LUDO_COORD_MAP[pos];
      if (!coord) return;
      this._fillCell(ctx, coord[0], coord[1], '#fffde7');
      this._drawStarAt(ctx, coord[0], coord[1]);
    });

    // ── Grelha (bordas das células) ──
    this._drawGrid(ctx);

    // ── Centro com triângulos ──
    this._drawCenter(ctx);
  }

  _fillCell(ctx, col, row, color) {
    const c = this.cell;
    ctx.fillStyle = color;
    ctx.fillRect(col * c, row * c, c, c);
  }

  _drawPathCells(ctx) {
    const c  = this.cell;
    // Todas as células do caminho principal (brancas)
    for (let pos = 0; pos <= 51; pos++) {
      const coord = LUDO_COORD_MAP[pos];
      if (!coord) continue;
      const col = Math.floor(coord[0]);
      const row = Math.floor(coord[1]);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(col * c, row * c, c, c);
    }
  }

  _drawGrid(ctx) {
    const c  = this.cell;
    const sz = this.size;
    ctx.strokeStyle = 'rgba(0,0,0,0.13)';
    ctx.lineWidth   = 0.5;

    // Linhas verticais do caminho
    const pathCols = [6,7,8];
    const pathRows = [6,7,8];

    // Desenha grade apenas nas faixas do caminho + corredores
    // Linha 7 completa (horizontal)
    for (let col = 0; col < 15; col++) {
      ctx.strokeRect(col * c + 0.25, 7 * c + 0.25, c - 0.5, c - 0.5);
    }
    // Col 7 completa (vertical)
    for (let row = 0; row < 15; row++) {
      ctx.strokeRect(7 * c + 0.25, row * c + 0.25, c - 0.5, c - 0.5);
    }
    // Faixa do caminho cols 6-8
    for (let col = 6; col <= 8; col++) {
      for (let row = 0; row < 15; row++) {
        ctx.strokeRect(col * c + 0.25, row * c + 0.25, c - 0.5, c - 0.5);
      }
    }
    // Faixa do caminho rows 6-8
    for (let row = 6; row <= 8; row++) {
      for (let col = 0; col < 15; col++) {
        ctx.strokeRect(col * c + 0.25, row * c + 0.25, c - 0.5, c - 0.5);
      }
    }
  }

  _drawBaseCorner(ctx, startCol, startRow, color, player) {
    const c   = this.cell;
    const w   = 6 * c;
    const x   = startCol * c;
    const y   = startRow * c;
    const pad = c * 0.2;

    // Fundo colorido
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, w);

    // Placa branca interior arredondada
    ctx.fillStyle = 'rgba(255,255,255,0.93)';
    this._roundRect(ctx, x + pad, y + pad, w - pad * 2, w - pad * 2, c * 0.35);
    ctx.fill();

    // 4 círculos para as peças
    const offsets = [[1.5,1.5],[3.5,1.5],[1.5,3.5],[3.5,3.5]];
    offsets.forEach(([ox, oy]) => {
      const cx = (startCol + ox) * c;
      const cy = (startRow + oy) * c;
      const r  = c * 0.44;

      // Sombra
      ctx.beginPath();
      ctx.arc(cx, cy + 2, r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,0,0,0.12)';
      ctx.fill();

      // Anel colorido
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth   = c * 0.07;
      ctx.stroke();
    });

    // Borda exterior da base
    ctx.strokeStyle = 'rgba(0,0,0,0.18)';
    ctx.lineWidth   = 1;
    ctx.strokeRect(x, y, w, w);
  }

  _drawCenter(ctx) {
    const c  = this.cell;
    const cx = 7.5 * c;
    const cy = 7.5 * c;
    const r  = 2.5 * c;

    const triangles = [
      { pts:[[cx,cy],[cx-r,cy-r],[cx+r,cy-r]], color:'#049645' }, // topo  = verde (P2)
      { pts:[[cx,cy],[cx+r,cy-r],[cx+r,cy+r]], color:'#ff0002' }, // dir   = verm (P3)
      { pts:[[cx,cy],[cx+r,cy+r],[cx-r,cy+r]], color:'#ffde15' }, // base  = amar (P4)
      { pts:[[cx,cy],[cx-r,cy+r],[cx-r,cy-r]], color:'#1295e7' }, // esq   = azul (P1)
    ];

    triangles.forEach(t => {
      ctx.beginPath();
      ctx.moveTo(t.pts[0][0], t.pts[0][1]);
      ctx.lineTo(t.pts[1][0], t.pts[1][1]);
      ctx.lineTo(t.pts[2][0], t.pts[2][1]);
      ctx.closePath();
      ctx.fillStyle = t.color;
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.lineWidth   = 1;
      ctx.stroke();
    });

    // Círculo dourado central
    ctx.beginPath();
    ctx.arc(cx, cy, c * 0.65, 0, Math.PI * 2);
    const g = ctx.createRadialGradient(cx, cy - c * 0.15, 0, cx, cy, c * 0.65);
    g.addColorStop(0, '#fff8e1');
    g.addColorStop(1, '#f5c518');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth   = c * 0.07;
    ctx.stroke();

    // Estrela central
    ctx.save();
    ctx.translate(cx, cy);
    this._star(ctx, 0, 0, c * 0.4, c * 0.19, 6);
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fill();
    ctx.restore();
  }

  _drawStarAt(ctx, col, row) {
    const c  = this.cell;
    const cx = col * c + c * 0.5;
    const cy = row * c + c * 0.5;
    ctx.save();
    ctx.translate(cx, cy);
    this._star(ctx, 0, 0, c * 0.35, c * 0.17, 5);
    ctx.fillStyle = 'rgba(255,200,0,0.65)';
    ctx.fill();
    ctx.restore();
  }

  _star(ctx, cx, cy, outerR, innerR, pts) {
    ctx.beginPath();
    for (let i = 0; i < pts * 2; i++) {
      const r     = i % 2 === 0 ? outerR : innerR;
      const angle = (i * Math.PI) / pts - Math.PI / 2;
      if (i === 0) ctx.moveTo(cx + r * Math.cos(angle), cy + r * Math.sin(angle));
      else ctx.lineTo(cx + r * Math.cos(angle), cy + r * Math.sin(angle));
    }
    ctx.closePath();
  }

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

  // ══════════════════════════════════════════════════
  //  RENDER
  // ══════════════════════════════════════════════════

  drawBoard() {
    this.ctx.clearRect(0, 0, this.size, this.size);
    this.ctx.drawImage(this._boardImg, 0, 0);
  }

  drawPiece(sx, sy, colour, label, isSelectable, pulseT, scale, opacity) {
    const ctx = this.ctx;
    const c   = this.cell;
    const r   = c * 0.36 * (scale || 1);
    const css = COLOUR_CSS[colour] || '#888';

    ctx.save();
    ctx.globalAlpha = opacity !== undefined ? opacity : 1;
    ctx.translate(sx, sy);

    ctx.shadowColor   = css;
    ctx.shadowBlur    = isSelectable ? 14 + Math.sin((pulseT||0)) * 6 : 6;
    ctx.shadowOffsetY = 2;

    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    const g = ctx.createRadialGradient(-r*0.3, -r*0.3, 0, 0, 0, r);
    g.addColorStop(0, this._lighten(css, 60));
    g.addColorStop(1, css);
    ctx.fillStyle = g;
    ctx.fill();

    if (isSelectable) {
      const pulse = 0.55 + 0.45 * Math.sin((pulseT||0) * 2);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth   = c * 0.08 * pulse;
      ctx.globalAlpha = pulse * (opacity !== undefined ? opacity : 1);
      ctx.stroke();
    }

    ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    ctx.beginPath();
    ctx.arc(-r*0.22, -r*0.28, r*0.4, 0, Math.PI*2);
    ctx.fillStyle = 'rgba(255,255,255,0.32)';
    ctx.globalAlpha = opacity !== undefined ? opacity : 1;
    ctx.fill();

    ctx.fillStyle    = '#fff';
    ctx.font         = `bold ${Math.round(r * 0.95)}px "Plus Jakarta Sans",sans-serif`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, 0, 1);

    ctx.restore();
  }

  _lighten(hex, amount) {
    const n = parseInt(hex.replace('#',''), 16);
    const r = Math.min(255, (n >> 16) + amount);
    const g = Math.min(255, ((n >> 8) & 0xff) + amount);
    const b = Math.min(255, (n & 0xff) + amount);
    return `rgb(${r},${g},${b})`;
  }

  // ══════════════════════════════════════════════════
  //  ANIMAÇÕES
  // ══════════════════════════════════════════════════

  animateMove(colour, tokenId, fromPos, toPos, cb) {
    const key  = colour + '_' + tokenId;
    const from = this._posToScreen(fromPos);
    const to   = this._posToScreen(toPos);

    if (!this.pieces[key]) {
      this.pieces[key] = { sx: from.sx, sy: from.sy, scale:1, opacity:1, animating:false };
    }
    const piece = this.pieces[key];
    piece.animating = true;
    piece.sx = from.sx; piece.sy = from.sy;

    const dur   = 400;
    const start = performance.now();
    SFX.move();

    const step = (now) => {
      const t = Math.min((now - start) / dur, 1);
      const e = t < 0.5 ? 2*t*t : -1 + (4 - 2*t)*t;
      piece.sx = from.sx + (to.sx - from.sx) * e;
      piece.sy = from.sy + (to.sy - from.sy) * e;
      if (t < 1) {
        requestAnimationFrame(step);
      } else {
        piece.sx = to.sx; piece.sy = to.sy;
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

    const step = (now) => {
      const t = Math.min((now - start) / dur, 1);
      piece.scale   = 1 + Math.sin(t * Math.PI) * 0.6;
      piece.opacity = t < 0.5 ? 1 : 1 - (t - 0.5) * 2;
      if (t < 1) {
        requestAnimationFrame(step);
      } else {
        piece.scale = 1; piece.opacity = 1; piece.animating = false;
      }
    };
    requestAnimationFrame(step);
  }

  animateDice(value, cb) {
    SFX.dice();
    const faces  = ['⚀','⚁','⚂','⚃','⚄','⚅'];
    const faceEl = document.getElementById('dfc');
    const dnmEl  = document.getElementById('dnm');
    let frames   = 0;

    const roll = () => {
      if (frames < 10) {
        if (faceEl) faceEl.textContent = faces[Math.floor(Math.random()*6)];
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

  destroy() {}
}

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
//  HELPER: obtém posição lógica de um token
//  Backend pode enviar: token.pos | token.position | token.logical_pos
//  Se token está na base (locked), usa BASE_POSITIONS
// ══════════════════════════════════════════════════════════════════
function _getTokenLogicalPos(token, tokenIdx, colour) {
  // Campo pos directo
  if (token.pos !== undefined) return token.pos;
  if (token.position !== undefined) return token.position;
  if (token.logical_pos !== undefined) return token.logical_pos;

  // Token na base (locked / em casa)
  if (token.is_locked || token.locked || token.at_home || token.in_home === false) {
    const player = COLOUR_TO_PLAYER[colour] || 'P1';
    const bases  = BASE_POSITIONS[player];
    if (bases) return bases[tokenIdx % 4];
  }

  // Token chegou a casa
  if (token.has_reached_home || token.finished) {
    const player = COLOUR_TO_PLAYER[colour] || 'P1';
    return HOME_POSITIONS[player] || 105;
  }

  // Fallback: token.x,token.y como coordenadas de grelha
  // (não usa LUDO_COORD_MAP, usa _toScreen directamente)
  return null; // sinaliza para usar x,y
}

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
        // Calcular posição do token
        var logPos = _getTokenLogicalPos(token, ti, colour);
        var s;

        if (logPos !== null && logPos !== undefined) {
          s = window.BOARD._posToScreen(logPos);
        } else {
          // Usa x,y como grelha directamente
          s = window.BOARD._toScreen(token.x || 7, token.y || 7);
        }

        sx = s.sx; sy = s.sy;

        if (piece) {
          piece.sx = sx; piece.sy = sy;
          scale   = piece.scale   !== undefined ? piece.scale   : 1;
          opacity = piece.opacity !== undefined ? piece.opacity : 1;
        } else {
          window.BOARD.pieces[key] = { sx:sx, sy:sy, scale:1, opacity:1, animating:false };
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
                   (p.tokens ? p.tokens.filter(function(t){ return t.has_reached_home||t.finished; }).length : 0);
      cards += '<div class="pc ' + (p.idx === state.turn ? 'mt' : '') + '">' +
        '<div class="pdot" style="background:' + (COLOUR_CSS[colour] || '#888') + '"></div>' +
        '<div><div class="pnm2">' + p.name +
          (p.user_id === (window.U && window.U.id) ? ' (Tu)' : '') + '</div>' +
        '<div class="pft">' + (COLOUR_NAME[colour] || colour) + ' · ' + fin + '/4</div></div></div>';
      if (i === Math.floor(state.players.length / 2) - 1) cards += mid;
    }
    if (state.players.length <= 2) cards += mid;
    pc.innerHTML = cards;
  }

  var gbv = document.getElementById('gbv');
  if (gbv && typeof fmt === 'function') gbv.textContent = fmt(state.bet || 0) + ' KZ';

  var rb = document.getElementById('rb');
  if (rb) {
    var myTurn = _isMeTurn(state);
    rb.disabled = !myTurn || state.phase !== 0 || state.over;
    if (myTurn && !state.over) rb.classList.add('my-turn-glow');
    else rb.classList.remove('my-turn-glow');
  }

  if (state.log && state.log.length) {
    var le = document.getElementById('glog');
    if (le) {
      var logHtml = '';
      var recent  = state.log.slice(-20).reverse();
      for (var li = 0; li < recent.length; li++) {
        var l   = recent[li];
        var cls = (l.indexOf('VENCEU') !== -1 || l.indexOf('🏆') !== -1) ? ' gli-w' :
                  l.indexOf('💀') !== -1 ? ' gli-d' : '';
        logHtml += '<div class="gli' + cls + '">' + l + '</div>';
      }
      le.innerHTML = logHtml;
    }
  }

  var co = document.getElementById('chat-online');
  if (co) co.textContent = state.players.length + ' online';

  var faces = ['⚀','⚁','⚂','⚃','⚄','⚅'];
  if (state.dice > 0) {
    var dfc = document.getElementById('dfc');
    var dnm = document.getElementById('dnm');
    if (dfc && !dfc.classList.contains('rolling')) dfc.textContent = faces[state.dice - 1];
    if (dnm) dnm.textContent = state.dice;
  }

  window.SELECTABLE_PIECES = [];
};

window.highlightPcs = function(mv) {
  window.CUR_MV            = mv || [];
  window.SELECTABLE_PIECES = mv || [];
};

// ══════════════════════════════════════════════════════════════════
//  EVENTOS SSE
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
//  ANIMAÇÕES DE MOVIMENTO (diff estados)
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

      var tid      = token.id !== undefined ? token.id : ti;
      var curPos   = _getTokenLogicalPos(token, ti, colour);
      var prevPos  = _getTokenLogicalPos(prevToken, ti, colour);

      // Nenhuma mudança
      if (curPos === prevPos) continue;

      // Token capturado/voltou à base
      if ((token.is_locked || token.locked) && !(prevToken.is_locked || prevToken.locked)) {
        window.BOARD.animateCaptureAt(colour, tid);
        continue;
      }

      // Movimento normal
      if (prevPos !== null && curPos !== null) {
        window.BOARD.animateMove(colour, tid, prevPos, curPos, null);
      }
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
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ room_id: window.RID }),
      credentials:'same-origin'
    });
    d = await r.json();
  } catch(e) {
    if (faceEl) faceEl.classList.remove('rolling');
    if (rb) rb.disabled = false;
    return;
  }

  if (faceEl) faceEl.classList.remove('rolling');
  if (d.error) { if (typeof toast==='function') toast('❌ ' + d.error, 'ter'); return; }

  if (window.BOARD) {
    window.BOARD.animateDice(d.dice, async function() {
      window.renderState(d);
      try {
        var apiFn = typeof api === 'function' ? api : null;
        var mv = apiFn
          ? await api('/api/game/movable','POST',{room_id:window.RID})
          : await fetch('/api/game/movable',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({room_id:window.RID}),credentials:'same-origin'}).then(function(r){return r.json();});
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
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ room_id:window.RID, piece:idx }),
      credentials:'same-origin'
    });
    d = await r.json();
  } catch(e) { return; }

  if (d.error) { if (typeof toast==='function') toast('❌ '+d.error,'ter'); return; }

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
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ room_id:window.RID }), credentials:'same-origin'
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
  if (d.won && typeof coinRain  === 'function') coinRain();
  if (d.won && typeof showFlash === 'function') showFlash('🏆');

  var goo  = document.getElementById('goo');  if (goo)  goo.classList.remove('hidden');
  var goic = document.getElementById('goic'); if (goic) goic.textContent = d.won ? '🏆' : '💀';
  var gott = document.getElementById('gott'); if (gott) gott.textContent = d.won ? 'VITÓRIA!' : 'DERROTA';
  var gosb = document.getElementById('gosb'); if (gosb) gosb.textContent = d.won ? 'Parabéns, venceste!' : 'Boa sorte da próxima!';
  var gopr = document.getElementById('gopr');
  if (gopr) {
    var prize = d.won ? (d.prize || 0) : 0;
    gopr.textContent = (d.won ? '+' : '') + (typeof fmt==='function' ? fmt(prize) : prize) + ' KZ';
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
  var mx = (e.clientX - rect.left) * scaleX;
  var my = (e.clientY - rect.top)  * scaleY;

  var myPlayer = null;
  for (var i = 0; i < window.CUR_STATE.players.length; i++) {
    if (window.CUR_STATE.players[i].user_id === (window.U && window.U.id)) {
      myPlayer = window.CUR_STATE.players[i]; break;
    }
  }
  if (!myPlayer || !myPlayer.tokens) return;

  var colour  = myPlayer.colour || myPlayer.color || 'blue';
  var clicked = false;
  var hitR    = window.BOARD.cell * 0.46;

  for (var ti = 0; ti < myPlayer.tokens.length; ti++) {
    if (clicked) break;
    if (!window.SELECTABLE_PIECES || window.SELECTABLE_PIECES.indexOf(ti) === -1) continue;

    var token = myPlayer.tokens[ti];
    var tid   = token.id !== undefined ? token.id : ti;
    var key   = colour + '_' + tid;
    var piece = window.BOARD.pieces[key];

    var px = piece ? piece.sx : window.BOARD.size / 2;
    var py = piece ? piece.sy : window.BOARD.size / 2;
    var dist = Math.sqrt((mx - px) * (mx - px) + (my - py) * (my - py));

    if (dist <= hitR) {
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

setInterval(function() {
  var rb = document.getElementById('rb');
  if (!rb || !window.CUR_STATE) return;
  if (_isMeTurn(window.CUR_STATE) && !window.CUR_STATE.over) rb.classList.add('my-turn-glow');
  else rb.classList.remove('my-turn-glow');
}, 500);

console.log('[LudoKz] ludo_board_v2.js v6-FIXED carregado ✓');
