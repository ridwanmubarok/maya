// FRONTEND COMPONENT: ECONOMY & VOICE REWARDS CONFIGURATION

function loadEconomyConfig(config) {
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

      if (daysElem) daysElem.innerText = `${season.dateInfo.daysRemaining} Hari`;
      if (resetElem) resetElem.innerText = `Reset ${season.dateInfo.daysInMonth} ${season.dateInfo.monthName} 23:59 WIB`;
      if (quotaElem) quotaElem.innerText = `${season.config.currentMonthRedeemedUsers.length}/${season.config.monthlyRedeemQuota} Pemenang`;

      renderSeasonCandidates(season.config.goldenCandidateIds, balances);
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

    tableBody.innerHTML = balances.map((b, idx) => {
      const rank = idx + 1;
      const rankBadge = rank === 1 ? '🥇 Peringkat 1' : rank === 2 ? '🥈 Peringkat 2' : rank === 3 ? '🥉 Peringkat 3' : `#${rank}`;
      const safeUsername = escapeHtml(b.username);
      const isGold = goldenIds.includes(b.userId);

      return `
        <tr class="border-b border-white/5 hover:bg-white/2 transition-all">
          <td class="p-4 font-semibold text-xs text-white">${rankBadge}</td>
          <td class="p-4 text-xs text-white font-medium">
            <div class="flex flex-col">
              <div class="flex items-center gap-1.5">
                <span class="font-bold">${safeUsername}</span>
                ${isGold ? '<span class="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30 text-[9px] font-bold">🌟 GOLDEN 50K</span>' : ''}
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

function renderSeasonCandidates(candidateIds, balances = []) {
  const container = document.getElementById('season-candidates-container');
  if (!container) return;

  if (!candidateIds || candidateIds.length === 0) {
    container.innerHTML = `
      <div class="col-span-1 md:col-span-2 p-4 rounded-xl bg-white/2 border border-white/5 text-center text-xs text-gray-400">
        Belum ada Golden Candidates terpilih untuk season ini. Kandidat akan dievaluasi otomatis pada H-5 dari member teraktif, atau klik tombol <strong>Acak Ulang Kandidat</strong> di atas untuk mengundi!
      </div>
    `;
    return;
  }

  container.innerHTML = candidateIds.map((id, index) => {
    const userBalance = balances.find(b => b.userId === id);
    const scoreText = userBalance ? `${userBalance.score.toLocaleString('id-ID')} RTK` : '0 RTK';
    const usernameText = userBalance ? userBalance.username : `User ${id}`;

    return `
      <div class="p-4 rounded-xl bg-gradient-to-br from-amber-500/10 via-amber-500/5 to-transparent border border-amber-500/20 space-y-2 relative overflow-hidden">
        <div class="absolute -right-2 -bottom-2 opacity-10 text-4xl text-amber-400 pointer-events-none">
          <i class="fa-solid fa-crown"></i>
        </div>
        <div class="flex items-center justify-between text-xs text-amber-400 font-bold">
          <span>Golden Candidate #${index + 1}</span>
          <span class="px-2 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/30 text-[10px]">Plafon 50k</span>
        </div>
        <div>
          <div class="text-sm font-bold text-white truncate">${escapeHtml(usernameText)}</div>
          <div class="text-[10px] text-gray-400 font-mono">${id}</div>
        </div>
        <div class="pt-2 border-t border-white/5 flex items-center justify-between text-xs">
          <span class="text-gray-400">Saldo Saat Ini:</span>
          <span class="font-bold text-amber-400 font-mono">${scoreText}</span>
        </div>
      </div>
    `;
  }).join('');
}

async function triggerH5Warning() {
  if (!selectedGuildId) return;
  if (!confirm('Kirim pengumuman & notifikasi peringatan H-5 sekarang ke server Discord dan channel #history? (Notifikasi akan mem-ping @amubhya dan 2 Golden Candidates)')) return;

  try {
    const res = await apiFetch(`/api/economy/${selectedGuildId}/season/trigger-h5`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Gagal mengirim peringatan H-5.');
    showToast('Sukses!', data.message, 'success');
  } catch (err) {
    showToast('Gagal Peringatan H-5', err.message, 'error');
  }
}

async function rerollCandidates() {
  if (!selectedGuildId) return;
  if (!confirm('Acak ulang 2 Golden Candidates untuk season ini dari member yang teraktif?')) return;

  try {
    const res = await apiFetch(`/api/economy/${selectedGuildId}/season/pick-candidates`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Gagal mengundi kandidat.');
    showToast('Kandidat Terpilih!', data.message, 'success');
    loadEconomyBalances();
  } catch (err) {
    showToast('Gagal Acak Kandidat', err.message, 'error');
  }
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
