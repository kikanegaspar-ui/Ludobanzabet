/**
 * ludo_board_v2.js — LudoKz FINAL CORRIGIDO
 *
 * BUGS CORRIGIDOS:
 * 1. Conflito doRoll/movePc — sobrescreve DEFINITIVAMENTE após load
 * 2. Dado 3D — pontos via elementos DOM (sem ::after CSS), pretos e visíveis em todas as faces
 * 3. Movimento peças — usa IDs numéricos (0-51, 100-405, 500-803) em vez de coordenadas internas
 * 4. FULL_PATH correto por cor — caminho completo de IDs para animação casa a casa
 * 5. _BASE_ID_SET — deteção correta de base por ID numérico
 */

// ══════════════════════════════════════════════════════════════════
//  MAPAS DE CORES
// ══════════════════════════════════════════════════════════════════
const COLOUR_TO_PK = { blue:'P1', green:'P2', red:'P3', yellow:'P4' };
const PK_COLOUR    = { P1:'blue', P2:'green', P3:'red', P4:'yellow' };
const COLOUR_HEX   = { blue:'#1295e7', green:'#049645', red:'#ff0002', yellow:'#ffde15' };
const COLOUR_NAME  = { blue:'Azul', green:'Verde', red:'Vermelho', yellow:'Amarelo' };
const COLOUR_GRAD  = {
  blue:   ['#90caf9','#0d47a1'],
  green:  ['#81c784','#1b5e20'],
  red:    ['#ef9a9a','#b71c1c'],
  yellow: ['#fff176','#f57f17'],
};
const COLOUR_TEXT = { blue:'#fff', green:'#fff', red:'#fff', yellow:'#222' };

// ══════════════════════════════════════════════════════════════════
//  CMAP — grelha 15x15 (ID numerico -> [col, row])
// ══════════════════════════════════════════════════════════════════
const CMAP = {
  0:[6,13],1:[6,12],2:[6,11],3:[6,10],4:[6,9],5:[5,8],6:[4,8],7:[3,8],8:[2,8],9:[1,8],10:[0,8],
  11:[0,7],12:[0,6],13:[1,6],14:[2,6],15:[3,6],16:[4,6],17:[5,6],18:[6,5],19:[6,4],20:[6,3],
  21:[6,2],22:[6,1],23:[6,0],24:[7,0],25:[8,0],26:[8,1],27:[8,2],28:[8,3],29:[8,4],30:[8,5],
  31:[9,6],32:[10,6],33:[11,6],34:[12,6],35:[13,6],36:[14,6],37:[14,7],38:[14,8],39:[13,8],
  40:[12,8],41:[11,8],42:[10,8],43:[9,8],44:[8,9],45:[8,10],46:[8,11],47:[8,12],48:[8,13],
  49:[8,14],50:[7,14],51:[6,14],
  100:[7,13],101:[7,12],102:[7,11],103:[7,10],104:[7,9],105:[7,8],
  200:[7,1], 201:[7,2], 202:[7,3], 203:[7,4], 204:[7,5], 205:[7,6],
  300:[13,7],301:[12,7],302:[11,7],303:[10,7],304:[9,7], 305:[8,7],
  400:[1,7], 401:[2,7], 402:[3,7], 403:[4,7], 404:[5,7], 405:[6,7],
  500:[1.5,10.58],501:[3.57,10.58],502:[1.5,12.43], 503:[3.57,12.43],
  600:[10.5,1.58], 601:[12.54,1.58],602:[10.5,3.45], 603:[12.54,3.45],
  700:[10.5,10.58],701:[12.57,10.58],702:[10.5,12.43],703:[12.57,12.43],
  800:[1.5,1.58], 801:[3.57,1.58], 802:[1.5,3.45],  803:[3.55,3.45],
};
const STEP = 6.6667;

const BASE_POS = {
  P1:[500,501,502,503],
  P2:[600,601,602,603],
  P3:[700,701,702,703],
  P4:[800,801,802,803],
};
const START_POS = { P1:0, P2:26, P3:39, P4:13 };
const TURN_PTS  = { P1:50, P2:24, P3:37, P4:11 };
const HOME_LANE = {
  P1:[100,101,102,103,104,105],
  P2:[200,201,202,203,204,205],
  P3:[300,301,302,303,304,305],
  P4:[400,401,402,403,404,405],
};
const HOME_ID = { P1:105, P2:205, P3:305, P4:405 };

// ══════════════════════════════════════════════════════════════════
//  CAMINHO COMPLETO por cor (IDs numericos, casa a casa)
// ══════════════════════════════════════════════════════════════════
function _buildFullPath(pk) {
  const start  = START_POS[pk];
  const turnPt = TURN_PTS[pk];
  const lane   = HOME_LANE[pk];
  const main   = [];
  let pos = start;
  for (let i = 0; i <= 52; i++) {
    main.push(pos);
    if (pos === turnPt) break;
    pos = (pos + 1) % 52;
  }
  return main.concat(lane);
}

const FULL_PATH = {
  P1: _buildFullPath('P1'),
  P2: _buildFullPath('P2'),
  P3: _buildFullPath('P3'),
  P4: _buildFullPath('P4'),
};

function _getNextId(pk, currentId) {
  const path = FULL_PATH[pk];
  const idx  = path.indexOf(currentId);
  if (idx === -1 || idx >= path.length - 1) return currentId;
  return path[idx + 1];
}

const _BASE_ID_SET = new Set([
  500,501,502,503,
  600,601,602,603,
  700,701,702,703,
  800,801,802,803,
]);

// ══════════════════════════════════════════════════════════════════
//  SONS
// ══════════════════════════════════════════════════════════════════
const SFX = (() => {
  let ctx = null;
  function getCtx() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    return ctx;
  }
  function beep(freq, dur, type, vol, delay) {
    try {
      const c = getCtx();
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.connect(gain); gain.connect(c.destination);
      osc.type = type || 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(vol || 0.3, c.currentTime + (delay || 0));
      gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + (delay || 0) + dur);
      osc.start(c.currentTime + (delay || 0));
      osc.stop(c.currentTime + (delay || 0) + dur);
    } catch(e) {}
  }
  return {
    dice:    () => { beep(300,0.08,'square',0.2); beep(450,0.08,'square',0.2,0.09); beep(600,0.12,'square',0.2,0.18); },
    move:    () => { beep(520,0.06,'sine',0.25); beep(660,0.08,'sine',0.25,0.07); },
    capture: () => { beep(200,0.15,'sawtooth',0.3); beep(150,0.2,'sawtooth',0.3,0.1); },
    win:     () => { [523,659,784,1047].forEach((f,i) => beep(f,0.2,'sine',0.3,i*0.15)); },
    myTurn:  () => { beep(880,0.1,'sine',0.2); beep(1100,0.12,'sine',0.2,0.12); },
    home:    () => { beep(784,0.1,'sine',0.3); beep(988,0.1,'sine',0.3,0.12); beep(1175,0.2,'sine',0.3,0.25); },
  };
})();
window.SFX = SFX;
document.addEventListener('click', () => { try { SFX.dice(); } catch(e){} }, { once: true });

// ══════════════════════════════════════════════════════════════════
//  CSS
// ══════════════════════════════════════════════════════════════════
(function injectCSS() {
  if (document.getElementById('ludokz-game-css')) return;
  const s = document.createElement('style');
  s.id = 'ludokz-game-css';
  s.textContent = `
    #ludo-board-wrap {
      position:relative;border-radius:14px;overflow:hidden;flex-shrink:0;
      box-shadow:0 0 0 2px rgba(245,197,24,.4),0 0 50px rgba(0,0,0,.8);
      animation:board-glow 3s ease-in-out infinite;
    }
    @keyframes board-glow {
      0%,100%{box-shadow:0 0 0 2px rgba(245,197,24,.35),0 0 50px rgba(0,0,0,.8);}
      50%{box-shadow:0 0 0 2px rgba(245,197,24,.7),0 0 80px rgba(0,0,0,.8);}
    }
    #ludo-board-wrap img{display:block;width:100%;height:100%;pointer-events:none;user-select:none;}

    .lp {
      position:absolute;width:5%;height:5%;border-radius:50%;
      border:2.5px solid rgba(255,255,255,.95);
      transform:translate(-50%,-50%);
      transition:left .3s cubic-bezier(.34,1.56,.64,1),top .3s cubic-bezier(.34,1.56,.64,1);
      z-index:10;display:flex;align-items:center;justify-content:center;
      font-size:10px;font-weight:800;cursor:default;font-family:'Bebas Neue',monospace;
    }
    .lp.sel{cursor:pointer!important;z-index:20;animation:lp-pulse .5s ease-in-out infinite alternate;}
    @keyframes lp-pulse {
      from{box-shadow:0 0 4px rgba(255,255,255,.4);transform:translate(-50%,-50%) scale(1);}
      to{box-shadow:0 0 18px #fff,0 0 8px gold;transform:translate(-50%,-50%) scale(1.28);}
    }
    .lp.captured{animation:lp-die .4s ease-out forwards;}
    @keyframes lp-die {
      0%{transform:translate(-50%,-50%) scale(1);opacity:1;}
      50%{transform:translate(-50%,-50%) scale(1.6);opacity:.6;}
      100%{transform:translate(-50%,-50%) scale(0);opacity:0;}
    }

    .dice-scene-lk{perspective:500px;width:90px;height:90px;margin:6px auto;cursor:pointer;}
    .dice-3d-lk{
      position:relative;width:90px;height:90px;
      transform-style:preserve-3d;
      transition:transform .65s cubic-bezier(.34,1.2,.64,1);
    }
    @keyframes dice-roll-lk{
      0%{transform:rotateX(0) rotateY(0);}
      25%{transform:rotateX(200deg) rotateY(100deg);}
      50%{transform:rotateX(400deg) rotateY(200deg);}
      75%{transform:rotateX(300deg) rotateY(320deg);}
      100%{transform:rotateX(360deg) rotateY(360deg);}
    }
    .dice-3d-lk.rolling{animation:dice-roll-lk .85s ease-in-out;}

    .df{
      position:absolute;width:84px;height:84px;
      border-radius:12px;border:2px solid #c8c4be;
      background:linear-gradient(145deg,#f0ede9,#ffffff);
      box-sizing:border-box;
    }
    .df.f1{transform:translateZ(43px);}
    .df.f6{transform:rotateX(180deg) translateZ(43px);}
    .df.f2{transform:rotateY(-90deg) translateZ(43px);}
    .df.f5{transform:rotateY(90deg)  translateZ(43px);}
    .df.f3{transform:rotateX(-90deg) translateZ(43px);}
    .df.f4{transform:rotateX(90deg)  translateZ(43px);}

    .dp{
      position:absolute;border-radius:50%;
      background:#111111;
      box-shadow:inset 0 1px 2px rgba(0,0,0,.5);
    }
    .dp.rdot{
      background:radial-gradient(circle at 35% 30%,#ff6b6b,#c41230);
      box-shadow:0 0 6px rgba(196,18,48,.5);
    }

    #rb{
      width:100%;padding:13px;
      background:linear-gradient(135deg,#ffdb4d,#f5c518,#e6a800);
      border:none;border-radius:12px;
      font-family:'Bebas Neue',sans-serif;font-size:18px;letter-spacing:2px;color:#0a0800;
      cursor:pointer;box-shadow:0 6px 20px rgba(245,197,24,.45);
      transition:all .2s cubic-bezier(.34,1.56,.64,1);
      position:relative;overflow:hidden;
    }
    #rb::before{
      content:'';position:absolute;inset:0;
      background:linear-gradient(90deg,transparent,rgba(255,255,255,.3),transparent);
      background-size:200% 100%;animation:rb-shine 2.5s infinite;
    }
    @keyframes rb-shine{0%{background-position:-200% center}100%{background-position:200% center}}
    #rb:hover:not(:disabled){transform:translateY(-3px) scale(1.03);box-shadow:0 12px 32px rgba(245,197,24,.65);}
    #rb:active:not(:disabled){transform:scale(.97);}
    #rb:disabled{opacity:.35;cursor:not-allowed;background:linear-gradient(135deg,#555,#333);box-shadow:none;}
    #rb:disabled::before{display:none;}
    #rb.my-turn-glow{animation:rb-shine 2.5s infinite,turn-pulse 1.2s ease-in-out infinite;}
    @keyframes turn-pulse{
      0%,100%{box-shadow:0 6px 20px rgba(245,197,24,.45);}
      50%{box-shadow:0 6px 20px rgba(245,197,24,.45),0 0 0 8px rgba(245,197,24,0);}
    }

    .pc{
      display:flex;align-items:center;gap:10px;
      background:rgba(15,13,40,.8);border:1.5px solid rgba(255,255,255,.08);
      border-radius:14px;padding:10px 16px;transition:all .3s;flex:1;min-width:140px;
    }
    .pc.mt{border-color:rgba(245,197,24,.6);background:rgba(245,197,24,.06);box-shadow:0 0 24px rgba(245,197,24,.2);}
    .pdot{width:12px;height:12px;border-radius:50%;flex-shrink:0;}
    .pnm2{font-family:'Bebas Neue',sans-serif;font-size:15px;letter-spacing:.5px;}
    .pft{font-size:10px;color:#4a4470;font-weight:700;margin-top:1px;}

    .gli{padding:4px 0;border-bottom:1px solid rgba(255,255,255,.04);color:#9890c0;font-size:12px;font-weight:600;line-height:1.5;}
    .gli:last-child{border:none;}
    .gli.w{color:#00e676;}.gli.k{color:#ff4757;}.gli.r{color:#f5c518;}

    #gm-dice-num{
      font-family:'Bebas Neue',sans-serif;font-size:38px;
      color:#f5c518;letter-spacing:3px;text-align:center;
      text-shadow:0 0 20px rgba(245,197,24,.6);
      margin:2px 0 10px;min-height:46px;
    }
    @keyframes num-pop{
      0%{transform:scale(.5);opacity:0;}
      60%{transform:scale(1.3);opacity:1;}
      100%{transform:scale(1);opacity:1;}
    }
    .num-pop{animation:num-pop .35s cubic-bezier(.34,1.56,.64,1);}
  `;
  document.head.appendChild(s);
})();

// ══════════════════════════════════════════════════════════════════
//  PARTICULAS
// ══════════════════════════════════════════════════════════════════
let _partsActive = false;
let _parts = [];

(function setupParticles() {
  let canvas = document.getElementById('lk-particles');
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.id = 'lk-particles';
    canvas.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:1;';
    document.body.appendChild(canvas);
  }
  const px = canvas.getContext('2d');
  function resize() { canvas.width = innerWidth; canvas.height = innerHeight; }
  resize(); addEventListener('resize', resize);

  function newPart() {
    return {
      x:Math.random()*innerWidth,y:-30,
      vx:(Math.random()-.5)*1.2,vy:.4+Math.random()*1,
      size:10+Math.random()*16,rot:Math.random()*Math.PI*2,
      rotS:(Math.random()-.5)*.05,wb:Math.random()*Math.PI*2,
      wbS:.02+Math.random()*.04,alpha:.6+Math.random()*.4,
      em:['💰','🪙','⭐','💎','🎲'][Math.floor(Math.random()*5)],
      life:0,maxLife:250+Math.random()*200,
    };
  }
  window._initParts = (n) => {
    _parts = Array.from({length:n||18}, () => { const p=newPart(); p.y=Math.random()*innerHeight; return p; });
  };

  (function loop() {
    requestAnimationFrame(loop);
    if (!_partsActive) { px.clearRect(0,0,canvas.width,canvas.height); return; }
    px.clearRect(0,0,canvas.width,canvas.height);
    _parts.forEach(p => {
      p.wb+=p.wbS; p.x+=p.vx+Math.sin(p.wb)*.7;
      p.y+=p.vy; p.rot+=p.rotS; p.life++;
      if (p.y>innerHeight+40||p.life>p.maxLife) Object.assign(p,newPart());
      px.save();
      px.globalAlpha=p.alpha*Math.min(1,(p.maxLife-p.life)/50);
      px.translate(p.x,p.y); px.rotate(p.rot);
      px.font=p.size+'px serif';
      px.textAlign='center'; px.textBaseline='middle';
      px.fillText(p.em,0,0);
      px.restore();
    });
  })();
})();

function _burst(x, y, n) {
  for (let i = 0; i < (n||16); i++) {
    setTimeout(() => {
      const el = document.createElement('div');
      const em = ['💰','🪙','⭐','💎','🎲','✨'][Math.floor(Math.random()*6)];
      const angle = Math.random()*Math.PI*2, dist = 50+Math.random()*120;
      el.textContent = em;
      el.style.cssText = `position:fixed;left:${x}px;top:${y}px;font-size:${16+Math.random()*14}px;
        pointer-events:none;z-index:999;transition:all .85s cubic-bezier(.2,1,.4,1);opacity:1;`;
      document.body.appendChild(el);
      requestAnimationFrame(() => {
        el.style.transform = `translate(${Math.cos(angle)*dist}px,${Math.sin(angle)*dist-80}px) rotate(${Math.random()*720}deg) scale(0)`;
        el.style.opacity = '0';
      });
      setTimeout(() => el.remove(), 900);
    }, i * 30);
  }
}

// ══════════════════════════════════════════════════════════════════
//  DADO 3D — pontos via elementos DOM (nao CSS ::after)
// ══════════════════════════════════════════════════════════════════
const DOT_LAYOUT = {
  1: [[50,50]],
  2: [[28,28],[72,72]],
  3: [[28,28],[50,50],[72,72]],
  4: [[28,28],[72,28],[28,72],[72,72]],
  5: [[28,28],[72,28],[50,50],[28,72],[72,72]],
  6: [[28,22],[72,22],[28,50],[72,50],[28,78],[72,78]],
};
const DOT_SIZE = 13;

function _makeFace(faceNum, value, isF1) {
  const face = document.createElement('div');
  face.className = `df f${faceNum}`;
  (DOT_LAYOUT[value] || []).forEach(([cx, cy], i) => {
    const isRed = isF1 && value === 1 && i === 0;
    const dot = document.createElement('span');
    dot.className = 'dp' + (isRed ? ' rdot' : '');
    const sz = isRed ? 16 : DOT_SIZE;
    dot.style.cssText = `width:${sz}px;height:${sz}px;left:calc(${cx}% - ${sz/2}px);top:calc(${cy}% - ${sz/2}px);`;
    face.appendChild(dot);
  });
  return face;
}

const DICE_TRANSFORMS = {
  1:'rotateX(0deg)   rotateY(0deg)',
  2:'rotateX(90deg)  rotateY(0deg)',
  3:'rotateX(0deg)   rotateY(-90deg)',
  4:'rotateX(0deg)   rotateY(90deg)',
  5:'rotateX(-90deg) rotateY(0deg)',
  6:'rotateX(180deg) rotateY(0deg)',
};

function _buildDiceFaces(value) {
  const inner = document.getElementById('lk-dice-3d');
  if (!inner) return;
  inner.innerHTML = '';
  const opp = {1:6,2:5,3:4,4:3,5:2,6:1};
  const faceVals = { f1:value, f6:opp[value], f2:2, f5:5, f3:3, f4:4 };
  ['f1','f2','f3','f4','f5','f6'].forEach((fn, idx) => {
    const fnum = idx + 1;
    const fval = Math.max(1, Math.min(6, faceVals[fn]));
    inner.appendChild(_makeFace(fnum, fval, fn === 'f1'));
  });
}

function _animDice(value, cb) {
  SFX.dice();
  const inner = document.getElementById('lk-dice-3d');
  const numEl = document.getElementById('gm-dice-num');

  if (inner) {
    _buildDiceFaces(value);
    inner.style.transition = 'none';
    inner.style.transform = 'rotateX(0deg) rotateY(0deg)';
    inner.classList.remove('rolling');
    void inner.offsetWidth;
    inner.classList.add('rolling');
  }

  setTimeout(() => {
    if (inner) {
      inner.classList.remove('rolling');
      inner.style.transition = 'transform .6s cubic-bezier(.34,1.2,.64,1)';
      inner.style.transform = DICE_TRANSFORMS[value] || DICE_TRANSFORMS[1];
    }
    if (numEl) {
      numEl.textContent = value;
      numEl.classList.remove('num-pop');
      void numEl.offsetWidth;
      numEl.classList.add('num-pop');
    }
    // Fallback emoji
    const dfc = document.getElementById('dfc');
    const dnm = document.getElementById('dnm');
    const faces = ['⚀','⚁','⚂','⚃','⚄','⚅'];
    if (dfc) dfc.textContent = faces[value-1];
    if (dnm) dnm.textContent = value;

    if (value === 6) {
      const dw = document.getElementById('lk-dice-wrap');
      if (dw) { const r = dw.getBoundingClientRect(); _burst(r.left+r.width/2, r.top+r.height/2, 18); }
      SFX.myTurn();
    }
    if (cb) setTimeout(cb, 300);
  }, 900);
}

window.BOARD = { animateDice: _animDice };

// ══════════════════════════════════════════════════════════════════
//  TABULEIRO
// ══════════════════════════════════════════════════════════════════
let _pieceEls = {};

function _buildBoard() {
  const sg = document.getElementById('s-game');
  if (!sg) return;

  Object.values(_pieceEls).flat().forEach(el => el && el.remove());
  _pieceEls = {};

  let wrap = document.getElementById('ludo-board-wrap');
  if (!wrap) {
    const canvas = document.getElementById('ludo-canvas');
    wrap = document.createElement('div');
    wrap.id = 'ludo-board-wrap';
    const size = Math.min(460, innerWidth - 28);
    wrap.style.cssText = `width:${size}px;height:${size}px;`;
    if (canvas) {
      canvas.style.display = 'none';
      canvas.parentNode.insertBefore(wrap, canvas);
    }
    const img = document.createElement('img');
    img.src = '/static/ludo_board.png';
    img.alt = 'Tabuleiro';
    img.onerror = () => { wrap.style.background = '#1a3a1a'; img.style.display = 'none'; };
    wrap.appendChild(img);
  }

  ['blue','green','red','yellow'].forEach(colour => {
    _pieceEls[colour] = [];
    for (let i = 0; i < 4; i++) {
      const el = document.createElement('div');
      el.className = 'lp';
      el.dataset.colour = colour;
      el.dataset.piece = i;
      el.textContent = i + 1;
      el.style.background = `radial-gradient(circle at 35% 30%,${COLOUR_GRAD[colour][0]},${COLOUR_GRAD[colour][1]})`;
      el.style.color = COLOUR_TEXT[colour];
      el.style.boxShadow = `0 3px 10px ${COLOUR_GRAD[colour][1]}99`;
      wrap.appendChild(el);
      _pieceEls[colour].push(el);
    }
  });

  ['P1','P2','P3','P4'].forEach(pk => {
    BASE_POS[pk].forEach((posId, i) => _placePiece(PK_COLOUR[pk], i, posId));
  });
}

function _placePiece(colour, pieceIdx, posId) {
  const coord = CMAP[posId];
  if (!coord) return;
  const el = _pieceEls[colour]?.[pieceIdx];
  if (!el) return;
  el.style.left = (coord[0] * STEP + STEP/2) + '%';
  el.style.top  = (coord[1] * STEP + STEP/2) + '%';
}

function _setSelectable(colour, indices) {
  _clearSelectable();
  indices.forEach(i => {
    const el = _pieceEls[colour]?.[i];
    if (!el) return;
    el.classList.add('sel');
    el.onclick = () => { SFX.move(); window.movePc(i); };
  });
}

function _clearSelectable() {
  Object.values(_pieceEls).flat().forEach(el => {
    if (!el) return;
    el.classList.remove('sel');
    el.onclick = null;
  });
}

// ══════════════════════════════════════════════════════════════════
//  BUILD DADO no ecra de jogo
// ══════════════════════════════════════════════════════════════════
function _buildDice() {
  if (document.getElementById('lk-dice-wrap')) return;
  const gcd = document.querySelector('#s-game .gcd');
  if (!gcd) return;

  const wrap = document.createElement('div');
  wrap.id = 'lk-dice-wrap';
  wrap.innerHTML = `
    <div class="dice-scene-lk" title="Clica para lancar" onclick="window.doRoll()">
      <div class="dice-3d-lk" id="lk-dice-3d"></div>
    </div>
    <div id="gm-dice-num">-</div>
  `;

  const dfc = document.getElementById('dfc');
  const dnm = document.getElementById('dnm');
  if (dfc) { dfc.style.display = 'none'; dfc.parentNode.insertBefore(wrap, dfc); }
  else {
    const btd = gcd.querySelector('.btd');
    if (btd) btd.insertAdjacentElement('afterend', wrap);
    else gcd.prepend(wrap);
  }
  if (dnm) dnm.style.display = 'none';

  _buildDiceFaces(1);
}

// ══════════════════════════════════════════════════════════════════
//  ANIMACAO DIFF — movimento suave casa a casa
// ══════════════════════════════════════════════════════════════════
const _animatingPieces = new Set();

function _movePieceSmooth(colour, pieceIdx, fromId, toId, onDone) {
  const pk  = COLOUR_TO_PK[colour];
  const key = colour + '-' + pieceIdx;

  if (_BASE_ID_SET.has(fromId)) {
    _placePiece(colour, pieceIdx, toId);
    if (onDone) onDone();
    return;
  }

  const path = FULL_PATH[pk];
  const fromIdx = path.indexOf(fromId);
  const toIdx   = path.indexOf(toId);

  if (fromIdx === -1 || toIdx === -1 || toIdx <= fromIdx) {
    _placePiece(colour, pieceIdx, toId);
    if (onDone) onDone();
    return;
  }

  _animatingPieces.add(key);
  let currentId = fromId;

  function step() {
    if (currentId === toId) {
      _animatingPieces.delete(key);
      if (onDone) onDone();
      return;
    }
    currentId = _getNextId(pk, currentId);
    _placePiece(colour, pieceIdx, currentId);
    SFX.move();
    setTimeout(step, 150);
  }
  step();
}

function _animateMoveDiff(prev, next) {
  if (!prev?.players || !next?.players) return;
  next.players.forEach((pl, idx) => {
    const colour = pl.color || pl.colour;
    const pk     = COLOUR_TO_PK[colour];
    const prevPl = prev.players[idx];
    if (!prevPl || !pk) return;

    (pl.pos || []).forEach((toId, i) => {
      const fromId = prevPl.pos?.[i];
      if (fromId === toId || fromId == null) return;

      const voltouBase = _BASE_ID_SET.has(toId) && !_BASE_ID_SET.has(fromId);
      if (voltouBase) {
        const el = _pieceEls[colour]?.[i];
        if (!el) return;
        el.classList.add('captured');
        SFX.capture();
        setTimeout(() => {
          el.classList.remove('captured');
          _placePiece(colour, i, toId);
        }, 420);
      } else {
        _movePieceSmooth(colour, i, fromId, toId, () => {
          if (toId === HOME_ID[pk]) SFX.home();
        });
      }
    });
  });
}

// ══════════════════════════════════════════════════════════════════
//  RENDER STATE
// ══════════════════════════════════════════════════════════════════
window.CUR_STATE  = null;
window.PREV_STATE = null;

window.renderState = function(state) {
  if (!state || !state.players) return;
  window.CUR_STATE = state;

  state.players.forEach(pl => {
    const colour = pl.color || pl.colour;
    if (!colour || !_pieceEls[colour]) return;
    (pl.pos || []).forEach((posId, i) => {
      if (!_animatingPieces.has(colour + '-' + i)) {
        _placePiece(colour, i, posId);
      }
    });
  });

  _clearSelectable();

  const pcardsEl = document.getElementById('player-cards');
  if (pcardsEl && state.players) {
    pcardsEl.innerHTML = state.players.map((pl, idx) => {
      const colour   = pl.color || pl.colour || 'blue';
      const isActive = idx === state.turn;
      const hex      = COLOUR_HEX[colour] || '#888';
      return `<div class="pc ${isActive ? 'mt' : ''}">
        <div class="pdot" style="background:${hex};box-shadow:0 0 6px ${hex}"></div>
        <div>
          <div class="pnm2" style="color:${isActive ? '#f5c518' : '#9890c0'}">${pl.name || COLOUR_NAME[colour]}</div>
          <div class="pft">${COLOUR_NAME[colour]} · ${pl.fin ?? 0}/4</div>
        </div>
        ${isActive ? '<div style="font-size:16px;margin-left:auto">🎲</div>' : ''}
      </div>`;
    }).join('');
  }

  const rb = document.getElementById('rb');
  if (rb) {
    const myT = _isMyTurn(state);
    rb.disabled = !myT || state.phase !== 0 || !!state.over;
    rb.classList.toggle('my-turn-glow', myT && !state.over && state.phase === 0);
  }

  const gbv = document.getElementById('gbv');
  if (gbv && state.bet != null) {
    try { gbv.textContent = Number(state.bet).toLocaleString('pt-AO') + ' KZ'; } catch(e) {}
  }

  if (state.log?.length) {
    const le = document.getElementById('glog');
    if (le) {
      le.innerHTML = state.log.slice(-20).reverse().map(l => {
        const cls = /venceu|🏆|casa/i.test(l) ? 'w' : /captur|💀/i.test(l) ? 'k' : /tirou/i.test(l) ? 'r' : '';
        return `<div class="gli ${cls}">${l}</div>`;
      }).join('');
    }
  }

  const co = document.getElementById('chat-online');
  if (co && state.players) co.textContent = state.players.length + ' online';
};

function _isMyTurn(state) {
  if (!state?.players || !window.U) return false;
  const p = state.players[state.turn];
  return p && (p.user_id === window.U.id || p.name === window.U.name) && state.phase === 0;
}

// ══════════════════════════════════════════════════════════════════
//  HIGHLIGHT
// ══════════════════════════════════════════════════════════════════
window.highlightPcs = function(mv) {
  if (!window.CUR_STATE) return;
  const curP = window.CUR_STATE.players?.[window.CUR_STATE.turn];
  if (!curP) return;
  const colour = curP.color || curP.colour;
  if (colour) _setSelectable(colour, mv || []);
};

// ══════════════════════════════════════════════════════════════════
//  EVENTOS SSE
// ══════════════════════════════════════════════════════════════════
window.onGameStarted = function(state) {
  window.RID        = state.room_id || window.RID;
  window.CUR_STATE  = state;
  window.PREV_STATE = null;

  if (typeof pg === 'function') pg('game');

  setTimeout(() => {
    _buildBoard();
    _buildDice();
    window.renderState(state);

    const chatEl = document.getElementById('chat-msgs');
    if (chatEl) chatEl.innerHTML = '';
    if (typeof addChat === 'function') {
      addChat('Sistema', `Jogo iniciado com ${state.players.length} jogadores!`, true);
      state.players.forEach(pl => {
        const c = pl.color || pl.colour || 'blue';
        addChat('Sistema', `${COLOUR_NAME[c]}: ${pl.name}`, true);
      });
    }
    _partsActive = true;
    if (window._initParts) window._initParts(20);
  }, 80);
};

window.onGameUpdate = function(state) {
  if (window.CUR_STATE) window.PREV_STATE = JSON.parse(JSON.stringify(window.CUR_STATE));
  window.CUR_STATE = state;
  _animateMoveDiff(window.PREV_STATE, state);
  window.renderState(state);
};

// ══════════════════════════════════════════════════════════════════
//  GAME OVER
// ══════════════════════════════════════════════════════════════════
window.onGameOver = function(d) {
  _partsActive = false;
  const goo  = document.getElementById('goo');
  const goic = document.getElementById('goic');
  const gott = document.getElementById('gott');
  const gosb = document.getElementById('gosb');
  const gopr = document.getElementById('gopr');
  const gocd = document.getElementById('gocd');
  if (!goo) return;

  if (d.won) {
    SFX.win();
    if (typeof coinRain  === 'function') coinRain();
    if (typeof showFlash === 'function') showFlash('🏆');
    for (let i = 0; i < 6; i++) {
      setTimeout(() => _burst(innerWidth*(.2+Math.random()*.6), innerHeight*.3, 28), i*250);
    }
    if (goic) goic.textContent = '🏆';
    if (gott) { gott.textContent = 'VITÓRIA!'; gott.style.color = '#f5c518'; }
    if (gosb) gosb.textContent = 'Parabéns, venceste!';
    if (gopr) { gopr.textContent = '+' + Number(d.prize||0).toLocaleString('pt-AO') + ' KZ'; gopr.style.color = '#00e676'; }
    gocd?.classList.remove('lose');
  } else {
    if (goic) goic.textContent = '💀';
    if (gott) { gott.textContent = 'DERROTA'; gott.style.color = '#ff4757'; }
    if (gosb) gosb.textContent = 'Boa sorte da próxima!';
    if (gopr) { gopr.textContent = '—'; gopr.style.color = '#ff4757'; }
    gocd?.classList.add('lose');
  }
  goo.classList.remove('hidden');

  if (d.balance != null && window.U) {
    window.U.balance = d.balance;
    if (typeof updN === 'function') updN();
  }
};

// ══════════════════════════════════════════════════════════════════
//  doRoll — SOBRESCREVE DEFINITIVAMENTE o do index.html
//  (este ficheiro carrega depois, portanto ganha sempre)
// ══════════════════════════════════════════════════════════════════
window.doRoll = async function() {
  if (!window.RID) return;
  const rb = document.getElementById('rb');
  if (rb) { rb.disabled = true; rb.classList.remove('my-turn-glow'); }

  const faceEl = document.getElementById('dfc');
  if (faceEl) faceEl.classList.add('rolling');

  let d;
  try {
    const r = await fetch('/api/game/roll', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({room_id: window.RID}),
      credentials:'same-origin',
    });
    d = await r.json();
  } catch(e) {
    if (rb) rb.disabled = false;
    if (faceEl) faceEl.classList.remove('rolling');
    return;
  }

  if (faceEl) faceEl.classList.remove('rolling');

  if (d.error) {
    if (typeof toast === 'function') toast('❌ ' + d.error, 'ter');
    if (rb) rb.disabled = false;
    return;
  }

  _animDice(d.dice, async () => {
    window.renderState(d);
    try {
      const mv = await fetch('/api/game/movable', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({room_id: window.RID}),
        credentials:'same-origin',
      }).then(r => r.json());
      if (mv.movable?.length) window.highlightPcs(mv.movable);
    } catch(e) {}
  });
};

// ══════════════════════════════════════════════════════════════════
//  movePc — SOBRESCREVE o do index.html
// ══════════════════════════════════════════════════════════════════
window.movePc = async function(idx) {
  if (!window.RID) return;
  _clearSelectable();
  window.PREV_STATE = window.CUR_STATE ? JSON.parse(JSON.stringify(window.CUR_STATE)) : null;

  let d;
  try {
    const r = await fetch('/api/game/move', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({room_id: window.RID, piece: idx}),
      credentials:'same-origin',
    });
    d = await r.json();
  } catch(e) { return; }

  if (d.error) {
    if (typeof toast === 'function') toast('❌ ' + d.error, 'ter');
    return;
  }

  if (window.PREV_STATE) _animateMoveDiff(window.PREV_STATE, d);
  window.CUR_STATE = d;
  window.renderState(d);
};

// ══════════════════════════════════════════════════════════════════
//  leaveGame
// ══════════════════════════════════════════════════════════════════
window.leaveGame = async function() {
  if (!confirm('Abandonar? Perdes a aposta.')) return;
  _partsActive = false;
  if (window.RID) {
    await fetch('/api/game/leave', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({room_id: window.RID}), credentials:'same-origin',
    }).catch(() => {});
  }
  window.RID = null;
  if (typeof pg === 'function') pg('home');
};

// ══════════════════════════════════════════════════════════════════
//  COMPATIBILIDADE
// ══════════════════════════════════════════════════════════════════
window.buildBoard = _buildBoard;
window.initCanvas = _buildBoard;
window.startRenderLoop = function() {};

setInterval(() => {
  const rb = document.getElementById('rb');
  if (!rb || !window.CUR_STATE) return;
  const myT = _isMyTurn(window.CUR_STATE);
  rb.classList.toggle('my-turn-glow', myT && !window.CUR_STATE.over && window.CUR_STATE.phase === 0);
}, 600);

console.log('[LudoKz] ludo_board_v2.js FINAL carregado OK');
