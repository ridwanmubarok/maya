// FRONTEND COMPONENT: ECONOMY & VOICE REWARDS CONFIGURATION

function populateSeasonChannels(channels, rewardChannelId, historyChannelId) {
  const rewardSelect = document.getElementById('season-reward-channel') || document.getElementById('season-channel');
  if (rewardSelect) {
    rewardSelect.innerHTML = `<option value="">Pilih Channel Reward (Default: #reward / #hadiah / #pengumuman)</option>` +
      (channels || []).map(c => `
        <option value="${c.id}" ${c.id === rewardChannelId ? 'selected' : ''}>#${escapeHtml(c.name)}</option>
      `).join('');
  }

  const historySelect = document.getElementById('season-history-channel');
  if (historySelect) {
    historySelect.innerHTML = `<option value="">Pilih Channel History (Default: #history / #changelog)</option>` +
      (channels || []).map(c => `
        <option value="${c.id}" ${c.id === historyChannelId ? 'selected' : ''}>#${escapeHtml(c.name)}</option>
      `).join('');
  }
}

function loadEconomyConfig(config, channels = []) {
  const enabledCheckbox = document.getElementById('voice-reward-enabled');
  const intervalInput = document.getElementById('voice-reward-interval');
  const amountInput = document.getElementById('voice-reward-amount');

  if (enabledCheckbox) {
    enabledCheckbox.checked = config.voiceRewardEnabled !== false;
  }

  if (intervalInput) {
    intervalInput.value = config.voiceRewardIntervalMin ?? 10;
  }

  if (amountInput) {
    amountInput.value = config.voiceRewardAmount ?? 25;
  }

  // Season Channels (Reward vs History) & Settings
  const rewardId = config.rewardChannelId || config.monthlyResetChannelId;
  const historyId = config.historyChannelId;
  populateSeasonChannels(channels, rewardId, historyId);

  const seasonEnabledCheckbox = document.getElementById('season-reset-enabled');
  if (seasonEnabledCheckbox) {
    seasonEnabledCheckbox.checked = config.monthlyResetEnabled !== false;
  }

  const seasonQuotaInput = document.getElementById('season-redeem-quota');
  if (seasonQuotaInput) {
    seasonQuotaInput.value = config.monthlyRedeemQuota ?? 2;
  }

  loadEconomyBalances();
}

async function loadEconomyBalances() {
  if (!selectedGuildId) return;

  const tableBody = document.getElementById('economy-balances-table-body');
  if (!tableBody) return;

  try {
    const res = await apiFetch(`/api/economy/${selectedGuildId}`);
    if (!res.ok) throw new Error('Gagal memuat saldo dompet server.');

    const { balances, totalCirculating, totalWallets, season } = await res.json();

    const elemTotal = document.getElementById('stat-total-circulating');
    const elemWallets = document.getElementById('stat-total-wallets');

    if (elemTotal) elemTotal.innerText = `${totalCirculating.toLocaleString('id-ID')} RTK`;
    if (elemWallets) elemWallets.innerText = totalWallets;

    // Render Season Details
    if (season && season.dateInfo) {
      const daysElem = document.getElementById('stat-season-days');
      const resetElem = document.getElementById('stat-season-reset-date');
      const quotaElem = document.getElementById('stat-season-quota');

      if (season.dateInfo.isRedeemPeriod) {
        if (daysElem) daysElem.innerText = 'Redeem BUKA';
      } else if (season.dateInfo.day < 3) {
        if (daysElem) daysElem.innerText = 'Buka Tgl 3';
      } else {
        if (daysElem) daysElem.innerText = 'Tutup (Tgl 6+)';
      }
      if (resetElem) resetElem.innerText = `Reset 5 ${season.dateInfo.monthName} 23:59 WIB`;
      if (quotaElem) quotaElem.innerText = `${season.config.currentMonthRedeemedUsers.length}/${season.config.monthlyRedeemQuota} Pemenang`;

      renderCooldownWinners(season.config.cooldownUserIds || [], balances);

      // Sync season settings fields if loaded via economy endpoint
      const rewardId = season.config.rewardChannelId || season.config.monthlyResetChannelId;
      if (rewardId) {
        const rewardSelect = document.getElementById('season-reward-channel') || document.getElementById('season-channel');
        if (rewardSelect && (!rewardSelect.value || rewardSelect.value !== rewardId)) {
          rewardSelect.value = rewardId;
        }
      }
      if (season.config.historyChannelId) {
        const historySelect = document.getElementById('season-history-channel');
        if (historySelect && (!historySelect.value || historySelect.value !== season.config.historyChannelId)) {
          historySelect.value = season.config.historyChannelId;
        }
      }
      if (typeof season.config.monthlyResetEnabled === 'boolean') {
        const enabledElem = document.getElementById('season-reset-enabled');
        if (enabledElem) enabledElem.checked = season.config.monthlyResetEnabled;
      }
      if (season.config.monthlyRedeemQuota) {
        const quotaInput = document.getElementById('season-redeem-quota');
        if (quotaInput) quotaInput.value = season.config.monthlyRedeemQuota;
      }
    }

    if (!balances || balances.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="5" class="p-6 text-center text-gray-500 text-xs">Belum ada saldo member yang tercatat di server ini.</td>
        </tr>
      `;
      return;
    }

    const goldenIds = season?.config?.goldenCandidateIds || [];
    const cooldownIds = season?.config?.cooldownUserIds || [];
    const redeemedIds = season?.config?.currentMonthRedeemedUsers || [];
    const top1Id = goldenIds[0];
    const top2Id = goldenIds[1];

    tableBody.innerHTML = balances.map((b, idx) => {
      const rank = idx + 1;
      const rankBadge = rank === 1 ? '🥇 Peringkat 1' : rank === 2 ? '🥈 Peringkat 2' : rank === 3 ? '🥉 Peringkat 3' : `#${rank}`;
      const safeUsername = escapeHtml(b.username);
      const isTop1 = b.userId === top1Id;
      const isTop2 = b.userId === top2Id;
      const isCooldown = cooldownIds.includes(b.userId);
      const isRedeemed = redeemedIds.includes(b.userId);

      let statusBadge = '';
      if (isRedeemed) {
        statusBadge = '<span class="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[9px] font-bold">✅ TELAH REDEEM</span>';
      } else if (isCooldown) {
        statusBadge = '<span class="px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30 text-[9px] font-bold" title="Pemenang bulan lalu, istirahat 1 bulan">⏳ COOLDOWN (1 BLN)</span>';
      } else if (isTop1) {
        statusBadge = '<span class="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30 text-[9px] font-bold shadow-sm shadow-amber-500/10">🌟 TOP #1 (Plafon 50k)</span>';
      } else if (isTop2) {
        statusBadge = '<span class="px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400 border border-purple-500/30 text-[9px] font-bold shadow-sm shadow-purple-500/10">🥈 TOP #2 (Plafon 50k)</span>';
      }

      return `
        <tr class="border-b border-white/5 hover:bg-white/2 transition-all">
          <td class="p-4 font-semibold text-xs text-white">${rankBadge}</td>
          <td class="p-4 text-xs text-white font-medium">
            <div class="flex flex-col">
              <div class="flex items-center gap-1.5">
                <span class="font-bold">${safeUsername}</span>
                ${statusBadge}
              </div>
              <span class="text-[10px] text-gray-500 font-mono">${b.userId}</span>
            </div>
          </td>
          <td class="p-4 text-xs text-amber-400 font-bold font-mono">${b.score.toLocaleString('id-ID')} RTK</td>
          <td class="p-4 text-xs text-purple-400 font-mono">${b.dailyScore.toLocaleString('id-ID')} RTK</td>
          <td class="p-4 text-center">
            <div class="flex items-center justify-center gap-1.5">
              <button onclick="prefillPointAdjustment('${b.userId}', '${safeUsername.replace(/'/g, "\\'")}', 'add')" title="Tambah / Hadiahi Koin" class="px-2.5 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 text-[11px] font-semibold transition-all">
                <i class="fa-solid fa-plus mr-1"></i> Beri
              </button>
              <button onclick="prefillPointAdjustment('${b.userId}', '${safeUsername.replace(/'/g, "\\'")}', 'set')" title="Set / Edit Saldo" class="px-2.5 py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/20 text-[11px] font-semibold transition-all">
                <i class="fa-solid fa-pen-to-square mr-1"></i> Edit
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  } catch (error) {
    showToast('Economy Error', error.message || 'Gagal memuat data dompet.', 'error');
  }
}

function renderCooldownWinners(cooldownIds, balances = []) {
  const container = document.getElementById('season-cooldown-container');
  if (!container) return;

  if (!cooldownIds || cooldownIds.length === 0) {
    container.innerHTML = `
      <div class="col-span-full p-3 rounded-xl bg-white/2 border border-white/5 text-center text-xs text-gray-500">
        Tidak ada member dalam masa cooldown saat ini. Seluruh member bebas berkompetisi!
      </div>
    `;
    return;
  }

  container.innerHTML = cooldownIds.map(userId => {
    const userBalance = balances.find(b => b.userId === userId);
    const username = userBalance ? userBalance.username : `User ${userId}`;
    const scoreVal = userBalance ? userBalance.score : 0;
    return `
      <div class="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-between">
        <div class="flex items-center gap-2.5">
          <div class="w-8 h-8 rounded-lg bg-blue-500/20 text-blue-400 flex items-center justify-center font-bold text-xs">
            <i class="fa-solid fa-hourglass-half"></i>
          </div>
          <div>
            <div class="text-xs font-bold text-white truncate max-w-[120px] sm:max-w-[180px]">${escapeHtml(username)}</div>
            <div class="text-[10px] text-gray-400 font-mono">${userId}</div>
          </div>
        </div>
        <div class="text-right">
          <span class="px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30 text-[10px] font-bold">Istirahat 1 Bulan</span>
          <div class="text-[10px] text-amber-400 font-mono font-bold mt-0.5">${scoreVal.toLocaleString('id-ID')} RTK</div>
        </div>
      </div>
    `;
  }).join('');
}

async function triggerDay1Announcement() {
  if (!selectedGuildId) return;
  if (!confirm('Kirim pengumuman kickoff season baru (Day 1) sekarang ke server Discord dan channel #history? (Hening tanpa mention kandidat, laporan privat via DM ke @amubhya)')) return;

  try {
    const res = await apiFetch(`/api/economy/${selectedGuildId}/season/trigger-day1`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Gagal mengirim pengumuman Day 1.');
    showToast('Sukses!', data.message, 'success');
    loadEconomyBalances();
  } catch (err) {
    showToast('Gagal Notif Tgl 1', err.message, 'error');
  }
}

async function triggerDay3RedeemOpen() {
  if (!selectedGuildId) return;
  if (!confirm('Kirim notifikasi pembukaan resmi redeem /shop (Day 3) sekarang ke server Discord dan channel #history? (Hening tanpa mention kandidat, laporan privat via DM ke @amubhya)')) return;

  try {
    const res = await apiFetch(`/api/economy/${selectedGuildId}/season/trigger-day3`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Gagal mengirim notifikasi Day 3.');
    showToast('Sukses!', data.message, 'success');
    loadEconomyBalances();
  } catch (err) {
    showToast('Gagal Buka Redeem Tgl 3', err.message, 'error');
  }
}

async function triggerDay5Closing() {
  if (!selectedGuildId) return;
  if (!confirm('Kirim peringatan hari terakhir penukaran (Day 5) sekarang ke server Discord dan channel #history? (Hening tanpa mention kandidat, laporan privat via DM ke @amubhya)')) return;

  try {
    const res = await apiFetch(`/api/economy/${selectedGuildId}/season/trigger-day5`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Gagal mengirim notifikasi Day 5.');
    showToast('Sukses!', data.message, 'success');
  } catch (err) {
    showToast('Gagal Notif Tgl 5', err.message, 'error');
  }
}

async function triggerH5Warning() {
  return triggerDay3RedeemOpen();
}

async function confirmResetSeason() {
  if (!selectedGuildId) return;
  const promptAns = prompt('PERINGATAN: Aksi ini akan mengarsipkan Top 10 Hall of Fame ke database, mencatat ke channel #history, MERESET SELURUH POIN RTK KE 0, dan mengaktifkan masa cooldown untuk peraih redeem bulan ini!\n\nKetik "RESET" untuk mengonfirmasi:');
  if (promptAns !== 'RESET') {
    showToast('Dibatalkan', 'Reset season dibatalkan.', 'info');
    return;
  }

  try {
    const res = await apiFetch(`/api/economy/${selectedGuildId}/season/reset`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Gagal mereset season.');
    showToast('Season Direset!', data.message, 'success');
    loadEconomyBalances();
  } catch (err) {
    showToast('Gagal Reset Season', err.message, 'error');
  }
}

function prefillPointAdjustment(userId, username, action = 'add') {
  const userIdInput = document.getElementById('adjust-user-id');
  const usernameInput = document.getElementById('adjust-username');
  const actionSelect = document.getElementById('adjust-action');

  if (userIdInput) userIdInput.value = userId;
  if (usernameInput) usernameInput.value = username;
  if (actionSelect) actionSelect.value = action;

  // Scroll to form smoothly
  const formCard = document.getElementById('adjust-user-id');
  if (formCard) {
    formCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
    formCard.focus();
  }
}

async function submitPointAdjustment() {
  if (!selectedGuildId) {
    showToast('Pilih Server', 'Silakan pilih server terlebih dahulu.', 'error');
    return;
  }

  const userId = document.getElementById('adjust-user-id')?.value.trim();
  const username = document.getElementById('adjust-username')?.value.trim();
  const action = document.getElementById('adjust-action')?.value || 'add';
  const amount = parseInt(document.getElementById('adjust-amount')?.value || '0', 10);
  const reason = document.getElementById('adjust-reason')?.value.trim();

  if (!userId) {
    showToast('Validasi Gagal', 'Harap isi Discord User ID member target.', 'error');
    return;
  }

  if (isNaN(amount) || amount < 0) {
    showToast('Validasi Gagal', 'Jumlah amount koin harus berupa angka positif.', 'error');
    return;
  }

  try {
    const res = await apiFetch(`/api/economy/${selectedGuildId}/adjust`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        username,
        action,
        amount,
        reason
      })
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Gagal menyesuaikan saldo member.');
    }

    showToast('Sukses!', data.message || 'Saldo member berhasil diperbarui!', 'success');

    // Reset form amount/reason and refresh list
    document.getElementById('adjust-amount').value = '50';
    document.getElementById('adjust-reason').value = '';
    loadEconomyBalances();
  } catch (error) {
    showToast('Gagal Menyesuaikan Saldo', error.message, 'error');
  }
}

async function saveEconomyConfig() {
  if (!selectedGuildId) {
    showToast('Pilih Server', 'Silakan pilih server terlebih dahulu.', 'error');
    return;
  }

  const enabled = document.getElementById('voice-reward-enabled')?.checked ?? true;
  const interval = parseInt(document.getElementById('voice-reward-interval')?.value || '10', 10);
  const amount = parseInt(document.getElementById('voice-reward-amount')?.value || '25', 10);

  try {
    const res = await apiFetch(`/api/configs/${selectedGuildId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        voiceRewardEnabled: enabled,
        voiceRewardIntervalMin: interval,
        voiceRewardAmount: amount
      })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Gagal menyimpan pengaturan ekonomi.');
    }

    showToast('Berhasil Disimpan', 'Pengaturan Voice Rewards & Ekonomi berhasil diperbarui! 🪙', 'success');
  } catch (error) {
    showToast('Gagal Menyimpan', error.message, 'error');
  }
}

async function saveSeasonSettings() {
  if (!selectedGuildId) {
    showToast('Pilih Server', 'Silakan pilih server terlebih dahulu.', 'error');
    return;
  }

  const rewardChannelId = document.getElementById('season-reward-channel')?.value || document.getElementById('season-channel')?.value || null;
  const historyChannelId = document.getElementById('season-history-channel')?.value || null;
  const enabled = document.getElementById('season-reset-enabled')?.checked ?? true;
  const quota = parseInt(document.getElementById('season-redeem-quota')?.value || '2', 10);

  try {
    const res = await apiFetch(`/api/configs/${selectedGuildId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rewardChannelId,
        historyChannelId,
        monthlyResetChannelId: rewardChannelId,
        monthlyResetEnabled: enabled,
        monthlyRedeemQuota: quota
      })
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || 'Gagal menyimpan pengaturan season.');
    }

    showToast('Pengaturan Disimpan', 'Channel Reward & History Season RTK berhasil diperbarui! 📢', 'success');
  } catch (error) {
    showToast('Gagal Menyimpan', error.message, 'error');
  }
}

