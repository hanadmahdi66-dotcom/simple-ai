const STORAGE = {
  user: "hanad_current_user",
  friends: (id) => `hanad_friends_${id}`,
  server: "hanad_server_url",
};

let socket = null;
let currentUser = null;
let activeFriend = null;
let onlineUsers = new Set();
let userNames = {};
let renderedCount = 0;
let connected = false;

const $ = (id) => document.getElementById(id);

const screens = {
  login: $("loginScreen"),
  friends: $("friendsScreen"),
  chat: $("chatScreen"),
};

function showScreen(name) {
  Object.values(screens).forEach((s) => s.classList.remove("active"));
  screens[name].classList.add("active");
}

function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function saveJSON(key, data) {
  localStorage.setItem(key, JSON.stringify(data));
}

function normalizeId(id) {
  return id.trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
}

function getServerUrl() {
  const saved = localStorage.getItem(STORAGE.server);
  if (saved) return saved.replace(/\/$/, "");
  if (window.location.protocol.startsWith("http")) {
    return window.location.origin;
  }
  return "http://localhost:3000";
}

function setConnectionStatus(ok, text) {
  const el = $("connectionStatus");
  if (!el) return;
  el.classList.toggle("connected", ok);
  el.classList.toggle("disconnected", !ok);
  el.textContent = text;
}

function getFriends() {
  if (!currentUser) return [];
  return loadJSON(STORAGE.friends(currentUser.id), []);
}

function saveFriends(list) {
  saveJSON(STORAGE.friends(currentUser.id), list);
}

function isOnline(userId) {
  return onlineUsers.has(userId);
}

function getInitial(name) {
  return (name || "?").charAt(0).toUpperCase();
}

function getTime(ts) {
  return new Date(ts || Date.now()).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

function escapeHtml(text) {
  const d = document.createElement("div");
  d.textContent = text;
  return d.innerHTML;
}

function init3DTilt() {
  const app = $("chatApp");
  const scene = document.querySelector(".scene");
  if (!scene || !app) return;

  scene.addEventListener("mousemove", (e) => {
    const rect = scene.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    app.style.transform = `rotateY(${x * 8}deg) rotateX(${-y * 6}deg)`;
  });

  scene.addEventListener("mouseleave", () => {
    app.style.transform = "rotateY(0) rotateX(0)";
  });
}

function connectSocket() {
  return new Promise((resolve, reject) => {
    if (socket?.connected) {
      resolve();
      return;
    }

    const url = getServerUrl();
    localStorage.setItem(STORAGE.server, url);

    if (socket) {
      socket.removeAllListeners();
      socket.disconnect();
    }

    setConnectionStatus(false, "Connecting to server...");

    socket = io(url, {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: 10,
    });

    socket.on("connect", () => {
      connected = true;
      setConnectionStatus(true, "Connected — real-time chat active");
      if (currentUser) {
        registerOnServer(currentUser).then(() => {
          renderFriends();
          if (activeFriend) updateChatOnlineState();
        });
      }
      resolve();
    });

    socket.on("connect_error", () => {
      connected = false;
      setConnectionStatus(
        false,
        "Cannot reach server. Run start.bat and open the link it shows."
      );
      reject(new Error("Connection failed"));
    });

    socket.on("disconnect", () => {
      connected = false;
      setConnectionStatus(false, "Disconnected — reconnecting...");
      onlineUsers.clear();
      if (screens.friends.classList.contains("active")) renderFriends();
      if (activeFriend) updateChatOnlineState();
    });

    socket.on("online_list", (list) => {
      onlineUsers = new Set(list);
      if (screens.friends.classList.contains("active")) renderFriends();
      if (activeFriend) updateChatOnlineState();
    });

    socket.on("new_message", (msg) => {
      const peer = msg.peer || msg.from;
      if (
        activeFriend &&
        (peer === activeFriend.id || msg.from === activeFriend.id)
      ) {
        const type = msg.from === currentUser.id ? "sent" : "received";
        if (type === "received") {
          appendMessageDOM(msg.text, type, msg.time);
          renderedCount++;
        }
      }
    });

    socket.on("message_sent", (msg) => {
      /* confirmation handled in sendMessage */
    });
  });
}

function registerOnServer(user) {
  return new Promise((resolve, reject) => {
    socket.emit("register", { id: user.id, name: user.name }, (res) => {
      if (!res?.ok) {
        reject(new Error(res?.error || "Registration failed"));
        return;
      }
      onlineUsers = new Set(res.online || []);
      if (res.users) userNames = res.users;
      resolve();
    });
  });
}

async function login(user) {
  try {
    await connectSocket();
    await registerOnServer(user);
  } catch {
    alert(
      "Could not connect to the chat server.\n\n" +
        "1. Double-click start.bat in this folder\n" +
        "2. Wait for the server to start\n" +
        "3. Open http://localhost:3000 in your browser\n" +
        "4. Friends on same WiFi use: http://YOUR-PC-IP:3000"
    );
    return;
  }

  currentUser = user;
  saveJSON(STORAGE.user, user);

  $("myAvatar").textContent = getInitial(user.name);
  $("myName").textContent = user.name;
  $("displayMyId").textContent = user.id;

  loadServerInfo();
  renderFriends();
  showScreen("friends");
}

function logout() {
  currentUser = null;
  activeFriend = null;
  renderedCount = 0;
  localStorage.removeItem(STORAGE.user);
  if (socket) {
    socket.disconnect();
    socket = null;
  }
  connected = false;
  onlineUsers.clear();
  showScreen("login");
  $("userId").value = "";
  $("userName").value = "";
  setConnectionStatus(false, "Not connected");
}

async function loadServerInfo() {
  try {
    const res = await fetch(getServerUrl() + "/api/info");
    const info = await res.json();
    const bar = $("serverLinkBar");
    if (bar) {
      bar.innerHTML =
        'Share with friends: <a href="' +
        info.networkUrl +
        '" target="_blank">' +
        info.networkUrl +
        "</a>";
    }
  } catch {
    /* ignore */
  }
}

function renderFriends() {
  const list = $("friendList");
  const friends = getFriends();

  list.innerHTML = "";
  $("noFriends").classList.toggle("hidden", friends.length > 0);

  friends.forEach((fid) => {
    const info = userNames[fid] || { name: fid };
    const online = isOnline(fid);

    const li = document.createElement("li");
    li.className = "friend-item";
    li.innerHTML = `
      <div class="avatar">${getInitial(info.name)}</div>
      <div class="friend-item-info">
        <strong>${escapeHtml(info.name)}</strong>
        <span>${online ? "● Online" : "○ Offline"}</span>
      </div>
    `;
    li.addEventListener("click", () => openChat(fid, info.name));
    list.appendChild(li);
  });
}

function openChat(friendId, friendDisplayName) {
  const info = userNames[friendId] || { name: friendDisplayName || friendId };

  activeFriend = { id: friendId, name: info.name };
  renderedCount = 0;
  $("friendAvatar").textContent = getInitial(info.name);
  $("friendName").textContent = info.name;

  $("chatMessages").innerHTML = "";
  updateChatOnlineState();
  showScreen("chat");

  socket.emit("get_history", { with: friendId }, (history) => {
    $("chatMessages").innerHTML = "";
    renderedCount = 0;
    if (!history?.length) {
      const empty = document.createElement("p");
      empty.className = "empty-msg";
      empty.style.padding = "20px";
      empty.textContent = "No messages yet. Say hello!";
      $("chatMessages").appendChild(empty);
      return;
    }
    history.forEach((m) => {
      const type = m.from === currentUser.id ? "sent" : "received";
      appendMessageDOM(m.text, type, m.time, false);
    });
    renderedCount = history.length;
    $("chatMessages").scrollTop = $("chatMessages").scrollHeight;
  });

  $("messageInput").focus();
}

function updateChatOnlineState() {
  if (!activeFriend) return;

  const online = isOnline(activeFriend.id);
  const input = $("messageInput");
  const btn = $("sendBtn");
  const notice = $("offlineNotice");

  $("friendStatus").innerHTML = online
    ? '<span class="dot"></span> Online'
    : '<span class="dot offline"></span> Offline';

  const canSend = connected && socket?.connected;
  input.disabled = !canSend;
  btn.disabled = !canSend || !input.value.trim();
  if (!canSend) {
    notice.textContent = "Start the server (start.bat) to send messages.";
    notice.classList.remove("hidden");
  } else if (!online) {
    notice.textContent =
      "Friend is offline — they will see your message when they connect.";
    notice.classList.remove("hidden");
  } else {
    notice.classList.add("hidden");
  }
}

function appendMessageDOM(text, type, time, scroll = true) {
  const box = $("chatMessages");
  const empty = box.querySelector(".empty-msg");
  if (empty) empty.remove();

  const messageEl = document.createElement("div");
  messageEl.className = `message ${type}`;

  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.textContent = text;

  const timeEl = document.createElement("span");
  timeEl.className = "time";
  timeEl.textContent = getTime(time);

  messageEl.appendChild(bubble);
  messageEl.appendChild(timeEl);
  box.appendChild(messageEl);

  if (scroll) box.scrollTop = box.scrollHeight;
}

function sendMessage() {
  if (!currentUser || !activeFriend || !socket?.connected) return;

  const text = $("messageInput").value.trim();
  if (!text) return;

  socket.emit("send_message", { to: activeFriend.id, text });
  appendMessageDOM(text, "sent", Date.now());
  renderedCount++;
  $("messageInput").value = "";
  $("sendBtn").disabled = true;
}

/* Events */
$("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = normalizeId($("userId").value);
  const name = $("userName").value.trim();
  const serverInput = $("serverUrl");
  if (serverInput?.value.trim()) {
    localStorage.setItem(
      STORAGE.server,
      serverInput.value.trim().replace(/\/$/, "")
    );
  }

  if (!id || id.length < 3) {
    alert("ID must be at least 3 characters (letters, numbers, underscore).");
    return;
  }
  if (!name) {
    alert("Please enter your display name.");
    return;
  }

  await login({ id, name });
});

$("addFriendForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const fid = normalizeId($("friendIdInput").value);

  if (!fid || !socket?.connected) return;
  if (fid === currentUser.id) {
    alert("You cannot add yourself.");
    return;
  }

  socket.emit("lookup_user", { id: fid }, (user) => {
    if (!user) {
      alert(
        "User not found. They must open the chat and create an ID first (same server URL)."
      );
      return;
    }

    userNames[fid] = user;

    const friends = getFriends();
    if (friends.includes(fid)) {
      alert("Already in your friends list.");
      $("friendIdInput").value = "";
      return;
    }

    friends.push(fid);
    saveFriends(friends);
    $("friendIdInput").value = "";
    renderFriends();
  });
});

$("logoutBtn").addEventListener("click", logout);
$("backBtn").addEventListener("click", () => {
  activeFriend = null;
  renderedCount = 0;
  showScreen("friends");
  renderFriends();
});

$("sendBtn").addEventListener("click", sendMessage);
$("messageInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") sendMessage();
});
$("messageInput").addEventListener("input", () => {
  $("sendBtn").disabled =
    !socket?.connected || !$("messageInput").value.trim();
});

/* Boot */
init3DTilt();

const serverInput = $("serverUrl");
if (serverInput) {
  serverInput.value = getServerUrl();
  serverInput.placeholder = "http://localhost:3000";
}

setConnectionStatus(false, "Not connected — run start.bat first");

const saved = loadJSON(STORAGE.user, null);
if (saved?.id && saved?.name) {
  login(saved);
} else {
  showScreen("login");
}


