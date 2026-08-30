const socket = io();
const conn = document.getElementById("conn");
const feed = document.getElementById("feed");
const audioBtn = document.getElementById("audio");
const ptt = document.getElementById("ptt");
const unit = document.getElementById("unit");
const alertBox = document.getElementById("alert");

let ctx = null;
let audioOn = false;

socket.on("connect", () => conn.textContent = "ONLINE");
socket.on("disconnect", () => conn.textContent = "OFFLINE");

function esc(v){
  return String(v ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;");
}

function addDispatch(d){
  const div = document.createElement("div");
  div.className = "feeditem";
  div.innerHTML = `<strong>${esc(d.priority)} — ${esc(d.incidentNumber)}</strong><br>${esc(d.callType)}<br>${esc(d.address)}<br>${esc(d.units)}<br><small>${esc(d.notes)}</small>`;
  feed.prepend(div);
}

function tone(freq,start,dur,vol=.15){
  if(!audioOn || !ctx || ctx.state!=="running") return;
  const o=ctx.createOscillator(), g=ctx.createGain(), t=ctx.currentTime+start;
  o.frequency.value=freq; o.type="sine";
  g.gain.setValueAtTime(.0001,t);
  g.gain.exponentialRampToValueAtTime(vol,t+.02);
  g.gain.exponentialRampToValueAtTime(.0001,t+dur);
  o.connect(g); g.connect(ctx.destination); o.start(t); o.stop(t+dur+.03);
}

function alertTone(){
  tone(650,0,.7,.16); tone(950,0,.7,.12);
  tone(790,.82,.85,.16); tone(1090,.82,.85,.12);
}

socket.on("recent", items => items.slice().reverse().forEach(addDispatch));

socket.on("dispatch", d => {
  addDispatch(d);
  alertBox.innerHTML = `<h2>${esc(d.priority)} — ${esc(d.incidentNumber)}</h2><strong>${esc(d.callType)}</strong><br>${esc(d.address)}<br>${esc(d.units)}<br><button id="ack">ACKNOWLEDGE</button>`;
  alertBox.classList.remove("hidden");
  document.getElementById("ack").onclick = () => alertBox.classList.add("hidden");
  alertTone();
  if(audioOn && "speechSynthesis" in window){
    setTimeout(()=>{
      speechSynthesis.cancel();
      const u=new SpeechSynthesisUtterance(`${d.units}. Respond to ${d.callType}, at ${d.address}.`);
      u.rate=.92; u.pitch=.95;
      speechSynthesis.speak(u);
    },1900);
  }
});

audioBtn.onclick = async () => {
  const A=window.AudioContext||window.webkitAudioContext;
  if(!ctx) ctx=new A();
  await ctx.resume();
  audioOn=ctx.state==="running";
  audioBtn.textContent=audioOn?"Radio Audio: ON":"Enable Radio Audio";
  tone(700,0,.15,.1); tone(950,.2,.2,.1);
};

function startPTT(){
  ptt.textContent="TRANSMITTING";
  socket.emit("ptt:start",{unit:unit.value||"Unknown Unit"});
}
function stopPTT(){
  ptt.textContent="HOLD TO TALK";
  socket.emit("ptt:stop",{unit:unit.value||"Unknown Unit"});
}
ptt.addEventListener("mousedown",startPTT);
ptt.addEventListener("mouseup",stopPTT);
ptt.addEventListener("mouseleave",stopPTT);
ptt.addEventListener("touchstart",e=>{e.preventDefault();startPTT()},{passive:false});
ptt.addEventListener("touchend",e=>{e.preventDefault();stopPTT()},{passive:false});
