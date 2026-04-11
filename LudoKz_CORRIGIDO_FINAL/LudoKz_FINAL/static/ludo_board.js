/**
 * LudoBoard v2.0 — Motor Visual Profissional
 * Tabuleiro Canvas HD estilo Ludo King
 * Peças 3D, animações fluidas, sons ricos, partículas
 * Compatible com backend LudoKz (SSE, apostas, salas)
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

  function tone(freq, type, dur, vol = 0.25, delay = 0, detune = 0) {
    try {
      const ac   = getCtx();
      const osc  = ac.createOscillator();
      const gain = ac.createGain();
      const comp = ac.createDynamicsCompressor();
      osc.connect(gain);
      gain.connect(comp);
      comp.connect(ac.destination);
      osc.type = type;
      osc.frequency.value = freq;
      osc.detune.value    = detune;
      const t = ac.currentTime + delay;
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(vol, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
      osc.start(t);
      osc.stop(t + dur + 0.05);
    } catch (e) {}
  }

  function noise(dur, vol = 0.15, freq = 2000) {
    try {
      const ac  = getCtx();
      const buf = ac.createBuffer(1, ac.sampleRate * dur, ac.sampleRate);
      const d   = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      const src    = ac.createBufferSource();
      const filter = ac.createBiquadFilter();
      const gain   = ac.createGain();
      filter.type  = 'bandpass';
      filter.frequency.value = freq;
      src.buffer = buf;
      src.connect(filter);
      filter.connect(gain);
      gain.connect(ac.destination);
      gain.gain.setValueAtTime(vol, ac.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + dur);
      src.start();
      src.stop(ac.currentTime + dur + 0.05);
    } catch (e) {}
  }

  return {
    dice() {
      noise(0.08, 0.18, 3000);
      noise(0.08, 0.12, 1500, 0.06);
      tone(180, 'square', 0.04, 0.06, 0.05);
      tone(220, 'square', 0.04, 0.06, 0.10);
      tone(160, 'square', 0.05, 0.07, 0.15);
      noise(0.06, 0.15, 4000, 0.18);
    },
    diceResult(val) {
      const chord = {
        1: [261],
        2: [261, 329],
        3: [261, 329, 392],
        4: [349, 440],
        5: [392, 494, 587],
        6: [523, 659, 784],
      };
      (chord[val] || [261]).forEach((f, i) =>
        tone(f, 'sine', 0.35, 0.22, i * 0.04));
    },
    move() {
      tone(440, 'sine',     0.09, 0.18);
      tone(554, 'triangle', 0.08, 0.14, 0.07);
      tone(659, 'sine',     0.10, 0.12, 0.13);
    },
    capture() {
      tone(330, 'sawtooth', 0.06, 0.28);
      tone(220, 'sawtooth', 0.10, 0.30, 0.05);
      tone(147, 'sawtooth', 0.15, 0.25, 0.10);
      noise(0.18, 0.20, 800);
    },
    exitBase() {
      tone(392, 'sine', 0.08, 0.20);
      tone(494, 'sine', 0.08, 0.20, 0.07);
      tone(587, 'sine', 0.10, 0.22, 0.14);
      tone(784, 'sine', 0.12, 0.18, 0.22);
    },
    finish() {
      [523, 659, 784, 1047].forEach((f, i) =>
        tone(f, 'sine', 0.22, 0.28, i * 0.09));
      setTimeout(() => tone(1047, 'triangle', 0.4, 0.2), 400);
    },
    win() {
      const seq = [523, 659, 784, 1047, 1319, 1568];
      seq.forEach((f, i) => tone(f, 'sine', 0.3, 0.28, i * 0.08));
      setTimeout(() => {
        [1047, 1319, 1568, 2093].forEach((f, i) =>
          tone(f, 'triangle', 0.35, 0.22, i * 0.09));
      }, 550);
      setTimeout(() => noise(0.3, 0.08, 6000), 900);
    },
    blocked() {
      tone(220, 'sawtooth', 0.12, 0.28);
      tone(165, 'sawtooth', 0.18, 0.24, 0.10);
      tone(110, 'sawtooth', 0.20, 0.20, 0.20);
    },
    tick() {
      tone(900, 'square', 0.03, 0.07);
    },
    safe() {
      tone(659, 'sine', 0.12, 0.15);
      tone(784, 'sine', 0.10, 0.12, 0.08);
    },
  };
})();

// ══════════════════════════════════════════════
//  PALETA DE CORES (estilo Ludo King premium)
// ══════════════════════════════════════════════
const PALETTE = {
  g: {
    main:   '#16a34a',
    mid:    '#22c55e',
    light:  '#86efac',
    xlight: '#dcfce7',
    dark:   '#14532d',
    glow:   'rgba(34,197,94,0.7)',
    path:   '#f0fdf4',
    shadow: 'rgba(20,83,45,0.5)',
  },
  y: {
    main:   '#ca8a04',
    mid:    '#eab308',
    light:  '#fde047',
    xlight: '#fefce8',
    dark:   '#713f12',
    glow:   'rgba(234,179,8,0.7)',
    path:   '#fefce8',
    shadow: 'rgba(113,63,18,0.5)',
  },
  r: {
    main:   '#dc2626',
    mid:    '#ef4444',
    light:  '#fca5a5',
    xlight: '#fff1f2',
    dark:   '#7f1d1d',
    glow:   'rgba(239,68,68,0.7)',
    path:   '#fff1f2',
    shadow: 'rgba(127,29,29,0.5)',
  },
  b: {
    main:   '#1d4ed8',
    mid:    '#3b82f6',
    light:  '#93c5fd',
    xlight: '#eff6ff',
    dark:   '#1e3a8a',
    glow:   'rgba(59,130,246,0.7)',
    path:   '#eff6ff',
    shadow: 'rgba(30,58,138,0.5)',
  },
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

    // Estado de animação de cada peça
    // key: "color_idx" → { x, y, scale, opacity, animating }
    this.pieces = {};

    // Tempo pulsante
    this._pulse = 0;
    this._rafId = null;

    // Partículas
    this._particles = [];

    // Cache do tabuleiro (evita redesenhar a cada frame)
    this._boardCache    = null;
    this._boardCacheDirty = true;

    // Construir caminhos
    this._buildPaths();

    // Loop de render
    this._startLoop();
  }

  // ─────────────────────────────────────────
  //  PATHS
  // ─────────────────────────────────────────
  _buildPaths() {
    const p = [];
    // Início verde: row6, col1→5
    for (let c = 1; c <= 5; c++) p.push([6, c]);
    // Sobe col5: row5→0
    for (let r = 5; r >= 0; r--) p.push([r, 5]);
    // Topo: row0, col6→8
    for (let c = 6; c <= 8; c++) p.push([0, c]);
    // Desce col9: row1→5
    for (let r = 1; r <= 5; r++) p.push([r, 9]);
    // Meio-direita: row6, col9→13
    for (let c = 9; c <= 13; c++) p.push([6, c]);
    // Direita: row7→8, col14
    for (let r = 7; r <= 8; r++) p.push([r, 14]);
    // Meio-baixo-direita: row8, col13→9
    for (let c = 13; c >= 9; c--) p.push([8, c]);
    // Desce col9: row9→13
    for (let r = 9; r <= 13; r++) p.push([r, 9]);
    // Fundo: row14, col8→6
    for (let c = 8; c >= 6; c--) p.push([14, c]);
    // Sobe col5: row13→9
    for (let r = 13; r >= 9; r--) p.push([r, 5]);
    // Meio-baixo-esq: row8, col5→1
    for (let c = 5; c >= 1; c--) p.push([8, c]);
    // Esquerda: row7→6, col0
    for (let r = 7; r >= 6; r--) p.push([r, 0]);

    this._globalPath = p.slice(0, 52);

    this._homePaths = {
      g: [[1,7],[2,7],[3,7],[4,7],[5,7],[6,7]],
      y: [[7,13],[7,12],[7,11],[7,10],[7,9],[7,8]],
      r: [[13,7],[12,7],[11,7],[10,7],[9,7],[8,7]],
      b: [[7,1],[7,2],[7,3],[7,4],[7,5],[7,6]],
    };

    this._startOffset = { g: 0, y: 13, r: 26, b: 39 };

    this._basePosns = {
      g: [[2,2],[2,4],[4,2],[4,4]],
      y: [[2,10],[2,12],[4,10],[4,12]],
      r: [[10,2],[10,4],[12,2],[12,4]],
      b: [[10,10],[10,12],[12,10],[12,12]],
    };

    // Casa inicial de cada cor no caminho global
    this._startCells = { g: [6,1], y: [1,9], r: [8,13], b: [13,5] };

    // Índices seguros no globalPath (estrela)
    this._safeIdx = new Set([0, 8, 13, 21, 26, 34, 39, 47]);

    // Índice de "entrada da reta final" para cada cor
    this._homeEntryGlobal = { g: 50, y: 11, r: 24, b: 37 };
  }

  // ─────────────────────────────────────────
  //  COORDENADAS
  // ─────────────────────────────────────────
  _cc(row, col) {
    return {
      x: col * this.cs + this.cs * 0.5,
      y: row * this.cs + this.cs * 0.5,
    };
  }

  getPieceCoord(color, pos, inBase, idx) {
    if (inBase || pos === 0) {
      const b = this._basePosns[color][idx] || this._basePosns[color][0];
      return this._cc(b[0], b[1]);
    }
    if (pos >= 58) {
      return this._cc(this._homePaths[color][5][0], this._homePaths[color][5][1]);
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

  // ─────────────────────────────────────────
  //  LOOP DE RENDER
  // ─────────────────────────────────────────
  _startLoop() {
    const loop = (ts) => {
      this._pulse = ts * 0.001;
      this._updateParticles();
      this._rafId = requestAnimationFrame(loop);
    };
    this._rafId = requestAnimationFrame(loop);
  }

  // ══════════════════════════════════════════
  //  DESENHO DO TABULEIRO
  // ══════════════════════════════════════════
  drawBoard() {
    const { ctx, size } = this;

    // Usar cache se disponível
    if (!this._boardCache || this._boardCacheDirty) {
      this._renderBoardToCache();
    }

    // Desenhar cache
    ctx.drawImage(this._boardCache, 0, 0);
  }

  _renderBoardToCache() {
    const offscreen = document.createElement('canvas');
    offscreen.width  = this.size;
    offscreen.height = this.size;
    const oc = offscreen.getContext('2d');

    const { cs, size } = this;

    // ── Fundo geral
    oc.fillStyle = '#f1f5f9';
    oc.fillRect(0, 0, size, size);

    // ── Células base
    for (let r = 0; r < 15; r++) {
      for (let c = 0; c < 15; c++) {
        this._drawCellTo(oc, r, c);
      }
    }

    // ── Bases coloridas (quadrantes)
    this._drawBaseTo(oc, 0, 0, 5, 5, 'g');
    this._drawBaseTo(oc, 0, 9, 5, 14, 'y');
    this._drawBaseTo(oc, 9, 0, 14, 5, 'r');
    this._drawBaseTo(oc, 9, 9, 14, 14, 'b');

    // ── Retas finais com gradiente
    this._drawHomePathsTo(oc);

    // ── Estrelas nas casas seguras
    this._drawSafeStarsTo(oc);

    // ── Centro
    this._drawCenterTo(oc);

    // ── Bordas do tabuleiro
    oc.strokeStyle = 'rgba(0,0,0,0.12)';
    oc.lineWidth   = 1.5;
    oc.strokeRect(0.75, 0.75, size - 1.5, size - 1.5);

    this._boardCache = offscreen;
    this._boardCacheDirty = false;
  }

  _drawCellTo(oc, r, c) {
    const { cs } = this;
    const x = c * cs, y = r * cs;
    const col = this._cellBgColor(r, c);
    oc.fillStyle = col;
    oc.fillRect(x, y, cs, cs);
    oc.strokeStyle = 'rgba(0,0,0,0.06)';
    oc.lineWidth   = 0.5;
    oc.strokeRect(x, y, cs, cs);
  }

  _cellBgColor(r, c) {
    // Quadrantes base
    if (r >= 0 && r <= 5 && c >= 0 && c <= 5)   return PALETTE.g.xlight;
    if (r >= 0 && r <= 5 && c >= 9 && c <= 14)  return PALETTE.y.xlight;
    if (r >= 9 && r <= 14 && c >= 0 && c <= 5)  return PALETTE.r.xlight;
    if (r >= 9 && r <= 14 && c >= 9 && c <= 14) return PALETTE.b.xlight;
    // Centro
    if (r >= 6 && r <= 8 && c >= 6 && c <= 8)   return '#ffffff';
    // Retas finais
    if (c === 7 && r >= 1 && r <= 5)   return PALETTE.g.path;
    if (r === 7 && c >= 9 && c <= 13)  return PALETTE.y.path;
    if (c === 7 && r >= 9 && r <= 13)  return PALETTE.r.path;
    if (r === 7 && c >= 1 && c <= 5)   return PALETTE.b.path;
    return '#ffffff';
  }

  _drawBaseTo(oc, r1, c1, r2, c2, color) {
    const { cs } = this;
    const p    = PALETTE[color];
    const pad  = cs * 0.12;
    const x    = c1 * cs + pad;
    const y    = r1 * cs + pad;
    const w    = (c2 - c1 + 1) * cs - pad * 2;
    const h    = (r2 - r1 + 1) * cs - pad * 2;
    const rad  = cs * 0.55;

    // Sombra externa
    oc.save();
    oc.shadowColor = p.shadow;
    oc.shadowBlur  = 14;
    oc.shadowOffsetY = 3;

    // Fundo principal
    const bgGrad = oc.createLinearGradient(x, y, x + w, y + h);
    bgGrad.addColorStop(0,   p.mid);
    bgGrad.addColorStop(0.5, p.main);
    bgGrad.addColorStop(1,   p.dark);
    oc.fillStyle = bgGrad;
    this._rrectTo(oc, x, y, w, h, rad);
    oc.fill();
    oc.restore();

    // Borda interna brilhante
    oc.save();
    oc.strokeStyle = 'rgba(255,255,255,0.4)';
    oc.lineWidth   = 1.5;
    this._rrectTo(oc, x + 1, y + 1, w - 2, h - 2, rad - 1);
    oc.stroke();
    oc.restore();

    // Painel interno branco
    const ip  = cs * 0.6;
    const ix  = c1 * cs + ip;
    const iy  = r1 * cs + ip;
    const iw  = (c2 - c1 + 1) * cs - ip * 2;
    const ih  = (r2 - r1 + 1) * cs - ip * 2;
    const irad = cs * 0.35;

    oc.fillStyle = 'rgba(255,255,255,0.92)';
    this._rrectTo(oc, ix, iy, iw, ih, irad);
    oc.fill();

    // 4 círculos de posição na base
    const bpos = this._basePosns[color];
    bpos.forEach(([br, bc]) => {
      const cx = bc * cs + cs * 0.5;
      const cy = br * cs + cs * 0.5;
      const r  = cs * 0.28;

      // Sombra
      oc.save();
      oc.shadowColor  = p.shadow;
      oc.shadowBlur   = 7;
      oc.shadowOffsetY = 2;

      // Círculo externo (anel)
      oc.fillStyle = p.main;
      oc.beginPath();
      oc.arc(cx, cy, r, 0, Math.PI * 2);
      oc.fill();
      oc.restore();

      // Anel inner
      oc.fillStyle = 'rgba(255,255,255,0.3)';
      oc.beginPath();
      oc.arc(cx, cy, r * 0.72, 0, Math.PI * 2);
      oc.fill();

      // Centro colorido
      const cg = oc.createRadialGradient(
        cx - r * 0.28, cy - r * 0.28, r * 0.04,
        cx, cy, r * 0.68
      );
      cg.addColorStop(0, p.light);
      cg.addColorStop(1, p.main);
      oc.fillStyle = cg;
      oc.beginPath();
      oc.arc(cx, cy, r * 0.68, 0, Math.PI * 2);
      oc.fill();

      // Brilho
      oc.fillStyle = 'rgba(255,255,255,0.5)';
      oc.beginPath();
      oc.arc(cx - r * 0.22, cy - r * 0.22, r * 0.28, 0, Math.PI * 2);
      oc.fill();
    });
  }

  _drawHomePathsTo(oc) {
    const { cs } = this;
    const arrows = [
      { cells: this._homePaths.g, arrow: '▼', color: PALETTE.g },
      { cells: this._homePaths.y, arrow: '◀', color: PALETTE.y },
      { cells: this._homePaths.r, arrow: '▲', color: PALETTE.r },
      { cells: this._homePaths.b, arrow: '▶', color: PALETTE.b },
    ];

    arrows.forEach(({ cells, arrow, color }) => {
      cells.slice(0, 5).forEach(([row, col], i) => {
        const x = col * cs, y = row * cs;
        // Gradiente na reta final
        const grad = oc.createLinearGradient(x, y, x + cs, y + cs);
        grad.addColorStop(0, color.xlight);
        grad.addColorStop(1, color.path);
        oc.fillStyle = grad;
        oc.fillRect(x, y, cs, cs);

        // Seta
        oc.fillStyle    = color.main;
        oc.globalAlpha  = 0.55 + i * 0.07;
        oc.font         = `bold ${cs * 0.45}px sans-serif`;
        oc.textAlign    = 'center';
        oc.textBaseline = 'middle';
        oc.fillText(arrow, x + cs * 0.5, y + cs * 0.5);
        oc.globalAlpha  = 1;

        // Grid
        oc.strokeStyle = 'rgba(0,0,0,0.06)';
        oc.lineWidth   = 0.5;
        oc.strokeRect(x, y, cs, cs);
      });
    });
  }

  _drawSafeStarsTo(oc) {
    const { cs } = this;
    this._safeIdx.forEach(idx => {
      if (idx >= this._globalPath.length) return;
      const [row, col] = this._globalPath[idx];
      const x = col * cs, y = row * cs;

      // Fundo amarelado
      oc.fillStyle = 'rgba(253,224,71,0.28)';
      oc.fillRect(x, y, cs, cs);

      // Estrela
      oc.fillStyle    = 'rgba(161,107,0,0.7)';
      oc.font         = `${cs * 0.52}px serif`;
      oc.textAlign    = 'center';
      oc.textBaseline = 'middle';
      oc.fillText('★', x + cs * 0.5, y + cs * 0.5 + cs * 0.03);
    });
  }

  _drawCenterTo(oc) {
    const { cs } = this;
    const cx = 7.5 * cs, cy = 7.5 * cs;
    const half = 1.5 * cs;

    // 4 triângulos coloridos
    const tris = [
      { color: PALETTE.g.main, pts: [[6,6],[9,6],[7.5,7.5]] },
      { color: PALETTE.y.main, pts: [[9,6],[9,9],[7.5,7.5]] },
      { color: PALETTE.r.main, pts: [[6,9],[9,9],[7.5,7.5]] },
      { color: PALETTE.b.main, pts: [[6,6],[6,9],[7.5,7.5]] },
    ];

    tris.forEach(({ color, pts }) => {
      oc.save();
      oc.shadowColor  = 'rgba(0,0,0,0.2)';
      oc.shadowBlur   = 6;
      oc.fillStyle    = color;
      oc.beginPath();
      oc.moveTo(pts[0][0] * cs, pts[0][1] * cs);
      oc.lineTo(pts[1][0] * cs, pts[1][1] * cs);
      oc.lineTo(pts[2][0] * cs, pts[2][1] * cs);
      oc.closePath();
      oc.fill();
      oc.restore();
    });

    // Sobreposição branca brilhante no centro
    oc.save();
    oc.shadowColor  = 'rgba(255,255,255,0.6)';
    oc.shadowBlur   = 18;
    const cGrad = oc.createRadialGradient(cx, cy, 0, cx, cy, cs * 1.15);
    cGrad.addColorStop(0,   '#ffffff');
    cGrad.addColorStop(0.6, 'rgba(255,255,255,0.95)');
    cGrad.addColorStop(1,   'rgba(255,255,255,0.8)');
    oc.fillStyle = cGrad;
    oc.beginPath();
    oc.arc(cx, cy, cs * 1.1, 0, Math.PI * 2);
    oc.fill();
    oc.restore();

    // Anel decorativo
    oc.strokeStyle = 'rgba(0,0,0,0.08)';
    oc.lineWidth   = 1.5;
    oc.beginPath();
    oc.arc(cx, cy, cs * 1.1, 0, Math.PI * 2);
    oc.stroke();

    // Estrela central
    oc.fillStyle    = 'rgba(0,0,0,0.1)';
    oc.font         = `${cs * 1.4}px serif`;
    oc.textAlign    = 'center';
    oc.textBaseline = 'middle';
    oc.fillText('★', cx, cy + cs * 0.06);
  }

  // ══════════════════════════════════════════
  //  DESENHO DAS PEÇAS
  // ══════════════════════════════════════════
  drawPiece(x, y, color, num, selectable, pulseT, scale = 1, opacity = 1) {
    const { ctx, cs } = this;
    const p = PALETTE[color];
    const t = pulseT || 0;

    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, opacity));

    // Bounce para seleccionáveis
    let bounceY = 0;
    if (selectable) {
      bounceY = Math.abs(Math.sin(t * 3.2)) * cs * 0.14;
    }

    const drawY = y - bounceY;
    const r     = cs * 0.28 * scale;

    // Sombra no chão
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath();
    ctx.ellipse(x, y + r * 0.35, r * 0.75, r * 0.22, 0, 0, Math.PI * 2);
    ctx.fill();

    // Glow para seleccionáveis
    if (selectable) {
      ctx.save();
      ctx.shadowColor = p.glow;
      ctx.shadowBlur  = 14 + 6 * Math.abs(Math.sin(t * 3));
      ctx.beginPath();
      ctx.arc(x, drawY, r + 2, 0, Math.PI * 2);
      ctx.fillStyle = p.glow;
      ctx.fill();
      ctx.restore();
    }

    // ── Corpo 3D da peça ──
    ctx.save();
    ctx.shadowColor  = p.shadow;
    ctx.shadowBlur   = selectable ? 10 : 5;
    ctx.shadowOffsetY = 2;

    // Gradiente radial 3D
    const grad = ctx.createRadialGradient(
      x - r * 0.32, drawY - r * 0.32, r * 0.04,
      x,            drawY,            r
    );
    grad.addColorStop(0,    p.light);
    grad.addColorStop(0.4,  p.mid);
    grad.addColorStop(0.75, p.main);
    grad.addColorStop(1,    p.dark);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, drawY, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Borda
    ctx.strokeStyle = p.dark;
    ctx.lineWidth   = scale * 1.2;
    ctx.beginPath();
    ctx.arc(x, drawY, r, 0, Math.PI * 2);
    ctx.stroke();

    // Brilho superior (especular)
    const hl = ctx.createRadialGradient(
      x - r * 0.3, drawY - r * 0.32, 0,
      x - r * 0.3, drawY - r * 0.32, r * 0.65
    );
    hl.addColorStop(0, 'rgba(255,255,255,0.72)');
    hl.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = hl;
    ctx.beginPath();
    ctx.arc(x, drawY, r, 0, Math.PI * 2);
    ctx.fill();

    // Número da peça
    const fontSize = Math.max(8, cs * 0.20 * scale);
    ctx.font         = `bold ${fontSize}px "Bebas Neue", "Arial Black", sans-serif`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.strokeStyle  = p.dark;
    ctx.lineWidth    = 2 * scale;
    ctx.strokeText(String(num), x, drawY + fontSize * 0.06);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(String(num), x, drawY + fontSize * 0.06);

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
      this.pieces[key] = { x: from.x, y: from.y, scale: 1, opacity: 1, animating: false };
    }
    const piece = this.pieces[key];
    piece.animating = true;
    piece.x = from.x;
    piece.y = from.y;

    // Sons contextuais
    if (fromBase && !toBase) {
      SFX.exitBase();
    } else if (toPos >= 58) {
      SFX.finish();
    } else {
      // Verificar se é casa segura
      const off   = this._startOffset[color];
      const gIdx  = (off + toPos - 1) % 52;
      if (this._safeIdx.has(gIdx)) {
        SFX.safe();
      } else {
        SFX.move();
      }
    }

    if (fromBase && !toBase) {
      // Saída da base: bounce + caminho
      const sc = this._startCells[color];
      const wp = this._cc(sc[0], sc[1]);

      this._animScale(piece, 1, 1.4, 130, () => {
        this._animScale(piece, 1.4, 1, 100, null);
        this._animSegment(piece, from, wp, 260, () => {
          this._spawnTrail(piece.x, piece.y, color);
          setTimeout(() => {
            this._animSegment(piece, wp, to, 300, () => {
              piece.animating = false;
              this._spawnTrail(piece.x, piece.y, color);
              if (onComplete) onComplete();
            });
          }, 60);
        });
      });

    } else if (toPos >= 58) {
      // Chegou ao centro
      this._animSegment(piece, from, to, 380, () => {
        this._animScale(piece, 1, 1.55, 180, () => {
          this._animScale(piece, 1.55, 1, 200, () => {
            piece.animating = false;
            this._spawnConfetti(to.x, to.y, color);
            if (onComplete) onComplete();
          });
        });
      });

    } else {
      // Movimento normal com micro-bounce
      this._animSegment(piece, from, to, 320, () => {
        this._animScale(piece, 1, 1.18, 90, () => {
          this._animScale(piece, 1.18, 1, 110, () => {
            piece.animating = false;
            if (onComplete) onComplete();
          });
        });
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
    this._animScale(piece, 1, 2, 130, () => {
      this._animFade(piece, 1, 0, 160, () => {
        piece.scale    = 1;
        piece.opacity  = 1;
        piece.animating = false;
      });
    });
  }

  // ── Segmento ─────────────────────────────
  _animSegment(piece, from, to, dur, onDone) {
    const start = performance.now();
    const dx    = to.x - from.x;
    const dy    = to.y - from.y;
    const step  = (now) => {
      const raw = Math.min((now - start) / dur, 1);
      // Ease-out cubic
      const e = 1 - Math.pow(1 - raw, 3);
      piece.x = from.x + dx * e;
      piece.y = from.y + dy * e;
      if (raw < 1) {
        requestAnimationFrame(step);
      } else {
        piece.x = to.x;
        piece.y = to.y;
        if (onDone) onDone();
      }
    };
    requestAnimationFrame(step);
  }

  // ── Escala ───────────────────────────────
  _animScale(piece, from, to, dur, onDone) {
    const start = performance.now();
    const step  = (now) => {
      const raw = Math.min((now - start) / dur, 1);
      const e   = 1 - Math.pow(1 - raw, 2);
      piece.scale = from + (to - from) * e;
      if (raw < 1) { requestAnimationFrame(step); }
      else { piece.scale = to; if (onDone) onDone(); }
    };
    requestAnimationFrame(step);
  }

  // ── Fade ─────────────────────────────────
  _animFade(piece, from, to, dur, onDone) {
    const start = performance.now();
    const step  = (now) => {
      const raw = Math.min((now - start) / dur, 1);
      piece.opacity = from + (to - from) * raw;
      if (raw < 1) { requestAnimationFrame(step); }
      else { piece.opacity = to; if (onDone) onDone(); }
    };
    requestAnimationFrame(step);
  }

  // ══════════════════════════════════════════
  //  EFEITO DADO
  // ══════════════════════════════════════════
  animateDice(finalVal, onDone) {
    SFX.dice();
    const el    = document.getElementById('dfc');
    const numEl = document.getElementById('dnm');
    const faces = ['⚀','⚁','⚂','⚃','⚄','⚅'];
    const total = 700;
    const start = performance.now();
    let lastSwap = 0;
    let interval = 55;

    const step = (now) => {
      const elapsed = now - start;
      const progress = elapsed / total;
      // Abrandar no final
      interval = 55 + progress * 80;

      if (elapsed - lastSwap > interval) {
        if (el) el.textContent = faces[Math.floor(Math.random() * 6)];
        lastSwap = elapsed;
      }

      if (elapsed < total) {
        requestAnimationFrame(step);
      } else {
        if (el) {
          el.textContent = faces[finalVal - 1];
          // Pulso
          el.style.transform  = 'scale(1.4)';
          el.style.transition = 'transform 0.15s cubic-bezier(.34,1.56,.64,1)';
          setTimeout(() => { el.style.transform = 'scale(1)'; }, 160);
        }
        if (numEl) {
          numEl.textContent   = finalVal;
          numEl.style.transform  = 'scale(1.6)';
          numEl.style.transition = 'transform 0.18s cubic-bezier(.34,1.56,.64,1)';
          setTimeout(() => { numEl.style.transform = 'scale(1)'; }, 200);
        }
        SFX.diceResult(finalVal);
        if (onDone) onDone();
      }
    };
    requestAnimationFrame(step);
  }

  // ══════════════════════════════════════════
  //  PARTÍCULAS
  // ══════════════════════════════════════════
  _spawnConfetti(x, y, color) {
    const p = PALETTE[color];
    for (let i = 0; i < 24; i++) {
      const angle = (i / 24) * Math.PI * 2 + Math.random() * 0.35;
      const speed = 2.8 + Math.random() * 3.5;
      const cols  = [p.main, p.mid, p.light, '#ffffff', '#fde047'];
      this._particles.push({
        x, y,
        vx:    Math.cos(angle) * speed,
        vy:    Math.sin(angle) * speed - 3.5,
        life:  1,
        decay: 0.018 + Math.random() * 0.008,
        color: cols[Math.floor(Math.random() * cols.length)],
        size:  3.5 + Math.random() * 4.5,
        rot:   Math.random() * Math.PI * 2,
        rv:    (Math.random() - 0.5) * 0.35,
        type:  'confetti',
        wide:  1.5 + Math.random() * 2,
      });
    }
  }

  _spawnCaptureBurst(x, y, color) {
    const p = PALETTE[color];
    for (let i = 0; i < 16; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1.8 + Math.random() * 3;
      this._particles.push({
        x, y,
        vx:    Math.cos(angle) * speed,
        vy:    Math.sin(angle) * speed - 2,
        life:  1,
        decay: 0.03 + Math.random() * 0.015,
        color: Math.random() < 0.5 ? p.main : '#ffffff',
        size:  2.5 + Math.random() * 3.5,
        rot:   0, rv: 0,
        type:  'spark',
      });
    }
  }

  _spawnTrail(x, y, color) {
    const p = PALETTE[color];
    for (let i = 0; i < 4; i++) {
      this._particles.push({
        x: x + (Math.random() - 0.5) * this.cs * 0.3,
        y: y + (Math.random() - 0.5) * this.cs * 0.3,
        vx: (Math.random() - 0.5) * 0.8,
        vy: -Math.random() * 1.2,
        life:  0.7,
        decay: 0.055,
        color: p.light,
        size:  2 + Math.random() * 2,
        rot: 0, rv: 0,
        type: 'spark',
      });
    }
  }

  _updateParticles() {
    const { ctx } = this;
    this._particles = this._particles.filter(p => p.life > 0.01);
    this._particles.forEach(p => {
      p.x    += p.vx;
      p.y    += p.vy;
      p.vy   += 0.20;   // gravidade
      p.vx   *= 0.985;  // fricção
      p.life -= p.decay;
      p.rot  += p.rv;

      ctx.save();
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);

      if (p.type === 'confetti') {
        ctx.fillStyle = p.color;
        ctx.fillRect(-(p.size / 2), -(p.size / 4), p.size, p.wide || p.size / 2);
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
  //  HELPERS
  // ══════════════════════════════════════════
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

  // Compat: alias para código legado
  _rrect(x, y, w, h, r) {
    this._rrectTo(this.ctx, x, y, w, h, r);
  }

  destroy() {
    if (this._rafId) cancelAnimationFrame(this._rafId);
    this._particles = [];
    this.pieces     = {};
  }
}
