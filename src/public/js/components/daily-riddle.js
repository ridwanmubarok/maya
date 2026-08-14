// Daily Riddle Configuration & Live Backoffice Component for Web Dashboard

let liveRiddleInterval = null;

function populateDailyRiddleChannels(channels, selectedChannelId) {
  const select = document.getElementById('daily-riddle-channel');
  if (!select) return;

  select.innerHTML = `<option value="">Pilih Channel (Default: Channel Utama / System)</option>` +
    channels.map(c => `
      <option value="${c.id}" ${c.id === selectedChannelId ? 'selected' : ''}>#${escapeHtml(c.name)}</option>
    `).join('');
}

function populateHourDropdowns(riddlePostHour, leaderboardPostHour) {
  const riddleSelect = document.getElementById('daily-riddle-post-hour');
  const leaderboardSelect = document.getElementById('daily-leaderboard-post-hour');

  const hours = Array.from({ length: 24 }, (_, i) => {
    const formatted = String(i).padStart(2, '0') + ':00 WIB';
    return { value: i, label: formatted };
  });

  if (riddleSelect) {
    riddleSelect.innerHTML = hours.map(h => `
      <option value="${h.value}" ${h.value === (riddlePostHour ?? 9) ? 'selected' : ''}>${h.label}</option>
    `).join('');
  }

  if (leaderboardSelect) {
    leaderboardSelect.innerHTML = hours.map(h => `
      <option value="${h.value}" ${h.value === (leaderboardPostHour ?? 21) ? 'selected' : ''}>${h.label}</option>
    `).join('');
  }
}

function loadDailyRiddleConfig(config, channels) {
  const enabledCheckbox = document.getElementById('daily-riddle-enabled');
  const rewardInput = document.getElementById('daily-riddle-reward-amount');
  const closeRewardInput = document.getElementById('daily-riddle-close-reward-amount');

  if (enabledCheckbox) {
    enabledCheckbox.checked = config.dailyRiddleEnabled !== false;
  }
  if (rewardInput) {
    rewardInput.value = config.dailyRiddleRewardAmount ?? 10;
  }
  if (closeRewardInput) {
    closeRewardInput.value = config.dailyRiddleCloseRewardAmount ?? 5;
  }

  populateDailyRiddleChannels(channels, config.dailyRiddleChannelId);
  populateHourDropdowns(config.dailyRiddlePostHour, config.dailyLeaderboardPostHour);

  // Load Live Backoffice Data
  loadActiveRiddleLive();
  if (liveRiddleInterval) clearInterval(liveRiddleInterval);
  liveRiddleInterval = setInterval(loadActiveRiddleLive, 10000);
}

async function loadActiveRiddleLive() {
  if (!selectedGuildId) return;

  const cardContainer = document.getElementById('live-riddle-card');
  const tbody = document.getElementById('live-riddle-tbody');
  const countBadge = document.getElementById('live-riddle-count');

  if (!cardContainer || !tbody) return;

  try {
    const res = await apiFetch(`/api/configs/${selectedGuildId}/active-riddle`);
    if (!res.ok) return;

    const data = await res.json();
    if (!data.active || !data.question) {
      cardContainer.innerHTML = `
        <div class="flex items-center justify-between">
          <div class="text-xs text-gray-400 italic">Belum ada tebak-tebakan harian yang sedang aktif saat ini. Klik tombol Tes Broadcast untuk memulai sesi.</div>
          <span class="text-[10px] bg-gray-500/20 text-gray-400 px-2 py-0.5 rounded font-mono uppercase">Status: Idle</span>
        </div>
      `;
      tbody.innerHTML = `
        <tr>
          <td colspan="5" class="px-4 py-6 text-center text-gray-500 italic">Belum ada peserta/jawaban pada tebakan harian ini.</td>
        </tr>
      `;
      if (countBadge) countBadge.textContent = '0 Jawaban';
      return;
    }

    const q = data.question;
    cardContainer.innerHTML = `
      <div class="flex flex-wrap justify-between items-start gap-2 border-b border-white/10 pb-2">
        <div>
          <span class="text-[10px] font-bold bg-discord-blurple/20 text-discord-blurple px-2 py-0.5 rounded uppercase tracking-wider">${escapeHtml(q.category || 'Tebak-Tebakan')}</span>
          <h5 class="font-semibold text-white text-sm mt-1">${escapeHtml(q.question)}</h5>
        </div>
        <span class="text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
          <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span> LIVE BROADCAST
        </span>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs text-gray-300 pt-1">
        <div><span class="text-gray-500">Jawaban Kunci:</span> <strong class="text-emerald-400 font-mono">${escapeHtml(q.answer)}</strong></div>
        <div><span class="text-gray-500">Petunjuk (Clue):</span> <span class="text-gray-300 italic">${escapeHtml(q.clue || '-')}</span></div>
        <div><span class="text-gray-500">Total Peserta:</span> <strong class="text-white">${data.answeredUserCount || 0} Member</strong></div>
      </div>
    `;

    const logs = data.logs || [];
    if (countBadge) countBadge.textContent = `${logs.length} Jawaban`;

    if (logs.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="5" class="px-4 py-6 text-center text-gray-500 italic">Belum ada member yang mencoba menjawab tebakan ini.</td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = logs.map(log => {
      let statusBadge = '';
      if (log.evalStatus === 'BENAR') {
        statusBadge = `<span class="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded text-[10px] font-bold">🟢 BENAR (Exact)</span>`;
      } else if (log.evalStatus === 'MENDEKATI') {
        statusBadge = `<span class="bg-amber-500/20 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded text-[10px] font-bold">🟡 MENDEKATI (Close)</span>`;
      } else {
        statusBadge = `<span class="bg-red-500/20 text-red-400 border border-red-500/30 px-2 py-0.5 rounded text-[10px] font-bold">🔴 SALAH</span>`;
      }

      const formattedTime = new Date(log.timestamp).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

      return `
        <tr class="hover:bg-white/5 transition-all">
          <td class="px-4 py-3">
            <div class="flex items-center gap-2">
              <img src="${log.avatarUrl || 'https://cdn.discordapp.com/embed/avatars/0.png'}" class="w-6 h-6 rounded-full object-cover border border-white/10" alt="Avatar">
              <div class="flex flex-col">
                <span class="font-semibold text-white leading-tight">${escapeHtml(log.username)}</span>
                <span class="text-[9px] text-gray-500 font-mono">${log.userId}</span>
              </div>
            </div>
          </td>
          <td class="px-4 py-3 font-mono text-white">${escapeHtml(log.userAnswer)}</td>
          <td class="px-4 py-3">
            <div class="flex flex-col gap-0.5">
              ${statusBadge}
              ${log.aiReason ? `<span class="text-[10px] text-gray-400 italic">${escapeHtml(log.aiReason)}</span>` : ''}
            </div>
          </td>
          <td class="px-4 py-3 font-semibold text-gray-300">Attempt ${log.attemptNumber}/3</td>
          <td class="px-4 py-3 text-gray-400 text-[11px]">${formattedTime} WIB</td>
        </tr>
      `;
    }).join('');
  } catch (error) {
    console.error('Error loading live active riddle backoffice:', error);
  }
}

async function saveDailyRiddleConfig() {
  if (!selectedGuildId) return;

  const enabledCheckbox = document.getElementById('daily-riddle-enabled');
  const channelSelect = document.getElementById('daily-riddle-channel');
  const riddlePostSelect = document.getElementById('daily-riddle-post-hour');
  const leaderboardPostSelect = document.getElementById('daily-leaderboard-post-hour');
  const rewardInput = document.getElementById('daily-riddle-reward-amount');
  const closeRewardInput = document.getElementById('daily-riddle-close-reward-amount');

  const payload = {
    dailyRiddleEnabled: enabledCheckbox ? enabledCheckbox.checked : true,
    dailyRiddleChannelId: channelSelect ? channelSelect.value || null : null,
    dailyRiddlePostHour: riddlePostSelect ? parseInt(riddlePostSelect.value, 10) : 9,
    dailyLeaderboardPostHour: leaderboardPostSelect ? parseInt(leaderboardPostSelect.value, 10) : 21,
    dailyRiddleRewardAmount: rewardInput ? parseInt(rewardInput.value || '10', 10) : 10,
    dailyRiddleCloseRewardAmount: closeRewardInput ? parseInt(closeRewardInput.value || '5', 10) : 5,
  };

  try {
    const response = await apiFetch(`/api/configs/${selectedGuildId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (response.ok) {
      showToast('Berhasil Disimpan', 'Pengaturan Tebak-Tebakan Harian, Poin Hadiah & Jadwal berhasil diperbarui.', 'success');
      loadActiveRiddleLive();
    } else {
      showToast('Gagal Menyimpan', 'Terjadi kesalahan saat menyimpan pengaturan.', 'error');
    }
  } catch (error) {
    showToast('Gagal Menyimpan', 'Terjadi kesalahan koneksi.', 'error');
  }
}

async function testDailyRiddleBroadcast() {
  if (!selectedGuildId) {
    showToast('Pilih Server', 'Silakan pilih server terlebih dahulu.', 'error');
    return;
  }

  try {
    const res = await apiFetch(`/api/configs/${selectedGuildId}/test-daily-riddle`, {
      method: 'POST'
    });

    if (res.ok) {
      const data = await res.json();
      showToast('Broadcast Dikirim', data.message || 'Tebak-Tebakan Harian berhasil dikirim ke channel!', 'success');
      setTimeout(loadActiveRiddleLive, 1000);
    } else {
      const err = await res.json().catch(() => ({}));
      showToast('Gagal Broadcast', err.error || 'Gagal memicu tebakan harian.', 'error');
    }
  } catch (error) {
    showToast('Error', error.message || 'Terjadi kesalahan koneksi.', 'error');
  }
}
