/**
 * LudoBoard — Visual Engine inspirado no LibreLudo
 * Tabuleiro Canvas HD, peças 3D, animações fluidas, sons Web Audio
 * Integração total com o backend LudoKz (SSE, apostas, salas)
 */

// ══════════════════════════════════════════════
//  SONS (Web Audio API — sem ficheiros externos)
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
      const ac = getCtx();
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.connect(gain); gain.connect(ac.destination);
      osc.type = type; osc.frequency.value = freq;
      const t = ac.currentTime + delay;
      gain.gain.setValueAtTime(vol, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
      osc.start(t); osc.stop(t + dur + 0.05);
    } catch(e) {}
  }
  function noise(dur, vol = 0.15) {
    try {
      const ac = getCtx();
      const buf = ac.createBuffer(1, ac.sampleRate * dur, ac.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      const src = ac.createBufferSource();
      const gain = ac.createGain();
      src.buffer = buf; src.connect(gain); gain.connect(ac.destination);
      gain.gain.setValueAtTime(vol, ac.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + dur);
      src.start(); src.stop(ac.currentTime + dur + 0.05);
    } catch(e) {}
  }

  return {
    dice() {
      // Ruído de dado a rolar
      noise(0.18, 0.2);
      tone(300, 'square', 0.05, 0.1, 0.05);
      tone(200, 'square', 0.05, 0.08, 0.10);
      tone(400, 'square', 0.05, 0.08, 0.15);
    },
    diceResult(val) {
      // Nota musical baseada no valor
      const notes = [261, 294, 329, 349, 392, 440];
      tone(notes[val - 1] || 261, 'sine', 0.25, 0.3);
    },
    move() {
      tone(523, 'sine', 0.12, 0.2);
      tone(659, 'sine', 0.10, 0.15, 0.08);
    },
    capture() {
      tone(400, 'sawtooth', 0.08, 0.3);
      tone(200, 'sawtooth', 0.15, 0.35, 0.06);
      noise(0.12, 0.15);
    },
    exitBase() {
      tone(392, 'sine', 0.1, 0.25);
      tone(523, 'sine', 0.1, 0.25, 0.08);
      tone(659, 'sine', 0.15, 0.2, 0.16);
    },
    finish() {
      // Fanfarra
      [523, 659, 784, 1047].forEach((f, i) =>
        tone(f, 'sine', 0.2, 0.3, i * 0.1));
    },
    win() {
      [523, 659, 784, 1047, 1319].forEach((f, i) =>
        tone(f, 'triangle', 0.3, 0.35, i * 0.09));
      setTimeout(() => {
        [1047, 1319, 1568].forEach((f, i) =>
          tone(f, 'sine', 0.4, 0.3, i * 0.1));
      }, 600);
    },
    blocked() {
      tone(200, 'sawtooth', 0.15, 0.3);
      tone(150, 'sawtooth', 0.15, 0.25, 0.12);
    },
    tick() {
      tone(800, 'square', 0.04, 0.08);
    }
  };
})();

// ══════════════════════════════════════════════
//  PALETA DE CORES
// ══════════════════════════════════════════════
const PALETTE = {
  g: { main: '#22c55e', dark: '#15803d', light: '#bbf7d0', glow: 'rgba(34,197,94,0.6)',  path: '#dcfce7' },
  y: { main: '#eab308', dark: '#a16207', light: '#fef9c3', glow: 'rgba(234,179,8,0.6)',   path: '#fefce8' },
  r: { main: '#ef4444', dark: '#b91c1c', light: '#fecaca', glow: 'rgba(239,68,68,0.6)',   path: '#fee2e2' },
  b: { main: '#3b82f6', dark: '#1d4ed8', light: '#bfdbfe', glow: 'rgba(59,130,246,0.6)', path: '#eff6ff' },
};

// ══════════════════════════════════════════════
//  CLASSE PRINCIPAL
// ══════════════════════════════════════════════
class LudoBoard {
  constructor(canvas, size) {
    this.canvas = canvas;
    this.ctx    = canvas.getContext('2d');
    this.size   = size;
    this.cs     = size / 15; // cell size

    // Estado de animação de cada peça
    // key: "color_idx" → { x, y, targetX, targetY, animating, scale, opacity }
    this.pieces = {};

    // Fila de animações pendentes (para sequenciar capturas, movimentos, etc.)
    this._animQueue = [];
    this._animRunning = false;

    // Tempo para animações pulsantes
    this._pulse = 0;
    this._rafId = null;

    // Efeitos de partículas
    this._particles = [];

    // Construir caminhos
    this._buildPaths();

    // Iniciar loop de render contínuo
    this._startLoop();
  }

  // ── Paths ──────────────────────────────────
  _buildPaths() {
    const p = [];
    for(let c=1;c<=5;c++) p.push([6,c]);
    for(let r=5;r>=0;r--) p.push([r,5]);
    for(let c=6;c<=8;c++) p.push([0,c]);
    for(let r=1;r<=5;r++) p.push([r,9]);
    for(let c=9;c<=13;c++) p.push([6,c]);
    for(let r=7;r<=8;r++) p.push([r,14]);
    for(let c=13;c>=9;c--) p.push([8,c]);
    for(let r=9;r<=13;r++) p.push([r,9]);
    for(let c=8;c>=6;c--) p.push([14,c]);
    for(let r=13;r>=9;r--) p.push([r,5]);
    for(let c=5;c>=1;c--) p.push([8,c]);
    for(let r=7;r>=6;r--) p.push([r,0]);
    this._globalPath = p.slice(0, 52);

    this._homePaths = {
      g: [[1,7],[2,7],[3,7],[4,7],[5,7],[6,7]],
      y: [[7,13],[7,12],[7,11],[7,10],[7,9],[7,8]],
      r: [[13,7],[12,7],[11,7],[10,7],[9,7],[8,7]],
      b: [[7,1],[7,2],[7,3],[7,4],[7,5],[7,6]],
    };
    this._startOffset = { g:0, y:13, r:26, b:39 };
    this._basePosns = {
      g: [[2,2],[2,4],[4,2],[4,4]],
      y: [[2,10],[2,12],[4,10],[4,12]],
      r: [[10,2],[10,4],[12,2],[12,4]],
      b: [[10,10],[10,12],[12,10],[12,12]],
    };
    this._startCells = { g:[6,1], y:[1,9], r:[8,13], b:[13,5] };
    // Casas seguras (posições 0-based no globalPath)
    this._safeIdx = new Set([0,8,13,21,26,34,39,47]);
  }

  // ── Coordenadas ────────────────────────────
  _cc(row, col) {
    return { x: col * this.cs + this.cs / 2, y: row * this.cs + this.cs / 2 };
  }

  getPieceCoord(color, pos, inBase, idx) {
    if (inBase || pos === 0) {
      const b = this._basePosns[color][idx] || this._basePosns[color][0];
      return this._cc(b[0], b[1]);
    }
    if (pos >= 58) {
      const hp = this._homePaths[color][5];
      return this._cc(hp[0], hp[1]);
    }
    if (pos >= 52) {
      const hp = this._homePaths[color][Math.min(pos - 52, 5)];
      return this._cc(hp[0], hp[1]);
    }
    const off = this._startOffset[color];
    const gp  = this._globalPath[(off + pos - 1) % 52];
    if (!gp) return this._cc(7, 7);
    return this._cc(gp[0], gp[1]);
  }

  // ── Loop de Render ─────────────────────────
  _startLoop() {
    const loop = () => {
      this._pulse += 0.04;
      this._updateParticles();
      this._rafId = requestAnimationFrame(loop);
    };
    this._rafId = requestAnimationFrame(loop);
  }

  // ══════════════════════════════════════════
  //  DESENHO DO TABULEIRO
  // ══════════════════════════════════════════
  drawBoard() {
    const { ctx, cs, size } = this;
    ctx.clearRect(0, 0, size, size);

    // Fundo
    ctx.fillStyle = '#f8f9fa';
    ctx.fillRect(0, 0, size, size);

    // Células
    for (let r = 0; r < 15; r++) {
      for (let c = 0; c < 15; c++) {
        this._drawCell(r, c);
      }
    }

    // Bases coloridas
    this._drawBase(1, 1, 4, 4, 'g');
    this._drawBase(1, 9, 4, 12, 'y');  // ajustado para 4 colunas
    this._drawBase(9, 1, 12, 4, 'r');
    this._drawBase(9, 9, 12, 12, 'b');

    // Centro
    this._drawCenter();

    // Setas retas finais
    this._drawHomeArrows();

    // Estrelas nas casas seguras
    this._drawSafeStars();
  }

  _drawCell(r, c) {
    const { ctx, cs } = this;
    const x = c * cs, y = r * cs;
    const col = this._cellBgColor(r, c);
    ctx.fillStyle = col;
    ctx.fillRect(x, y, cs, cs);
    ctx.strokeStyle = 'rgba(0,0,0,0.07)';
    ctx.lineWidth = 0.5;
    ctx.strokeRect(x, y, cs, cs);
  }

  _cellBgColor(r, c) {
    // Bases
    if (r>=1&&r<=4&&c>=1&&c<=4) return PALETTE.g.light;
    if (r>=1&&r<=4&&c>=9&&c<=12) return PALETTE.y.light;   // corrigido
    if (r>=9&&r<=12&&c>=1&&c<=4) return PALETTE.r.light;
    if (r>=9&&r<=12&&c>=9&&c<=12) return PALETTE.b.light;
    // Centro
    if (r>=6&&r<=8&&c>=6&&c<=8) return '#ffffff';
    // Retas finais (coloridas)
    if (c===7&&r>=1&&r<=5) return PALETTE.g.path;
    if (r===7&&c>=9&&c<=13) return PALETTE.y.path;
    if (c===7&&r>=9&&r<=13) return PALETTE.r.path;
    if (r===7&&c>=1&&c<=5)  return PALETTE.b.path;
    return '#ffffff';
  }

  _drawBase(r1, c1, r2, c2, color) {
    const { ctx, cs } = this;
    const p  = PALETTE[color];
    const x  = c1 * cs + cs * 0.08;
    const y  = r1 * cs + cs * 0.08;
    const w  = (c2 - c1 + 2) * cs - cs * 0.16;
    const h  = (r2 - r1 + 2) * cs - cs * 0.16;
    const rad = cs * 0.5;

    // Sombra
    ctx.save();
    ctx.shadowColor = p.glow;
    ctx.shadowBlur  = 12;

    // Fundo colorido
    ctx.fillStyle = p.main;
    this._rrect(x, y, w, h, rad);
    ctx.fill();
    ctx.restore();

    // Painel interno branco
    const px = c1 * cs + cs * 0.55;
    const py = r1 * cs + cs * 0.55;
    const pw = (c2 - c1 + 1) * cs - cs * 0.1;
    const ph = (r2 - r1 + 1) * cs - cs * 0.1;
    ctx.fillStyle = 'rgba(255,255,255,0.88)';
    this._rrect(px, py, pw, ph, rad * 0.7);
    ctx.fill();

    // 4 círculos de peças na base
    const bpos = this._basePosns[color];
    bpos.forEach(([br, bc]) => {
      const cx = bc * cs + cs / 2;
      const cy = br * cs + cs / 2;
      const r  = cs * 0.31;
      // Sombra suave
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.25)';
      ctx.shadowBlur  = 6;
      ctx.fillStyle   = p.main;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      // Brilho interno
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.beginPath();
      ctx.arc(cx - r * 0.25, cy - r * 0.25, r * 0.45, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  _drawCenter() {
    const { ctx, cs } = this;
    const cx = 7.5 * cs, cy = 7.5 * cs;

    // 4 triângulos coloridos
    const tris = [
      { color: PALETTE.g.main, pts: [[6,6],[9,6],[7.5,7.5]] },
      { color: PALETTE.y.main, pts: [[9,6],[9,9],[7.5,7.5]] },
      { color: PALETTE.r.main, pts: [[6,9],[9,9],[7.5,7.5]] },
      { color: PALETTE.b.main, pts: [[6,6],[6,9],[7.5,7.5]] },
    ];
    tris.forEach(({ color, pts }) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(pts[0][0]*cs, pts[0][1]*cs);
      ctx.lineTo(pts[1][0]*cs, pts[1][1]*cs);
      ctx.lineTo(pts[2][0]*cs, pts[2][1]*cs);
      ctx.closePath();
      ctx.fill();
    });

    // Círculo branco central
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.15)';
    ctx.shadowBlur  = 8;
    ctx.fillStyle   = '#fff';
    ctx.beginPath();
    ctx.arc(cx, cy, cs * 1.05, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Estrela decorativa
    ctx.fillStyle   = 'rgba(0,0,0,0.08)';
    ctx.font        = `${cs * 1.3}px serif`;
    ctx.textAlign   = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('★', cx, cy + cs * 0.05);
  }

  _drawHomeArrows() {
    const { ctx, cs } = this;
    const arrows = [
      { cells: this._homePaths.g.slice(0,5), arrow: '↓', color: PALETTE.g },
      { cells: this._homePaths.y.slice(0,5), arrow: '←', color: PALETTE.y },
      { cells: this._homePaths.r.slice(0,5), arrow: '↑', color: PALETTE.r },
      { cells: this._homePaths.b.slice(0,5), arrow: '→', color: PALETTE.b },
    ];
    arrows.forEach(({ cells, arrow, color }) => {
      cells.forEach(([row, col]) => {
        ctx.fillStyle = color.path;
        ctx.fillRect(col * cs, row * cs, cs, cs);
        ctx.fillStyle = color.dark;
        ctx.font      = `bold ${cs * 0.52}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(arrow, col * cs + cs / 2, row * cs + cs / 2);
      });
    });
  }

  _drawSafeStars() {
    const { ctx, cs } = this;
    this._safeIdx.forEach(idx => {
      if (idx >= this._globalPath.length) return;
      const [row, col] = this._globalPath[idx];
      ctx.fillStyle    = 'rgba(255,200,0,0.25)';
      ctx.fillRect(col * cs, row * cs, cs, cs);
      ctx.fillStyle    = 'rgba(180,140,0,0.55)';
      ctx.font         = `${cs * 0.5}px serif`;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('★', col * cs + cs / 2, row * cs + cs / 2);
    });
  }

  // ══════════════════════════════════════════
  //  DESENHO DAS PEÇAS
  // ══════════════════════════════════════════
  drawPiece(x, y, color, num, selectable, pulseT, scale = 1, opacity = 1) {
    const { ctx, cs } = this;
    const p  = PALETTE[color];
    const r  = cs * 0.30 * scale;
    const t  = pulseT || 0;

    ctx.save();
    ctx.globalAlpha = opacity;

    // Bounce para peças seleccionáveis
    let bounceY = 0;
    if (selectable) {
      bounceY = Math.abs(Math.sin(t * 3.5)) * cs * 0.12;
      ctx.shadowColor = p.glow;
      ctx.shadowBlur  = 10 + 6 * (0.5 + 0.5 * Math.sin(t * 3));
    }

    const drawY = y - bounceY;

    // Sombra da peça no chão
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    ctx.ellipse(x, y + r * 0.3, r * 0.7, r * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.shadowColor = selectable ? p.glow : 'rgba(0,0,0,0.3)';
    ctx.shadowBlur  = selectable ? 12 : 5;

    // Corpo principal
    const grad = ctx.createRadialGradient(
      x - r * 0.3, drawY - r * 0.3, r * 0.05,
      x, drawY, r
    );
    grad.addColorStop(0, p.light);
    grad.addColorStop(0.45, p.main);
    grad.addColorStop(1, p.dark);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, drawY, r, 0, Math.PI * 2);
    ctx.fill();

    // Borda
    ctx.strokeStyle = p.dark;
    ctx.lineWidth   = 1.5;
    ctx.stroke();

    ctx.shadowBlur = 0;

    // Brilho superior
    const hl = ctx.createRadialGradient(
      x - r * 0.3, drawY - r * 0.35, 0,
      x - r * 0.3, drawY - r * 0.35, r * 0.6
    );
    hl.addColorStop(0, 'rgba(255,255,255,0.65)');
    hl.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = hl;
    ctx.beginPath();
    ctx.arc(x, drawY, r, 0, Math.PI * 2);
    ctx.fill();

    // Número
    ctx.fillStyle    = '#fff';
    ctx.strokeStyle  = p.dark;
    ctx.lineWidth    = 2;
    ctx.font         = `bold ${cs * 0.22 * scale}px "Bebas Neue", sans-serif`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.strokeText(String(num), x, drawY + cs * 0.01);
    ctx.fillText(String(num), x, drawY + cs * 0.01);

    ctx.restore();
  }

  // ══════════════════════════════════════════
  //  ANIMAÇÃO DE PEÇAS
  // ══════════════════════════════════════════
  animateMove(color, pieceIdx, fromPos, fromBase, toPos, toBase, onComplete) {
    const key  = color + '_' + pieceIdx;
    const from = this.getPieceCoord(color, fromPos, fromBase, pieceIdx);
    const to   = this.getPieceCoord(color, toPos,   toBase,   pieceIdx);

    if (!this.pieces[key]) {
      this.pieces[key] = { x: from.x, y: from.y, animating: false, scale: 1, opacity: 1 };
    }
    const piece = this.pieces[key];
    piece.animating = true;

    // Som
    if (fromBase && !toBase) {
      SFX.exitBase();
    } else if (toPos >= 58) {
      SFX.finish();
    } else {
      SFX.move();
    }

    if (fromBase && !toBase) {
      // Animação de saída: base → casa inicial → destino
      const sc = this._startCells[color];
      const wp = this._cc(sc[0], sc[1]);
      piece.x = from.x; piece.y = from.y;

      // Pulso de escala ao sair da base
      this._animScale(piece, 1, 1.35, 150, () => {
        this._animScale(piece, 1.35, 1, 100, null);
        this._animSegment(piece, from, wp, 280, () => {
          setTimeout(() => {
            this._animSegment(piece, wp, to, 320, () => {
              piece.animating = false;
              if (toPos >= 58) this._spawnConfetti(to.x, to.y, color);
              if (onComplete) onComplete();
            });
          }, 80);
        });
      });
    } else if (toPos >= 58) {
      // Chegou ao fim — animação especial
      piece.x = from.x; piece.y = from.y;
      this._animSegment(piece, from, to, 380, () => {
        this._animScale(piece, 1, 1.5, 200, () => {
          this._animScale(piece, 1.5, 1, 200, () => {
            piece.animating = false;
            this._spawnConfetti(to.x, to.y, color);
            if (onComplete) onComplete();
          });
        });
      });
    } else {
      // Movimento normal
      piece.x = from.x; piece.y = from.y;
      this._animSegment(piece, from, to, 350, () => {
        piece.animating = false;
        if (onComplete) onComplete();
      });
    }
  }

  animateCapture(color, pieceIdx) {
    const key = color + '_' + pieceIdx;
    if (!this.pieces[key]) return;
    const piece = this.pieces[key];
    SFX.capture();
    const cx = piece.x, cy = piece.y;
    this._spawnCaptureBurst(cx, cy, color);
    this._animScale(piece, 1, 2, 150, () => {
      this._animFade(piece, 1, 0, 180, () => {
        piece.scale   = 1;
        piece.opacity = 1;
        piece.animating = false;
      });
    });
  }

  // ── Animação de segmento (posição) ─────────
  _animSegment(piece, from, to, dur, onDone) {
    const start = performance.now();
    const dx = to.x - from.x, dy = to.y - from.y;
    const step = (now) => {
      const t = Math.min((now - start) / dur, 1);
      const e = 1 - Math.pow(1 - t, 3); // ease-out cubic
      piece.x = from.x + dx * e;
      piece.y = from.y + dy * e;
      if (t < 1) { requestAnimationFrame(step); }
      else { piece.x = to.x; piece.y = to.y; if (onDone) onDone(); }
    };
    requestAnimationFrame(step);
  }

  // ── Animação de escala ──────────────────────
  _animScale(piece, from, to, dur, onDone) {
    const start = performance.now();
    const step = (now) => {
      const t = Math.min((now - start) / dur, 1);
      const e = 1 - Math.pow(1 - t, 2);
      piece.scale = from + (to - from) * e;
      if (t < 1) { requestAnimationFrame(step); }
      else { piece.scale = to; if (onDone) onDone(); }
    };
    requestAnimationFrame(step);
  }

  // ── Animação de fade ────────────────────────
  _animFade(piece, from, to, dur, onDone) {
    const start = performance.now();
    const step = (now) => {
      const t = Math.min((now - start) / dur, 1);
      piece.opacity = from + (to - from) * t;
      if (t < 1) { requestAnimationFrame(step); }
      else { piece.opacity = to; if (onDone) onDone(); }
    };
    requestAnimationFrame(step);
  }

  // ══════════════════════════════════════════
  //  PARTÍCULAS
  // ══════════════════════════════════════════
  _spawnConfetti(x, y, color) {
    const p = PALETTE[color];
    for (let i = 0; i < 18; i++) {
      const angle = (i / 18) * Math.PI * 2 + Math.random() * 0.4;
      const speed = 2.5 + Math.random() * 3;
      this._particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 3,
        life: 1, decay: 0.022,
        color: Math.random() < 0.5 ? p.main : p.light,
        size: 3 + Math.random() * 4,
        rot: Math.random() * Math.PI * 2,
        rv: (Math.random() - 0.5) * 0.3,
        type: 'confetti',
      });
    }
  }

  _spawnCaptureBurst(x, y, color) {
    const p = PALETTE[color];
    for (let i = 0; i < 12; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1.5 + Math.random() * 2.5;
      this._particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 1.5,
        life: 1, decay: 0.035,
        color: p.main,
        size: 2 + Math.random() * 3,
        rot: 0, rv: 0,
        type: 'spark',
      });
    }
  }

  _updateParticles() {
    const { ctx } = this;
    this._particles = this._particles.filter(p => p.life > 0);
    this._particles.forEach(p => {
      p.x  += p.vx;
      p.y  += p.vy;
      p.vy += 0.18; // gravidade
      p.life -= p.decay;
      p.rot += p.rv;
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

  // ══════════════════════════════════════════
  //  EFEITO DADO
  // ══════════════════════════════════════════
  animateDice(finalVal, onDone) {
    SFX.dice();
    const el   = document.getElementById('dfc');
    const numEl = document.getElementById('dnm');
    const faces = ['⚀','⚁','⚂','⚃','⚄','⚅'];
    const total = 600; // ms
    const start = performance.now();
    let last = 0;
    const step = (now) => {
      const elapsed = now - start;
      if (elapsed - last > 60) {
        if (el) el.textContent = faces[Math.floor(Math.random() * 6)];
        last = elapsed;
      }
      if (elapsed < total) {
        requestAnimationFrame(step);
      } else {
        if (el) el.textContent = faces[finalVal - 1];
        if (numEl) numEl.textContent = finalVal;
        SFX.diceResult(finalVal);
        // Piscar o número
        if (numEl) {
          numEl.style.transform = 'scale(1.5)';
          numEl.style.transition = 'transform 0.2s';
          setTimeout(() => { numEl.style.transform = 'scale(1)'; }, 220);
        }
        if (onDone) onDone();
      }
    };
    requestAnimationFrame(step);
  }

  // ══════════════════════════════════════════
  //  HELPERS
  // ══════════════════════════════════════════
  _rrect(x, y, w, h, r) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
  }

  destroy() {
    if (this._rafId) cancelAnimationFrame(this._rafId);
  }
}
