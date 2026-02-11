const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

canvas.width = 1200;
canvas.height = 800;

// === 튜닝 파라미터 ===
const PARAMS = {
    GM: 50000,
    softening: 100,
    r_s: 80,
    thrustForce: 200,
    scoreScale: 100,
    multMax: 50,
    baseRate: 10,
    heatRate: 0.4,
    coolRate: 0.15,
    nearMissWindow: 30,
    nearMissBonus: 3.0,
    shakeScale: 500,
    maxShake: 15,
    eps: 0.1,
    
    starCount: 80,              // 별 개수 줄임
    starSpawnMin: 500,          // 생성 범위 조정
    starSpawnMax: 700,
    starInitialSpeedMin: 40,    // 초기 속도 조정
    starInitialSpeedMax: 70,
    starTangentRatio: 0.8,      // 공전 느낌을 위해 접선 속도 증가
    playerRadius: 10,
    starCollisionRadius: 3,
    
    starBodySpawnInterval: 12000,  // 항성 생성 간격 늘림
    starBodyProbability: 0.5,      // 생성 확률 낮춤
    starBodyMaxCount: 1,           // 최대 1개만
    starBodyRadius: 18,
    starBodyMass: 3000,            // 질량 감소
    starBodySoftening: 300,        // 소프트닝 증가 (중력 약화)
    GStar: 8000                    // 중력 상수 약화
};

let gameState = {
    center: { x: canvas.width / 2, y: canvas.height / 2 },
    player: { x: 0, y: 0, vx: 0, vy: 0 },
    score: 0,
    bestScore: 0,
    heat: 0,
    nearMissActivated: false,
    shake: { x: 0, y: 0 },
    stars: [],
    starBodies: [],
    keys: {},
    lastTime: 0,
    lastStarBodySpawn: 0,
    isRunning: false
};

function init() {
    gameState.bestScore = parseFloat(localStorage.getItem('eventHorizonBest')) || 0;
    gameState.lastTime = performance.now();
    gameState.lastStarBodySpawn = performance.now();
    resetRound();
    updateUI();
    spawnStars();
    gameState.isRunning = true;
    requestAnimationFrame(gameLoop);
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

function spawnStars() {
    gameState.stars = [];
    for (let i = 0; i < PARAMS.starCount; i++) {
        spawnStar();
    }
}

function spawnStar() {
    const angle = Math.random() * Math.PI * 2;
    const dist = PARAMS.starSpawnMin + Math.random() * (PARAMS.starSpawnMax - PARAMS.starSpawnMin);
    const x = gameState.center.x + Math.cos(angle) * dist;
    const y = gameState.center.y + Math.sin(angle) * dist;
    
    // 궤도 속도 계산 (공전하면서 빨려들어가는 느낌)
    const orbitalSpeed = Math.sqrt(PARAMS.GM / dist) * 0.7; // 약간 느리게
    const tangentAngle = angle + Math.PI / 2;
    
    // 안쪽으로 약간 당기는 radial 속도
    const radialSpeed = -10 - Math.random() * 15;
    
    gameState.stars.push({
        x: x,
        y: y,
        vx: Math.cos(tangentAngle) * orbitalSpeed + Math.cos(angle) * radialSpeed,
        vy: Math.sin(tangentAngle) * orbitalSpeed + Math.sin(angle) * radialSpeed,
        size: 1 + Math.random() * 1.5,
        brightness: 0.7 + Math.random() * 0.3  // 고정 밝기
    });
}

function trySpawnStarBody(now) {
    if (now - gameState.lastStarBodySpawn < PARAMS.starBodySpawnInterval) return;
    if (gameState.starBodies.length >= PARAMS.starBodyMaxCount) return;
    if (Math.random() > PARAMS.starBodyProbability) return;
    
    const angle = Math.random() * Math.PI * 2;
    const dist = PARAMS.starSpawnMax + 100;
    const x = gameState.center.x + Math.cos(angle) * dist;
    const y = gameState.center.y + Math.sin(angle) * dist;
    
    // 항성도 공전 궤도
    const orbitalSpeed = Math.sqrt(PARAMS.GM / dist) * 0.6;
    const tangentAngle = angle + Math.PI / 2;
    
    const colors = ['#ffaa00', '#ff6600', '#ff9933', '#ffcc66'];
    
    gameState.starBodies.push({
        x: x,
        y: y,
        vx: Math.cos(tangentAngle) * orbitalSpeed,
        vy: Math.sin(tangentAngle) * orbitalSpeed,
        radius: PARAMS.starBodyRadius,
        mass: PARAMS.starBodyMass,
        softening: PARAMS.starBodySoftening,
        color: colors[Math.floor(Math.random() * colors.length)],
        glow: 0
    });
    
    gameState.lastStarBodySpawn = now;
}

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

function update(dt) {
    if (!gameState.isRunning) return;
    
    const p = gameState.player;
    const c = gameState.center;
    
    const dx = c.x - p.x;
    const dy = c.y - p.y;
    const r = Math.sqrt(dx * dx + dy * dy);
    
    if (r <= PARAMS.r_s) {
        document.getElementById('status').textContent = '흡수됨! 점수 손실';
        gameState.isRunning = false;
        setTimeout(() => {
            gameState.isRunning = true;
            resetRound();
        }, 1000);
        return;
    }
    
    if (r <= PARAMS.r_s + PARAMS.nearMissWindow) {
        gameState.nearMissActivated = true;
    }
    
    const gravMag = PARAMS.GM / (r * r + PARAMS.softening);
    let gravX = (dx / r) * gravMag;
    let gravY = (dy / r) * gravMag;
    
    // 항성 중력 영향 (플레이어에게만, 약하게)
    gameState.starBodies.forEach(sb => {
        const sbdx = sb.x - p.x;
        const sbdy = sb.y - p.y;
        const sbr = Math.sqrt(sbdx * sbdx + sbdy * sbdy);
        if (sbr > PARAMS.eps) {
            const sbGravMag = (PARAMS.GStar * sb.mass) / (sbr * sbr + sb.softening);
            gravX += (sbdx / sbr) * sbGravMag;
            gravY += (sbdy / sbr) * sbGravMag;
        }
    });
    
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
    
    if (thrusting) {
        gameState.heat += PARAMS.heatRate * dt;
    } else {
        gameState.heat -= PARAMS.coolRate * dt;
    }
    gameState.heat = Math.max(0, Math.min(1, gameState.heat));
    
    p.vx += (gravX + thrustX) * dt;
    p.vy += (gravY + thrustY) * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    
    const d = Math.max(r - PARAMS.r_s, PARAMS.eps);
    const multiplier = Math.min(PARAMS.scoreScale / d, PARAMS.multMax);
    gameState.score += PARAMS.baseRate * multiplier * dt;
    
    const shakeIntensity = Math.min(PARAMS.shakeScale / (r - PARAMS.r_s + PARAMS.eps), PARAMS.maxShake);
    gameState.shake.x = (Math.random() - 0.5) * shakeIntensity;
    gameState.shake.y = (Math.random() - 0.5) * shakeIntensity;
    
    // 별 업데이트
    for (let i = gameState.stars.length - 1; i >= 0; i--) {
        const star = gameState.stars[i];
        
        const sdx = c.x - star.x;
        const sdy = c.y - star.y;
        const sr = Math.sqrt(sdx * sdx + sdy * sdy);
        
        // 블랙홀에 닿으면 소멸
        if (sr <= PARAMS.r_s) {
            gameState.stars.splice(i, 1);
            spawnStar();
            continue;
        }
        
        let sGravX = 0;
        let sGravY = 0;
        
        if (sr > PARAMS.eps) {
            const sGravMag = PARAMS.GM / (sr * sr + PARAMS.softening);
            sGravX = (sdx / sr) * sGravMag;
            sGravY = (sdy / sr) * sGravMag;
        }
        
        // 항성 중력 영향 (별에게만, 약하게 - 궤도만 살짝 휘도록)
        gameState.starBodies.forEach(sb => {
            const sbdx = sb.x - star.x;
            const sbdy = sb.y - star.y;
            const sbr = Math.sqrt(sbdx * sbdx + sbdy * sbdy);
            if (sbr > PARAMS.eps && sbr < 300) { // 가까울 때만 영향
                const sbGravMag = (PARAMS.GStar * sb.mass * 0.3) / (sbr * sbr + sb.softening); // 더 약하게
                sGravX += (sbdx / sbr) * sbGravMag;
                sGravY += (sbdy / sbr) * sbGravMag;
            }
        });
        
        star.vx += sGravX * dt;
        star.vy += sGravY * dt;
        star.x += star.vx * dt;
        star.y += star.vy * dt;
        
        // 플레이어 충돌 체크
        const pdx = p.x - star.x;
        const pdy = p.y - star.y;
        const pDist = Math.sqrt(pdx * pdx + pdy * pdy);
        if (pDist < PARAMS.playerRadius + PARAMS.starCollisionRadius) {
            document.getElementById('status').textContent = '⭐ 별 충돌!';
            gameState.isRunning = false;
            setTimeout(() => {
                gameState.isRunning = true;
                resetRound();
            }, 800);
            return;
        }
    }
    
    // 항성 업데이트
    for (let i = gameState.starBodies.length - 1; i >= 0; i--) {
        const sb = gameState.starBodies[i];
        
        const sbdx = c.x - sb.x;
        const sbdy = c.y - sb.y;
        const sbr = Math.sqrt(sbdx * sbdx + sbdy * sbdy);
        
        // 블랙홀에 닿으면 소멸
        if (sbr <= PARAMS.r_s) {
            gameState.starBodies.splice(i, 1);
            continue;
        }
        
        if (sbr > PARAMS.eps) {
            const sbGravMag = PARAMS.GM / (sbr * sbr + PARAMS.softening);
            sb.vx += (sbdx / sbr) * sbGravMag * dt;
            sb.vy += (sbdy / sbr) * sbGravMag * dt;
        }
        
        sb.x += sb.vx * dt;
        sb.y += sb.vy * dt;
        sb.glow = (sb.glow + dt * 3) % (Math.PI * 2);
    }
    
    updateUI();
}

function render() {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    ctx.save();
    ctx.translate(gameState.shake.x, gameState.shake.y);
    
    const c = gameState.center;
    const p = gameState.player;
    
    // 작은 별들 (깜빡임 없음)
    gameState.stars.forEach(star => {
        ctx.fillStyle = `rgba(200, 220, 255, ${star.brightness})`;
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
        ctx.fill();
    });
    
    // 항성들
    gameState.starBodies.forEach(sb => {
        const glowSize = sb.radius + 10 + Math.sin(sb.glow) * 5;
        const gradient = ctx.createRadialGradient(sb.x, sb.y, 0, sb.x, sb.y, glowSize);
        gradient.addColorStop(0, sb.color);
        gradient.addColorStop(0.5, sb.color + '88');
        gradient.addColorStop(1, 'transparent');
        
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(sb.x, sb.y, glowSize, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.fillStyle = sb.color;
        ctx.beginPath();
        ctx.arc(sb.x, sb.y, sb.radius, 0, Math.PI * 2);
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

function gameLoop() {
    const now = performance.now();
    let dt = (now - gameState.lastTime) / 1000;
    dt = Math.min(dt, 0.05);
    gameState.lastTime = now;
    
    trySpawnStarBody(now);
    update(dt);
    render();
    
    requestAnimationFrame(gameLoop);
}

init();
