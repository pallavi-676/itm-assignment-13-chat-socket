const test = require("node:test");
const assert = require("node:assert/strict");
const { io: Client } = require("socket.io-client");
const { server } = require("../server");

let port;

function connectClient() {
  return new Promise((resolve, reject) => {
    const client = Client(`http://localhost:${port}`, {
      transports: ["websocket"],
      forceNew: true,
      reconnection: false
    });
    client.once("connect", () => resolve(client));
    client.once("connect_error", reject);
  });
}

function login(client, username) {
  return new Promise((resolve) => {
    client.emit("user:login", { username, avatar: "orbit" }, resolve);
  });
}

function join(client, room) {
  return new Promise((resolve) => {
    client.emit("room:join", { room }, resolve);
  });
}

test.before(async () => {
  await new Promise((resolve) => {
    server.listen(0, () => {
      port = server.address().port;
      resolve();
    });
  });
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

test("login, room isolation, typing and DM delivery", async () => {
  const aarav = await connectClient();
  const priya = await connectClient();
  const rohan = await connectClient();

  try {
    assert.equal((await login(aarav, "Aarav")).ok, true);
    assert.equal((await login(priya, "Priya")).ok, true);
    assert.equal((await login(rohan, "Rohan")).ok, true);

    assert.equal((await join(aarav, "developers")).ok, true);
    assert.equal((await join(priya, "developers")).ok, true);
    assert.equal((await join(rohan, "random")).ok, true);

    const groupMessage = new Promise((resolve) => {
      priya.once("chat:receive", resolve);
    });

    const rohanMessages = [];
    rohan.on("chat:receive", (message) => rohanMessages.push(message));

    aarav.emit("chat:send", { room: "developers", message: "Hello Priya" });

    const received = await Promise.race([
      groupMessage,
      new Promise((_, reject) => setTimeout(() => reject(new Error("Group message timeout")), 1500))
    ]);

    assert.equal(received.message, "Hello Priya");
    assert.equal(rohanMessages.length, 0);

    const typing = new Promise((resolve) => {
      priya.once("typing:update", resolve);
    });

    aarav.emit("typing:start", { room: "developers" });

    const typingEvent = await Promise.race([
      typing,
      new Promise((_, reject) => setTimeout(() => reject(new Error("Typing timeout")), 1500))
    ]);

    assert.deepEqual(typingEvent, { username: "Aarav", isTyping: true });

    const dm = new Promise((resolve) => {
      priya.once("direct:receive", resolve);
    });

    const dmAck = new Promise((resolve) => {
      aarav.emit("direct:send", { recipientId: priya.id, message: "Private hello" }, resolve);
    });

    const [dmMessage, ack] = await Promise.all([
      Promise.race([
        dm,
        new Promise((_, reject) => setTimeout(() => reject(new Error("DM timeout")), 1500))
      ]),
      dmAck
    ]);

    assert.equal(ack.ok, true);
    assert.equal(dmMessage.message, "Private hello");
    assert.equal(dmMessage.from, "Aarav");
  } finally {
    aarav.disconnect();
    priya.disconnect();
    rohan.disconnect();
  }
});

test("room history is capped at 50 messages", async () => {
  const client = await connectClient();

  try {
    assert.equal((await login(client, "HistoryTester")).ok, true);

    const roomName = `test-${Date.now().toString(36)}`;

    const created = await new Promise((resolve) => {
      client.emit("room:create", { room: roomName }, resolve);
    });
    assert.equal(created.ok, true);

    await join(client, roomName);

    for (let i = 0; i < 55; i += 1) {
      await new Promise((resolve) => {
        client.emit("chat:send", { room: roomName, message: `message-${i}` }, resolve);
      });
    }

    const history = await new Promise((resolve) => {
      const timer = setTimeout(() => resolve(null), 1500);
      client.once("room:history", (payload) => {
        clearTimeout(timer);
        resolve(payload);
      });
      client.emit("room:join", { room: roomName });
    });

    assert.ok(history);
    assert.equal(history.messages.length, 50);
    assert.equal(history.messages[0].message, "message-5");
    assert.equal(history.messages[49].message, "message-54");
  } finally {
    client.disconnect();
  }
});