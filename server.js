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

const VALID_CHANNELS = new Set(["Dispatch", "Fireground 1", "Fireground 2", "Command"]);

function safeChannel(value) {
  const v = String(value || "Dispatch");
  return VALID_CHANNELS.has(v) ? v : "Dispatch";
}

function peerListFor(socketId) {
  const me = clients.get(socketId);
  if (!me) return [];
  return [...clients.entries()]
    .filter(([id, info]) => id !== socketId && info.channel === me.channel)
    .map(([id, info]) => ({ id, unit: info.unit, channel: info.channel }));
}

function emitRoster() {
  const roster = [...clients.entries()].map(([id, info]) => ({
    id,
    unit: info.unit,
    channel: info.channel
  }));
  io.emit("roster", roster);
  io.emit("user-count", clients.size);
}

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    service: "Liberty City Radio Relay v5.2",
    voice: "WebRTC PTT",
    channels: [...VALID_CHANNELS]
  });
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
  clients.set(socket.id, { unit: "Unknown Unit", channel: "Dispatch" });

  socket.emit("recent", recent.slice(0, 10));
  socket.emit("peer-list", peerListFor(socket.id));
  emitRoster();

  socket.on("register", data => {
    const current = clients.get(socket.id) || {};
    const unit = String(data?.unit || current.unit || "Unknown Unit").trim().slice(0, 60) || "Unknown Unit";
    const channel = safeChannel(data?.channel || current.channel || "Dispatch");
    const oldChannel = current.channel;

    clients.set(socket.id, { unit, channel });

    if (oldChannel !== channel) {
      socket.broadcast.emit("peer-left", { id: socket.id });
      socket.emit("peer-list", peerListFor(socket.id));

      for (const [id, info] of clients) {
        if (id !== socket.id && info.channel === channel) {
          io.to(id).emit("peer-joined", { id: socket.id, unit, channel });
        }
      }
    } else {
      socket.broadcast.emit("peer-updated", { id: socket.id, unit, channel });
    }

    emitRoster();
  });

  socket.on("webrtc-offer", ({ target, sdp }) => {
    const me = clients.get(socket.id), them = clients.get(target);
    if (me && them && me.channel === them.channel) {
      io.to(target).emit("webrtc-offer", { from: socket.id, sdp });
    }
  });

  socket.on("webrtc-answer", ({ target, sdp }) => {
    const me = clients.get(socket.id), them = clients.get(target);
    if (me && them && me.channel === them.channel) {
      io.to(target).emit("webrtc-answer", { from: socket.id, sdp });
    }
  });

  socket.on("webrtc-ice", ({ target, candidate }) => {
    const me = clients.get(socket.id), them = clients.get(target);
    if (me && them && me.channel === them.channel) {
      io.to(target).emit("webrtc-ice", { from: socket.id, candidate });
    }
  });

  socket.on("ptt:start", () => {
    const me = clients.get(socket.id);
    if (!me) return;
    for (const [id, info] of clients) {
      if (id !== socket.id && info.channel === me.channel) {
        io.to(id).emit("ptt:start", {
          id: socket.id,
          unit: me.unit,
          channel: me.channel,
          at: new Date().toISOString()
        });
      }
    }
  });

  socket.on("ptt:stop", () => {
    const me = clients.get(socket.id);
    if (!me) return;
    for (const [id, info] of clients) {
      if (id !== socket.id && info.channel === me.channel) {
        io.to(id).emit("ptt:stop", {
          id: socket.id,
          unit: me.unit,
          channel: me.channel,
          at: new Date().toISOString()
        });
      }
    }
  });

  socket.on("emergency", () => {
    const me = clients.get(socket.id);
    if (!me) return;
    io.emit("emergency", {
      id: socket.id,
      unit: me.unit,
      channel: me.channel,
      at: new Date().toISOString()
    });
  });

  socket.on("disconnect", () => {
    clients.delete(socket.id);
    io.emit("peer-left", { id: socket.id });
    emitRoster();
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Liberty City Radio Relay v5.2 listening on port ${PORT}`);
});
