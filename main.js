// ===== 튜닝 파라미터 =====
const PARAMS = {
  // 블랙홀
  blackHoleMass: 50000,
  eventHorizon: 50,
  softening: 100,
  
  // 점수 시스템
  scoreRadius: 400,
  baseScoreRate: 10,
  scoreScale: 100,
  maxMultiplier: 20,
  nearMissWindow: 80,
  nearMissBonus: 2.5,
  
  // 플레이어
  playerRadius: 8,
  playerMass: 10,
  thrustPower: 180,
  boostMultiplier: 2.5,
  maxSpeed: 400,
  heatPerThrust: 0.8,
  heatPerBoost: 2.5,
  heatCoolRate: 15,
  maxHeat: 100,
  collisionPenalty: 50,
  invincibilityTime: 0.5,
  
  // 소행성
  asteroidCount: 25,
  asteroidMinRadius: 4,
  asteroidMaxRadius: 12,
  asteroidMinMass: 5,
  asteroidMaxMass: 20,
  asteroidSpawnMin: 250,
  asteroidSpawnMax: 500,
  
  // 거대 천체
  planets: [
    { x: 300, y: 0, mass: 8000, radius: 25, color: '#f4a460' },
    { x: -200, y: 250, mass: 6000, radius: 20, color: '#4169e1' }
  ],
  
  // 물리
  G: 1,
  maxDT: 0.05,
  dampingFactor: 0.995
};

// ===== 게임 상태 =====
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

let W, H, centerX, centerY;

const state = {
  player: null,
  asteroids: [],
  round: 1,
  currentScore: 0,
  totalScore: 0,
  heat: 0,
  invincible: 0,
  gameOver: false,
  message: '',
  keys: {},
  lastTime: 0
};

// ===== 초기화 =====
function init() {
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);
  window.addEventListener('keydown', e => {
    state.keys[e.code] = true;
    if (e.code === 'Space') {
      e.preventDefault();
      cashOut();
    }
    if (e.code === 'KeyR') {
      e.preventDefault();
      resetRound();
    }
  });
  window.addEventListener('keyup', e => state.keys[e.code] = false);
  
  resetRound();
  requestAnimationFrame(gameLoop);
}

function resizeCanvas() {
  W = canvas.width = window.innerWidth;
  H = canvas.height = window.innerHeight;
  centerX = W / 2;
  centerY = H / 2;
}

function resetRound() {
  state.currentScore = 0;
  state.heat = 0;
  state.invincible = 0;
  state.gameOver = false;
  state.message = '';
  hideMessage();
  
  // 플레이어 스폰 (scoreRadius 경계 근처)
  const angle = Math.random() * Math.PI * 2;
  const spawnDist = PARAMS.scoreRadius * 0.9;
  state.player = {
    x: Math.cos(angle) * spawnDist,
    y: Math.sin(angle) * spawnDist,
    vx: 0,
    vy: 0,
    radius: PARAMS.playerRadius,
    mass: PARAMS.playerMass
  };
  
  // 소행성 스폰
  state.asteroids = [];
  for (let i = 0; i < PARAMS.asteroidCount; i++) {
    spawnAsteroid();
  }
}

function spawnAsteroid() {
  const angle = Math.random() * Math.PI * 2;
  const dist = PARAMS.asteroidSpawnMin + Math.random() * (PARAMS.asteroidSpawnMax - PARAMS.asteroidSpawnMin);
  const radius = PARAMS.asteroidMinRadius + Math.random() * (PARAMS.asteroidMaxRadius - PARAMS.asteroidMinRadius);
  const mass = PARAMS.asteroidMinMass + Math.random() * (PARAMS.asteroidMaxMass - PARAMS.asteroidMinMass);
  
  // 초기 궤도 속도
  const orbitalSpeed = Math.sqrt(PARAMS.G * PARAMS.blackHoleMass / dist) * (0.7 + Math.random() * 0.6);
  const perpAngle = angle + Math.PI / 2;
  
  state.asteroids.push({
    x: Math.cos(angle) * dist,
    y: Math.sin(angle) * dist,
    vx: Math.cos(perpAngle) * orbitalSpeed,
    vy: Math.sin(perpAngle) * orbitalSpeed,
    radius,
    mass
  });
}

// ===== 물리 =====
function applyGravity(obj, dt) {
  let ax = 0, ay = 0;
  
  // 블랙홀 중력
  const dx = -obj.x;
  const dy = -obj.y;
  const r2 = dx * dx + dy * dy + PARAMS.softening;
  const r = Math.sqrt(r2);
  const force = PARAMS.G * PARAMS.blackHoleMass / r2;
  ax += force * dx / r;
  ay += force * dy / r;
  
  // 거대 천체 중력
  for (const planet of PARAMS.planets) {
    const pdx = planet.x - obj.x;
    const pdy = planet.y - obj.y;
    const pr2 = pdx * pdx + pdy * pdy + PARAMS.softening;
    const pr = Math.sqrt(pr2);
    const pforce = PARAMS.G * planet.mass / pr2;
    ax += pforce * pdx / pr;
    ay += pforce * pdy / pr;
  }
  
  // Semi-implicit Euler
  obj.vx += ax * dt;
  obj.vy += ay * dt;
  
  // 속도 제한 (플레이어만)
  if (obj === state.player) {
    const speed = Math.sqrt(obj.vx * obj.vx + obj.vy * obj.vy);
    if (speed > PARAMS.maxSpeed) {
      obj.vx *= PARAMS.maxSpeed / speed;
      obj.vy *= PARAMS.maxSpeed / speed;
    }
  }
  
  // 감쇠
  obj.vx *= PARAMS.dampingFactor;
  obj.vy *= PARAMS.dampingFactor;
  
  obj.x += obj.vx * dt;
  obj.y += obj.vy * dt;
  
  // NaN 방지
  if (!isFinite(obj.x) || !isFinite(obj.y) || !isFinite(obj.vx) || !isFinite(obj.vy)) {
    obj.x = obj.y = 0;
    obj.vx = obj.vy = 0;
  }
}

function handleInput(dt) {
  if (state.gameOver) return;
  
  let thrustX = 0, thrustY = 0;
  
  if (state.keys['KeyW'] || state.keys['ArrowUp']) thrustY -= 1;
  if (state.keys['KeyS'] || state.keys['ArrowDown']) thrustY += 1;
  if (state.keys['KeyA'] || state.keys['ArrowLeft']) thrustX -= 1;
  if (state.keys['KeyD'] || state.keys['ArrowRight']) thrustX += 1;
  
  const len = Math.sqrt(thrustX * thrustX + thrustY * thrustY);
  if (len > 0) {
    thrustX /= len;
    thrustY /= len;
    
    const boost = state.keys['ShiftLeft'] || state.keys['ShiftRight'];
    const power = PARAMS.thrustPower * (boost ? PARAMS.boostMultiplier : 1);
    const heatCost = boost ? PARAMS.heatPerBoost : PARAMS.heatPerThrust;
    
    state.player.vx += thrustX * power * dt;
    state.player.vy += thrustY * power * dt;
    state.heat = Math.min(PARAMS.maxHeat, state.heat + heatCost * dt);
  }
  
  // 열 냉각
  state.heat = Math.max(0, state.heat - PARAMS.heatCoolRate * dt);
}

function checkCollisions(dt) {
  if (state.gameOver || state.invincible > 0) return;
  
  const p = state.player;
  for (const ast of state.asteroids) {
    const dx = p.x - ast.x;
    const dy = p.y - ast.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    
    if (dist < p.radius + ast.radius) {
      // 충돌 반응
      const nx = dx / dist;
      const ny = dy / dist;
      
      // 상대 속도
      const rvx = p.vx - ast.vx;
      const rvy = p.vy - ast.vy;
      const rvn = rvx * nx + rvy * ny;
      
      if (rvn < 0) {
        const restitution = 0.6;
        const impulse = -(1 + restitution) * rvn / (1 / p.mass + 1 / ast.mass);
        
        p.vx += impulse * nx / p.mass;
        p.vy += impulse * ny / p.mass;
        ast.vx -= impulse * nx / ast.mass;
        ast.vy -= impulse * ny / ast.mass;
        
        // 분리
        const overlap = p.radius + ast.radius - dist;
        p.x += nx * overlap * 0.6;
        p.y += ny * overlap * 0.6;
        ast.x -= nx * overlap * 0.4;
        ast.y -= ny * overlap * 0.4;
      }
      
      // 패널티
      state.currentScore = Math.max(0, state.currentScore - PARAMS.collisionPenalty);
      state.heat = Math.min(PARAMS.maxHeat, state.heat + 15);
      state.invincible = PARAMS.invincibilityTime;
      
      break;
    }
  }
}

function updateScore(dt) {
  if (state.gameOver) return;
  
  const r = Math.sqrt(state.player.x * state.player.x + state.player.y * state.player.y);
  
  // 사건의 지평선 체크
  if (r <= PARAMS.eventHorizon) {
    endRound(false, '블랙홀 흡수!');
    return;
  }
  
  // scoreRadius 밖이면 자동 캐시아웃
  if (r > PARAMS.scoreRadius) {
    cashOut();
    return;
  }
  
  // 점수 누적 (scoreRadius 안에서만)
  const d = Math.max(r - PARAMS.eventHorizon, 1);
  const multiplier = Math.min(PARAMS.scoreScale / d, PARAMS.maxMultiplier);
  state.currentScore += PARAMS.baseScoreRate * multiplier * dt;
}

function cashOut() {
  if (state.gameOver) return;
  
  const r = Math.sqrt(state.player.x * state.player.x + state.player.y * state.player.y);
  let finalScore = state.currentScore;
  
  // Near Miss 보너스 (탈출 시점에만, 위험 구간에 있을 때만)
  if (r > PARAMS.eventHorizon && r <= PARAMS.eventHorizon + PARAMS.nearMissWindow) {
    finalScore *= PARAMS.nearMissBonus;
    showMessage(`Near Miss! ×${PARAMS.nearMissBonus.toFixed(1)} 보너스!`, 1500);
  }
  
  state.totalScore += Math.floor(finalScore);
  state.round++;
  resetRound();
}

function endRound(success, msg) {
  state.gameOver = true;
  state.message = msg;
  showMessage(msg, 2000);
  
  setTimeout(() => {
    if (!success) {
      state.totalScore = Math.max(0, state.totalScore - Math.floor(state.currentScore * 0.5));
    }
    state.round++;
    resetRound();
  }, 2000);
}

// ===== 렌더링 =====
function render() {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  
  ctx.save();
  ctx.translate(centerX, centerY);
  
  // 점수 반경
  ctx.strokeStyle = 'rgba(0, 255, 255, 0.2)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, PARAMS.scoreRadius, 0, Math.PI * 2);
  ctx.stroke();
  
  // 사건의 지평선
  const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, PARAMS.eventHorizon);
  gradient.addColorStop(0, 'rgba(255, 0, 0, 0.8)');
  gradient.addColorStop(0.7, 'rgba(100, 0, 100, 0.5)');
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(0, 0, PARAMS.eventHorizon, 0, Math.PI * 2);
  ctx.fill();
  
  ctx.strokeStyle = '#f00';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(0, 0, PARAMS.eventHorizon, 0, Math.PI * 2);
  ctx.stroke();
  
  // Near Miss 구역
  ctx.strokeStyle = 'rgba(255, 255, 0, 0.3)';
  ctx.lineWidth = 1;
  ctx.setLineDash([5, 5]);
  ctx.beginPath();
  ctx.arc(0, 0, PARAMS.eventHorizon + PARAMS.nearMissWindow, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  
  // 거대 천체
  for (const planet of PARAMS.planets) {
    const glow = ctx.createRadialGradient(planet.x, planet.y, 0, planet.x, planet.y, planet.radius * 1.5);
    glow.addColorStop(0, planet.color);
    glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(planet.x, planet.y, planet.radius * 1.5, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.fillStyle = planet.color;
    ctx.beginPath();
    ctx.arc(planet.x, planet.y, planet.radius, 0, Math.PI * 2);
    ctx.fill();
  }
  
  // 소행성
  for (const ast of state.asteroids) {
    ctx.fillStyle = '#888';
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(ast.x, ast.y, ast.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  
  // 플레이어
  if (state.player) {
    const p = state.player;
    
    // 무적 시 깜빡임
    if (state.invincible > 0 && Math.floor(state.invincible * 10) % 2 === 0) {
      ctx.globalAlpha = 0.5;
    }
    
    // 추진 이펙트
    const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
    if (speed > 10) {
      const angle = Math.atan2(p.vy, p.vx);
      ctx.fillStyle = 'rgba(255, 150, 0, 0.5)';
      ctx.beginPath();
      ctx.arc(p.x - Math.cos(angle) * p.radius, p.y - Math.sin(angle) * p.radius, p.radius * 0.6, 0, Math.PI * 2);
      ctx.fill();
    }
    
    // 선체
    ctx.fillStyle = state.heat > 80 ? '#f00' : '#0f0';
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    
    ctx.globalAlpha = 1;
  }
  
  ctx.restore();
  
  // UI 업데이트
  updateUI();
}

function updateUI() {
  document.getElementById('round').textContent = state.round;
  document.getElementById('currentScore').textContent = Math.floor(state.currentScore);
  document.getElementById('totalScore').textContent = Math.floor(state.totalScore);
  document.getElementById('heat').textContent = Math.floor(state.heat);
  
  if (state.player) {
    const r = Math.sqrt(state.player.x * state.player.x + state.player.y * state.player.y);
    document.getElementById('distance').textContent = Math.floor(r);
  }
}

function showMessage(msg, duration) {
  const el = document.getElementById('message');
  el.textContent = msg;
  el.style.display = 'block';
  setTimeout(() => el.style.display = 'none', duration);
}

function hideMessage() {
  document.getElementById('message').style.display = 'none';
}

// ===== 게임 루프 =====
function gameLoop(time) {
  const dt = Math.min((time - state.lastTime) / 1000, PARAMS.maxDT);
  state.lastTime = time;
  
  if (dt > 0 && !state.gameOver) {
    handleInput(dt);
    
    applyGravity(state.player, dt);
    
    for (const ast of state.asteroids) {
      applyGravity(ast, dt);
      
      // 블랙홀 흡수 체크
      const r = Math.sqrt(ast.x * ast.x + ast.y * ast.y);
      if (r <= PARAMS.eventHorizon) {
        const angle = Math.random() * Math.PI * 2;
        const dist = PARAMS.asteroidSpawnMin + Math.random() * (PARAMS.asteroidSpawnMax - PARAMS.asteroidSpawnMin);
        ast.x = Math.cos(angle) * dist;
        ast.y = Math.sin(angle) * dist;
        
        const orbitalSpeed = Math.sqrt(PARAMS.G * PARAMS.blackHoleMass / dist) * (0.7 + Math.random() * 0.6);
        const perpAngle = angle + Math.PI / 2;
        ast.vx = Math.cos(perpAngle) * orbitalSpeed;
        ast.vy = Math.sin(perpAngle) * orbitalSpeed;
      }
    }
    
    checkCollisions(dt);
    updateScore(dt);
    
    if (state.invincible > 0) {
      state.invincible = Math.max(0, state.invincible - dt);
    }
  }
  
  render();
  requestAnimationFrame(gameLoop);
}

init();
