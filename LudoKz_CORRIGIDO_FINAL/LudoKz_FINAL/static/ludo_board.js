/**
 * LudoBoard v3.0 — Motor Visual Profissional
 * Adaptado para o novo game_manager.py (sistema de coordenadas x,y reais)
 * Cores exactas do SVG: Vermelho #ff0002 | Verde #049645 | Azul #1295e7 | Amarelo #ffde15
 *
 * O novo game_manager envia tokens com:
 *   { x, y, is_locked, has_reached_home, colour, id }
 * Em vez do sistema antigo (pos 0-58, in_base)
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
    dice()        { noise(0.08,0.18,3000); tone(180,'square',0.04,0.06,0.05); tone(220,'square',0.04,0.06,0.10); noise(0.06,0.15,4000,0.18); },
    diceResult(v) { const c={1:[261],2:[261,329],3:[261,329,392],4:[349,440],5:[392,494,587],6:[523,659,784]}; (c[v]||[261]).forEach((f,i)=>tone(f,'sine',0.35,0.22,i*0.04)); },
    move()        { tone(440,'sine',0.09,0.18); tone(554,'triangle',0.08,0.14,0.07); tone(659,'sine',0.10,0.12,0.13); },
    capture()     { tone(330,'sawtooth',0.06,0.28); tone(220,'sawtooth',0.10,0.30,0.05); noise(0.18,0.20,800); },
    exitBase()    { tone(392,'sine',0.08,0.20); tone(494,'sine',0.08,0.20,0.07); tone(587,'sine',0.10,0.22,0.14); tone(784,'sine',0.12,0.18,0.22); },
    finish()      { [523,659,784,1047].forEach((f,i)=>tone(f,'sine',0.22,0.28,i*0.09)); },
    win()         { [523,659,784,1047,1319].forEach((f,i)=>tone(f,'sine',0.3,0.28,i*0.08)); setTimeout(()=>[1047,1319,1568].forEach((f,i)=>tone(f,'triangle',0.35,0.22,i*0.09)),550); },
    blocked()     { tone(220,'sawtooth',0.12,0.28); tone(165,'sawtooth',0.18,0.24,0.10); },
    safe()        { tone(659,'sine',0.12,0.15); tone(784,'sine',0.10,0.12,0.08); },
    tick()        { tone(900,'square',0.03,0.07); },
  };
})();

// ══════════════════════════════════════════════
//  CORES EXACTAS DO SVG ORIGINAL
// ══════════════════════════════════════════════
const PALETTE = {
  red:    { main:'#ff0002', mid:'#ff3335', light:'#ff9999', xlight:'#fff0f0', dark:'#cc0001', glow:'rgba(255,0,2,0.65)',    path:'#fff5f5', shadow:'rgba(180,0,0,0.45)',    text:'#ffffff' },
  green:  { main:'#049645', mid:'#05b852', light:'#6dd98f', xlight:'#edfaf3', dark:'#026e31', glow:'rgba(4,150,69,0.65)',   path:'#f0fbf5', shadow:'rgba(2,100,45,0.45)',    text:'#ffffff' },
  blue:   { main:'#1295e7', mid:'#2da8f5', light:'#80ccf8', xlight:'#eaf6ff', dark:'#0b6fad', glow:'rgba(18,149,231,0.65)', path:'#f0f8ff', shadow:'rgba(10,80,140,0.45)',   text:'#ffffff' },
  yellow: { main:'#ffde15', mid:'#ffe840', light:'#fff199', xlight:'#fffde8', dark:'#c9aa00', glow:'rgba(255,222,21,0.65)', path:'#fffef0', shadow:'rgba(160,130,0,0.45)',   text:'#333300' },
};

// ══════════════════════════════════════════════
//  CASAS SEGURAS (do constants.ts do LibreLudo)
// ══════════════════════════════════════════════
const SAFE_COORDS = new Set([
  '6,13','1,6','8,1','13,8',   // casas de início de cada cor
  '8,12','2,8','6,2','12,6',   // outras casas seguras
]);

// ══════════════════════════════════════════════
//  POSIÇÕES BASE (bloqueadas) de cada cor
// ══════════════════════════════════════════════
const BASE_POSITIONS = {
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
    this.canvas = canvas;
    this.ctx    = canvas.getContext('2d');
    this.size   = size;
    this.cs     = size / 15;   // tamanho de cada célula

    // Estado de cada peça para animação
    // key: "colour_id" → { x, y, scale, opacity, animating, screenX, screenY }
    this.pieces = {};

    this._pulse           = 0;
    this._rafId           = null;
    this._particles       = [];
    this._boardCache      = null;
    this._boardCacheDirty = true;

    this._startLoop();
  }

  // ══════════════════════════════════════════
  //  CONVERTER coordenadas do jogo → pixels
  //  O tabuleiro é 15x15. O game_manager usa
  //  (row, col) com row=x, col=y
  // ══════════════════════════════════════════
  _gameToScreen(gameX, gameY) {
    // game_manager: x=linha, y=coluna
    return {
      sx: gameY * this.cs + this.cs * 0.5,
      sy: gameX * this.cs + this.cs * 0.5,
    };
  }

  // ── Loop de render ────────────────────────
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
    if (!this._boardCache || this._boardCacheDirty) this._renderBoardToCache();
    this.ctx.drawImage(this._boardCache, 0, 0);
  }

  _renderBoardToCache() {
    const off = document.createElement('canvas');
    off.width = off.height = this.size;
    const oc = off.getContext('2d');
    const { cs, size } = this;

    // Fundo
    oc.fillStyle = '#f0ede8'; oc.fillRect(0, 0, size, size);

    // Células
    for (let r = 0; r < 15; r++)
      for (let c = 0; c < 15; c++)
        this._drawCellTo(oc, r, c);

    // Bases (quadrantes)
    // Layout do LibreLudo/SVG:
    // Red   = top-left  (rows 0-5, cols 0-5)
    // Green = top-right (rows 0-5, cols 9-14)
    // Blue  = bot-left  (rows 9-14, cols 0-5)  — no SVG azul é bot-left
    // Yellow= bot-right (rows 9-14, cols 9-14)
    this._drawBaseTo(oc, 0, 0, 5, 5,   'red');
    this._drawBaseTo(oc, 0, 9, 5, 14,  'green');
    this._drawBaseTo(oc, 9, 0, 14, 5,  'blue');
    this._drawBaseTo(oc, 9, 9, 14, 14, 'yellow');

    this._drawHomePathsTo(oc);
    this._drawSafeStarsTo(oc);
    this._drawCenterTo(oc);

    oc.strokeStyle = 'rgba(0,0,0,0.18)'; oc.lineWidth = 2;
    oc.strokeRect(1, 1, size-2, size-2);

    this._boardCache = off; this._boardCacheDirty = false;
  }

  _drawCellTo(oc, r, c) {
    const { cs } = this;
    const x = c*cs, y = r*cs;
    oc.fillStyle = this._cellBgColor(r, c); oc.fillRect(x, y, cs, cs);
    oc.strokeStyle = 'rgba(0,0,0,0.07)'; oc.lineWidth = 0.5; oc.strokeRect(x, y, cs, cs);
  }

  _cellBgColor(r, c) {
    if (r>=0&&r<=5&&c>=0&&c<=5)    return PALETTE.red.xlight;
    if (r>=0&&r<=5&&c>=9&&c<=14)   return PALETTE.green.xlight;
    if (r>=9&&r<=14&&c>=0&&c<=5)   return PALETTE.blue.xlight;
    if (r>=9&&r<=14&&c>=9&&c<=14)  return PALETTE.yellow.xlight;
    if (r>=6&&r<=8&&c>=6&&c<=8)    return '#ffffff';
    // Retas finais
    if (r===7&&c>=1&&c<=5)  return PALETTE.red.path;
    if (c===7&&r>=1&&r<=5)  return PALETTE.green.path;
    if (r===7&&c>=9&&c<=13) return PALETTE.yellow.path;
    if (c===7&&r>=9&&r<=13) return PALETTE.blue.path;
    return '#ffffff';
  }

  _drawBaseTo(oc, r1, c1, r2, c2, color) {
    const { cs } = this;
    const p   = PALETTE[color];
    const pad = cs * 0.10;
    const x   = c1*cs+pad, y = r1*cs+pad;
    const w   = (c2-c1+1)*cs-pad*2, h = (r2-r1+1)*cs-pad*2;
    const rad = cs * 0.52;

    // Fundo colorido
    oc.save();
    oc.shadowColor = p.shadow; oc.shadowBlur = 14; oc.shadowOffsetY = 3;
    const bg = oc.createLinearGradient(x,y,x+w,y+h);
    bg.addColorStop(0,p.mid); bg.addColorStop(0.55,p.main); bg.addColorStop(1,p.dark);
    oc.fillStyle = bg; this._rrectTo(oc,x,y,w,h,rad); oc.fill();
    oc.restore();

    // Brilho interno
    oc.strokeStyle = 'rgba(255,255,255,0.32)'; oc.lineWidth = 1.5;
    this._rrectTo(oc,x+1.5,y+1.5,w-3,h-3,rad-1); oc.stroke();

    // Painel branco
    const ip = cs*0.65, iw = (c2-c1+1)*cs-ip*2, ih = (r2-r1+1)*cs-ip*2;
    oc.fillStyle = 'rgba(255,255,255,0.94)';
    this._rrectTo(oc,c1*cs+ip,r1*cs+ip,iw,ih,rad*0.5); oc.fill();

    // 4 círculos de peças na base
    BASE_POSITIONS[color].forEach(([bx, by]) => {
      // bx=linha, by=coluna (coordenadas do game_manager)
      const cx = by*cs+cs*0.5, cy = bx*cs+cs*0.5, r = cs*0.26;
      oc.save(); oc.shadowColor=p.shadow; oc.shadowBlur=6; oc.shadowOffsetY=2;
      oc.fillStyle=p.dark; oc.beginPath(); oc.arc(cx,cy,r,0,Math.PI*2); oc.fill(); oc.restore();
      const cg = oc.createRadialGradient(cx-r*0.3,cy-r*0.3,r*0.03,cx,cy,r*0.9);
      cg.addColorStop(0,p.light); cg.addColorStop(0.5,p.mid); cg.addColorStop(1,p.main);
      oc.fillStyle=cg; oc.beginPath(); oc.arc(cx,cy,r*0.84,0,Math.PI*2); oc.fill();
      oc.fillStyle='rgba(255,255,255,0.55)'; oc.beginPath(); oc.arc(cx-r*0.24,cy-r*0.24,r*0.3,0,Math.PI*2); oc.fill();
    });
  }

  _drawHomePathsTo(oc) {
    const { cs } = this;
    // Retas finais conforme TOKEN_HOME_ENTRY_PATH do game_manager:
    // red:    row7, cols 1-6  → seta →
    // green:  col7, rows 1-6  → seta ↓
    // blue:   col7, rows 8-13 → seta ↑  (yellow no game_manager é row13→8)
    // yellow: row7, cols 8-13 → seta ←
    const lanes = [
      { cells: [[7,1],[7,2],[7,3],[7,4],[7,5]], arrow:'▶', color: PALETTE.red },
      { cells: [[1,7],[2,7],[3,7],[4,7],[5,7]], arrow:'▼', color: PALETTE.green },
      { cells: [[7,9],[7,10],[7,11],[7,12],[7,13]], arrow:'◀', color: PALETTE.yellow },
      { cells: [[9,7],[10,7],[11,7],[12,7],[13,7]], arrow:'▲', color: PALETTE.blue },
    ];
    lanes.forEach(({ cells, arrow, color }) => {
      cells.forEach(([row, col], i) => {
        const x=col*cs, y=row*cs;
        const grad=oc.createLinearGradient(x,y,x+cs,y+cs);
        grad.addColorStop(0,color.xlight); grad.addColorStop(1,color.path);
        oc.fillStyle=grad; oc.fillRect(x,y,cs,cs);
        oc.fillStyle=color.main; oc.globalAlpha=0.42+i*0.10;
        oc.font=`bold ${cs*0.43}px sans-serif`; oc.textAlign='center'; oc.textBaseline='middle';
        oc.fillText(arrow,x+cs*0.5,y+cs*0.5); oc.globalAlpha=1;
        oc.strokeStyle='rgba(0,0,0,0.06)'; oc.lineWidth=0.5; oc.strokeRect(x,y,cs,cs);
      });
    });
  }

  _drawSafeStarsTo(oc) {
    const { cs } = this;
    // Casas seguras: converter "row,col" para pixels
    const safeList = [
      [6,13],[1,6],[8,1],[13,8],
      [8,12],[2,8],[6,2],[12,6],
    ];
    safeList.forEach(([row, col]) => {
      const x=col*cs, y=row*cs;
      oc.fillStyle='rgba(255,215,0,0.22)'; oc.fillRect(x,y,cs,cs);
      oc.fillStyle='rgba(140,100,0,0.72)'; oc.font=`${cs*0.5}px serif`;
      oc.textAlign='center'; oc.textBaseline='middle'; oc.fillText('★',x+cs*0.5,y+cs*0.5+1);
    });
  }

  _drawCenterTo(oc) {
    const { cs } = this;
    const cx=7.5*cs, cy=7.5*cs;
    // 4 triângulos — cores do SVG original
    const tris = [
      { c:PALETTE.green.main,  pts:[[6,6],[9,6],[7.5,7.5]] },
      { c:PALETTE.yellow.main, pts:[[9,6],[9,9],[7.5,7.5]] },
      { c:PALETTE.blue.main,   pts:[[6,9],[9,9],[7.5,7.5]] },
      { c:PALETTE.red.main,    pts:[[6,6],[6,9],[7.5,7.5]] },
    ];
    tris.forEach(({ c, pts }) => {
      oc.save(); oc.shadowColor='rgba(0,0,0,0.15)'; oc.shadowBlur=5;
      oc.fillStyle=c; oc.beginPath();
      oc.moveTo(pts[0][0]*cs,pts[0][1]*cs); oc.lineTo(pts[1][0]*cs,pts[1][1]*cs); oc.lineTo(pts[2][0]*cs,pts[2][1]*cs);
      oc.closePath(); oc.fill(); oc.restore();
    });
    oc.save(); oc.shadowColor='rgba(255,255,255,0.8)'; oc.shadowBlur=16;
    const cg=oc.createRadialGradient(cx,cy,0,cx,cy,cs*1.1);
    cg.addColorStop(0,'#ffffff'); cg.addColorStop(0.7,'rgba(255,255,255,0.96)'); cg.addColorStop(1,'rgba(245,245,240,0.9)');
    oc.fillStyle=cg; oc.beginPath(); oc.arc(cx,cy,cs*1.07,0,Math.PI*2); oc.fill(); oc.restore();
    oc.strokeStyle='rgba(0,0,0,0.09)'; oc.lineWidth=1.5; oc.beginPath(); oc.arc(cx,cy,cs*1.07,0,Math.PI*2); oc.stroke();
    oc.fillStyle='rgba(0,0,0,0.11)'; oc.font=`${cs*1.4}px serif`;
    oc.textAlign='center'; oc.textBaseline='middle'; oc.fillText('★',cx,cy+cs*0.06);
  }

  // ══════════════════════════════════════════
  //  DESENHAR PEÇA
  // ══════════════════════════════════════════
  drawPiece(sx, sy, color, num, selectable, pulseT, scale=1, opacity=1) {
    const { ctx, cs } = this;
    const p = PALETTE[color];
    if (!p) return;
    const t = pulseT || 0;

    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, opacity));

    const bounceY = selectable ? Math.abs(Math.sin(t*3.2))*cs*0.13 : 0;
    const drawY   = sy - bounceY;
    const r       = cs * 0.26 * scale;

    // Sombra chão
    ctx.fillStyle='rgba(0,0,0,0.18)'; ctx.beginPath(); ctx.ellipse(sx,sy+r*0.38,r*0.7,r*0.19,0,0,Math.PI*2); ctx.fill();

    // Glow seleccionável
    if (selectable) {
      ctx.save(); ctx.shadowColor=p.glow; ctx.shadowBlur=12+7*Math.abs(Math.sin(t*3));
      ctx.beginPath(); ctx.arc(sx,drawY,r+3,0,Math.PI*2); ctx.fillStyle=p.glow.replace('0.65','0.18'); ctx.fill(); ctx.restore();
    }

    // Corpo 3D
    ctx.save(); ctx.shadowColor=p.shadow; ctx.shadowBlur=selectable?10:4; ctx.shadowOffsetY=2;
    const grad=ctx.createRadialGradient(sx-r*0.32,drawY-r*0.32,r*0.03,sx,drawY,r);
    grad.addColorStop(0,p.light); grad.addColorStop(0.38,p.mid); grad.addColorStop(0.72,p.main); grad.addColorStop(1,p.dark);
    ctx.fillStyle=grad; ctx.beginPath(); ctx.arc(sx,drawY,r,0,Math.PI*2); ctx.fill(); ctx.restore();

    ctx.strokeStyle=p.dark; ctx.lineWidth=scale*1.1; ctx.beginPath(); ctx.arc(sx,drawY,r,0,Math.PI*2); ctx.stroke();

    // Brilho especular
    const hl=ctx.createRadialGradient(sx-r*0.3,drawY-r*0.32,0,sx-r*0.3,drawY-r*0.32,r*0.6);
    hl.addColorStop(0,'rgba(255,255,255,0.72)'); hl.addColorStop(1,'rgba(255,255,255,0)');
    ctx.fillStyle=hl; ctx.beginPath(); ctx.arc(sx,drawY,r,0,Math.PI*2); ctx.fill();

    // Número
    const fs=Math.max(7,cs*0.18*scale);
    ctx.font=`bold ${fs}px "Bebas Neue","Arial Black",sans-serif`;
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.strokeStyle=p.dark; ctx.lineWidth=2*scale; ctx.strokeText(String(num),sx,drawY+fs*0.06);
    ctx.fillStyle=p.text; ctx.fillText(String(num),sx,drawY+fs*0.06);

    ctx.restore();
  }

  // ══════════════════════════════════════════
  //  ANIMAÇÃO DE PEÇAS
  //  Recebe coordenadas do game_manager (x=linha, y=coluna)
  // ══════════════════════════════════════════
  animatePieceTo(colour, tokenId, fromGameX, fromGameY, toGameX, toGameY, wasLocked, onComplete) {
    const key   = colour + '_' + tokenId;
    const fromS = this._gameToScreen(fromGameX, fromGameY);
    const toS   = this._gameToScreen(toGameX, toGameY);

    if (!this.pieces[key])
      this.pieces[key] = { sx: fromS.sx, sy: fromS.sy, scale: 1, opacity: 1, animating: false };

    const piece = this.pieces[key];
    piece.animating = true;
    piece.sx = fromS.sx; piece.sy = fromS.sy;

    if (wasLocked) {
      // Saiu da base
      SFX.exitBase();
      this._animScale(piece,'s',1,1.4,120,()=>{
        this._animScale(piece,'s',1.4,1,100,null);
        this._animSegment(piece,fromS,toS,270,()=>{
          this._spawnTrail(piece.sx,piece.sy,colour);
          piece.animating=false; if(onComplete)onComplete();
        });
      });
    } else if (toGameX===7&&toGameY===7) {
      // Centro (chegou a casa)
      SFX.finish();
      this._animSegment(piece,fromS,toS,350,()=>{
        this._animScale(piece,'s',1,1.6,170,()=>{
          this._animScale(piece,'s',1.6,1,190,()=>{
            piece.animating=false; this._spawnConfetti(toS.sx,toS.sy,colour); if(onComplete)onComplete();
          });
        });
      });
    } else {
      // Movimento normal
      const key2 = `${Math.round(toGameX)},${Math.round(toGameY)}`;
      SAFE_COORDS.has(key2) ? SFX.safe() : SFX.move();
      this._animSegment(piece,fromS,toS,310,()=>{
        this._animScale(piece,'s',1,1.18,80,()=>{
          this._animScale(piece,'s',1.18,1,100,()=>{ piece.animating=false; if(onComplete)onComplete(); });
        });
      });
    }
  }

  animateCaptureAt(colour, tokenId) {
    const key = colour+'_'+tokenId;
    if (!this.pieces[key]) return;
    const piece = this.pieces[key]; SFX.capture();
    this._spawnCaptureBurst(piece.sx,piece.sy,colour);
    this._animScale(piece,'s',1,2,120,()=>{ this._animFade(piece,1,0,150,()=>{ piece.scale=1; piece.opacity=1; piece.animating=false; }); });
  }

  animateDice(finalVal, onDone) {
    SFX.dice();
    const faces=['⚀','⚁','⚂','⚃','⚄','⚅'];
    const total=680, start=performance.now(); let lastSwap=0, interval=55;
    const step=(now)=>{
      const el=now-start, prog=el/total; interval=55+prog*85;
      if(el-lastSwap>interval){ const dfc=document.getElementById('dfc'); if(dfc)dfc.textContent=faces[Math.floor(Math.random()*6)]; lastSwap=el; }
      if(el<total){ requestAnimationFrame(step); }
      else {
        const dfc=document.getElementById('dfc'), numEl=document.getElementById('dnm');
        if(dfc){dfc.textContent=faces[finalVal-1]; dfc.style.transform='scale(1.45)'; dfc.style.transition='transform 0.15s'; setTimeout(()=>{dfc.style.transform='scale(1)';},160);}
        if(numEl){numEl.textContent=finalVal; numEl.style.transform='scale(1.6)'; numEl.style.transition='transform 0.18s'; setTimeout(()=>{numEl.style.transform='scale(1)';},200);}
        SFX.diceResult(finalVal); if(onDone)onDone();
      }
    };
    requestAnimationFrame(step);
  }

  // ── Animações internas ───────────────────
  _animSegment(piece, from, to, dur, onDone) {
    const start=performance.now(), dx=to.sx-from.sx, dy=to.sy-from.sy;
    const step=(now)=>{ const raw=Math.min((now-start)/dur,1), e=1-Math.pow(1-raw,3); piece.sx=from.sx+dx*e; piece.sy=from.sy+dy*e; raw<1?requestAnimationFrame(step):(piece.sx=to.sx,piece.sy=to.sy,onDone&&onDone()); };
    requestAnimationFrame(step);
  }
  _animScale(piece, prop, from, to, dur, onDone) {
    const start=performance.now();
    const step=(now)=>{ const raw=Math.min((now-start)/dur,1), e=1-Math.pow(1-raw,2); piece[prop==='s'?'scale':prop]=from+(to-from)*e; raw<1?requestAnimationFrame(step):(piece[prop==='s'?'scale':prop]=to,onDone&&onDone()); };
    requestAnimationFrame(step);
  }
  _animFade(piece, from, to, dur, onDone) {
    const start=performance.now();
    const step=(now)=>{ const raw=Math.min((now-start)/dur,1); piece.opacity=from+(to-from)*raw; raw<1?requestAnimationFrame(step):(piece.opacity=to,onDone&&onDone()); };
    requestAnimationFrame(step);
  }

  // ── Partículas ───────────────────────────
  _spawnConfetti(x, y, color) {
    const p=PALETTE[color]||PALETTE.red;
    for(let i=0;i<22;i++){
      const angle=(i/22)*Math.PI*2+Math.random()*0.3, speed=2.5+Math.random()*3.5;
      this._particles.push({x,y,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed-3.5,life:1,decay:0.018+Math.random()*0.008,color:[p.main,p.mid,p.light,'#ffffff','#fde047'][Math.floor(Math.random()*5)],size:3+Math.random()*4.5,rot:Math.random()*Math.PI*2,rv:(Math.random()-0.5)*0.35,type:'confetti',wide:1.5+Math.random()*2});
    }
  }
  _spawnCaptureBurst(x, y, color) {
    const p=PALETTE[color]||PALETTE.red;
    for(let i=0;i<14;i++){
      const angle=Math.random()*Math.PI*2, speed=1.5+Math.random()*3;
      this._particles.push({x,y,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed-2,life:1,decay:0.03+Math.random()*0.015,color:Math.random()<0.5?p.main:'#ffffff',size:2+Math.random()*3.5,rot:0,rv:0,type:'spark'});
    }
  }
  _spawnTrail(x, y, color) {
    const p=PALETTE[color]||PALETTE.red;
    for(let i=0;i<4;i++){
      this._particles.push({x:x+(Math.random()-0.5)*this.cs*0.3,y:y+(Math.random()-0.5)*this.cs*0.3,vx:(Math.random()-0.5)*0.8,vy:-Math.random()*1.2,life:0.65,decay:0.055,color:p.light,size:2+Math.random()*2,rot:0,rv:0,type:'spark'});
    }
  }
  _updateParticles() {
    const { ctx }=this;
    this._particles=this._particles.filter(p=>p.life>0.01);
    this._particles.forEach(p=>{
      p.x+=p.vx; p.y+=p.vy; p.vy+=0.20; p.vx*=0.985; p.life-=p.decay; p.rot+=p.rv;
      ctx.save(); ctx.globalAlpha=Math.max(0,p.life); ctx.translate(p.x,p.y); ctx.rotate(p.rot);
      if(p.type==='confetti'){ctx.fillStyle=p.color;ctx.fillRect(-p.size/2,-p.size/4,p.size,p.wide||p.size/2);}
      else{ctx.fillStyle=p.color;ctx.beginPath();ctx.arc(0,0,p.size/2,0,Math.PI*2);ctx.fill();}
      ctx.restore();
    });
  }

  _rrectTo(oc,x,y,w,h,r){oc.beginPath();oc.moveTo(x+r,y);oc.lineTo(x+w-r,y);oc.arcTo(x+w,y,x+w,y+r,r);oc.lineTo(x+w,y+h-r);oc.arcTo(x+w,y+h,x+w-r,y+h,r);oc.lineTo(x+r,y+h);oc.arcTo(x,y+h,x,y+h-r,r);oc.lineTo(x,y+r);oc.arcTo(x,y,x+r,y,r);oc.closePath();}
  _rrect(x,y,w,h,r){this._rrectTo(this.ctx,x,y,w,h,r);}

  destroy(){if(this._rafId)cancelAnimationFrame(this._rafId);this._particles=[];this.pieces={};}
}


// ══════════════════════════════════════════════
//  ADAPTADOR — liga o novo game_manager ao index.html
//  Substitui as funções de render do index.html
// ══════════════════════════════════════════════

/**
 * Converter estado do novo game_manager para o formato
 * que as funções do index.html esperam.
 * O novo formato tem players[].tokens[].{x,y,is_locked,has_reached_home}
 */
function adaptNewState(state) {
  if (!state || !state.players) return state;
  return {
    ...state,
    players: state.players.map(p => ({
      ...p,
      // compatibilidade com o index.html antigo
      color:   p.colour,   // índice por nome de cor
      fin:     p.fin || p.tokens.filter(t=>t.has_reached_home).length,
      // pos e in_base para compatibilidade
      pos:     p.tokens.map(t => t.is_locked ? 0 : (t.has_reached_home ? 58 : 1)),
      in_base: p.tokens.map(t => t.is_locked),
    }))
  };
}

/**
 * Desenhar o estado com o novo sistema de coordenadas.
 * Chamado pelo loop de render do index.html.
 */
window.drawGameStateNew = function(state) {
  if (!window.BOARD || !state || !state.players) return;
  window.BOARD.drawBoard();

  state.players.forEach(pl => {
    const color = pl.colour || pl.color;
    if (!color) return;

    pl.tokens.forEach((token, i) => {
      const key   = color + '_' + (token.id !== undefined ? token.id : i);
      const piece = window.BOARD.pieces[key];

      // Coordenadas de ecrã
      let sx, sy;
      if (piece && piece.animating) {
        sx = piece.sx; sy = piece.sy;
      } else {
        const s = window.BOARD._gameToScreen(token.x, token.y);
        sx = s.sx; sy = s.sy;
        if (piece) { piece.sx = sx; piece.sy = sy; }
        else { window.BOARD.pieces[key] = { sx, sy, scale: 1, opacity: 1, animating: false }; }
      }

      const isSelectable = (window.SELECTABLE_PIECES||[]).includes(i)
        && pl.user_id === window.U?.id
        && _isMeTurnNew(state);

      const pScale  = piece ? (piece.scale  ?? 1) : 1;
      const pOpacity = piece ? (piece.opacity ?? 1) : 1;

      window.BOARD.drawPiece(sx, sy, color, (token.id !== undefined ? token.id+1 : i+1), isSelectable, window.PULSE_T, pScale, pOpacity);
    });
  });
};

function _isMeTurnNew(state) {
  if (!state||!state.players||!window.U) return false;
  const p = state.players[state.turn];
  return p && p.user_id === window.U.id && state.phase === 0;
}

/**
 * Detectar animações entre estados anterior e novo.
 */
window._triggerMoveAnimationsNew = function(prev, next) {
  if (!prev||!next||!window.BOARD) return;
  next.players.forEach(pl => {
    const prevPl = (prev.players||[]).find(p=>p.user_id===pl.user_id); if(!prevPl) return;
    pl.tokens.forEach((token, i) => {
      const prevToken = prevPl.tokens[i]; if(!prevToken) return;
      const colour = pl.colour || pl.color;
      const tid    = token.id !== undefined ? token.id : i;

      // Posição mudou?
      if (token.x===prevToken.x && token.y===prevToken.y &&
          token.is_locked===prevToken.is_locked &&
          token.has_reached_home===prevToken.has_reached_home) return;

      // Captura? (voltou para a base)
      if (token.is_locked && !prevToken.is_locked) {
        window.BOARD.animateCaptureAt(colour, tid); return;
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

// Sobrescrever drawGameState e _triggerMoveAnimations no index.html
window.drawGameState        = window.drawGameStateNew;
window._triggerMoveAnimations = window._triggerMoveAnimationsNew;
