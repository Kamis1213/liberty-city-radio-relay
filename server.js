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

app.get("/health", (req, res) => {
  res.json({ ok: true, service: "Liberty City Radio Relay v5" });
});

app.get("/api/recent", (req, res) => {
  res.json(recent);
});

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
  socket.emit("recent", recent.slice(0, 10));

  socket.on("ptt:start", data => {
    socket.broadcast.emit("ptt:start", {
      unit: String(data?.unit || "Unknown Unit"),
      at: new Date().toISOString()
    });
  });

  socket.on("ptt:stop", data => {
    socket.broadcast.emit("ptt:stop", {
      unit: String(data?.unit || "Unknown Unit"),
      at: new Date().toISOString()
    });
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Liberty City Radio Relay v5 listening on port ${PORT}`);
});
