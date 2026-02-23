/**
 * 哄睡神器 — Baby Sleep App
 * Web Audio API based sound engine + lullaby synthesizer
 */

// =============================================
// Audio Context & State
// =============================================

let audioCtx = null;
let masterGain = null;
let isPlaying = false;

// Active noise sources
const activeSources = {};
// Source individual gains
const sourceGains = {};

// Lullaby state
let currentLullaby = null;
let lullabyTimeouts = [];
let lullabyLoopInterval = null;

// Timer state
let timerMinutes = 0;
let timerEndTime = null;
let timerInterval = null;

// Night light state
let nightBrightness = 30;
let nightColorTemp = 'warm';

// =============================================
// Initialize Audio Context (must be after user gesture)
// =============================================

function initAudioContext() {
    if (audioCtx) return;
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = 0.9;
    masterGain.connect(audioCtx.destination);
}

// =============================================
// Noise Generators
// =============================================

function createNoiseBuffer(type, durationSec = 4) {
    const sampleRate = audioCtx.sampleRate;
    const length = sampleRate * durationSec;
    const buffer = audioCtx.createBuffer(2, length, sampleRate);

    for (let channel = 0; channel < 2; channel++) {
        const data = buffer.getChannelData(channel);

        if (type === 'white') {
            for (let i = 0; i < length; i++) {
                data[i] = Math.random() * 2 - 1;
            }
        } else if (type === 'pink') {
            let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
            for (let i = 0; i < length; i++) {
                const white = Math.random() * 2 - 1;
                b0 = 0.99886 * b0 + white * 0.0555179;
                b1 = 0.99332 * b1 + white * 0.0750759;
                b2 = 0.96900 * b2 + white * 0.1538520;
                b3 = 0.86650 * b3 + white * 0.3104856;
                b4 = 0.55000 * b4 + white * 0.5329522;
                b5 = -0.7616 * b5 - white * 0.0168980;
                data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
                b6 = white * 0.115926;
            }
        } else if (type === 'brown') {
            let lastOut = 0;
            for (let i = 0; i < length; i++) {
                const white = Math.random() * 2 - 1;
                data[i] = (lastOut + 0.02 * white) / 1.02;
                lastOut = data[i];
                data[i] *= 3.5;
            }
        }
    }
    return buffer;
}

// Volume normalization multipliers — tuned so all sounds have similar perceived loudness
const VOLUME_NORMALIZE = {
    white: 0.35,
    pink: 0.65,
    brown: 0.45,
    rain: 0.70,
    ocean: 0.85,
    heartbeat: 0.90,
};

function startNoise(type) {
    if (activeSources[type]) return;

    // Per-source user volume
    const gain = audioCtx.createGain();
    const volumeSlider = document.querySelector(`.mini-volume[data-sound="${type}"]`);
    const userVol = volumeSlider ? volumeSlider.value / 100 : 0.5;
    // Apply normalization
    const norm = VOLUME_NORMALIZE[type] || 0.3;
    gain.gain.value = userVol * norm;
    gain.connect(masterGain);
    sourceGains[type] = gain;

    if (type === 'rain') {
        startRainSound(gain);
    } else if (type === 'ocean') {
        startOceanSound(gain);
    } else if (type === 'heartbeat') {
        startHeartbeatSound(gain);
    } else {
        // White / Pink / Brown noise
        const buffer = createNoiseBuffer(type);
        const source = audioCtx.createBufferSource();
        source.buffer = buffer;
        source.loop = true;

        // Low-pass filter for softer sound
        const filter = audioCtx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = type === 'brown' ? 800 : type === 'pink' ? 4000 : 8000;

        source.connect(filter);
        filter.connect(gain);
        source.start();
        activeSources[type] = { source, filter, gain };
    }
}

function stopNoise(type) {
    const active = activeSources[type];
    if (!active) return;

    if (active.source) {
        try { active.source.stop(); } catch (e) { }
    }
    if (active.sources) {
        active.sources.forEach(s => { try { s.stop(); } catch (e) { } });
    }
    if (active.oscillators) {
        active.oscillators.forEach(o => { try { o.stop(); } catch (e) { } });
    }
    if (active.intervalId) {
        clearInterval(active.intervalId);
    }
    if (active.gain) {
        active.gain.disconnect();
    }

    delete activeSources[type];
    delete sourceGains[type];
}

// =============================================
// Nature Sound Generators
// =============================================

function startRainSound(masterNode) {
    // Rain = filtered white noise + occasional drip oscillations
    const buffer = createNoiseBuffer('white', 4);
    const source = audioCtx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;

    // Band-pass to simulate rain
    const bp = audioCtx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 2500;
    bp.Q.value = 0.5;

    // High shelf to add sizzle
    const hs = audioCtx.createBiquadFilter();
    hs.type = 'highshelf';
    hs.frequency.value = 5000;
    hs.gain.value = -6;

    const rainGain = audioCtx.createGain();
    rainGain.gain.value = 1.0;

    source.connect(bp);
    bp.connect(hs);
    hs.connect(rainGain);
    rainGain.connect(masterNode);
    source.start();

    // Sub-bass rumble for thunder
    const thunderBuf = createNoiseBuffer('brown', 4);
    const thunderSrc = audioCtx.createBufferSource();
    thunderSrc.buffer = thunderBuf;
    thunderSrc.loop = true;
    const thunderGain = audioCtx.createGain();
    thunderGain.gain.value = 0.25;
    const thunderLP = audioCtx.createBiquadFilter();
    thunderLP.type = 'lowpass';
    thunderLP.frequency.value = 200;
    thunderSrc.connect(thunderLP);
    thunderLP.connect(thunderGain);
    thunderGain.connect(masterNode);
    thunderSrc.start();

    activeSources['rain'] = {
        sources: [source, thunderSrc],
        gain: masterNode
    };
}

function startOceanSound(masterNode) {
    // Ocean = modulated brown noise with LFO
    const buffer = createNoiseBuffer('brown', 6);
    const source = audioCtx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;

    const lp = audioCtx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 600;

    // LFO for wave amplitude
    const lfo = audioCtx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 0.12; // slow wave
    const lfoGain = audioCtx.createGain();
    lfoGain.gain.value = 0.4;

    const waveGain = audioCtx.createGain();
    waveGain.gain.value = 1.0;

    lfo.connect(lfoGain);
    lfoGain.connect(waveGain.gain);

    source.connect(lp);
    lp.connect(waveGain);
    waveGain.connect(masterNode);

    source.start();
    lfo.start();

    // Add higher freq hiss for foam
    const foamBuf = createNoiseBuffer('white', 4);
    const foamSrc = audioCtx.createBufferSource();
    foamSrc.buffer = foamBuf;
    foamSrc.loop = true;
    const foamBP = audioCtx.createBiquadFilter();
    foamBP.type = 'bandpass';
    foamBP.frequency.value = 3000;
    foamBP.Q.value = 0.3;
    const foamGain = audioCtx.createGain();
    foamGain.gain.value = 0.08;

    const foamLfo = audioCtx.createOscillator();
    foamLfo.type = 'sine';
    foamLfo.frequency.value = 0.12;
    const foamLfoGain = audioCtx.createGain();
    foamLfoGain.gain.value = 0.06;
    foamLfo.connect(foamLfoGain);
    foamLfoGain.connect(foamGain.gain);

    foamSrc.connect(foamBP);
    foamBP.connect(foamGain);
    foamGain.connect(masterNode);
    foamSrc.start();
    foamLfo.start();

    activeSources['ocean'] = {
        sources: [source, foamSrc],
        oscillators: [lfo, foamLfo],
        gain: masterNode
    };
}

function startHeartbeatSound(masterNode) {
    // Heartbeat = periodic low-freq oscillator bursts
    const heartGain = audioCtx.createGain();
    heartGain.gain.value = 0;
    heartGain.connect(masterNode);

    const osc = audioCtx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 55;
    const osc2 = audioCtx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.value = 45;
    const subGain = audioCtx.createGain();
    subGain.gain.value = 0.5;

    osc.connect(heartGain);
    osc2.connect(subGain);
    subGain.connect(heartGain);
    osc.start();
    osc2.start();

    // Double-thump pattern
    function beat() {
        const now = audioCtx.currentTime;
        // lub
        heartGain.gain.cancelScheduledValues(now);
        heartGain.gain.setValueAtTime(0, now);
        heartGain.gain.linearRampToValueAtTime(1.0, now + 0.03);
        heartGain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        // dub
        heartGain.gain.setValueAtTime(0, now + 0.18);
        heartGain.gain.linearRampToValueAtTime(0.7, now + 0.21);
        heartGain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    }

    beat();
    const intervalId = setInterval(beat, 800); // ~75 bpm

    activeSources['heartbeat'] = {
        oscillators: [osc, osc2],
        gain: masterNode,
        intervalId
    };
}

// =============================================
// Lullaby Synthesizer
// =============================================

// Note frequencies (octave 4)
const NOTES = {
    'C4': 261.63, 'D4': 293.66, 'E4': 329.63, 'F4': 349.23,
    'G4': 392.00, 'A4': 440.00, 'B4': 493.88,
    'C5': 523.25, 'D5': 587.33, 'E5': 659.25, 'F5': 698.46, 'G5': 783.99,
    'C3': 130.81, 'E3': 164.81, 'F3': 174.61, 'G3': 196.00, 'A3': 220.00, 'B3': 246.94,
    'Bb3': 233.08, 'Bb4': 466.16, 'Eb4': 311.13, 'Ab4': 415.30,
    'F#4': 369.99, 'REST': 0
};

// Lullaby melodies: [note, duration_in_beats]
const LULLABIES = {
    twinkle: {
        name: '小星星',
        bpm: 90,
        notes: [
            ['C4', 1], ['C4', 1], ['G4', 1], ['G4', 1], ['A4', 1], ['A4', 1], ['G4', 2],
            ['F4', 1], ['F4', 1], ['E4', 1], ['E4', 1], ['D4', 1], ['D4', 1], ['C4', 2],
            ['G4', 1], ['G4', 1], ['F4', 1], ['F4', 1], ['E4', 1], ['E4', 1], ['D4', 2],
            ['G4', 1], ['G4', 1], ['F4', 1], ['F4', 1], ['E4', 1], ['E4', 1], ['D4', 2],
            ['C4', 1], ['C4', 1], ['G4', 1], ['G4', 1], ['A4', 1], ['A4', 1], ['G4', 2],
            ['F4', 1], ['F4', 1], ['E4', 1], ['E4', 1], ['D4', 1], ['D4', 1], ['C4', 2],
        ]
    },
    brahms: {
        name: '勃拉姆斯摇篮曲',
        bpm: 72,
        notes: [
            ['E4', 1], ['E4', 0.5], ['E4', 1.5], ['E4', 1], ['G4', 0.5], ['G4', 1.5],
            ['E4', 1], ['E4', 0.5], ['E4', 1.5], ['E4', 1], ['G4', 0.5], ['G4', 1.5],
            ['E4', 1], ['G4', 1], ['C5', 1], ['B4', 2], ['A4', 1],
            ['F4', 1], ['A4', 1], ['B4', 0.5], ['A4', 0.5], ['F4', 1], ['A4', 0.5], ['G4', 1.5],
            ['E4', 1], ['E4', 0.5], ['E4', 1], ['F4', 0.5], ['D4', 1.5],
            ['E4', 1], ['F4', 0.5], ['E4', 0.5], ['C4', 1], ['E4', 0.5], ['D4', 1.5],
            ['C4', 1], ['E4', 1], ['G4', 0.5], ['E4', 0.5], ['C5', 1], ['B4', 0.5], ['A4', 1.5],
            ['F4', 1], ['A4', 0.5], ['G4', 0.5], ['F4', 1], ['E4', 0.5], ['D4', 1.5],
            ['C4', 3],
        ]
    },
    mozzart: {
        name: '莫扎特摇篮曲',
        bpm: 80,
        notes: [
            ['E4', 1], ['E4', 1], ['F4', 0.5], ['E4', 0.5], ['D4', 1], ['C4', 1],
            ['C4', 1], ['D4', 1], ['E4', 1], ['D4', 1.5], ['REST', 0.5],
            ['E4', 1], ['E4', 1], ['F4', 0.5], ['E4', 0.5], ['D4', 1], ['C4', 1],
            ['C4', 1], ['D4', 1], ['E4', 1], ['C4', 1.5], ['REST', 0.5],
            ['G4', 1], ['G4', 1], ['A4', 0.5], ['G4', 0.5], ['F4', 1], ['E4', 1],
            ['E4', 1], ['F4', 1], ['G4', 1], ['F4', 1.5], ['REST', 0.5],
            ['E4', 1], ['E4', 1], ['F4', 0.5], ['E4', 0.5], ['D4', 1], ['C4', 1],
            ['C4', 1], ['D4', 1], ['E4', 1], ['C4', 1.5], ['REST', 0.5],
        ]
    }
};

let lullabyGain = null;

function playLullaby(name) {
    stopLullaby();

    const song = LULLABIES[name];
    if (!song) return;

    currentLullaby = name;

    lullabyGain = audioCtx.createGain();
    const volSlider = document.querySelector(`.lullaby-volume[data-lullaby="${name}"]`);
    lullabyGain.gain.value = (volSlider ? volSlider.value / 100 : 0.7) * 0.85;
    lullabyGain.connect(masterGain);

    function playOnce() {
        const beatDuration = 60 / song.bpm;
        let time = audioCtx.currentTime + 0.05;

        song.notes.forEach(([note, beats]) => {
            if (note === 'REST' || !NOTES[note]) {
                time += beatDuration * beats;
                return;
            }

            const freq = NOTES[note];
            const duration = beatDuration * beats;

            // Main tone (soft sine)
            const osc = audioCtx.createOscillator();
            osc.type = 'sine';
            osc.frequency.value = freq;

            const noteGain = audioCtx.createGain();
            noteGain.gain.setValueAtTime(0, time);
            noteGain.gain.linearRampToValueAtTime(0.5, time + 0.04);
            noteGain.gain.setValueAtTime(0.5, time + duration * 0.7);
            noteGain.gain.exponentialRampToValueAtTime(0.001, time + duration * 0.98);

            // Slight chorus effect with detuned oscillator
            const osc2 = audioCtx.createOscillator();
            osc2.type = 'sine';
            osc2.frequency.value = freq;
            osc2.detune.value = 5;

            const noteGain2 = audioCtx.createGain();
            noteGain2.gain.setValueAtTime(0, time);
            noteGain2.gain.linearRampToValueAtTime(0.15, time + 0.04);
            noteGain2.gain.exponentialRampToValueAtTime(0.001, time + duration * 0.98);

            osc.connect(noteGain);
            noteGain.connect(lullabyGain);
            osc2.connect(noteGain2);
            noteGain2.connect(lullabyGain);

            osc.start(time);
            osc.stop(time + duration);
            osc2.start(time);
            osc2.stop(time + duration);

            time += duration;
        });

        return time - audioCtx.currentTime;
    }

    const totalDuration = playOnce();

    // Loop
    lullabyLoopInterval = setInterval(() => {
        if (currentLullaby === name) {
            playOnce();
        } else {
            clearInterval(lullabyLoopInterval);
        }
    }, totalDuration * 1000);
}

function stopLullaby() {
    currentLullaby = null;
    if (lullabyLoopInterval) {
        clearInterval(lullabyLoopInterval);
        lullabyLoopInterval = null;
    }
    if (lullabyGain) {
        // Capture reference before nulling — otherwise the setTimeout
        // will disconnect the NEW song's gain node when switching tracks
        const oldGain = lullabyGain;
        oldGain.gain.linearRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);
        setTimeout(() => {
            try { oldGain.disconnect(); } catch (e) { }
        }, 500);
        lullabyGain = null;
    }
    lullabyTimeouts.forEach(t => clearTimeout(t));
    lullabyTimeouts = [];
}

// =============================================
// Play / Pause All
// =============================================

function playAll() {
    initAudioContext();
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
    isPlaying = true;
    updatePlayPauseUI();
}

function pauseAll() {
    isPlaying = false;
    // Fade out master
    if (masterGain) {
        masterGain.gain.linearRampToValueAtTime(0.001, audioCtx.currentTime + 0.5);
    }
    setTimeout(() => {
        // Stop all sources
        Object.keys(activeSources).forEach(type => stopNoise(type));
        stopLullaby();
        // Reset master
        if (masterGain) {
            const vol = document.getElementById('masterVolume').value / 100;
            masterGain.gain.setValueAtTime(vol, audioCtx.currentTime);
        }
        // Deactivate all cards
        document.querySelectorAll('.sound-card.active').forEach(c => c.classList.remove('active'));
        document.querySelectorAll('.lullaby-card.active').forEach(c => c.classList.remove('active'));
        updatePlayPauseUI();
    }, 550);
}

function updatePlayPauseUI() {
    const playIcon = document.getElementById('playIcon');
    const pauseIcon = document.getElementById('pauseIcon');
    if (isPlaying) {
        // Check if anything is actually playing
        const hasActive = Object.keys(activeSources).length > 0 || currentLullaby;
        if (hasActive) {
            playIcon.classList.add('hidden');
            pauseIcon.classList.remove('hidden');
        } else {
            playIcon.classList.remove('hidden');
            pauseIcon.classList.add('hidden');
        }
    } else {
        playIcon.classList.remove('hidden');
        pauseIcon.classList.add('hidden');
    }
}

// =============================================
// Timer
// =============================================

function setTimer(minutes) {
    clearTimerInterval();
    timerMinutes = minutes;

    // Update option buttons
    document.querySelectorAll('.timer-option').forEach(btn => {
        btn.classList.toggle('active', parseInt(btn.dataset.minutes) === minutes);
    });

    const countdown = document.getElementById('timerCountdown');
    const timerBtn = document.getElementById('timerBtn');

    if (minutes === 0) {
        timerEndTime = null;
        countdown.classList.add('hidden');
        timerBtn.classList.remove('active');
        document.getElementById('timerLabel').textContent = '定时';
        return;
    }

    timerEndTime = Date.now() + minutes * 60 * 1000;
    countdown.classList.remove('hidden');
    timerBtn.classList.add('active');
    updateTimerDisplay();

    timerInterval = setInterval(() => {
        const remaining = timerEndTime - Date.now();
        if (remaining <= 0) {
            // Fade out and stop
            fadeOutAndStop();
            return;
        }
        // Start fading 30 seconds before end
        if (remaining <= 30000 && masterGain) {
            const fadeRatio = remaining / 30000;
            const targetVol = (document.getElementById('masterVolume').value / 100) * fadeRatio;
            masterGain.gain.linearRampToValueAtTime(Math.max(0.001, targetVol), audioCtx.currentTime + 1);
        }
        updateTimerDisplay();
    }, 1000);
}

function fadeOutAndStop() {
    clearTimerInterval();
    if (masterGain) {
        masterGain.gain.linearRampToValueAtTime(0.001, audioCtx.currentTime + 2);
    }
    setTimeout(() => {
        pauseAll();
        timerEndTime = null;
        timerMinutes = 0;
        document.getElementById('timerBtn').classList.remove('active');
        document.getElementById('timerLabel').textContent = '定时';
        document.getElementById('timerCountdown').classList.add('hidden');
        document.querySelectorAll('.timer-option').forEach(btn => {
            btn.classList.toggle('active', parseInt(btn.dataset.minutes) === 0);
        });
        // Reset master volume
        if (masterGain) {
            const vol = document.getElementById('masterVolume').value / 100;
            masterGain.gain.setValueAtTime(vol, audioCtx.currentTime);
        }
    }, 2500);
}

function clearTimerInterval() {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
}

function updateTimerDisplay() {
    if (!timerEndTime) return;
    const remaining = Math.max(0, timerEndTime - Date.now());
    const mins = Math.floor(remaining / 60000);
    const secs = Math.floor((remaining % 60000) / 1000);
    document.getElementById('countdownTime').textContent =
        `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    document.getElementById('timerLabel').textContent =
        `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

// =============================================
// Night Sky Canvas Animation
// =============================================

const canvas = document.getElementById('nightSky');
const ctx = canvas.getContext('2d');
let stars = [];
let shootingStars = [];
let animFrame = null;

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    initStars();
}

function initStars() {
    stars = [];
    const count = Math.floor((canvas.width * canvas.height) / 4000);
    for (let i = 0; i < count; i++) {
        stars.push({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height,
            r: Math.random() * 1.5 + 0.3,
            alpha: Math.random() * 0.8 + 0.2,
            twinkleSpeed: Math.random() * 0.02 + 0.005,
            twinklePhase: Math.random() * Math.PI * 2,
        });
    }
}

function spawnShootingStar() {
    if (Math.random() > 0.003) return; // rare
    shootingStars.push({
        x: Math.random() * canvas.width * 0.8,
        y: Math.random() * canvas.height * 0.3,
        length: Math.random() * 60 + 40,
        speed: Math.random() * 4 + 3,
        angle: Math.PI / 4 + Math.random() * 0.3,
        alpha: 1,
        life: 1,
    });
}

function drawNightSky(time) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw gradient background
    const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    grad.addColorStop(0, '#05071a');
    grad.addColorStop(0.4, '#0a0e27');
    grad.addColorStop(0.7, '#111640');
    grad.addColorStop(1, '#18164a');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw stars
    stars.forEach(star => {
        const twinkle = Math.sin(time * star.twinkleSpeed + star.twinklePhase) * 0.4 + 0.6;
        const alpha = star.alpha * twinkle * (nightBrightness / 100 * 0.7 + 0.3);
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(220, 220, 255, ${alpha})`;
        ctx.fill();

        // Subtle glow for bigger stars
        if (star.r > 1) {
            ctx.beginPath();
            ctx.arc(star.x, star.y, star.r * 3, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(200, 210, 255, ${alpha * 0.1})`;
            ctx.fill();
        }
    });

    // Draw shooting stars
    spawnShootingStar();
    shootingStars = shootingStars.filter(ss => {
        ss.x += Math.cos(ss.angle) * ss.speed;
        ss.y += Math.sin(ss.angle) * ss.speed;
        ss.life -= 0.015;
        ss.alpha = ss.life;

        if (ss.life <= 0) return false;

        const tailX = ss.x - Math.cos(ss.angle) * ss.length * ss.life;
        const tailY = ss.y - Math.sin(ss.angle) * ss.length * ss.life;

        const gradient = ctx.createLinearGradient(tailX, tailY, ss.x, ss.y);
        gradient.addColorStop(0, `rgba(255, 255, 255, 0)`);
        gradient.addColorStop(1, `rgba(255, 255, 255, ${ss.alpha * 0.8})`);

        ctx.beginPath();
        ctx.moveTo(tailX, tailY);
        ctx.lineTo(ss.x, ss.y);
        ctx.strokeStyle = gradient;
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Head glow
        ctx.beginPath();
        ctx.arc(ss.x, ss.y, 2, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${ss.alpha})`;
        ctx.fill();

        return true;
    });

    animFrame = requestAnimationFrame(drawNightSky);
}

// =============================================
// Night Light Color Temperature
// =============================================

const COLOR_TEMPS = {
    warm: { r: 255, g: 179, b: 71 },
    soft: { r: 177, g: 156, b: 217 },
    blue: { r: 135, g: 206, b: 235 },
    rose: { r: 244, g: 166, b: 176 },
};

function updateNightLightOverlay() {
    const c = COLOR_TEMPS[nightColorTemp];
    const overlay = document.getElementById('nightlightOverlay');
    const brightPct = nightBrightness / 100;

    if (overlay) {
        // Visible radial gradient with meaningful opacity range 0 → 0.6
        const innerOpacity = (brightPct * 0.6).toFixed(3);
        const midOpacity = (brightPct * 0.25).toFixed(3);
        overlay.style.opacity = brightPct > 0.02 ? '1' : '0';
        overlay.style.background = `
            radial-gradient(ellipse at 50% 20%,
                rgba(${c.r}, ${c.g}, ${c.b}, ${innerOpacity}) 0%,
                rgba(${c.r}, ${c.g}, ${c.b}, ${midOpacity}) 35%,
                transparent 70%
            )
        `;
    }

    // Also tint the body with a subtle edge vignette
    const edgeOpacity = (brightPct * 0.15).toFixed(3);
    document.body.style.boxShadow = `inset 0 0 300px rgba(${c.r}, ${c.g}, ${c.b}, ${edgeOpacity})`;

    // Update moon glow to match
    const moon = document.querySelector('.moon');
    if (moon) {
        const moonOpacity = brightPct;
        moon.style.boxShadow = `
            0 0 ${20 + nightBrightness * 0.8}px rgba(${c.r}, ${c.g}, ${c.b}, ${0.4 * moonOpacity}),
            0 0 ${60 + nightBrightness * 1.5}px rgba(${c.r}, ${c.g}, ${c.b}, ${0.2 * moonOpacity})
        `;
    }
}

// =============================================
// Clock
// =============================================

function updateClock() {
    const now = new Date();
    const h = String(now.getHours()).padStart(2, '0');
    const m = String(now.getMinutes()).padStart(2, '0');
    document.getElementById('clock').textContent = `${h}:${m}`;
}

// =============================================
// Load / Save Preferences
// =============================================

function savePreferences() {
    const prefs = {
        masterVolume: document.getElementById('masterVolume').value,
        brightness: nightBrightness,
        colorTemp: nightColorTemp,
        timerMinutes,
    };
    localStorage.setItem('babysleep_prefs', JSON.stringify(prefs));
}

function loadPreferences() {
    try {
        const raw = localStorage.getItem('babysleep_prefs');
        if (!raw) return;
        const prefs = JSON.parse(raw);
        if (prefs.masterVolume !== undefined) {
            document.getElementById('masterVolume').value = prefs.masterVolume;
            document.getElementById('volumeValue').textContent = prefs.masterVolume + '%';
        }
        if (prefs.brightness !== undefined) {
            nightBrightness = prefs.brightness;
            document.getElementById('brightnessSlider').value = prefs.brightness;
            document.getElementById('brightnessValue').textContent = prefs.brightness + '%';
        }
        if (prefs.colorTemp) {
            nightColorTemp = prefs.colorTemp;
            document.querySelectorAll('.color-temp-btn').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.temp === prefs.colorTemp);
            });
        }
    } catch (e) { }
}

// =============================================
// Event Listeners
// =============================================

document.addEventListener('DOMContentLoaded', () => {
    // Load prefs
    loadPreferences();

    // Init canvas
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    drawNightSky(0);

    // Clock
    updateClock();
    setInterval(updateClock, 10000);

    // Night light
    updateNightLightOverlay();

    // Sound cards
    document.querySelectorAll('.sound-card').forEach(card => {
        card.addEventListener('click', (e) => {
            // Don't toggle when interacting with range slider
            if (e.target.classList.contains('mini-volume')) return;

            initAudioContext();
            const type = card.dataset.sound;

            if (card.classList.contains('active')) {
                card.classList.remove('active');
                stopNoise(type);
            } else {
                card.classList.add('active');
                isPlaying = true;
                startNoise(type);
            }
            updatePlayPauseUI();
            savePreferences();
        });
    });

    // Mini volume sliders
    document.querySelectorAll('.mini-volume').forEach(slider => {
        slider.addEventListener('input', (e) => {
            e.stopPropagation();
            const type = slider.dataset.sound;
            const gain = sourceGains[type];
            if (gain) {
                const norm = VOLUME_NORMALIZE[type] || 0.3;
                gain.gain.linearRampToValueAtTime(
                    (slider.value / 100) * norm, audioCtx.currentTime + 0.05
                );
            }
        });

        // Prevent card toggle
        slider.addEventListener('click', e => e.stopPropagation());
    });

    // Lullaby cards
    document.querySelectorAll('.lullaby-card').forEach(card => {
        card.addEventListener('click', (e) => {
            // Don't toggle when interacting with the volume slider
            if (e.target.classList.contains('lullaby-volume')) return;

            initAudioContext();
            const name = card.dataset.lullaby;

            if (card.classList.contains('active')) {
                card.classList.remove('active');
                stopLullaby();
            } else {
                // Deactivate other lullabies
                document.querySelectorAll('.lullaby-card.active').forEach(c => c.classList.remove('active'));
                card.classList.add('active');
                isPlaying = true;
                playLullaby(name);
            }
            updatePlayPauseUI();
        });
    });

    // Lullaby volume sliders
    document.querySelectorAll('.lullaby-volume').forEach(slider => {
        slider.addEventListener('input', (e) => {
            e.stopPropagation();
            if (lullabyGain && currentLullaby === slider.dataset.lullaby) {
                lullabyGain.gain.linearRampToValueAtTime(
                    (slider.value / 100) * 0.85, audioCtx.currentTime + 0.05
                );
            }
        });
        slider.addEventListener('click', e => e.stopPropagation());
    });

    // Master volume
    const masterSlider = document.getElementById('masterVolume');
    masterSlider.addEventListener('input', () => {
        const val = masterSlider.value / 100;
        document.getElementById('volumeValue').textContent = masterSlider.value + '%';
        if (masterGain) {
            masterGain.gain.linearRampToValueAtTime(val, audioCtx.currentTime + 0.05);
        }
        // Update icon
        const icon = document.getElementById('volumeIcon');
        if (masterSlider.value == 0) icon.textContent = '🔇';
        else if (masterSlider.value < 40) icon.textContent = '🔉';
        else icon.textContent = '🔊';
        savePreferences();
    });

    // Play/Pause button
    document.getElementById('playPauseBtn').addEventListener('click', () => {
        initAudioContext();
        const hasActive = Object.keys(activeSources).length > 0 || currentLullaby;
        if (hasActive) {
            pauseAll();
        } else {
            // If nothing is active, start white noise as default
            playAll();
            const whiteCard = document.querySelector('.sound-card[data-sound="white"]');
            if (whiteCard && !whiteCard.classList.contains('active')) {
                whiteCard.classList.add('active');
                startNoise('white');
            }
            updatePlayPauseUI();
        }
    });

    // Brightness slider
    document.getElementById('brightnessSlider').addEventListener('input', (e) => {
        nightBrightness = parseInt(e.target.value);
        document.getElementById('brightnessValue').textContent = nightBrightness + '%';
        updateNightLightOverlay();
        savePreferences();
    });

    // Color temp buttons
    document.querySelectorAll('.color-temp-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.color-temp-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            nightColorTemp = btn.dataset.temp;
            updateNightLightOverlay();
            savePreferences();
        });
    });

    // Timer button
    document.getElementById('timerBtn').addEventListener('click', () => {
        document.getElementById('timerModal').classList.remove('hidden');
    });

    // Timer modal close
    document.getElementById('timerModalClose').addEventListener('click', () => {
        document.getElementById('timerModal').classList.add('hidden');
    });

    // Timer modal overlay click to close
    document.getElementById('timerModal').addEventListener('click', (e) => {
        if (e.target === document.getElementById('timerModal')) {
            document.getElementById('timerModal').classList.add('hidden');
        }
    });

    // Timer options
    document.querySelectorAll('.timer-option').forEach(opt => {
        opt.addEventListener('click', () => {
            setTimer(parseInt(opt.dataset.minutes));
            savePreferences();
        });
    });
});
