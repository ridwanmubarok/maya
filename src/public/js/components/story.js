// Maya Story Chain Configuration & Live Backoffice Component

let liveStoryInterval = null;

function populateStoryChannels(channels, selectedChannelId) {
  const select = document.getElementById('story-channel');
  if (!select) return;

  select.innerHTML = `<option value="">Pilih Channel (Default: #cerita-bersambung / Channel Utama)</option>` +
    channels.map(c => `
      <option value="${c.id}" ${c.id === selectedChannelId ? 'selected' : ''}>#${escapeHtml(c.name)}</option>
    `).join('');
}

function populateStoryHourDropdowns(selectedStartHour, selectedPublishHour) {
  const startSelect = document.getElementById('story-start-hour');
  const publishSelect = document.getElementById('story-publish-hour');

  const hours = Array.from({ length: 24 }, (_, i) => {
    const formatted = String(i).padStart(2, '0') + ':00 WIB';
    return { value: i, label: formatted };
  });

  if (startSelect) {
    startSelect.innerHTML = hours.map(h => `
      <option value="${h.value}" ${h.value === (selectedStartHour ?? 10) ? 'selected' : ''}>${h.label}</option>
    `).join('');
  }

  if (publishSelect) {
    publishSelect.innerHTML = hours.map(h => `
      <option value="${h.value}" ${h.value === (selectedPublishHour ?? 22) ? 'selected' : ''}>${h.label}</option>
    `).join('');
  }
}

function loadDailyStoryConfig(config, channels) {
  const enabledCheckbox = document.getElementById('story-enabled');
  const wordRewardInput = document.getElementById('story-word-reward');
  const mvpRewardInput = document.getElementById('story-mvp-reward');

  if (enabledCheckbox) {
    enabledCheckbox.checked = config.storyEnabled !== false;
  }
  if (wordRewardInput) {
    wordRewardInput.value = config.storyWordReward ?? 10;
  }
  if (mvpRewardInput) {
    mvpRewardInput.value = config.storyMvpReward ?? 100;
  }

  populateStoryChannels(channels, config.storyChannelId);
  populateStoryHourDropdowns(config.storyStartHour, config.storyPublishHour);

  // Load Live Backoffice Data
  loadActiveStoryLive();
  if (liveStoryInterval) clearInterval(liveStoryInterval);
  liveStoryInterval = setInterval(loadActiveStoryLive, 10000);
}

async function loadActiveStoryLive() {
  if (!selectedGuildId) return;

  const chainContainer = document.getElementById('live-story-chain-card');
  const tbody = document.getElementById('live-story-tbody');
  const countBadge = document.getElementById('live-story-count');
  const showcaseContainer = document.getElementById('latest-story-showcase');

  if (!chainContainer || !tbody) return;

  try {
    const res = await apiFetch(`/api/configs/${selectedGuildId}/today-story`);
    if (!res.ok) return;

    const data = await res.json();
    const words = data.words || [];
    const contributors = data.contributors || [];

    if (countBadge) {
      countBadge.textContent = `${data.totalContributors || 0} Member (${words.length} Kalimat)`;
    }

    // 1. Render Live Sentence Chain
    if (words.length === 0) {
      chainContainer.innerHTML = `
        <div class="flex items-center justify-between">
          <div class="text-xs text-gray-400 italic">Belum ada kalimat yang disumbangkan oleh member hari ini. Klik 'Kirim Pengingat Buka Sesi' atau mulai tulis di Discord!</div>
          <span class="text-[10px] bg-gray-500/20 text-gray-400 px-2 py-0.5 rounded font-mono uppercase">Status: Idle</span>
        </div>
      `;
    } else {
      const chainHtml = words.map(w => `
        <span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-discord-blurple/10 border border-discord-blurple/30 text-xs font-semibold text-white">
          <span class="text-gray-400 font-normal font-mono text-[10px]">${escapeHtml(w.username)}:</span>
          <span class="text-emerald-400 font-medium">"${escapeHtml(w.word)}"</span>
        </span>
      `).join(` <i class="fa-solid fa-arrow-right text-gray-600 text-[10px]"></i> `);

      chainContainer.innerHTML = `
        <div class="space-y-3">
          <div class="flex justify-between items-center border-b border-white/10 pb-2">
            <span class="text-[10px] font-bold bg-discord-blurple/20 text-discord-blurple px-2.5 py-0.5 rounded uppercase tracking-wider">LIVE STORY CHAIN • ${escapeHtml(data.todayDate || '')}</span>
            <span class="text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2.5 py-0.5 rounded-full font-bold flex items-center gap-1 shrink-0">
              <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span> LIVE
            </span>
          </div>
          <div class="flex flex-wrap items-center gap-2 max-h-48 overflow-y-auto pr-1">
            ${chainHtml}
          </div>
        </div>
      `;
    }

    // 2. Render Contributors & Attempt Table (2/2)
    if (contributors.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="4" class="px-4 py-6 text-center text-gray-500 italic">Belum ada member yang berpartisipasi menulis kalimat hari ini.</td>
        </tr>
      `;
    } else {
      tbody.innerHTML = contributors.map((c, idx) => {
        const timeStr = c.lastTime ? new Date(c.lastTime).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' WIB' : '-';
        const attemptsBadge = c.count >= 2 
          ? `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 border border-amber-500/30 text-amber-400">2/2 (Selesai)</span>`
          : `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 border border-emerald-500/30 text-emerald-400">1/2 (Sisa 1)</span>`;

        return `
          <tr class="hover:bg-white/2 transition-colors">
            <td class="px-4 py-3 font-mono text-gray-400 text-xs">${idx + 1}</td>
            <td class="px-4 py-3">
              <div class="flex items-center gap-2">
                <div class="w-7 h-7 rounded-full bg-discord-blurple/20 text-discord-blurple flex items-center justify-center font-bold text-xs">
                  ${escapeHtml((c.username || 'U').slice(0, 1).toUpperCase())}
                </div>
                <div>
                  <div class="font-semibold text-white text-xs">${escapeHtml(c.username)}</div>
                  <div class="text-[10px] font-mono text-gray-500">${c.userId}</div>
                </div>
              </div>
            </td>
            <td class="px-4 py-3">
              <div class="flex items-center gap-2">
                ${attemptsBadge}
                <span class="text-xs text-gray-300 font-mono">(${c.words.map(w => `"${escapeHtml(w)}"`).join(', ')})</span>
              </div>
            </td>
            <td class="px-4 py-3 font-mono text-xs text-gray-400">${timeStr}</td>
          </tr>
        `;
      }).join('');
    }

    // 3. Render Latest Story Showcase
    if (showcaseContainer && data.latestStory) {
      const ls = data.latestStory;
      showcaseContainer.innerHTML = `
        <div class="border border-white/10 rounded-2xl p-4 bg-discord-dark/50 space-y-3">
          <div class="flex justify-between items-start">
            <div>
              <span class="text-[10px] font-bold bg-indigo-500/20 text-indigo-400 px-2 py-0.5 rounded uppercase font-mono">CERITA TERAKHIR • ${escapeHtml(ls.dateStr || '')}</span>
              <h4 class="font-outfit font-bold text-white text-base mt-1">${escapeHtml(ls.title)}</h4>
            </div>
            <span class="text-xs font-mono text-gray-400 bg-white/5 px-2.5 py-1 rounded-lg">${ls.contributorCount} Member</span>
          </div>
          
          <p class="text-xs text-gray-300 italic border-l-2 border-discord-blurple pl-3 py-1 bg-white/2 rounded-r-lg">"${escapeHtml(ls.storyText)}"</p>

          ${ls.mvpUsername ? `
            <div class="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center gap-3">
              <div class="w-8 h-8 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold text-sm shrink-0">
                🏆
              </div>
              <div class="text-xs">
                <div class="font-bold text-amber-400">MVP Pilihan Maya AI: ${escapeHtml(ls.mvpUsername)} (+100 RTK)</div>
                <div class="text-gray-400 text-[11px] italic">"${escapeHtml(ls.mvpReason || '')}"</div>
              </div>
            </div>
          ` : ''}

          ${ls.imageUrl ? `
            <div class="rounded-xl overflow-hidden border border-white/10 max-h-60 flex items-center justify-center bg-black/40">
              <img src="${escapeHtml(ls.imageUrl)}" alt="AI Story Illustration" class="w-full h-full object-cover" />
            </div>
          ` : ''}
        </div>
      `;
    }

  } catch (err) {
    console.error("Error loading active story live:", err);
  }
}

async function saveDailyStoryConfig() {
  if (!selectedGuildId) {
    showToast('Pilih Server', 'Silakan pilih server terlebih dahulu.', 'error');
    return;
  }

  const enabled = document.getElementById('story-enabled')?.checked ?? true;
  const channelId = document.getElementById('story-channel')?.value || null;
  const startHour = parseInt(document.getElementById('story-start-hour')?.value || '10', 10);
  const publishHour = parseInt(document.getElementById('story-publish-hour')?.value || '22', 10);
  const wordReward = parseInt(document.getElementById('story-word-reward')?.value || '10', 10);
  const mvpReward = parseInt(document.getElementById('story-mvp-reward')?.value || '100', 10);

  const payload = {
    storyEnabled: enabled,
    storyChannelId: channelId,
    storyStartHour: startHour,
    storyPublishHour: publishHour,
    storyWordReward: wordReward,
    storyMvpReward: mvpReward
  };

  try {
    const response = await apiFetch(`/api/configs/${selectedGuildId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (response.ok) {
      showToast('Berhasil Disimpan', 'Pengaturan Maya Story Chain berhasil diperbarui.', 'success');
      loadActiveStoryLive();
    } else {
      showToast('Gagal Menyimpan', 'Terjadi kesalahan saat menyimpan pengaturan story chain.', 'error');
    }
  } catch (error) {
    showToast('Gagal Menyimpan', 'Terjadi kesalahan koneksi.', 'error');
  }
}

async function startStorySessionBroadcast() {
  if (!selectedGuildId) {
    showToast('Pilih Server', 'Silakan pilih server terlebih dahulu.', 'error');
    return;
  }

  const btn = document.getElementById('btn-start-story');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Mengirim Pengingat...`;
  }

  try {
    const res = await apiFetch(`/api/configs/${selectedGuildId}/start-story-session`, {
      method: 'POST'
    });

    if (res.ok) {
      const data = await res.json();
      showToast('Pengingat Terkirim', data.message || 'Pengumuman pembukaan sesi story chain terkirim!', 'success');
      setTimeout(loadActiveStoryLive, 1000);
    } else {
      const err = await res.json().catch(() => ({}));
      showToast('Gagal Pengingat', err.error || 'Gagal mengirim pengingat sesi story chain.', 'error');
    }
  } catch (err) {
    showToast('Error', err.message || 'Terjadi kesalahan jaringan.', 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<i class="fa-solid fa-bullhorn"></i> Kirim Pengingat Buka Sesi`;
    }
  }
}
