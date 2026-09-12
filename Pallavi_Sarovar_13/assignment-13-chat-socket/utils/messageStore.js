const roomHistories = Object.create(null);

const DEFAULT_ROOMS = ["general", "developers", "random"];
const MAX_HISTORY = 50;

for (const room of DEFAULT_ROOMS) {
  roomHistories[room] = [];
}

function ensureRoom(room) {
  if (!roomHistories[room]) {
    roomHistories[room] = [];
  }
  return roomHistories[room];
}

function addMessageToHistory(room, messageObj) {
  const history = ensureRoom(room);
  history.push(messageObj);

  if (history.length > MAX_HISTORY) {
    history.splice(0, history.length - MAX_HISTORY);
  }

  return messageObj;
}

function getRoomHistory(room) {
  return [...ensureRoom(room)];
}

function hasRoom(room) {
  return Object.prototype.hasOwnProperty.call(roomHistories, room);
}

function getRooms() {
  return Object.keys(roomHistories);
}

function generateMessageId() {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function generateInviteToken() {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
}

function formatTimestamp(date = new Date()) {
  return new Intl.DateTimeFormat("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
}

module.exports = {
  MAX_HISTORY,
  DEFAULT_ROOMS,
  addMessageToHistory,
  getRoomHistory,
  hasRoom,
  getRooms,
  generateMessageId,
  generateInviteToken,
  formatTimestamp
};