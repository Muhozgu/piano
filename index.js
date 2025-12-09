/******************************************************************
 * BASIC SETUP
 ******************************************************************/
const AudioContext = window.AudioContext || window.webkitAudioContext;
const audioCtx = new AudioContext();
const masterGain = audioCtx.createGain();
masterGain.connect(audioCtx.destination);
masterGain.gain.value = 0.5;

// UI elements
const pianoEl = document.getElementById("piano");
const recordBtn = document.getElementById("recordBtn");
const playbackBtn = document.getElementById("playbackBtn");
const clearBtn = document.getElementById("clearBtn");
const sustainCheckbox = document.getElementById("sustainCheckbox");
const volumeSlider = document.getElementById("volumeSlider");
const eventCount = document.getElementById("eventCount");

let isRecording = false;
let isSustain = false;
let recordedEvents = [];
let recordingStart = 0;

volumeSlider.oninput = () => {
  masterGain.gain.value = Number(volumeSlider.value);
};

/******************************************************************
 * NOTES
 ******************************************************************/
const NOTES = [
  { name: "C4",  freq: 261.63 },
  { name: "C#4", freq: 277.18, sharp: true },
  { name: "D4",  freq: 293.66 },
  { name: "D#4", freq: 311.13, sharp: true },
  { name: "E4",  freq: 329.63 },
  { name: "F4",  freq: 349.23 },
  { name: "F#4", freq: 369.99, sharp: true },
  { name: "G4",  freq: 392.00 },
  { name: "G#4", freq: 415.30, sharp: true },
  { name: "A4",  freq: 440.00 },
  { name: "A#4", freq: 466.16, sharp: true },
  { name: "B4",  freq: 493.88 },
  { name: "C5",  freq: 523.25 }
];

// map keyboard keys
const KEYBOARD_MAP = {
  a: "C4",
  w: "C#4",
  s: "D4",
  e: "D#4",
  d: "E4",
  f: "F4",
  t: "F#4",
  g: "G4",
  y: "G#4",
  h: "A4",
  u: "A#4",
  j: "B4",
  k: "C5"
};

/******************************************************************
 * AUDIO GENERATION (ADSR)
 ******************************************************************/
const ADSR = { attack: 0.01, decay: 0.2, sustain: 0.7, release: 0.3 };
const activeNotes = {};

function playNote(name, freq) {
  if (audioCtx.state === "suspended") audioCtx.resume();

  const osc = audioCtx.createOscillator();
  const gainNode = audioCtx.createGain();

  osc.type = "sine";
  osc.frequency.value = freq;

  const now = audioCtx.currentTime;
  gainNode.gain.setValueAtTime(0.001, now);
  gainNode.gain.linearRampToValueAtTime(1, now + ADSR.attack);
  gainNode.gain.linearRampToValueAtTime(ADSR.sustain, now + ADSR.attack + ADSR.decay);

  osc.connect(gainNode);
  gainNode.connect(masterGain);

  osc.start();

  if (!activeNotes[name]) activeNotes[name] = [];
  activeNotes[name].push({ osc, gainNode });

  if (isRecording) {
    recordedEvents.push({ type: "start", name, time: performance.now() - recordingStart });
    eventCount.textContent = `Events: ${recordedEvents.length}`;
  }
}

function stopNote(name) {
  if (!activeNotes[name]) return;

  if (isSustain) {
    activeNotes[name].forEach(n => (n.pending = true));
    if (isRecording) {
      recordedEvents.push({ type: "stop", name, time: performance.now() - recordingStart });
      eventCount.textContent = `Events: ${recordedEvents.length}`;
    }
    return;
  }

  const ac = audioCtx.currentTime;
  activeNotes[name].forEach(({ osc, gainNode }) => {
    gainNode.gain.cancelScheduledValues(ac);
    gainNode.gain.setValueAtTime(gainNode.gain.value, ac);
    gainNode.gain.linearRampToValueAtTime(0.001, ac + ADSR.release);
    osc.stop(ac + ADSR.release + 0.01);
  });

  activeNotes[name] = [];

  if (isRecording) {
    recordedEvents.push({ type: "stop", name, time: performance.now() - recordingStart });
    eventCount.textContent = `Events: ${recordedEvents.length}`;
  }
}

function releaseSustainNotes() {
  Object.keys(activeNotes).forEach(key => {
    activeNotes[key]
      .filter(n => n.pending)
      .forEach(({ osc, gainNode }) => {
        const ac = audioCtx.currentTime;
        gainNode.gain.linearRampToValueAtTime(0.001, ac + ADSR.release);
        osc.stop(ac + ADSR.release + 0.01);
      });

    activeNotes[key] = activeNotes[key].filter(n => !n.pending);
  });
}

/******************************************************************
 * BUILD PIANO UI
 ******************************************************************/
function buildPiano() {
  const whiteNotes = NOTES.filter(n => !n.sharp);
  const whiteKeyWidth = 100 / whiteNotes.length;

  NOTES.forEach((note, index) => {
    if (!note.sharp) {
      const key = document.createElement("div");
      key.className = "white-key";
      key.dataset.note = note.name;

      const label = document.createElement("div");
      label.className = "key-label";
      label.textContent = note.name;
      key.appendChild(label);

      key.onpointerdown = () => keyDown(note);
      key.onpointerup = () => keyUp(note);
      key.onpointerleave = () => keyUp(note);

      pianoEl.appendChild(key);
    }
  });

  NOTES.forEach((note, i) => {
    if (note.sharp) {
      const key = document.createElement("div");
      key.className = "black-key";
      key.dataset.note = note.name;

      key.style.left = `${(i * (100 / NOTES.length)) + 7}%`;

      const label = document.createElement("div");
      label.className = "black-label key-label";
      label.textContent = note.name.replace("#", "♯");
      key.appendChild(label);

      key.onpointerdown = (e) => { e.stopPropagation(); keyDown(note); };
      key.onpointerup = (e) => { e.stopPropagation(); keyUp(note); };
      key.onpointerleave = (e) => { e.stopPropagation(); keyUp(note); };

      pianoEl.appendChild(key);
    }
  });
}

function keyDown(note) {
  playNote(note.name, note.freq);
  highlight(note.name, true);
}

function keyUp(note) {
  stopNote(note.name);
  highlight(note.name, false);
}

function highlight(name, down) {
  document.querySelectorAll(`[data-note="${name}"]`)
    .forEach(key => key.classList.toggle("active", down));
}

/******************************************************************
 * COMPUTER KEYBOARD
 ******************************************************************/
document.addEventListener("keydown", (e) => {
  if (e.repeat) return;
  const note = KEYBOARD_MAP[e.key];
  if (note) {
    const n = NOTES.find(x => x.name === note);
    playNote(n.name, n.freq);
    highlight(note, true);
  }
});

document.addEventListener("keyup", (e) => {
  const note = KEYBOARD_MAP[e.key];
  if (note) {
    stopNote(note);
    highlight(note, false);
  }
});

/******************************************************************
 * SUSTAIN
 ******************************************************************/
sustainCheckbox.onchange = () => {
  isSustain = sustainCheckbox.checked;
  if (!isSustain) releaseSustainNotes();
};

/******************************************************************
 * RECORDING
 ******************************************************************/
recordBtn.onclick = () => {
  if (!isRecording) {
    recordedEvents = [];
    eventCount.textContent = "Events: 0";
    isRecording = true;
    recordingStart = performance.now();
    recordBtn.textContent = "Stop Rec";
  } else {
    isRecording = false;
    recordBtn.textContent = "Record";
  }
};

clearBtn.onclick = () => {
  recordedEvents = [];
  eventCount.textContent = "Events: 0";
};

playbackBtn.onclick = async () => {
  if (recordedEvents.length === 0) return;

  const start = performance.now();

  for (const ev of recordedEvents) {
    const wait = ev.time - (performance.now() - start);
    if (wait > 0) await new Promise(r => setTimeout(r, wait));

    const n = NOTES.find(x => x.name === ev.name);
    if (ev.type === "start") playNote(n.name, n.freq);
    else stopNote(n.name);
  }
};

/******************************************************************
 * INIT
 ******************************************************************/
buildPiano();
