// LUDO BOARD — HTML5 Canvas Implementation
// Like Ludo King: smooth animations, pieces slide step-by-step between cells
// Entry animation: piece slides from base → white (start) square → destination

class LudoBoard {
  constructor(canvas, size) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.size = size;
    this.cellSize = size / 15;
    
    // Piece positions (for animation)
    this.pieces = {}; // key: "color_idx" -> {x,y,targetX,targetY,animating}
    
    // Colors
    this.colors = {
      g: '#43a047', // Green - top left
      y: '#f9a825', // Yellow - top right  
      r: '#e53935', // Red - bottom left
      b: '#1565c0', // Blue - bottom right
    };
    this.lightColors = {
      g: '#c8e6c9',
      y: '#fff9c4',
      r: '#ffcdd2',
      b: '#bbdefb',
    };
    this.pieceColors = {
      g: {fill:'#2e7d32', stroke:'#1b5e20', light:'#81c784'},
      y: {fill:'#f57f17', stroke:'#e65100', light:'#fff176'},
      r: {fill:'#c62828', stroke:'#b71c1c', light:'#ef9a9a'},
      b: {fill:'#1565c0', stroke:'#0d47a1', light:'#90caf9'},
    };
    
    // Safe squares (global path positions 1-52)
    this.safeSquares = new Set([1, 9, 14, 22, 27, 35, 40, 48]);
    
    // Path coordinates for each color
    this.buildPaths();
    
    this.animFrame = null;
    this.pendingAnimations = [];
    this.onAnimComplete = null;
    
    // Entry animation waypoints: each color's start square (pos=1) global cell
    // These are the white "star" squares where pieces land when exiting base
    this.startCells = {
      g: [6, 1],   // green entry = global pos 1
      y: [1, 9],   // yellow entry = global pos 14
      r: [8, 13],  // red entry = global pos 27
      b: [13, 5],  // blue entry = global pos 40
    };
  }

  buildPaths() {
    const path = [];
    // Green's start arm: row 6, cols 1-5 (going right)
    for(let c=1;c<=5;c++) path.push([6,c]);
    // Up the right side of green: rows 5-0, col 5
    for(let r=5;r>=0;r--) path.push([r,5]);
    // Top: row 0, cols 6-8  
    for(let c=6;c<=8;c++) path.push([0,c]);
    // Down yellow's left: rows 1-5, col 9
    for(let r=1;r<=5;r++) path.push([r,9]);
    // Yellow's start arm: row 6, cols 9-13 (going right)
    for(let c=9;c<=13;c++) path.push([6,c]);
    // Right side: rows 7-8, col 14
    for(let r=7;r<=8;r++) path.push([r,14]);
    // Bottom of yellow: row 8, cols 13-9
    for(let c=13;c>=9;c--) path.push([8,c]);
    // Down blue's right: rows 9-13, col 9
    for(let r=9;r<=13;r++) path.push([r,9]);
    // Blue's start arm
    for(let c=8;c>=6;c--) path.push([14,c]);
    // Left side of red: rows 13-9, col 5
    for(let r=13;r>=9;r--) path.push([r,5]);
    // Red's start arm: row 8, cols 5-1
    for(let c=5;c>=1;c--) path.push([8,c]);
    // Left: rows 7-6, col 0
    for(let r=7;r>=6;r--) path.push([r,0]);
    
    this.globalPath = path.slice(0,52);
    
    // Home paths (reta final)
    this.homePaths = {
      g: [[1,7],[2,7],[3,7],[4,7],[5,7],[6,7]],
      y: [[7,13],[7,12],[7,11],[7,10],[7,9],[7,8]],
      r: [[13,7],[12,7],[11,7],[10,7],[9,7],[8,7]],
      b: [[7,1],[7,2],[7,3],[7,4],[7,5],[7,6]],
    };
    
    this.startOffset = {g:0, y:13, r:26, b:39};
    
    this.basePosns = {
      g: [[2,2],[2,4],[4,2],[4,4]],
      y: [[2,10],[2,12],[4,10],[4,12]],
      r: [[10,2],[10,4],[12,2],[12,4]],
      b: [[10,10],[10,12],[12,10],[12,12]],
    };
  }

  cellCenter(row, col) {
    return {
      x: col * this.cellSize + this.cellSize / 2,
      y: row * this.cellSize + this.cellSize / 2
    };
  }

  getPieceCoord(color, pos, inBase, pieceIdx) {
    if(inBase || pos === 0) {
      const bases = this.basePosns[color];
      const b = bases[pieceIdx] || bases[0];
      return this.cellCenter(b[0], b[1]);
    }
    if(pos >= 58) {
      const hp = this.homePaths[color][5];
      return this.cellCenter(hp[0], hp[1]);
    }
    if(pos >= 52) {
      const hp = this.homePaths[color][Math.min(pos-52, 5)];
      return this.cellCenter(hp[0], hp[1]);
    }
    const off = this.startOffset[color];
    const globalIdx = (off + pos - 1) % 52;
    const gp = this.globalPath[globalIdx];
    if(!gp) return this.cellCenter(7,7);
    return this.cellCenter(gp[0], gp[1]);
  }

  /**
   * Animate piece movement - supports entry animation via white square
   * When a piece exits base (fromBase=true), it first slides to the white
   * start square, pauses briefly, then continues to final position.
   */
  animateMove(color, pieceIdx, fromPos, fromBase, toPos, toBase, onComplete) {
    const key = color + '_' + pieceIdx;
    const from = this.getPieceCoord(color, fromPos, fromBase, pieceIdx);
    const to   = this.getPieceCoord(color, toPos,   toBase,   pieceIdx);

    if(!this.pieces[key]) this.pieces[key] = {x:from.x, y:from.y};
    const piece = this.pieces[key];
    piece.x = from.x;
    piece.y = from.y;
    piece.animating = true;

    if(fromBase && !toBase) {
      // ENTRY ANIMATION: base → white start square → destination
      const startCell = this.startCells[color];
      const waypoint  = this.cellCenter(startCell[0], startCell[1]);
      
      this._animateSegment(piece, from, waypoint, 320, () => {
        // Brief pause on white square (120ms) to make it visible
        setTimeout(() => {
          this._animateSegment(piece, waypoint, to, 380, () => {
            piece.animating = false;
            if(onComplete) onComplete();
          });
        }, 120);
      });
    } else {
      // Normal move
      this._animateSegment(piece, from, to, 400, () => {
        piece.animating = false;
        if(onComplete) onComplete();
      });
    }
  }

  /**
   * Animate a single segment from → to with easing
   */
  _animateSegment(piece, from, to, duration, onDone) {
    const startTime = performance.now();
    const dx = to.x - from.x;
    const dy = to.y - from.y;

    const step = (now) => {
      const elapsed = now - startTime;
      const t = Math.min(elapsed / duration, 1);
      // Ease out cubic
      const ease = 1 - Math.pow(1 - t, 3);
      
      piece.x = from.x + dx * ease;
      piece.y = from.y + dy * ease;

      if(t < 1) {
        this.animFrame = requestAnimationFrame(step);
      } else {
        piece.x = to.x;
        piece.y = to.y;
        if(onDone) onDone();
      }
    };
    this.animFrame = requestAnimationFrame(step);
  }

  draw(gameState) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.size, this.size);
    this.drawBoard();
    if(gameState && gameState.players) {
      gameState.players.forEach(pl => {
        pl.pos.forEach((pos, i) => {
          const key = pl.color + '_' + i;
          const target = this.getPieceCoord(pl.color, pos, !!pl.in_base[i], i);
          if(this.pieces[key] && this.pieces[key].animating) {
            this.drawPiece(this.pieces[key].x, this.pieces[key].y, pl.color, i+1,
              gameState.movable && gameState.movable.includes(i) && gameState.myTurn);
          } else {
            if(!this.pieces[key]) this.pieces[key] = {x:target.x, y:target.y};
            this.drawPiece(target.x, target.y, pl.color, i+1,
              gameState.movable && gameState.movable.includes(i) && gameState.myTurn);
          }
        });
      });
    }
  }

  drawBoard() {
    const ctx = this.ctx;
    const cs = this.cellSize;
    
    for(let r=0; r<15; r++) {
      for(let c=0; c<15; c++) {
        const x = c * cs;
        const y = r * cs;
        const color = this.getCellColor(r, c);
        
        ctx.fillStyle = color;
        ctx.fillRect(x, y, cs, cs);
        
        ctx.strokeStyle = 'rgba(0,0,0,0.12)';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(x, y, cs, cs);
      }
    }
    
    // Draw base areas
    this.drawBase(1, 1, 5, 5, this.colors.g);
    this.drawBase(1, 9, 5, 13, this.colors.y);
    this.drawBase(9, 1, 13, 5, this.colors.r);
    this.drawBase(9, 9, 13, 13, this.colors.b);
    
    // Draw center star/finish area
    this.drawCenter();
    
    // Draw safe squares (stars)
    this.drawSafeSquares();
    
    // Draw arrows on home paths
    this.drawHomeArrows();
  }

  drawBase(r1, c1, r2, c2, color) {
    const ctx = this.ctx;
    const cs = this.cellSize;
    const margin = cs * 0.12;
    const x = c1 * cs + margin;
    const y = r1 * cs + margin;
    const w = (c2 - c1 + 1) * cs - margin * 2;
    const h = (r2 - r1 + 1) * cs - margin * 2;
    const rad = cs * 0.4;
    
    // Shadow
    ctx.shadowColor = 'rgba(0,0,0,0.25)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 2;
    
    // Background
    ctx.fillStyle = color;
    this._roundRect(x, y, w, h, rad);
    ctx.fill();
    
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    
    // Inner white circle area
    const cx = (c1 + c2 + 1) / 2 * cs;
    const cy = (r1 + r2 + 1) / 2 * cs;
    const innerR = cs * 1.4;
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.arc(cx, cy, innerR, 0, Math.PI * 2);
    ctx.fill();
    
    // Draw 4 piece circles
    const lightC = this.lightColors[Object.keys(this.colors).find(k => this.colors[k] === color) || 'g'];
    const positions = [[r1+1, c1+1],[r1+1, c2-1],[r2-1, c1+1],[r2-1, c2-1]];
    positions.forEach(([row, col]) => {
      const px = col * cs + cs/2;
      const py = row * cs + cs/2;
      const r = cs * 0.32;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI*2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      ctx.lineWidth = 2;
      ctx.stroke();
    });
  }

  _roundRect(x, y, w, h, r) {
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

  drawCenter() {
    const ctx = this.ctx;
    const cs = this.cellSize;
    const cx = 7.5 * cs;
    const cy = 7.5 * cs;
    const s  = 3 * cs;
    
    // Draw 4 colored triangles pointing to center
    const triangles = [
      { color: this.colors.g, points: [[6*cs,6*cs],[9*cs,6*cs],[7.5*cs,7.5*cs]] },
      { color: this.colors.y, points: [[9*cs,6*cs],[9*cs,9*cs],[7.5*cs,7.5*cs]] },
      { color: this.colors.r, points: [[6*cs,9*cs],[9*cs,9*cs],[7.5*cs,7.5*cs]] },
      { color: this.colors.b, points: [[6*cs,6*cs],[6*cs,9*cs],[7.5*cs,7.5*cs]] },
    ];
    triangles.forEach(t => {
      ctx.fillStyle = t.color;
      ctx.beginPath();
      ctx.moveTo(t.points[0][0], t.points[0][1]);
      ctx.lineTo(t.points[1][0], t.points[1][1]);
      ctx.lineTo(t.points[2][0], t.points[2][1]);
      ctx.closePath();
      ctx.fill();
    });
    
    // Center circle
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(cx, cy, cs * 0.9, 0, Math.PI*2);
    ctx.fill();
    
    // Star in center
    ctx.fillStyle = 'rgba(0,0,0,0.1)';
    ctx.font = `${cs * 1.1}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('★', cx, cy);
  }

  drawSafeSquares() {
    const ctx = this.ctx;
    const cs = this.cellSize;
    const safePositions = [0, 8, 13, 21, 26, 34, 39, 47]; // 0-indexed in globalPath
    safePositions.forEach(idx => {
      if(idx < this.globalPath.length) {
        const [row, col] = this.globalPath[idx];
        const x = col * cs + cs * 0.15;
        const y = row * cs + cs * 0.15;
        const s = cs * 0.7;
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.fillRect(x, y, s, s);
        ctx.fillStyle = 'rgba(0,0,0,0.2)';
        ctx.font = `${cs * 0.5}px serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('★', col * cs + cs/2, row * cs + cs/2);
      }
    });
  }

  drawHomeArrows() {
    const ctx = this.ctx;
    const cs = this.cellSize;
    const arrows = {
      g: { cells: [[1,7],[2,7],[3,7],[4,7],[5,7]], arrow: '↓', color: this.colors.g },
      y: { cells: [[7,13],[7,12],[7,11],[7,10],[7,9]], arrow: '←', color: this.colors.y },
      r: { cells: [[13,7],[12,7],[11,7],[10,7],[9,7]], arrow: '↑', color: this.colors.r },
      b: { cells: [[7,1],[7,2],[7,3],[7,4],[7,5]], arrow: '→', color: this.colors.b },
    };
    Object.values(arrows).forEach(({cells, arrow, color}) => {
      cells.forEach(([row, col]) => {
        ctx.fillStyle = color + '55';
        ctx.fillRect(col * cs, row * cs, cs, cs);
        ctx.fillStyle = color;
        ctx.font = `bold ${cs * 0.55}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(arrow, col * cs + cs/2, row * cs + cs/2);
      });
    });
  }

  getCellColor(row, col) {
    // Base areas
    if(row>=1&&row<=5&&col>=1&&col<=5) return this.lightColors.g;
    if(row>=1&&row<=5&&col>=9&&col<=13) return this.lightColors.y;
    if(row>=9&&row<=13&&col>=1&&col<=5) return this.lightColors.r;
    if(row>=9&&row<=13&&col>=9&&col<=13) return this.lightColors.b;
    
    // Center
    if(row>=6&&row<=8&&col>=6&&col<=8) return '#ffffff';
    
    // Colored lanes
    if(col===7&&row>=1&&row<=5) return this.lightColors.g;
    if(row===7&&col>=9&&col<=13) return this.lightColors.y;
    if(col===7&&row>=9&&row<=13) return this.lightColors.r;
    if(row===7&&col>=1&&col<=5) return this.lightColors.b;
    
    // Colored start squares (white squares / safe squares)
    if(row===6&&col===1) return '#ffffff'; // green start
    if(row===1&&col===9) return '#ffffff'; // yellow start (approximate)
    if(row===8&&col===13) return '#ffffff'; // red start  
    if(row===13&&col===5) return '#ffffff'; // blue start
    
    return '#f5f5f5';
  }

  drawPiece(x, y, color, num, selectable, pulseT) {
    const ctx = this.ctx;
    const cs = this.cellSize;
    const r = cs * 0.33;
    const pc = this.pieceColors[color];
    
    // Glow effect for selectable pieces
    if(selectable) {
      const pulse = pulseT ? 0.5 + 0.5 * Math.sin(pulseT * 3) : 0.7;
      ctx.shadowColor = this.colors[color];
      ctx.shadowBlur = 10 + 6 * pulse;
    }
    
    // Outer circle (border)
    ctx.fillStyle = pc.stroke;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI*2);
    ctx.fill();
    
    // Main body
    const grad = ctx.createRadialGradient(x - r*0.3, y - r*0.3, r*0.1, x, y, r*0.85);
    grad.addColorStop(0, pc.light);
    grad.addColorStop(1, pc.fill);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.82, 0, Math.PI*2);
    ctx.fill();
    
    // Bounce animation for selectable
    if(selectable) {
      const bounce = pulseT ? Math.abs(Math.sin(pulseT * 3)) * 3 : 0;
      ctx.translate(0, -bounce);
    }
    
    // Number
    ctx.fillStyle = '#fff';
    ctx.font = `bold ${cs * 0.22}px Bebas Neue, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(num, x, y);
    
    if(selectable) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }
    
    ctx.shadowBlur = 0;
    ctx.shadowColor = 'transparent';
  }
}
