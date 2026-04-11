/**
 * ludo_board.js — LudoKz v5
 * Formato do backend: players[].tokens[].{ x, y, is_locked, has_reached_home, colour, id }
 * Coordenadas: x=linha, y=coluna (grid 15×15)
 */

// ══════════════════════════════════════════════
//  SONS
// ══════════════════════════════════════════════
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
    exit:    function() { play('sfx_click', 0.8); },
    finish:  function() { play('sfx_in_home', 1.0); },
    win:     function() { play('sfx_win', 1.0); },
    tick:    function() { play('sfx_click', 0.3); },
    myTurn:  function() { play('sfx_my_turn', 0.7); },
    oppTurn: function() { play('sfx_opp_turn', 0.5); },
    blocked: function() { play('sfx_click', 0.4); },
  };
})();

// ══════════════════════════════════════════════
//  CORES
// ══════════════════════════════════════════════
const PALETTE = {
  red:    { main: '#e53935', light: '#ffcdd2', text: '#ffffff' },
  green:  { main: '#43a047', light: '#c8e6c9', text: '#ffffff' },
  blue:   { main: '#1e88e5', light: '#bbdefb', text: '#ffffff' },
  yellow: { main: '#fdd835', light: '#fff9c4', text: '#333300' },
};

// ══════════════════════════════════════════════
//  CASAS SEGURAS (linha, coluna)
// ══════════════════════════════════════════════
const SAFE_SET = new Set([
  '6,13','1,6','8,1','13,8',
  '8,12','2,8','6,2','12,6',
]);

function isSafe(row, col) {
  return SAFE_SET.has(Math.round(row) + ',' + Math.round(col));
}

// ══════════════════════════════════════════════
//  POSIÇÕES LOCKED de cada cor (do backend)
// ══════════════════════════════════════════════
const LOCKED_COORDS = {
  blue:   [[1.5,10.2],[3.5,10.2],[1.5,12.2],[3.5,12.2]],
  red:    [[1.5,1.2], [3.5,1.2], [1.5,3.2], [3.5,3.2]],
  green:  [[10.5,1.2],[12.5,1.2],[10.5,3.2],[12.5,3.2]],
  yellow: [[10.5,10.2],[12.5,10.2],[10.5,12.2],[12.5,12.2]],
};

// ══════════════════════════════════════════════
//  CLASSE PRINCIPAL
// ══════════════════════════════════════════════
class LudoBoard {
  constructor(canvas, size) {
    this.canvas      = canvas;
    this.ctx         = canvas.getContext('2d');
    this.size        = size;
    this.cs          = size / 15;
    this.pieces      = {};
    this._particles  = [];
    this._boardCache = null;
    this._pulse      = 0;
    this._rafId      = null;
    this._startLoop();
  }

  // Converte (linha, coluna) → píxeis canvas
  _toScreen(row, col) {
    return {
      sx: col * this.cs + this.cs * 0.5,
      sy: row * this.cs + this.cs * 0.5,
    };
  }

  // Alias usado pelo game_patch.js
  _gameToScreen(row, col) {
    return this._toScreen(row, col);
  }

  _startLoop() {
    var self = this;
    var tick = function(ts) {
      self._pulse = ts * 0.001;
      self._drawParticles();
      self._rafId = requestAnimationFrame(tick);
    };
    self._rafId = requestAnimationFrame(tick);
  }

  // ══════════════════════════════════════════
  //  TABULEIRO
  // ══════════════════════════════════════════
  drawBoard() {
    if (!this._boardCache) this._buildBoardCache();
    this.ctx.drawImage(this._boardCache, 0, 0);
  }

  _buildBoardCache() {
    var off = document.createElement('canvas');
    off.width = off.height = this.size;
    var g   = off.getContext('2d');
    var cs  = this.cs;
    var size = this.size;

    // Fundo branco
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, size, size);

    // Células
    for (var r = 0; r < 15; r++)
      for (var c = 0; c < 15; c++)
        this._drawCell(g, r, c);

    // Bases coloridas
    this._drawBase(g, 0,  0,  5,  5,  'red');
    this._drawBase(g, 0,  9,  5,  14, 'green');
    this._drawBase(g, 9,  0,  14, 5,  'blue');
    this._drawBase(g, 9,  9,  14, 14, 'yellow');

    // Retas finais
    this._drawHomeLanes(g);

    // Estrelas seguras
    this._drawSafeStars(g);

    // Centro
    this._drawCenter(g);

    // Borda externa
    g.strokeStyle = '#000000';
    g.lineWidth   = 3;
    g.strokeRect(1.5, 1.5, size - 3, size - 3);

    this._boardCache = off;
  }

  _drawCell(g, r, c) {
    var cs = this.cs;
    var x  = c * cs, y = r * cs;
    g.fillStyle = this._cellColor(r, c);
    g.fillRect(x, y, cs, cs);
    g.strokeStyle = '#cccccc';
    g.lineWidth   = 0.5;
    g.strokeRect(x, y, cs, cs);
  }

  _cellColor(r, c) {
    if (r <= 5 && c <= 5)  return PALETTE.red.light;
    if (r <= 5 && c >= 9)  return PALETTE.green.light;
    if (r >= 9 && c <= 5)  return PALETTE.blue.light;
    if (r >= 9 && c >= 9)  return PALETTE.yellow.light;
    if (r >= 6 && r <= 8 && c >= 6 && c <= 8) return '#ffffff';
    if (r === 7 && c >= 1 && c <= 5)  return PALETTE.red.light;
    if (c === 7 && r >= 1 && r <= 5)  return PALETTE.green.light;
    if (r === 7 && c >= 9 && c <= 13) return PALETTE.yellow.light;
    if (c === 7 && r >= 9 && r <= 13) return PALETTE.blue.light;
    return '#ffffff';
  }

  _drawBase(g, r1, c1, r2, c2, color) {
    var cs  = this.cs;
    var p   = PALETTE[color];
    var x   = c1 * cs, y = r1 * cs;
    var w   = (c2 - c1 + 1) * cs;
    var h   = (r2 - r1 + 1) * cs;

    g.fillStyle   = p.main;
    g.fillRect(x, y, w, h);
    g.strokeStyle = '#000000';
    g.lineWidth   = 2;
    g.strokeRect(x, y, w, h);

    var pad = cs * 0.55;
    g.fillStyle   = '#ffffff';
    g.fillRect(x + pad, y + pad, w - pad * 2, h - pad * 2);
    g.strokeStyle = '#000000';
    g.lineWidth   = 1.5;
    g.strokeRect(x + pad, y + pad, w - pad * 2, h - pad * 2);

    var coords = LOCKED_COORDS[color];
    for (var i = 0; i < coords.length; i++) {
      var row = coords[i][0], col = coords[i][1];
      var cx  = col * cs + cs * 0.5;
      var cy  = row * cs + cs * 0.5;
      var rad = cs * 0.28;

      g.fillStyle   = p.main;
      g.strokeStyle = '#000000';
      g.lineWidth   = 2;
      g.beginPath();
      g.arc(cx, cy, rad, 0, Math.PI * 2);
      g.fill();
      g.stroke();

      g.fillStyle = 'rgba(255,255,255,0.35)';
      g.beginPath();
      g.arc(cx - rad * 0.25, cy - rad * 0.28, rad * 0.38, 0, Math.PI * 2);
      g.fill();
    }
  }

  _drawHomeLanes(g) {
    var cs = this.cs;
    var lanes = [
      { cells: [[7,1],[7,2],[7,3],[7,4],[7,5]],     color: 'red',    arrow: '→' },
      { cells: [[1,7],[2,7],[3,7],[4,7],[5,7]],     color: 'green',  arrow: '↓' },
      { cells: [[7,9],[7,10],[7,11],[7,12],[7,13]], color: 'yellow', arrow: '←' },
      { cells: [[9,7],[10,7],[11,7],[12,7],[13,7]], color: 'blue',   arrow: '↑' },
    ];
    for (var li = 0; li < lanes.length; li++) {
      var lane = lanes[li];
      var p    = PALETTE[lane.color];
      for (var ci = 0; ci < lane.cells.length; ci++) {
        var row = lane.cells[ci][0], col = lane.cells[ci][1];
        var x   = col * cs, y = row * cs;
        g.fillStyle   = p.main;
        g.fillRect(x, y, cs, cs);
        g.strokeStyle = '#bbbbbb';
        g.lineWidth   = 0.5;
        g.strokeRect(x, y, cs, cs);
        if (ci === 0) {
          g.fillStyle     = '#ffffff';
          g.font          = 'bold ' + Math.round(cs * 0.55) + 'px sans-serif';
          g.textAlign     = 'center';
          g.textBaseline  = 'middle';
          g.fillText(lane.arrow, x + cs * 0.5, y + cs * 0.5);
        }
      }
    }
  }

  _drawSafeStars(g) {
    var cs     = this.cs;
    var safes  = [[6,13],[1,6],[8,1],[13,8],[8,12],[2,8],[6,2],[12,6]];
    g.font         = Math.round(cs * 0.55) + 'px serif';
    g.textAlign    = 'center';
    g.textBaseline = 'middle';
    g.fillStyle    = '#fdd835';
    for (var i = 0; i < safes.length; i++) {
      var row = safes[i][0], col = safes[i][1];
      g.fillText('★', col * cs + cs * 0.5, row * cs + cs * 0.5 + 1);
    }
  }

  _drawCenter(g) {
    var cs = this.cs;
    var tris = [
      { color: PALETTE.green.main,  pts: [[6,6],[9,6],[7.5,7.5]] },
      { color: PALETTE.yellow.main, pts: [[9,6],[9,9],[7.5,7.5]] },
      { color: PALETTE.blue.main,   pts: [[6,9],[9,9],[7.5,7.5]] },
      { color: PALETTE.red.main,    pts: [[6,6],[6,9],[7.5,7.5]] },
    ];
    for (var i = 0; i < tris.length; i++) {
      var t = tris[i];
      g.fillStyle = t.color;
      g.beginPath();
      g.moveTo(t.pts[0][0] * cs, t.pts[0][1] * cs);
      g.lineTo(t.pts[1][0] * cs, t.pts[1][1] * cs);
      g.lineTo(t.pts[2][0] * cs, t.pts[2][1] * cs);
      g.closePath();
      g.fill();
      g.strokeStyle = '#000000';
      g.lineWidth   = 0.5;
      g.stroke();
    }
    var cx = 7.5 * cs, cy = 7.5 * cs;
    g.fillStyle   = '#ffffff';
    g.strokeStyle = '#cccccc';
    g.lineWidth   = 1;
    g.beginPath();
    g.arc(cx, cy, cs * 1.05, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    g.fillStyle     = 'rgba(0,0,0,0.12)';
    g.font          = Math.round(cs * 1.3) + 'px serif';
    g.textAlign     = 'center';
    g.textBaseline  = 'middle';
    g.fillText('★', cx, cy + cs * 0.06);
  }

  // ══════════════════════════════════════════
  //  DESENHAR PEÇA
  // ══════════════════════════════════════════
  drawPiece(sx, sy, color, num, selectable, pulseT, scale, opacity) {
    scale   = scale   === undefined ? 1 : scale;
    opacity = opacity === undefined ? 1 : opacity;
    var ctx = this.ctx;
    var cs  = this.cs;
    var p   = PALETTE[color];
    if (!p) return;

    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, opacity));

    var t      = pulseT || 0;
    var bounce = selectable ? Math.abs(Math.sin(t * 3.5)) * cs * 0.10 : 0;
    var drawY  = sy - bounce;
    var r      = cs * 0.30 * scale;

    // Sombra
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath();
    ctx.ellipse(sx, sy + r * 0.28, r * 0.65, r * 0.18, 0, 0, Math.PI * 2);
    ctx.fill();

    // Corpo
    ctx.fillStyle   = p.main;
    ctx.strokeStyle = '#000000';
    ctx.lineWidth   = Math.max(1.5, scale * 1.8);
    ctx.beginPath();
    ctx.arc(sx, drawY, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Anel interno
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth   = Math.max(1, scale * 1.1);
    ctx.beginPath();
    ctx.arc(sx, drawY, r * 0.60, 0, Math.PI * 2);
    ctx.stroke();

    // Número
    var fs = Math.max(8, cs * 0.20 * scale);
    ctx.font          = 'bold ' + fs + 'px Arial, sans-serif';
    ctx.textAlign     = 'center';
    ctx.textBaseline  = 'middle';
    ctx.fillStyle     = p.text;
    ctx.fillText(String(num), sx, drawY + fs * 0.05);

    // Glow seleccionável
    if (selectable) {
      ctx.globalAlpha = 0.4 + 0.3 * Math.abs(Math.sin(t * 3));
      ctx.strokeStyle = p.main;
      ctx.lineWidth   = 3;
      ctx.beginPath();
      ctx.arc(sx, drawY, r + 5, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.restore();
  }

  // ══════════════════════════════════════════
  //  ANIMAÇÃO
  // ══════════════════════════════════════════

  // Chamado pelo game_patch.js com (colour, tokenId, prevRow, prevCol, nextRow, nextCol, wasLocked, cb)
  animateMove(colour, tokenId, fromRow, fromCol, toRow, toCol, wasLocked, onComplete) {
    var key  = colour + '_' + tokenId;
    var from = this._toScreen(fromRow, fromCol);
    var to   = this._toScreen(toRow,   toCol);

    if (!this.pieces[key])
      this.pieces[key] = { sx: from.sx, sy: from.sy, scale: 1, opacity: 1, animating: false };

    var piece = this.pieces[key];
    piece.animating = true;
    piece.sx = from.sx;
    piece.sy = from.sy;

    var isHome = (Math.round(toRow) === 7 && Math.round(toCol) === 7);

    if (wasLocked)     SFX.exit();
    else if (isHome)   SFX.finish();
    else if (isSafe(toRow, toCol)) SFX.tick();
    else               SFX.move();

    this._animTo(piece, from, to, 280, function() {
      piece.animating = false;
      if (isHome) this._spawnConfetti(to.sx, to.sy, colour);
      if (onComplete) onComplete();
    }.bind(this));
  }

  animateCaptureAt(colour, tokenId) {
    var key = colour + '_' + tokenId;
    if (!this.pieces[key]) return;
    SFX.capture();
    var p = this.pieces[key];
    this._spawnBurst(p.sx, p.sy, colour);
  }

  animateDice(finalVal, onDone) {
    SFX.dice();
    var faces = ['⚀','⚁','⚂','⚃','⚄','⚅'];
    var dur   = 600;
    var start = performance.now();
    var last  = 0;
    var step  = function(now) {
      var el   = now - start;
      var prog = el / dur;
      if (el - last > 50 + prog * 80) {
        var dfc = document.getElementById('dfc');
        if (dfc) dfc.textContent = faces[Math.floor(Math.random() * 6)];
        last = el;
      }
      if (el < dur) {
        requestAnimationFrame(step);
      } else {
        var dfc2 = document.getElementById('dfc');
        var dnm  = document.getElementById('dnm');
        if (dfc2) dfc2.textContent = faces[finalVal - 1];
        if (dnm)  dnm.textContent  = finalVal;
        if (onDone) onDone();
      }
    };
    requestAnimationFrame(step);
  }

  _animTo(piece, from, to, dur, onDone) {
    var start = performance.now();
    var dx = to.sx - from.sx, dy = to.sy - from.sy;
    var step = function(now) {
      var t = Math.min((now - start) / dur, 1);
      var e = 1 - Math.pow(1 - t, 3);
      piece.sx = from.sx + dx * e;
      piece.sy = from.sy + dy * e;
      if (t < 1) requestAnimationFrame(step);
      else { piece.sx = to.sx; piece.sy = to.sy; if (onDone) onDone(); }
    };
    requestAnimationFrame(step);
  }

  _spawnConfetti(x, y, color) {
    var p = PALETTE[color] || PALETTE.red;
    for (var i = 0; i < 18; i++) {
      var a = (i / 18) * Math.PI * 2;
      var s = 2 + Math.random() * 3;
      this._particles.push({
        x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 3,
        life: 1, decay: 0.020 + Math.random() * 0.008,
        color: [p.main, p.light, '#fff', '#fdd835'][Math.floor(Math.random() * 4)],
        size: 3 + Math.random() * 4, rot: Math.random() * Math.PI * 2,
        rv: (Math.random() - 0.5) * 0.3, type: 'confetti',
      });
    }
  }

  _spawnBurst(x, y, color) {
    var p = PALETTE[color] || PALETTE.red;
    for (var i = 0; i < 10; i++) {
      var a = Math.random() * Math.PI * 2;
      var s = 1.5 + Math.random() * 2.5;
      this._particles.push({
        x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 1.5,
        life: 1, decay: 0.04 + Math.random() * 0.015,
        color: p.main, size: 2 + Math.random() * 3,
        rot: 0, rv: 0, type: 'spark',
      });
    }
  }

  _drawParticles() {
    var ctx = this.ctx;
    this._particles = this._particles.filter(function(p) { return p.life > 0.01; });
    for (var i = 0; i < this._particles.length; i++) {
      var p = this._particles[i];
      p.x += p.vx; p.y += p.vy;
      p.vy += 0.22; p.vx *= 0.98;
      p.life -= p.decay; p.rot += p.rv;
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      if (p.type === 'confetti') {
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      } else {
        ctx.beginPath();
        ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  destroy() {
    if (this._rafId) cancelAnimationFrame(this._rafId);
    this._particles = [];
    this.pieces     = {};
  }
}

console.log('[LudoKz] ludo_board.js v5 carregado ✓');
