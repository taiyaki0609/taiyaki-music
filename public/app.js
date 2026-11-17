
"use strict";

/* =========================================
   TAIYAKI MUSIC AI
   Engine Version 0.2
   Internal time: 192 ticks / quarter note
========================================= */

const $ = selector => document.querySelector(selector);

const TICKS_PER_QUARTER = 192;
const GRID_DIVISION = 4;
const MAX_TRACKS = 8;

const instruments = [
  "ピアノ","エレクトリックピアノ1","エレクトリックピアノ2",
  "クラビネット","チェンバロ","オルガン","パイプオルガン",
  "アコーディオン","鍵盤ハーモニカ","ストリングス",
  "ピチカート","アコースティックベース","ブラスアンサンブル",
  "トランペット","トロンボーン","ホルン","チューバ",
  "サクソフォーン","クラリネット","オーボエ","ファゴット",
  "フルート","リコーダー","木琴","鉄琴","ハープ",
  "チューブラーベル","ティンパニ",
  "シンセサイザー1","シンセサイザー2","シンセサイザー3",
  "シンセサイザー4","シンセサイザー5","シンセサイザー6",
  "シンセサイザー7","シンセリード1","シンセリード2",
  "シンセリード3","シンセリード4","シンセリード5",
  "シンセリード6","シンセリード7","シンセベース1",
  "シンセベース2","シンセベース3","シンセベース4",
  "シンセベース5","シンセベース6","シンセベース7",
  "アコースティックギター","エレクトリックギター",
  "ロックギター","ウクレレ","エレクトリックベース",
  "尺八","箏","三味線","三線","バグパイプ",
  "スチールドラム","コーラス"
];

const colors = [
  "#53d8d0","#9d8cff","#ff9c54","#62a8ff",
  "#ed83b5","#a7d66d","#f0cb68","#7ed6c5"
];

let mode = "free";
let bars = 16;
let meter = [4,4];
let tracks = [];
let active = 0;
let audioCtx = null;
let playing = false;
let playTimer = null;
let activeSources = [];
let template = null;
let playGeneration = 0;

/* =========================================
   TIME ENGINE
========================================= */

// 1拍あたりのticks
function ticksPerBeat() {
  return TICKS_PER_QUARTER * 4 / meter[1];
}

// 1小節あたりのticks
function ticksPerBar() {
  return meter[0] * ticksPerBeat();
}

// 1グリッドあたりのticks
function ticksPerGridStep() {
  return ticksPerBar() / stepsPerBar();
}

// 1小節あたりのグリッド数
function stepsPerBar() {
  return meter[0] * GRID_DIVISION * 4 / meter[1];
}

function totalTicks() {
  return bars * ticksPerBar();
}

function readSettings() {
  bars = Math.max(1, Number($("#bars").value) || 16);
  meter = $("#meter").value.split("/").map(Number);

  if (
    meter.length !== 2 ||
    !meter.every(Number.isFinite) ||
    meter[0] < 1 ||
    meter[1] < 1
  ) {
    throw new Error("拍子の設定が不正です");
  }
}

function clampBpm(value) {
  return Math.max(40, Math.min(240, Number(value) || 120));
}

/* =========================================
   TRACK DATA
========================================= */

function freshTrack(name = "ピアノ", program = 0) {
  return {
    name,
    program,
    notes: [],
    kind: "melody",
    gain: 0.8
  };
}

function normalizeNote(note) {
  return {
    timing: Math.max(0, Math.round(Number(note.timing) || 0)),
    length: Math.max(1, Math.round(Number(note.length) || 48)),
    pitch: Math.max(0, Math.min(127, Math.round(Number(note.pitch) || 60)))
  };
}

function sortNotes(track) {
  track.notes = track.notes
    .map(normalizeNote)
    .sort((a,b) => a.timing - b.timing);
}

function initTracks() {
  stop();
  tracks = [freshTrack("ピアノ",0)];
  active = 0;
  renderAll();
}

/* =========================================
   UTILITIES
========================================= */

function toast(message) {
  const element = $("#toast");
  if (!element) return;

  element.textContent = message;
  element.classList.add("show");

  setTimeout(() => {
    element.classList.remove("show");
  }, 2300);
}

function esc(value) {
  return String(value).replace(/[&<>"']/g, c => ({
    "&":"&amp;",
    "<":"&lt;",
    ">":"&gt;",
    '"':"&quot;",
    "'":"&#39;"
  }[c]));
}

function pitchName(pitch) {
  const names = [
    "ド","ド♯","レ","レ♯","ミ","ファ",
    "ファ♯","ソ","ソ♯","ラ","ラ♯","シ"
  ];

  return names[pitch % 12] + " " +
    (Math.floor(pitch / 12) - 1);
}

/* =========================================
   TRACK DISPLAY
========================================= */

function renderTracks() {
  $("#trackList").innerHTML = tracks.map((track,index) => `
    <div class="track-item ${index === active ? "active" : ""}"
         data-i="${index}">
      <i class="track-color"
         style="background:${colors[index % colors.length]}"></i>

      <div class="track-name">
        <b>${index + 1}. ${esc(track.name)}</b>
        <small>${track.notes.length} notes · ${esc(track.kind)}</small>
      </div>

      <button data-action="select" data-i="${index}">編集</button>
      <button data-action="remove" data-i="${index}">×</button>
    </div>
  `).join("");

  $("#activeTrack").innerHTML = tracks.map((track,index) => `
    <option value="${index}" ${index === active ? "selected" : ""}>
      ${index + 1}. ${esc(track.name)}
    </option>
  `).join("");
}

/* =========================================
   PIANO ROLL
========================================= */

function renderRoll() {
  const roll = $("#pianoRoll");
  const steps = bars * stepsPerBar();
  const gridTicks = ticksPerGridStep();
  const songTicks = totalTicks();

  roll.innerHTML = "";

  const grid = document.createElement("div");
  grid.className = "roll-grid";
  grid.style.setProperty("--steps", steps);

  for (let row = 0; row < 36; row++) {
    const pitch = 83 - row;

    const label = document.createElement("div");
    label.className = "pitch-label";
    label.textContent = pitch % 12 === 0
      ? pitchName(pitch)
      : "";

    grid.append(label);

    for (let step = 0; step < steps; step++) {
      const cell = document.createElement("div");

      cell.className =
        "cell" +
        ([1,3,6,8,10].includes(pitch % 12) ? " blackkey" : "") +
        (step % stepsPerBar() === 0 ? " bar" :
          step % (stepsPerBar() / meter[0]) === 0 ? " beat" : "");

      cell.dataset.step = step;
      cell.dataset.pitch = pitch;

      grid.append(cell);
    }
  }

  // 小節番号
  const spacer = document.createElement("div");
  spacer.className = "pitch-label";
  grid.append(spacer);

  for (let bar = 0; bar < bars; bar++) {
    const label = document.createElement("div");
    label.className = "bar-label";
    label.style.gridColumn = `span ${stepsPerBar()}`;
    label.textContent = `${bar + 1} 小節`;
    grid.append(label);
  }

  // 音符表示レイヤー
  const noteLayer = document.createElement("div");

  noteLayer.style.cssText = `
    position:absolute;
    left:52px;
    right:0;
    top:0;
    height:${36 * 24}px;
    display:block;
    pointer-events:none;
  `;

  const currentTrack = tracks[active];

  currentTrack?.notes.forEach((note,index) => {
    const row = 83 - note.pitch;

    if (row < 0 || row >= 36) return;

    const element = document.createElement("div");

    element.className =
      "note " +
      (currentTrack.kind === "chord" ? "chord" :
       currentTrack.kind === "bass" ? "bass" : "");

    // ticksから表示位置を計算
    const left = note.timing / songTicks * 100;
    const width = note.length / songTicks * 100;

    element.style.cssText = `
      position:absolute;
      left:${left}%;
      width:${width}%;
      top:${row * 24}px;
      height:20px;
      box-sizing:border-box;
      pointer-events:auto;
    `;

    element.dataset.note = index;
    element.title =
      `${pitchName(note.pitch)} · ${note.length} ticks`;

    noteLayer.append(element);
  });

  grid.append(noteLayer);
  roll.append(grid);
}

/* =========================================
   RENDER ALL
========================================= */

function renderAll() {
  renderTracks();
  renderRoll();
}

/* =========================================
   NOTE EDITING
========================================= */

$("#pianoRoll").addEventListener("click", event => {
  const noteElement = event.target.closest(".note");

  if (noteElement) {
    tracks[active].notes.splice(
      Number(noteElement.dataset.note),1
    );

    renderAll();
    return;
  }

  const cell = event.target.closest(".cell");
  if (!cell) return;

  const gridTicks = ticksPerGridStep();

  const gridLength = Math.max(
    1,
    Number($("#noteLength").value) || 1
  );

  const timing =
    Number(cell.dataset.step) * gridTicks;

  const length = gridLength * gridTicks;
  const pitch = Number(cell.dataset.pitch);

  if (timing >= totalTicks()) return;

  tracks[active].notes.push({
    timing,
    length,
    pitch
  });

  sortNotes(tracks[active]);
  renderAll();
});

/* =========================================
   TRACK CONTROLS
========================================= */

$("#trackList").addEventListener("click", event => {
  const button = event.target.closest("button");
  if (!button) return;

  const index = Number(button.dataset.i);

  if (button.dataset.action === "select") {
    active = index;
    renderAll();
  }

  if (button.dataset.action === "remove") {
    if (tracks.length <= 1) {
      toast("最低1トラック必要です");
      return;
    }

    tracks.splice(index,1);
    active = Math.max(0, Math.min(active, tracks.length - 1));

    renderAll();
  }
});

$("#activeTrack").onchange = event => {
  active = Number(event.target.value);
  renderAll();
};

$("#addTrack").onclick = () => {
  if (tracks.length >= MAX_TRACKS) {
    toast("8トラックまで追加できます");
    return;
  }

  const program = tracks.length % instruments.length;

  tracks.push(
    freshTrack(instruments[program],program)
  );

  active = tracks.length - 1;
  renderAll();
};

$("#clearTrack").onclick = () => {
  tracks[active].notes = [];
  renderAll();
  toast("トラックを消去しました");
};

/* =========================================
   SETTINGS
========================================= */

document.querySelectorAll(".mode").forEach(button => {
  button.onclick = () => {
    mode = button.dataset.mode;

    document.querySelectorAll(".mode").forEach(item => {
      item.classList.toggle("active",item === button);
    });

    $("#customHint").classList.toggle(
      "hidden",
      mode !== "custom"
    );
  };
});

["bars","meter"].forEach(id => {
  $("#"+id).onchange = () => {
    try {
      readSettings();
      renderRoll();
    } catch(error) {
      toast(error.message);
    }
  };
});

/* =========================================
   NEW PROJECT
========================================= */

$("#newBtn").onclick = () => {
  if (!confirm("現在の曲を破棄して新規作成しますか？")) {
    return;
  }

  stop();

  $("#songName").value = "新しい曲";
  $("#bpm").value = 120;
  $("#meter").value = "4/4";
  $("#bars").value = 16;

  readSettings();
  initTracks();

  $("#compositionInfo").textContent =
    "新しいプロジェクトです。";

  toast("新規プロジェクトを作成しました");
};

/* =========================================
   COMPOSITION ENGINE
========================================= */

function compose() {
  try {
    readSettings();
  } catch(error) {
    toast(error.message);
    return;
  }

  stop();

  const bpm = clampBpm($("#bpm").value);
  $("#bpm").value = bpm;

  const prompt = $("#prompt").value.toLowerCase();

  const isDark =
    /ボス|戦闘|バトル|かっこ|激し|dark|battle|boss/.test(prompt);

  const isCalm =
    /静か|穏やか|癒|ゆっくり|calm|relax/.test(prompt);

  const isHappy =
    /明る|楽しい|元気|happy|pop/.test(prompt);

  const scale = isHappy
    ? [0,2,4,7,9]
    : isDark
      ? [0,3,5,7,10]
      : [0,2,3,5,7,9,10];

  const root = Number($("#key").value) || 0;

  const barTicks = ticksPerBar();
  const beatTicks = ticksPerBeat();

  const melody = freshTrack("ピアノ",0);
  melody.kind = "melody";

  const bass = freshTrack("アコースティックベース",11);
  bass.kind = "bass";

  const chord = freshTrack("ストリングス",9);
  chord.kind = "chord";

  const drum = freshTrack("ティンパニ",27);
  drum.kind = "drum";

  const chordProgression = isDark
    ? [[0,3,7],[5,8,0],[3,7,10],[7,11,2]]
    : [[0,4,7],[5,9,0],[7,11,2],[0,4,7]];

  // 同じ入力なら同じ曲を生成する
  let seed = 0;

  for (const character of prompt) {
    seed = (seed * 31 + character.charCodeAt(0)) >>> 0;
  }

  seed = seed || 123456789;

  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  for (let bar = 0; bar < bars; bar++) {
    const chordNotes =
      chordProgression[bar % chordProgression.length];

    const barStart = bar * barTicks;

    // コード
    chordNotes.forEach(interval => {
      chord.notes.push({
        timing: barStart,
        length: barTicks,
        pitch: 48 + root + interval
      });
    });

    // ベース
    bass.notes.push({
      timing: barStart,
      length: barTicks / 2,
      pitch: 36 + root + chordNotes[0]
    });

    bass.notes.push({
      timing: barStart + barTicks / 2,
      length: barTicks / 2,
      pitch: 36 + root + chordNotes[0]
    });

    // メロディ
    const noteCount = isCalm
      ? Math.max(2,meter[0])
      : meter[0] * (isDark ? 2 : 1);

    const interval = barTicks / noteCount;

    for (let j = 0; j < noteCount; j++) {
      const timing =
        barStart + Math.round(j * interval);

      const scaleIndex =
        Math.floor(random() * scale.length);

      const octave =
        isDark && random() > 0.65 ? 12 : 0;

      const length = Math.max(
        1,
        Math.round(interval * (random() > 0.7 ? 1.5 : 1))
      );

      melody.notes.push({
        timing,
        length,
        pitch: 60 + root + scale[scaleIndex] + octave
      });
    }

    // リズム
    for (let beat = 0; beat < meter[0]; beat++) {
      drum.notes.push({
        timing: barStart + beat * beatTicks,
        length: Math.max(1,beatTicks / 4),
        pitch: beat === 0 ? 48 : 42
      });
    }
  }

  tracks = [melody,chord,bass,drum];
  active = 0;

  renderAll();

  $("#compositionInfo").textContent =
    `${isDark ? "緊張感のある" :
      isCalm ? "落ち着いた" :
      isHappy ? "明るい" : "バランスのよい"}構成で` +
    `${bars}小節を生成しました。`;

  toast("作曲しました！");
}

$("#composeBtn").onclick = compose;

/* =========================================
   KTK TEMPLATE
========================================= */

async function getTemplate() {
  const response = await fetch("template.json");

  if (!response.ok) {
    throw new Error("template.jsonを読み込めません");
  }

  return await response.json();
}

/* =========================================
   KTK EXPORT
========================================= */

function makeKtkData() {
  if (!template) {
    throw new Error("KTKテンプレートが読み込まれていません");
  }

  const data = structuredClone(template);

  const barTicks = ticksPerBar();

  data.BPM = clampBpm($("#bpm").value);
  data.timeSignature = [...meter];
  data.songName = $("#songName").value || "Taiyaki Music AI";
  data.numberOfDisplayedTracks = tracks.length;

  data.instrumentTracks = Array.from(
    {length:MAX_TRACKS},
    (_,index) => {
      const track = tracks[index];

      if (!track) {
        return {
          gadgetType:0,
          programNumber:0,
          gainValue:0.8,
          instrumentTrackOnOff:true,
          programName:""
        };
      }

      return {
        gadgetType:1,
        programNumber:track.program,
        gainValue:track.gain ?? 0.8,
        instrumentTrackOnOff:true,
        programName:track.name
      };
    }
  );

  data.seqData = Array.from(
    {length:MAX_TRACKS},
    (_,trackIndex) =>
      Array.from(
        {length:bars},
        (_,barIndex) => {
          const start = barIndex * barTicks;
          const end = start + barTicks;

          return {
            noteData: (tracks[trackIndex]?.notes || [])
              .filter(note =>
                note.timing >= start &&
                note.timing < end
              )
              .map(note => ({
                timing: Math.round(note.timing - start),
                length: Math.round(note.length),
                pitch: note.pitch
              }))
          };
        }
      )
  );

  data.trackUIOrderMap = [0,1,2,3,4,5,6,7];

  return data;
}

$("#exportBtn").onclick = async () => {
  try {
    if (!window.JSZip) {
      throw new Error("ZIPライブラリを読み込めません");
    }

    readSettings();

    const data = makeKtkData();
    const zip = new JSZip();

    zip.file("zipInside",JSON.stringify(data));

    const body = await zip.generateAsync({
      type:"uint8array",
      compression:"DEFLATE"
    });

    const output = new Uint8Array(body.length + 4);

    output.set([0x6b,0x74,0x6b,0x20],0);
    output.set(body,4);

    const blob = new Blob(
      [output],
      {type:"application/octet-stream"}
    );

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;

    link.download =
      (data.songName.replace(/[\\/:*?"<>|]/g,"_") || "music") +
      ".ktk";

    document.body.append(link);
    link.click();
    link.remove();

    setTimeout(() => URL.revokeObjectURL(url),1000);

    toast("KTKファイルを書き出しました");
  } catch(error) {
    console.error(error);
    toast("書き出し失敗："+error.message);
  }
};

/* =========================================
   KTK IMPORT
========================================= */

$("#openKtk").onchange = async event => {
  const file = event.target.files[0];
  if (!file) return;

  stop();

  try {
    if (!window.JSZip) {
      throw new Error("ZIPライブラリがありません");
    }

    const buffer = new Uint8Array(
      await file.arrayBuffer()
    );

    if (
      String.fromCharCode(...buffer.slice(0,4)) !== "ktk "
    ) {
      throw new Error("KTKファイルではありません");
    }

    const zip = await JSZip.loadAsync(buffer.slice(4));
    const entry = zip.file("zipInside");

    if (!entry) {
      throw new Error("zipInsideが見つかりません");
    }

    const json = await entry.async("string");
    const data = JSON.parse(json);

    const importedMeter = data.timeSignature || [4,4];

    if (
      importedMeter.length !== 2 ||
      !importedMeter.every(Number.isFinite)
    ) {
      throw new Error("拍子データが不正です");
    }

    template = data;

    meter = [...importedMeter];

    $("#songName").value =
      data.songName || "読み込んだ曲";

    $("#bpm").value = clampBpm(data.BPM);
    $("#meter").value = meter.join("/");

    const sequence = data.seqData || [];

    const importedBars = Math.max(
      1,
      ...sequence.map(track => track.length || 0)
    );

    bars = importedBars;

    // HTMLの小節数選択肢に存在しない場合も追加
    const barsSelect = $("#bars");

    if (
      !Array.from(barsSelect.options)
        .some(option => Number(option.value) === bars)
    ) {
      const option = document.createElement("option");
      option.value = String(bars);
      option.textContent = String(bars);
      barsSelect.append(option);
    }

    barsSelect.value = String(bars);

    const barTicks = ticksPerBar();

    const trackCount = Math.min(
      MAX_TRACKS,
      Math.max(1,Number(data.numberOfDisplayedTracks) ||
        data.instrumentTracks?.length || 1)
    );

    tracks = [];

    for (let i = 0; i < trackCount; i++) {
      const instrument =
        data.instrumentTracks?.[i] || {};

      const notes = [];

      (sequence[i] || []).forEach((measure,barIndex) => {
        (measure.noteData || []).forEach(note => {
          notes.push({
            timing:
              Math.round(Number(note.timing) || 0) +
              barIndex * barTicks,

            length: Math.max(
              1,
              Math.round(Number(note.length) || 1)
            ),

            pitch: Math.max(
              0,
              Math.min(127,Math.round(Number(note.pitch) || 60))
            )
          });
        });
      });

      const program = Number(instrument.programNumber) || 0;

      const track = freshTrack(
        instrument.programName ||
          instruments[program] ||
          `トラック${i+1}`,
        program
      );

      track.gain = Number(instrument.gainValue) || 0.8;
      track.notes = notes;

      sortNotes(track);

      tracks.push(track);
    }

    active = 0;

    renderAll();

    $("#compositionInfo").textContent =
      `${file.name} を読み込みました。`;

    toast("KTKファイルを読み込みました");
  } catch(error) {
    console.error(error);
    toast("読み込み失敗："+error.message);
  }

  event.target.value = "";
};

/* =========================================
   AUDIO ENGINE
========================================= */

function stop() {
  playGeneration++;

  activeSources.forEach(source => {
    try {
      source.stop();
    } catch (_) {}
  });

  activeSources = [];

  if (playTimer) {
    clearTimeout(playTimer);
    playTimer = null;
  }

  playing = false;

  if ($("#playState")) {
    $("#playState").textContent = "停止中";
  }

  if ($("#playBtn")) {
    $("#playBtn").textContent = "▶ 再生";
  }
}

async function play() {
  if (playing) return;

  try {
    audioCtx = audioCtx ||
      new (window.AudioContext || window.webkitAudioContext)();

    await audioCtx.resume();

    const bpm = clampBpm($("#bpm").value);
    const secondsPerTick =
      60 / bpm / TICKS_PER_QUARTER;

    const generation = playGeneration + 1;
    playGeneration = generation;

    const events = [];

    tracks.forEach((track,trackIndex) => {
      track.notes.forEach(note => {
        if (note.timing < 0 || note.length <= 0) return;

        events.push({
          ...note,
          trackIndex
        });
      });
    });

    if (!events.length) {
      toast("再生する音符がありません");
      return;
    }

    playing = true;

    $("#playState").textContent = "再生中";
    $("#playBtn").textContent = "▶ 再生中";

    const startTime = audioCtx.currentTime + 0.08;

    events.forEach(note => {
      const track = tracks[note.trackIndex];

      const oscillator = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      const when =
        startTime + note.timing * secondsPerTick;

      const duration = Math.max(
        0.02,
        note.length * secondsPerTick
      );

      const frequency =
        440 * Math.pow(2,(note.pitch - 69) / 12);

      oscillator.type =
        track.program >= 35 ? "sawtooth" :
        track.kind === "drum" ? "square" :
        "triangle";

      oscillator.frequency.setValueAtTime(
        frequency,when
      );

      const volume = Math.max(
        0,
        Math.min(1,Number(track.gain) || 0.8)
      );

      gain.gain.setValueAtTime(0.0001,when);

      gain.gain.linearRampToValueAtTime(
        0.10 * volume,
        when + Math.min(0.015,duration / 3)
      );

      gain.gain.setValueAtTime(
        0.10 * volume,
        Math.max(when + 0.02,when + duration * 0.8)
      );

      gain.gain.exponentialRampToValueAtTime(
        0.0001,
        when + duration
      );

      oscillator.connect(gain);
      gain.connect(audioCtx.destination);

      oscillator.start(when);
      oscillator.stop(when + duration + 0.02);

      activeSources.push(oscillator);
    });

    const finalTick = Math.max(
      ...events.map(note => note.timing + note.length)
    );

    const durationMs =
      finalTick * secondsPerTick * 1000 + 250;

    playTimer = setTimeout(() => {
      if (generation === playGeneration) {
        stop();
      }
    },durationMs);

  } catch(error) {
    console.error(error);
    stop();
    toast("再生エラー："+error.message);
  }
}

$("#playBtn").onclick = play;
$("#stopBtn").onclick = stop;

/* =========================================
   INITIALIZATION
========================================= */

(async function initialize() {
  try {
    readSettings();

    template = await getTemplate();

    initTracks();

    $("#compositionInfo").textContent =
      "Taiyaki Music AI Engine 0.2";

    toast("作曲エンジンを起動しました");

  } catch(error) {
    console.error(error);

    initTracks();

    toast(
      "テンプレート読み込みエラー："+error.message
    );
  }
})();
