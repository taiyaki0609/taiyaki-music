
const $ = s => document.querySelector(s);

const instruments = [
"ピアノ","エレクトリックピアノ1","エレクトリックピアノ2","クラビネット","チェンバロ","オルガン","パイプオルガン","アコーディオン","鍵盤ハーモニカ","ストリングス","ピチカート","アコースティックベース","ブラスアンサンブル","トランペット","トロンボーン","ホルン","チューバ","サクソフォーン","クラリネット","オーボエ","ファゴット","フルート","リコーダー","木琴","鉄琴","ハープ","チューブラーベル","ティンパニ",
"シンセサイザー1","シンセサイザー2","シンセサイザー3","シンセサイザー4","シンセサイザー5","シンセサイザー6","シンセサイザー7",
"シンセリード1","シンセリード2","シンセリード3","シンセリード4","シンセリード5","シンセリード6","シンセリード7",
"シンセベース1","シンセベース2","シンセベース3","シンセベース4","シンセベース5","シンセベース6","シンセベース7",
"アコースティックギター","エレクトリックギター","ロックギター","ウクレレ","エレクトリックベース","尺八","箏","三味線","三線","バグパイプ","スチールドラム","コーラス"
];

const colors = ["#53d8d0","#9d8cff","#ff9c54","#62a8ff","#ed83b5","#a7d66d","#f0cb68","#7ed6c5"];

let mode = "free";
let bars = 16;
let meter = [4,4];
let tracks = [];
let active = 0;
let audioCtx = null;
let playing = false;
let playTimer = null;
let template = null;

const freshTrack = (name="ピアノ",program=0) => ({
  name,program,notes:[],kind:"melody",gain:0.8
});

function initTracks(){
  tracks = [freshTrack("ピアノ",0)];
  active = 0;
  renderTracks();
  renderRoll();
}

function toast(msg){
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(()=>t.classList.remove("show"),2300);
}

function readSettings(){
  bars = Number($("#bars").value);
  meter = $("#meter").value.split("/").map(Number);
}

function stepsPerBar(){
  return meter[0] * 4 * (4/meter[1]);
}

function esc(s){
  return String(s).replace(/[&<>"']/g,c=>({
    "&":"&amp;","<":"&lt;",">":"&gt;",
    '"':"&quot;","'":"&#39;"
  }[c]));
}

function pitchName(p){
  return ["ド","ド♯","レ","レ♯","ミ","ファ","ファ♯","ソ","ソ♯","ラ","ラ♯","シ"][p%12]
    +" "+(Math.floor(p/12)-1);
}

function renderTracks(){
  $("#trackList").innerHTML = tracks.map((t,i)=>`
    <div class="track-item ${i===active?"active":""}" data-i="${i}">
      <i class="track-color" style="background:${colors[i%colors.length]}"></i>
      <div class="track-name">
        <b>${i+1}. ${esc(t.name)}</b>
        <small>${t.notes.length} notes · ${t.kind}</small>
      </div>
      <button data-action="select" data-i="${i}">編集</button>
      <button data-action="remove" data-i="${i}">×</button>
    </div>
  `).join("");

  $("#activeTrack").innerHTML = tracks.map((t,i)=>`
    <option value="${i}" ${i===active?"selected":""}>
      ${i+1}. ${esc(t.name)}
    </option>
  `).join("");
}

function renderRoll(){
  const roll = $("#pianoRoll");
  const steps = bars * stepsPerBar();
  roll.innerHTML = "";

  const grid = document.createElement("div");
  grid.className = "roll-grid";
  grid.style.setProperty("--steps",steps);

  const visiblePitches = Array.from({length:36},(_,i)=>83-i);

  visiblePitches.forEach(p=>{
    const lab = document.createElement("div");
    lab.className = "pitch-label";
    lab.textContent = p%12===0 ? pitchName(p) : "";
    grid.append(lab);

    for(let s=0;s<steps;s++){
      const c = document.createElement("div");
      c.className = "cell"
        +([1,3,6,8,10].includes(p%12)?" blackkey":"")
        +(s%stepsPerBar()===0?" bar":
          s%(stepsPerBar()/meter[0])===0?" beat":"");
      c.dataset.step = s;
      c.dataset.pitch = p;
      grid.append(c);
    }
  });

  const spacer = document.createElement("div");
  spacer.className = "pitch-label";
  grid.append(spacer);

  for(let b=0;b<bars;b++){
    const l = document.createElement("div");
    l.className = "bar-label";
    l.style.gridColumn = `span ${stepsPerBar()}`;
    l.textContent = `${b+1} 小節`;
    grid.append(l);
  }

  const noteLayer = document.createElement("div");
  noteLayer.style.cssText =
    `position:absolute;left:52px;right:0;top:0;height:${36*24}px;display:grid;grid-template-columns:repeat(${steps},minmax(13px,1fr));grid-template-rows:repeat(36,24px);pointer-events:none`;

  tracks[active]?.notes.forEach((n,idx)=>{
    const row = 83-n.pitch;
    if(row<0 || row>=36) return;

    const el = document.createElement("div");
    el.className = "note "
      +(tracks[active].kind==="chord"?"chord":
        tracks[active].kind==="bass"?"bass":"");

    el.style.gridColumn =
      `${n.timing+1}/span ${Math.max(1,n.length)}`;
    el.style.gridRow = String(row+1);
    el.style.pointerEvents = "auto";
    el.title = `${pitchName(n.pitch)} · ${n.length} ticks`;
    el.dataset.note = idx;
    noteLayer.append(el);
  });

  grid.append(noteLayer);
  roll.append(grid);
}

$("#pianoRoll").addEventListener("click",e=>{
  const n = e.target.closest(".note");

  if(n){
    tracks[active].notes.splice(Number(n.dataset.note),1);
    renderRoll();
    renderTracks();
    return;
  }

  const c = e.target.closest(".cell");
  if(!c) return;

  const length = Number($("#noteLength").value);
  const timing = Number(c.dataset.step);
  const pitch = Number(c.dataset.pitch);

  tracks[active].notes.push({timing,length,pitch});
  tracks[active].notes.sort((a,b)=>a.timing-b.timing);

  renderRoll();
  renderTracks();
});

$("#trackList").addEventListener("click",e=>{
  const b = e.target.closest("button");
  if(!b) return;

  const i = Number(b.dataset.i);

  if(b.dataset.action==="select"){
    active=i;
    renderTracks();
    renderRoll();
  }

  if(b.dataset.action==="remove"){
    if(tracks.length===1)
      return toast("最低1トラック必要です");

    tracks.splice(i,1);
    active=Math.max(0,Math.min(active,tracks.length-1));
    renderTracks();
    renderRoll();
  }
});

$("#activeTrack").onchange=e=>{
  active=Number(e.target.value);
  renderTracks();
  renderRoll();
};

$("#addTrack").onclick=()=>{
  if(tracks.length>=8)
    return toast("サンプルファイルの8トラック上限に達しました");

  const prog=tracks.length%instruments.length;
  tracks.push(freshTrack(instruments[prog],prog));
  active=tracks.length-1;
  renderTracks();
  renderRoll();
};

document.querySelectorAll(".mode").forEach(b=>{
  b.onclick=()=>{
    mode=b.dataset.mode;
    document.querySelectorAll(".mode")
      .forEach(x=>x.classList.toggle("active",x===b));
    $("#customHint").classList.toggle("hidden",mode!=="custom");
  };
});

["bars","meter"].forEach(id=>{
  $("#"+id).onchange=()=>{
    readSettings();
    renderRoll();
  };
});

$("#clearTrack").onclick=()=>{
  tracks[active].notes=[];
  renderTracks();
  renderRoll();
  toast("トラックを消去しました");
};

$("#newBtn").onclick=()=>{
  if(!confirm("現在の曲を破棄して新規作成しますか？"))
    return;

  $("#songName").value="新しい曲";
  $("#bpm").value=120;
  $("#meter").value="4/4";
  $("#bars").value=16;

  initTracks();
  $("#compositionInfo").textContent="新しいプロジェクトです。";
  toast("新規プロジェクトを作成しました");
};

function compose(){
  readSettings();

  const bpm=Math.max(40,Math.min(240,Number($("#bpm").value)||120));
  $("#bpm").value=bpm;

  const prompt=$("#prompt").value.toLowerCase();
  const isDark=/ボス|戦闘|バトル|かっこ|激し|dark|battle|boss/.test(prompt);
  const isCalm=/静か|穏やか|癒|ゆっくり|calm|relax/.test(prompt);
  const isHappy=/明る|楽しい|元気|happy|pop/.test(prompt);

  const scale=isHappy?[0,2,4,7,9]:
    isDark?[0,3,5,7,10]:[0,2,3,5,7,9,10];

  const root=Number($("#key").value);
  const beats=stepsPerBar();
  const stepTicks=192/(beats/meter[0]);

  const melody=freshTrack("ピアノ",0);
  melody.kind="melody";

  const bass=freshTrack("アコースティックベース",11);
  bass.kind="bass";

  const chord=freshTrack("ストリングス",9);
  chord.kind="chord";

  const drum=freshTrack("ティンパニ",27);
  drum.kind="drum";

  const chordProg=isDark
    ?[[0,3,7],[5,8,0],[3,7,10],[7,11,2]]
    :[[0,4,7],[5,9,0],[7,11,2],[0,4,7]];

  let seed=0;
  for(const ch of prompt)
    seed=(seed*31+ch.charCodeAt(0))>>>0;

  const rnd=()=>{
    seed=(seed*1664525+1013904223)>>>0;
    return seed/4294967296;
  };

  for(let bar=0;bar<bars;bar++){
    const chordNotes=chordProg[bar%chordProg.length];
    const barStart=bar*beats*stepTicks;

    chordNotes.forEach(iv=>{
      chord.notes.push({
        timing:barStart,
        length:beats*stepTicks,
        pitch:48+root+iv
      });
    });

    bass.notes.push({
      timing:barStart,
      length:beats*stepTicks/2,
      pitch:36+root+chordNotes[0]
    });

    bass.notes.push({
      timing:barStart+beats*stepTicks/2,
      length:beats*stepTicks/2,
      pitch:36+root+chordNotes[0]
    });

    const noteCount=isCalm
      ?Math.max(2,meter[0])
      :meter[0]*(isDark?2:1);

    for(let j=0;j<noteCount;j++){
      const step=j*(beats/noteCount);
      const timing=barStart+Math.round(step*stepTicks);
      const iv=scale[Math.floor(rnd()*scale.length)];
      const oct=isDark&&rnd()>.65?12:0;
      const length=Math.max(stepTicks,
        Math.round((beats*stepTicks/noteCount)*(rnd()>.7?1.5:1)));

      melody.notes.push({
        timing,length,pitch:60+root+iv+oct
      });
    }

    for(let beat=0;beat<meter[0];beat++){
      const t=barStart+beat*stepTicks;
      drum.notes.push({
        timing:t,
        length:Math.max(12,stepTicks/4),
        pitch:beat===0?48:42
      });
    }
  }

  tracks=[melody,chord,bass,drum];
  active=0;
  renderTracks();
  renderRoll();

  $("#compositionInfo").textContent=
    `${isDark?"緊張感のある":isCalm?"落ち着いた":isHappy?"明るい":"バランスのよい"}構成で${bars}小節を生成。メロディ・ストリングス伴奏・ベース・打楽器の4トラックです。`;

  toast("作曲しました。音符をクリックして編集できます。");
}

$("#composeBtn").onclick=compose;

async function getTemplate(){
  if(template) return structuredClone(template);
  const r=await fetch("template.json");
  if(!r.ok) throw Error("template.jsonを読み込めません");
  template=await r.json();
  return structuredClone(template);
}

function makeKtkData(){
  const d=template?structuredClone(template):null;
  if(!d) throw Error("テンプレート未読込");

  d.BPM=Math.max(40,Math.min(240,Number($("#bpm").value)||120));
  d.timeSignature=meter;
  d.songName=$("#songName").value||"Taiyaki Music AI";
  d.numberOfDisplayedTracks=Math.max(1,tracks.length);

  const beats=stepsPerBar();
  const stepTicks=192/(beats/meter[0]);

  d.instrumentTracks=Array.from({length:8},(_,i)=>{
    const t=tracks[i];

    return t
      ?{
        gadgetType:1,
        programNumber:t.program,
        gainValue:t.gain??0.8,
        instrumentTrackOnOff:true,
        programName:t.name
      }
      :{
        gadgetType:0,
        programNumber:0,
        gainValue:0.8,
        instrumentTrackOnOff:true,
        programName:""
      };
  });

  d.seqData=Array.from({length:8},(_,ti)=>
    Array.from({length:bars},(_,bi)=>({
      noteData:(tracks[ti]?.notes||[])
        .filter(n=>n.timing>=bi*beats*stepTicks &&
          n.timing<(bi+1)*beats*stepTicks)
        .map(n=>({
          timing:Math.round(n.timing-bi*beats*stepTicks),
          length:Math.round(n.length),
          pitch:n.pitch
        }))
    }))
  );

  d.trackUIOrderMap=[0,1,2,3,4,5,6,7];
  return d;
}

$("#exportBtn").onclick=async()=>{
  try{
    if(!window.JSZip)
      throw Error("ZIPライブラリを読み込めません。ネット接続を確認してください");

    readSettings();
    const d=makeKtkData();
    const zip=new JSZip();

    zip.file("zipInside",JSON.stringify(d));

    const body=await zip.generateAsync({
      type:"uint8array",
      compression:"DEFLATE"
    });

    const out=new Uint8Array(body.length+4);
    out.set([0x6b,0x74,0x6b,0x20],0);
    out.set(body,4);

    const blob=new Blob([out],{type:"application/octet-stream"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");

    a.href=url;
    a.download=(d.songName.replace(/[\\/:*?"<>|]/g,"_")||"music")+".ktk";
    a.click();

    URL.revokeObjectURL(url);
    toast(".ktkを書き出しました。カトカトーンで読み込みを確認してください");
  }catch(e){
    console.error(e);
    toast("書き出し失敗："+e.message);
  }
};

$("#openKtk").onchange=async e=>{
  const file=e.target.files[0];
  if(!file) return;

  try{
    const buf=new Uint8Array(await file.arrayBuffer());

    if(String.fromCharCode(...buf.slice(0,4))!=="ktk ")
      throw Error("KTKファイルのヘッダーが一致しません");

    const zip=await JSZip.loadAsync(buf.slice(4));
    const text=await zip.file("zipInside").async("string");
    const d=JSON.parse(text);

    template=d;
    $("#songName").value=d.songName||"読み込んだ曲";
    $("#bpm").value=d.BPM||120;
    $("#meter").value=(d.timeSignature||[4,4]).join("/");

    bars=Math.max(1,...(d.seqData||[]).map(t=>t.length));
    $("#bars").value=String([4,8,16,32].includes(bars)?bars:16);
    bars=Number($("#bars").value);
    meter=d.timeSignature||[4,4];

    const beats=stepsPerBar();
    const stepTicks=192/(beats/meter[0]);

    tracks=(d.instrumentTracks||[]).map((it,i)=>{
      const name=it.programName||instruments[it.programNumber]||"トラック"+(i+1);
      const notes=[];

      (d.seqData?.[i]||[]).forEach((m,bi)=>
        m.noteData?.forEach(n=>notes.push({
          ...n,
          timing:n.timing+bi*beats*stepTicks
        }))
      );

      return {
        ...freshTrack(name,it.programNumber),
        notes
      };
    });

    tracks=tracks.filter((t,i)=>i<8);
    if(!tracks.length) initTracks();

    active=0;
    renderTracks();
    renderRoll();
    toast("KTKファイルを読み込みました");
  }catch(err){
    console.error(err);
    toast("読み込み失敗："+err.message);
  }

  e.target.value="";
};

let activeSources=[];

function stop(){
  activeSources.forEach(s=>{
    try{s.stop()}catch(_){}
  });

  activeSources=[];
  playing=false;
  clearTimeout(playTimer);
  $("#playState").textContent="停止中";
  $("#playBtn").textContent="▶ 再生";
}

async function play(){
  if(playing) return;

  audioCtx=audioCtx||
    new (window.AudioContext||window.webkitAudioContext)();

  await audioCtx.resume();

  playing=true;
  $("#playState").textContent="再生中";
  $("#playBtn").textContent="▶ 再生中";

  const bpm=Math.max(40,Number($("#bpm").value)||120);
  const sec=60/bpm;
  const all=[];

  tracks.forEach((t,ti)=>
    t.notes.forEach(n=>all.push({...n,track:ti}))
  );

  const start=audioCtx.currentTime+.08;

  all.forEach(n=>{
    const osc=audioCtx.createOscillator();
    const gain=audioCtx.createGain();
    const t=tracks[n.track];

    const when=start+(n.timing/192)*sec;
    const dur=Math.max(.06,n.length/192*sec);
    const freq=440*Math.pow(2,(n.pitch-69)/12);

    osc.type=n.track===3?"square":
      t.program>=35?"sawtooth":"triangle";

    osc.frequency.value=freq;

    gain.gain.setValueAtTime(.0001,when);
    gain.gain.linearRampToValueAtTime(.10*(t.gain||.8),when+.015);
    gain.gain.exponentialRampToValueAtTime(.0001,when+dur);

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start(when);
    osc.stop(when+dur+.03);
    activeSources.push(osc);
  });

  const end=Math.max(1,...all.map(n=>(n.timing+n.length)/192))*sec;
  playTimer=setTimeout(stop,end*1000+150);
}

$("#playBtn").onclick=play;
$("#stopBtn").onclick=stop;

(async()=>{
  try{
    template=await getTemplate();
    initTracks();
  }catch(e){
    console.error(e);
    initTracks();
    toast("テンプレート未読込：KTK出力は利用できません");
  }
})();
