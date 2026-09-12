require("dotenv").config();

const path = require("path");
const http = require("http");
const express = require("express");
const cors = require("cors");
const { Server } = require("socket.io");

const { connectedUsers, registerUserHandlers } = require("./sockets/userHandler");
const { registerChatHandlers } = require("./sockets/chatHandler");

const app = express();
const server = http.createServer(app);

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "assignment-13-chat-socket" });
});

const io = new Server(server, {
  cors: {
    origin: true,
    methods: ["GET", "POST"]
  },
  transports: ["websocket", "polling"],
  pingInterval: 25000,
  pingTimeout: 20000,
  maxHttpBufferSize: 1e6
});

io.on("connection", (socket) => {
  registerUserHandlers(io, socket);
  registerChatHandlers(io, socket, connectedUsers);
});

const PORT = Number(process.env.PORT) || 5050;

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`Chat server running at http://localhost:${PORT}`);
  });
}

module.exports = { app, server, io };