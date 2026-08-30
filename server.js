const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: true, credentials: true } });
const PORT = process.env.PORT || 3100;

app.use(express.json({ limit: "256kb" }));
app.use(express.static(path.join(__dirname, "public")));

const recent = [];
const MAX_RECENT = 50;
const clients = new Map();

app.get("/health", (req, res) => {
  res.json({ ok: true, service: "Liberty City Radio Relay v5.1", voice: "WebRTC PTT" });
});

app.get("/api/recent", (req, res) => res.json(recent));

app.post("/dispatch", (req, res) => {
  const incident = {
    incidentNumber: String(req.body.incidentNumber || "").trim(),
    priority: String(req.body.priority || "PRIORITY 2").trim(),
    callType: String(req.body.callType || "").trim(),
    address: String(req.body.address || "").trim(),
    units: String(req.body.units || "").trim(),
    notes: String(req.body.notes || "").trim(),
    receivedAt: new Date().toISOString()
  };

  if (!incident.incidentNumber || !incident.callType || !incident.address) {
    return res.status(400).json({ ok: false, error: "Missing incidentNumber, callType, or address" });
  }

  recent.unshift(incident);
  if (recent.length > MAX_RECENT) recent.pop();
  io.emit("dispatch", incident);
  console.log(`[DISPATCH] ${incident.incidentNumber} ${incident.callType} @ ${incident.address}`);
  res.json({ ok: true, relayed: true });
});

io.on("connection", socket => {
  clients.set(socket.id, { unit: "Unknown Unit" });

  socket.emit("recent", recent.slice(0, 10));
  socket.emit("peer-list", [...clients.entries()]
    .filter(([id]) => id !== socket.id)
    .map(([id, info]) => ({ id, unit: info.unit })));

  socket.on("register", data => {
    const unit = String(data?.unit || "Unknown Unit").trim().slice(0, 60) || "Unknown Unit";
    clients.set(socket.id, { unit });
    socket.broadcast.emit("peer-joined", { id: socket.id, unit });
    io.emit("user-count", clients.size);
  });

  // WebRTC signaling only. Actual microphone audio travels browser-to-browser.
  socket.on("webrtc-offer", ({ target, sdp }) => {
    if (clients.has(target)) io.to(target).emit("webrtc-offer", { from: socket.id, sdp });
  });
  socket.on("webrtc-answer", ({ target, sdp }) => {
    if (clients.has(target)) io.to(target).emit("webrtc-answer", { from: socket.id, sdp });
  });
  socket.on("webrtc-ice", ({ target, candidate }) => {
    if (clients.has(target)) io.to(target).emit("webrtc-ice", { from: socket.id, candidate });
  });

  socket.on("ptt:start", () => {
    const unit = clients.get(socket.id)?.unit || "Unknown Unit";
    socket.broadcast.emit("ptt:start", { id: socket.id, unit, at: new Date().toISOString() });
  });
  socket.on("ptt:stop", () => {
    const unit = clients.get(socket.id)?.unit || "Unknown Unit";
    socket.broadcast.emit("ptt:stop", { id: socket.id, unit, at: new Date().toISOString() });
  });

  socket.on("disconnect", () => {
    clients.delete(socket.id);
    socket.broadcast.emit("peer-left", { id: socket.id });
    io.emit("user-count", clients.size);
  });

  io.emit("user-count", clients.size);
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Liberty City Radio Relay v5.1 listening on port ${PORT}`);
});
