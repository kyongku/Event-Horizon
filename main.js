const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

canvas.width = 1200;
canvas.height = 800;

// === 튜닝 파라미터 ===
const PARAMS = {
    GM: 50000,              // 중력 상수
    softening: 100,         // 중력 소프트닝
    r_s: 80,                // 사건의 지평선 반경
    thrustForce: 200,       // 추력 강도
    scoreScale: 100,        // 점수 배율 스케일
    multMax: 50,            // 최대 멀티플라이어
    baseRate: 10,           // 기본 점수 증가율
    heatRate: 0.4,          // 열 증가율
    coolRate: 0.15,         // 열 감소율
    nearMissWindow: 30,     // 위험 구간 폭
    nearMissBonus: 3.0,     // Near Miss 보너스 배율
    shakeScale: 500,        // 화면 흔들림 스케일
    maxShake: 15,           // 최대 흔들림
    eps: 0.1                // 안전 엡실론
};

// === 게임 상태 ===
let gameState = {
    center: { x: canvas.width / 2, y: canvas.height / 2 },
    player: { x: 0, y: 0, vx: 0, vy: 0 },
    score: 0,
    bestScore: 0,
    heat: 0,
    nearMissActivated: false,
    shake: { x: 0, y: 0 },
    particles: [],
    keys: {},
    lastTime: performance.now()
};

// === 초기화 ===
function init() {
    gameState.bestScore = parseFloat(localStorage.getItem('eventHorizonBest')) || 0;
    resetRound();
    updateUI();
    spawnParticles();
    gameLoop();
}

function resetRound() {
    gameState.player = {
        x: gameState.center.x + 300,
        y: gameState.center.y,
        vx: 0,
        vy: -50
    };
    gameState.score = 0;
    gameState.heat = 0;
    gameState.nearMissActivated = false;
    gameState.shake = { x: 0, y: 0 };
    document.getElementById('status').textContent = '';
}

function spawnParticles() {
    gameState.particles = [];
    for (let i = 0; i < 100; i++) {
        const angle = Math.random() * Math.PI * 2;
        const dist = 200 + Math.random() * 400;
        gameState.particles.push({
            x: gameState.center.x + Math.cos(angle) * dist,
            y: gameState.center.y + Math.sin(angle) * dist,
            vx: 0,
            vy: 0,
            size: 1 + Math.random() * 2
        });
    }
}

// === 입력 처리 ===
document.addEventListener('keydown', (e) => {
    gameState.keys[e.key.toLowerCase()] = true;
    
    if (e.code === 'Space') {
        e.preventDefault();
        escapeRound();
    }
    if (e.key.toLowerCase() === 'r') {
        resetRound();
    }
});

document.addEventListener('keyup', (e) => {
    gameState.keys[e.key.toLowerCase()] = false;
});

function escapeRound() {
    let finalScore = gameState.score;
    
    if (gameState.nearMissActivated) {
        finalScore *= PARAMS.nearMissBonus;
        document.getElementById('status').textContent = 
            `🔥 NEAR MISS! ${Math.floor(finalScore)} (+${PARAMS.nearMissBonus}x)`;
    } else {
        document.getElementById('status').textContent = 
            `탈출 성공: ${Math.floor(finalScore)}`;
    }
    
    if (finalScore > gameState.bestScore) {
        gameState.bestScore = finalScore;
        localStorage.setItem('eventHorizonBest', gameState.bestScore.toString());
    }
    
    setTimeout(() => resetRound(), 1000);
}

// === 물리 업데이트 ===
function update(dt) {
    const p = gameState.player;
    const c = gameState.center;
    
    // 거리 계산
    const dx = c.x - p.x;
    const dy = c.y - p.y;
    const r = Math.sqrt(dx * dx + dy * dy);
    
    // 사건의 지평선 체크
    if (r <= PARAMS.r_s) {
        document.getElementById('status').textContent = '흡수됨! 점수 손실';
        setTimeout(() => resetRound(), 1000);
        return;
    }
    
    // Near Miss 체크
    if (r <= PARAMS.r_s + PARAMS.nearMissWindow) {
        gameState.nearMissActivated = true;
    }
    
    // 중력 계산
    const gravMag = PARAMS.GM / (r * r + PARAMS.softening);
    const gravX = (dx / r) * gravMag;
    const gravY = (dy / r) * gravMag;
    
    // 추력 계산
    let thrustX = 0;
    let thrustY = 0;
    let thrusting = false;
    
    if (gameState.heat < 1.0) {
        if (gameState.keys['w'] || gameState.keys['arrowup']) {
            thrustY -= PARAMS.thrustForce;
            thrusting = true;
        }
        if (gameState.keys['s'] || gameState.keys['arrowdown']) {
            thrustY += PARAMS.thrustForce;
            thrusting = true;
        }
        if (gameState.keys['a'] || gameState.keys['arrowleft']) {
            thrustX -= PARAMS.thrustForce;
            thrusting = true;
        }
        if (gameState.keys['d'] || gameState.keys['arrowright']) {
            thrustX += PARAMS.thrustForce;
            thrusting = true;
        }
    }
    
    // 열 관리
    if (thrusting) {
        gameState.heat += PARAMS.heatRate * dt;
    } else {
        gameState.heat -= PARAMS.coolRate * dt;
    }
    gameState.heat = Math.max(0, Math.min(1, gameState.heat));
    
    // Semi-implicit Euler
    p.vx += (gravX + thrustX) * dt;
    p.vy += (gravY + thrustY) * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    
    // 점수 계산
    const d = Math.max(r - PARAMS.r_s, PARAMS.eps);
    const multiplier = Math.min(PARAMS.scoreScale / d, PARAMS.multMax);
    gameState.score += PARAMS.baseRate * multiplier * dt;
    
    // 화면 흔들림
    const shakeIntensity = Math.min(PARAMS.shakeScale / (r - PARAMS.r_s + PARAMS.eps), PARAMS.maxShake);
    gameState.shake.x = (Math.random() - 0.5) * shakeIntensity;
    gameState.shake.y = (Math.random() - 0.5) * shakeIntensity;
    
    // 파티클 업데이트
    gameState.particles.forEach(particle => {
        const pdx = c.x - particle.x;
        const pdy = c.y - particle.y;
        const pr = Math.sqrt(pdx * pdx + pdy * pdy);
        
        if (pr < PARAMS.r_s) {
            const angle = Math.random() * Math.PI * 2;
            const dist = 200 + Math.random() * 400;
            particle.x = c.x + Math.cos(angle) * dist;
            particle.y = c.y + Math.sin(angle) * dist;
            particle.vx = 0;
            particle.vy = 0;
        } else {
            const pGravMag = PARAMS.GM * 0.5 / (pr * pr + PARAMS.softening);
            particle.vx += (pdx / pr) * pGravMag * dt;
            particle.vy += (pdy / pr) * pGravMag * dt;
            particle.x += particle.vx * dt;
            particle.y += particle.vy * dt;
        }
    });
    
    updateUI();
}

// === 렌더링 ===
function render() {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    ctx.save();
    ctx.translate(gameState.shake.x, gameState.shake.y);
    
    const c = gameState.center;
    const p = gameState.player;
    
    // 파티클
    ctx.fillStyle = '#888';
    gameState.particles.forEach(particle => {
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
        ctx.fill();
    });
    
    // 블랙홀
    const gradient = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, PARAMS.r_s);
    gradient.addColorStop(0, '#000');
    gradient.addColorStop(1, '#111');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(c.x, c.y, PARAMS.r_s, 0, Math.PI * 2);
    ctx.fill();
    
    // 사건의 지평선
    ctx.strokeStyle = '#f00';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(c.x, c.y, PARAMS.r_s, 0, Math.PI * 2);
    ctx.stroke();
    
    // 위험 구간
    ctx.strokeStyle = '#ff0';
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.arc(c.x, c.y, PARAMS.r_s + PARAMS.nearMissWindow, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    
    // 플레이어
    const dx = p.x - c.x;
    const dy = p.y - c.y;
    const angle = Math.atan2(dy, dx);
    
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(angle + Math.PI / 2);
    
    ctx.fillStyle = '#0ff';
    ctx.beginPath();
    ctx.moveTo(0, -10);
    ctx.lineTo(-6, 10);
    ctx.lineTo(6, 10);
    ctx.closePath();
    ctx.fill();
    
    if (gameState.heat < 1.0 && (gameState.keys['w'] || gameState.keys['s'] || 
        gameState.keys['a'] || gameState.keys['d'] ||
        gameState.keys['arrowup'] || gameState.keys['arrowdown'] ||
        gameState.keys['arrowleft'] || gameState.keys['arrowright'])) {
        ctx.fillStyle = '#f80';
        ctx.beginPath();
        ctx.moveTo(-3, 10);
        ctx.lineTo(0, 20);
        ctx.lineTo(3, 10);
        ctx.closePath();
        ctx.fill();
    }
    
    ctx.restore();
    ctx.restore();
}

// === UI 업데이트 ===
function updateUI() {
    const p = gameState.player;
    const c = gameState.center;
    const dx = c.x - p.x;
    const dy = c.y - p.y;
    const r = Math.sqrt(dx * dx + dy * dy);
    
    document.getElementById('current-score').textContent = Math.floor(gameState.score);
    document.getElementById('best-score').textContent = Math.floor(gameState.bestScore);
    document.getElementById('distance').textContent = Math.floor(r - PARAMS.r_s);
    document.getElementById('heat-fill').style.width = (gameState.heat * 100) + '%';
}

// === 게임 루프 ===
function gameLoop() {
    const now = performance.now();
    let dt = (now - gameState.lastTime) / 1000;
    dt = Math.min(dt, 0.05); // dt 클램핑
    gameState.lastTime = now;
    
    update(dt);
    render();
    
    requestAnimationFrame(gameLoop);
}

init();
