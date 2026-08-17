// Maya Poll Configuration & Live Backoffice Component

let livePollInterval = null;

function populateDailyPollChannels(channels, selectedChannelId) {
  const select = document.getElementById('daily-poll-channel');
  if (!select) return;

  select.innerHTML = `<option value="">Pilih Channel (Default: #general / Channel Utama)</option>` +
    channels.map(c => `
      <option value="${c.id}" ${c.id === selectedChannelId ? 'selected' : ''}>#${escapeHtml(c.name)}</option>
    `).join('');
}

function populatePollHourDropdown(selectedHour) {
  const select = document.getElementById('daily-poll-post-hour');
  if (!select) return;

  const hours = Array.from({ length: 24 }, (_, i) => {
    const formatted = String(i).padStart(2, '0') + ':00 WIB';
    return { value: i, label: formatted };
  });

  select.innerHTML = hours.map(h => `
    <option value="${h.value}" ${h.value === (selectedHour ?? 10) ? 'selected' : ''}>${h.label}</option>
  `).join('');
}

function loadDailyPollConfig(config, channels) {
  const enabledCheckbox = document.getElementById('daily-poll-enabled');
  const rewardInput = document.getElementById('daily-poll-reward-amount');

  if (enabledCheckbox) {
    enabledCheckbox.checked = config.dailyPollEnabled !== false;
  }
  if (rewardInput) {
    rewardInput.value = config.dailyPollRewardAmount ?? 5;
  }

  populateDailyPollChannels(channels, config.dailyPollChannelId);
  populatePollHourDropdown(config.dailyPollPostHour);

  // Load Live Backoffice Data
  loadActivePollLive();
  if (livePollInterval) clearInterval(livePollInterval);
  livePollInterval = setInterval(loadActivePollLive, 10000);
}

async function loadActivePollLive() {
  if (!selectedGuildId) return;

  const cardContainer = document.getElementById('live-poll-card');
  const tbody = document.getElementById('live-poll-tbody');
  const countBadge = document.getElementById('live-poll-count');

  if (!cardContainer || !tbody) return;

  try {
    const res = await apiFetch(`/api/configs/${selectedGuildId}/active-poll`);
    if (!res.ok) return;

    const data = await res.json();
    if (!data.active || !data.topic) {
      cardContainer.innerHTML = `
        <div class="flex items-center justify-between">
          <div class="text-xs text-gray-400 italic">Belum ada Maya Poll yang diposting saat ini. Klik 'Tes Broadcast' untuk membuat poll lucu baru.</div>
          <span class="text-[10px] bg-gray-500/20 text-gray-400 px-2 py-0.5 rounded font-mono uppercase">Status: Idle</span>
        </div>
      `;
      tbody.innerHTML = `
        <tr>
          <td colspan="4" class="px-4 py-6 text-center text-gray-500 italic">Belum ada member yang memberikan vote.</td>
        </tr>
      `;
      if (countBadge) countBadge.textContent = '0 Member Vote';
      return;
    }

    const totalVotes = data.totalVotes || 0;
    const counts = data.counts || { A: 0, B: 0, C: 0, D: 0 };

    let optionsProgressHtml = '';
    const options = [
      { key: 'A', text: data.optionA },
      { key: 'B', text: data.optionB },
    ];
    if (data.optionC) options.push({ key: 'C', text: data.optionC });
    if (data.optionD) options.push({ key: 'D', text: data.optionD });

    for (const opt of options) {
      const c = counts[opt.key] || 0;
      const pct = totalVotes > 0 ? Math.round((c / totalVotes) * 100) : 0;
      optionsProgressHtml += `
        <div class="space-y-1">
          <div class="flex justify-between text-xs text-gray-300">
            <span><strong>${opt.key}.</strong> ${escapeHtml(opt.text)}</span>
            <span class="font-mono text-emerald-400 font-bold">${pct}% (${c} vote)</span>
          </div>
          <div class="w-full bg-white/5 rounded-full h-2 overflow-hidden border border-white/5">
            <div class="bg-gradient-to-r from-discord-blurple to-indigo-500 h-full rounded-full transition-all duration-500" style="width: ${pct}%"></div>
          </div>
        </div>
      `;
    }

    cardContainer.innerHTML = `
      <div class="flex flex-wrap justify-between items-start gap-2 border-b border-white/10 pb-3">
        <div>
          <span class="text-[10px] font-bold bg-discord-blurple/20 text-discord-blurple px-2.5 py-0.5 rounded uppercase tracking-wider">MAYA POLL • ${escapeHtml(data.dateStr || '')}</span>
          <h4 class="font-outfit font-bold text-white text-base mt-1">${escapeHtml(data.topic)}</h4>
          <p class="text-xs text-gray-400 italic">${escapeHtml(data.description || '')}</p>
        </div>
        <span class="text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2.5 py-1 rounded-full font-bold flex items-center gap-1.5 shrink-0">
          <span class="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span> LIVE POLL
        </span>
      </div>

      <div class="space-y-3 pt-1">
        <h5 class="text-xs font-semibold text-gray-400 uppercase tracking-widest">Distribusi Vote Member</h5>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          ${optionsProgressHtml}
        </div>
      </div>
    `;

    const votes = data.votes || [];
    if (countBadge) countBadge.textContent = `${votes.length} Member Vote`;

    if (votes.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="4" class="px-4 py-6 text-center text-gray-500 italic">Belum ada partisipasi vote member pada poll ini.</td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = votes.map((v, idx) => {
      const voteDate = v.createdAt ? new Date(v.createdAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' WIB' : '-';
      return `
        <tr class="hover:bg-white/2 transition-colors">
          <td class="px-4 py-3 font-mono text-gray-400 text-xs">${idx + 1}</td>
          <td class="px-4 py-3">
            <div class="flex items-center gap-2">
              <div class="w-7 h-7 rounded-full bg-discord-blurple/20 text-discord-blurple flex items-center justify-center font-bold text-xs">
                ${escapeHtml((v.username || 'U').slice(0, 1).toUpperCase())}
              </div>
              <div>
                <div class="font-semibold text-white text-xs">${escapeHtml(v.username)}</div>
                <div class="text-[10px] font-mono text-gray-500">${v.userId}</div>
              </div>
            </div>
          </td>
          <td class="px-4 py-3">
            <span class="px-2.5 py-1 rounded-lg text-xs font-semibold bg-white/5 border border-white/10 text-emerald-400 inline-flex items-center gap-1.5">
              <span class="font-bold text-white bg-discord-blurple/30 px-1.5 py-0.5 rounded">${v.optionChosen}</span>
              <span>${escapeHtml(v.optionText)}</span>
            </span>
          </td>
          <td class="px-4 py-3 font-mono text-xs text-gray-400">${voteDate}</td>
        </tr>
      `;
    }).join('');

  } catch (err) {
    console.error("Error loading active poll live:", err);
  }
}

async function saveDailyPollConfig() {
  if (!selectedGuildId) {
    showToast('Pilih Server', 'Silakan pilih server terlebih dahulu.', 'error');
    return;
  }

  const enabled = document.getElementById('daily-poll-enabled')?.checked ?? true;
  const channelId = document.getElementById('daily-poll-channel')?.value || null;
  const postHour = parseInt(document.getElementById('daily-poll-post-hour')?.value || '10', 10);
  const rewardAmount = parseInt(document.getElementById('daily-poll-reward-amount')?.value || '5', 10);

  const payload = {
    dailyPollEnabled: enabled,
    dailyPollChannelId: channelId,
    dailyPollPostHour: postHour,
    dailyPollRewardAmount: rewardAmount
  };

  try {
    const response = await apiFetch(`/api/configs/${selectedGuildId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (response.ok) {
      showToast('Berhasil Disimpan', 'Pengaturan Maya Poll & Reward RTK Point berhasil diperbarui.', 'success');
      loadActivePollLive();
    } else {
      showToast('Gagal Menyimpan', 'Terjadi kesalahan saat menyimpan pengaturan poll.', 'error');
    }
  } catch (error) {
    showToast('Gagal Menyimpan', 'Terjadi kesalahan koneksi.', 'error');
  }
}

async function testDailyPollBroadcast() {
  if (!selectedGuildId) {
    showToast('Pilih Server', 'Silakan pilih server terlebih dahulu.', 'error');
    return;
  }

  const btn = document.getElementById('btn-test-daily-poll');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Memunculkan Maya Poll...`;
  }

  try {
    const res = await apiFetch(`/api/configs/${selectedGuildId}/test-daily-poll`, {
      method: 'POST'
    });

    if (res.ok) {
      const data = await res.json();
      showToast('Broadcast Poll Dikirim', data.message || 'Maya Poll berhasil dikirim ke channel!', 'success');
      setTimeout(loadActivePollLive, 1000);
    } else {
      const err = await res.json().catch(() => ({}));
      showToast('Gagal Broadcast Poll', err.error || 'Gagal memicu Maya poll.', 'error');
    }
  } catch (err) {
    showToast('Error', err.message || 'Terjadi kesalahan jaringan saat memicu broadcast poll.', 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<i class="fa-solid fa-paper-plane"></i> Tes Broadcast Maya Poll`;
    }
  }
}
