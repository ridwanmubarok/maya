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
    amountInput.value = config.voiceRewardAmount ?? 5;
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

    const { balances, totalCirculating, totalWallets } = await res.json();

    const elemTotal = document.getElementById('stat-total-circulating');
    const elemWallets = document.getElementById('stat-total-wallets');

    if (elemTotal) elemTotal.innerText = `${totalCirculating.toLocaleString('id-ID')} RTK`;
    if (elemWallets) elemWallets.innerText = totalWallets;

    if (!balances || balances.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="4" class="p-6 text-center text-gray-500 text-xs">Belum ada saldo member yang tercatat di server ini.</td>
        </tr>
      `;
      return;
    }

    tableBody.innerHTML = balances.map((b, idx) => {
      const rank = idx + 1;
      const rankBadge = rank === 1 ? '🥇 Peringkat 1' : rank === 2 ? '🥈 Peringkat 2' : rank === 3 ? '🥉 Peringkat 3' : `#${rank}`;
      const safeUsername = escapeHtml(b.username);
      return `
        <tr class="border-b border-white/5 hover:bg-white/2 transition-all">
          <td class="p-4 font-semibold text-xs text-white">${rankBadge}</td>
          <td class="p-4 text-xs text-white font-medium">
            <div class="flex flex-col">
              <span class="font-bold">${safeUsername}</span>
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
  const amount = parseInt(document.getElementById('voice-reward-amount')?.value || '5', 10);

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
