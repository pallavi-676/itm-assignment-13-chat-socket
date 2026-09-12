# 💬 Assignment 13 — Real-Time Group Chat & Messaging

A real-time communication application built with Node.js, Express.js, and Socket.io.

The application supports multiple chat rooms, direct messaging, online presence, typing indicators, room invitations, and real-time message delivery through WebSocket connections.

## 🚀 Live Demo

🔗 https://itm-assignment-13-chat-socket.onrender.com/

---

## ✨ Features

### 💬 Real-Time Group Chat

- Join the default general room.
- Send and receive messages instantly.
- Messages are delivered in real time using Socket.io.
- Latest room messages are maintained in memory.

### 👥 Online Presence

- See users currently connected to the application.
- Real-time online member updates.
- Users are automatically removed from presence lists when they disconnect.

### ✉️ Direct Messaging

- Send private messages to individual online users.
- Direct messages are delivered instantly through Socket.io.

### ⌨️ Typing Indicators

- Real-time typing indicators.
- Other members can see when someone is composing a message.

### 🏠 Custom Rooms

- Create custom chat rooms.
- Add an optional room description.
- Automatically join the newly created room.
- Switch between available rooms.

### 🔗 Room Invitations

- Generate an invite link for a room.
- Share the link with another user.
- Invited users can join the room after logging in.

### 🧑‍🎨 User Avatars

- Choose an avatar when entering the application.
- Avatars are displayed alongside messages and members.

### 📦 Message History

- The latest 50 messages for each room are maintained in memory.
- Recent room history is restored when users join a room.

---

## 🛠️ Tech Stack

| Technology | Purpose |
|---|---|
| Node.js | Server-side JavaScript runtime |
| Express.js | HTTP server and static file serving |
| Socket.io | Real-time bidirectional communication |
| HTML5 | Application structure |
| CSS3 | Responsive user interface |
| JavaScript | Frontend interaction and Socket.io client |
| Jest | Socket/server testing |
| In-Memory Store | Recent room message history |

---

## 🏗️ Project Structure

<pre>

Pallavi_Sarovar_13/
└── assignment-13-chat-socket/
    ├── docs/
    │   ├── gc1.png
    │   ├── gc2.png
    │   ├── gc3.png
    │   └── gc4.png
    │
    ├── public/
    │   ├── app.js
    │   ├── index.html
    │   └── style.css
    │
    ├── sockets/
    │   ├── chatHandler.js
    │   └── userHandler.js
    │
    ├── tests/
    │   └── socket.test.js
    │
    ├── utils/
    │   └── messageStore.js
    │
    ├── server.js
    ├── package.json
    ├── package-lock.json
    └── .gitignore
</pre>

---

## ⚙️ Getting Started

### 1. Clone the Repository

git clone https://github.com/pallavi-676/itm-assignment-13-chat-socket.git

### 2. Navigate to the Assignment

cd itm-assignment-13-chat-socket/Pallavi_Sarovar_13/assignment-13-chat-socket

### 3. Install Dependencies

npm install

### 4. Start the Server

npm start

The application will start on the configured server port.

Open the application in your browser:

http://localhost:3000

---

## 🧪 Testing

The project includes Socket.io and server-side tests.

Run the test suite with:

npm test

---

## 🔌 Real-Time Socket Events

The application uses Socket.io events for real-time communication.

### User Events

- User login and registration
- Online/offline presence
- User disconnection
- Stable user identification

### Room Events

- Join room
- Create room
- Room member updates
- Room history
- Room invitations

### Messaging Events

- Group messages
- Direct messages
- Typing indicators
- Message delivery

---



## 📄 License

This project was created as part of an academic assignment.
