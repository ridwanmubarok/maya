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

    if (elemTotal) elemTotal.innerText = `${totalCirculating.toLocaleString('id-ID')} 🪙`;
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
      const rankBadge = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`;
      return `
        <tr class="border-b border-white/5 hover:bg-white/2 transition-all">
          <td class="p-4 font-semibold text-xs text-white">${rankBadge}</td>
          <td class="p-4 text-xs text-white font-medium">${escapeHtml(b.username)}</td>
          <td class="p-4 text-xs text-amber-400 font-bold font-mono">${b.score.toLocaleString('id-ID')} 🪙</td>
          <td class="p-4 text-xs text-purple-400 font-mono">${b.dailyScore.toLocaleString('id-ID')} 🪙</td>
        </tr>
      `;
    }).join('');
  } catch (error) {
    showToast('Economy Error', error.message || 'Gagal memuat data dompet.', 'error');
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
