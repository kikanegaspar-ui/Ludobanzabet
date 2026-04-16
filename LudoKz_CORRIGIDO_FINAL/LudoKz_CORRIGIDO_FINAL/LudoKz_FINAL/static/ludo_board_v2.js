/**
 * ludo_board_v2.js — LudoKz FINAL
 * Tabuleiro completo: imagem PNG + peças HTML + dado 3D + sons + animações
 * Funciona com o servidor (SSE + API) para jogos online reais
 */

// ══════════════════════════════════════════════════════════════════
//  MAPA DE CORES  backend → UI
//  Backend envia: players[i].color = "blue"|"green"|"red"|"yellow"
//  P1=Azul(inf-esq) P2=Verde(sup-dir) P3=Verm(inf-dir) P4=Amar(sup-esq)
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
const COLOUR_TEXT  = { blue:'#fff', green:'#fff', red:'#fff', yellow:'#222' };

// ══════════════════════════════════════════════════════════════════
//  COORDENADAS  (grelha 15×15, passo = 100/15 ≈ 6.667%)
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
  500:[1.5,10.58],501:[3.57,10.58],502:[1.5,12.43],503:[3.57,12.43],
  600:[10.5,1.58], 601:[12.54,1.58],602:[10.5,3.45], 603:[12.54,3.45],
  700:[10.5,10.58],701:[12.57,10.58],702:[10.5,12.43],703:[12.57,12.43],
  800:[1.5,1.58], 801:[3.57,1.58], 802:[1.5,3.45],  803:[3.55,3.45]
};
const STEP = 6.6667; // 100/15

const BASE_POS  = { P1:[500,501,502,503], P2:[600,601,602,603], P3:[700,701,702,703], P4:[800,801,802,803] };
const START_POS = { P1:0, P2:26, P3:39, P4:13 };
const HOME_ENT  = {
  P1:[100,101,102,103,104], P2:[200,201,202,203,204],
  P3:[300,301,302,303,304], P4:[400,401,402,403,404]
};
const HOME_POS   = { P1:105, P2:205, P3:305, P4:405 };
const TURN_PTS   = { P1:50,  P2:24,  P3:37,  P4:11  };
const SAFE_SET   = new Set([0,8,13,21,26,34,39,47]);

// ══════════════════════════════════════════════════════════════════
//  SONS  (Web Audio API — sem ficheiros externos)
// ══════════════════════════════════════════════════════════════════
const SFX = (() => {
  let ctx = null;
  function getCtx() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    return ctx;
  }
  function beep(freq, dur, type, vol, delay) {
    try {
      const c   = getCtx();
      const osc = c.createOscillator();
      const gain= c.createGain();
      osc.connect(gain); gain.connect(c.destination);
      osc.type      = type || 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(vol || 0.3, c.currentTime + (delay||0));
      gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + (delay||0) + dur);
      osc.start(c.currentTime + (delay||0));
      osc.stop (c.currentTime + (delay||0) + dur);
    } catch(e) {}
  }
  return {
    dice:    () => { beep(300,0.08,'square',0.2); beep(450,0.08,'square',0.2,0.09); beep(600,0.12,'square',0.2,0.18); },
    move:    () => { beep(520,0.06,'sine',0.25); beep(660,0.08,'sine',0.25,0.07); },
    capture: () => { beep(200,0.15,'sawtooth',0.3); beep(150,0.2,'sawtooth',0.3,0.1); },
    win:     () => { [523,659,784,1047].forEach((f,i)=>beep(f,0.2,'sine',0.3,i*0.15)); },
    myTurn:  () => { beep(880,0.1,'sine',0.2); beep(1100,0.12,'sine',0.2,0.12); },
    home:    () => { beep(784,0.1,'sine',0.3); beep(988,0.1,'sine',0.3,0.12); beep(1175,0.2,'sine',0.3,0.25); },
  };
})();
window.SFX = SFX;

// Desbloqueia audio no primeiro toque
document.addEventListener('click', () => { try { SFX.dice(); } catch(e){} }, { once: true });

// ══════════════════════════════════════════════════════════════════
//  CSS DO JOGO  (injectado uma vez)
// ══════════════════════════════════════════════════════════════════
(function injectCSS() {
  if (document.getElementById('ludokz-game-css')) return;
  const s = document.createElement('style');
  s.id = 'ludokz-game-css';
  s.textContent = `
    /* ── Tabuleiro ── */
    #ludo-board-wrap {
      position:relative;
      border-radius:14px;
      overflow:hidden;
      box-shadow:0 0 0 2px rgba(245,197,24,.4),
                 0 0 50px rgba(0,0,0,.8),
                 0 0 100px rgba(245,197,24,.08);
      flex-shrink:0;
      animation:board-glow 3s ease-in-out infinite;
    }
    @keyframes board-glow {
      0%,100% { box-shadow:0 0 0 2px rgba(245,197,24,.35),0 0 50px rgba(0,0,0,.8); }
      50%      { box-shadow:0 0 0 2px rgba(245,197,24,.7), 0 0 80px rgba(0,0,0,.8),0 0 40px rgba(245,197,24,.15); }
    }
    #ludo-board-wrap img {
      display:block;width:100%;height:100%;
      pointer-events:none;user-select:none;
    }

    /* ── Peças ── */
    .lp {
      position:absolute;
      width:5%;height:5%;
      border-radius:50%;
      border:2.5px solid rgba(255,255,255,.95);
      transform:translate(-50%,-50%);
      transition:left .32s cubic-bezier(.34,1.56,.64,1),
                 top  .32s cubic-bezier(.34,1.56,.64,1),
                 box-shadow .2s;
      z-index:10;
      display:flex;align-items:center;justify-content:center;
      font-size:10px;font-weight:800;
      cursor:default;
      font-family:'Bebas Neue',monospace;
    }
    .lp.sel {
      cursor:pointer!important;
      z-index:20;
      animation:lp-pulse .5s ease-in-out infinite alternate;
    }
    @keyframes lp-pulse {
      from { box-shadow:0 0 4px rgba(255,255,255,.4); transform:translate(-50%,-50%) scale(1); }
      to   { box-shadow:0 0 18px #fff,0 0 8px gold;  transform:translate(-50%,-50%) scale(1.28); }
    }
    .lp.captured {
      animation:lp-die .4s ease-out forwards;
    }
    @keyframes lp-die {
      0%   { transform:translate(-50%,-50%) scale(1); opacity:1; }
      50%  { transform:translate(-50%,-50%) scale(1.6); opacity:.6; }
      100% { transform:translate(-50%,-50%) scale(0); opacity:0; }
    }

    /* ── Dado 3D ── */
    .dice-scene-lk { perspective:500px; width:90px;height:90px; margin:6px auto; cursor:pointer; }
    .dice-3d-lk {
      position:relative;width:90px;height:90px;
      transform-style:preserve-3d;
      transition:transform .7s cubic-bezier(.34,1.2,.64,1);
    }
    @keyframes dice-roll-lk { 50%{ transform:rotateX(455deg) rotateY(455deg); } }
    .dice-3d-lk.rolling { animation:dice-roll-lk 1s ease-in-out; }
    .df {
      position:absolute;width:86px;height:86px;
      border-radius:14px;
      border:3px solid #e8e4de;
      background:linear-gradient(145deg,#dddbd8,#fff);
    }
    .df::before {
      content:'';position:absolute;inset:0;border-radius:12px;
      background:#f6f3f0;transform:translateZ(-1px);
    }
    .df::after {
      content:'';position:absolute;
      top:50%;left:50%;
      width:16px;height:16px;margin:-8px 0 0 -8px;
      border-radius:50%;background:#131210;
    }
    .df.f1  { transform:translateZ(45px); }
    .df.f6  { transform:rotateX(180deg) translateZ(45px); }
    .df.f2  { transform:rotateY(90deg)  translateZ(45px); }
    .df.f5  { transform:rotateY(-90deg) translateZ(45px); }
    .df.f3  { transform:rotateX(90deg)  translateZ(45px); }
    .df.f4  { transform:rotateX(-90deg) translateZ(45px); }
    /* face 1 — ponto vermelho central */
    .df.f1::after  { width:22px;height:22px;margin:-11px 0 0 -11px;background:radial-gradient(circle at 35% 30%,#ff6b6b,#c41230);box-shadow:0 0 8px rgba(196,18,48,.5); }
    /* face 2 */
    .df.f2::after  { margin:-32px 0 0 -32px;box-shadow:48px 48px; }
    /* face 3 */
    .df.f3::after  { margin:-30px 0 0 -30px;box-shadow:28px 28px; }
    /* face 4 */
    .df.f4::after  { margin:-32px 0 0 -32px;box-shadow:0 48px,48px 0,48px 48px; }
    /* face 5 */
    .df.f5::after  { margin:-32px 0 0 -32px;box-shadow:48px 0,0 48px,48px 48px,0 0,24px 24px; }
    /* face 6 */
    .df.f6::after  { margin:-36px 0 0 -36px;box-shadow:32px 0,64px 0,0 32px,32px 32px,64px 32px,0 64px; }

    /* ── Botão Lançar ── */
    #rb {
      width:100%;padding:13px;
      background:linear-gradient(135deg,#ffdb4d,#f5c518,#e6a800);
      border:none;border-radius:12px;
      font-family:'Bebas Neue',sans-serif;
      font-size:18px;letter-spacing:2px;color:#0a0800;
      cursor:pointer;
      box-shadow:0 6px 20px rgba(245,197,24,.45);
      transition:all .2s cubic-bezier(.34,1.56,.64,1);
      position:relative;overflow:hidden;
    }
    #rb::before {
      content:'';position:absolute;inset:0;
      background:linear-gradient(90deg,transparent,rgba(255,255,255,.3),transparent);
      background-size:200% 100%;
      animation:rb-shine 2.5s infinite;
    }
    @keyframes rb-shine { 0%{background-position:-200% center} 100%{background-position:200% center} }
    #rb:hover:not(:disabled) { transform:translateY(-3px) scale(1.03);box-shadow:0 12px 32px rgba(245,197,24,.65); }
    #rb:active:not(:disabled){ transform:scale(.97); }
    #rb:disabled { opacity:.35;cursor:not-allowed;background:linear-gradient(135deg,#555,#333);box-shadow:none; }
    #rb:disabled::before { display:none; }
    #rb.my-turn-glow { animation:rb-shine 2.5s infinite,turn-pulse 1.2s ease-in-out infinite; }
    @keyframes turn-pulse {
      0%,100%{box-shadow:0 6px 20px rgba(245,197,24,.45);}
      50%    {box-shadow:0 6px 20px rgba(245,197,24,.45),0 0 0 8px rgba(245,197,24,0);}
    }

    /* ── Player cards ── */
    .pc {
      display:flex;align-items:center;gap:10px;
      background:rgba(15,13,40,.8);
      border:1.5px solid rgba(255,255,255,.08);
      border-radius:14px;padding:10px 16px;
      transition:all .3s;flex:1;min-width:140px;
    }
    .pc.mt {
      border-color:rgba(245,197,24,.6);
      background:rgba(245,197,24,.06);
      box-shadow:0 0 24px rgba(245,197,24,.2);
    }
    .pdot { width:12px;height:12px;border-radius:50%;flex-shrink:0; }
    .pnm2 { font-family:'Bebas Neue',sans-serif;font-size:15px;letter-spacing:.5px; }
    .pft  { font-size:10px;color:#4a4470;font-weight:700;margin-top:1px; }

    /* ── Chat ── */
    .chat-msgs::-webkit-scrollbar { width:3px; }
    .chat-msgs::-webkit-scrollbar-thumb { background:#2d285a;border-radius:3px; }

    /* ── Log ── */
    .gli { padding:4px 0;border-bottom:1px solid rgba(255,255,255,.04);color:#9890c0;font-size:12px;font-weight:600;line-height:1.5; }
    .gli:last-child { border:none; }
    .gli.w  { color:#00e676; }
    .gli.k  { color:#ff4757; }
    .gli.r  { color:#f5c518; }

    /* ── Partículas de fundo ── */
    #lk-particles {
      position:fixed;inset:0;pointer-events:none;z-index:1;
      display:none;
    }
    #s-game:not([style*="display: none"]) ~ #lk-particles,
    body.in-game #lk-particles { display:block; }

    /* ── Dado resultado ── */
    #gm-dice-num {
      font-family:'Bebas Neue',sans-serif;font-size:38px;
      color:#f5c518;letter-spacing:3px;text-align:center;
      text-shadow:0 0 20px rgba(245,197,24,.6);
      margin:2px 0 10px;
      min-height:46px;
    }

    @keyframes num-pop {
      0%   { transform:scale(.5); opacity:0; }
      60%  { transform:scale(1.3); opacity:1; }
      100% { transform:scale(1); opacity:1; }
    }
    .num-pop { animation:num-pop .35s cubic-bezier(.34,1.56,.64,1); }
  `;
  document.head.appendChild(s);
})();

// ══════════════════════════════════════════════════════════════════
//  CANVAS DE PARTÍCULAS
// ══════════════════════════════════════════════════════════════════
const _pc = document.createElement('canvas');
_pc.id = 'lk-particles';
_pc.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:1;';
document.body.appendChild(_pc);
const _px = _pc.getContext('2d');
let _parts = [];

function _resizePC() { _pc.width = innerWidth; _pc.height = innerHeight; }
_resizePC();
addEventListener('resize', _resizePC);

function _initParts(n) {
  _parts = Array.from({length: n || 18}, () => {
    const p = _newPart();
    p.y = Math.random() * innerHeight;
    return p;
  });
}

function _newPart() {
  return {
    x: Math.random() * innerWidth,
    y: -30,
    vx: (Math.random()-.5)*1.2,
    vy: .4 + Math.random()*1,
    size: 10 + Math.random()*16,
    rot: Math.random()*Math.PI*2,
    rotS: (Math.random()-.5)*.05,
    wb: Math.random()*Math.PI*2,
    wbS: .02 + Math.random()*.04,
    alpha: .6 + Math.random()*.4,
    em: ['💰','🪙','⭐','💎','🎲'][Math.floor(Math.random()*5)],
    life: 0,
    maxLife: 250 + Math.random()*200,
  };
}

let _partsActive = false;
(function _loopParts() {
  requestAnimationFrame(_loopParts);
  if (!_partsActive) { _px.clearRect(0,0,_pc.width,_pc.height); return; }
  _px.clearRect(0,0,_pc.width,_pc.height);
  _parts.forEach(p => {
    p.wb += p.wbS; p.x += p.vx + Math.sin(p.wb)*.7;
    p.y += p.vy; p.rot += p.rotS; p.life++;
    if (p.y > innerHeight+40 || p.life > p.maxLife) Object.assign(p, _newPart());
    _px.save();
    _px.globalAlpha = p.alpha * Math.min(1,(p.maxLife-p.life)/50);
    _px.translate(p.x, p.y); _px.rotate(p.rot);
    _px.font = p.size+'px serif';
    _px.textAlign = 'center'; _px.textBaseline = 'middle';
    _px.fillText(p.em, 0, 0);
    _px.restore();
  });
})();

// Burst de moedas num ponto
function _burst(x, y, n) {
  for (let i = 0; i < (n||16); i++) {
    setTimeout(() => {
      const el = document.createElement('div');
      const em = ['💰','🪙','⭐','💎','🎲','✨'][Math.floor(Math.random()*6)];
      const angle = Math.random()*Math.PI*2;
      const dist  = 50 + Math.random()*120;
      el.textContent = em;
      el.style.cssText = `position:fixed;left:${x}px;top:${y}px;font-size:${16+Math.random()*14}px;
        pointer-events:none;z-index:999;transition:all .85s cubic-bezier(.2,1,.4,1);opacity:1;`;
      document.body.appendChild(el);
      requestAnimationFrame(() => {
        el.style.transform = `translate(${Math.cos(angle)*dist}px,${Math.sin(angle)*dist-80}px) rotate(${Math.random()*720}deg) scale(0)`;
        el.style.opacity='0';
      });
      setTimeout(() => el.remove(), 900);
    }, i * 30);
  }
}

// ══════════════════════════════════════════════════════════════════
//  TABULEIRO  — div + img + peças HTML
// ══════════════════════════════════════════════════════════════════
let _pieceEls = {}; // colour -> [el×4]

function _buildBoard() {
  const sg = document.getElementById('s-game');
  if (!sg) return;

  // Limpar peças antigas
  Object.values(_pieceEls).flat().forEach(el => el?.remove());
  _pieceEls = {};

  // Encontrar ou criar wrapper do tabuleiro
  let wrap = document.getElementById('ludo-board-wrap');
  if (!wrap) {
    // Substituir canvas por div
    const canvas = document.getElementById('ludo-canvas');
    wrap = document.createElement('div');
    wrap.id = 'ludo-board-wrap';
    const size = Math.min(460, innerWidth - 28);
    wrap.style.cssText = `width:${size}px;height:${size}px;`;
    if (canvas) {
      canvas.style.display = 'none';
      canvas.parentNode.insertBefore(wrap, canvas);
    } else {
      sg.querySelector('[style*="position:relative"]')?.appendChild(wrap);
    }
    const img = document.createElement('img');
    img.src = '/static/ludo_board.png';
    img.alt = 'Tabuleiro Ludo';
    img.onerror = () => { wrap.style.background = '#1a3a1a'; img.style.display='none'; };
    wrap.appendChild(img);
  }

  // Criar peças para cada cor
  ['blue','green','red','yellow'].forEach(colour => {
    _pieceEls[colour] = [];
    for (let i = 0; i < 4; i++) {
      const el = document.createElement('div');
      el.className = 'lp';
      el.dataset.colour = colour;
      el.dataset.piece  = i;
      el.textContent    = i + 1;
      el.style.background = `radial-gradient(circle at 35% 30%,${COLOUR_GRAD[colour][0]},${COLOUR_GRAD[colour][1]})`;
      el.style.color      = COLOUR_TEXT[colour];
      el.style.boxShadow  = `0 3px 10px ${COLOUR_GRAD[colour][1]}99`;
      wrap.appendChild(el);
      _pieceEls[colour].push(el);
    }
  });

  // Posições iniciais (bases)
  const PK_TO_COLOUR = { P1:'blue', P2:'green', P3:'red', P4:'yellow' };
  ['P1','P2','P3','P4'].forEach(pk => {
    BASE_POS[pk].forEach((pos,i) => _placePiece(PK_TO_COLOUR[pk], i, pos));
  });
}

function _placePiece(colour, pieceIdx, boardPos) {
  const coord = CMAP[boardPos];
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
//  DADO 3D  (CSS preserve-3d)
// ══════════════════════════════════════════════════════════════════
function _buildDice() {
  // Encontrar container do dado
  let diceWrap = document.getElementById('lk-dice-wrap');
  if (diceWrap) return; // já existe

  // Onde inserir (depois do elemento .btd ou no .gcd)
  const gcd = document.querySelector('#s-game .gcd');
  if (!gcd) return;

  diceWrap = document.createElement('div');
  diceWrap.id = 'lk-dice-wrap';
  diceWrap.innerHTML = `
    <div class="dice-scene-lk" onclick="window.doRoll && window.doRoll()" title="Clica para lançar">
      <div class="dice-3d-lk" id="lk-dice-3d">
        <div class="df f1"></div>
        <div class="df f6"></div>
        <div class="df f2"></div>
        <div class="df f5"></div>
        <div class="df f3"></div>
        <div class="df f4"></div>
      </div>
    </div>
    <div id="gm-dice-num">—</div>
  `;

  // Substituir emoji dado existente
  const dfc = document.getElementById('dfc');
  const dnm = document.getElementById('dnm');
  if (dfc) {
    dfc.style.display = 'none';
    dfc.parentNode.insertBefore(diceWrap, dfc);
  } else {
    const btd = gcd.querySelector('.btd');
    if (btd) btd.insertAdjacentElement('afterend', diceWrap);
    else gcd.prepend(diceWrap);
  }
  if (dnm) dnm.style.display = 'none';
}

const DICE_TRANSFORMS = {
  1:'rotateX(0deg) rotateY(0deg)',
  2:'rotateX(-90deg) rotateY(0deg)',
  3:'rotateX(0deg) rotateY(90deg)',
  4:'rotateX(0deg) rotateY(-90deg)',
  5:'rotateX(90deg) rotateY(0deg)',
  6:'rotateX(180deg) rotateY(0deg)',
};

function _animDice(value, cb) {
  SFX.dice();
  const inner = document.getElementById('lk-dice-3d');
  const numEl = document.getElementById('gm-dice-num');
  if (inner) {
    inner.classList.add('rolling');
    inner.style.transition = 'none';
  }
  setTimeout(() => {
    if (inner) {
      inner.classList.remove('rolling');
      inner.style.transition = 'transform .65s cubic-bezier(.34,1.2,.64,1)';
      inner.style.transform  = DICE_TRANSFORMS[value] || DICE_TRANSFORMS[1];
    }
    if (numEl) {
      numEl.textContent = value;
      numEl.classList.remove('num-pop');
      void numEl.offsetWidth;
      numEl.classList.add('num-pop');
    }
    // Emoji fallback
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
    cb && setTimeout(cb, 350);
  }, 1000);
}

// Expõe como window.BOARD para compatibilidade
window.BOARD = { animateDice: _animDice };

// ══════════════════════════════════════════════════════════════════
//  RENDER STATE  — actualiza toda a UI
// ══════════════════════════════════════════════════════════════════
window.CUR_STATE  = null;
window.PREV_STATE = null;
window.SELECTABLE_PIECES = [];

window.renderState = function(state) {
  if (!state || !state.players) return;
  window.CUR_STATE = state;

  // ── Posicionar peças ──
  state.players.forEach(pl => {
    const colour = pl.color || pl.colour;
    if (!colour || !_pieceEls[colour]) return;
    (pl.pos || []).forEach((pos, i) => _placePiece(colour, i, pos));
  });

  _clearSelectable();

  // ── Player cards ──
  const pcardsEl = document.getElementById('player-cards');
  if (pcardsEl && state.players) {
    let html = '';
    state.players.forEach((pl, idx) => {
      const colour  = pl.color || pl.colour || 'blue';
      const isActive = idx === state.turn;
      const hex     = COLOUR_HEX[colour] || '#888';
      const fin     = pl.fin ?? 0;
      html += `<div class="pc ${isActive ? 'mt' : ''}">
        <div class="pdot" style="background:${hex};box-shadow:0 0 6px ${hex}"></div>
        <div>
          <div class="pnm2" style="color:${isActive?'#f5c518':'#9890c0'}">${pl.name || COLOUR_NAME[colour]}</div>
          <div class="pft">${COLOUR_NAME[colour]} · ${fin}/4</div>
        </div>
        ${isActive ? '<div style="font-size:16px;margin-left:auto">🎲</div>' : ''}
      </div>`;
    });
    // Bloco central com turno
    const curP  = state.players[state.turn];
    const mid = `<div class="gmid" style="text-align:center;padding:0 6px">
      <div class="ttx" style="font-size:11px;font-weight:800;color:#9890c0;text-transform:uppercase;letter-spacing:.5px">
        ${_isMyTurn(state) ? 'Teu turno 🟢' : 'Aguarda 🔵'}
      </div>
      <div style="font-size:10px;color:#4a4470;font-family:'Bebas Neue',sans-serif;letter-spacing:1px">
        RND ${state.round || 0}
      </div>
    </div>`;
    // Inserir bloco central a meio
    const half = Math.floor(state.players.length / 2);
    const parts = html.match(/<div class="pc[^"]*"[\s\S]*?<\/div>/g) || [html];
    pcardsEl.innerHTML = parts.slice(0,half).join('') + mid + parts.slice(half).join('');
    pcardsEl.innerHTML = html; // simpler: just all cards
  }

  // ── Botão dado ──
  const rb = document.getElementById('rb');
  if (rb) {
    const myT = _isMyTurn(state);
    rb.disabled = !myT || state.phase !== 0 || !!state.over;
    rb.classList.toggle('my-turn-glow', myT && !state.over && state.phase === 0);
    if (myT && state.phase === 0 && !state.over) SFX.myTurn();
  }

  // ── Aposta ──
  const gbv = document.getElementById('gbv');
  if (gbv && state.bet != null) {
    try { gbv.textContent = Number(state.bet).toLocaleString('pt-AO') + ' KZ'; } catch(e) {}
  }

  // ── Log ──
  if (state.log?.length) {
    const le = document.getElementById('glog');
    if (le) {
      le.innerHTML = state.log.slice(-20).reverse().map(l => {
        const cls = /venceu|🏆|casa/i.test(l) ? 'w' : /captur|comeu|💀/i.test(l) ? 'k' : /tirou/i.test(l) ? 'r' : '';
        return `<div class="gli ${cls}">${l}</div>`;
      }).join('');
    }
  }

  // ── Chat online ──
  const co = document.getElementById('chat-online');
  if (co && state.players) co.textContent = state.players.length + ' online';
};

function _isMyTurn(state) {
  if (!state?.players || !window.U) return false;
  const p = state.players[state.turn];
  return p && (p.user_id === window.U.id || p.name === window.U.name) && state.phase === 0;
}

// ══════════════════════════════════════════════════════════════════
//  HIGHLIGHT DE PEÇAS MOVÍVEIS
// ══════════════════════════════════════════════════════════════════
window.highlightPcs = function(mv) {
  window.SELECTABLE_PIECES = mv || [];
  if (!window.CUR_STATE) return;
  const curP = window.CUR_STATE.players?.[window.CUR_STATE.turn];
  if (!curP) return;
  const colour = curP.color || curP.colour;
  if (colour) _setSelectable(colour, mv);
};

// ══════════════════════════════════════════════════════════════════
//  EVENTOS SSE
// ══════════════════════════════════════════════════════════════════
window.onGameStarted = function(state) {
  window.RID        = state.room_id || window.RID;
  window.CUR_STATE  = state;
  window.PREV_STATE = null;

  // Navegar para ecrã de jogo
  if (typeof pg === 'function') pg('game');

  // Construir tabuleiro e dado
  setTimeout(() => {
    _buildBoard();
    _buildDice();
    window.renderState(state);

    // Mensagens de início no chat
    const chatEl = document.getElementById('chat-msgs');
    if (chatEl) chatEl.innerHTML = '';
    if (typeof addChat === 'function') {
      addChat('Sistema', `Jogo iniciado com ${state.players.length} jogadores!`, true);
      state.players.forEach(pl => {
        const c = pl.color || pl.colour || 'blue';
        addChat('Sistema', `${COLOUR_NAME[c]}: ${pl.name}`, true);
      });
    }

    // Ativar partículas
    _partsActive = true;
    _initParts(20);
  }, 50);
};

window.onGameUpdate = function(state) {
  if (window.CUR_STATE) window.PREV_STATE = JSON.parse(JSON.stringify(window.CUR_STATE));
  window.CUR_STATE = state;
  _animateMoveDiff(window.PREV_STATE, state);
  window.renderState(state);
};

// ══════════════════════════════════════════════════════════════════
//  ANIMAÇÃO DIFF  (detecta peças que mudaram e anima)
// ══════════════════════════════════════════════════════════════════
function _animateMoveDiff(prev, next) {
  if (!prev?.players || !next?.players) return;
  next.players.forEach((pl, idx) => {
    const colour  = pl.color || pl.colour;
    const prevPl  = prev.players[idx];
    if (!prevPl) return;
    (pl.pos || []).forEach((pos, i) => {
      const prevPos = prevPl.pos?.[i];
      if (prevPos === pos) return;
      // Peça voltou à base = capturada
      const basePositions = [500,501,502,503,600,601,602,603,700,701,702,703,800,801,802,803];
      if (basePositions.includes(pos) && !basePositions.includes(prevPos)) {
        // Animação de captura (flash e volta)
        const el = _pieceEls[colour]?.[i];
        if (el) {
          el.classList.add('captured');
          SFX.capture();
          setTimeout(() => {
            el.classList.remove('captured');
            _placePiece(colour, i, pos);
          }, 420);
        }
      } else {
        // Movimento normal
        if (pos === HOME_POS?.['P1'] || pos === HOME_POS?.['P2'] ||
            pos === HOME_POS?.['P3'] || pos === HOME_POS?.['P4']) {
          SFX.home();
        } else {
          SFX.move();
        }
        _placePiece(colour, i, pos);
      }
    });
  });
}

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
    // Burst épico
    for (let i = 0; i < 6; i++) {
      setTimeout(() => _burst(
        innerWidth  * (.2 + Math.random()*.6),
        innerHeight * .3,
        28
      ), i * 250);
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
//  DOROLL  (substitui o do index.html — mais robusto)
// ══════════════════════════════════════════════════════════════════
window.doRoll = async function() {
  if (!window.RID) return;
  const rb = document.getElementById('rb');
  if (rb) { rb.disabled = true; rb.classList.remove('my-turn-glow'); }

  let d;
  try {
    const r = await fetch('/api/game/roll', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({room_id: window.RID}),
      credentials:'same-origin'
    });
    d = await r.json();
  } catch(e) {
    if (rb) rb.disabled = false;
    return;
  }

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
        credentials:'same-origin'
      }).then(r=>r.json());
      if (mv.movable?.length) window.highlightPcs(mv.movable);
    } catch(e) {}
  });
};

// ══════════════════════════════════════════════════════════════════
//  MOVEPC
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
      credentials:'same-origin'
    });
    d = await r.json();
  } catch(e) { return; }

  if (d.error) { if (typeof toast === 'function') toast('❌ ' + d.error, 'ter'); return; }

  if (window.PREV_STATE) _animateMoveDiff(window.PREV_STATE, d);
  window.CUR_STATE = d;
  window.renderState(d);
};

// ══════════════════════════════════════════════════════════════════
//  LEAVE GAME
// ══════════════════════════════════════════════════════════════════
window.leaveGame = async function() {
  if (!confirm('Abandonar? Perdes a aposta.')) return;
  _partsActive = false;
  if (window.RID) {
    await fetch('/api/game/leave', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({room_id: window.RID}), credentials:'same-origin'
    }).catch(()=>{});
  }
  window.RID = null;
  if (typeof pg === 'function') pg('home');
};

// ══════════════════════════════════════════════════════════════════
//  buildBoard / initCanvas  (compatibilidade com index.html)
// ══════════════════════════════════════════════════════════════════
window.buildBoard  = _buildBoard;
window.initCanvas  = _buildBoard;
window.startRenderLoop = function() {}; // não necessário com divs

// Pulsa o botão dado quando é a minha vez
setInterval(() => {
  const rb = document.getElementById('rb');
  if (!rb || !window.CUR_STATE) return;
  const myT = _isMyTurn(window.CUR_STATE);
  rb.classList.toggle('my-turn-glow', myT && !window.CUR_STATE.over && window.CUR_STATE.phase === 0);
}, 600);

console.log('[LudoKz] ludo_board_v2.js FINAL carregado ✓');
