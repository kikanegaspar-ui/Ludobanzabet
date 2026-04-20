/**
 * ludo_board_v2.js — LudoKz v6
 *
 * BUG PRINCIPAL CORRIGIDO:
 * O index.html guarda o utilizador em "let U = null" (variável LOCAL do script).
 * Este ficheiro acedia window.U que ficava undefined → _isMyTurn() retornava
 * sempre false → botão sempre disabled → ninguém conseguia lançar o dado.
 *
 * SOLUÇÃO:
 * 1. window._syncU(u) — chamado pelo index.html sempre que U muda
 * 2. _isMyTurn() tenta window.U e também procura no DOM (fallback)
 * 3. doRoll() NÃO verifica rb.disabled — deixa o servidor rejeitar se não for o turno
 */

// ── Acesso ao utilizador logado ──────────────────────────────────
// O index.html tem "let U" local. Chamamos window._syncU() de lá para cá.
window._syncU = function(u) { window.U = u; };

function _getU() {
  return window.U || null;
}

// ══════════════════════════════════════════════════════════════════
//  MAPAS DE CORES
// ══════════════════════════════════════════════════════════════════
const COLOUR_HEX  = { blue:'#1295e7', green:'#049645', red:'#e53935', yellow:'#f9a825' };
const COLOUR_NAME = { blue:'Azul', green:'Verde', red:'Vermelho', yellow:'Amarelo' };
const COLOUR_GRAD = {
  blue:   ['#90caf9','#0d47a1'],
  green:  ['#a5d6a7','#1b5e20'],
  red:    ['#ef9a9a','#b71c1c'],
  yellow: ['#fff59d','#f57f17'],
};
const COLOUR_TEXT = { blue:'#fff', green:'#fff', red:'#fff', yellow:'#111' };

// ══════════════════════════════════════════════════════════════════
//  CMAP
// ══════════════════════════════════════════════════════════════════
const CMAP = {
  0:[6,13],1:[6,12],2:[6,11],3:[6,10],4:[6,9],
  5:[5,8],6:[4,8],7:[3,8],8:[2,8],9:[1,8],10:[0,8],
  11:[0,7],12:[0,6],13:[1,6],14:[2,6],15:[3,6],16:[4,6],17:[5,6],
  18:[6,5],19:[6,4],20:[6,3],21:[6,2],22:[6,1],23:[6,0],
  24:[7,0],25:[8,0],
  26:[8,1],27:[8,2],28:[8,3],29:[8,4],30:[8,5],
  31:[9,6],32:[10,6],33:[11,6],34:[12,6],35:[13,6],36:[14,6],
  37:[14,7],38:[14,8],
  39:[13,8],40:[12,8],41:[11,8],42:[10,8],43:[9,8],
  44:[8,9],45:[8,10],46:[8,11],47:[8,12],48:[8,13],49:[8,14],
  50:[7,14],51:[6,14],
  100:[7,13],101:[7,12],102:[7,11],103:[7,10],104:[7,9],105:[7,8],
  200:[7,1],201:[7,2],202:[7,3],203:[7,4],204:[7,5],205:[7,6],
  300:[13,7],301:[12,7],302:[11,7],303:[10,7],304:[9,7],305:[8,7],
  400:[1,7],401:[2,7],402:[3,7],403:[4,7],404:[5,7],405:[6,7],
  500:[1.5,10.58],501:[3.57,10.58],502:[1.5,12.43],503:[3.57,12.43],
  600:[10.5,1.58],601:[12.54,1.58],602:[10.5,3.45],603:[12.54,3.45],
  700:[10.5,10.58],701:[12.57,10.58],702:[10.5,12.43],703:[12.57,12.43],
  800:[1.5,1.58],801:[3.57,1.58],802:[1.5,3.45],803:[3.55,3.45],
};
const STEP = 6.6667;

const BASE_IDS = {
  blue:[500,501,502,503], green:[600,601,602,603],
  red:[700,701,702,703],  yellow:[800,801,802,803],
};
const HOME_ID   = { blue:105, green:205, red:305, yellow:405 };
const _BASE_SET = new Set([500,501,502,503,600,601,602,603,700,701,702,703,800,801,802,803]);

// ══════════════════════════════════════════════════════════════════
//  CAMINHOS COMPLETOS
// ══════════════════════════════════════════════════════════════════
const START_ID  = { blue:0,  green:26, red:39, yellow:13 };
const TURN_ID   = { blue:50, green:24, red:37, yellow:11 };
const HOME_LANE = {
  blue:   [100,101,102,103,104,105],
  green:  [200,201,202,203,204,205],
  red:    [300,301,302,303,304,305],
  yellow: [400,401,402,403,404,405],
};

function _buildPath(colour) {
  const start = START_ID[colour], turn = TURN_ID[colour];
  const main = []; let pos = start;
  for (let i = 0; i <= 52; i++) {
    main.push(pos);
    if (pos === turn) break;
    pos = (pos + 1) % 52;
  }
  return main.concat(HOME_LANE[colour]);
}

const FULL_PATH = {
  blue: _buildPath('blue'), green: _buildPath('green'),
  red:  _buildPath('red'),  yellow: _buildPath('yellow'),
};

function _nextId(colour, currentId) {
  const path = FULL_PATH[colour];
  const idx  = path.indexOf(currentId);
  if (idx === -1 || idx >= path.length - 1) return currentId;
  return path[idx + 1];
}

// ══════════════════════════════════════════════════════════════════
//  SONS
// ══════════════════════════════════════════════════════════════════
const SFX = (() => {
  let ctx = null;
  const ac = () => { if (!ctx) try { ctx = new (window.AudioContext||window.webkitAudioContext)(); } catch(e){} return ctx; };
  const tone = (f,d,t,v,dt) => {
    try {
      const c=ac(); if(!c) return;
      const o=c.createOscillator(), g=c.createGain();
      o.connect(g); g.connect(c.destination);
      o.type=t||'sine'; o.frequency.value=f;
      const st=c.currentTime+(dt||0);
      g.gain.setValueAtTime(v||0.2,st);
      g.gain.exponentialRampToValueAtTime(0.001,st+d);
      o.start(st); o.stop(st+d);
    } catch(e){}
  };
  return {
    unlock:  ()=>ac(),
    dice:    ()=>{ tone(200,.05,'square',.15); tone(400,.07,'square',.15,.07); tone(600,.1,'square',.15,.14); },
    move:    ()=>{ tone(660,.07,'sine',.18); tone(880,.06,'sine',.14,.08); },
    capture: ()=>{ tone(180,.15,'sawtooth',.22); tone(120,.18,'sawtooth',.18,.1); },
    home:    ()=>{ [784,988,1175].forEach((f,i)=>tone(f,.14,'sine',.22,i*.12)); },
    win:     ()=>{ [523,659,784,1047].forEach((f,i)=>tone(f,.2,'sine',.28,i*.15)); },
  };
})();
window.SFX = SFX;
document.addEventListener('click', ()=>SFX.unlock(), {once:true});

// ══════════════════════════════════════════════════════════════════
//  CSS
// ══════════════════════════════════════════════════════════════════
(function(){
  if (document.getElementById('lk-css')) return;
  const s = document.createElement('style');
  s.id = 'lk-css';
  s.textContent = `
  #ludo-board-wrap{position:relative;border-radius:14px;overflow:hidden;flex-shrink:0;box-shadow:0 0 0 2px rgba(245,197,24,.5),0 0 60px rgba(0,0,0,.85);}
  #ludo-board-wrap>img{display:block;width:100%;height:100%;pointer-events:none;user-select:none;}
  .lp{position:absolute;width:5.2%;height:5.2%;border-radius:50%;border:2.5px solid rgba(255,255,255,.9);transform:translate(-50%,-50%);z-index:10;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:900;font-family:'Bebas Neue',monospace;pointer-events:none;transition:left .3s cubic-bezier(.4,0,.2,1),top .3s cubic-bezier(.4,0,.2,1);box-shadow:0 2px 8px rgba(0,0,0,.5);}
  .lp.sel{pointer-events:auto;cursor:pointer;z-index:20;animation:lp-sel .4s ease-in-out infinite alternate;}
  @keyframes lp-sel{from{transform:translate(-50%,-50%) scale(1);box-shadow:0 0 0 3px gold,0 0 10px gold;}to{transform:translate(-50%,-50%) scale(1.4);box-shadow:0 0 0 5px gold,0 0 24px gold;}}
  .lp.captured{animation:lp-die .38s ease-out forwards;pointer-events:none;}
  @keyframes lp-die{0%{transform:translate(-50%,-50%) scale(1);opacity:1;}50%{transform:translate(-50%,-50%) scale(1.7);opacity:.7;}100%{transform:translate(-50%,-50%) scale(0);opacity:0;}}
  #lk-dice-flat{width:90px;height:90px;background:#fff;border-radius:14px;border:3px solid #ccc;box-shadow:0 6px 20px rgba(0,0,0,.35),inset 0 1px 0 rgba(255,255,255,.8);margin:8px auto;position:relative;cursor:pointer;transition:transform .12s,box-shadow .12s;}
  #lk-dice-flat:hover{transform:scale(1.05);box-shadow:0 8px 28px rgba(0,0,0,.45);}
  #lk-dice-flat:active{transform:scale(.93);}
  #lk-dice-flat.rolling{animation:dk-shake .42s cubic-bezier(.36,.07,.19,.97);}
  @keyframes dk-shake{0%,100%{transform:rotate(0) scale(1);}15%{transform:rotate(-20deg) scale(1.18);}30%{transform:rotate(18deg) scale(1.12);}45%{transform:rotate(-15deg) scale(1.14);}60%{transform:rotate(12deg) scale(1.09);}75%{transform:rotate(-8deg) scale(1.05);}90%{transform:rotate(5deg) scale(1.02);}}
  .lk-dot{position:absolute;border-radius:50%;background:#111;box-shadow:inset 0 1px 3px rgba(0,0,0,.5);}
  .lk-dot.red{background:radial-gradient(circle at 35% 30%,#ff5252,#b71c1c);box-shadow:0 0 8px rgba(183,28,28,.6);}
  #lk-dice-num{font-family:'Bebas Neue',sans-serif;font-size:46px;color:#f5c518;letter-spacing:3px;text-align:center;text-shadow:0 0 18px rgba(245,197,24,.8);margin:2px 0 10px;min-height:54px;line-height:1;}
  @keyframes num-pop{0%{transform:scale(.3);opacity:0;}65%{transform:scale(1.35);opacity:1;}100%{transform:scale(1);opacity:1;}}
  .num-pop{animation:num-pop .28s cubic-bezier(.34,1.56,.64,1);}
  #rb{width:100%;padding:14px;background:linear-gradient(135deg,#ffdb4d,#f5c518,#e6a800);border:none;border-radius:12px;font-family:'Bebas Neue',sans-serif;font-size:17px;letter-spacing:1.5px;color:#0a0800;cursor:pointer;box-shadow:0 6px 20px rgba(245,197,24,.4);transition:all .18s;}
  #rb:hover:not(:disabled){transform:translateY(-2px);box-shadow:0 10px 28px rgba(245,197,24,.6);}
  #rb:active:not(:disabled){transform:scale(.97);}
  #rb:disabled{opacity:.35;cursor:not-allowed;background:#333;box-shadow:none;color:#888;}
  #rb.my-turn{animation:rb-pulse 1s ease-in-out infinite;}
  @keyframes rb-pulse{0%,100%{box-shadow:0 6px 20px rgba(245,197,24,.4);}50%{box-shadow:0 6px 20px rgba(245,197,24,.4),0 0 0 6px rgba(245,197,24,.2);}}
  .pc{display:flex;align-items:center;gap:10px;background:rgba(12,9,32,.85);border:1.5px solid rgba(255,255,255,.07);border-radius:13px;padding:10px 14px;transition:all .3s;flex:1;min-width:140px;}
  .pc.mt{border-color:rgba(245,197,24,.7);background:rgba(245,197,24,.07);box-shadow:0 0 20px rgba(245,197,24,.18);}
  .pdot{width:12px;height:12px;border-radius:50%;flex-shrink:0;}
  .pnm2{font-family:'Bebas Neue',sans-serif;font-size:15px;letter-spacing:.5px;}
  .pft{font-size:10px;color:#4a4470;font-weight:700;margin-top:1px;}
  .gli{padding:4px 0;border-bottom:1px solid rgba(255,255,255,.04);color:#9890c0;font-size:12px;font-weight:600;line-height:1.5;}
  .gli:last-child{border:none;}
  .gli.w{color:#00e676;}.gli.k{color:#ff4757;}.gli.r{color:#f5c518;}
  `;
  document.head.appendChild(s);
})();

// ══════════════════════════════════════════════════════════════════
//  DADO FLAT — pontos DOM
// ══════════════════════════════════════════════════════════════════
const DOT_LAYOUT = {
  1:[[50,50]],
  2:[[28,28],[72,72]],
  3:[[28,28],[50,50],[72,72]],
  4:[[28,28],[72,28],[28,72],[72,72]],
  5:[[28,28],[72,28],[50,50],[28,72],[72,72]],
  6:[[27,20],[73,20],[27,50],[73,50],[27,80],[73,80]],
};

function _drawDots(container, val) {
  container.querySelectorAll('.lk-dot').forEach(d=>d.remove());
  if (container.textContent === '?') container.textContent = '';
  const v = Math.max(1, Math.min(6, val));
  (DOT_LAYOUT[v]||DOT_LAYOUT[1]).forEach(([cx,cy])=>{
    const d = document.createElement('span');
    d.className = 'lk-dot' + (v===1?' red':'');
    const sz = v===1 ? 20 : 14;
    d.style.cssText = `width:${sz}px;height:${sz}px;left:calc(${cx}% - ${sz/2}px);top:calc(${cy}% - ${sz/2}px);`;
    container.appendChild(d);
  });
}

function _animDice(val, cb) {
  SFX.dice();
  const flat = document.getElementById('lk-dice-flat');
  const nm   = document.getElementById('lk-dice-num');
  if (flat) { flat.classList.remove('rolling'); void flat.offsetWidth; flat.classList.add('rolling'); }
  const dfc=document.getElementById('dfc'), dnm=document.getElementById('dnm');
  if (dfc) dfc.textContent=['⚀','⚁','⚂','⚃','⚄','⚅'][val-1];
  if (dnm) dnm.textContent=val;
  setTimeout(()=>{
    if (flat) { flat.classList.remove('rolling'); _drawDots(flat, val); }
    if (nm) { nm.textContent=val; nm.classList.remove('num-pop'); void nm.offsetWidth; nm.classList.add('num-pop'); }
    if (cb) cb();
  }, 450);
}

window.BOARD = { animateDice: _animDice };

// ══════════════════════════════════════════════════════════════════
//  TABULEIRO DOM
// ══════════════════════════════════════════════════════════════════
let _els = {};

function _buildBoard() {
  Object.values(_els).flat().forEach(e=>e&&e.remove());
  _els = {};
  let wrap = document.getElementById('ludo-board-wrap');
  if (!wrap) {
    const cv = document.getElementById('ludo-canvas');
    wrap = document.createElement('div');
    wrap.id = 'ludo-board-wrap';
    const sz = Math.min(460, window.innerWidth-28);
    wrap.style.cssText = `width:${sz}px;height:${sz}px;`;
    if (cv) { cv.style.display='none'; cv.parentNode.insertBefore(wrap,cv); }
    const img = document.createElement('img');
    img.src='/static/ludo_board.png'; img.alt='Tabuleiro';
    img.onerror=()=>{ wrap.style.background='#1a3a1a'; img.style.display='none'; };
    wrap.appendChild(img);
  }
  ['blue','green','red','yellow'].forEach(c=>{
    _els[c]=[];
    for(let i=0;i<4;i++){
      const el=document.createElement('div');
      el.className='lp'; el.textContent=i+1;
      el.style.background=`radial-gradient(circle at 35% 30%,${COLOUR_GRAD[c][0]},${COLOUR_GRAD[c][1]})`;
      el.style.color=COLOUR_TEXT[c];
      el.style.boxShadow=`0 2px 8px ${COLOUR_GRAD[c][1]}aa`;
      wrap.appendChild(el); _els[c].push(el);
    }
    BASE_IDS[c].forEach((id,i)=>_place(c,i,id));
  });
}

function _buildDiceUI() {
  if (document.getElementById('lk-dice-wrap')) return;
  const gcd = document.querySelector('#s-game .gcd');
  if (!gcd) return;
  const w = document.createElement('div');
  w.id = 'lk-dice-wrap';
  w.innerHTML = `<div id="lk-dice-flat" onclick="window.doRoll()"></div><div id="lk-dice-num">-</div>`;
  const dfc=document.getElementById('dfc'), dnm=document.getElementById('dnm');
  if (dfc) { dfc.style.display='none'; dfc.parentNode.insertBefore(w,dfc); }
  else { const btd=gcd.querySelector('.btd'); if(btd) btd.after(w); else gcd.prepend(w); }
  if (dnm) dnm.style.display='none';
  const flat=document.getElementById('lk-dice-flat');
  if (flat) { flat.style.cssText+='display:flex;align-items:center;justify-content:center;font-size:32px;color:#aaa;'; flat.textContent='?'; }
}

function _place(colour, idx, posId) {
  const coord=CMAP[posId]; if(!coord) return;
  const el=_els[colour]?.[idx]; if(!el) return;
  el.style.left=(coord[0]*STEP+STEP/2)+'%';
  el.style.top =(coord[1]*STEP+STEP/2)+'%';
}

function _setSelectable(colour, indices) {
  _clearSel();
  indices.forEach(i=>{
    const el=_els[colour]?.[i]; if(!el) return;
    el.classList.add('sel'); el.style.pointerEvents='auto';
    el.onclick=()=>{ SFX.move(); window.movePc(i); };
  });
}

function _clearSel() {
  Object.values(_els).flat().forEach(el=>{
    if(!el) return;
    el.classList.remove('sel'); el.style.pointerEvents='none'; el.onclick=null;
  });
}

// ══════════════════════════════════════════════════════════════════
//  _isMyTurn — CORRIGIDO: usa window.U que é sincronizado via _syncU()
// ══════════════════════════════════════════════════════════════════
function _isMyTurn(state) {
  if (!state?.players || state.over) return false;
  const p = state.players[state.turn];
  if (!p || state.phase !== 0) return false;
  const me = _getU();
  if (!me) return false;
  const myId    = String(me.id || me.user_id || '');
  const theirId = String(p.user_id || '');
  return myId !== '' && myId === theirId;
}

// ══════════════════════════════════════════════════════════════════
//  ANIMAÇÃO DIFF
// ══════════════════════════════════════════════════════════════════
function _applyDiff(prev, next) {
  if (!prev?.players||!next?.players) return;
  next.players.forEach((pl,idx)=>{
    const colour=pl.color||pl.colour, prevPl=prev.players[idx];
    if(!prevPl||!colour||!_els[colour]) return;
    (pl.pos||[]).forEach((toId,i)=>{
      const fromId=prevPl.pos?.[i];
      if(fromId==null||fromId===toId) return;
      if(_BASE_SET.has(toId)&&!_BASE_SET.has(fromId)){
        const el=_els[colour]?.[i]; if(!el) return;
        SFX.capture(); el.classList.add('captured');
        setTimeout(()=>{ el.classList.remove('captured'); _place(colour,i,toId); },400);
      } else {
        _movePieceSmooth(colour,i,fromId,toId,()=>{ if(toId===HOME_ID[colour]) SFX.home(); });
      }
    });
  });
}

const _animating = new Set();

function _movePieceSmooth(colour, pieceIdx, fromId, toId, onDone) {
  const key=colour+'-'+pieceIdx;
  if (_BASE_SET.has(fromId)) { _place(colour,pieceIdx,toId); if(onDone)onDone(); return; }
  const path=FULL_PATH[colour];
  const fi=path.indexOf(fromId), ti=path.indexOf(toId);
  if(fi===-1||ti===-1||ti<=fi){ _place(colour,pieceIdx,toId); if(onDone)onDone(); return; }
  _animating.add(key);
  let cur=fromId;
  function step(){
    if(cur===toId){ _animating.delete(key); if(onDone)onDone(); return; }
    cur=_nextId(colour,cur); _place(colour,pieceIdx,cur); SFX.move();
    setTimeout(step,150);
  }
  step();
}

// ══════════════════════════════════════════════════════════════════
//  RENDER STATE
// ══════════════════════════════════════════════════════════════════
window.CUR_STATE=null; window.PREV_STATE=null;

window.renderState = function(state) {
  if(!state||!state.players) return;
  window.CUR_STATE=state;

  state.players.forEach(pl=>{
    const c=pl.color||pl.colour; if(!c||!_els[c]) return;
    (pl.pos||[]).forEach((posId,i)=>{ if(!_animating.has(c+'-'+i)) _place(c,i,posId); });
  });

  _clearSel();

  const pcEl=document.getElementById('player-cards');
  if(pcEl){
    const me=_getU(), myId=String(me?.id||me?.user_id||'');
    pcEl.innerHTML=state.players.map((pl,idx)=>{
      const c=pl.color||pl.colour||'blue';
      const isMe=String(pl.user_id||'')===myId;
      const active=idx===state.turn;
      const hex=COLOUR_HEX[c]||'#888';
      return `<div class="pc ${active?'mt':''}">
        <div class="pdot" style="background:${hex};box-shadow:0 0 7px ${hex}80"></div>
        <div style="flex:1">
          <div class="pnm2" style="color:${active?'#f5c518':'#c0b8e8'}">${pl.name}${isMe?' (Tu)':''}</div>
          <div class="pft">${COLOUR_NAME[c]||c} · ${pl.fin??0}/4</div>
        </div>
        ${active?'<div style="font-size:18px;margin-left:auto">🎲</div>':''}
      </div>`;
    }).join('');
  }

  const rb=document.getElementById('rb');
  const myT=_isMyTurn(state);

  if(rb){
    rb.disabled=!myT||state.phase!==0||!!state.over;
    if(state.over){
      rb.textContent='🏁 Jogo terminado'; rb.classList.remove('my-turn');
    } else if(myT&&state.phase===0){
      rb.textContent='🎲 LANÇAR DADO'; rb.classList.add('my-turn');
    } else {
      const curP=state.players[state.turn];
      rb.textContent=`⏳ Vez de ${curP?curP.name:'...'}`;
      rb.classList.remove('my-turn');
    }
  }

  if(!myT&&state.dice&&state.phase===1){
    const nm=document.getElementById('lk-dice-num'), flat=document.getElementById('lk-dice-flat');
    if(nm){nm.textContent=state.dice;nm.classList.remove('num-pop');void nm.offsetWidth;nm.classList.add('num-pop');}
    if(flat) _drawDots(flat,state.dice);
  }

  const gbv=document.getElementById('gbv');
  if(gbv&&state.bet!=null) try{gbv.textContent=Number(state.bet).toLocaleString('pt-AO')+' KZ';}catch(e){}

  if(state.log?.length){
    const le=document.getElementById('glog');
    if(le){
      le.innerHTML=state.log.slice(-20).reverse().map(l=>{
        const cls=/venceu|casa/i.test(l)?'w':/captur/i.test(l)?'k':/tirou/i.test(l)?'r':'';
        return `<div class="gli ${cls}">${l}</div>`;
      }).join('');
    }
  }

  const co=document.getElementById('chat-online');
  if(co) co.textContent=(state.players?.length||0)+' online';
};

// ══════════════════════════════════════════════════════════════════
//  HIGHLIGHT
// ══════════════════════════════════════════════════════════════════
window.highlightPcs=function(mv){
  if(!window.CUR_STATE||!mv?.length) return;
  const curP=window.CUR_STATE.players?.[window.CUR_STATE.turn];
  if(!curP) return;
  const colour=curP.color||curP.colour;
  if(colour&&_els[colour]) _setSelectable(colour,mv);
};

// ══════════════════════════════════════════════════════════════════
//  EVENTOS SSE
// ══════════════════════════════════════════════════════════════════
window.onGameStarted=function(state){
  window.RID=state.room_id||window.RID;
  window.CUR_STATE=state; window.PREV_STATE=null;
  if(typeof pg==='function') pg('game');
  setTimeout(()=>{
    _buildBoard(); _buildDiceUI(); window.renderState(state);
    const chatEl=document.getElementById('chat-msgs');
    if(chatEl) chatEl.innerHTML='';
    if(typeof addChat==='function'){
      addChat('Sistema',`Jogo iniciado com ${state.players.length} jogadores!`,true);
      state.players.forEach(pl=>{
        const c=pl.color||pl.colour||'blue';
        addChat('Sistema',`${COLOUR_NAME[c]||c}: ${pl.name}`,true);
      });
    }
  },80);
};

window.onGameUpdate=function(state){
  const prev=window.CUR_STATE?JSON.parse(JSON.stringify(window.CUR_STATE)):null;
  window.CUR_STATE=state;
  if(prev) _applyDiff(prev,state);
  window.renderState(state);
};

window.onGameOver=function(d){
  const goo=document.getElementById('goo'); if(!goo) return;
  const goic=document.getElementById('goic'),gott=document.getElementById('gott');
  const gosb=document.getElementById('gosb'),gopr=document.getElementById('gopr');
  const gocd=document.getElementById('gocd');
  if(d.won){
    SFX.win();
    if(typeof coinRain==='function') coinRain();
    if(typeof showFlash==='function') showFlash('🏆');
    if(goic) goic.textContent='🏆';
    if(gott){gott.textContent='VITÓRIA!';gott.style.color='#f5c518';}
    if(gosb) gosb.textContent='Parabéns, venceste!';
    if(gopr){gopr.textContent='+'+Number(d.prize||0).toLocaleString('pt-AO')+' KZ';gopr.style.color='#00e676';}
    gocd?.classList.remove('lose');
  } else {
    if(goic) goic.textContent='💀';
    if(gott){gott.textContent='DERROTA';gott.style.color='#ff4757';}
    if(gosb) gosb.textContent='Boa sorte da próxima!';
    if(gopr){gopr.textContent='—';gopr.style.color='#ff4757';}
    gocd?.classList.add('lose');
  }
  goo.classList.remove('hidden');
  if(d.balance!=null&&window.U){window.U.balance=d.balance;if(typeof updN==='function')updN();}
};

// ══════════════════════════════════════════════════════════════════
//  doRoll — NÃO verifica rb.disabled (o servidor valida o turno)
// ══════════════════════════════════════════════════════════════════
window.doRoll=async function(){
  if(!window.RID) return;
  const rb=document.getElementById('rb');
  if(rb){rb.disabled=true;rb.classList.remove('my-turn');}
  const faceEl=document.getElementById('dfc');
  if(faceEl) faceEl.classList.add('rolling');

  let d;
  try{
    const r=await fetch('/api/game/roll',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({room_id:window.RID}),credentials:'same-origin',
    });
    d=await r.json();
  }catch(e){
    if(rb) rb.disabled=false;
    if(faceEl) faceEl.classList.remove('rolling');
    return;
  }
  if(faceEl) faceEl.classList.remove('rolling');

  if(d.error){
    if(typeof toast==='function') toast('❌ '+d.error,'ter');
    // Re-renderiza para repor estado correto do botão
    if(window.CUR_STATE) window.renderState(window.CUR_STATE);
    return;
  }

  _animDice(d.dice,async()=>{
    window.renderState(d);
    if(d.phase===1){
      try{
        const mv=await fetch('/api/game/movable',{
          method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({room_id:window.RID}),credentials:'same-origin',
        }).then(r=>r.json());
        if(mv.movable?.length) window.highlightPcs(mv.movable);
      }catch(e){}
    }
  });
};

// ══════════════════════════════════════════════════════════════════
//  movePc
// ══════════════════════════════════════════════════════════════════
window.movePc=async function(idx){
  if(!window.RID) return;
  _clearSel();
  window.PREV_STATE=window.CUR_STATE?JSON.parse(JSON.stringify(window.CUR_STATE)):null;
  let d;
  try{
    const r=await fetch('/api/game/move',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({room_id:window.RID,piece:idx}),credentials:'same-origin',
    });
    d=await r.json();
  }catch(e){return;}
  if(d.error){if(typeof toast==='function') toast('❌ '+d.error,'ter');return;}
  if(window.PREV_STATE) _applyDiff(window.PREV_STATE,d);
  window.CUR_STATE=d;
  window.renderState(d);
};

// ══════════════════════════════════════════════════════════════════
//  leaveGame
// ══════════════════════════════════════════════════════════════════
window.leaveGame=async function(){
  if(!confirm('Abandonar? Perdes a aposta.')) return;
  if(window.RID){
    await fetch('/api/game/leave',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({room_id:window.RID}),credentials:'same-origin',
    }).catch(()=>{});
  }
  window.RID=null;
  if(typeof pg==='function') pg('home');
};

window.buildBoard=_buildBoard;
window.initCanvas=_buildBoard;
window.startRenderLoop=function(){};

console.log('[LudoKz] v6 — window.U sincronizado, dado desbloqueado');
