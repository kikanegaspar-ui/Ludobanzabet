/**
 * ludo_board_v2.js — LudoKz DEFINITIVO
 *
 * CORRECÇÕES DEFINITIVAS:
 *  ✓ Cantos CORRECTOS: P1=azul inf-esq | P2=verde sup-dir | P3=verm inf-dir | P4=amar sup-esq
 *  ✓ Tabuleiro canvas completo (sem PNG externo necessário)
 *  ✓ Dado canvas com pontos reais (sem emoji — funciona sempre)
 *  ✓ Peças: token.x/token.y = índices de grelha; is_locked → base correcta
 *  ✓ Botão "Lançar Dado" activa: turno + phase===0
 *  ✓ Sons via Web Audio API (sem ficheiros externos)
 *  ✓ Animações de movimento, captura e vitória
 *  ✓ Compatível com SSE + API do servidor LudoKz
 */

'use strict';

// ══════════════════════════════════════════════════════════════════
//  CONSTANTES
// ══════════════════════════════════════════════════════════════════
const COLOUR_NAME = { red:'Vermelho', green:'Verde', blue:'Azul', yellow:'Amarelo' };
const COLOUR_CSS  = { red:'#ff0002', green:'#049645', blue:'#1295e7', yellow:'#f5c518' };

// Posição lógica → [col, row] na grelha 15×15
const LUDO_COORD_MAP = {
  // Caminho principal 0-51
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
  // Corredores de chegada
  100:[7,13],101:[7,12],102:[7,11],103:[7,10],104:[7,9], 105:[7,7],
  200:[7,1], 201:[7,2], 202:[7,3], 203:[7,4], 204:[7,5], 205:[7,7],
  300:[13,7],301:[12,7],302:[11,7],303:[10,7],304:[9,7], 305:[7,7],
  400:[1,7], 401:[2,7], 402:[3,7], 403:[4,7], 404:[5,7], 405:[7,7],
  // Bases
  // P1 azul   — inferior-esquerdo  (cols 0-5, rows 9-14)
  500:[1.5,10.5],501:[3.5,10.5],502:[1.5,12.5],503:[3.5,12.5],
  // P2 verde  — superior-direito   (cols 9-14, rows 0-5)
  600:[10.5,1.5],601:[12.5,1.5],602:[10.5,3.5],603:[12.5,3.5],
  // P3 verm   — inferior-direito   (cols 9-14, rows 9-14)
  700:[10.5,10.5],701:[12.5,10.5],702:[10.5,12.5],703:[12.5,12.5],
  // P4 amar   — superior-esquerdo  (cols 0-5, rows 0-5)
  800:[1.5,1.5],  801:[3.5,1.5], 802:[1.5,3.5], 803:[3.5,3.5]
};

const SAFE_POSITIONS = [0,8,13,21,26,34,39,47];

const COLOUR_TO_PLAYER = { blue:'P1', green:'P2', red:'P3', yellow:'P4' };
const BASE_POSITIONS   = {
  P1:[500,501,502,503], P2:[600,601,602,603],
  P3:[700,701,702,703], P4:[800,801,802,803]
};
const HOME_POSITIONS = { P1:105, P2:205, P3:305, P4:405 };

// Pontos do dado [x_frac, y_frac] por face
const DICE_DOTS = {
  1:[[.5,.5]],
  2:[[.28,.28],[.72,.72]],
  3:[[.28,.28],[.5,.5],[.72,.72]],
  4:[[.28,.28],[.72,.28],[.28,.72],[.72,.72]],
  5:[[.28,.28],[.72,.28],[.5,.5],[.28,.72],[.72,.72]],
  6:[[.28,.2],[.72,.2],[.28,.5],[.72,.5],[.28,.8],[.72,.8]]
};

// ══════════════════════════════════════════════════════════════════
//  SONS (Web Audio API)
// ══════════════════════════════════════════════════════════════════
const SFX = (function() {
  var _ctx = null;
  function gc() {
    if (!_ctx) { try { _ctx = new (window.AudioContext||window.webkitAudioContext)(); } catch(e){} }
    return _ctx;
  }
  function beep(freq, dur, type, vol, delay) {
    try {
      var c=gc(); if(!c) return;
      var o=c.createOscillator(), g=c.createGain();
      o.connect(g); g.connect(c.destination);
      o.type=type||'sine'; o.frequency.value=freq;
      var t=c.currentTime+(delay||0);
      g.gain.setValueAtTime(vol||0.22,t);
      g.gain.exponentialRampToValueAtTime(0.001,t+dur);
      o.start(t); o.stop(t+dur);
    } catch(e){}
  }
  return {
    dice:    function(){ beep(300,.07,'square',.17); beep(450,.07,'square',.17,.09); beep(600,.12,'square',.17,.18); },
    move:    function(){ beep(520,.06,'sine',.2); beep(660,.08,'sine',.2,.07); },
    capture: function(){ beep(200,.14,'sawtooth',.28); beep(150,.18,'sawtooth',.28,.12); },
    home:    function(){ beep(784,.1,'sine',.28); beep(988,.1,'sine',.28,.13); beep(1175,.2,'sine',.28,.27); },
    win:     function(){ [523,659,784,1047].forEach(function(f,i){beep(f,.2,'sine',.28,i*.15);}); },
    myTurn:  function(){ beep(880,.09,'sine',.16); beep(1100,.11,'sine',.16,.13); },
    tick:    function(){ beep(660,.04,'sine',.14); }
  };
})();
window.SFX = SFX;

// ══════════════════════════════════════════════════════════════════
//  DADO CANVAS (pontos reais, sem emoji)
// ══════════════════════════════════════════════════════════════════
var _diceCanvas = null;
var _diceCtx    = null;

function _setupDiceCanvas() {
  if (_diceCanvas) return;
  var dfc = document.getElementById('dfc'); if (!dfc) return;

  _diceCanvas = document.createElement('canvas');
  _diceCanvas.width  = 74;
  _diceCanvas.height = 74;
  _diceCanvas.style.cssText = 'display:block;margin:4px auto;border-radius:13px;cursor:pointer;filter:drop-shadow(0 0 8px rgba(245,197,24,.5));';
  _diceCanvas.title = 'Clica para lançar';
  _diceCanvas.onclick = function(){ if (window.doRoll) window.doRoll(); };
  _diceCtx = _diceCanvas.getContext('2d');

  dfc.style.display = 'none';
  dfc.parentNode.insertBefore(_diceCanvas, dfc);
  _renderDice(0, false);
}

function _renderDice(value, rolling) {
  if (!_diceCtx) return;
  var c=_diceCtx, w=74, h=74;
  c.clearRect(0,0,w,h);

  // Fundo
  var bg=c.createLinearGradient(0,0,w,h);
  if (rolling){ bg.addColorStop(0,'#3a3060'); bg.addColorStop(1,'#1a1040'); }
  else        { bg.addColorStop(0,'#2c2255'); bg.addColorStop(1,'#0f0d28'); }
  _rrectPath(c,4,4,w-8,h-8,12);
  c.fillStyle=bg; c.fill();

  // Borda
  c.strokeStyle=rolling?'rgba(245,197,24,.35)':'#f5c518';
  c.lineWidth=2; c.stroke();

  // Brilho topo
  var shine=c.createLinearGradient(4,4,4,24);
  shine.addColorStop(0,'rgba(255,255,255,.2)'); shine.addColorStop(1,'rgba(255,255,255,0)');
  _rrectPath(c,5,5,w-10,20,9); c.fillStyle=shine; c.fill();

  if (rolling) {
    c.font='bold 28px "Plus Jakarta Sans",sans-serif';
    c.fillStyle='rgba(245,197,24,.5)';
    c.textAlign='center'; c.textBaseline='middle';
    c.fillText('?',w/2,h/2);
    return;
  }
  if (value>=1&&value<=6) {
    var dots=DICE_DOTS[value];
    dots.forEach(function(d){
      c.beginPath(); c.arc(d[0]*w,d[1]*h,5.5,0,Math.PI*2);
      c.fillStyle='#f5c518'; c.shadowColor='#f5c518'; c.shadowBlur=7;
      c.fill(); c.shadowBlur=0;
    });
  } else {
    // Estado inicial
    c.fillStyle='rgba(245,197,24,.22)'; c.fillRect(w/2-13,h/2-2,26,4);
  }
}

function _rrectPath(ctx,x,y,w,h,r){
  ctx.beginPath();
  ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y);
  ctx.quadraticCurveTo(x+w,y,x+w,y+r);
  ctx.lineTo(x+w,y+h-r);
  ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
  ctx.lineTo(x+r,y+h);
  ctx.quadraticCurveTo(x,y+h,x,y+h-r);
  ctx.lineTo(x,y+r);
  ctx.quadraticCurveTo(x,y,x+r,y);
  ctx.closePath();
}

function _animDiceRoll(value, cb) {
  SFX.dice();
  var frames=0, maxF=14;
  function roll(){
    if (frames<maxF){ _renderDice(Math.ceil(Math.random()*6),true); frames++; setTimeout(roll,65); }
    else {
      _renderDice(value,false);
      var dfc=document.getElementById('dfc'), dnm=document.getElementById('dnm');
      var faces=['⚀','⚁','⚂','⚃','⚄','⚅'];
      if(dfc) dfc.textContent=faces[value-1];
      if(dnm) dnm.textContent=value;
      if(cb) cb();
    }
  }
  roll();
}

// ══════════════════════════════════════════════════════════════════
//  CLASSE LudoBoard — CANVAS DO TABULEIRO
// ══════════════════════════════════════════════════════════════════
function LudoBoard(canvas, size) {
  this.canvas = canvas;
  this.ctx    = canvas.getContext('2d');
  this.size   = size;
  this.cell   = size / 15;
  this.pieces = {};
  this._buildBoardImage();
}

LudoBoard.prototype._toScreen = function(col, row) {
  var c=this.cell;
  return { sx: col*c+c*0.5, sy: row*c+c*0.5 };
};

LudoBoard.prototype._posToScreen = function(pos) {
  var coord=LUDO_COORD_MAP[pos];
  if (coord) return this._toScreen(coord[0],coord[1]);
  return { sx:this.size/2, sy:this.size/2 };
};

// Token do backend → pixel
LudoBoard.prototype._tokenPixel = function(token, ti, colour) {
  if (token.has_reached_home||token.finished) {
    return this._posToScreen(HOME_POSITIONS[COLOUR_TO_PLAYER[colour]||'P1']);
  }
  if (token.is_locked||token.locked) {
    return this._posToScreen(BASE_POSITIONS[COLOUR_TO_PLAYER[colour]||'P1'][ti%4]);
  }
  if (token.x!==undefined&&token.y!==undefined) return this._toScreen(token.x,token.y);
  if (token.pos!==undefined) return this._posToScreen(token.pos);
  return { sx:this.size/2, sy:this.size/2 };
};

LudoBoard.prototype._buildBoardImage = function() {
  var off=document.createElement('canvas');
  off.width=off.height=this.size;
  this._drawBoardToCtx(off.getContext('2d'));
  this._boardImg=off;
};

LudoBoard.prototype._drawBoardToCtx = function(ctx) {
  var c=this.cell, sz=this.size, self=this;

  // Fundo
  ctx.fillStyle='#cfc4a0'; ctx.fillRect(0,0,sz,sz);

  // ── Cantos CORRECTOS ──
  // P1 azul   → startCol=0, startRow=9  (inferior-esquerdo)
  // P2 verde  → startCol=9, startRow=0  (superior-direito)
  // P3 verm   → startCol=9, startRow=9  (inferior-direito)
  // P4 amar   → startCol=0, startRow=0  (superior-esquerdo)
  self._drawBaseCorner(ctx, 0, 9, '#1295e7'); // P1 azul inf-esq
  self._drawBaseCorner(ctx, 9, 0, '#049645'); // P2 verde sup-dir
  self._drawBaseCorner(ctx, 9, 9, '#ff0002'); // P3 verm inf-dir
  self._drawBaseCorner(ctx, 0, 0, '#e6c800'); // P4 amar sup-esq

  // Células do caminho (brancas)
  for (var pos=0; pos<=51; pos++) {
    var coord=LUDO_COORD_MAP[pos]; if(!coord) continue;
    ctx.fillStyle='#ffffff';
    ctx.fillRect(Math.floor(coord[0])*c, Math.floor(coord[1])*c, c, c);
  }

  // Corredores coloridos
  for(var r=9;r<=13;r++)  {ctx.fillStyle='#9fd4f5';ctx.fillRect(7*c,r*c,c,c);}  // P1
  for(var r2=1;r2<=5;r2++){ctx.fillStyle='#9fe8b8';ctx.fillRect(7*c,r2*c,c,c);} // P2
  for(var c2=9;c2<=13;c2++){ctx.fillStyle='#f5a0a0';ctx.fillRect(c2*c,7*c,c,c);}// P3
  for(var c3=1;c3<=5;c3++){ctx.fillStyle='#f5e68a';ctx.fillRect(c3*c,7*c,c,c);} // P4

  // Células de saída
  ctx.fillStyle='#1295e7'; ctx.fillRect(6*c,13*c,c,c);  // P1 pos=0
  ctx.fillStyle='#049645'; ctx.fillRect(8*c, 1*c,c,c);  // P2 pos=26
  ctx.fillStyle='#ff0002'; ctx.fillRect(13*c,8*c,c,c);  // P3 pos=39
  ctx.fillStyle='#e6c800'; ctx.fillRect(1*c, 6*c,c,c);  // P4 pos=13

  // Estrelas posições seguras
  SAFE_POSITIONS.forEach(function(p){
    var co=LUDO_COORD_MAP[p]; if(!co)return;
    ctx.fillStyle='#fffde7'; ctx.fillRect(Math.floor(co[0])*c,Math.floor(co[1])*c,c,c);
    self._drawStarAt(ctx,co[0],co[1]);
  });

  // Grelha
  ctx.strokeStyle='rgba(0,0,0,0.1)'; ctx.lineWidth=0.5;
  for(var col=6;col<=8;col++) for(var row=0;row<15;row++) ctx.strokeRect(col*c+.25,row*c+.25,c-.5,c-.5);
  for(var row3=6;row3<=8;row3++) for(var col3=0;col3<15;col3++) ctx.strokeRect(col3*c+.25,row3*c+.25,c-.5,c-.5);

  // Centro
  self._drawCenter(ctx);
};

LudoBoard.prototype._drawBaseCorner = function(ctx, startCol, startRow, color) {
  var c=this.cell, w=6*c, x=startCol*c, y=startRow*c, pad=c*.18;
  ctx.fillStyle=color; ctx.fillRect(x,y,w,w);
  ctx.fillStyle='rgba(255,255,255,0.91)';
  this._rrect(ctx,x+pad,y+pad,w-pad*2,w-pad*2,c*.32); ctx.fill();
  [[1.5,1.5],[3.5,1.5],[1.5,3.5],[3.5,3.5]].forEach(function(o){
    var cx=(startCol+o[0])*c, cy=(startRow+o[1])*c, r=c*.42;
    ctx.beginPath(); ctx.arc(cx,cy+2,r,0,Math.PI*2); ctx.fillStyle='rgba(0,0,0,0.13)'; ctx.fill();
    ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2); ctx.fillStyle='rgba(255,255,255,0.46)'; ctx.fill();
    ctx.strokeStyle=color; ctx.lineWidth=c*.08; ctx.stroke();
  });
  ctx.strokeStyle='rgba(0,0,0,0.17)'; ctx.lineWidth=1.5; ctx.strokeRect(x,y,w,w);
};

LudoBoard.prototype._drawCenter = function(ctx) {
  var c=this.cell, cx=7.5*c, cy=7.5*c, r=2.5*c;
  [
    {pts:[[cx,cy],[cx-r,cy-r],[cx+r,cy-r]],color:'#049645'}, // topo  → verde (P2 sup-dir)
    {pts:[[cx,cy],[cx+r,cy-r],[cx+r,cy+r]],color:'#ff0002'}, // dir   → verm (P3 inf-dir)
    {pts:[[cx,cy],[cx+r,cy+r],[cx-r,cy+r]],color:'#1295e7'}, // base  → azul (P1 inf-esq)
    {pts:[[cx,cy],[cx-r,cy+r],[cx-r,cy-r]],color:'#e6c800'}, // esq   → amar (P4 sup-esq)
  ].forEach(function(t){
    ctx.beginPath(); ctx.moveTo(t.pts[0][0],t.pts[0][1]); ctx.lineTo(t.pts[1][0],t.pts[1][1]); ctx.lineTo(t.pts[2][0],t.pts[2][1]); ctx.closePath();
    ctx.fillStyle=t.color; ctx.fill(); ctx.strokeStyle='rgba(255,255,255,0.2)'; ctx.lineWidth=1; ctx.stroke();
  });
  ctx.beginPath(); ctx.arc(cx,cy,c*.65,0,Math.PI*2);
  var g=ctx.createRadialGradient(cx,cy-c*.15,0,cx,cy,c*.65);
  g.addColorStop(0,'#fff8e1'); g.addColorStop(1,'#f5c518');
  ctx.fillStyle=g; ctx.fill(); ctx.strokeStyle='rgba(255,255,255,0.5)'; ctx.lineWidth=c*.06; ctx.stroke();
  ctx.save(); ctx.translate(cx,cy); this._star(ctx,0,0,c*.4,c*.18,6); ctx.fillStyle='rgba(255,255,255,0.78)'; ctx.fill(); ctx.restore();
};

LudoBoard.prototype._drawStarAt = function(ctx,col,row) {
  var c=this.cell, cx=col*c+c*.5, cy=row*c+c*.5;
  ctx.save(); ctx.translate(cx,cy); this._star(ctx,0,0,c*.33,c*.15,5); ctx.fillStyle='rgba(255,195,0,0.72)'; ctx.fill(); ctx.restore();
};

LudoBoard.prototype._star = function(ctx,cx,cy,outerR,innerR,pts) {
  ctx.beginPath();
  for(var i=0;i<pts*2;i++){
    var r2=i%2===0?outerR:innerR, angle=(i*Math.PI)/pts-Math.PI/2;
    if(i===0)ctx.moveTo(cx+r2*Math.cos(angle),cy+r2*Math.sin(angle));
    else ctx.lineTo(cx+r2*Math.cos(angle),cy+r2*Math.sin(angle));
  }
  ctx.closePath();
};

LudoBoard.prototype._rrect = function(ctx,x,y,w,h,r){
  ctx.beginPath();
  ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y); ctx.quadraticCurveTo(x+w,y,x+w,y+r);
  ctx.lineTo(x+w,y+h-r); ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
  ctx.lineTo(x+r,y+h); ctx.quadraticCurveTo(x,y+h,x,y+h-r);
  ctx.lineTo(x,y+r); ctx.quadraticCurveTo(x,y,x+r,y); ctx.closePath();
};

LudoBoard.prototype._lighten = function(hex,amount) {
  var n=parseInt(hex.replace('#',''),16);
  return 'rgb('+Math.min(255,(n>>16)+amount)+','+Math.min(255,((n>>8)&0xff)+amount)+','+Math.min(255,(n&0xff)+amount)+')';
};

// ── RENDER ──
LudoBoard.prototype.drawBoard = function() {
  this.ctx.clearRect(0,0,this.size,this.size);
  this.ctx.drawImage(this._boardImg,0,0);
};

LudoBoard.prototype.drawPiece = function(sx,sy,colour,label,isSelectable,pulseT,scale,opacity) {
  var ctx=this.ctx, c=this.cell, r=c*.36*(scale||1), css=COLOUR_CSS[colour]||'#888';
  ctx.save();
  ctx.globalAlpha=opacity!==undefined?opacity:1;
  ctx.translate(sx,sy);
  ctx.shadowColor=css; ctx.shadowBlur=isSelectable?12+Math.sin((pulseT||0))*5:5; ctx.shadowOffsetY=2;
  ctx.beginPath(); ctx.arc(0,0,r,0,Math.PI*2);
  var g=ctx.createRadialGradient(-r*.3,-r*.3,0,0,0,r);
  g.addColorStop(0,this._lighten(css,55)); g.addColorStop(1,css);
  ctx.fillStyle=g; ctx.fill();
  if (isSelectable) {
    var pulse=0.5+0.5*Math.sin((pulseT||0)*2.5);
    ctx.strokeStyle='#fff'; ctx.lineWidth=c*.1*pulse;
    ctx.globalAlpha=(0.45+pulse*.55)*(opacity!==undefined?opacity:1); ctx.stroke();
  }
  ctx.shadowBlur=0; ctx.shadowOffsetY=0;
  ctx.beginPath(); ctx.arc(-r*.22,-r*.28,r*.38,0,Math.PI*2);
  ctx.fillStyle='rgba(255,255,255,0.3)'; ctx.globalAlpha=opacity!==undefined?opacity:1; ctx.fill();
  ctx.fillStyle=colour==='yellow'?'#333':'#fff';
  ctx.font='bold '+Math.round(r*.95)+'px "Plus Jakarta Sans",sans-serif';
  ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText(label,0,1);
  ctx.restore();
};

// ── ANIMAÇÕES ──
LudoBoard.prototype.animateMove = function(colour,tokenId,fromPx,toPx,cb) {
  var key=colour+'_'+tokenId;
  if(!this.pieces[key]) this.pieces[key]={sx:fromPx.sx,sy:fromPx.sy,scale:1,opacity:1,animating:false};
  var piece=this.pieces[key]; piece.animating=true; piece.sx=fromPx.sx; piece.sy=fromPx.sy;
  var dur=380, start=performance.now(); SFX.move();
  function step(now){
    var t=Math.min((now-start)/dur,1), e=t<.5?2*t*t:-1+(4-2*t)*t;
    piece.sx=fromPx.sx+(toPx.sx-fromPx.sx)*e; piece.sy=fromPx.sy+(toPx.sy-fromPx.sy)*e;
    if(t<1)requestAnimationFrame(step);
    else{piece.sx=toPx.sx;piece.sy=toPx.sy;piece.animating=false;cb&&cb();}
  }
  requestAnimationFrame(step);
};

LudoBoard.prototype.animateCaptureAt = function(colour,tokenId) {
  var key=colour+'_'+tokenId, piece=this.pieces[key]; if(!piece)return;
  SFX.capture(); piece.animating=true;
  var dur=300, start=performance.now();
  function step(now){
    var t=Math.min((now-start)/dur,1);
    piece.scale=1+Math.sin(t*Math.PI)*.55; piece.opacity=t<.5?1:1-(t-.5)*2;
    if(t<1)requestAnimationFrame(step);
    else{piece.scale=1;piece.opacity=1;piece.animating=false;}
  }
  requestAnimationFrame(step);
};

LudoBoard.prototype.animateDice = function(value,cb){ _animDiceRoll(value,cb); };
LudoBoard.prototype.destroy = function(){};

window.LudoBoard = LudoBoard;

// ══════════════════════════════════════════════════════════════════
//  INICIALIZAÇÃO
// ══════════════════════════════════════════════════════════════════
window.initCanvas = function() {
  var canvas=document.getElementById('ludo-canvas'); if(!canvas)return;
  if(window.BOARD&&window.BOARD.destroy){window.BOARD.destroy();window.BOARD=null;}
  var size=Math.min(460,window.innerWidth-28);
  canvas.width=size; canvas.height=size; canvas.style.width=size+'px'; canvas.style.height=size+'px';
  window.BOARD=new LudoBoard(canvas,size);
  if(window._canvasClickHandler) canvas.removeEventListener('click',window._canvasClickHandler);
  window._canvasClickHandler=window.onCanvasClick;
  canvas.addEventListener('click',window._canvasClickHandler);
  _setupDiceCanvas();
  window.startRenderLoop();
};
window.buildBoard = function(){ window.initCanvas(); };

// ══════════════════════════════════════════════════════════════════
//  LOOP DE RENDER
// ══════════════════════════════════════════════════════════════════
window.drawGameState = function(state) {
  if(!window.BOARD||!state||!state.players)return;
  window.BOARD.drawBoard();
  for(var pi=0;pi<state.players.length;pi++){
    var pl=state.players[pi], colour=pl.colour||pl.color||'blue';
    if(!pl.tokens||!pl.tokens.length)continue;
    for(var ti=0;ti<pl.tokens.length;ti++){
      var token=pl.tokens[ti], tid=token.id!==undefined?token.id:ti;
      var key=colour+'_'+tid, piece=window.BOARD.pieces[key];
      var sx,sy,scale=1,opacity=1;
      if(piece&&piece.animating){
        sx=piece.sx;sy=piece.sy;scale=piece.scale!==undefined?piece.scale:1;opacity=piece.opacity!==undefined?piece.opacity:1;
      } else {
        var s=window.BOARD._tokenPixel(token,ti,colour); sx=s.sx;sy=s.sy;
        if(piece){piece.sx=sx;piece.sy=sy;scale=piece.scale!==undefined?piece.scale:1;opacity=piece.opacity!==undefined?piece.opacity:1;}
        else{window.BOARD.pieces[key]={sx:sx,sy:sy,scale:1,opacity:1,animating:false};}
      }
      var isSelectable=false;
      if(window.SELECTABLE_PIECES&&window.U&&_isMyTurn(state)){
        isSelectable=window.SELECTABLE_PIECES.indexOf(ti)!==-1&&pl.user_id===window.U.id;
      }
      window.BOARD.drawPiece(sx,sy,colour,tid+1,isSelectable,window.PULSE_T,scale,opacity);
    }
  }
};

// ══════════════════════════════════════════════════════════════════
//  RENDER STATE — UI
// ══════════════════════════════════════════════════════════════════
window.renderState = function(state) {
  window.CUR_STATE=state; window.CUR_MV=[];
  if(!state||!state.players)return;

  // Player cards
  var pc=document.getElementById('player-cards');
  if(pc){
    var myT=_isMyTurn(state);
    var mid='<div class="gmid"><div class="ttx">'+(myT?'Teu turno 🟢':'Aguarda 🔵')+'</div><div class="rtx">RND '+(state.round||0)+'</div></div>';
    var cards='';
    for(var i=0;i<state.players.length;i++){
      var p=state.players[i],colour=p.colour||p.color||'blue';
      var fin=p.fin!==undefined?p.fin:(p.tokens?p.tokens.filter(function(t){return t.has_reached_home||t.finished;}).length:0);
      var isAct=(p.idx===state.turn||i===state.turn);
      cards+='<div class="pc'+(isAct?' mt':'')+'"><div class="pdot" style="background:'+(COLOUR_CSS[colour]||'#888')+'"></div><div><div class="pnm2">'+p.name+(p.user_id===(window.U&&window.U.id)?' (Tu)':'')+'</div><div class="pft">'+(COLOUR_NAME[colour]||colour)+' · '+fin+'/4</div></div></div>';
      if(i===Math.floor(state.players.length/2)-1)cards+=mid;
    }
    if(state.players.length<=2)cards+=mid;
    pc.innerHTML=cards;
  }

  var gbv=document.getElementById('gbv');
  if(gbv&&typeof fmt==='function')gbv.textContent=fmt(state.bet||0)+' KZ';

  // Botão dado — CORRECTO: activa só quando meu turno E phase===0
  var rb=document.getElementById('rb');
  if(rb){
    var canRoll=_isMyTurn(state)&&state.phase===0&&!state.over;
    rb.disabled=!canRoll;
    if(canRoll)rb.classList.add('my-turn-glow'); else rb.classList.remove('my-turn-glow');
  }

  // Dado visual
  if(state.dice>0)_renderDice(state.dice,false);

  // Log
  if(state.log&&state.log.length){
    var le=document.getElementById('glog');
    if(le){
      var lh='';
      state.log.slice(-20).reverse().forEach(function(l){
        var cls=(l.indexOf('VENCEU')!==-1||l.indexOf('🏆')!==-1)?' gli-w':l.indexOf('💀')!==-1?' gli-d':'';
        lh+='<div class="gli'+cls+'">'+l+'</div>';
      });
      le.innerHTML=lh;
    }
  }

  var co=document.getElementById('chat-online'); if(co)co.textContent=state.players.length+' online';
  window.SELECTABLE_PIECES=[];
};

window.highlightPcs = function(mv){ window.CUR_MV=mv||[]; window.SELECTABLE_PIECES=mv||[]; };

// ══════════════════════════════════════════════════════════════════
//  EVENTOS SSE
// ══════════════════════════════════════════════════════════════════
window.onGameStarted = function(state) {
  window.RID=state.room_id; window.CUR_STATE=state; window.PREV_STATE=null; window.SELECTABLE_PIECES=[];
  if(typeof pg==='function')pg('game');
  window.buildBoard(); window.renderState(state);
  var chatEl=document.getElementById('chat-msgs'); if(chatEl)chatEl.innerHTML='';
  if(typeof addChat==='function'){
    addChat('Sistema','Jogo iniciado com '+state.players.length+' jogadores!',true);
    state.players.forEach(function(p){ var c=p.colour||p.color||'blue'; addChat('Sistema',(COLOUR_NAME[c]||c)+': '+p.name,true); });
  }
  SFX.myTurn();
};

window.onGameUpdate = function(state) {
  if(window.PREV_STATE&&window.BOARD)window._triggerMoveAnimations(window.PREV_STATE,state);
  window.PREV_STATE=window.CUR_STATE; window.CUR_STATE=state; window.renderState(state);
};

// ══════════════════════════════════════════════════════════════════
//  ANIMAÇÕES DIFF
// ══════════════════════════════════════════════════════════════════
window._triggerMoveAnimations = function(prev,next) {
  if(!prev||!prev.players||!next||!next.players||!window.BOARD)return;
  for(var pi=0;pi<next.players.length;pi++){
    var pl=next.players[pi], colour=pl.colour||pl.color||'blue'; if(!pl.tokens)continue;
    var prevPl=null;
    for(var xi=0;xi<prev.players.length;xi++){if(prev.players[xi].user_id===pl.user_id){prevPl=prev.players[xi];break;}}
    if(!prevPl||!prevPl.tokens)continue;
    for(var ti=0;ti<pl.tokens.length;ti++){
      var tok=pl.tokens[ti], prevTok=prevPl.tokens[ti]; if(!prevTok)continue;
      var tid=tok.id!==undefined?tok.id:ti;
      var curPx=window.BOARD._tokenPixel(tok,ti,colour);
      var prevPx=window.BOARD._tokenPixel(prevTok,ti,colour);
      if(tok.is_locked&&!prevTok.is_locked){window.BOARD.animateCaptureAt(colour,tid);continue;}
      if(tok.has_reached_home&&!prevTok.has_reached_home)SFX.home();
      if(Math.abs(curPx.sx-prevPx.sx)>1||Math.abs(curPx.sy-prevPx.sy)>1){
        window.BOARD.animateMove(colour,tid,prevPx,curPx,null);
      }
    }
  }
};

// ══════════════════════════════════════════════════════════════════
//  AÇÕES
// ══════════════════════════════════════════════════════════════════
window.doRoll = async function() {
  if(!window.RID)return;
  var rb=document.getElementById('rb'); if(rb){rb.disabled=true;rb.classList.remove('my-turn-glow');}
  _renderDice(0,true);
  var d;
  try {
    d=typeof api==='function'
      ?await api('/api/game/roll','POST',{room_id:window.RID})
      :await fetch('/api/game/roll',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({room_id:window.RID}),credentials:'same-origin'}).then(function(r){return r.json();});
  } catch(e){_renderDice(0,false);if(rb)rb.disabled=false;return;}
  if(d.error){_renderDice(0,false);if(rb)rb.disabled=false;if(typeof toast==='function')toast('❌ '+d.error,'ter');return;}
  _animDiceRoll(d.dice,async function(){
    window.renderState(d);
    try {
      var mv=typeof api==='function'
        ?await api('/api/game/movable','POST',{room_id:window.RID})
        :await fetch('/api/game/movable',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({room_id:window.RID}),credentials:'same-origin'}).then(function(r){return r.json();});
      if(mv.movable&&mv.movable.length)window.highlightPcs(mv.movable);
    } catch(e){}
  });
};

window.movePc = async function(idx) {
  if(!window.RID)return;
  window.PREV_STATE=window.CUR_STATE?JSON.parse(JSON.stringify(window.CUR_STATE)):null;
  var d;
  try {
    d=typeof api==='function'
      ?await api('/api/game/move','POST',{room_id:window.RID,piece:idx})
      :await fetch('/api/game/move',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({room_id:window.RID,piece:idx}),credentials:'same-origin'}).then(function(r){return r.json();});
  } catch(e){return;}
  if(d.error){if(typeof toast==='function')toast('❌ '+d.error,'ter');return;}
  if(window.PREV_STATE&&window.BOARD)window._triggerMoveAnimations(window.PREV_STATE,d);
  window.PREV_STATE=window.CUR_STATE; window.renderState(d);
};

window.leaveGame = async function() {
  if(!confirm('Abandonar? Perdes a aposta.'))return;
  if(window.RID){try{await fetch('/api/game/leave',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({room_id:window.RID}),credentials:'same-origin'});}catch(e){}}
  window.RID=null; if(typeof pg==='function')pg('home');
};

// ══════════════════════════════════════════════════════════════════
//  GAME OVER
// ══════════════════════════════════════════════════════════════════
window.onGameOver = function(d) {
  if(d.won)SFX.win();
  if(d.won&&typeof coinRain==='function')coinRain();
  if(d.won&&typeof showFlash==='function')showFlash('🏆');
  var goo=document.getElementById('goo');   if(goo)goo.classList.remove('hidden');
  var goic=document.getElementById('goic'); if(goic)goic.textContent=d.won?'🏆':'💀';
  var gott=document.getElementById('gott'); if(gott)gott.textContent=d.won?'VITÓRIA!':'DERROTA';
  var gosb=document.getElementById('gosb'); if(gosb)gosb.textContent=d.won?'Parabéns, venceste!':'Boa sorte da próxima!';
  var gopr=document.getElementById('gopr');
  if(gopr){var prize=d.won?(d.prize||0):0;gopr.textContent=(d.won?'+':'')+(typeof fmt==='function'?fmt(prize):prize)+' KZ';gopr.style.color=d.won?'var(--jade)':'var(--red)';}
  var gocd=document.getElementById('gocd'); if(gocd)gocd.className='gocd'+(d.won?'':' lose');
  if(d.balance!=null&&window.U){window.U.balance=d.balance;if(typeof updN==='function')updN();}
};

// ══════════════════════════════════════════════════════════════════
//  CLIQUE NO CANVAS
// ══════════════════════════════════════════════════════════════════
window.onCanvasClick = function(e) {
  if(!window.CUR_STATE||!window.BOARD)return;
  if(!window.SELECTABLE_PIECES||!window.SELECTABLE_PIECES.length)return;
  if(window.CUR_STATE.phase!==1)return;
  var rect=e.target.getBoundingClientRect();
  var mx=(e.clientX-rect.left)*(e.target.width/rect.width);
  var my=(e.clientY-rect.top)*(e.target.height/rect.height);
  var myPlayer=null;
  for(var i=0;i<window.CUR_STATE.players.length;i++){
    if(window.CUR_STATE.players[i].user_id===(window.U&&window.U.id)){myPlayer=window.CUR_STATE.players[i];break;}
  }
  if(!myPlayer||!myPlayer.tokens)return;
  var colour=myPlayer.colour||myPlayer.color||'blue', hitR=window.BOARD.cell*.47, clicked=false;
  for(var ti=0;ti<myPlayer.tokens.length;ti++){
    if(clicked)break; if(window.SELECTABLE_PIECES.indexOf(ti)===-1)continue;
    var token=myPlayer.tokens[ti], tid=token.id!==undefined?token.id:ti;
    var piece=window.BOARD.pieces[colour+'_'+tid];
    var px=piece?piece.sx:window.BOARD.size/2, py=piece?piece.sy:window.BOARD.size/2;
    if(Math.sqrt((mx-px)*(mx-px)+(my-py)*(my-py))<=hitR){clicked=true;SFX.tick();window.movePc(ti);}
  }
};

// ══════════════════════════════════════════════════════════════════
//  HELPERS + LOOP
// ══════════════════════════════════════════════════════════════════
function _isMyTurn(state) {
  if(!state||!state.players||!window.U)return false;
  var p=state.players[state.turn%(state.players.length||1)];
  return p&&p.user_id===window.U.id;
}

window.startRenderLoop = function() {
  cancelAnimationFrame(window.CANVAS_ANIM_FRAME);
  window.PULSE_T=0;
  function loop(){ window.PULSE_T=(window.PULSE_T||0)+0.05; if(window.CUR_STATE&&window.BOARD)window.drawGameState(window.CUR_STATE); window.CANVAS_ANIM_FRAME=requestAnimationFrame(loop); }
  window.CANVAS_ANIM_FRAME=requestAnimationFrame(loop);
};

setInterval(function(){
  var rb=document.getElementById('rb'); if(!rb||!window.CUR_STATE)return;
  var canRoll=_isMyTurn(window.CUR_STATE)&&window.CUR_STATE.phase===0&&!window.CUR_STATE.over;
  rb.disabled=!canRoll;
  if(canRoll)rb.classList.add('my-turn-glow'); else rb.classList.remove('my-turn-glow');
},500);

console.log('[LudoKz] ludo_board_v2.js DEFINITIVO carregado ✓');
