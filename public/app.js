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

// v5.3 radio audio: two-tone pager alert plus short radio key/squelch sounds.
// These are synthesized in-browser so every web/desktop client receives them
// automatically when this server is deployed.
function noiseBurst(start,dur,vol=.025){
  if(!audioOn || !ctx || ctx.state!=="running") return;
  const length=Math.max(1,Math.floor(ctx.sampleRate*dur));
  const buffer=ctx.createBuffer(1,length,ctx.sampleRate);
  const data=buffer.getChannelData(0);
  for(let i=0;i<length;i++){
    const fade=1-(i/length);
    data[i]=(Math.random()*2-1)*fade;
  }
  const source=ctx.createBufferSource();
  const filter=ctx.createBiquadFilter();
  const gain=ctx.createGain();
  filter.type="bandpass";
  filter.frequency.value=1750;
  filter.Q.value=.7;
  gain.gain.value=vol;
  source.buffer=buffer;
  source.connect(filter);filter.connect(gain);gain.connect(ctx.destination);
  source.start(ctx.currentTime+start);
}

function alertTone(){
  // Classic fire-pager style two-tone sequence.
  tone(600,0,1.0,.16,"sine");
  tone(900,1.06,1.0,.16,"sine");
  tone(1050,2.18,.18,.10,"sine");
}
function keyUpTone(){
  // Very short transmitter key chirp/click.
  noiseBurst(0,.028,.035);
  tone(1450,.008,.035,.035,"square");
}
function keyDownTone(){
  // Squelch tail / mic release click.
  noiseBurst(0,.075,.045);
  tone(420,.012,.055,.025,"square");
}
function channelChangeTone(){
  tone(900,0,.045,.04,"sine");
  tone(1120,.055,.045,.035,"sine");
}
function emergencyTone(){
  for(let i=0;i<4;i++){
    tone(1100,i*.42,.17,.13,"square");
    tone(720,i*.42+.19,.17,.13,"square");
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
