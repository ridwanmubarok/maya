// FRONTEND COMPONENT: LEVELING & XP SYSTEM

function loadLevelingConfig(config) {
  const enabledCheckbox = document.getElementById('leveling-enabled');
  if (enabledCheckbox) {
    enabledCheckbox.checked = config?.levelingEnabled !== false;
  }
}

async function loadLevelingData() {
  if (!selectedGuildId) return;

  const tableBody = document.getElementById('leveling-leaderboard-table-body');
  const statMembers = document.getElementById('stat-leveling-members');
  const statHighestLevel = document.getElementById('stat-leveling-highest');

  try {
    const res = await apiFetch(`/api/leveling/${selectedGuildId}`);
    if (!res.ok) throw new Error('Gagal memuat data leveling server.');

    const data = await res.json();
    const config = data.config || {};
    const leaderboard = data.leaderboard || [];

    loadLevelingConfig(config);

    if (statMembers) {
      statMembers.innerText = (data.totalMembers || 0).toLocaleString('id-ID');
    }
    if (statHighestLevel) {
      const highest = leaderboard.length > 0 ? leaderboard[0].level : 0;
      statHighestLevel.innerText = `Lv. ${highest}`;
    }

    if (!tableBody) return;

    if (leaderboard.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="5" class="p-6 text-center text-gray-500 italic">
            Belum ada data keaktifan member untuk Level & XP di server ini.
          </td>
        </tr>
      `;
      return;
    }

    const medalIcons = ['🥇', '🥈', '🥉'];
    tableBody.innerHTML = leaderboard.map(item => {
      const rankBadge = item.rank <= 3 
        ? `<span class="text-xl">${medalIcons[item.rank - 1]}</span>`
        : `<span class="px-2.5 py-1 rounded-lg bg-white/5 text-gray-400 font-mono text-xs font-bold">#${item.rank}</span>`;

      const voiceMinutes = Math.floor(item.voiceSeconds / 60);
      const voiceDisplay = voiceMinutes >= 60 ? `${(voiceMinutes / 60).toFixed(1)} Jam` : `${voiceMinutes} Mnt`;

      return `
        <tr class="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
          <td class="p-4 text-center font-bold">${rankBadge}</td>
          <td class="p-4">
            <div class="flex items-center gap-3">
              <div class="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center font-bold text-xs text-white uppercase shadow-md">
                ${(item.username || '?').substring(0, 2)}
              </div>
              <div>
                <p class="font-bold text-white text-sm">${escapeHtml(item.username)}</p>
                <p class="text-xs text-gray-400 font-mono">${item.userId}</p>
              </div>
            </div>
          </td>
          <td class="p-4">
            <span class="px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 text-xs font-bold font-mono">
              ⭐ Level ${item.level}
            </span>
          </td>
          <td class="p-4 min-w-[200px]">
            <div class="flex justify-between items-center text-xs mb-1 font-mono">
              <span class="text-gray-300 font-semibold">${item.xp.toLocaleString('id-ID')} / ${item.neededXp.toLocaleString('id-ID')} XP</span>
              <span class="text-indigo-400 font-bold">${item.percentage}%</span>
            </div>
            <div class="w-full bg-white/5 h-2 rounded-full overflow-hidden border border-white/5">
              <div class="bg-gradient-to-r from-indigo-500 to-purple-500 h-full rounded-full transition-all duration-500" style="width: ${item.percentage}%"></div>
            </div>
          </td>
          <td class="p-4">
            <div class="flex flex-wrap gap-1 text-[11px] text-gray-400">
              <span title="Pesan Chat" class="px-2 py-0.5 rounded bg-white/5">💬 ${item.messagesCount}</span>
              <span title="Durasi Voice" class="px-2 py-0.5 rounded bg-white/5">🎙️ ${voiceDisplay}</span>
              <span title="Menang Trivia" class="px-2 py-0.5 rounded bg-white/5">💡 ${item.triviaWins}</span>
              <span title="Pantun" class="px-2 py-0.5 rounded bg-white/5">🎭 ${item.pantunCount}</span>
              <span title="Story Chain" class="px-2 py-0.5 rounded bg-white/5">📖 ${item.storyCount}</span>
              <span title="Daily Poll" class="px-2 py-0.5 rounded bg-white/5">📊 ${item.pollCount}</span>
            </div>
          </td>
        </tr>
      `;
    }).join('');

  } catch (err) {
    console.error("Error loading leveling data:", err);
    if (typeof showToast === 'function') {
      showToast('Gagal Memuat Leveling', err.message || 'Terjadi kesalahan sistem.', 'error');
    }
  }
}

async function saveLevelingConfig() {
  if (!selectedGuildId) return;

  const enabledCheckbox = document.getElementById('leveling-enabled');
  const payload = {
    levelingEnabled: enabledCheckbox ? enabledCheckbox.checked : true,
  };

  try {
    const res = await apiFetch(`/api/leveling/${selectedGuildId}/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Gagal menyimpan status leveling.');
    }

    if (guildConfig) {
      guildConfig.levelingEnabled = payload.levelingEnabled;
    }

    if (typeof showToast === 'function') {
      showToast('Berhasil Disimpan', 'Status sistem Leveling & XP berhasil diperbarui!', 'success');
    }
  } catch (err) {
    console.error("Error saving leveling config:", err);
    if (typeof showToast === 'function') {
      showToast('Gagal Menyimpan', err.message || 'Terjadi kesalahan sistem.', 'error');
    }
  }
}
