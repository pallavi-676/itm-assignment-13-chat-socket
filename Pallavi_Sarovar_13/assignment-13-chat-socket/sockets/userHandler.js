const {
  DEFAULT_ROOMS,
  getRoomHistory,
  hasRoom,
  getRooms,
  generateInviteToken
} = require("../utils/messageStore");

const connectedUsers = new Map();
// socketId -> { userId, username, avatar, currentRoom }

const roomMembers = new Map();
// room -> Set(socketId)

const roomInvites = new Map();
// inviteToken -> room

/*
 * Initialize default rooms.
 */
for (const room of DEFAULT_ROOMS) {
  roomMembers.set(room, new Set());
}

/* =========================================================
   HELPERS
   ========================================================= */

function normalizeRoomName(value) {
  if (typeof value !== "string") {
    return null;
  }

  const cleaned = value
    .trim()
    .replace(/^#+/, "")
    .replace(/\s+/g, "-")
    .toLowerCase();

  if (
    !/^[a-z0-9][a-z0-9_-]{0,31}$/.test(cleaned)
  ) {
    return null;
  }

  return cleaned;
}

function normalizeUsername(value) {
  if (typeof value !== "string") {
    return null;
  }

  const cleaned = value
    .trim()
    .replace(/\s+/g, " ");

  if (
    cleaned.length < 1 ||
    cleaned.length > 24
  ) {
    return null;
  }

  return cleaned;
}

function normalizeUserId(value) {
  if (typeof value !== "string") {
    return null;
  }

  const cleaned = value.trim();

  if (
    cleaned.length < 4 ||
    cleaned.length > 100
  ) {
    return null;
  }

  if (
    !/^[a-zA-Z0-9_-]+$/.test(cleaned)
  ) {
    return null;
  }

  return cleaned;
}

function generateUserId() {
  return (
    `user_${Date.now()}_` +
    Math.random()
      .toString(36)
      .slice(2, 10)
  );
}

function normalizeAvatar(value) {
  const allowed = [
    "orbit",
    "spark",
    "moon",
    "star",
    "wave",
    "leaf"
  ];

  return allowed.includes(value)
    ? value
    : "orbit";
}

/* =========================================================
   PUBLIC ROOM MEMBERS
   ========================================================= */

function getPublicUsers(room) {
  const members =
    roomMembers.get(room) ||
    new Set();

  return [...members]
    .map((socketId) => {
      const user =
        connectedUsers.get(socketId);

      if (!user) {
        return null;
      }

      return {
        socketId,

        userId:
          user.userId,

        username:
          user.username,

        avatar:
          user.avatar
      };
    })
    .filter(Boolean);
}

function emitRoomUserList(io, room) {
  io.to(room).emit(
    "room:userlist",
    {
      room,

      users:
        getPublicUsers(room)
    }
  );
}

/* =========================================================
   INVITES
   ========================================================= */

function createInvite(room) {
  const token =
    generateInviteToken();

  roomInvites.set(
    token,
    room
  );

  return token;
}

function resolveInvite(token) {
  return (
    roomInvites.get(token) ||
    null
  );
}

/* =========================================================
   CLEANUP
   ========================================================= */

function removeUser(io, socket) {
  const user =
    connectedUsers.get(socket.id);

  if (!user) {
    return;
  }

  const room =
    user.currentRoom;

  /*
   * Remove the user from the room first.
   */
  if (room) {
    const members =
      roomMembers.get(room);

    if (members) {
      members.delete(
        socket.id
      );
    }

    /*
     * Tell everyone still inside
     * the room that the member left.
     */
    emitRoomUserList(
      io,
      room
    );
  }

  /*
   * Remove socket from the
   * global connected-user map.
   */
  connectedUsers.delete(
    socket.id
  );

  /*
   * Clear authentication state.
   */
  socket.data.authenticated =
    false;

  socket.data.userId = null;
}

/* =========================================================
   HANDLERS
   ========================================================= */

function registerUserHandlers(
  io,
  socket
) {
  /* =======================================================
     LOGIN
     ======================================================= */

  socket.on(
    "user:login",
    (payload = {}, callback) => {
      const username =
        normalizeUsername(
          payload.username
        );

      if (!username) {
        const error =
          "Please enter a username between 1 and 24 characters.";

        socket.emit(
          "error",
          {
            message: error
          }
        );

        if (
          typeof callback ===
          "function"
        ) {
          callback({
            ok: false,
            error
          });
        }

        return;
      }

      /*
       * IMPORTANT FIX
       *
       * userId is OPTIONAL on first login.
       *
       * If the frontend already knows the user's
       * ID, validate and reuse it.
       *
       * Otherwise generate one automatically.
       */
      let userId =
        normalizeUserId(
          payload.userId
        );

      if (!userId) {
        userId =
          generateUserId();
      }

      const avatar =
        normalizeAvatar(
          payload.avatar
        );

      /*
       * If this socket was already logged in,
       * clean up its old state first.
       */
      const existingUser =
        connectedUsers.get(
          socket.id
        );

      if (existingUser) {
        removeUser(
          io,
          socket
        );
      }

      /*
       * Create the new user session.
       */
      connectedUsers.set(
        socket.id,
        {
          userId,

          username,

          avatar,

          currentRoom:
            null
        }
      );

      /*
       * Store useful information directly
       * on the Socket.io socket object too.
       */
      socket.data.authenticated =
        true;

      socket.data.userId =
        userId;

      socket.data.username =
        username;

      /*
       * Return complete identity to frontend.
       *
       * The frontend MUST store userId and send it
       * again if Socket.io reconnects.
       */
      const response = {
        ok: true,

        user: {
          socketId:
            socket.id,

          userId,

          username,

          avatar
        },

        rooms:
          getRooms()
      };

      socket.emit(
        "user:login:success",
        response
      );

      if (
        typeof callback ===
        "function"
      ) {
        callback(response);
      }
    }
  );

  /* =======================================================
     CREATE ROOM
     ======================================================= */

  socket.on(
    "room:create",
    (payload = {}, callback) => {
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

      const room =
        normalizeRoomName(
          payload.room
        );

      const description =
        typeof payload.description ===
        "string"
          ? payload.description
              .trim()
              .slice(0, 100)
          : "";

      if (!room) {
        if (
          typeof callback ===
          "function"
        ) {
          callback({
            ok: false,

            error:
              "Use 1-32 letters, numbers, hyphens or underscores for the room name."
          });
        }

        return;
      }

      if (hasRoom(room)) {
        if (
          typeof callback ===
          "function"
        ) {
          callback({
            ok: false,

            error:
              "That room already exists."
          });
        }

        return;
      }

      /*
       * Initialize history.
       */
      getRoomHistory(room);

      /*
       * Initialize room members.
       */
      roomMembers.set(
        room,
        new Set()
      );

      /*
       * Generate the first invite.
       */
      const inviteToken =
        createInvite(room);

      const roomInfo = {
        room,

        description,

        inviteToken
      };

      /*
       * Tell every connected client
       * that this room now exists.
       */
      io.emit(
        "room:created",
        roomInfo
      );

      if (
        typeof callback ===
        "function"
      ) {
        callback({
          ok: true,

          ...roomInfo
        });
      }
    }
  );

  /* =======================================================
     CREATE INVITE
     ======================================================= */

  socket.on(
    "room:invite:create",
    (payload = {}, callback) => {
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

      const room =
        normalizeRoomName(
          payload.room
        );

      const user =
        connectedUsers.get(
          socket.id
        );

      if (
        !room ||
        !user ||
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
              "Join the room before inviting someone."
          });
        }

        return;
      }

      const token =
        createInvite(room);

      if (
        typeof callback ===
        "function"
      ) {
        callback({
          ok: true,

          room,

          token
        });
      }
    }
  );

  /* =======================================================
     RESOLVE INVITE
     ======================================================= */

  socket.on(
    "room:invite:resolve",
    (payload = {}, callback) => {
      const token =
        typeof payload.token ===
        "string"
          ? payload.token.trim()
          : "";

      if (!token) {
        if (
          typeof callback ===
          "function"
        ) {
          callback({
            ok: false,

            error:
              "Invite token is missing."
          });
        }

        return;
      }

      const room =
        resolveInvite(token);

      if (
        !room ||
        !hasRoom(room)
      ) {
        if (
          typeof callback ===
          "function"
        ) {
          callback({
            ok: false,

            error:
              "This invite link is invalid or expired."
          });
        }

        return;
      }

      if (
        typeof callback ===
        "function"
      ) {
        callback({
          ok: true,

          room
        });
      }
    }
  );

  /* =======================================================
     JOIN ROOM
     ======================================================= */

  socket.on(
    "room:join",
    (payload = {}, callback) => {
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

      const room =
        normalizeRoomName(
          payload.room
        );

      const user =
        connectedUsers.get(
          socket.id
        );

      if (!user) {
        if (
          typeof callback ===
          "function"
        ) {
          callback({
            ok: false,

            error:
              "User session not found."
          });
        }

        return;
      }

      if (
        !room ||
        !hasRoom(room)
      ) {
        if (
          typeof callback ===
          "function"
        ) {
          callback({
            ok: false,

            error:
              "Room does not exist."
          });
        }

        return;
      }

      const previousRoom =
        user.currentRoom;

      /*
       * Already in requested room.
       */
      if (
        previousRoom === room
      ) {
        socket.emit(
          "room:history",
          {
            room,

            messages:
              getRoomHistory(
                room
              )
          }
        );

        emitRoomUserList(
          io,
          room
        );

        if (
          typeof callback ===
          "function"
        ) {
          callback({
            ok: true,

            room
          });
        }

        return;
      }

      /*
       * Leave previous room.
       */
      if (previousRoom) {
        socket.leave(
          previousRoom
        );

        roomMembers
          .get(previousRoom)
          ?.delete(
            socket.id
          );

        emitRoomUserList(
          io,
          previousRoom
        );
      }

      /*
       * Make sure room member set exists.
       */
      if (
        !roomMembers.has(room)
      ) {
        roomMembers.set(
          room,
          new Set()
        );
      }

      /*
       * Join requested room.
       */
      socket.join(room);

      roomMembers
        .get(room)
        .add(
          socket.id
        );

      user.currentRoom =
        room;

      /*
       * Send room history only to
       * the newly joined user.
       */
      socket.emit(
        "room:history",
        {
          room,

          messages:
            getRoomHistory(
              room
            )
        }
      );

      /*
       * Update everyone in the room.
       */
      emitRoomUserList(
        io,
        room
      );

      if (
        typeof callback ===
        "function"
      ) {
        callback({
          ok: true,

          room
        });
      }
    }
  );

  /* =======================================================
     LEAVE ROOM
     ======================================================= */

  socket.on(
    "room:leave",
    (payload = {}, callback) => {
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

      const room =
        normalizeRoomName(
          payload.room
        );

      const user =
        connectedUsers.get(
          socket.id
        );

      if (
        !room ||
        !user ||
        user.currentRoom !== room
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
       * Leave Socket.io room.
       */
      socket.leave(room);

      /*
       * Remove from our own member tracking.
       */
      roomMembers
        .get(room)
        ?.delete(
          socket.id
        );

      /*
       * Clear current room.
       */
      user.currentRoom =
        null;

      /*
       * Immediately notify everyone
       * remaining in the room.
       */
      emitRoomUserList(
        io,
        room
      );

      if (
        typeof callback ===
        "function"
      ) {
        callback({
          ok: true
        });
      }
    }
  );

  /* =======================================================
     ROOMS LIST
     ======================================================= */

  socket.on(
    "rooms:list",
    () => {
      if (
        !socket.data.authenticated
      ) {
        return;
      }

      socket.emit(
        "rooms:list",
        {
          rooms:
            getRooms()
        }
      );
    }
  );

  /* =======================================================
     EXPLICIT LOGOUT
     ======================================================= */

  socket.on(
    "user:logout",
    () => {
      /*
       * Remove the user immediately.
       */
      removeUser(
        io,
        socket
      );

      /*
       * Tell this browser that logout
       * completed successfully.
       */
      socket.emit(
        "user:logout:success"
      );
    }
  );

  /* =======================================================
     DISCONNECT
     ======================================================= */

  socket.on(
    "disconnect",
    () => {
      /*
       * This is important:
       *
       * When a browser tab closes, refreshes,
       * loses connection, or disconnects,
       * the user is removed from the room immediately.
       */
      removeUser(
        io,
        socket
      );
    }
  );
}

/* =========================================================
   EXPORTS
   ========================================================= */

module.exports = {
  connectedUsers,

  roomMembers,

  registerUserHandlers,

  normalizeRoomName
};