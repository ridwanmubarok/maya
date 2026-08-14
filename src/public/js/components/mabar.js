// Mabar Scheduler Component Logic

async function loadMabar() {
  const tbody = document.getElementById('mabar-table-body');
  if (!tbody) return;
  if (!selectedGuildId) {
    tbody.innerHTML = `<tr><td colspan="4" class="p-4 text-center text-amber-400/90 text-xs italic bg-amber-500/5"><i class="fa-solid fa-hand-pointer mr-1.5"></i> Silakan pilih server di sidebar sebelah kiri terlebih dahulu.</td></tr>`;
    return;
  }
  tbody.innerHTML = `<tr><td colspan="4" class="p-4 text-center text-gray-500 italic"><i class="fa-solid fa-spinner animate-spin mr-1"></i> Memuat jadwal...</td></tr>`;

  try {
    const response = await apiFetch(`/api/mabar/${selectedGuildId}`);
    if (!response.ok) throw new Error();
    const { sessions } = await response.json();

    if (sessions.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" class="p-4 text-center text-gray-500 italic">Tidak ada mabar aktif saat ini.</td></tr>`;
      return;
    }

    tbody.innerHTML = sessions.map(session => {
      const currentCount = session.participants ? session.participants.length : 0;
      const maxStr = session.maxPlayers ? `/${session.maxPlayers}` : '';
      return `
        <tr class="border-b border-white/5 hover:bg-white/2 transition-colors">
          <td class="p-3 font-semibold text-white">${escapeHtml(session.game)}</td>
          <td class="p-3 text-gray-300 font-medium">${escapeHtml(session.playTime)}</td>
          <td class="p-3 text-violet-400 font-bold">${currentCount}${maxStr} Pemain</td>
          <td class="p-3 text-center">
            <button 
              onclick="deleteMabar('${session.id}')"
              class="px-2.5 py-1 rounded-lg bg-red-500/10 border border-red-500/25 text-red-400 hover:bg-red-500/20 hover:text-white transition-all font-medium text-[10px]"
            >
              <i class="fa-solid fa-trash-can mr-1"></i> Batal
            </button>
          </td>
        </tr>
      `;
    }).join('');
  } catch (error) {
    if (error.message !== '401 Unauthorized') {
      tbody.innerHTML = `<tr><td colspan="4" class="p-4 text-center text-red-400 italic">Gagal mengambil daftar mabar.</td></tr>`;
    }
  }
}

async function createMabar() {
  const createBtn = document.getElementById('create-mabar-btn');
  const mabarUrlInput = document.getElementById('mabar-url');
  const originalHtml = createBtn ? createBtn.innerHTML : '';

  if (!mabarChannelSelect.value) {
    showToast('Error', 'Silakan pilih channel target terlebih dahulu.', 'error');
    return;
  }
  if (!mabarGameInput.value.trim() || !mabarTimeInput.value.trim() || !mabarDescriptionInput.value.trim()) {
    showToast('Error', 'Nama Game, Waktu, dan Deskripsi wajib diisi.', 'error');
    return;
  }

  if (createBtn) {
    createBtn.disabled = true;
    createBtn.innerHTML = `<i class="fa-solid fa-spinner animate-spin text-sm"></i> Menjadwalkan...`;
  }

  const payload = {
    channelId: mabarChannelSelect.value,
    game: mabarGameInput.value,
    playTime: mabarTimeInput.value,
    maxPlayers: mabarSlotsInput.value ? Number(mabarSlotsInput.value) : null,
    description: mabarDescriptionInput.value,
    gameUrl: mabarUrlInput && mabarUrlInput.value.trim() ? mabarUrlInput.value.trim() : null,
  };

  try {
    const response = await apiFetch(`/api/mabar/${selectedGuildId}`, {
      method: 'POST',
      body: payload
    });

    if (response.ok) {
      showToast('Sukses', 'Mabar berhasil dijadwalkan!', 'success');
      mabarGameInput.value = '';
      mabarTimeInput.value = '';
      mabarSlotsInput.value = '';
      mabarDescriptionInput.value = '';
      if (mabarUrlInput) mabarUrlInput.value = '';
      loadMabar();
    } else {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || 'Gagal menjadwalkan mabar.');
    }
  } catch (error) {
    if (error.message !== '401 Unauthorized') {
      showToast('Gagal Menjadwalkan', error.message || 'Gagal terhubung ke API server.', 'error');
    }
  } finally {
    if (createBtn) {
      createBtn.disabled = false;
      createBtn.innerHTML = originalHtml;
    }
  }
}

async function deleteMabar(sessionId) {
  if (!confirm('Apakah Anda yakin ingin membatalkan/menghapus jadwal mabar ini? Undangan di Discord juga akan dihapus.')) return;

  try {
    const response = await apiFetch(`/api/mabar/${selectedGuildId}/${sessionId}`, {
      method: 'DELETE'
    });

    if (response.ok) {
      showToast('Sukses', 'Jadwal mabar berhasil dibatalkan.', 'success');
      loadMabar();
    } else {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || 'Gagal membatalkan mabar.');
    }
  } catch (error) {
    if (error.message !== '401 Unauthorized') {
      showToast('Gagal Membatalkan', error.message || 'Gagal terhubung ke API server.', 'error');
    }
  }
}
