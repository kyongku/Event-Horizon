const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

canvas.width = 1200;
canvas.height = 800;

// === 튜닝 파라미터 ===
const PARAMS = {
    GM: 180000,
    softening: 80,
    r_s: 80,
    thrustForce: 300,
    scoreScale: 100,
    multMax: 50,
    baseRate: 15,
    heatRate: 0.35,
    coolRate: 0.2,
    nearMissWindow: 30,
    nearMissBonus: 3.0,
    shakeScale: 500,
    maxShake: 15,
    eps: 0.1,
    
    starSpawnRate: 0.1,
    maxStars: 400,
    starSpawnMin: 800,
    starSpawnMax: 1000,
    starInitialSpeedMin: 60,
    starInitialSpeedMax: 100,
    starTangentRatio: 0.8,
    playerRadius: 12,
    starCollisionRadius: 3,
    
    starBodySpawnInterval: 6000,   // 6초로 더 빠르게
    starBodyProbability: 1.0,      // 100% 확률 (항상 생성)
    starBodyMaxCount: 2,
    starBodyRadius: 20,            // 크기 증가
    starBodyMass: 3000,            // 질량 증가
    starBodySoftening: 300,        // 소프트닝 감소 (중력 강화)
    GStar: 8000,                   // 중력 상수 증가
    starBodyGravityRange: 300,     // 항성 중력 범위
    
    screenMargin: 150
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
    isRunning: false,
    starSpawnTimer: 0,
    
    joystick: {
        active: false,
        startX: 0,
        startY: 0,
        currentX: 0,
        currentY: 0,
        dirX: 0,
        dirY: 0
    }
};

const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || 
                 (window.matchMedia && window.matchMedia("(max-width: 768px)").matches);

function init() {
    gameState.bestScore = parseFloat(localStorage.getItem('eventHorizonBest')) || 0;
    gameState.lastTime = performance.now();
    gameState.lastStarBodySpawn = performance.now() - PARAMS.starBodySpawnInterval; // 즉시 생성 가능
    
    setupMobileControls();
    resetRound();
    updateUI();
    gameState.isRunning = true;
    requestAnimationFrame(gameLoop);
}

function setupMobileControls() {
    if (!isMobile) return;
    
    const joystickBase = document.getElementById('joystick-base');
    const joystickStick = document.getElementById('joystick-stick');
    const escapeBtn = document.getElementById('mobile-escape');
    
    joystickBase.addEventListener('touchstart', (e) => {
        e.preventDefault();
        const touch = e.touches[0];
        const rect = joystickBase.getBoundingClientRect();
        gameState.joystick.active = true;
        gameState.joystick.startX = rect.left + rect.width / 2;
        gameState.joystick.startY = rect.top + rect.height / 2;
    });
    
    joystickBase.addEventListener('touchmove', (e) => {
        e.preventDefault();
        if (!gameState.joystick.active) return;
        
        const touch = e.touches[0];
        const deltaX = touch.clientX - gameState.joystick.startX;
        const deltaY = touch.clientY - gameState.joystick.startY;
        
        const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
        const maxDistance = 35;
        
        if (distance > maxDistance) {
            const angle = Math.atan2(deltaY, deltaX);
            gameState.joystick.currentX = Math.cos(angle) * maxDistance;
            gameState.joystick.currentY = Math.sin(angle) * maxDistance;
        } else {
            gameState.joystick.currentX = deltaX;
            gameState.joystick.currentY = deltaY;
        }
        
        gameState.joystick.dirX = gameState.joystick.currentX / maxDistance;
        gameState.joystick.dirY = gameState.joystick.currentY / maxDistance;
        
        joystickStick.style.transform = 
            `translate(calc(-50% + ${gameState.joystick.currentX}px), calc(-50% + ${gameState.joystick.currentY}px))`;
    });
    
    const endJoystick = () => {
        gameState.joystick.active = false;
        gameState.joystick.currentX = 0;
        gameState.joystick.currentY = 0;
        gameState.joystick.dirX = 0;
        gameState.joystick.dirY = 0;
        joystickStick.style.transform = 'translate(-50%, -50%)';
    };
    
    joystickBase.addEventListener('touchend', endJoystick);
    joystickBase.addEventListener('touchcancel', endJoystick);
    
    escapeBtn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        escapeRound();
    });
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
    gameState.stars = [];
    gameState.starBodies = [];
    gameState.starSpawnTimer = 0;
    document.getElementById('status').textContent = '';
}

function isOutOfBounds(x, y) {
    return x < -PARAMS.screenMargin || 
           x > canvas.width + PARAMS.screenMargin || 
           y < -PARAMS.screenMargin || 
           y > canvas.height + PARAMS.screenMargin;
}

function spawnStar() {
    const angle = Math.random() * Math.PI * 2;
    const dist = PARAMS.starSpawnMin + Math.random() * (PARAMS.starSpawnMax - PARAMS.starSpawnMin);
    const x = gameState.center.x + Math.cos(angle) * dist;
    const y = gameState.center.y + Math.sin(angle) * dist;
    
    const orbitalSpeed = Math.sqrt(PARAMS.GM / dist) * 0.7;
    const tangentAngle = angle + Math.PI / 2;
    const radialSpeed = -10 - Math.random() * 20;
    
    gameState.stars.push({
        x: x,
        y: y,
        vx: Math.cos(tangentAngle) * orbitalSpeed + Math.cos(angle) * radialSpeed,
        vy: Math.sin(tangentAngle) * orbitalSpeed + Math.sin(angle) * radialSpeed,
        size: 1 + Math.random() * 1.5,
        brightness: 0.7 + Math.random() * 0.3
    });
}

function trySpawnStarBody(now) {
    if (now - gameState.lastStarBodySpawn < PARAMS.starBodySpawnInterval) return;
    if (gameState.starBodies.length >= PARAMS.starBodyMaxCount) return;
    
    const angle = Math.random() * Math.PI * 2;
    const dist = PARAMS.starSpawnMax + 150;
    const x = gameState.center.x + Math.cos(angle) * dist;
    const y = gameState.center.y + Math.sin(angle) * dist;
    
    // 블랙홀 방향 계산
    const towardCenterX = gameState.center.x - x;
    const towardCenterY = gameState.center.y - y;
    const distToCenter = Math.sqrt(towardCenterX * towardCenterX + towardCenterY * towardCenterY);
    
    // 궤도 속도 + 블랙홀로 향하는 속도
    const orbitalSpeed = Math.sqrt(PARAMS.GM / distToCenter) * 0.5;
    const tangentAngle = angle + Math.PI / 2;
    const radialSpeed = 40; // 블랙홀로 향하는 속도
    
    const colors = ['#ffaa00', '#ff6600', '#ff9933', '#ffcc66'];
    
    gameState.starBodies.push({
        x: x,
        y: y,
        vx: Math.cos(tangentAngle) * orbitalSpeed + (towardCenterX / distToCenter) * radialSpeed,
        vy: Math.sin(tangentAngle) * orbitalSpeed + (towardCenterY / distToCenter) * radialSpeed,
        radius: PARAMS.starBodyRadius,
        mass: PARAMS.starBodyMass,
        softening: PARAMS.starBodySoftening,
        color: colors[Math.floor(Math.random() * colors.length)],
        glow: 0
    });
    
    gameState.lastStarBodySpawn = now;
    console.log('✨ 항성 생성됨! 위치:', Math.floor(x), Math.floor(y));
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
    
    gameState.starSpawnTimer += dt;
    if (gameState.starSpawnTimer >= PARAMS.starSpawnRate) {
        if (gameState.stars.length < PARAMS.maxStars) {
            spawnStar();
        }
        gameState.starSpawnTimer = 0;
    }
    
    const dx = c.x - p.x;
    const dy = c.y - p.y;
    const r = Math.sqrt(dx * dx + dy * dy);
    
    if (isOutOfBounds(p.x, p.y)) {
        document.getElementById('status').textContent = '화면 밖으로 이탈!';
        gameState.isRunning = false;
        setTimeout(() => {
            gameState.isRunning = true;
            resetRound();
        }, 1000);
        return;
    }
    
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
    
    // 항성 중력 (플레이어에게)
    gameState.starBodies.forEach(sb => {
        if (!isOutOfBounds(sb.x, sb.y)) {
            const sbdx = sb.x - p.x;
            const sbdy = sb.y - p.y;
            const sbr = Math.sqrt(sbdx * sbdx + sbdy * sbdy);
            if (sbr > PARAMS.eps && sbr < PARAMS.starBodyGravityRange) {
                const sbGravMag = (PARAMS.GStar * sb.mass * 0.15) / (sbr * sbr + sb.softening);
                gravX += (sbdx / sbr) * sbGravMag;
                gravY += (sbdy / sbr) * sbGravMag;
            }
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
        
        if (gameState.joystick.active) {
            thrustX += gameState.joystick.dirX * PARAMS.thrustForce;
            thrustY += gameState.joystick.dirY * PARAMS.thrustForce;
            if (Math.abs(gameState.joystick.dirX) > 0.1 || Math.abs(gameState.joystick.dirY) > 0.1) {
                thrusting = true;
            }
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
        
        if (isOutOfBounds(star.x, star.y)) {
            gameState.stars.splice(i, 1);
            continue;
        }
        
        const sdx = c.x - star.x;
        const sdy = c.y - star.y;
        const sr = Math.sqrt(sdx * sdx + sdy * sdy);
        
        if (sr <= PARAMS.r_s) {
            gameState.stars.splice(i, 1);
            continue;
        }
        
        let sGravX = 0;
        let sGravY = 0;
        
        // 블랙홀 중력
        if (sr > PARAMS.eps) {
            const sGravMag = PARAMS.GM / (sr * sr + PARAMS.softening);
            sGravX = (sdx / sr) * sGravMag;
            sGravY = (sdy / sr) * sGravMag;
        }
        
        // 항성 중력 (별을 항성 쪽으로 끌어당김)
        gameState.starBodies.forEach(sb => {
            if (!isOutOfBounds(sb.x, sb.y)) {
                const sbdx = sb.x - star.x;
                const sbdy = sb.y - star.y;
                const sbr = Math.sqrt(sbdx * sbdx + sbdy * sbdy);
                if (sbr > PARAMS.eps && sbr < PARAMS.starBodyGravityRange) {
                    const sbGravMag = (PARAMS.GStar * sb.mass * 0.25) / (sbr * sbr + sb.softening);
                    sGravX += (sbdx / sbr) * sbGravMag;
                    sGravY += (sbdy / sbr) * sbGravMag;
                }
            }
        });
        
        star.vx += sGravX * dt;
        star.vy += sGravY * dt;
        star.x += star.vx * dt;
        star.y += star.vy * dt;
        
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
        
        if (isOutOfBounds(sb.x, sb.y)) {
            gameState.starBodies.splice(i, 1);
            console.log('항성 화면 밖으로 제거');
            continue;
        }
        
        const sbdx = c.x - sb.x;
        const sbdy = c.y - sb.y;
        const sbr = Math.sqrt(sbdx * sbdx + sbdy * sbdy);
        
        if (sbr <= PARAMS.r_s) {
            gameState.starBodies.splice(i, 1);
            console.log('항성 블랙홀에 흡수됨');
            continue;
        }
        
        // 항성은 블랙홀 중력만 받음 (블랙홀로 향함)
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
    
    // 화면 경계 표시
    ctx.strokeStyle = 'rgba(255, 0, 0, 0.3)';
    ctx.lineWidth = 3;
    ctx.setLineDash([10, 10]);
    ctx.strokeRect(0, 0, canvas.width, canvas.height);
    ctx.setLineDash([]);
    
    // 별 렌더링
    gameState.stars.forEach(star => {
        ctx.fillStyle = `rgba(200, 220, 255, ${star.brightness})`;
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
        ctx.fill();
    });
    
    // 항성 렌더링 (더 눈에 띄게)
    gameState.starBodies.forEach(sb => {
        // 큰 외부 글로우
        const glowSize = sb.radius + 20 + Math.sin(sb.glow) * 8;
        const gradient = ctx.createRadialGradient(sb.x, sb.y, 0, sb.x, sb.y, glowSize);
        gradient.addColorStop(0, sb.color);
        gradient.addColorStop(0.4, sb.color + 'AA');
        gradient.addColorStop(0.7, sb.color + '44');
        gradient.addColorStop(1, 'transparent');
        
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(sb.x, sb.y, glowSize, 0, Math.PI * 2);
        ctx.fill();
        
        // 중간 글로우
        ctx.fillStyle = sb.color + 'DD';
        ctx.beginPath();
        ctx.arc(sb.x, sb.y, sb.radius + 5, 0, Math.PI * 2);
        ctx.fill();
        
        // 항성 본체
        ctx.fillStyle = sb.color;
        ctx.beginPath();
        ctx.arc(sb.x, sb.y, sb.radius, 0, Math.PI * 2);
        ctx.fill();
        
        // 중심 하이라이트
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(sb.x, sb.y, sb.radius * 0.5, 0, Math.PI * 2);
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
    
    ctx.strokeStyle = '#f00';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(c.x, c.y, PARAMS.r_s, 0, Math.PI * 2);
    ctx.stroke();
    
    // UFO
    ctx.save();
    ctx.translate(p.x, p.y);
    
    const ufoGradient = ctx.createRadialGradient(0, 0, 0, 0, 0, PARAMS.playerRadius);
    ufoGradient.addColorStop(0, '#0ff');
    ufoGradient.addColorStop(0.7, '#088');
    ufoGradient.addColorStop(1, '#044');
    ctx.fillStyle = ufoGradient;
    ctx.beginPath();
    ctx.arc(0, 0, PARAMS.playerRadius, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.strokeStyle = '#0ff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, PARAMS.playerRadius, 0, Math.PI * 2);
    ctx.stroke();
    
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(0, 0, PARAMS.playerRadius * 0.4, 0, Math.PI * 2);
    ctx.fill();
    
    // 추력 분사
    if (gameState.heat < 1.0) {
        const isThrusting = gameState.keys['w'] || gameState.keys['s'] || 
                           gameState.keys['a'] || gameState.keys['d'] ||
                           gameState.keys['arrowup'] || gameState.keys['arrowdown'] ||
                           gameState.keys['arrowleft'] || gameState.keys['arrowright'] ||
                           gameState.joystick.active;
        
        if (isThrusting) {
            ctx.fillStyle = '#f80';
            
            let thrustDirX = 0;
            let thrustDirY = 0;
            
            if (gameState.joystick.active) {
                thrustDirX = -gameState.joystick.dirX;
                thrustDirY = -gameState.joystick.dirY;
            } else {
                if (gameState.keys['w'] || gameState.keys['arrowup']) thrustDirY = 1;
                if (gameState.keys['s'] || gameState.keys['arrowdown']) thrustDirY = -1;
                if (gameState.keys['a'] || gameState.keys['arrowleft']) thrustDirX = 1;
                if (gameState.keys['d'] || gameState.keys['arrowright']) thrustDirX = -1;
            }
            
            const angle = Math.atan2(thrustDirY, thrustDirX);
            const flameX = Math.cos(angle) * PARAMS.playerRadius;
            const flameY = Math.sin(angle) * PARAMS.playerRadius;
            
            ctx.beginPath();
            ctx.moveTo(flameX - 4, flameY);
            ctx.lineTo(flameX + Math.cos(angle) * 12, flameY + Math.sin(angle) * 12);
            ctx.lineTo(flameX + 4, flameY);
            ctx.closePath();
            ctx.fill();
        }
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
