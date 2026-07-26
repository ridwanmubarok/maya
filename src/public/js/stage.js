(function () {
  // Parse URL Parameters
  const urlParams = new URLSearchParams(window.location.search);
  const roomId = urlParams.get("room") || "";
  const queryUsername = urlParams.get("user") || `Guest_${Math.floor(1000 + Math.random() * 9000)}`;
  const queryAvatar = urlParams.get("avatar") || "https://cdn.discordapp.com/embed/avatars/0.png";
  const queryUserId = urlParams.get("userId") || undefined;

  if (!roomId) {
    alert("Kode Room Stage tidak ditemukan pada URL!");
    return;
  }

  // Socket Connection
  const socket = io();

  // Application State
  let currentRoom = null;
  let isHost = false;
  let ytPlayer = null;
  let isYtReady = false;
  let isProgrammaticChange = false;
  let currentVideoType = "youtube"; // 'youtube' | 'direct'

  // DOM Elements
  const stageTitleEl = document.getElementById("stageTitle");
  const stageHostInfoEl = document.getElementById("stageHostInfo");
  const audienceCountEl = document.getElementById("audienceCount");
  const tabAudienceCountEl = document.getElementById("tabAudienceCount");
  const hostNameTextEl = document.getElementById("hostNameText");
  const hostControlPanelEl = document.getElementById("hostControlPanel");
  const btnPlayPause = document.getElementById("btnPlayPause");
  const btnSyncAll = document.getElementById("btnSyncAll");
  const btnCopyLink = document.getElementById("btnCopyLink");
  const chatMessagesEl = document.getElementById("chatMessages");
  const chatFormEl = document.getElementById("chatForm");
  const chatInputEl = document.getElementById("chatInput");
  const audienceListEl = document.getElementById("audienceList");
  const html5Player = document.getElementById("html5Player");
  const html5PlayerContainer = document.getElementById("html5PlayerContainer");
  const ytPlayerContainer = document.getElementById("ytPlayerContainer");
  const syncOverlay = document.getElementById("syncOverlay");
  const floatingReactionsContainer = document.getElementById("floatingReactions");
  const toastEl = document.getElementById("toast");

  // Tabs toggle
  const tabChatBtn = document.getElementById("tabChatBtn");
  const tabAudienceBtn = document.getElementById("tabAudienceBtn");
  const tabChatContent = document.getElementById("tabChatContent");
  const tabAudienceContent = document.getElementById("tabAudienceContent");

  tabChatBtn.addEventListener("click", () => {
    tabChatBtn.classList.add("active");
    tabAudienceBtn.classList.remove("active");
    tabChatContent.classList.add("active");
    tabAudienceContent.classList.remove("active");
  });

  tabAudienceBtn.addEventListener("click", () => {
    tabAudienceBtn.classList.add("active");
    tabChatBtn.classList.remove("active");
    tabAudienceContent.classList.add("active");
    tabChatContent.classList.remove("active");
  });

  // Socket Events
  socket.on("connect", () => {
    console.log("Connected to Stage Socket Server");
    socket.emit("join-stage", {
      roomId,
      username: queryUsername,
      avatarUrl: queryAvatar,
      userId: queryUserId,
    });
  });

  socket.on("error-message", (msg) => {
    showToast(`⚠️ ${msg}`);
  });

  socket.on("room-data", (roomData) => {
    currentRoom = roomData;
    stageTitleEl.textContent = roomData.title;
    stageHostInfoEl.textContent = `Room ID: ${roomData.id} • Host: ${roomData.hostName}`;
    hostNameTextEl.textContent = roomData.hostName;

    // Check if current socket is host
    isHost = socket.id === roomData.hostSocketId || queryUserId === roomData.hostId;
    updateHostUI();

    // Setup Video Player Type
    currentVideoType = roomData.videoType;
    if (currentVideoType === "youtube") {
      ytPlayerContainer.classList.remove("hidden");
      html5PlayerContainer.classList.add("hidden");
      initYouTubePlayer(roomData.youtubeId, roomData.currentTime, roomData.isPlaying);
    } else {
      ytPlayerContainer.classList.add("hidden");
      html5PlayerContainer.classList.remove("hidden");
      initHtml5Player(roomData.videoUrl, roomData.currentTime, roomData.isPlaying);
    }

    // Render initial participants & chat
    renderAudienceList(roomData.participants);
    renderChatHistory(roomData.chatHistory);
  });

  socket.on("participant-updated", (participants) => {
    renderAudienceList(participants);
    // Check if host changed
    const host = participants.find((p) => p.isHost);
    if (host) {
      hostNameTextEl.textContent = host.username;
      stageHostInfoEl.textContent = `Room ID: ${roomId} • Host: ${host.username}`;
      isHost = socket.id === host.socketId || queryUserId === host.userId;
      updateHostUI();
    }
  });

  socket.on("video-action", (data) => {
    console.log("Received video-action:", data);
    applyVideoAction(data.action, data.currentTime);
  });

  socket.on("chat-message", (msg) => {
    appendChatMessage(msg);
  });

  socket.on("floating-reaction", (data) => {
    createFloatingEmoji(data.emoji);
  });

  // UI Updates
  function updateHostUI() {
    if (isHost) {
      hostControlPanelEl.style.display = "flex";
    } else {
      hostControlPanelEl.style.display = "none";
    }
  }

  function renderAudienceList(participants) {
    audienceCountEl.textContent = participants.length;
    tabAudienceCountEl.textContent = participants.length;
    audienceListEl.innerHTML = "";

    participants.forEach((p) => {
      const li = document.createElement("li");
      li.className = "audience-item";
      li.innerHTML = `
        <img class="audience-avatar" src="${p.avatarUrl || 'https://cdn.discordapp.com/embed/avatars/0.png'}" alt="${p.username}" />
        <span class="audience-name">${escapeHtml(p.username)}</span>
        ${p.isHost ? '<span class="host-tag">👑 HOST</span>' : ""}
      `;
      audienceListEl.appendChild(li);
    });
  }

  function renderChatHistory(messages) {
    chatMessagesEl.innerHTML = "";
    messages.forEach((msg) => appendChatMessage(msg));
  }

  function appendChatMessage(msg) {
    const div = document.createElement("div");
    if (msg.isSystem) {
      div.className = "chat-msg system";
      div.textContent = msg.text;
    } else {
      div.className = "chat-msg";
      div.innerHTML = `
        <div class="msg-header">
          <span class="msg-username">${escapeHtml(msg.username)}</span>
          <span class="msg-time">${msg.timestamp}</span>
        </div>
        <div class="msg-text">${escapeHtml(msg.text)}</div>
      `;
    }
    chatMessagesEl.appendChild(div);
    chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
  }

  // YouTube Player Initialization
  function initYouTubePlayer(youtubeId, initialTime, isPlaying) {
    if (!window.YT || !window.YT.Player) {
      window.onYouTubeIframeAPIReady = () => createYtPlayerInstance(youtubeId, initialTime, isPlaying);
    } else {
      createYtPlayerInstance(youtubeId, initialTime, isPlaying);
    }
  }

  function createYtPlayerInstance(youtubeId, initialTime, isPlaying) {
    if (ytPlayer) {
      ytPlayer.loadVideoById(youtubeId, initialTime);
      return;
    }

    ytPlayer = new YT.Player("ytPlayer", {
      videoId: youtubeId,
      playerVars: {
        autoplay: isPlaying ? 1 : 0,
        controls: 1,
        rel: 0,
        modestbranding: 1,
        start: Math.floor(initialTime || 0),
      },
      events: {
        onReady: (event) => {
          isYtReady = true;
          if (isPlaying) event.target.playVideo();
        },
        onStateChange: (event) => {
          if (isProgrammaticChange || !isHost) return;

          const time = ytPlayer.getCurrentTime();
          if (event.data === YT.PlayerState.PLAYING) {
            btnPlayPause.textContent = "⏸ Pause";
            emitVideoAction("play", time);
          } else if (event.data === YT.PlayerState.PAUSED) {
            btnPlayPause.textContent = "▶ Play";
            emitVideoAction("pause", time);
          }
        },
      },
    });
  }

  // HTML5 Video Player Initialization
  function initHtml5Player(url, initialTime, isPlaying) {
    html5Player.src = url;
    html5Player.currentTime = initialTime || 0;
    if (isPlaying) {
      html5Player.play().catch(() => {});
    }

    html5Player.onplay = () => {
      if (isProgrammaticChange || !isHost) return;
      btnPlayPause.textContent = "⏸ Pause";
      emitVideoAction("play", html5Player.currentTime);
    };

    html5Player.onpause = () => {
      if (isProgrammaticChange || !isHost) return;
      btnPlayPause.textContent = "▶ Play";
      emitVideoAction("pause", html5Player.currentTime);
    };

    html5Player.onseeked = () => {
      if (isProgrammaticChange || !isHost) return;
      emitVideoAction("seek", html5Player.currentTime);
    };
  }

  // Video Sync Action Dispatcher
  function applyVideoAction(action, time) {
    isProgrammaticChange = true;

    if (currentVideoType === "youtube" && ytPlayer && isYtReady) {
      if (action === "play") {
        if (Math.abs(ytPlayer.getCurrentTime() - time) > 1.5) {
          ytPlayer.seekTo(time, true);
        }
        ytPlayer.playVideo();
      } else if (action === "pause") {
        ytPlayer.pauseVideo();
        ytPlayer.seekTo(time, true);
      } else if (action === "seek") {
        ytPlayer.seekTo(time, true);
      }
    } else if (currentVideoType === "direct" && html5Player) {
      if (action === "play") {
        if (Math.abs(html5Player.currentTime - time) > 1.5) {
          html5Player.currentTime = time;
        }
        html5Player.play().catch(() => {});
      } else if (action === "pause") {
        html5Player.pause();
        html5Player.currentTime = time;
      } else if (action === "seek") {
        html5Player.currentTime = time;
      }
    }

    setTimeout(() => {
      isProgrammaticChange = false;
    }, 500);
  }

  function emitVideoAction(action, time) {
    socket.emit("video-action", {
      roomId,
      action,
      currentTime: time || 0,
    });
  }

  // Host Controls Handlers
  btnPlayPause.addEventListener("click", () => {
    if (!isHost) return;
    if (currentVideoType === "youtube" && ytPlayer && isYtReady) {
      const state = ytPlayer.getPlayerState();
      if (state === YT.PlayerState.PLAYING) {
        ytPlayer.pauseVideo();
      } else {
        ytPlayer.playVideo();
      }
    } else if (currentVideoType === "direct" && html5Player) {
      if (html5Player.paused) {
        html5Player.play();
      } else {
        html5Player.pause();
      }
    }
  });

  btnSyncAll.addEventListener("click", () => {
    if (!isHost) return;
    let time = 0;
    let playing = false;

    if (currentVideoType === "youtube" && ytPlayer && isYtReady) {
      time = ytPlayer.getCurrentTime();
      playing = ytPlayer.getPlayerState() === YT.PlayerState.PLAYING;
    } else if (currentVideoType === "direct" && html5Player) {
      time = html5Player.currentTime;
      playing = !html5Player.paused;
    }

    emitVideoAction(playing ? "play" : "pause", time);
    showToast("🔄 Menyinkronkan seluruh penonton ke posisi Anda...");
  });

  // Chat Form Submission
  chatFormEl.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = chatInputEl.value.trim();
    if (!text) return;

    socket.emit("send-chat", {
      roomId,
      text,
    });

    chatInputEl.value = "";
  });

  // Reaction Buttons
  document.querySelectorAll(".btn-reaction").forEach((btn) => {
    btn.addEventListener("click", () => {
      const emoji = btn.getAttribute("data-emoji");
      createFloatingEmoji(emoji);
      socket.emit("send-reaction", {
        roomId,
        emoji,
      });
    });
  });

  // Floating Emoji Animation
  function createFloatingEmoji(emoji) {
    const el = document.createElement("div");
    el.className = "floating-emoji";
    el.textContent = emoji;

    // Randomize horizontal position (10% to 90%)
    const randomLeft = Math.floor(10 + Math.random() * 80);
    el.style.left = `${randomLeft}%`;

    floatingReactionsContainer.appendChild(el);

    setTimeout(() => {
      el.remove();
    }, 3000);
  }

  // Copy Link Button
  btnCopyLink.addEventListener("click", () => {
    navigator.clipboard.writeText(window.location.href);
    showToast("📋 Link Stage telah disalin ke clipboard!");
  });

  // Toast Helper
  function showToast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.remove("hidden");
    setTimeout(() => {
      toastEl.classList.add("hidden");
    }, 3000);
  }

  function escapeHtml(str) {
    return str.replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[m]));
  }
})();
