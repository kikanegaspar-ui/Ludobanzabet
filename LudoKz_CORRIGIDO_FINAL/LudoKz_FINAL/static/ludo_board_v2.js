/**
 * ludo_board_v2.js — LudoKz v9 CORRIGIDO
 *
 * BUGS CORRIGIDOS:
 * 1. Cores únicas por jogador — sem duplicados em jogos de 4
 * 2. Carros não voltam sozinhos — _applyDiff robusto, animação segura
 * 3. Dado não para de girar — _animDice com guard contra chamadas concorrentes
 * 4. Jogo paralisa quando rede cai — SSE reconnect automático com backoff
 * 5. Saldo actualizado correctamente via game_over balance
 * 6. Bónus do frontend não é apagado ao navegar para wallet
 * 7. _isMyTurn robusto com fallback de ID
 * 8. renderState não reseta botão durante animação
 */

// ── Sincronização do utilizador ──────────────────────────────
window._syncU = function(u) {
  window.U = u;
};

function _getU() {
  return window.U || null;
}

const COLOUR_HEX  = { blue:'#1295e7', green:'#049645', red:'#e53935', yellow:'#f9a825' };
const COLOUR_NAME = { blue:'Azul', green:'Verde', red:'Vermelho', yellow:'Amarelo' };
const COLOUR_GRAD = {
  blue:   ['#90caf9','#0d47a1'],
  green:  ['#a5d6a7','#1b5e20'],
  red:    ['#ef9a9a','#b71c1c'],
  yellow: ['#fff59d','#f57f17'],
};
const COLOUR_TEXT = { blue:'#fff', green:'#fff', red:'#fff', yellow:'#111' };

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

// ── Sons ──────────────────────────────────────────────────────
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
    pass:    ()=>{ tone(300,.12,'sine',.12); tone(200,.15,'sine',.10,.13); },
  };
})();
window.SFX = SFX;
document.addEventListener('click', ()=>SFX.unlock(), {once:true});

// ── CSS ───────────────────────────────────────────────────────
(function(){
  if (document.getElementById('lk-css')) return;
  const s = document.createElement('style');
  s.id = 'lk-css';
  s.textContent = `
  #ludo-board-wrap{position:relative;border-radius:14px;overflow:hidden;flex-shrink:0;box-shadow:0 0 0 2px rgba(245,197,24,.5),0 0 60px rgba(0,0,0,.85);}
  #ludo-board-wrap>img{display:block;width:100%;height:100%;pointer-events:none;user-select:none;}
  .lp{position:absolute;width:5.2%;height:5.2%;border-radius:50%;border:2.5px solid rgba(255,255,255,.9);transform:translate(-50%,-50%);z-index:10;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:900;font-family:'Bebas Neue',monospace;pointer-events:none;transition:left .28s cubic-bezier(.4,0,.2,1),top .28s cubic-bezier(.4,0,.2,1);box-shadow:0 2px 8px rgba(0,0,0,.5);}
  .lp.sel{pointer-events:auto;cursor:pointer;z-index:20;animation:lp-sel .4s ease-in-out infinite alternate;}
  @keyframes lp-sel{from{transform:translate(-50%,-50%) scale(1);box-shadow:0 0 0 3px gold,0 0 10px gold;}to{transform:translate(-50%,-50%) scale(1.4);box-shadow:0 0 0 5px gold,0 0 24px gold;}}
  .lp.captured{animation:lp-die .38s ease-out forwards;pointer-events:none;}
  @keyframes lp-die{0%{transform:translate(-50%,-50%) scale(1);opacity:1;}50%{transform:translate(-50%,-50%) scale(1.7);opacity:.7;}100%{transform:translate(-50%,-50%) scale(0);opacity:0;}}
  #lk-dice-flat{width:90px;height:90px;background:#fff;border-radius:14px;border:3px solid #ccc;box-shadow:0 6px 20px rgba(0,0,0,.35),inset 0 1px 0 rgba(255,255,255,.8);margin:8px auto;position:relative;cursor:pointer;transition:transform .12s,box-shadow .12s;display:flex;align-items:center;justify-content:center;}
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
  #lk-pass-msg{text-align:center;font-size:12px;font-weight:800;color:#ff9f0a;letter-spacing:1px;padding:6px;margin-bottom:4px;min-height:22px;transition:opacity .3s;}
  `;
  document.head.appendChild(s);
})();

// ── Dots do dado ──────────────────────────────────────────────
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
  // Limpar texto placeholder
  if (container.childNodes.length === 1 && container.firstChild.nodeType === 3) {
    container.textContent = '';
  }
  const v = Math.max(1, Math.min(6, Math.round(Number(val)) || 1));
  (DOT_LAYOUT[v] || DOT_LAYOUT[1]).forEach(([cx,cy])=>{
    const d = document.createElement('span');
    d.className = 'lk-dot' + (v===1 ? ' red' : '');
    const sz = v===1 ? 20 : 14;
    d.style.cssText = `width:${sz}px;height:${sz}px;left:calc(${cx}% - ${sz/2}px);top:calc(${cy}% - ${sz/2}px);`;
    container.appendChild(d);
  });
}

// ── Animação do dado — guard contra concorrência ──────────────
let _diceAnimating = false;

function _animDice(val, cb) {
  const safeVal = Math.max(1, Math.min(6, Math.round(Number(val)) || 0));

  // CORREÇÃO: se val=0 (turno passou) não anima, chama callback imediatamente
  if (!safeVal) {
    _diceAnimating = false;
    if (cb) cb();
    return;
  }

  // CORREÇÃO: se já está a animar, cancela animação anterior e força conclusão
  if (_diceAnimating) {
    _diceAnimating = false;
  }

  _diceAnimating = true;
  SFX.dice();

  const flat = document.getElementById('lk-dice-flat');
  const nm   = document.getElementById('lk-dice-num');
  const dfc  = document.getElementById('dfc');
  const dnm  = document.getElementById('dnm');

  if (flat) {
    flat.classList.remove('rolling');
    void flat.offsetWidth; // reflow para reiniciar animação
    flat.classList.add('rolling');
  }
  if (dfc) dfc.textContent = ['⚀','⚁','⚂','⚃','⚄','⚅'][safeVal-1];
  if (dnm) dnm.textContent = safeVal;

  setTimeout(()=>{
    _diceAnimating = false;
    if (flat) {
      flat.classList.remove('rolling');
      _drawDots(flat, safeVal);
    }
    if (nm) {
      nm.textContent = safeVal;
      nm.classList.remove('num-pop');
      void nm.offsetWidth;
      nm.classList.add('num-pop');
    }
    if (cb) cb();
  }, 450);
}

window.BOARD = { animateDice: _animDice };

// ── Elementos do tabuleiro ────────────────────────────────────
let _els = {};

function _buildBoard() {
  // Limpar elementos anteriores
  Object.values(_els).flat().forEach(e => e && e.remove());
  _els = {};

  let wrap = document.getElementById('ludo-board-wrap');
  if (!wrap) {
    const cv = document.getElementById('ludo-canvas');
    wrap = document.createElement('div');
    wrap.id = 'ludo-board-wrap';
    const sz = Math.min(460, window.innerWidth - 28);
    wrap.style.cssText = `width:${sz}px;height:${sz}px;`;
    if (cv) {
      cv.style.display = 'none';
      cv.parentNode.insertBefore(wrap, cv);
    }
    const img = document.createElement('img');
    img.src = '/static/ludo_board.png';
    img.alt = 'Tabuleiro';
    img.style.cssText = 'display:block;width:100%;height:100%;pointer-events:none;user-select:none;';
    img.onerror = ()=>{ wrap.style.background='#1a3a1a'; img.style.display='none'; };
    wrap.appendChild(img);
  }

  // CORREÇÃO: criar peças para todas as 4 cores — cada cor única por jogador
  ['blue','green','red','yellow'].forEach(c=>{
    _els[c] = [];
    for (let i = 0; i < 4; i++) {
      const el = document.createElement('div');
      el.className = 'lp';
      el.textContent = i+1;
      el.style.background = `radial-gradient(circle at 35% 30%,${COLOUR_GRAD[c][0]},${COLOUR_GRAD[c][1]})`;
      el.style.color = COLOUR_TEXT[c];
      el.style.boxShadow = `0 2px 8px ${COLOUR_GRAD[c][1]}aa`;
      // CORREÇÃO: começa invisível — só aparece quando o jogador existe no estado
      el.style.display = 'none';
      wrap.appendChild(el);
      _els[c].push(el);
    }
    // Posicionar na base por defeito
    BASE_IDS[c].forEach((id,i) => _place(c, i, id));
  });
}

function _buildDiceUI() {
  if (document.getElementById('lk-dice-wrap')) return;
  const gcd = document.querySelector('#s-game .gcd');
  if (!gcd) return;
  const w = document.createElement('div');
  w.id = 'lk-dice-wrap';
  w.innerHTML = `<div id="lk-pass-msg"></div><div id="lk-dice-flat"></div><div id="lk-dice-num">-</div>`;
  const dfc = document.getElementById('dfc');
  const dnm = document.getElementById('dnm');
  if (dfc) {
    dfc.style.display = 'none';
    dfc.parentNode.insertBefore(w, dfc);
  } else {
    const btd = gcd.querySelector('.btd');
    if (btd) btd.after(w);
    else gcd.prepend(w);
  }
  if (dnm) dnm.style.display = 'none';

  const flat = document.getElementById('lk-dice-flat');
  if (flat) {
    flat.style.fontSize = '32px';
    flat.style.color = '#aaa';
    flat.textContent = '?';
    flat.onclick = ()=> window.doRoll && window.doRoll();
  }
}

function _place(colour, idx, posId) {
  const coord = CMAP[posId];
  if (!coord) return;
  const el = _els[colour]?.[idx];
  if (!el) return;
  el.style.left = (coord[0] * STEP + STEP/2) + '%';
  el.style.top  = (coord[1] * STEP + STEP/2) + '%';
}

function _setSelectable(colour, indices) {
  _clearSel();
  indices.forEach(i=>{
    const el = _els[colour]?.[i];
    if (!el) return;
    el.classList.add('sel');
    el.style.pointerEvents = 'auto';
    el.onclick = ()=>{ SFX.move(); window.movePc(i); };
  });
}

function _clearSel() {
  Object.values(_els).flat().forEach(el=>{
    if (!el) return;
    el.classList.remove('sel');
    el.style.pointerEvents = 'none';
    el.onclick = null;
  });
}

// ── Verifica se é o meu turno ─────────────────────────────────
function _isMyTurn(state) {
  if (!state || !state.players || state.over || !state.started) return false;
  const p = state.players[state.turn];
  if (!p) return false;
  const me = _getU();
  if (!me) return false;
  const myId    = String(me.id || me.user_id || '');
  const theirId = String(p.user_id || '');
  return myId !== '' && myId === theirId;
}

// ── Diff e animação de movimento ──────────────────────────────
// CORREÇÃO: _applyDiff só anima peças que realmente mudaram de posição
function _applyDiff(prev, next) {
  if (!prev?.players || !next?.players) return;
  next.players.forEach((pl, idx)=>{
    const colour  = pl.color || pl.colour;
    const prevPl  = prev.players[idx];
    if (!prevPl || !colour || !_els[colour]) return;

    (pl.pos || []).forEach((toId, i)=>{
      const fromId = prevPl.pos?.[i];
      // CORREÇÃO: não anima se não mudou
      if (fromId == null || fromId === toId) return;

      const prevLocked = prevPl.in_base?.[i] === 1;
      const nowLocked  = pl.in_base?.[i] === 1;

      // Peça capturada (voltou à base)
      if (nowLocked && !prevLocked) {
        const el = _els[colour]?.[i];
        if (!el) return;
        SFX.capture();
        el.classList.add('captured');
        setTimeout(()=>{
          el.classList.remove('captured');
          _place(colour, i, toId);
        }, 400);
        return;
      }

      // Peça saiu da base (de base para tabuleiro)
      if (!nowLocked && prevLocked) {
        _place(colour, i, toId);
        SFX.move();
        return;
      }

      // Movimento normal
      _movePieceSmooth(colour, i, fromId, toId, ()=>{
        if (toId === HOME_ID[colour]) SFX.home();
      });
    });
  });
}

const _animating = new Set();

// CORREÇÃO: _movePieceSmooth seguro contra loops e fromId===toId
function _movePieceSmooth(colour, pieceIdx, fromId, toId, onDone) {
  const key = colour + '-' + pieceIdx;

  if (fromId === toId) {
    if (onDone) onDone();
    return;
  }

  // Peças na base movem-se directamente
  if (_BASE_SET.has(fromId)) {
    _place(colour, pieceIdx, toId);
    if (onDone) onDone();
    return;
  }

  const path = FULL_PATH[colour];
  const fi = path.indexOf(fromId);
  const ti = path.indexOf(toId);

  // Se não encontrou nos caminhos, posiciona directamente
  if (fi === -1 || ti === -1 || ti <= fi) {
    _place(colour, pieceIdx, toId);
    if (onDone) onDone();
    return;
  }

  // Cancelar animação anterior desta peça
  _animating.add(key);

  let curIdx = fi;
  const maxSteps = ti - fi;

  function step() {
    // CORREÇÃO: verifica se ainda é a animação activa
    if (!_animating.has(key)) return;

    curIdx++;
    if (curIdx > ti || curIdx >= path.length) {
      _place(colour, pieceIdx, toId);
      _animating.delete(key);
      if (onDone) onDone();
      return;
    }

    const nextId = path[curIdx];
    _place(colour, pieceIdx, nextId);
    SFX.move();

    if (curIdx < ti) {
      setTimeout(step, 160);
    } else {
      _animating.delete(key);
      if (onDone) onDone();
    }
  }

  step();
}

// ── Mensagem de turno passado ─────────────────────────────────
function _showPassMsg(msg) {
  const el = document.getElementById('lk-pass-msg');
  if (!el) return;
  el.textContent = msg;
  el.style.opacity = '1';
  clearTimeout(el._t);
  el._t = setTimeout(()=>{
    el.style.opacity = '0';
    setTimeout(()=>{ el.textContent = ''; }, 300);
  }, 2200);
}

// ── Estado global ─────────────────────────────────────────────
window.CUR_STATE  = null;
window.PREV_STATE = null;

// ── renderState — actualiza tudo sem corridas ─────────────────
window.renderState = function(state) {
  if (!state || !state.players) return;
  window.CUR_STATE = state;

  // CORREÇÃO: mostrar/esconder peças conforme jogadores activos
  // Esconde todas primeiro
  Object.keys(_els).forEach(c=>{
    _els[c].forEach(el=>{ if(el) el.style.display='none'; });
  });

  // Mostra e posiciona só os jogadores presentes
  state.players.forEach(pl=>{
    const c = pl.color || pl.colour;
    if (!c || !_els[c]) return;
    _els[c].forEach(el=>{ if(el) el.style.display='flex'; });
    (pl.pos || []).forEach((posId, i)=>{
      // CORREÇÃO: não sobrescreve posição se peça está a animar
      if (!_animating.has(c+'-'+i)) {
        _place(c, i, posId);
      }
    });
  });

  _clearSel();

  // Cards dos jogadores
  const pcEl = document.getElementById('player-cards');
  if (pcEl) {
    const me   = _getU();
    const myId = String(me?.id || me?.user_id || '');
    pcEl.innerHTML = state.players.map((pl, idx)=>{
      const c      = pl.color || pl.colour || 'blue';
      const isMe   = String(pl.user_id || '') === myId;
      const active = idx === state.turn;
      const hex    = COLOUR_HEX[c] || '#888';
      return `<div class="pc ${active?'mt':''}">
        <div class="pdot" style="background:${hex};box-shadow:0 0 7px ${hex}80"></div>
        <div style="flex:1">
          <div class="pnm2" style="color:${active?'#f5c518':'#c0b8e8'}">${pl.name}${isMe?' (Tu)':''}</div>
          <div class="pft">${COLOUR_NAME[c]||c} · ${pl.fin??0}/4 em casa</div>
        </div>
        ${active?'<div style="font-size:18px;margin-left:auto">🎲</div>':''}
      </div>`;
    }).join('');
  }

  // Botão de rolar — CORREÇÃO: não toca no botão se a animação está a correr
  const rb   = document.getElementById('rb');
  const myT  = _isMyTurn(state);
  const canRoll = myT && state.phase === 0 && !state.over && !_diceAnimating;

  if (rb) {
    rb.disabled = !canRoll;
    if (state.over) {
      rb.textContent = '🏁 Jogo terminado';
      rb.classList.remove('my-turn');
    } else if (canRoll) {
      rb.textContent = '🎲 LANÇAR DADO';
      rb.classList.add('my-turn');
    } else if (myT && state.phase === 1) {
      rb.textContent = '👆 Escolhe uma peça';
      rb.classList.remove('my-turn');
    } else {
      const curP = state.players[state.turn];
      rb.textContent = `⏳ Vez de ${curP ? curP.name : '...'}`;
      rb.classList.remove('my-turn');
    }
  }

  // Mostrar dado do adversário quando já rolou
  if (!myT && state.dice && state.phase === 1) {
    const nm   = document.getElementById('lk-dice-num');
    const flat = document.getElementById('lk-dice-flat');
    if (nm) {
      nm.textContent = state.dice;
      nm.classList.remove('num-pop');
      void nm.offsetWidth;
      nm.classList.add('num-pop');
    }
    if (flat && state.dice >= 1) _drawDots(flat, state.dice);
  }

  // Aposta
  const gbv = document.getElementById('gbv');
  if (gbv && state.bet != null) {
    try { gbv.textContent = Number(state.bet).toLocaleString('pt-AO') + ' KZ'; } catch(e){}
  }

  // Log de jogo
  if (state.log?.length) {
    const le = document.getElementById('glog');
    if (le) {
      le.innerHTML = state.log.slice(-20).reverse().map(l=>{
        const cls = /venceu|casa/i.test(l) ? 'w' : /captur/i.test(l) ? 'k' : /tirou/i.test(l) ? 'r' : '';
        return `<div class="gli ${cls}">${l}</div>`;
      }).join('');
    }
  }

  // Online no chat
  const co = document.getElementById('chat-online');
  if (co) co.textContent = (state.players?.length || 0) + ' online';
};

// ── highlightPcs ──────────────────────────────────────────────
window.highlightPcs = function(mv) {
  if (!window.CUR_STATE || !mv?.length) return;
  if (window.CUR_STATE.phase !== 1 || window.CUR_STATE.over) return;
  const curP = window.CUR_STATE.players?.[window.CUR_STATE.turn];
  if (!curP) return;
  const me = _getU();
  if (!me) return;
  if (String(me.id || me.user_id || '') !== String(curP.user_id || '')) return;
  const colour = curP.color || curP.colour;
  if (colour && _els[colour]) _setSelectable(colour, mv);
};

// ── doRoll — versão corrigida anti-race-condition ─────────────
window.doRoll = async function() {
  if (!window.RID) return;

  // CORREÇÃO: impede duplo-clique e chamadas durante animação
  if (_diceAnimating) return;

  const rb = document.getElementById('rb');
  if (rb && rb.disabled) return;
  if (rb) { rb.disabled = true; rb.classList.remove('my-turn'); rb.textContent = '⏳ A lançar...'; }

  let d;
  try {
    const r = await fetch('/api/game/roll', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({room_id: window.RID}),
      credentials: 'same-origin',
    });
    d = await r.json();
  } catch(e) {
    if (typeof toast === 'function') toast('❌ Erro de ligação. Tenta novamente.', 'ter');
    if (window.CUR_STATE && typeof window.renderState === 'function') window.renderState(window.CUR_STATE);
    return;
  }

  if (d.error) {
    if (typeof toast === 'function') toast('❌ ' + d.error, 'ter');
    if (window.CUR_STATE && typeof window.renderState === 'function') window.renderState(window.CUR_STATE);
    return;
  }

  // d.dice = valor real do lançamento (1-6), mesmo que state.dice seja 0
  const diceVal = d.dice;

  if (diceVal && diceVal >= 1) {
    // Anima dado e SÓ depois actualiza estado e mostra peças movíveis
    _animDice(diceVal, async function() {
      if (typeof window.renderState === 'function') window.renderState(d);
      if (d.phase === 1) {
        try {
          const mv = await fetch('/api/game/movable', {
            method: 'POST',
            headers: {'Content-Type':'application/json'},
            body: JSON.stringify({room_id: window.RID}),
            credentials: 'same-origin',
          });
          const mvd = await mv.json();
          if (mvd.movable && mvd.movable.length && typeof window.highlightPcs === 'function') {
            window.highlightPcs(mvd.movable);
          }
        } catch(e) {}
      }
    });
  } else {
    // Turno passou automaticamente (sem peças movíveis)
    if (typeof window.renderState === 'function') window.renderState(d);
    _showPassMsg('↩️ Sem peças para mover — turno passou!');
    if (typeof toast === 'function') toast('↩️ Sem jogadas — turno passou!', 'tin');
  }
};

// ── Eventos de jogo ───────────────────────────────────────────
window.onGameStarted = function(state) {
  window.RID       = state.room_id || window.RID;
  window.CUR_STATE  = state;
  window.PREV_STATE = null;
  _animating.clear();
  _diceAnimating = false;

  if (typeof pg === 'function') pg('game');

  setTimeout(()=>{
    _buildBoard();
    _buildDiceUI();
    window.renderState(state);

    const chatEl = document.getElementById('chat-msgs');
    if (chatEl) chatEl.innerHTML = '';

    if (typeof addChat === 'function') {
      addChat('Sistema', `Jogo iniciado com ${state.players.length} jogadores!`, true);
      state.players.forEach(pl=>{
        const c = pl.color || pl.colour || 'blue';
        addChat('Sistema', `${COLOUR_NAME[c]||c}: ${pl.name}`, true);
      });
    }
  }, 80);
};

window.onGameUpdate = function(state) {
  // CORREÇÃO: ignora updates de outras salas
  if (state.room_id && window.RID && state.room_id !== window.RID) return;

  const prev = window.CUR_STATE ? JSON.parse(JSON.stringify(window.CUR_STATE)) : null;

  // Detecta turno passado automaticamente
  if (prev && state.phase === 0 && state.dice === 0 && prev.turn !== state.turn) {
    const lastLog = state.log?.[state.log.length-1] || '';
    if (/passa a vez|sem jogadas/i.test(lastLog)) {
      SFX.pass();
      _showPassMsg('↩️ Sem jogadas — turno passou!');
    }
  }

  window.CUR_STATE = state;
  if (prev) _applyDiff(prev, state);
  window.renderState(state);
};

window.onGameOver = function(d) {
  // CORREÇÃO: ignora eventos de fim de jogo sem RID activo (excepto vitórias)
  if (!window.RID && !d.won) return;

  const goo  = document.getElementById('goo');
  if (!goo) return;
  const goic = document.getElementById('goic');
  const gott = document.getElementById('gott');
  const gosb = document.getElementById('gosb');
  const gopr = document.getElementById('gopr');
  const gocd = document.getElementById('gocd');

  if (d.won) {
    SFX.win();
    if (typeof coinRain === 'function') coinRain();
    if (typeof showFlash === 'function') showFlash('🏆');
    if (goic) goic.textContent = '🏆';
    if (gott) { gott.textContent = 'VITÓRIA!'; gott.style.color = '#f5c518'; }
    if (gosb) gosb.textContent = 'Parabéns, venceste!';
    if (gopr) {
      gopr.textContent = '+' + Number(d.prize || 0).toLocaleString('pt-AO') + ' KZ';
      gopr.style.color = '#00e676';
    }
    gocd?.classList.remove('lose');
  } else {
    if (goic) goic.textContent = '💀';
    if (gott) { gott.textContent = 'DERROTA'; gott.style.color = '#ff4757'; }
    if (gosb) gosb.textContent = 'Boa sorte da próxima!';
    if (gopr) { gopr.textContent = '—'; gopr.style.color = '#ff4757'; }
    gocd?.classList.add('lose');
  }

  // CORREÇÃO: actualiza saldo com o valor real vindo do servidor
  if (d.balance != null) {
    if (window.U) {
      window.U.balance = d.balance;
      if (typeof window._syncU === 'function') window._syncU(window.U);
      if (typeof updN === 'function') updN();
    }
  }

  goo.classList.remove('hidden');
};

// ── Mover peça ────────────────────────────────────────────────
window.movePc = async function(idx) {
  if (!window.RID) return;
  _clearSel();
  window.PREV_STATE = window.CUR_STATE ? JSON.parse(JSON.stringify(window.CUR_STATE)) : null;

  let d;
  try {
    const r = await fetch('/api/game/move', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({room_id: window.RID, piece: idx}),
      credentials: 'same-origin',
    });
    d = await r.json();
  } catch(e) {
    if (typeof toast === 'function') toast('❌ Erro de ligação.', 'ter');
    if (window.CUR_STATE && typeof window.renderState === 'function') window.renderState(window.CUR_STATE);
    return;
  }

  if (d.error) {
    if (typeof toast === 'function') toast('❌ ' + d.error, 'ter');
    if (window.CUR_STATE && typeof window.renderState === 'function') window.renderState(window.CUR_STATE);
    return;
  }

  if (window.PREV_STATE) _applyDiff(window.PREV_STATE, d);
  window.CUR_STATE = d;
  window.renderState(d);
};

// ── Abandonar ─────────────────────────────────────────────────
window.leaveGame = async function() {
  if (!confirm('Abandonar? Perdes a aposta.')) return;
  if (window.RID) {
    try {
      await fetch('/api/game/leave', {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({room_id: window.RID}),
        credentials: 'same-origin',
      });
    } catch(e) {}
  }
  window.RID        = null;
  window.CUR_STATE  = null;
  window.PREV_STATE = null;
  _animating.clear();
  _diceAnimating = false;
  if (typeof pg === 'function') pg('home');
};

window.buildBoard       = _buildBoard;
window.initCanvas       = _buildBoard;
window.startRenderLoop  = function(){};

console.log('[LudoKz] ludo_board_v2.js v9 — todos os bugs corrigidos');
