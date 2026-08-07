// Daily Riddle Configuration Component for Web Dashboard

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

  if (enabledCheckbox) {
    enabledCheckbox.checked = config.dailyRiddleEnabled !== false;
  }
  if (rewardInput) {
    rewardInput.value = config.dailyRiddleRewardAmount ?? 10;
  }

  populateDailyRiddleChannels(channels, config.dailyRiddleChannelId);
  populateHourDropdowns(config.dailyRiddlePostHour, config.dailyLeaderboardPostHour);
}

async function saveDailyRiddleConfig() {
  if (!selectedGuildId) return;

  const enabledCheckbox = document.getElementById('daily-riddle-enabled');
  const channelSelect = document.getElementById('daily-riddle-channel');
  const riddlePostSelect = document.getElementById('daily-riddle-post-hour');
  const leaderboardPostSelect = document.getElementById('daily-leaderboard-post-hour');
  const rewardInput = document.getElementById('daily-riddle-reward-amount');

  const payload = {
    dailyRiddleEnabled: enabledCheckbox ? enabledCheckbox.checked : true,
    dailyRiddleChannelId: channelSelect ? channelSelect.value || null : null,
    dailyRiddlePostHour: riddlePostSelect ? parseInt(riddlePostSelect.value, 10) : 9,
    dailyLeaderboardPostHour: leaderboardPostSelect ? parseInt(leaderboardPostSelect.value, 10) : 21,
    dailyRiddleRewardAmount: rewardInput ? parseInt(rewardInput.value || '10', 10) : 10,
  };

  try {
    const response = await apiFetch(`/api/configs/${selectedGuildId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (response.ok) {
      showToast('Berhasil Disimpan', 'Pengaturan Tebak-Tebakan Harian & Jadwal berhasil diperbarui.', 'success');
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
    } else {
      const err = await res.json().catch(() => ({}));
      showToast('Gagal Broadcast', err.error || 'Gagal memicu tebakan harian.', 'error');
    }
  } catch (error) {
    showToast('Error', error.message || 'Terjadi kesalahan koneksi.', 'error');
  }
}
