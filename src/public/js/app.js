// Main Dashboard Application Entry & State Router

let token = localStorage.getItem('maya_passcode') || '';
let selectedGuildId = '';
let guilds = [];
let activeTab = 'welcome';
let guildRoles = [];
let guildChannels = [];
let guildConfig = {};

// DOM Element References
let loginOverlay, appContainer, guildsList, mainContent, emptyState;
let welcomeChannelSelect, welcomeTitleInput, welcomeMessageInput, welcomeImageInput, welcomeThumbnailCheckbox;
let automodWordsInput, automodLogChannelSelect, automodMaxStrikesInput, automodMuteDurationInput;
let aiPersonalityInput;
let rulesChannelSelect, rulesTitleInput, rulesDescriptionInput, rulesColorInput, rulesColorPicker, rulesThumbnailInput, rulesBannerInput;
let announceChannelSelect, announceTitleInput, announceDescriptionInput, announceColorInput, announceColorPicker, announceThumbnailInput, announceBannerInput, announceBtnLabelInput, announceBtnUrlInput;
let genAnnounceChannelSelect, genAnnounceTitleInput, genAnnounceMentionSelect, genAnnounceDescriptionInput, genAnnounceColorInput, genAnnounceColorPicker, genAnnounceThumbnailInput, genAnnounceBannerInput, genAnnounceBtnLabelInput, genAnnounceBtnUrlInput;
let mabarChannelSelect, mabarGameInput, mabarTimeInput, mabarSlotsInput, mabarDescriptionInput;
let rrChannelSelect, rrTitleInput, rrDescriptionInput, rrColorInput, rrColorPicker;
let newRoleNameInput, newRoleColorInput, newRoleColorPicker, newRoleHoistCheckbox;
let previewTitle, previewDescription, previewThumbnailContainer, previewImageContainer, previewImage;

document.addEventListener('DOMContentLoaded', () => {
  // Global Promise Rejection Guard (suppress Chrome extension port noise)
  window.addEventListener('unhandledrejection', (event) => {
    if (event.reason && (
      String(event.reason).includes('message port closed') || 
      String(event.reason).includes('Extension context invalidated')
    )) {
      event.preventDefault();
    }
  });

  initDomReferences();
  initEventListeners();

  if (token) {
    verifyPasscode(token);
  }
});

function initDomReferences() {
  loginOverlay = document.getElementById('login-overlay');
  appContainer = document.getElementById('app-container');
  guildsList = document.getElementById('guilds-list');
  mainContent = document.getElementById('main-content');
  emptyState = document.getElementById('empty-state');

  // Welcome Form Inputs
  welcomeChannelSelect = document.getElementById('welcome-channel');
  welcomeTitleInput = document.getElementById('welcome-title');
  welcomeMessageInput = document.getElementById('welcome-message');
  welcomeImageInput = document.getElementById('welcome-image');
  welcomeThumbnailCheckbox = document.getElementById('welcome-thumbnail');

  // Automod Form Inputs
  automodWordsInput = document.getElementById('automod-words');
  automodLogChannelSelect = document.getElementById('automod-log-channel');
  automodMaxStrikesInput = document.getElementById('automod-max-strikes');
  automodMuteDurationInput = document.getElementById('automod-mute-duration');

  // AI Inputs
  aiPersonalityInput = document.getElementById('ai-personality');

  // Rules Inputs
  rulesChannelSelect = document.getElementById('rules-channel');
  rulesTitleInput = document.getElementById('rules-title');
  rulesDescriptionInput = document.getElementById('rules-description');
  rulesColorInput = document.getElementById('rules-color');
  rulesColorPicker = document.getElementById('rules-color-picker');
  rulesThumbnailInput = document.getElementById('rules-thumbnail');
  rulesBannerInput = document.getElementById('rules-banner');

  // Announcements Inputs
  announceChannelSelect = document.getElementById('announce-channel');
  announceTitleInput = document.getElementById('announce-title');
  announceDescriptionInput = document.getElementById('announce-description');
  announceColorInput = document.getElementById('announce-color');
  announceColorPicker = document.getElementById('announce-color-picker');
  announceThumbnailInput = document.getElementById('announce-thumbnail');
  announceBannerInput = document.getElementById('announce-banner');
  announceBtnLabelInput = document.getElementById('announce-btn-label');
  announceBtnUrlInput = document.getElementById('announce-btn-url');

  // General Announcements Inputs
  genAnnounceChannelSelect = document.getElementById('general-announce-channel');
  genAnnounceTitleInput = document.getElementById('general-announce-title');
  genAnnounceMentionSelect = document.getElementById('general-announce-mention');
  genAnnounceDescriptionInput = document.getElementById('general-announce-description');
  genAnnounceColorInput = document.getElementById('general-announce-color');
  genAnnounceColorPicker = document.getElementById('general-announce-color-picker');
  genAnnounceThumbnailInput = document.getElementById('general-announce-thumbnail');
  genAnnounceBannerInput = document.getElementById('general-announce-banner');
  genAnnounceBtnLabelInput = document.getElementById('general-announce-btn-label');
  genAnnounceBtnUrlInput = document.getElementById('general-announce-btn-url');

  // Mabar Inputs
  mabarChannelSelect = document.getElementById('mabar-channel');
  mabarGameInput = document.getElementById('mabar-game');
  mabarTimeInput = document.getElementById('mabar-time');
  mabarSlotsInput = document.getElementById('mabar-slots');
  mabarDescriptionInput = document.getElementById('mabar-description');

  // Reaction Roles Inputs
  rrChannelSelect = document.getElementById('rr-channel');
  rrTitleInput = document.getElementById('rr-title');
  rrDescriptionInput = document.getElementById('rr-description');
  rrColorInput = document.getElementById('rr-color');
  rrColorPicker = document.getElementById('rr-color-picker');

  // New Role Inputs
  newRoleNameInput = document.getElementById('new-role-name');
  newRoleColorInput = document.getElementById('new-role-color');
  newRoleColorPicker = document.getElementById('new-role-color-picker');
  newRoleHoistCheckbox = document.getElementById('new-role-hoist');

  // Embed Previews
  previewTitle = document.getElementById('preview-title');
  previewDescription = document.getElementById('preview-description');
  previewThumbnailContainer = document.getElementById('preview-thumbnail-container');
  previewImageContainer = document.getElementById('preview-image-container');
  previewImage = document.getElementById('preview-image');
}

function initEventListeners() {
  // Auth Form
  const loginForm = document.getElementById('login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const passcode = document.getElementById('passcode-input').value;
      await verifyPasscode(passcode);
    });
  }

  // Logout Button
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      localStorage.removeItem('maya_passcode');
      location.reload();
    });
  }

  // Config Form Submit
  const configForm = document.getElementById('config-form');
  if (configForm) {
    configForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      await saveConfig();
    });
  }

  // Real-time Welcome Embed Previews
  if (welcomeTitleInput) welcomeTitleInput.addEventListener('input', updateEmbedPreview);
  if (welcomeMessageInput) welcomeMessageInput.addEventListener('input', updateEmbedPreview);
  if (welcomeImageInput) welcomeImageInput.addEventListener('input', updateEmbedPreview);
  if (welcomeThumbnailCheckbox) welcomeThumbnailCheckbox.addEventListener('change', updateEmbedPreview);

  // Real-time Rules Previews
  if (rulesTitleInput) rulesTitleInput.addEventListener('input', updateRulesPreview);
  if (rulesDescriptionInput) rulesDescriptionInput.addEventListener('input', updateRulesPreview);
  if (rulesThumbnailInput) rulesThumbnailInput.addEventListener('input', updateRulesPreview);
  if (rulesBannerInput) rulesBannerInput.addEventListener('input', updateRulesPreview);
  if (rulesColorInput && rulesColorPicker) {
    rulesColorInput.addEventListener('input', () => {
      rulesColorPicker.value = rulesColorInput.value;
      updateRulesPreview();
    });
    rulesColorPicker.addEventListener('input', () => {
      rulesColorInput.value = rulesColorPicker.value;
      updateRulesPreview();
    });
  }

  // Real-time Announcements Previews
  if (announceTitleInput) announceTitleInput.addEventListener('input', updateAnnouncePreview);
  if (announceDescriptionInput) announceDescriptionInput.addEventListener('input', updateAnnouncePreview);
  if (announceThumbnailInput) announceThumbnailInput.addEventListener('input', updateAnnouncePreview);
  if (announceBannerInput) announceBannerInput.addEventListener('input', updateAnnouncePreview);
  if (announceBtnLabelInput) announceBtnLabelInput.addEventListener('input', updateAnnouncePreview);
  if (announceBtnUrlInput) announceBtnUrlInput.addEventListener('input', updateAnnouncePreview);
  if (announceColorInput && announceColorPicker) {
    announceColorInput.addEventListener('input', () => {
      announceColorPicker.value = announceColorInput.value;
      updateAnnouncePreview();
    });
    announceColorPicker.addEventListener('input', () => {
      announceColorInput.value = announceColorPicker.value;
      updateAnnouncePreview();
    });
  }

  // Real-time General Announcements Previews
  if (genAnnounceTitleInput) genAnnounceTitleInput.addEventListener('input', updateGeneralAnnouncePreview);
  if (genAnnounceMentionSelect) genAnnounceMentionSelect.addEventListener('change', updateGeneralAnnouncePreview);
  if (genAnnounceDescriptionInput) genAnnounceDescriptionInput.addEventListener('input', updateGeneralAnnouncePreview);
  if (genAnnounceColorInput && genAnnounceColorPicker) {
    genAnnounceColorInput.addEventListener('input', () => {
      genAnnounceColorPicker.value = genAnnounceColorInput.value;
      updateGeneralAnnouncePreview();
    });
    genAnnounceColorPicker.addEventListener('input', () => {
      genAnnounceColorInput.value = genAnnounceColorPicker.value;
      updateGeneralAnnouncePreview();
    });
  }
  if (genAnnounceThumbnailInput) genAnnounceThumbnailInput.addEventListener('input', updateGeneralAnnouncePreview);
  if (genAnnounceBannerInput) genAnnounceBannerInput.addEventListener('input', updateGeneralAnnouncePreview);
  if (genAnnounceBtnLabelInput) genAnnounceBtnLabelInput.addEventListener('input', updateGeneralAnnouncePreview);
  if (genAnnounceBtnUrlInput) genAnnounceBtnUrlInput.addEventListener('input', updateGeneralAnnouncePreview);

  // New Role Color Pickers
  if (newRoleColorInput && newRoleColorPicker) {
    newRoleColorInput.addEventListener('input', () => {
      newRoleColorPicker.value = newRoleColorInput.value;
    });
    newRoleColorPicker.addEventListener('input', () => {
      newRoleColorInput.value = newRoleColorPicker.value;
    });
  }
}

async function verifyPasscode(passcode) {
  try {
    const response = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ passcode })
    });

    if (response.ok) {
      const data = await response.json();
      token = data.token;
      localStorage.setItem('maya_passcode', token);
      
      if (loginOverlay) {
        loginOverlay.classList.add('opacity-0');
        setTimeout(() => {
          loginOverlay.classList.add('hidden');
          if (appContainer) appContainer.classList.remove('hidden');
        }, 300);
      }
      
      await loadGuilds();
    } else {
      showToast('Akses Ditolak', 'Passcode yang dimasukkan salah.', 'error');
    }
  } catch (error) {
    showToast('Kesalahan Koneksi', 'Tidak dapat menghubungi server API.', 'error');
  }
}

async function loadGuilds() {
  try {
    const response = await apiFetch('/api/guilds');
    if (!response.ok) throw new Error();
    
    const data = await response.json();
    guilds = data.guilds || [];
    renderGuilds();

    if (guilds.length > 0 && !selectedGuildId) {
      selectGuild(guilds[0].id);
    }
  } catch (error) {
    if (error.message !== '401 Unauthorized') {
      showToast('Gagal Memuat Server', 'Gagal memuat daftar server dari bot.', 'error');
    }
  }
}

function renderGuilds() {
  if (!guildsList) return;
  if (guilds.length === 0) {
    guildsList.innerHTML = `<div class="text-center py-6 text-gray-500 text-xs">Bot belum bergabung di server manapun.</div>`;
    return;
  }

  guildsList.innerHTML = guilds.map(guild => `
    <button 
      onclick="selectGuild('${guild.id}')"
      id="guild-btn-${guild.id}"
      class="w-full flex items-center gap-3 p-2.5 rounded-xl text-left border border-transparent hover:bg-white/5 transition-all"
    >
      ${guild.icon 
        ? `<img src="${guild.icon}" class="w-10 h-10 rounded-xl object-cover">` 
        : `<div class="w-10 h-10 rounded-xl bg-discord-blurple/20 text-discord-blurple flex items-center justify-center font-bold font-outfit uppercase">${escapeHtml(guild.name.slice(0, 2))}</div>`
      }
      <div class="flex-1 min-w-0">
        <h4 class="font-medium text-sm text-white truncate">${escapeHtml(guild.name)}</h4>
        <p class="text-[10px] text-gray-400 mt-0.5">${guild.memberCount} Members</p>
      </div>
    </button>
  `).join('');
}

async function selectGuild(guildId) {
  selectedGuildId = guildId;
  
  // Update UI active states
  guilds.forEach(g => {
    const btn = document.getElementById(`guild-btn-${g.id}`);
    if (btn) {
      if (g.id === guildId) {
        btn.classList.add('bg-white/10', 'border-white/10');
        btn.classList.remove('hover:bg-white/5');
      } else {
        btn.classList.remove('bg-white/10', 'border-white/10');
        btn.classList.add('hover:bg-white/5');
      }
    }
  });
  
  if (emptyState) emptyState.classList.add('hidden');
  if (mainContent) mainContent.classList.remove('hidden');
  
  const guild = guilds.find(g => g.id === guildId);
  const guildNameElem = document.getElementById('current-guild-name');
  if (guildNameElem && guild) {
    guildNameElem.innerText = guild.name;
  }
  
  try {
    const response = await apiFetch(`/api/configs/${guildId}`);
    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || 'Gagal memuat setting server ini.');
    }
    
    const { config, channels } = await response.json();
    
    // Cache to globals so tabs can re-use them when switching
    guildConfig = config;
    guildChannels = channels;

    if (welcomeChannelSelect) {
      welcomeChannelSelect.innerHTML = `
        <option value="">-- Nonaktifkan Welcomer --</option>
        ${channels.map(c => `<option value="${c.id}" ${config.welcomeChannelId === c.id ? 'selected' : ''}>#${escapeHtml(c.name)}</option>`).join('')}
      `;
    }
    
    if (automodLogChannelSelect) {
      automodLogChannelSelect.innerHTML = `
        <option value="">-- Nonaktifkan Log Moderasi --</option>
        ${channels.map(c => `<option value="${c.id}" ${config.moderationLogChannelId === c.id ? 'selected' : ''}>#${escapeHtml(c.name)}</option>`).join('')}
      `;
    }
    
    if (rulesChannelSelect) rulesChannelSelect.innerHTML = `<option value="">-- Pilih Channel Rules --</option>` + channels.map(c => `<option value="${c.id}">#${escapeHtml(c.name)}</option>`).join('');
    if (announceChannelSelect) announceChannelSelect.innerHTML = `<option value="">-- Pilih Channel Target --</option>` + channels.map(c => `<option value="${c.id}">#${escapeHtml(c.name)}</option>`).join('');
    if (mabarChannelSelect) mabarChannelSelect.innerHTML = `<option value="">-- Pilih Channel Mabar --</option>` + channels.map(c => `<option value="${c.id}">#${escapeHtml(c.name)}</option>`).join('');
    if (genAnnounceChannelSelect) genAnnounceChannelSelect.innerHTML = `<option value="">-- Pilih Channel Target --</option>` + channels.map(c => `<option value="${c.id}">#${escapeHtml(c.name)}</option>`).join('');
    if (rrChannelSelect) rrChannelSelect.innerHTML = `<option value="">-- Pilih Channel Target --</option>` + channels.map(c => `<option value="${c.id}">#${escapeHtml(c.name)}</option>`).join('');

    // Reset reaction role options container on guild switch to prevent stale roles
    const rrContainer = document.getElementById('rr-options-container');
    if (rrContainer) rrContainer.innerHTML = '';
    guildRoles = [];

    // Fill form fields with config data
    if (welcomeTitleInput) welcomeTitleInput.value = config.welcomeTitle || '👋 Selamat Datang!';
    if (welcomeMessageInput) welcomeMessageInput.value = config.welcomeMessage || '';
    if (welcomeImageInput) welcomeImageInput.value = config.welcomeImage || '';
    if (welcomeThumbnailCheckbox) welcomeThumbnailCheckbox.checked = config.welcomeThumbnail ?? true;

    if (automodWordsInput) automodWordsInput.value = config.bannedWords || '';
    if (automodMaxStrikesInput) automodMaxStrikesInput.value = config.maxStrikes || 3;
    if (automodMuteDurationInput) automodMuteDurationInput.value = config.muteDuration || 10;

    if (aiPersonalityInput) aiPersonalityInput.value = config.aiPersonality || '';

    if (typeof loadDailyRiddleConfig === 'function') {
      loadDailyRiddleConfig(config, channels);
    }

    if (typeof loadDailyPollConfig === 'function') {
      loadDailyPollConfig(config, channels);
    }

    if (typeof loadDailyStoryConfig === 'function') {
      loadDailyStoryConfig(config, channels);
    }

    if (typeof loadMenfessConfig === 'function') {
      loadMenfessConfig(config, channels);
    }

    if (typeof loadRobloxConfig === 'function') {
      loadRobloxConfig(config, channels);
    }

    if (typeof loadEconomyConfig === 'function') {
      loadEconomyConfig(config);
    }

    // Fetch server roles and await before showing tab (prevents stale roles on guild switch)
    try {
      const rolesRes = await apiFetch(`/api/roles/${guildId}`);
      const rolesData = await rolesRes.json();
      guildRoles = rolesData.roles || [];
    } catch (_) { guildRoles = []; }

    // Always reset and add one fresh empty row after roles are loaded for the new guild
    if (rrContainer) addRrOptionRow();

    switchTab(activeTab);
    updateEmbedPreview();
  } catch (error) {
    if (error.message !== '401 Unauthorized') {
      showToast('Gagal Memuat Konfigurasi', error.message || 'Gagal memuat setting server ini.', 'error');
    }
  }
}

function switchTab(tabId) {
  activeTab = tabId;
  
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  const targetBtn = document.getElementById(`tab-btn-${tabId}`);
  if (targetBtn) targetBtn.classList.add('active');
  
  document.querySelectorAll('.tab-pane').forEach(pane => {
    pane.classList.add('hidden');
  });
  const targetPane = document.getElementById(`tab-content-${tabId}`);
  if (targetPane) targetPane.classList.remove('hidden');

  const saveBar = document.getElementById('save-bar');
  if (saveBar) {
    if (tabId === 'warnings' || tabId === 'rules' || tabId === 'roles' || tabId === 'announcements' || tabId === 'mabar' || tabId === 'reaction-roles' || tabId === 'general-announce' || tabId === 'daily-riddle' || tabId === 'daily-poll' || tabId === 'daily-story' || tabId === 'menfess' || tabId === 'roblox' || tabId === 'analytics' || tabId === 'economy' || tabId === 'shop') {
      saveBar.classList.add('hidden');
    } else {
      saveBar.classList.remove('hidden');
    }
  }

  // Trigger component data fetch
  if (tabId === 'warnings') {
    loadWarnings();
  } else if (tabId === 'rules') {
    updateRulesPreview();
  } else if (tabId === 'roles') {
    loadRoles();
  } else if (tabId === 'announcements') {
    updateAnnouncePreview();
  } else if (tabId === 'general-announce') {
    updateGeneralAnnouncePreview();
  } else if (tabId === 'mabar') {
    loadMabar();
  } else if (tabId === 'reaction-roles') {
    loadReactionRoles();
  } else if (tabId === 'ai') {
    loadAiHistory();
  } else if (tabId === 'daily-riddle') {
    if (typeof loadActiveRiddleLive === 'function') loadActiveRiddleLive();
  } else if (tabId === 'daily-poll') {
    if (typeof loadActivePollLive === 'function') loadActivePollLive();
  } else if (tabId === 'daily-story') {
    if (typeof loadDailyStoryConfig === 'function' && guildConfig && guildChannels) {
      loadDailyStoryConfig(guildConfig, guildChannels);
    } else if (typeof loadActiveStoryLive === 'function') {
      loadActiveStoryLive();
    }
  } else if (tabId === 'menfess') {
    if (typeof loadMenfessConfig === 'function' && guildConfig && guildChannels) {
      loadMenfessConfig(guildConfig, guildChannels);
    }
  } else if (tabId === 'roblox') {
    if (typeof loadRobloxConfig === 'function' && guildConfig && guildChannels) {
      loadRobloxConfig(guildConfig, guildChannels);
    } else if (typeof fetchRobloxData === 'function') {
      fetchRobloxData();
    }
  } else if (tabId === 'analytics') {
    if (typeof loadAnalytics === 'function') loadAnalytics();
  } else if (tabId === 'economy') {
    if (typeof loadEconomyBalances === 'function') loadEconomyBalances();
  } else if (tabId === 'shop') {
    if (typeof loadShopData === 'function') loadShopData();
  }
}
