/* -------------------------------------------------------------------------- */
/* DATA & STATE                                                               */
/* -------------------------------------------------------------------------- */
const AppState = {
    tasks: [],
    syllabus: { '11': {}, '12': {} },
    activityLog: [],
    user: { xp: 0, level: 1, streak: 0, lastLogin: null },
    settings: { sound: true, alarm: true, strict: false, lowgfx: false },
    avatar: 'drone',
    // Gamification Data
    coins: 100,
    inventory: ['room-default'],
    equipped: { room: 'room-default' },
    missions: { date: null, daily: [] },
    dailyIntent: { text: '', mood: 'normal', date: null }
};

const NCERT_DATA = {
    "11": {
        "Physics": ["Physical World", "Units & Measurements", "Motion in a Straight Line", "Motion in a Plane", "Laws of Motion", "Work, Energy & Power", "Gravitation", "Solids", "Fluids", "Thermodynamics", "Waves"],
        "Chemistry": ["Basic Concepts", "Structure of Atom", "Periodicity", "Bonding", "Thermodynamics", "Equilibrium", "Redox Reactions", "Hydrocarbons"],
        "Maths": ["Sets", "Relations & Functions", "Trigonometry", "Complex Numbers", "Linear Inequalities", "Permutations", "Binomial Theorem", "Sequence & Series", "Straight Lines", "Conic Sections", "Limits"],
        "Biology": ["Living World", "Biological Classification", "Plant Kingdom", "Animal Kingdom", "Cell Cycle", "Photosynthesis", "Respiration", "Plant Growth"],
        "CS": ["Computer Overview", "Data Representation", "Boolean Algebra", "Logic Gates", "C++ Basics", "Arrays", "Functions"]
    },
    "12": {
        "Physics": ["Electric Charges", "Current Electricity", "Magnetism", "EMI", "AC", "EM Waves", "Ray Optics", "Wave Optics", "Atoms", "Nuclei", "Semiconductors"],
        "Chemistry": ["Solutions", "Electrochemistry", "Chemical Kinetics", "d & f Block", "Coordination Compounds", "Haloalkanes", "Aldehydes", "Amines", "Biomolecules"],
        "Maths": ["Relations & Functions", "Inverse Trig", "Matrices", "Determinants", "Integrals", "Differential Equations", "Vectors", "3D Geometry", "Probability"],
        "Biology": ["Reproduction", "Sexual Reproduction", "Human Reproduction", "Genetics", "Evolution", "Human Health", "Biotech", "Ecology"],
        "CS": ["OOP Concepts", "Classes & Objects", "Constructors", "Inheritance", "Pointers", "Data Structures", "SQL", "Networking"]
    }
};

const SHOP_ITEMS = [
    { id: 'room-default', name: 'Nexus Core', type: 'room', price: 0, icon: 'fa-cube' },
    { id: 'room-library', name: 'Ancient Library', type: 'room', price: 500, icon: 'fa-book' },
    { id: 'room-cyber', name: 'Cyber Grid', type: 'room', price: 800, icon: 'fa-border-all' },
    { id: 'room-rain', name: 'Midnight Rain', type: 'room', price: 1000, icon: 'fa-cloud-showers-heavy' },
    { id: 'deco-plant', name: 'Holo Plant', type: 'decoration', price: 200, icon: 'fa-leaf' }
];

/* -------------------------------------------------------------------------- */
/* AUDIO ENGINE                                                               */
/* -------------------------------------------------------------------------- */
const AudioEngine = {
    ctx: null,
    ambienceNode: null,

    init() {
        if(!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        if(this.ctx.state === 'suspended') this.ctx.resume();
    },

    playTone(freq, type, duration, vol=0.1) {
        if (!AppState.settings.sound || !this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
        gain.gain.setValueAtTime(vol, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();
        osc.stop(this.ctx.currentTime + duration);
    },

    setAmbience(type) {
        this.init();
        if(this.ambienceNode) { this.ambienceNode.stop(); this.ambienceNode = null; }
        if(type === 'none') return;

        const bufferSize = 2 * this.ctx.sampleRate;
        const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const output = noiseBuffer.getChannelData(0);

        for (let i = 0; i < bufferSize; i++) {
            let white = Math.random() * 2 - 1;
            if(type === 'white') output[i] = white * 0.05;
            else if (type === 'pink') output[i] = (white + (output[i-1] || 0)) * 0.05; 
            else output[i] = (white + (output[i-1] || 0)) / 0.02; 
        }

        const noise = this.ctx.createBufferSource();
        noise.buffer = noiseBuffer;
        noise.loop = true;
        const gain = this.ctx.createGain();
        gain.gain.value = 0.1;
        noise.connect(gain);
        gain.connect(this.ctx.destination);
        noise.start();
        this.ambienceNode = noise;
        mentorSay(`Playing ${type} noise.`);
    },

    click() { this.playTone(1000, 'sine', 0.05, 0.05); },
    success() { this.playTone(400, 'sine', 0.1); setTimeout(()=>this.playTone(600,'sine',0.2),100); },
    alarm() { if(AppState.settings.alarm) { for(let i=0;i<4;i++) setTimeout(()=>this.playTone(800,'square',0.1,0.2), i*300); } }
};

document.addEventListener('click', (e) => {
    AudioEngine.init();
    if(e.target.matches('button, input, select, a, li, input[type="checkbox"]')) AudioEngine.click();
});

/* -------------------------------------------------------------------------- */
/* INITIALIZATION & LOGIC                                                     */
/* -------------------------------------------------------------------------- */
document.addEventListener('DOMContentLoaded', () => {
    loadData();
    initUI();
    initParticles();
    EnergyRing.init();
    init3DParallax(); 
    
    // Settings Listeners
    document.getElementById('setting-sound').addEventListener('change', (e) => { AppState.settings.sound = e.target.checked; saveData(); });
    document.getElementById('setting-alarm').addEventListener('change', (e) => { AppState.settings.alarm = e.target.checked; saveData(); });
    document.getElementById('setting-strict').addEventListener('change', (e) => { AppState.settings.strict = e.target.checked; saveData(); });
    
    // Initial Load Extras
    updateCoinDisplay();
    setAvatar(AppState.avatar || 'drone');
    applyRoom(AppState.equipped.room);
    checkDailyReset();
    
    // Notifications
    if ("Notification" in window && Notification.permission !== "granted") {
        try { Notification.requestPermission(); } catch(e){}
    }
});

function loadData() {
    const saved = localStorage.getItem('nexusData_FINAL');
    if (saved) {
        const parsed = JSON.parse(saved);
        Object.assign(AppState, parsed);
        if(!AppState.inventory) AppState.inventory = ['room-default'];
        if(!AppState.equipped) AppState.equipped = { room: 'room-default' };
        if(!AppState.missions) AppState.missions = { date: null, daily: [] };
        if(!AppState.dailyIntent) AppState.dailyIntent = { text: '', mood: 'normal', date: null };
    }
    
    document.getElementById('setting-sound').checked = AppState.settings.sound;
    document.getElementById('setting-alarm').checked = AppState.settings.alarm;
    document.getElementById('setting-strict').checked = AppState.settings.strict;
}

function saveData() {
    localStorage.setItem('nexusData_FINAL', JSON.stringify(AppState));
    updateStats();
}

function resetApp() {
    if(confirm("Factory Reset? All data will be lost.")) {
        localStorage.removeItem('nexusData_FINAL');
        location.reload();
    }
}

/* -------------------------------------------------------------------------- */
/* UI FUNCTIONS                                                               */
/* -------------------------------------------------------------------------- */
function initUI() {
    renderTasks();
    switchClass('11');
    renderTimeline();
    updateStats();
    
    // Nav Logic
    document.querySelectorAll('.nav-links li').forEach(item => {
        item.addEventListener('click', () => {
            document.querySelectorAll('.nav-links li').forEach(l => l.classList.remove('active'));
            item.classList.add('active');
            
            document.querySelectorAll('.view').forEach(v => v.classList.remove('active-view'));
            const tab = item.getAttribute('data-tab');
            document.getElementById(tab).classList.add('active-view');
            
            if(tab === 'analytics') renderCharts();
            if(tab === 'shop') filterShop('room');
            if(tab === 'missions') renderMissions();
        });
    });
}

function updateStats() {
    document.getElementById('streak-count').innerText = AppState.user.streak;
    document.getElementById('stat-tasks').innerText = AppState.tasks.filter(t => !t.completed).length;
    
    let done = 0;
    Object.values(AppState.syllabus).forEach(cls => Object.values(cls).forEach(sub => done += sub.length));
    document.getElementById('stat-chapters').innerText = done;
    
    document.getElementById('xp-text').innerText = `${AppState.user.xp} XP`;
    const pct = Math.min((AppState.user.xp / (AppState.user.level * 500)) * 100, 100);
    document.getElementById('xp-progress').style.width = `${pct}%`;
    document.getElementById('user-title').innerText = `Lvl ${AppState.user.level} Scholar`;
    
    if(AppState.dailyIntent.text) {
        document.getElementById('daily-intent-display').innerText = `Goal: ${AppState.dailyIntent.text}`;
    }
}

/* -------------------------------------------------------------------------- */
/* 3D PARALLAX EFFECT                                                         */
/* -------------------------------------------------------------------------- */
function init3DParallax() {
    const focusContainer = document.querySelector('.focus-layout');
    const timerCard = document.querySelector('.timer-visual');

    if (!focusContainer || !timerCard) return;

    // MOBILE FIX: Ensure touch doesn't break this logic
    focusContainer.addEventListener('mousemove', (e) => {
        if (AppState.settings.lowgfx) return;

        const rect = focusContainer.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        const xPct = (x / rect.width) - 0.5;
        const yPct = (y / rect.height) - 0.5;
        
        const rotateY = xPct * 20; 
        const rotateX = yPct * -20; 

        timerCard.style.transform = `rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;
    });

    focusContainer.addEventListener('mouseleave', () => {
        timerCard.style.transform = `rotateX(0deg) rotateY(0deg)`;
    });
}

/* -------------------------------------------------------------------------- */
/* SYLLABUS & TASKS                                                           */
/* -------------------------------------------------------------------------- */
window.switchClass = (cls) => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(`btn-${cls}`).classList.add('active');
    
    const container = document.getElementById('syllabus-container');
    container.innerHTML = '';
    let total = 0, done = 0;

    for (const [sub, chapters] of Object.entries(NCERT_DATA[cls])) {
        const completed = AppState.syllabus[cls][sub] || [];
        total += chapters.length;
        done += completed.length;
        
        const chapHtml = chapters.map(chap => `
            <div class="chapter-row">
                <input type="checkbox" ${completed.includes(chap)?'checked':''} onchange="toggleChapter('${cls}','${sub}','${chap}')">
                <span style="${completed.includes(chap)?'color:var(--neon-cyan)':''}">${chap}</span>
            </div>
        `).join('');

        container.innerHTML += `<div class="glass subject-group"><h3 style="color:var(--primary);margin-bottom:10px">${sub}</h3>${chapHtml}</div>`;
    }
    document.getElementById('syllabus-percent').innerText = total === 0 ? "0%" : `${Math.round((done / total) * 100)}%`;
};

window.toggleChapter = (cls, sub, chap) => {
    if (!AppState.syllabus[cls][sub]) AppState.syllabus[cls][sub] = [];
    const list = AppState.syllabus[cls][sub];
    
    if (list.includes(chap)) {
        list.splice(list.indexOf(chap), 1);
    } else {
        list.push(chap);
        gainXP(50);
        addCoins(10);
        AudioEngine.success();
        confetti({ particleCount: 30, spread: 50 });
        logActivity(`Studied: ${chap} (${sub})`);
    }
    saveData();
    switchClass(cls);
};

document.getElementById('add-task-btn').addEventListener('click', () => {
    const input = document.getElementById('task-input');
    const subject = document.getElementById('task-subject').value;
    if (!input.value) return;
    
    AppState.tasks.push({ id: Date.now(), title: input.value, subject, completed: false });
    logActivity(`Task Added: ${input.value}`);
    input.value = '';
    saveData();
    renderTasks();
});

function renderTasks() {
    const list = document.getElementById('tasks-list');
    list.innerHTML = AppState.tasks.length ? '' : '<div style="color:#666; text-align:center; padding:20px;">No active tasks.</div>';
    
    AppState.tasks.sort((a,b) => a.completed - b.completed).forEach(task => {
        list.innerHTML += `
            <div class="task-card ${task.completed ? 'completed' : ''}">
                <div><h4>${task.title}</h4><small style="color:#818cf8">${task.subject}</small></div>
                <button onclick="completeTask(${task.id})" style="background:none; border:none; color:var(--neon-cyan); cursor:pointer;">
                    ${task.completed ? '<i class="fa-solid fa-check-circle fa-xl"></i>' : '<i class="fa-regular fa-circle fa-xl"></i>'}
                </button>
            </div>`;
    });
}

window.completeTask = (id) => {
    const task = AppState.tasks.find(t => t.id === id);
    if(task && !task.completed) {
        task.completed = true;
        AudioEngine.success();
        confetti({ particleCount: 50, spread: 60, origin: { y: 0.7 } });
        gainXP(20);
        addCoins(5);
        logActivity(`Task Done: ${task.title}`);
        checkMissions('task');
    } else if (task) {
        task.completed = false;
    }
    saveData();
    renderTasks();
};

/* -------------------------------------------------------------------------- */
/* TIMER, ENERGY RING & FOCUS GUARD                                           */
/* -------------------------------------------------------------------------- */
const EnergyRing = {
    canvas: null, ctx: null, progress: 1,
    init() {
        this.canvas = document.getElementById('timer-canvas');
        this.ctx = this.canvas.getContext('2d');
        // MOBILE FIX: Ensure canvas scaling matches CSS
        this.animate();
    },
    animate() {
        const ctx = this.ctx;
        const w = this.canvas.width, h = this.canvas.height;
        ctx.clearRect(0,0,w,h);
        
        ctx.beginPath();
        ctx.arc(w/2, h/2, 130, 0, Math.PI*2);
        ctx.strokeStyle = "rgba(255,255,255,0.05)";
        ctx.lineWidth = 15;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(w/2, h/2, 130, -Math.PI/2, (-Math.PI/2) + (Math.PI*2 * this.progress));
        ctx.strokeStyle = "#22d3ee";
        ctx.lineWidth = 15;
        ctx.lineCap = "round";
        ctx.shadowBlur = 20;
        ctx.shadowColor = "#22d3ee";
        ctx.stroke();
        ctx.shadowBlur = 0;

        requestAnimationFrame(() => this.animate());
    },
    update(pct) { this.progress = pct; }
};

let timerInterval = null, timeLeft = 1500, idleTimer = null;

document.getElementById('start-timer').addEventListener('click', () => {
    if(timerInterval) return;
    document.getElementById('timer-status').innerText = "FOCUS CORE ACTIVE";
    mentorSay("Deep focus mode engaged.");
    document.querySelector('.sidebar').style.opacity = '0.3';
    
    document.addEventListener('mousemove', resetIdle);
    document.addEventListener('keypress', resetIdle);
    // MOBILE FIX: Add touch events for idle reset
    document.addEventListener('touchstart', resetIdle);
    resetIdle();

    timerInterval = setInterval(() => {
        timeLeft--;
        updateTimerDisplay();
        if(timeLeft <= 0) {
            clearInterval(timerInterval);
            timerInterval = null;
            document.getElementById('timer-status').innerText = "SESSION COMPLETE";
            document.querySelector('.sidebar').style.opacity = '1';
            AudioEngine.alarm();
            AudioEngine.setAmbience('none');
            gainXP(100);
            addCoins(30);
            logActivity("Focus Session (25m)");
            checkMissions('focus');
            document.removeEventListener('mousemove', resetIdle);
            document.removeEventListener('touchstart', resetIdle);
        }
    }, 1000);
});

document.getElementById('pause-timer').addEventListener('click', () => {
    clearInterval(timerInterval);
    timerInterval = null;
    document.getElementById('timer-status').innerText = "PAUSED";
    document.querySelector('.sidebar').style.opacity = '1';
});

document.getElementById('reset-timer').addEventListener('click', () => {
    clearInterval(timerInterval);
    timerInterval = null;
    timeLeft = 1500;
    updateTimerDisplay();
    document.getElementById('timer-status').innerText = "SESSION READY";
    document.querySelector('.sidebar').style.opacity = '1';
    AudioEngine.setAmbience('none');
    document.getElementById('ambience-select').value = 'none';
});

function updateTimerDisplay() {
    const m = Math.floor(timeLeft / 60).toString().padStart(2, '0');
    const s = (timeLeft % 60).toString().padStart(2, '0');
    document.getElementById('timer-display').innerText = `${m}:${s}`;
    EnergyRing.update(timeLeft / 1500);
}

function resetIdle() {
    clearTimeout(idleTimer);
    if(timerInterval) {
        idleTimer = setTimeout(() => {
            mentorSay("Focus drifting? I detect inactivity.");
            AudioEngine.click();
        }, 120000); 
    }
}

/* -------------------------------------------------------------------------- */
/* GAMIFICATION & SHOP                                                        */
/* -------------------------------------------------------------------------- */
function updateCoinDisplay() {
    document.querySelectorAll('#user-coins, #user-coins-display').forEach(el => el.innerText = AppState.coins);
}

function addCoins(amount) {
    AppState.coins += amount;
    updateCoinDisplay();
}

window.filterShop = (type) => {
    document.querySelectorAll('.shop-tabs .tab-btn').forEach(b => b.classList.remove('active'));
    event.target.classList.add('active');
    renderShop(type);
}

function renderShop(type) {
    const grid = document.getElementById('shop-grid');
    grid.innerHTML = '';
    SHOP_ITEMS.filter(i => i.type === type).forEach(item => {
        const owned = AppState.inventory.includes(item.id);
        const equipped = AppState.equipped[item.type] === item.id;
        
        let btnHTML;
        if (equipped) btnHTML = `<button class="shop-btn btn-equipped">Active</button>`;
        else if (owned) btnHTML = `<button class="shop-btn btn-equip" onclick="equipItem('${item.id}', '${item.type}')">Equip</button>`;
        else btnHTML = `<button class="shop-btn btn-buy" onclick="buyItem('${item.id}', ${item.price})">Buy ${item.price}</button>`;
        
        grid.innerHTML += `
            <div class="shop-card">
                <i class="fa-solid ${item.icon} shop-icon"></i>
                <b>${item.name}</b>
                ${!owned ? `<span class="shop-price">${item.price}</span>` : ''}
                ${btnHTML}
            </div>`;
    });
}

window.buyItem = (id, price) => {
    if (AppState.coins >= price) {
        AppState.coins -= price;
        AppState.inventory.push(id);
        AudioEngine.success();
        saveData();
        renderShop(SHOP_ITEMS.find(i => i.id === id).type);
        updateCoinDisplay();
    } else mentorSay("Insufficient coins.");
}

window.equipItem = (id, type) => {
    AppState.equipped[type] = id;
    if(type === 'room') applyRoom(id);
    saveData();
    renderShop(type);
    mentorSay("Equipped!");
}

function applyRoom(id) {
    document.body.className = id; 
}

/* -------------------------------------------------------------------------- */
/* MISSIONS                                                                   */
/* -------------------------------------------------------------------------- */
function checkDailyReset() {
    const today = new Date().toDateString();
    if (AppState.missions.date !== today) {
        AppState.missions.date = today;
        AppState.missions.daily = [
            { id: 1, title: 'Complete 1 Focus Session', reward: 50, completed: false, type: 'focus' },
            { id: 2, title: 'Finish 2 Tasks', reward: 40, completed: false, type: 'task' },
            { id: 3, title: 'Log in', reward: 10, completed: true, type: 'login' }
        ];
        AppState.dailyIntent = { text: '', mood: 'normal', date: today };
        saveData();
        showDailyModal();
    }
}

function renderMissions() {
    const list = document.getElementById('daily-missions-list');
    list.innerHTML = '';
    AppState.missions.daily.forEach(m => {
        list.innerHTML += `
            <div class="mission-card ${m.completed ? 'completed' : ''}">
                <span>${m.title}</span>
                <span class="mission-reward">+${m.reward}</span>
            </div>`;
    });
}

function checkMissions(type) {
    AppState.missions.daily.forEach(m => {
        if(!m.completed && m.type === type) {
            m.completed = true;
            addCoins(m.reward);
            mentorSay(`Mission Complete: ${m.title}`);
        }
    });
    saveData();
    if(document.getElementById('missions').classList.contains('active-view')) renderMissions();
}

/* -------------------------------------------------------------------------- */
/* MODALS & EXTRAS                                                            */
/* -------------------------------------------------------------------------- */
function showDailyModal() {
    document.getElementById('modal-overlay').classList.add('active');
    document.getElementById('modal-daily').style.display = 'flex';
    document.getElementById('modal-breath').style.display = 'none';
    
    const weakSub = Object.keys(AppState.syllabus['12'])[Math.floor(Math.random()*5)];
    document.getElementById('ai-suggestion-text').innerText = `Focus on ${weakSub} today. Consistency is key.`;
}

window.closeModal = () => document.getElementById('modal-overlay').classList.remove('active');

window.selectMood = (mood) => {
    AppState.dailyIntent.mood = mood;
    document.querySelectorAll('.mood-btn').forEach(b => b.classList.remove('active'));
    event.target.classList.add('active');
};

window.setDailyIntent = () => {
    AppState.dailyIntent.text = document.getElementById('daily-goal-input').value;
    saveData();
    updateStats();
    closeModal();
    mentorSay("Goal locked in. Let's begin.");
};

window.triggerBreathing = () => {
    document.getElementById('modal-overlay').classList.add('active');
    document.getElementById('modal-daily').style.display = 'none';
    document.getElementById('modal-breath').style.display = 'flex';
    const text = document.getElementById('breath-text');
    let isIn = true;
    setInterval(() => {
        if(document.getElementById('modal-overlay').classList.contains('active')) {
            text.innerText = isIn ? "Hold..." : "Exhale...";
            isIn = !isIn;
        }
    }, 4000);
};

window.setAvatar = (type) => {
    AppState.avatar = type;
    saveData();
    document.querySelectorAll('.avatar-wrapper').forEach(el => el.classList.remove('active'));
    document.getElementById(`avatar-${type}`).classList.add('active');
    document.querySelectorAll('.av-btn').forEach(btn => btn.classList.remove('active'));
    if(type==='drone') document.querySelectorAll('.av-btn')[0].classList.add('active');
    else if(type==='orb') document.querySelectorAll('.av-btn')[1].classList.add('active');
    else document.querySelectorAll('.av-btn')[2].classList.add('active');
    mentorSay(`Avatar changed to ${type.toUpperCase()}.`);
};

function mentorSay(msg) {
    const bubble = document.getElementById('mentor-bubble');
    bubble.innerText = msg;
    bubble.style.opacity = 1;
    setTimeout(() => bubble.style.opacity = 0, 4000);
}

function gainXP(amount) {
    AppState.user.xp += amount;
    if (AppState.user.xp >= AppState.user.level * 500) {
        AppState.user.level++;
        AppState.user.xp = 0;
        alert(`LEVEL UP! You are now Level ${AppState.user.level}`);
        confetti({ particleCount: 200, spread: 100 });
    }
    saveData();
    updateStats();
}

function logActivity(text) {
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    AppState.activityLog.unshift({ time, text });
    if(AppState.activityLog.length > 20) AppState.activityLog.pop();
    renderTimeline();
    saveData();
}

function renderTimeline() {
    const container = document.getElementById('activity-log');
    container.innerHTML = AppState.activityLog.map((log, index) => `
        <div class="timeline-item" style="animation-delay: ${index * 0.1}s">
            <div class="time-stamp">${log.time}</div>
            <div>${log.text}</div>
        </div>
    `).join('');
}

function initParticles() {
    const canvas = document.getElementById('particles');
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    let particles = [];
    for(let i=0; i<50; i++) particles.push({ x: Math.random()*canvas.width, y: Math.random()*canvas.height, r: Math.random()*2, d: Math.random() });
    function draw() {
        ctx.clearRect(0,0,canvas.width,canvas.height);
        ctx.fillStyle = "rgba(255,255,255,0.1)";
        ctx.beginPath();
        particles.forEach(p => {
            ctx.moveTo(p.x, p.y);
            ctx.arc(p.x, p.y, p.r, 0, Math.PI*2);
            p.y -= 0.2;
            if(p.y < 0) p.y = canvas.height;
        });
        ctx.fill();
        requestAnimationFrame(draw);
    }
    draw();
}

window.openSetTab = (tabName) => {
    document.querySelectorAll('.set-content').forEach(c => c.classList.remove('active'));
    document.querySelectorAll('.set-tab').forEach(b => b.classList.remove('active'));
    document.getElementById(`set-${tabName}`).classList.add('active');
    event.target.classList.add('active');
};

// ANALYTICS UI IMPROVEMENT: Improved render function for clearer charts
function renderCharts() {
    const d1 = AppState.syllabus['11'], d2 = AppState.syllabus['12'];
    const subjects = ['Physics', 'Chemistry', 'Maths', 'Biology', 'CS'];
    const counts = subjects.map(sub => (d1[sub]?.length || 0) + (d2[sub]?.length || 0));

    // Calculate total progress
    let totalChapters = 0;
    let completedChapters = 0;
    subjects.forEach(sub => {
        totalChapters += (NCERT_DATA['11'][sub]?.length || 0) + (NCERT_DATA['12'][sub]?.length || 0);
    });
    completedChapters = counts.reduce((a,b)=>a+b, 0);
    const remainingChapters = totalChapters - completedChapters;

    // Destroy existing charts to prevent duplication
    if(window.masteryChartInstance) window.masteryChartInstance.destroy();
    if(window.progressChartInstance) window.progressChartInstance.destroy();

    // Chart 1: Subject Progress (Bar Chart)
    const ctx1 = document.getElementById('masteryChart').getContext('2d');
    window.masteryChartInstance = new Chart(ctx1, {
        type: 'bar',
        data: {
            labels: subjects,
            datasets: [{
                label: 'Chapters Finished',
                data: counts,
                backgroundColor: [
                    'rgba(255, 99, 132, 0.7)',
                    'rgba(54, 162, 235, 0.7)',
                    'rgba(255, 206, 86, 0.7)',
                    'rgba(75, 192, 192, 0.7)',
                    'rgba(153, 102, 255, 0.7)'
                ],
                borderColor: 'rgba(255, 255, 255, 0.1)',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.1)' } },
                x: { grid: { display: false } }
            },
            plugins: {
                legend: { display: false }
            }
        }
    });

    // Chart 2: Overall Progress (Doughnut)
    const ctx2 = document.getElementById('progressChart').getContext('2d');
    window.progressChartInstance = new Chart(ctx2, {
        type: 'doughnut',
        data: {
            labels: ['Completed', 'Remaining'],
            datasets: [{
                data: [completedChapters, remainingChapters],
                backgroundColor: ['#4ade80', 'rgba(255,255,255,0.1)'],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '70%',
            plugins: {
                legend: { position: 'bottom', labels: { color: '#fff' } }
            }
        }
    });
}

// FIX: Generate Report Functionality
window.generateDailyReport = () => {
    if (AppState.activityLog.length === 0) {
        mentorSay("No activity to report yet.");
        return;
    }

    const date = new Date().toLocaleDateString();
    let content = `NEXUS STUDY REPORT - ${date}\n----------------------------\n`;
    content += `XP Gained: ${AppState.user.xp}\n`;
    content += `Streak: ${AppState.user.streak}\n`;
    content += `Coins: ${AppState.coins}\n\nACTIVITY LOG:\n`;
    
    AppState.activityLog.forEach(log => {
        content += `[${log.time}] ${log.text}\n`;
    });

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Nexus_Report_${date.replace(/\//g, '-')}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    mentorSay("Report downloaded.");
};