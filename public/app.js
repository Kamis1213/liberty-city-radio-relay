const socket = io();

const conn = document.getElementById("conn");
const users = document.getElementById("users");
const feed = document.getElementById("feed");
const roster = document.getElementById("roster");
const audioBtn = document.getElementById("audio");
const micBtn = document.getElementById("mic");
const micStatus = document.getElementById("micstatus");
const rxStatus = document.getElementById("rxstatus");
const ptt = document.getElementById("ptt");
const emergencyBtn = document.getElementById("emergency");
const unit = document.getElementById("unit");
const channel = document.getElementById("channel");
const channelDisplay = document.getElementById("channelDisplay");
const alertBox = document.getElementById("alert");
const emergencyAlert = document.getElementById("emergencyAlert");
const remoteAudio = document.getElementById("remote-audio");
const clock = document.getElementById("clock");

let ctx = null;
let audioOn = false;
let localStream = null;
let transmitting = false;
let busy = false;
const peers = new Map();

const rtcConfig = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
};

unit.value = localStorage.getItem("lcfd_callsign") || "";
channel.value = localStorage.getItem("lcfd_channel") || "Dispatch";
channelDisplay.textContent = channel.value;

setInterval(() => {
  clock.textContent = new Date().toLocaleTimeString();
}, 500);
clock.textContent = new Date().toLocaleTimeString();

function registration() {
  return { unit: unit.value || "Unknown Unit", channel: channel.value };
}

socket.on("connect", () => {
  conn.textContent = "ONLINE";
  socket.emit("register", registration());
});

socket.on("disconnect", () => conn.textContent = "OFFLINE");
socket.on("user-count", n => users.textContent = `${n} USER${n === 1 ? "" : "S"}`);

unit.addEventListener("change", () => {
  localStorage.setItem("lcfd_callsign", unit.value.trim());
  socket.emit("register", registration());
});

channel.addEventListener("change", () => {
  localStorage.setItem("lcfd_channel", channel.value);
  channelDisplay.textContent = channel.value;
  closeAllPeers();
  rxStatus.textContent = "RADIO CLEAR";
  busy = false;
  socket.emit("register", registration());
  channelChangeTone();
});

function esc(v){
  return String(v ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;");
}

function addDispatch(d){
  const div = document.createElement("div");
  div.className = "feeditem";
  div.innerHTML = `<strong>${esc(d.priority)} — ${esc(d.incidentNumber)}</strong><br>${esc(d.callType)}<br>${esc(d.address)}<br>${esc(d.units)}<br><small>${esc(d.notes)}</small>`;
  feed.prepend(div);
}

function tone(freq,start,dur,vol=.15,type="sine"){
  if(!audioOn || !ctx || ctx.state!=="running") return;
  const o=ctx.createOscillator(),g=ctx.createGain(),t=ctx.currentTime+start;
  o.frequency.value=freq;o.type=type;
  g.gain.setValueAtTime(.0001,t);
  g.gain.exponentialRampToValueAtTime(vol,t+.015);
  g.gain.exponentialRampToValueAtTime(.0001,t+dur);
  o.connect(g);g.connect(ctx.destination);o.start(t);o.stop(t+dur+.03);
}

// v5.5 radio audio: shorter, dirtier, less musical radio keying sounds.
// Uses layered filtered noise + very short signaling tones so it feels closer
// to a real portable/mobile radio instead of a clean computer beep.
function noiseBurst(start,dur,vol=.04,center=1800,q=.8,highpass=0){
  if(!audioOn || !ctx || ctx.state!=="running") return;
  const length=Math.max(1,Math.floor(ctx.sampleRate*dur));
  const buffer=ctx.createBuffer(1,length,ctx.sampleRate);
  const data=buffer.getChannelData(0);
  for(let i=0;i<length;i++){
    const x=i/length;
    const attack=Math.min(1,x/.08);
    const fade=Math.pow(1-x,1.15);
    data[i]=(Math.random()*2-1)*attack*fade;
  }
  const source=ctx.createBufferSource();
  const band=ctx.createBiquadFilter();
  const gain=ctx.createGain();
  band.type="bandpass";
  band.frequency.value=center;
  band.Q.value=q;
  gain.gain.value=vol;
  source.buffer=buffer;
  source.connect(band);
  if(highpass){
    const hp=ctx.createBiquadFilter();
    hp.type="highpass"; hp.frequency.value=highpass;
    band.connect(hp); hp.connect(gain);
  }else band.connect(gain);
  gain.connect(ctx.destination);
  source.start(ctx.currentTime+start);
}

function radioClick(start=0,vol=.055){
  // Mechanical/contact-like transient rather than a musical chirp.
  noiseBurst(start,.018,vol,2350,.55,500);
  tone(310,start+.002,.014,vol*.42,"square");
}

function alertTone(){
  // Keep the repeating station-call feel the user liked, but remove the
  // cartoonish rising chirps. Two clean pager tones + radio opening click.
  radioClick(0,.045);
  noiseBurst(.025,.045,.025,1550,.7,350);
  tone(682.5,.10,1.05,.16,"sine");
  tone(953.7,1.23,1.05,.16,"sine");
  noiseBurst(2.32,.055,.025,1700,.7,400);
}

function keyUpTone(){
  // Portable-radio key-up: contact click, tiny RF/squelch crackle, then open.
  radioClick(0,.05);
  noiseBurst(.012,.042,.032,1750,.55,450);
}

function keyDownTone(){
  // Repeater/squelch tail: short static burst and low drop click.
  noiseBurst(0,.095,.052,1450,.48,300);
  tone(285,.070,.024,.025,"square");
  radioClick(.088,.035);
}

function channelChangeTone(){
  tone(820,0,.04,.04,"sine");
  tone(1120,.05,.05,.04,"sine");
}

function emergencyTone(){
  for(let i=0;i<6;i++){
    tone(1320,i*.28,.10,.14,"square");
    tone(680,i*.28+.12,.10,.14,"square");
  }
}

socket.on("recent", items => items.slice().reverse().forEach(addDispatch));

socket.on("dispatch", d => {
  addDispatch(d);
  alertBox.innerHTML = `<h2>${esc(d.priority)} — ${esc(d.incidentNumber)}</h2><strong>${esc(d.callType)}</strong><br>${esc(d.address)}<br>${esc(d.units)}<br><button id="ack">ACKNOWLEDGE</button>`;
  alertBox.classList.remove("hidden");
  document.getElementById("ack").onclick = () => alertBox.classList.add("hidden");
  alertTone();

  if(audioOn && "speechSynthesis" in window){
    setTimeout(() => {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(`${d.units}. Respond to ${d.callType}, at ${d.address}.`);
      u.rate=.92;u.pitch=.95;speechSynthesis.speak(u);
    },2450);
  }
});

audioBtn.onclick = async () => {
  const A=window.AudioContext||window.webkitAudioContext;
  if(!ctx)ctx=new A();
  await ctx.resume();
  audioOn=ctx.state==="running";
  audioBtn.textContent=audioOn?"Radio Audio: ON":"Enable Radio Audio";
  tone(700,0,.15,.1);tone(950,.2,.2,.1);
};

async function enableMic(){
  try{
    localStream=await navigator.mediaDevices.getUserMedia({
      audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},
      video:false
    });
    localStream.getAudioTracks().forEach(t=>t.enabled=false);
    micBtn.textContent="Microphone: ON";
    micStatus.textContent="MICROPHONE READY";
    ptt.disabled=false;

    for(const [id, pc] of peers){
      if(!pc.getSenders().some(s=>s.track?.kind==="audio")){
        localStream.getTracks().forEach(track=>pc.addTrack(track,localStream));
        await makeOffer(id,pc);
      }
    }
  }catch(err){
    micStatus.textContent="MICROPHONE BLOCKED";
    alert("Microphone permission was not granted. Allow microphone access for this site and try again.");
  }
}
micBtn.onclick=enableMic;

function closePeer(id){
  peers.get(id)?.close();
  peers.delete(id);
  document.getElementById(`audio-${id}`)?.remove();
}
function closeAllPeers(){
  for(const id of [...peers.keys()]) closePeer(id);
}

function makePeer(id){
  if(peers.has(id)) return peers.get(id);
  const pc=new RTCPeerConnection(rtcConfig);
  peers.set(id,pc);

  if(localStream){
    localStream.getTracks().forEach(track=>pc.addTrack(track,localStream));
  }

  pc.onicecandidate=e=>{
    if(e.candidate)socket.emit("webrtc-ice",{target:id,candidate:e.candidate});
  };

  pc.ontrack=e=>{
    let audio=document.getElementById(`audio-${id}`);
    if(!audio){
      audio=document.createElement("audio");
      audio.id=`audio-${id}`;
      audio.autoplay=true;
      audio.playsInline=true;
      remoteAudio.appendChild(audio);
    }
    audio.srcObject=e.streams[0];
    audio.play().catch(()=>{});
  };

  pc.onconnectionstatechange=()=>{
    if(["failed","closed"].includes(pc.connectionState)) closePeer(id);
  };
  return pc;
}

async function makeOffer(id,pc=makePeer(id)){
  try{
    const offer=await pc.createOffer();
    await pc.setLocalDescription(offer);
    socket.emit("webrtc-offer",{target:id,sdp:pc.localDescription});
  }catch(e){console.error(e);}
}

socket.on("peer-list", async list=>{
  for(const peer of list) await makeOffer(peer.id);
});

socket.on("peer-joined", peer => {
  // Newly joined peer will negotiate using peer-list.
});

socket.on("peer-updated", () => {});
socket.on("peer-left", ({id}) => closePeer(id));

socket.on("webrtc-offer", async({from,sdp})=>{
  const pc=makePeer(from);
  try{
    await pc.setRemoteDescription(sdp);
    const answer=await pc.createAnswer();
    await pc.setLocalDescription(answer);
    socket.emit("webrtc-answer",{target:from,sdp:pc.localDescription});
  }catch(e){console.error(e);}
});

socket.on("webrtc-answer", async({from,sdp})=>{
  const pc=peers.get(from);
  if(pc)try{await pc.setRemoteDescription(sdp);}catch(e){console.error(e);}
});

socket.on("webrtc-ice", async({from,candidate})=>{
  const pc=makePeer(from);
  try{await pc.addIceCandidate(candidate);}catch(e){console.error(e);}
});

socket.on("ptt:start",({unit:txUnit,channel:txChannel})=>{
  busy=true;
  rxStatus.textContent=`RECEIVING: ${txUnit} · ${txChannel}`;
  keyUpTone();
});
socket.on("ptt:stop",()=>{
  busy=false;
  rxStatus.textContent="RADIO CLEAR";
  keyDownTone();
});

socket.on("roster", list=>{
  roster.innerHTML="";
  const sorted=[...list].sort((a,b)=>a.channel.localeCompare(b.channel)||a.unit.localeCompare(b.unit));
  for(const item of sorted){
    const div=document.createElement("div");
    div.className="roster-item";
    div.innerHTML=`<strong>${esc(item.unit)}</strong><span class="roster-channel">${esc(item.channel)}</span>`;
    roster.appendChild(div);
  }
});

socket.on("emergency", data=>{
  emergencyTone();
  emergencyAlert.innerHTML=`<h2>EMERGENCY TRAFFIC</h2><div><strong>${esc(data.unit)}</strong></div><div>${esc(data.channel)}</div><button id="emergencyAck">ACKNOWLEDGE</button>`;
  emergencyAlert.classList.remove("hidden");
  document.getElementById("emergencyAck").onclick=()=>emergencyAlert.classList.add("hidden");
});

function startPTT(e){
  if(e)e.preventDefault();
  if(!localStream || transmitting)return;
  if(busy){
    rxStatus.textContent="CHANNEL BUSY";
    tone(260,0,.16,.08,"square");
    return;
  }

  transmitting=true;
  localStream.getAudioTracks().forEach(t=>t.enabled=true);
  ptt.textContent="TRANSMITTING";
  ptt.classList.add("tx");
  micStatus.textContent=`TX: ${unit.value||"Unknown Unit"} · ${channel.value}`;
  socket.emit("register", registration());
  socket.emit("ptt:start");
  keyUpTone();
}

function stopPTT(e){
  if(e)e.preventDefault();
  if(!localStream || !transmitting)return;
  transmitting=false;
  localStream.getAudioTracks().forEach(t=>t.enabled=false);
  ptt.textContent="HOLD TO TALK";
  ptt.classList.remove("tx");
  micStatus.textContent="MICROPHONE READY";
  socket.emit("ptt:stop");
  keyDownTone();
}

ptt.addEventListener("pointerdown",startPTT);
window.addEventListener("pointerup",stopPTT);
ptt.addEventListener("pointercancel",stopPTT);
ptt.addEventListener("contextmenu",e=>e.preventDefault());

emergencyBtn.onclick=()=>{
  const ok=confirm(`Send EMERGENCY alert for ${unit.value||"Unknown Unit"} on ${channel.value}?`);
  if(ok) socket.emit("emergency");
};
