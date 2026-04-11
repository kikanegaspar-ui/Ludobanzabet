/**
 * LudoBoard v4.0 — Design Simples e Limpo
 * Tabuleiro estilo clássico com bordas pretas, cores sólidas
 * Movimentação correcta com todas as regras do Ludo
 */

// ══════════════════════════════════════════════
//  SONS
// ══════════════════════════════════════════════
const SFX = (() => {
  let ctx = null;
  function getCtx() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  function tone(freq, type, dur, vol = 0.25, delay = 0) {
    try {
      const ac = getCtx(), osc = ac.createOscillator(), gain = ac.createGain();
      osc.connect(gain); gain.connect(ac.destination);
      osc.type = type; osc.frequency.value = freq;
      const t = ac.currentTime + delay;
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(vol, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
      osc.start(t); osc.stop(t + dur + 0.05);
    } catch(e) {}
  }
  function noise(dur, vol = 0.15, freq = 2000) {
    try {
      const ac = getCtx(), buf = ac.createBuffer(1, ac.sampleRate * dur, ac.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      const src = ac.createBufferSource(), filter = ac.createBiquadFilter(), gain = ac.createGain();
      filter.type = 'bandpass'; filter.frequency.value = freq;
      src.buffer = buf; src.connect(filter); filter.connect(gain); gain.connect(ac.destination);
      gain.gain.setValueAtTime(vol, ac.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + dur);
      src.start(); src.stop(ac.currentTime + dur + 0.05);
    } catch(e) {}
  }
  return {
    dice()        { noise(0.08,0.18,3000); tone(180,'square',0.04,0.06,0.05); },
    diceResult(v) { const c={1:[261],2:[261,329],3:[261,329,392],4:[349,440],5:[392,494,587],6:[523,659,784]}; (c[v]||[261]).forEach((f,i)=>tone(f,'sine',0.35,0.22,i*0.04)); },
    move()        { tone(440,'sine',0.09,0.18); tone(554,'triangle',0.08,0.14,0.07); },
    capture()     { tone(330,'sawtooth',0.06,0.28); tone(220,'sawtooth',0.10,0.30,0.05); noise(0.18,0.20,800); },
    exitBase()    { tone(392,'sine',0.08,0.20); tone(494,'sine',0.08,0.20,0.07); tone(587,'sine',0.10,0.22,0.14); },
    finish()      { [523,659,784,1047].forEach((f,i)=>tone(f,'sine',0.22,0.28,i*0.09)); },
    win()         { [523,659,784,1047,1319].forEach((f,i)=>tone(f,'sine',0.3,0.28,i*0.08)); },
    safe()        { tone(659,'sine',0.12,0.15); tone(784,'sine',0.10,0.12,0.08); },
  };
})();

// ══════════════════════════════════════════════
//  CORES SIMPLES E SÓLIDAS
// ══════════════════════════════════════════════
const PALETTE = {
  red:    { main:'#e53935', light:'#ffcdd2', dark:'#b71c1c', text:'#ffffff' },
  green:  { main:'#43a047', light:'#c8e6c9', dark:'#1b5e20', text:'#ffffff' },
  blue:   { main:'#1e88e5', light:'#bbdefb', dark:'#0d47a1', text:'#ffffff' },
  yellow: { main:'#fdd835', light:'#fff9c4', dark:'#f57f17', text:'#333300' },
};

// ══════════════════════════════════════════════
//  CASAS SEGURAS
// ══════════════════════════════════════════════
const SAFE_COORDS = new Set([
  '6,13','1,6','8,1','13,8',
  '8,12','2,8','6,2','12,6',
]);

// ══════════════════════════════════════════════
//  POSIÇÕES BASE de cada cor (linha, coluna)
// ══════════════════════════════════════════════
const BASE_POSITIONS = {
  red:    [[1.5,1.2],[3.5,1.2],[1.5,3.2],[3.5,3.2]],
  green:  [[1.5,10.2],[3.5,10.2],[1.5,12.2],[3.5,12.2]],
  blue:   [[10.5,1.2],[12.5,1.2],[10.5,3.2],[12.5,3.2]],
  yellow: [[10.5,10.2],[12.5,10.2],[10.5,12.2],[12.5,12.2]],
};

// ══════════════════════════════════════════════
//  CLASSE PRINCIPAL
// ══════════════════════════════════════════════
class LudoBoard {
  constructor(canvas, size) {
    this.canvas = canvas;
    this.ctx    = canvas.getContext('2d');
    this.size   = size;
    this.cs     = size / 15;

    this.pieces           = {};
    this._pulse           = 0;
    this._rafId           = null;
    this._particles       = [];
    this._boardCache      = null;
    this._boardCacheDirty = true;

    this._startLoop();
  }

  _gameToScreen(gameX, gameY) {
    return {
      sx: gameY * this.cs + this.cs * 0.5,
      sy: gameX * this.cs + this.cs * 0.5,
    };
  }

  _startLoop() {
    const loop = (ts) => {
      this._pulse = ts * 0.001;
      this._updateParticles();
      this._rafId = requestAnimationFrame(loop);
    };
    this._rafId = requestAnimationFrame(loop);
  }

  // ══════════════════════════════════════════
  //  TABULEIRO
  // ══════════════════════════════════════════
  drawBoard() {
    if (!this._boardCache || this._boardCacheDirty) this._renderBoardToCache();
    this.ctx.drawImage(this._boardCache, 0, 0);
  }

  _renderBoardToCache() {
    const off = document.createElement('canvas');
    off.width = off.height = this.size;
    const oc = off.getContext('2d');
    const { cs, size } = this;

    // Fundo branco
    oc.fillStyle = '#ffffff';
    oc.fillRect(0, 0, size, size);

    // Células
    for (let r = 0; r < 15; r++)
      for (let c = 0; c < 15; c++)
        this._drawCellTo(oc, r, c);

    // Bases (quadrantes coloridos)
    this._drawBaseTo(oc, 0, 0,  5, 5,  'red');
    this._drawBaseTo(oc, 0, 9,  5, 14, 'green');
    this._drawBaseTo(oc, 9, 0,  14, 5, 'blue');
    this._drawBaseTo(oc, 9, 9,  14, 14,'yellow');

    this._drawHomePathsTo(oc);
    this._drawSafeStarsTo(oc);
    this._drawCenterTo(oc);

    // Borda externa
    oc.strokeStyle = '#000000';
    oc.lineWidth   = 3;
    oc.strokeRect(1, 1, size - 2, size - 2);

    this._boardCache      = off;
    this._boardCacheDirty = false;
  }

  _drawCellTo(oc, r, c) {
    const { cs } = this;
    const x = c * cs, y = r * cs;
    oc.fillStyle = this._cellBgColor(r, c);
    oc.fillRect(x, y, cs, cs);
    oc.strokeStyle = '#cccccc';
    oc.lineWidth   = 0.5;
    oc.strokeRect(x, y, cs, cs);
  }

  _cellBgColor(r, c) {
    if (r >= 0 && r <= 5  && c >= 0  && c <= 5)  return PALETTE.red.light;
    if (r >= 0 && r <= 5  && c >= 9  && c <= 14) return PALETTE.green.light;
    if (r >= 9 && r <= 14 && c >= 0  && c <= 5)  return PALETTE.blue.light;
    if (r >= 9 && r <= 14 && c >= 9  && c <= 14) return PALETTE.yellow.light;
    if (r >= 6 && r <= 8  && c >= 6  && c <= 8)  return '#ffffff';
    if (r === 7 && c >= 1 && c <= 5)  return PALETTE.red.light;
    if (c === 7 && r >= 1 && r <= 5)  return PALETTE.green.light;
    if (r === 7 && c >= 9 && c <= 13) return PALETTE.yellow.light;
    if (c === 7 && r >= 9 && r <= 13) return PALETTE.blue.light;
    return '#ffffff';
  }

  _drawBaseTo(oc, r1, c1, r2, c2, color) {
    const { cs } = this;
    const p = PALETTE[color];

    // Fundo colorido da base
    oc.fillStyle = p.main;
    oc.fillRect(c1 * cs, r1 * cs, (c2 - c1 + 1) * cs, (r2 - r1 + 1) * cs);

    // Borda da base
    oc.strokeStyle = '#000000';
    oc.lineWidth   = 2;
    oc.strokeRect(c1 * cs, r1 * cs, (c2 - c1 + 1) * cs, (r2 - r1 + 1) * cs);

    // Painel branco interno
    const pad = cs * 0.55;
    const iw  = (c2 - c1 + 1) * cs - pad * 2;
    const ih  = (r2 - r1 + 1) * cs - pad * 2;
    oc.fillStyle   = '#ffffff';
    oc.strokeStyle = '#000000';
    oc.lineWidth   = 2;
    oc.fillRect(c1 * cs + pad, r1 * cs + pad, iw, ih);
    oc.strokeRect(c1 * cs + pad, r1 * cs + pad, iw, ih);

    // 4 círculos de peças
    BASE_POSITIONS[color].forEach(([bx, by]) => {
      const cx = by * cs + cs * 0.5;
      const cy = bx * cs + cs * 0.5;
      const r  = cs * 0.28;

      oc.fillStyle   = p.main;
      oc.strokeStyle = '#000000';
      oc.lineWidth   = 2;
      oc.beginPath();
      oc.arc(cx, cy, r, 0, Math.PI * 2);
      oc.fill();
      oc.stroke();

      // Brilho simples
      oc.fillStyle = 'rgba(255,255,255,0.35)';
      oc.beginPath();
      oc.arc(cx - r * 0.25, cy - r * 0.25, r * 0.38, 0, Math.PI * 2);
      oc.fill();
    });
  }

  _drawHomePathsTo(oc) {
    const { cs } = this;
    const lanes = [
      { cells: [[7,1],[7,2],[7,3],[7,4],[7,5]], color: PALETTE.red,    arrow:'→' },
      { cells: [[1,7],[2,7],[3,7],[4,7],[5,7]], color: PALETTE.green,  arrow:'↓' },
      { cells: [[7,9],[7,10],[7,11],[7,12],[7,13]], color: PALETTE.yellow, arrow:'←' },
      { cells: [[9,7],[10,7],[11,7],[12,7],[13,7]], color: PALETTE.blue,   arrow:'↑' },
    ];

    lanes.forEach(({ cells, color, arrow }) => {
      cells.forEach(([row, col], i) => {
        const x = col * cs, y = row * cs;

        // Fundo colorido da reta final
        oc.fillStyle = color.main;
        oc.fillRect(x, y, cs, cs);

        // Borda
        oc.strokeStyle = '#000000';
        oc.lineWidth   = 0.5;
        oc.strokeRect(x, y, cs, cs);

        // Seta na primeira célula
        if (i === 0) {
          oc.fillStyle    = '#ffffff';
          oc.font         = `bold ${cs * 0.55}px sans-serif`;
          oc.textAlign    = 'center';
          oc.textBaseline = 'middle';
          oc.fillText(arrow, x + cs * 0.5, y + cs * 0.5);
        }
      });
    });
  }

  _drawSafeStarsTo(oc) {
    const { cs } = this;
    const safeList = [
      [6,13],[1,6],[8,1],[13,8],
      [8,12],[2,8],[6,2],[12,6],
    ];
    safeList.forEach(([row, col]) => {
      const x = col * cs, y = row * cs;
      oc.fillStyle    = '#fdd835';
      oc.font         = `${cs * 0.55}px serif`;
      oc.textAlign    = 'center';
      oc.textBaseline = 'middle';
      oc.fillText('★', x + cs * 0.5, y + cs * 0.5 + 1);
    });
  }

  _drawCenterTo(oc) {
    const { cs } = this;
    const cx = 7.5 * cs, cy = 7.5 * cs;

    // 4 triângulos coloridos simples
    const tris = [
      { c: PALETTE.green.main,  pts: [[6,6],[9,6],[7.5,7.5]] },
      { c: PALETTE.yellow.main, pts: [[9,6],[9,9],[7.5,7.5]] },
      { c: PALETTE.blue.main,   pts: [[6,9],[9,9],[7.5,7.5]] },
      { c: PALETTE.red.main,    pts: [[6,6],[6,9],[7.5,7.5]] },
    ];

    tris.forEach(({ c, pts }) => {
      oc.fillStyle = c;
      oc.beginPath();
      oc.moveTo(pts[0][0] * cs, pts[0][1] * cs);
      oc.lineTo(pts[1][0] * cs, pts[1][1] * cs);
      oc.lineTo(pts[2][0] * cs, pts[2][1] * cs);
      oc.closePath();
      oc.fill();
      oc.strokeStyle = '#000000';
      oc.lineWidth   = 0.5;
      oc.stroke();
    });

    // Círculo central branco com estrela
    oc.fillStyle   = '#ffffff';
    oc.strokeStyle = '#cccccc';
    oc.lineWidth   = 1;
    oc.beginPath();
    oc.arc(cx, cy, cs * 1.05, 0, Math.PI * 2);
    oc.fill();
    oc.stroke();

    oc.fillStyle    = 'rgba(0,0,0,0.15)';
    oc.font         = `${cs * 1.3}px serif`;
    oc.textAlign    = 'center';
    oc.textBaseline = 'middle';
    oc.fillText('★', cx, cy + cs * 0.06);
  }

  // ══════════════════════════════════════════
  //  DESENHAR PEÇA — simples e limpa
  // ══════════════════════════════════════════
  drawPiece(sx, sy, color, num, selectable, pulseT, scale = 1, opacity = 1) {
    const { ctx, cs } = this;
    const p = PALETTE[color];
    if (!p) return;

    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, opacity));

    const t       = pulseT || 0;
    const bounce  = selectable ? Math.abs(Math.sin(t * 3.5)) * cs * 0.10 : 0;
    const drawY   = sy - bounce;
    const r       = cs * 0.30 * scale;

    // Sombra simples
    ctx.fillStyle = 'rgba(0,0,0,0.20)';
    ctx.beginPath();
    ctx.ellipse(sx, sy + r * 0.3, r * 0.65, r * 0.18, 0, 0, Math.PI * 2);
    ctx.fill();

    // Corpo da peça — círculo sólido
    ctx.fillStyle   = p.main;
    ctx.strokeStyle = '#000000';
    ctx.lineWidth   = Math.max(1.5, scale * 1.8);
    ctx.beginPath();
    ctx.arc(sx, drawY, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Anel interno branco (estilo clássico)
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth   = Math.max(1, scale * 1.2);
    ctx.beginPath();
    ctx.arc(sx, drawY, r * 0.62, 0, Math.PI * 2);
    ctx.stroke();

    // Número
    const fs = Math.max(8, cs * 0.20 * scale);
    ctx.font          = `bold ${fs}px Arial, sans-serif`;
    ctx.textAlign     = 'center';
    ctx.textBaseline  = 'middle';
    ctx.fillStyle     = p.text;
    ctx.fillText(String(num), sx, drawY + fs * 0.05);

    // Glow quando seleccionável
    if (selectable) {
      ctx.strokeStyle = p.main;
      ctx.lineWidth   = 3;
      ctx.globalAlpha = 0.4 + 0.3 * Math.abs(Math.sin(t * 3));
      ctx.beginPath();
      ctx.arc(sx, drawY, r + 5, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.restore();
  }

  // ══════════════════════════════════════════
  //  ANIMAÇÃO DE PEÇAS
  // ══════════════════════════════════════════
  animatePieceTo(colour, tokenId, fromGameX, fromGameY, toGameX, toGameY, wasLocked, onComplete) {
    const key   = colour + '_' + tokenId;
    const fromS = this._gameToScreen(fromGameX, fromGameY);
    const toS   = this._gameToScreen(toGameX, toGameY);

    if (!this.pieces[key])
      this.pieces[key] = { sx: fromS.sx, sy: fromS.sy, scale: 1, opacity: 1, animating: false };

    const piece = this.pieces[key];
    piece.animating = true;
    piece.sx = fromS.sx;
    piece.sy = fromS.sy;

    if (wasLocked) {
      SFX.exitBase();
      this._animSegment(piece, fromS, toS, 300, () => {
        piece.animating = false;
        if (onComplete) onComplete();
      });
    } else if (toGameX === 7 && toGameY === 7) {
      SFX.finish();
      this._animSegment(piece, fromS, toS, 350, () => {
        this._spawnConfetti(toS.sx, toS.sy, colour);
        piece.animating = false;
        if (onComplete) onComplete();
      });
    } else {
      const key2 = `${Math.round(toGameX)},${Math.round(toGameY)}`;
      SAFE_COORDS.has(key2) ? SFX.safe() : SFX.move();
      this._animSegment(piece, fromS, toS, 280, () => {
        piece.animating = false;
        if (onComplete) onComplete();
      });
    }
  }

  animateCaptureAt(colour, tokenId) {
    const key = colour + '_' + tokenId;
    if (!this.pieces[key]) return;
    SFX.capture();
    const piece = this.pieces[key];
    this._spawnCaptureBurst(piece.sx, piece.sy, colour);
    piece.animating = false;
  }

  animateDice(finalVal, onDone) {
    SFX.dice();
    const faces  = ['⚀','⚁','⚂','⚃','⚄','⚅'];
    const total  = 600;
    const start  = performance.now();
    let lastSwap = 0, interval = 50;

    const step = (now) => {
      const el = now - start, prog = el / total;
      interval = 50 + prog * 80;
      if (el - lastSwap > interval) {
        const dfc = document.getElementById('dfc');
        if (dfc) dfc.textContent = faces[Math.floor(Math.random() * 6)];
        lastSwap = el;
      }
      if (el < total) {
        requestAnimationFrame(step);
      } else {
        const dfc   = document.getElementById('dfc');
        const numEl = document.getElementById('dnm');
        if (dfc) { dfc.textContent = faces[finalVal - 1]; }
        if (numEl) { numEl.textContent = finalVal; }
        SFX.diceResult(finalVal);
        if (onDone) onDone();
      }
    };
    requestAnimationFrame(step);
  }

  // ── Animações internas ───────────────────
  _animSegment(piece, from, to, dur, onDone) {
    const start = performance.now();
    const dx = to.sx - from.sx, dy = to.sy - from.sy;
    const step = (now) => {
      const raw = Math.min((now - start) / dur, 1);
      const e   = 1 - Math.pow(1 - raw, 3);
      piece.sx  = from.sx + dx * e;
      piece.sy  = from.sy + dy * e;
      raw < 1 ? requestAnimationFrame(step) : (piece.sx = to.sx, piece.sy = to.sy, onDone && onDone());
    };
    requestAnimationFrame(step);
  }

  _animScale(piece, from, to, dur, onDone) {
    const start = performance.now();
    const step  = (now) => {
      const raw    = Math.min((now - start) / dur, 1);
      piece.scale  = from + (to - from) * raw;
      raw < 1 ? requestAnimationFrame(step) : (piece.scale = to, onDone && onDone());
    };
    requestAnimationFrame(step);
  }

  // ── Partículas ───────────────────────────
  _spawnConfetti(x, y, color) {
    const p = PALETTE[color] || PALETTE.red;
    for (let i = 0; i < 18; i++) {
      const angle = (i / 18) * Math.PI * 2 + Math.random() * 0.3;
      const speed = 2 + Math.random() * 3;
      this._particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 3,
        life: 1, decay: 0.020 + Math.random() * 0.008,
        color: [p.main, p.light, '#ffffff', '#fdd835'][Math.floor(Math.random() * 4)],
        size: 3 + Math.random() * 4,
        rot: Math.random() * Math.PI * 2,
        rv:  (Math.random() - 0.5) * 0.3,
        type: 'confetti',
      });
    }
  }

  _spawnCaptureBurst(x, y, color) {
    const p = PALETTE[color] || PALETTE.red;
    for (let i = 0; i < 10; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1.5 + Math.random() * 2.5;
      this._particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 1.5,
        life: 1, decay: 0.04 + Math.random() * 0.015,
        color: p.main,
        size: 2 + Math.random() * 3,
        rot: 0, rv: 0, type: 'spark',
      });
    }
  }

  _updateParticles() {
    const { ctx } = this;
    this._particles = this._particles.filter(p => p.life > 0.01);
    this._particles.forEach(p => {
      p.x += p.vx; p.y += p.vy;
      p.vy += 0.22; p.vx *= 0.98;
      p.life -= p.decay;
      p.rot  += p.rv;
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      if (p.type === 'confetti') {
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      } else {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    });
  }

  _rrectTo(oc, x, y, w, h, r) {
    oc.beginPath();
    oc.moveTo(x + r, y);
    oc.lineTo(x + w - r, y);
    oc.arcTo(x + w, y, x + w, y + r, r);
    oc.lineTo(x + w, y + h - r);
    oc.arcTo(x + w, y + h, x + w - r, y + h, r);
    oc.lineTo(x + r, y + h);
    oc.arcTo(x, y + h, x, y + h - r, r);
    oc.lineTo(x, y + r);
    oc.arcTo(x, y, x + r, y, r);
    oc.closePath();
  }

  destroy() {
    if (this._rafId) cancelAnimationFrame(this._rafId);
    this._particles = [];
    this.pieces     = {};
  }
}

// ══════════════════════════════════════════════
//  ADAPTADOR
// ══════════════════════════════════════════════
function adaptNewState(state) {
  if (!state || !state.players) return state;
  return {
    ...state,
    players: state.players.map(p => ({
      ...p,
      color:   p.colour,
      fin:     p.fin || (p.tokens ? p.tokens.filter(t => t.has_reached_home).length : 0),
      pos:     p.tokens ? p.tokens.map(t => t.is_locked ? 0 : (t.has_reached_home ? 58 : 1)) : p.pos,
      in_base: p.tokens ? p.tokens.map(t => t.is_locked) : p.in_base,
    }))
  };
}

window.drawGameStateNew = function(state) {
  if (!window.BOARD || !state || !state.players) return;
  window.BOARD.drawBoard();

  state.players.forEach(pl => {
    const color = pl.colour || pl.color;
    if (!color) return;

    pl.tokens.forEach((token, i) => {
      const key   = color + '_' + (token.id !== undefined ? token.id : i);
      const piece = window.BOARD.pieces[key];

      let sx, sy;
      if (piece && piece.animating) {
        sx = piece.sx; sy = piece.sy;
      } else {
        const s = window.BOARD._gameToScreen(token.x, token.y);
        sx = s.sx; sy = s.sy;
        if (piece) { piece.sx = sx; piece.sy = sy; }
        else { window.BOARD.pieces[key] = { sx, sy, scale: 1, opacity: 1, animating: false }; }
      }

      const isSelectable = (window.SELECTABLE_PIECES || []).includes(i)
        && pl.user_id === window.U?.id
        && _isMeTurnNew(state);

      const pScale   = piece ? (piece.scale   ?? 1) : 1;
      const pOpacity = piece ? (piece.opacity ?? 1) : 1;

      window.BOARD.drawPiece(
        sx, sy, color,
        (token.id !== undefined ? token.id + 1 : i + 1),
        isSelectable, window.PULSE_T, pScale, pOpacity
      );
    });
  });
};

function _isMeTurnNew(state) {
  if (!state || !state.players || !window.U) return false;
  const p = state.players[state.turn];
  return p && p.user_id === window.U.id && state.phase === 0;
}

window._triggerMoveAnimationsNew = function(prev, next) {
  if (!prev || !next || !window.BOARD) return;
  next.players.forEach(pl => {
    const prevPl = (prev.players || []).find(p => p.user_id === pl.user_id);
    if (!prevPl) return;
    pl.tokens.forEach((token, i) => {
      const prevToken = prevPl.tokens[i];
      if (!prevToken) return;
      const colour = pl.colour || pl.color;
      const tid    = token.id !== undefined ? token.id : i;

      if (token.x === prevToken.x && token.y === prevToken.y &&
          token.is_locked === prevToken.is_locked &&
          token.has_reached_home === prevToken.has_reached_home) return;

      if (token.is_locked && !prevToken.is_locked) {
        window.BOARD.animateCaptureAt(colour, tid);
        return;
      }

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

window.drawGameState          = window.drawGameStateNew;
window._triggerMoveAnimations = window._triggerMoveAnimationsNew;
