const chatMessages = document.getElementById("chatMessages");
const messageInput = document.getElementById("messageInput");
const sendBtn = document.getElementById("sendBtn");

const replies = [
  "That's interesting!",
  "Tell me more.",
  "Got it, thanks!",
  "I understand.",
  "Sounds good to me.",
];

function getTime() {
  return new Date().toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

function addMessage(text, type) {
  const messageEl = document.createElement("div");
  messageEl.className = `message ${type}`;

  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.textContent = text;

  const time = document.createElement("span");
  time.className = "time";
  time.textContent = getTime();

  messageEl.appendChild(bubble);
  messageEl.appendChild(time);
  chatMessages.appendChild(messageEl);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function sendMessage() {
  const text = messageInput.value.trim();
  if (!text) return;

  addMessage(text, "sent");
  messageInput.value = "";
  sendBtn.disabled = true;

  setTimeout(() => {
    const reply = replies[Math.floor(Math.random() * replies.length)];
    addMessage(reply, "received");
    sendBtn.disabled = false;
    messageInput.focus();
  }, 800);
}

sendBtn.addEventListener("click", sendMessage);

messageInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") sendMessage();
});

messageInput.addEventListener("input", () => {
  sendBtn.disabled = !messageInput.value.trim();
});

messageInput.focus();
