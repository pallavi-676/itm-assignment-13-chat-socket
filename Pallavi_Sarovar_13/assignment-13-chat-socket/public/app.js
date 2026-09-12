/* =========================================================
   OBSIDIAN CHAT
   Real-Time Group Chat & Direct Messaging
   Frontend Client
   ========================================================= */

const socket = io({
  transports: ["websocket", "polling"],
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 500,
  reconnectionDelayMax: 3000,
  timeout: 10000
});

/* =========================================================
   AVATARS
   ========================================================= */

const AVATARS = {
  orbit: "✦",
  spark: "✧",
  moon: "◐",
  star: "★",
  wave: "≈",
  leaf: "⌁"
};

/* =========================================================
   USER ID
   ========================================================= */

/*
 * The backend requires a userId during login.
 *
 * Socket.io's socket.id is NOT stable because it changes
 * whenever the browser reconnects.
 *
 * Therefore we create one stable userId and keep it in
 * localStorage.
 */

const USER_ID_STORAGE_KEY =
  "obsidian-chat-user-id";

function createUserId() {
  if (
    window.crypto &&
    typeof window.crypto.randomUUID === "function"
  ) {
    return window.crypto.randomUUID();
  }

  return (
    "user_" +
    Date.now() +
    "_" +
    Math.random()
      .toString(36)
      .slice(2, 12)
  );
}

function getStableUserId() {
  try {
    const existing =
      localStorage.getItem(
        USER_ID_STORAGE_KEY
      );

    if (
      existing &&
      /^[a-zA-Z0-9_-]{4,100}$/.test(existing)
    ) {
      return existing;
    }

    const userId =
      createUserId();

    localStorage.setItem(
      USER_ID_STORAGE_KEY,
      userId
    );

    return userId;
  } catch (_) {
    /*
     * localStorage may be unavailable in some
     * browser privacy modes.
     */
    if (!getStableUserId.memoryId) {
      getStableUserId.memoryId =
        createUserId();
    }

    return getStableUserId.memoryId;
  }
}

/* =========================================================
   APPLICATION STATE
   ========================================================= */

const state = {
  user: null,

  selectedAvatar: "orbit",

  currentRoom: "general",

  rooms: new Map(),
  histories: new Map(),
  unreadRooms: new Map(),

  members: [],

  typing: new Set(),
  typingTimer: null,

  dmTarget: null,
  dmConversations: new Map(),

  inviteToken:
    new URLSearchParams(
      window.location.search
    ).get("invite"),

  pendingInviteRoom: null,

  hasLoggedIn: false,
  isLoggingIn: false,
  isJoiningRoom: false
};

/* =========================================================
   DOM HELPERS
   ========================================================= */

const $ = (id) =>
  document.getElementById(id);

function on(id, event, handler) {
  const element = $(id);

  if (element) {
    element.addEventListener(
      event,
      handler
    );
  }

  return element;
}

/* =========================================================
   SECURITY
   ========================================================= */

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/* =========================================================
   UI HELPERS
   ========================================================= */

function showToast(message) {
  const toast = $("toast");

  if (!toast) return;

  toast.textContent = message;

  toast.classList.add("show");

  clearTimeout(
    showToast.timer
  );

  showToast.timer =
    setTimeout(() => {
      toast.classList.remove(
        "show"
      );
    }, 2400);
}

function openModal(id) {
  const modal = $(id);

  if (modal) {
    modal.classList.remove(
      "hidden"
    );
  }
}

function closeModal(id) {
  const modal = $(id);

  if (modal) {
    modal.classList.add(
      "hidden"
    );
  }
}

/* =========================================================
   AVATAR RENDERING
   ========================================================= */

function renderAvatar(
  element,
  avatar
) {
  if (!element) return;

  const key =
    AVATARS[avatar]
      ? avatar
      : "orbit";

  element.textContent =
    AVATARS[key];

  element.dataset.avatar =
    key;
}

function initializeAvatars() {
  const picker =
    $("avatarPicker");

  if (!picker) return;

  picker.innerHTML =
    Object.entries(
      AVATARS
    )
      .map(
        ([key, symbol]) => {
          return `
            <button
              type="button"
              class="avatar-option ${
                key ===
                state.selectedAvatar
                  ? "selected"
                  : ""
              }"
              data-avatar="${escapeHtml(
                key
              )}"
              aria-label="Choose ${escapeHtml(
                key
              )} avatar"
            >
              ${symbol}
            </button>
          `;
        }
      )
      .join("");

  picker.addEventListener(
    "click",
    (event) => {
      const button =
        event.target.closest(
          ".avatar-option"
        );

      if (!button) return;

      const avatar =
        button.dataset.avatar;

      if (!AVATARS[avatar]) {
        return;
      }

      state.selectedAvatar =
        avatar;

      picker
        .querySelectorAll(
          ".avatar-option"
        )
        .forEach(
          (element) => {
            element.classList.remove(
              "selected"
            );
          }
        );

      button.classList.add(
        "selected"
      );
    }
  );
}

/* =========================================================
   CONNECTION STATUS
   ========================================================= */

function setConnection(
  connected
) {
  const connectionText =
    $("connectionText");

  const navConnectionText =
    $("navConnectionText");

  const connectionDot =
    $("connectionDot");

  const navConnectionDot =
    $("navConnectionDot");

  if (connectionText) {
    connectionText.textContent =
      connected
        ? "Connected"
        : "Reconnecting";
  }

  if (navConnectionText) {
    navConnectionText.textContent =
      connected
        ? "Online"
        : "Reconnecting";
  }

  connectionDot?.classList.toggle(
    "offline",
    !connected
  );

  navConnectionDot?.classList.toggle(
    "offline",
    !connected
  );
}

/* =========================================================
   ROOM MANAGEMENT
   ========================================================= */

function seedRooms(rooms) {
  if (!Array.isArray(rooms)) {
    return;
  }

  for (const roomData of rooms) {
    const room =
      typeof roomData === "string"
        ? roomData
        : roomData?.room;

    if (!room) continue;

    if (!state.rooms.has(room)) {
      state.rooms.set(room, {
        room,

        description:
          typeof roomData ===
            "object" &&
          roomData.description
            ? roomData.description
            : room === "general"
              ? "A quiet place to start a conversation."
              : `The ${room} room.`
      });
    } else if (
      typeof roomData ===
        "object" &&
      roomData.description
    ) {
      const existing =
        state.rooms.get(room);

      state.rooms.set(room, {
        ...existing,
        ...roomData
      });
    }
  }

  renderRoomList();
}

function renderRoomList() {
  const list =
    $("roomList");

  if (!list) return;

  const rooms = [
    ...state.rooms.values()
  ];

  list.innerHTML =
    rooms
      .map(({ room }) => {
        const unread =
          state.unreadRooms.get(
            room
          ) || 0;

        return `
          <button
            type="button"
            class="room-item ${
              state.currentRoom === room
                ? "active"
                : ""
            }"
            data-room="${escapeHtml(
              room
            )}"
          >
            <span class="room-name">
              <b>#</b>
              ${escapeHtml(room)}
            </span>

            ${
              unread
                ? `
                  <span class="unread">
                    ${
                      unread > 99
                        ? "99+"
                        : unread
                    }
                  </span>
                `
                : ""
            }
          </button>
        `;
      })
      .join("");
}

function showWelcome(room) {
  return `
    <div class="welcome-card">
      <p class="eyebrow">
        ROOM HISTORY
      </p>

      <h3>
        Welcome to #${escapeHtml(
          room
        )}
      </h3>

      <p>
        Messages are kept in memory,
        with the latest 50 messages
        replayed when someone joins.
      </p>
    </div>
  `;
}

/* =========================================================
   MESSAGE RENDERING
   ========================================================= */

function renderMessage(
  message
) {
  const own =
    message.senderId ===
    state.user?.socketId;

  const avatar =
    AVATARS[message.avatar]
      ? message.avatar
      : "orbit";

  return `
    <article
      class="message-row ${
        own ? "own" : ""
      }"
      data-message-id="${escapeHtml(
        message.id
      )}"
    >
      <div
        class="message-avatar"
        data-avatar="${escapeHtml(
          avatar
        )}"
      >
        ${AVATARS[avatar]}
      </div>

      <div class="message-content">

        <div class="message-meta">
          <span class="sender">
            ${escapeHtml(
              own
                ? "You"
                : message.sender
            )}
          </span>

          <span class="message-time">
            ${escapeHtml(
              message.timestamp
            )}
          </span>
        </div>

        <div class="message-bubble">
          ${escapeHtml(
            message.message
          )}
        </div>

      </div>
    </article>
  `;
}

function renderHistory(room) {
  const container =
    $("messages");

  if (!container) return;

  const messages =
    state.histories.get(
      room
    ) || [];

  container.innerHTML =
    showWelcome(room) +
    messages
      .map(renderMessage)
      .join("");

  requestAnimationFrame(
    () => {
      container.scrollTop =
        container.scrollHeight;
    }
  );
}

function appendMessage(
  message
) {
  const container =
    $("messages");

  if (!container) return;

  if (!message?.id) return;

  const existing =
    container.querySelector(
      `[data-message-id="${CSS.escape(
        message.id
      )}"]`
    );

  if (existing) return;

  container.insertAdjacentHTML(
    "beforeend",
    renderMessage(message)
  );

  container.scrollTop =
    container.scrollHeight;
}

/* =========================================================
   MEMBERS
   ========================================================= */

function renderMembers() {
  const list =
    $("membersList");

  if (!list) return;

  const users =
    Array.isArray(
      state.members
    )
      ? state.members
      : [];

  if ($("memberCount")) {
    $("memberCount").textContent =
      users.length;
  }

  list.innerHTML =
    users
      .map((member) => {
        const isMe =
          member.socketId ===
          state.user?.socketId;

        const avatar =
          AVATARS[member.avatar]
            ? member.avatar
            : "orbit";

        return `
          <div class="member">

            <div
              class="avatar"
              data-avatar="${escapeHtml(
                avatar
              )}"
            >
              ${AVATARS[avatar]}
            </div>

            <div class="member-info">

              <strong>
                ${escapeHtml(
                  member.username
                )}
                ${
                  isMe
                    ? " (You)"
                    : ""
                }
              </strong>

              <span>
                ● Online
              </span>

            </div>

            ${
              !isMe
                ? `
                  <button
                    type="button"
                    class="dm-button"
                    data-dm="${escapeHtml(
                      member.socketId
                    )}"
                  >
                    DM
                  </button>
                `
                : ""
            }

          </div>
        `;
      })
      .join("");

  /*
   * Refresh DM target if the other user
   * received a new socket ID after reconnect.
   */
  if (state.dmTarget) {
    const updatedMember =
      users.find(
        (member) =>
          member.userId ===
            state.dmTarget.userId ||
          member.username ===
            state.dmTarget.username
      );

    if (updatedMember) {
      state.dmTarget =
        updatedMember;

      const dmName =
        $("dmName");

      if (dmName) {
        dmName.textContent =
          updatedMember.username;
      }

      renderAvatar(
        $("dmAvatar"),
        updatedMember.avatar
      );
    }
  }
}

/* =========================================================
   ROOM SWITCHING
   ========================================================= */

function setRoom(room) {
  if (!room || !state.user) {
    return;
  }

  const normalizedRoom =
    String(room)
      .trim()
      .replace(/^#+/, "")
      .toLowerCase();

  if (!normalizedRoom) {
    return;
  }

  if (
    state.isJoiningRoom &&
    state.currentRoom ===
      normalizedRoom
  ) {
    return;
  }

  const previousRoom =
    state.currentRoom;

  state.currentRoom =
    normalizedRoom;

  state.unreadRooms.set(
    normalizedRoom,
    0
  );

  const info =
    state.rooms.get(
      normalizedRoom
    ) || {
      room: normalizedRoom
    };

  if ($("roomTitle")) {
    $("roomTitle").textContent =
      normalizedRoom;
  }

  if ($("roomDescription")) {
    $("roomDescription").textContent =
      info.description ||
      `The ${normalizedRoom} room.`;
  }

  renderRoomList();

  renderHistory(
    normalizedRoom
  );

  if ($("typingText")) {
    $("typingText").textContent =
      "";
  }

  state.typing.clear();

  stopTyping(
    previousRoom
  );

  state.isJoiningRoom =
    true;

  socket.emit(
    "room:join",
    {
      room: normalizedRoom
    },
    (response) => {
      state.isJoiningRoom =
        false;

      if (!response?.ok) {
        showToast(
          response?.error ||
            "Could not join room."
        );

        if (previousRoom) {
          state.currentRoom =
            previousRoom;

          state.unreadRooms.set(
            previousRoom,
            0
          );

          const previousInfo =
            state.rooms.get(
              previousRoom
            );

          if ($("roomTitle")) {
            $("roomTitle").textContent =
              previousRoom;
          }

          if (
            $("roomDescription")
          ) {
            $(
              "roomDescription"
            ).textContent =
              previousInfo
                ?.description ||
              `The ${previousRoom} room.`;
          }

          renderRoomList();

          renderHistory(
            previousRoom
          );
        }
      }
    }
  );
}

/* =========================================================
   TYPING
   ========================================================= */

function startTyping() {
  if (
    !state.user ||
    !state.currentRoom
  ) {
    return;
  }

  socket.emit(
    "typing:start",
    {
      room:
        state.currentRoom
    }
  );

  clearTimeout(
    state.typingTimer
  );

  state.typingTimer =
    setTimeout(() => {
      stopTyping();
    }, 1500);
}

function stopTyping(
  roomOverride = null
) {
  clearTimeout(
    state.typingTimer
  );

  state.typingTimer = null;

  const room =
    roomOverride ||
    state.currentRoom;

  if (!state.user || !room) {
    return;
  }

  socket.emit(
    "typing:stop",
    {
      room
    }
  );
}

function renderTyping() {
  const element =
    $("typingText");

  if (!element) return;

  const names = [
    ...state.typing
  ];

  if (names.length === 0) {
    element.textContent = "";
    return;
  }

  if (names.length === 1) {
    element.textContent =
      `${names[0]} is typing...`;
    return;
  }

  element.textContent =
    `${names
      .slice(0, 2)
      .join(
        " and "
      )} are typing...`;
}

/* =========================================================
   NOTIFICATION SOUND
   ========================================================= */

let audioContext = null;

function playNotification() {
  try {
    const AudioContext =
      window.AudioContext ||
      window.webkitAudioContext;

    if (!AudioContext) return;

    if (!audioContext) {
      audioContext =
        new AudioContext();
    }

    if (
      audioContext.state ===
      "suspended"
    ) {
      audioContext
        .resume()
        .catch(() => {});
    }

    const oscillator =
      audioContext.createOscillator();

    const gain =
      audioContext.createGain();

    const now =
      audioContext.currentTime;

    oscillator.frequency.setValueAtTime(
      660,
      now
    );

    gain.gain.setValueAtTime(
      0.0001,
      now
    );

    gain.gain.exponentialRampToValueAtTime(
      0.045,
      now + 0.01
    );

    gain.gain.exponentialRampToValueAtTime(
      0.0001,
      now + 0.09
    );

    oscillator.connect(gain);

    gain.connect(
      audioContext.destination
    );

    oscillator.start(now);

    oscillator.stop(
      now + 0.1
    );
  } catch (_) {
    /*
     * Notification audio is optional.
     */
  }
}

/* =========================================================
   DIRECT MESSAGES
   ========================================================= */

function openDm(socketId) {
  const member =
    state.members.find(
      (item) =>
        item.socketId ===
        socketId
    );

  if (!member) {
    showToast(
      "That user is no longer online."
    );

    return;
  }

  state.dmTarget =
    member;

  if ($("dmName")) {
    $("dmName").textContent =
      member.username;
  }

  renderAvatar(
    $("dmAvatar"),
    member.avatar
  );

  $("dmPanel")?.classList.remove(
    "hidden"
  );

  renderDmConversation(
    member.socketId
  );

  $("dmInput")?.focus();
}

function renderDmConversation(
  socketId
) {
  const container =
    $("dmMessages");

  if (!container) return;

  const messages =
    state.dmConversations.get(
      socketId
    ) || [];

  container.innerHTML =
    messages
      .map((message) => {
        const own =
          message.fromId ===
          state.user?.socketId;

        return `
          <div
            class="dm-message ${
              own ? "own" : ""
            }"
            data-dm-id="${escapeHtml(
              message.id
            )}"
          >
            <div>
              <p>
                ${escapeHtml(
                  message.message
                )}
              </p>

              <span class="dm-time">
                ${escapeHtml(
                  message.timestamp
                )}
              </span>
            </div>
          </div>
        `;
      })
      .join("");

  container.scrollTop =
    container.scrollHeight;
}

function getDmConversationKey(
  message
) {
  if (
    !message ||
    !state.user
  ) {
    return null;
  }

  if (
    message.fromId ===
    state.user.socketId
  ) {
    return message.toId;
  }

  return message.fromId;
}

function appendDm(message) {
  if (
    !message ||
    !state.user
  ) {
    return;
  }

  const targetId =
    getDmConversationKey(
      message
    );

  if (!targetId) return;

  if (
    !state.dmConversations.has(
      targetId
    )
  ) {
    state.dmConversations.set(
      targetId,
      []
    );
  }

  const conversation =
    state.dmConversations.get(
      targetId
    );

  if (
    conversation.some(
      (item) =>
        item.id ===
        message.id
    )
  ) {
    return;
  }

  conversation.push(
    message
  );

  if (
    conversation.length >
    200
  ) {
    conversation.splice(
      0,
      conversation.length - 200
    );
  }

  if (
    state.dmTarget &&
    state.dmTarget.socketId ===
      targetId
  ) {
    renderDmConversation(
      targetId
    );
  }
}

function replaceOptimisticDm(
  targetId,
  optimisticId,
  serverMessage
) {
  const conversation =
    state.dmConversations.get(
      targetId
    );

  if (!conversation) {
    return;
  }

  const index =
    conversation.findIndex(
      (message) =>
        message.id ===
        optimisticId
    );

  if (index >= 0) {
    conversation[index] =
      serverMessage;
  } else if (
    !conversation.some(
      (message) =>
        message.id ===
        serverMessage.id
    )
  ) {
    conversation.push(
      serverMessage
    );
  }

  renderDmConversation(
    targetId
  );
}

/* =========================================================
   INVITES
   ========================================================= */

function createInviteLink(
  token
) {
  return (
    `${window.location.origin}` +
    `${window.location.pathname}` +
    `?invite=${encodeURIComponent(
      token
    )}`
  );
}

function handleInviteAfterLogin() {
  if (!state.inviteToken) {
    return;
  }

  socket.emit(
    "room:invite:resolve",
    {
      token:
        state.inviteToken
    },
    (response) => {
      if (!response?.ok) {
        showToast(
          response?.error ||
            "Invite is invalid."
        );

        history.replaceState(
          {},
          document.title,
          window.location.pathname
        );

        state.inviteToken =
          null;

        return;
      }

      state.pendingInviteRoom =
        response.room;

      const room =
        response.room;

      const shouldJoin =
        window.confirm(
          `You've been invited to #${room}. Join this room?`
        );

      if (shouldJoin) {
        if (
          !state.rooms.has(
            room
          )
        ) {
          state.rooms.set(
            room,
            {
              room,
              description:
                `The ${room} room.`
            }
          );

          renderRoomList();
        }

        setRoom(room);
      }

      history.replaceState(
        {},
        document.title,
        window.location.pathname
      );

      state.inviteToken =
        null;
    }
  );
}

/* =========================================================
   LOGIN
   ========================================================= */

function performLogin() {
  const input =
    $("usernameInput");

  if (!input) return;

  const username =
    input.value.trim();

  const loginError =
    $("loginError");

  if (loginError) {
    loginError.textContent =
      "";
  }

  if (!username) {
    if (loginError) {
      loginError.textContent =
        "Please enter your name.";
    }

    return;
  }

  if (state.isLoggingIn) {
    return;
  }

  if (!socket.connected) {
    showToast(
      "Connecting to the chat server..."
    );

    return;
  }

  state.isLoggingIn =
    true;

  /*
   * IMPORTANT:
   * userId is required by userHandler.js.
   *
   * The ID remains stable even when Socket.io
   * reconnects and receives a new socket.id.
   */
  socket.emit(
    "user:login",
    {
      userId:
        getStableUserId(),

      username,

      avatar:
        state.selectedAvatar
    },
    (response) => {
      state.isLoggingIn =
        false;

      if (!response?.ok) {
        if (loginError) {
          loginError.textContent =
            response?.error ||
            "Login failed.";
        }

        return;
      }
    }
  );
}

/* =========================================================
   SOCKET CONNECTION
   ========================================================= */

socket.on(
  "connect",
  () => {
    setConnection(true);

    /*
     * On reconnect Socket.io creates a NEW socket.id.
     *
     * We therefore authenticate again with the SAME
     * stable userId.
     */
    if (state.user) {
      const previousRoom =
        state.currentRoom;

      socket.emit(
        "user:login",
        {
          userId:
            state.user.userId ||
            getStableUserId(),

          username:
            state.user.username,

          avatar:
            state.user.avatar
        },
        (response) => {
          if (!response?.ok) {
            showToast(
              response?.error ||
                "Reconnection login failed."
            );

            return;
          }

          /*
           * user:login:success updates state.user
           * with the new socket.id.
           */
          if (previousRoom) {
            setRoom(
              previousRoom
            );
          }
        }
      );
    }
  }
);

socket.on(
  "disconnect",
  () => {
    setConnection(false);

    state.typing.clear();

    renderTyping();
  }
);

socket.on(
  "connect_error",
  () => {
    setConnection(false);
  }
);

/* =========================================================
   LOGIN SUCCESS
   ========================================================= */

socket.on(
  "user:login:success",
  (response) => {
    if (!response?.ok) {
      return;
    }

    const wasAlreadyLoggedIn =
      state.hasLoggedIn;

    const desiredRoom =
      state.currentRoom ||
      "general";

    /*
     * Make sure the server returned the
     * identity fields expected by the client.
     */
    if (
      !response.user ||
      !response.user.userId ||
      !response.user.socketId
    ) {
      showToast(
        "Server returned an invalid user identity."
      );

      return;
    }

    state.user =
      response.user;

    state.hasLoggedIn =
      true;

    state.isLoggingIn =
      false;

    $("loginView")?.classList.add(
      "hidden"
    );

    $("appView")?.classList.remove(
      "hidden"
    );

    renderAvatar(
      $("currentUserAvatar"),
      state.user.avatar
    );

    seedRooms(
      response.rooms ||
        [
          "general",
          "developers",
          "random"
        ]
    );

    const roomToJoin =
      wasAlreadyLoggedIn
        ? desiredRoom
        : "general";

    state.currentRoom =
      roomToJoin;

    setRoom(
      roomToJoin
    );

    if (!wasAlreadyLoggedIn) {
      handleInviteAfterLogin();
    }
  }
);

/* =========================================================
   ROOM CREATED
   ========================================================= */

socket.on(
  "room:created",
  (roomInfo) => {
    if (!roomInfo?.room) {
      return;
    }

    state.rooms.set(
      roomInfo.room,
      roomInfo
    );

    renderRoomList();
  }
);

/* =========================================================
   ROOM LIST
   ========================================================= */

socket.on(
  "rooms:list",
  ({ rooms } = {}) => {
    seedRooms(
      rooms || []
    );
  }
);

/* =========================================================
   ROOM HISTORY
   ========================================================= */

socket.on(
  "room:history",
  ({
    room,
    messages
  } = {}) => {
    if (!room) return;

    const safeMessages =
      Array.isArray(messages)
        ? messages
        : [];

    state.histories.set(
      room,
      safeMessages
    );

    if (
      room ===
      state.currentRoom
    ) {
      renderHistory(
        room
      );
    }
  }
);

/* =========================================================
   ROOM USER LIST
   ========================================================= */

socket.on(
  "room:userlist",
  ({
    room,
    users
  } = {}) => {
    if (
      !room ||
      room !==
        state.currentRoom
    ) {
      return;
    }

    state.members =
      Array.isArray(users)
        ? users
        : [];

    renderMembers();
  }
);

/* =========================================================
   GROUP CHAT
   ========================================================= */

socket.on(
  "chat:receive",
  (message) => {
    if (!message?.room) {
      return;
    }

    /*
     * Always use the room from the message.
     */
    const messageRoom =
      message.room;

    if (
      !state.histories.has(
        messageRoom
      )
    ) {
      state.histories.set(
        messageRoom,
        []
      );
    }

    const history =
      state.histories.get(
        messageRoom
      );

    if (
      !history.some(
        (item) =>
          item.id ===
          message.id
      )
    ) {
      history.push(
        message
      );

      if (
        history.length >
        50
      ) {
        history.splice(
          0,
          history.length - 50
        );
      }
    }

    /*
     * Message belongs to another room.
     */
    if (
      messageRoom !==
      state.currentRoom
    ) {
      state.unreadRooms.set(
        messageRoom,
        (
          state.unreadRooms.get(
            messageRoom
          ) || 0
        ) + 1
      );

      renderRoomList();

      return;
    }

    appendMessage(
      message
    );

    /*
     * Don't notify ourselves.
     */
    if (
      message.senderId !==
      state.user?.socketId
    ) {
      playNotification();
    }
  }
);

/* =========================================================
   TYPING
   ========================================================= */

socket.on(
  "typing:update",
  ({
    username,
    isTyping
  } = {}) => {
    if (!username) {
      return;
    }

    if (isTyping) {
      state.typing.add(
        username
      );
    } else {
      state.typing.delete(
        username
      );
    }

    renderTyping();
  }
);

/* =========================================================
   DIRECT MESSAGE RECEIVE
   ========================================================= */

socket.on(
  "direct:receive",
  (message) => {
    if (!message) return;

    appendDm(
      message
    );

    /*
     * Notify only when the conversation isn't open.
     */
    if (
      state.dmTarget?.socketId !==
      message.fromId
    ) {
      playNotification();

      showToast(
        `New message from ${message.from}`
      );
    }
  }
);

/* =========================================================
   SERVER ERRORS
   ========================================================= */

socket.on(
  "error",
  ({ message } = {}) => {
    if (message) {
      showToast(
        message
      );
    }
  }
);

/* =========================================================
   LOGIN UI
   ========================================================= */

on(
  "loginButton",
  "click",
  performLogin
);

on(
  "usernameInput",
  "keydown",
  (event) => {
    if (
      event.key ===
      "Enter"
    ) {
      event.preventDefault();

      performLogin();
    }
  }
);

/* =========================================================
   ROOM LIST UI
   ========================================================= */

on(
  "roomList",
  "click",
  (event) => {
    const button =
      event.target.closest(
        "[data-room]"
      );

    if (!button) return;

    setRoom(
      button.dataset.room
    );

    $("roomNav")?.classList.remove(
      "open"
    );
  }
);

/* =========================================================
   GROUP MESSAGE COMPOSER
   ========================================================= */

on(
  "composer",
  "submit",
  (event) => {
    event.preventDefault();

    if (!state.user) {
      showToast(
        "Please enter the workspace first."
      );

      return;
    }

    const input =
      $("messageInput");

    if (!input) return;

    const message =
      input.value.trim();

    if (!message) return;

    stopTyping();

    input.value = "";

    socket.emit(
      "chat:send",
      {
        room:
          state.currentRoom,

        message
      },
      (response) => {
        if (!response?.ok) {
          showToast(
            response?.error ||
              "Message could not be sent."
          );
        }
      }
    );
  }
);

/* =========================================================
   MESSAGE INPUT / TYPING
   ========================================================= */

on(
  "messageInput",
  "input",
  () => {
    const input =
      $("messageInput");

    if (!input) return;

    if (
      input.value.trim()
    ) {
      startTyping();
    } else {
      stopTyping();
    }
  }
);

on(
  "messageInput",
  "keydown",
  (event) => {
    if (
      event.key === "Enter" &&
      !event.shiftKey
    ) {
      event.preventDefault();

      $("composer")?.requestSubmit();
    }
  }
);

/* =========================================================
   EMOJI
   ========================================================= */

on(
  "emojiButton",
  "click",
  () => {
    const input =
      $("messageInput");

    if (!input) return;

    input.value +=
      input.value
        ? " 🙂"
        : "🙂";

    input.focus();

    startTyping();
  }
);

/* =========================================================
   CREATE ROOM
   ========================================================= */

on(
  "createRoomButton",
  "click",
  () => {
    if ($("roomError")) {
      $("roomError").textContent =
        "";
    }

    if ($("roomNameInput")) {
      $("roomNameInput").value =
        "";
    }

    if (
      $("roomDescriptionInput")
    ) {
      $(
        "roomDescriptionInput"
      ).value = "";
    }

    openModal(
      "roomModal"
    );

    $("roomNameInput")?.focus();
  }
);

on(
  "createRoomSubmit",
  "click",
  () => {
    const room =
      $("roomNameInput")
        ?.value.trim();

    const description =
      $("roomDescriptionInput")
        ?.value.trim();

    if ($("roomError")) {
      $("roomError").textContent =
        "";
    }

    if (!room) {
      if ($("roomError")) {
        $("roomError").textContent =
          "Please enter a room name.";
      }

      return;
    }

    socket.emit(
      "room:create",
      {
        room,
        description
      },
      (response) => {
        if (!response?.ok) {
          if ($("roomError")) {
            $("roomError").textContent =
              response?.error ||
              "Could not create room.";
          }

          return;
        }

        state.rooms.set(
          response.room,
          response
        );

        renderRoomList();

        closeModal(
          "roomModal"
        );

        setRoom(
          response.room
        );

        showToast(
          `Created #${response.room}`
        );
      }
    );
  }
);

/* =========================================================
   INVITE
   ========================================================= */

on(
  "inviteButton",
  "click",
  () => {
    if (!state.currentRoom) {
      showToast(
        "Join a room before inviting someone."
      );

      return;
    }

    socket.emit(
      "room:invite:create",
      {
        room:
          state.currentRoom
      },
      (response) => {
        if (!response?.ok) {
          showToast(
            response?.error ||
              "Could not create invite."
          );

          return;
        }

        const link =
          createInviteLink(
            response.token
          );

        if ($("inviteLinkInput")) {
          $("inviteLinkInput").value =
            link;
        }

        if ($("inviteStatus")) {
          $("inviteStatus").textContent =
            "";
        }

        openModal(
          "inviteModal"
        );
      }
    );
  }
);

/* =========================================================
   COPY INVITE
   ========================================================= */

on(
  "copyInviteButton",
  "click",
  async () => {
    const input =
      $("inviteLinkInput");

    if (!input) return;

    const link =
      input.value.trim();

    if (!link) return;

    try {
      await navigator.clipboard.writeText(
        link
      );

      if ($("inviteStatus")) {
        $("inviteStatus").textContent =
          "Invite link copied.";
      }

      showToast(
        "Invite link copied."
      );
    } catch (_) {
      input.focus();

      input.select();

      try {
        document.execCommand(
          "copy"
        );

        if ($("inviteStatus")) {
          $("inviteStatus").textContent =
            "Invite link copied.";
        }

        showToast(
          "Invite link copied."
        );
      } catch (_) {
        showToast(
          "Copy failed. Please copy the link manually."
        );
      }
    }
  }
);

/* =========================================================
   MEMBER DM BUTTONS
   ========================================================= */

on(
  "membersList",
  "click",
  (event) => {
    const button =
      event.target.closest(
        "[data-dm]"
      );

    if (!button) return;

    openDm(
      button.dataset.dm
    );
  }
);

/* =========================================================
   MEMBERS PANEL
   ========================================================= */

on(
  "membersButton",
  "click",
  () => {
    $("membersPanel")?.classList.add(
      "open"
    );
  }
);

on(
  "mobileMembersButton",
  "click",
  () => {
    $("membersPanel")?.classList.add(
      "open"
    );
  }
);

on(
  "closeMembersButton",
  "click",
  () => {
    $("membersPanel")?.classList.remove(
      "open"
    );
  }
);

/* =========================================================
   DIRECT MESSAGE CLOSE
   ========================================================= */

on(
  "closeDmButton",
  "click",
  () => {
    $("dmPanel")?.classList.add(
      "hidden"
    );

    state.dmTarget =
      null;
  }
);

/* =========================================================
   DIRECT MESSAGE COMPOSER
   ========================================================= */

on(
  "dmComposer",
  "submit",
  (event) => {
    event.preventDefault();

    if (
      !state.dmTarget ||
      !state.user
    ) {
      return;
    }

    const input =
      $("dmInput");

    if (!input) return;

    const message =
      input.value.trim();

    if (!message) return;

    const recipientId =
      state.dmTarget.socketId;

    /*
     * Optimistic UI:
     * The sender sees their message immediately.
     */
    const optimisticId =
      `local_${Date.now()}_${Math.random()
        .toString(36)
        .slice(2, 7)}`;

    const optimistic = {
      id: optimisticId,

      from:
        state.user.username,

      fromId:
        state.user.socketId,

      to:
        state.dmTarget.username,

      toId:
        recipientId,

      message,

      timestamp:
        new Intl.DateTimeFormat(
          "en-IN",
          {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false
          }
        ).format(
          new Date()
        )
    };

    appendDm(
      optimistic
    );

    input.value = "";

    socket.emit(
      "direct:send",
      {
        recipientId,
        message
      },
      (response) => {
        if (!response?.ok) {
          showToast(
            response?.error ||
              "DM could not be delivered."
          );

          const conversation =
            state.dmConversations.get(
              recipientId
            ) || [];

          const index =
            conversation.findIndex(
              (item) =>
                item.id ===
                optimisticId
            );

          if (index >= 0) {
            conversation.splice(
              index,
              1
            );
          }

          renderDmConversation(
            recipientId
          );

          return;
        }

        const serverMessage =
          response.message;

        if (!serverMessage) {
          return;
        }

        replaceOptimisticDm(
          recipientId,
          optimisticId,
          serverMessage
        );
      }
    );
  }
);

/* =========================================================
   MODAL CLOSE BUTTONS
   ========================================================= */

document
  .querySelectorAll(
    "[data-close]"
  )
  .forEach((button) => {
    button.addEventListener(
      "click",
      () => {
        closeModal(
          button.dataset.close
        );
      }
    );
  });

/* =========================================================
   CLICK OUTSIDE MODAL
   ========================================================= */

document
  .querySelectorAll(".modal")
  .forEach((modal) => {
    modal.addEventListener(
      "click",
      (event) => {
        if (
          event.target ===
          modal
        ) {
          modal.classList.add(
            "hidden"
          );
        }
      }
    );
  });

/* =========================================================
   LIGHT CLAYMORPHISM THEME
   ========================================================= */

/*
 * Light theme only.
 */
document.documentElement.dataset.theme =
  "light";

try {
  localStorage.setItem(
    "obsidian-theme",
    "light"
  );
} catch (_) {}

/*
 * If an old theme toggle exists,
 * keep it visually disabled as a
 * light-theme control.
 */
const oldThemeToggle =
  $("themeToggle");

if (oldThemeToggle) {
  oldThemeToggle.setAttribute(
    "aria-label",
    "Light theme"
  );

  oldThemeToggle.textContent =
    "☀";
}

/* =========================================================
   INITIALIZATION
   ========================================================= */

initializeAvatars();

setConnection(false);