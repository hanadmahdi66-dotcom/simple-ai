const STORAGE = {
  user: "hanad_current_user",
  registry: "hanad_users",
  friends: (id) => `hanad_friends_${id}`,
  chat: (a, b) => `hanad_chat_${[a, b].sort().join("_")}`,
};

const ONLINE_MS = 45000;
const HEARTBEAT_MS = 8000;
const POLL_MS = 2000;

let currentUser = null;
let activeFriend = null;
let pollTimer = null;

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

function getRegistry() {
  return loadJSON(STORAGE.registry, {});
}

function saveUserToRegistry(user) {
  const reg = getRegistry();
  reg[user.id] = {
    name: user.name,
    lastSeen: Date.now(),
  };
  saveJSON(STORAGE.registry, reg);
}

function isOnline(userId) {
  const reg = getRegistry();
  const u = reg[userId];
  if (!u || !u.lastSeen) return false;
  return Date.now() - u.lastSeen < ONLINE_MS;
}

function heartbeat() {
  if (!currentUser) return;
  saveUserToRegistry(currentUser);
}

function getFriends() {
  if (!currentUser) return [];
  return loadJSON(STORAGE.friends(currentUser.id), []);
}

function saveFriends(list) {
  saveJSON(STORAGE.friends(currentUser.id), list);
}

function getChatKey(friendId) {
  return STORAGE.chat(currentUser.id, friendId);
}

function getMessages(friendId) {
  return loadJSON(getChatKey(friendId), []);
}

function saveMessages(friendId, messages) {
  saveJSON(getChatKey(friendId), messages);
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

function init3DTilt() {
  const app = $("chatApp");
  const scene = document.querySelector(".scene");

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

function login(user) {
  currentUser = user;
  saveJSON(STORAGE.user, user);
  saveUserToRegistry(user);

  $("myAvatar").textContent = getInitial(user.name);
  $("myName").textContent = user.name;
  $("displayMyId").textContent = user.id;

  renderFriends();
  showScreen("friends");
  startPolling();
}

function logout() {
  currentUser = null;
  activeFriend = null;
  localStorage.removeItem(STORAGE.user);
  stopPolling();
  showScreen("login");
  $("userId").value = "";
  $("userName").value = "";
}

function renderFriends() {
  const list = $("friendList");
  const friends = getFriends();
  const reg = getRegistry();

  list.innerHTML = "";
  $("noFriends").classList.toggle("hidden", friends.length > 0);

  friends.forEach((fid) => {
    const info = reg[fid] || { name: fid };
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

function escapeHtml(text) {
  const d = document.createElement("div");
  d.textContent = text;
  return d.innerHTML;
}

function openChat(friendId, friendDisplayName) {
  const reg = getRegistry();
  const info = reg[friendId] || { name: friendDisplayName || friendId };

  activeFriend = { id: friendId, name: info.name };
  renderedCount = 0;
  $("friendAvatar").textContent = getInitial(info.name);
  $("friendName").textContent = info.name;

  renderMessages(true);
  updateChatOnlineState();
  showScreen("chat");
  if (isOnline(friendId)) $("messageInput").focus();
}

function updateChatOnlineState() {
  if (!activeFriend) return;

  const online = isOnline(activeFriend.id);
  const statusEl = $("friendStatus");
  const input = $("messageInput");
  const btn = $("sendBtn");
  const notice = $("offlineNotice");

  statusEl.innerHTML = online
    ? '<span class="dot"></span> Online — you can send messages'
    : '<span class="dot offline"></span> Offline';

  input.disabled = !online;
  btn.disabled = !online || !input.value.trim();
  notice.classList.toggle("hidden", online);

  if (!online) input.value = "";
}

let renderedCount = 0;

function renderMessages(force = false) {
  const box = $("chatMessages");
  if (!activeFriend || !currentUser) return;

  const msgs = getMessages(activeFriend.id);

  if (msgs.length === 0) {
    if (force || box.children.length === 0) {
      box.innerHTML = "";
      const empty = document.createElement("p");
      empty.className = "empty-msg";
      empty.style.padding = "20px";
      empty.textContent = "No messages yet. Chat when your friend is online!";
      box.appendChild(empty);
    }
    renderedCount = 0;
    return;
  }

  if (!force && msgs.length === renderedCount) return;

  if (force || renderedCount === 0) {
    box.innerHTML = "";
    msgs.forEach((m) => {
      const type = m.from === currentUser.id ? "sent" : "received";
      appendMessageDOM(m.text, type, m.time, false);
    });
    renderedCount = msgs.length;
  } else if (msgs.length > renderedCount) {
    for (let i = renderedCount; i < msgs.length; i++) {
      const m = msgs[i];
      const type = m.from === currentUser.id ? "sent" : "received";
      appendMessageDOM(m.text, type, m.time, false);
    }
    renderedCount = msgs.length;
  }

  box.scrollTop = box.scrollHeight;
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
  if (!currentUser || !activeFriend) return;
  if (!isOnline(activeFriend.id)) return;

  const text = $("messageInput").value.trim();
  if (!text) return;

  const msg = {
    from: currentUser.id,
    text,
    time: Date.now(),
  };

  const msgs = getMessages(activeFriend.id);
  msgs.push(msg);
  saveMessages(activeFriend.id, msgs);

  appendMessageDOM(text, "sent", msg.time);
  renderedCount = msgs.length;
  $("messageInput").value = "";
  $("sendBtn").disabled = true;
}

function pollUpdates() {
  heartbeat();
  if (screens.friends.classList.contains("active")) {
    renderFriends();
  }
  if (screens.chat.classList.contains("active") && activeFriend) {
    updateChatOnlineState();
    renderMessages();
  }
}

function startPolling() {
  stopPolling();
  heartbeat();
  pollTimer = setInterval(pollUpdates, POLL_MS);
}

function stopPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
}

/* Events */
$("loginForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const id = normalizeId($("userId").value);
  const name = $("userName").value.trim();

  if (!id || id.length < 3) {
    alert("ID must be at least 3 characters (letters, numbers, underscore).");
    return;
  }
  if (!name) {
    alert("Please enter your display name.");
    return;
  }

  login({ id, name });
});

$("addFriendForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const fid = normalizeId($("friendIdInput").value);

  if (!fid) return;
  if (fid === currentUser.id) {
    alert("You cannot add yourself.");
    return;
  }

  const reg = getRegistry();
  if (!reg[fid]) {
    reg[fid] = { name: fid, lastSeen: 0 };
    saveJSON(STORAGE.registry, reg);
  }

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

$("logoutBtn").addEventListener("click", logout);
$("backBtn").addEventListener("click", () => {
  activeFriend = null;
  showScreen("friends");
  renderFriends();
});

$("sendBtn").addEventListener("click", sendMessage);
$("messageInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") sendMessage();
});
$("messageInput").addEventListener("input", () => {
  $("sendBtn").disabled =
    !activeFriend ||
    !isOnline(activeFriend.id) ||
    !$("messageInput").value.trim();
});

/* Boot */
init3DTilt();

const saved = loadJSON(STORAGE.user, null);
if (saved && saved.id && saved.name) {
  login(saved);
} else {
  showScreen("login");
}

window.addEventListener("beforeunload", heartbeat);
