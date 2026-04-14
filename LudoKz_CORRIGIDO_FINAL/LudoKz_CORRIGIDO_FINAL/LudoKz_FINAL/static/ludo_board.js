/**
 * ludo_board_v2.js — LudoKz
 * Tabuleiro canvas melhorado baseado no novo design com dado 3D
 * Usado como fallback quando o Godot não está disponível
 */

// ══════════════════════════════════════════════
//  CONSTANTES DO TABULEIRO
// ══════════════════════════════════════════════
const COORDINATES_MAP = {
  0:[6,13],1:[6,12],2:[6,11],3:[6,10],4:[6,9],5:[5,8],6:[4,8],7:[3,8],8:[2,8],9:[1,8],10:[0,8],
  11:[0,7],12:[0,6],13:[1,6],14:[2,6],15:[3,6],16:[4,6],17:[5,6],18:[6,5],19:[6,4],20:[6,3],
  21:[6,2],22:[6,1],23:[6,0],24:[7,0],25:[8,0],26:[8,1],27:[8,2],28:[8,3],29:[8,4],30:[8,5],
  31:[9,6],32:[10,6],33:[11,6],34:[12,6],35:[13,6],36:[14,6],37:[14,7],38:[14,8],39:[13,8],
  40:[12,8],41:[11,8],42:[10,8],43:[9,8],44:[8,9],45:[8,10],46:[8,11],47:[8,12],48:[8,13],
  49:[8,14],50:[7,14],51:[6,14],
  100:[7,13],101:[7,12],102:[7,11],103:[7,10],104:[7,9],105:[7,8],
  200:[7,1],201:[7,2],202:[7,3],203:[7,4],204:[7,5],205:[7,6],
  300:[13,7],301:[12,7],302:[11,7],303:[10,7],304:[9,7],305:[8,7],
  400:[1,7],401:[2,7],402:[3,7],403:[4,7],404:[5,7],405:[6,7],
  500:[1.5,10.58],501:[3.57,10.58],502:[1.5,12.43],503:[3.57,12.43],
  600:[10.5,1.58],601:[12.54,1.58],602:[10.5,3.45],603:[12.54,3.45],
  700:[10.5,10.58],701:[12.57,10.58],702:[10.5,12.43],703:[12.57,12.43],
  800:[1.5,1.58],801:[3.57,1.58],802:[1.5,3.45],803:[3.55,3.45]
};

const STEP_LENGTH = 6.66;
const PLAYERS_LIST = ['P1','P2','P3','P4'];

const BASE_POSITIONS = {
  P1:[500,501,502,503],
  P2:[600,601,602,603],
  P3:[700,701,702,703],
  P4:[800,801,802,803]
};

const START_POSITIONS = { P1:0, P2:26, P3:39, P4:13 };

const HOME_ENTRANCE = {
  P1:[100,101,102,103,104],
  P2:[200,201,202,203,204],
  P3:[300,301,302,303,304],
  P4:[400,401,402,403,404]
};

const HOME_POSITIONS = { P1:105, P2:205, P3:305, P4:405 };
const TURNING_POINTS = { P1:50, P2:24, P3:37, P4:11 };
const SAFE_POSITIONS_V2 = [0,8,13,21,26,34,39,47];
const TURN_ORDER = [0,2,1,3];

const PLAYER_NAMES_V2 = { P1:'Azul', P2:'Verde', P3:'Vermelho', P4:'Amarelo' };
const PLAYER_COLORS_V2 = { P1:'#2eafff', P2:'#00b550', P3:'#ff4757', P4:'#ffa502' };

// ══════════════════════════════════════════════
//  SONS
// ══════════════════════════════════════════════
const SFX_V2 = (() => {
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
    finish:  function() { play('sfx_in_home', 1.0); },
    win:     function() { play('sfx_win', 1.0); },
    tick:    function() { play('sfx_click', 0.3); },
  };
})();

// ══════════════════════════════════════════════
//  CLASSE PRINCIPAL DO TABULEIRO V2
// ══════════════════════════════════════════════
class LudoBoardV2 {
  constructor(boardEl) {
    this.boardEl = boardEl;
    this.pieceEls = {};
    this._buildPieceElements();
    this._loadBackground();
  }

  _buildPieceElements() {
    // Criar elementos de peças para cada jogador
    PLAYERS_LIST.forEach(player => {
      this.pieceEls[player] = [];
      for (let i = 0; i < 4; i++) {
        const el = document.createElement('div');
        el.className = 'ludo-piece';
        el.dataset.player = player;
        el.dataset.piece = i;
        el.style.cssText = `
          position:absolute;
          width:3%; height:3%;
          border-radius:50%;
          border:2px solid rgba(0,0,0,0.6);
          transform:translate(50%,50%);
          transition:all 0.3s;
          z-index:10;
          box-shadow:0 2px 8px rgba(0,0,0,0.5);
          background:${this._pieceColor(player)};
          display:flex;align-items:center;justify-content:center;
          font-size:9px;font-weight:700;color:#fff;
          cursor:default;
        `;
        el.textContent = i + 1;
        this.boardEl.appendChild(el);
        this.pieceEls[player].push(el);
      }
    });
  }

  _pieceColor(player) {
    const colors = {
      P1: 'radial-gradient(circle at 35% 30%,#90caf9,#0d47a1)',
      P2: 'radial-gradient(circle at 35% 30%,#81c784,#1b5e20)',
      P3: 'radial-gradient(circle at 35% 30%,#ef9a9a,#b71c1c)',
      P4: 'radial-gradient(circle at 35% 30%,#fff176,#f57f17)'
    };
    return colors[player] || '#888';
  }

  _loadBackground() {
    // Usa a imagem base64 embutida no ludo.html original
    // Se não disponível, usa CSS simples
    const img = new Image();
    img.onload = () => {
      this.boardEl.style.backgroundImage = `url('${img.src}')`;
      this.boardEl.style.backgroundSize = 'contain';
      this.boardEl.style.backgroundRepeat = 'no-repeat';
    };
    // Tenta carregar imagem do tabuleiro
    img.src = '/static/ludo_board.png';
    img.onerror = () => {
      // Fallback: tabuleiro CSS simples
      this._buildCSSBoard();
    };
  }

  _buildCSSBoard() {
    this.boardEl.style.background = '#fff';
    this.boardEl.style.border = '2px solid #333';
    this.boardEl.style.borderRadius = '8px';
  }

  setPiecePosition(player, piece, pos) {
    const coord = COORDINATES_MAP[pos];
    if (!coord) return;
    const [x, y] = coord;
    const el = this.pieceEls[player][piece];
    if (!el) return;
    el.style.left = x * STEP_LENGTH + '%';
    el.style.top  = y * STEP_LENGTH + '%';
  }

  highlightPieces(player, pieces) {
    pieces.forEach(p => {
      const el = this.pieceEls[player][p];
      if (el) {
        el.style.cursor = 'pointer';
        el.style.animation = 'ludo-pulse 0.6s ease-in-out infinite alternate';
        el.style.zIndex = '20';
      }
    });
  }

  unhighlightAll() {
    PLAYERS_LIST.forEach(player => {
      this.pieceEls[player].forEach(el => {
        el.style.cursor = 'default';
        el.style.animation = '';
        el.style.zIndex = '10';
      });
    });
  }

  destroy() {
    PLAYERS_LIST.forEach(player => {
      this.pieceEls[player].forEach(el => el.remove());
    });
  }
}

// ══════════════════════════════════════════════
//  DADO 3D
// ══════════════════════════════════════════════
function buildDice3D(container) {
  container.innerHTML = `
    <style>
      .dice-scene-3d { perspective:400px; width:80px; height:80px; margin:0 auto; }
      .dice-3d {
        position:relative; width:80px; height:80px;
        transform-style:preserve-3d; transition:1s ease;
      }
      @keyframes dice-rolling {
        50% { transform: rotateX(455deg) rotateY(455deg); }
      }
      .face-3d {
        position:absolute; width:100%; height:100%;
        border-radius:12px; border:3px solid #f6f3f0;
        transform-style:preserve-3d;
        background:linear-gradient(145deg,#dddbd8,#fff);
      }
      .face-3d::before {
        position:absolute; content:'';
        width:100%; height:100%; border-radius:12px;
        background:#f6f3f0; transform:translateZ(-1px);
      }
      .face-3d::after {
        position:absolute; content:'';
        top:50%; left:50%; width:14px; height:14px;
        border-radius:50%; background:#131210;
      }
      .f-front  { transform:translateZ(40px); }
      .f-back   { transform:rotateX(180deg) translateZ(40px); }
      .f-top    { transform:rotateX(90deg)  translateZ(40px); }
      .f-bottom { transform:rotateX(-90deg) translateZ(40px); }
      .f-right  { transform:rotateY(90deg)  translateZ(40px); }
      .f-left   { transform:rotateY(-90deg) translateZ(40px); }
      .f-front::after  { width:24px;height:24px;background:#f63330;margin:-12px 0 0 -12px; }
      .f-back::after   { margin:-28px 0 0 -24px;box-shadow:32px 0,0 20px,32px 20px,0 40px,32px 40px; }
      .f-top::after    { margin:-24px 0 0 -24px;box-shadow:32px 32px; }
      .f-bottom::after { margin:-28px 0 0 -28px;box-shadow:20px 20px,40px 40px,40px 0,0 40px; }
      .f-right::after  { margin:-24px 0 0 -24px;box-shadow:32px 0,0 32px,32px 32px; }
      .f-left::after   { margin:-28px 0 0 -28px;box-shadow:20px 20px,40px 40px; }
      @keyframes ludo-pulse {
        from { box-shadow:0 0 4px rgba(255,255,255,0.5); transform:translate(50%,50%) scale(1); }
        to   { box-shadow:0 0 16px #fff,0 0 6px gold; transform:translate(50%,50%) scale(1.2); }
      }
    </style>
    <div class="dice-scene-3d">
      <div class="dice-3d" id="dice3d-ludo">
        <div class="face-3d f-front"></div>
        <div class="face-3d f-back"></div>
        <div class="face-3d f-top"></div>
        <div class="face-3d f-bottom"></div>
        <div class="face-3d f-right"></div>
        <div class="face-3d f-left"></div>
      </div>
    </div>
  `;
}

function animateDice3D(value) {
  const diceEl = document.getElementById('dice3d-ludo');
  if (!diceEl) return Promise.resolve();

  SFX_V2.dice();
  diceEl.style.animation = 'dice-rolling 1s';

  return new Promise(resolve => {
    setTimeout(() => {
      const transforms = {
        1:'rotateX(0deg) rotateY(0deg)',
        2:'rotateX(-90deg) rotateY(0deg)',
        3:'rotateX(0deg) rotateY(90deg)',
        4:'rotateX(0deg) rotateY(-90deg)',
        5:'rotateX(90deg) rotateY(0deg)',
        6:'rotateX(180deg) rotateY(0deg)'
      };
      diceEl.style.transform = transforms[value] || transforms[1];
      diceEl.style.animation = 'none';
      resolve();
    }, 1050);
  });
}

// ══════════════════════════════════════════════
//  ESTADO DO JOGO LOCAL (fallback sem servidor)
// ══════════════════════════════════════════════
class LudoGameLocal {
  constructor(board) {
    this.board = board;
    this.positions = {
      P1: [...BASE_POSITIONS.P1],
      P2: [...BASE_POSITIONS.P2],
      P3: [...BASE_POSITIONS.P3],
      P4: [...BASE_POSITIONS.P4],
    };
    this.turnIndex = -1;
    this.turn = 0;
    this.diceValue = 0;
    this.phase = 'DICE'; // DICE | MOVE
    this.finished = [];
    this._initPieces();
    this._nextTurn();
  }

  _initPieces() {
    PLAYERS_LIST.forEach(player => {
      for (let i = 0; i < 4; i++) {
        this.board.setPiecePosition(player, i, this.positions[player][i]);
      }
    });
  }

  _nextTurn() {
    do {
      this.turnIndex = (this.turnIndex + 1) % TURN_ORDER.length;
      this.turn = TURN_ORDER[this.turnIndex];
    } while (this.finished.includes(PLAYERS_LIST[this.turn]));
    this.phase = 'DICE';
    this.board.unhighlightAll();
  }

  currentPlayer() { return PLAYERS_LIST[this.turn]; }

  getEligible() {
    const player = this.currentPlayer();
    return [0,1,2,3].filter(piece => {
      const pos = this.positions[player][piece];
      if (pos === HOME_POSITIONS[player]) return false;
      if (BASE_POSITIONS[player].includes(pos) && this.diceValue !== 6) return false;
      if (HOME_ENTRANCE[player].includes(pos)) {
        const remaining = HOME_POSITIONS[player] - pos;
        if (this.diceValue > remaining) return false;
      }
      return true;
    });
  }

  rollDice() {
    if (this.phase !== 'DICE') return null;
    this.diceValue = Math.floor(Math.random() * 6) + 1;
    this.phase = 'MOVE';
    const eligible = this.getEligible();
    if (eligible.length) {
      this.board.highlightPieces(this.currentPlayer(), eligible);
    } else {
      setTimeout(() => this._nextTurn(), 1200);
    }
    return this.diceValue;
  }

  movePiece(piece) {
    if (this.phase !== 'MOVE') return;
    const player = this.currentPlayer();
    const eligible = this.getEligible();
    if (!eligible.includes(piece)) return;

    this.board.unhighlightAll();
    const pos = this.positions[player][piece];

    if (BASE_POSITIONS[player].includes(pos)) {
      this.positions[player][piece] = START_POSITIONS[player];
    } else {
      this._moveSteps(player, piece, this.diceValue);
      return;
    }

    this.board.setPiecePosition(player, piece, this.positions[player][piece]);
    this._afterMove(player, piece);
  }

  _moveSteps(player, piece, steps) {
    let remaining = steps;
    const interval = setInterval(() => {
      this._incrementPos(player, piece);
      this.board.setPiecePosition(player, piece, this.positions[player][piece]);
      remaining--;
      if (remaining === 0) {
        clearInterval(interval);
        this._afterMove(player, piece);
      }
    }, 200);
  }

  _incrementPos(player, piece) {
    const pos = this.positions[player][piece];
    let next;
    if (pos === TURNING_POINTS[player]) {
      next = HOME_ENTRANCE[player][0];
    } else if (pos === 51) {
      next = 0;
    } else if (HOME_ENTRANCE[player].includes(pos)) {
      const idx = HOME_ENTRANCE[player].indexOf(pos);
      next = idx < HOME_ENTRANCE[player].length - 1
        ? HOME_ENTRANCE[player][idx + 1]
        : HOME_POSITIONS[player];
    } else {
      next = pos + 1;
    }
    this.positions[player][piece] = next;
  }

  _afterMove(player, piece) {
    const killed = this._checkKill(player, piece);
    if (this._hasWon(player)) {
      this.finished.push(player);
      const remaining = PLAYERS_LIST.filter(p => !this.finished.includes(p));
      if (remaining.length <= 1) {
        if (remaining.length === 1) this.finished.push(remaining[0]);
        return;
      }
      this._nextTurn();
      return;
    }
    if (killed || this.diceValue === 6) {
      this.phase = 'DICE';
    } else {
      this._nextTurn();
    }
  }

  _checkKill(player, piece) {
    const pos = this.positions[player][piece];
    if (SAFE_POSITIONS_V2.includes(pos)) return false;
    if (HOME_ENTRANCE[player].includes(pos)) return false;
    if (pos === HOME_POSITIONS[player]) return false;

    let killed = false;
    PLAYERS_LIST.forEach(opp => {
      if (opp === player) return;
      for (let p = 0; p < 4; p++) {
        if (this.positions[opp][p] === pos) {
          this.positions[opp][p] = BASE_POSITIONS[opp][p];
          this.board.setPiecePosition(opp, p, BASE_POSITIONS[opp][p]);
          killed = true;
          SFX_V2.capture();
        }
      }
    });
    return killed;
  }

  _hasWon(player) {
    return [0,1,2,3].every(p => this.positions[player][p] === HOME_POSITIONS[player]);
  }
}

console.log('[LudoKz] ludo_board_v2.js carregado ✓');
