const {
  addMessageToHistory,
  generateMessageId,
  formatTimestamp,
  hasRoom
} = require("../utils/messageStore");

/*
 * room -> Set(socketId)
 *
 * Keeps track of users who are currently typing
 * inside each room.
 */
const typingUsers = new Map();

/* =========================================================
   MESSAGE VALIDATION
   ========================================================= */

function cleanMessage(value) {
  if (typeof value !== "string") {
    return null;
  }

  const message =
    value.trim();

  if (!message) {
    return null;
  }

  /*
   * Prevent extremely large messages.
   */
  if (message.length > 2000) {
    return null;
  }

  return message;
}

/* =========================================================
   TYPING STATE
   ========================================================= */

function setTyping(
  socketId,
  room,
  isTyping
) {
  if (!room) {
    return;
  }

  if (!typingUsers.has(room)) {
    typingUsers.set(
      room,
      new Set()
    );
  }

  const set =
    typingUsers.get(room);

  if (isTyping) {
    set.add(socketId);
  } else {
    set.delete(socketId);

    if (set.size === 0) {
      typingUsers.delete(room);
    }
  }
}

function stopTyping(
  io,
  socket,
  room,
  username
) {
  const set =
    typingUsers.get(room);

  if (
    !set ||
    !set.has(socket.id)
  ) {
    return;
  }

  set.delete(
    socket.id
  );

  if (set.size === 0) {
    typingUsers.delete(room);
  }

  socket.to(room).emit(
    "typing:update",
    {
      username,
      isTyping: false
    }
  );
}

/* =========================================================
   CHAT HANDLERS
   ========================================================= */

function registerChatHandlers(
  io,
  socket,
  connectedUsers
) {

  /* =======================================================
     GROUP CHAT
     ======================================================= */

  socket.on(
    "chat:send",
    (payload = {}, callback) => {

      /*
       * Authentication check.
       */
      if (
        !socket.data.authenticated
      ) {
        if (
          typeof callback ===
          "function"
        ) {
          callback({
            ok: false,
            error:
              "Login required."
          });
        }

        return;
      }

      const user =
        connectedUsers.get(
          socket.id
        );

      const room =
        typeof payload.room ===
        "string"
          ? payload.room
              .trim()
              .toLowerCase()
          : "";

      const message =
        cleanMessage(
          payload.message
        );

      /*
       * User must actually be in
       * the requested room.
       */
      if (
        !user ||
        !room ||
        user.currentRoom !== room ||
        !hasRoom(room)
      ) {
        if (
          typeof callback ===
          "function"
        ) {
          callback({
            ok: false,
            error:
              "You are not in this room."
          });
        }

        return;
      }

      /*
       * Empty / oversized message.
       */
      if (!message) {
        if (
          typeof callback ===
          "function"
        ) {
          callback({
            ok: false,
            error:
              "Message cannot be empty."
          });
        }

        return;
      }

      /*
       * Sending a message automatically
       * stops this user's typing indicator.
       */
      stopTyping(
        io,
        socket,
        room,
        user.username
      );

      const messageObj = {
        room,

        id:
          generateMessageId(),

        sender:
          user.username,

        senderId:
          socket.id,

        avatar:
          user.avatar,

        message,

        timestamp:
          formatTimestamp()
      };

      /*
       * Keep only the latest messages through
       * messageStore.
       */
      addMessageToHistory(
        room,
        messageObj
      );

      /*
       * Broadcast to everyone in the room,
       * including the sender.
       */
      io.to(room).emit(
        "chat:receive",
        messageObj
      );

      /*
       * Sender acknowledgement.
       */
      if (
        typeof callback ===
        "function"
      ) {
        callback({
          ok: true,
          message:
            messageObj
        });
      }
    }
  );

  /* =======================================================
     TYPING START
     ======================================================= */

  socket.on(
    "typing:start",
    (payload = {}) => {

      if (
        !socket.data.authenticated
      ) {
        return;
      }

      const user =
        connectedUsers.get(
          socket.id
        );

      const room =
        typeof payload.room ===
        "string"
          ? payload.room
              .trim()
              .toLowerCase()
          : "";

      if (
        !user ||
        !room ||
        user.currentRoom !== room ||
        !hasRoom(room)
      ) {
        return;
      }

      /*
       * Don't repeatedly broadcast
       * typing:start events.
       */
      if (
        !typingUsers.has(room)
      ) {
        typingUsers.set(
          room,
          new Set()
        );
      }

      const set =
        typingUsers.get(room);

      if (
        set.has(socket.id)
      ) {
        return;
      }

      set.add(
        socket.id
      );

      /*
       * Tell everyone else in the room.
       */
      socket.to(room).emit(
        "typing:update",
        {
          username:
            user.username,

          isTyping: true
        }
      );
    }
  );

  /* =======================================================
     TYPING STOP
     ======================================================= */

  socket.on(
    "typing:stop",
    (payload = {}) => {

      if (
        !socket.data.authenticated
      ) {
        return;
      }

      const user =
        connectedUsers.get(
          socket.id
        );

      const room =
        typeof payload.room ===
        "string"
          ? payload.room
              .trim()
              .toLowerCase()
          : "";

      if (
        !user ||
        !room ||
        user.currentRoom !== room
      ) {
        return;
      }

      stopTyping(
        io,
        socket,
        room,
        user.username
      );
    }
  );

  /* =======================================================
     DIRECT MESSAGE
     ======================================================= */

  socket.on(
    "direct:send",
    (payload = {}, callback) => {

      /*
       * Authentication check.
       */
      if (
        !socket.data.authenticated
      ) {
        if (
          typeof callback ===
          "function"
        ) {
          callback({
            ok: false,
            error:
              "Login required."
          });
        }

        return;
      }

      const sender =
        connectedUsers.get(
          socket.id
        );

      const recipientId =
        typeof payload.recipientId ===
        "string"
          ? payload.recipientId
              .trim()
          : "";

      const message =
        cleanMessage(
          payload.message
        );

      if (
        !sender ||
        !recipientId ||
        !message
      ) {
        if (
          typeof callback ===
          "function"
        ) {
          callback({
            ok: false,
            error:
              "Invalid direct message."
          });
        }

        return;
      }

      /*
       * Recipient must currently be online.
       */
      const recipient =
        connectedUsers.get(
          recipientId
        );

      if (!recipient) {
        if (
          typeof callback ===
          "function"
        ) {
          callback({
            ok: false,
            error:
              "That user is no longer online."
          });
        }

        return;
      }

      /*
       * Create one authoritative
       * server-side DM object.
       */
      const dm = {
        id:
          generateMessageId(),

        from:
          sender.username,

        fromId:
          socket.id,

        to:
          recipient.username,

        toId:
          recipientId,

        message,

        timestamp:
          formatTimestamp()
      };

      /*
       * Deliver ONLY to the intended
       * recipient socket.
       */
      io.to(
        recipientId
      ).emit(
        "direct:receive",
        dm
      );

      /*
       * Return the authoritative message
       * to the sender.
       *
       * The frontend uses this to replace
       * its optimistic message.
       */
      if (
        typeof callback ===
        "function"
      ) {
        callback({
          ok: true,
          message: dm
        });
      }
    }
  );

  /* =======================================================
     DISCONNECT
     ======================================================= */

  socket.on(
    "disconnect",
    () => {

      /*
       * Remove this socket from every
       * room's typing set.
       */
      for (
        const [
          room,
          set
        ] of typingUsers.entries()
      ) {

        if (
          !set.has(
            socket.id
          )
        ) {
          continue;
        }

        set.delete(
          socket.id
        );

        if (
          set.size === 0
        ) {
          typingUsers.delete(
            room
          );
        }
      }
    }
  );
}

module.exports = {
  registerChatHandlers
};