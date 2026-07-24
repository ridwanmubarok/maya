// Strike Logs (Warnings) Component Logic

async function loadWarnings() {
  const tbody = document.getElementById('warnings-table-body');
  if (!tbody) return;
  if (!selectedGuildId) {
    tbody.innerHTML = `<tr><td colspan="5" class="p-6 text-center text-amber-400/90 italic bg-amber-500/5"><i class="fa-solid fa-hand-pointer mr-1.5"></i> Silakan pilih server di sidebar sebelah kiri terlebih dahulu.</td></tr>`;
    return;
  }
  tbody.innerHTML = `<tr><td colspan="5" class="p-6 text-center text-gray-500 italic"><i class="fa-solid fa-spinner animate-spin mr-1"></i> Loading warning logs...</td></tr>`;

  try {
    const response = await apiFetch(`/api/moderation/${selectedGuildId}/warnings`);
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || 'Gagal memuat log strike.');
    }
    const { warnings } = await response.json();
    
    if (!warnings || warnings.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" class="p-6 text-center text-gray-500 italic">Bersih! Tidak ada pelanggaran strike terekam di server ini.</td></tr>`;
      return;
    }

    tbody.innerHTML = warnings.map(log => {
      const date = new Date(log.createdAt).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
      return `
        <tr class="border-b border-white/5 hover:bg-white/2 transition-colors">
          <td class="p-4 flex items-center gap-3">
            <img src="${log.userAvatar}" class="w-8 h-8 rounded-full border border-white/10" alt="Avatar">
            <div>
              <div class="font-semibold text-white">${escapeHtml(log.userTag)}</div>
              <div class="text-[10px] text-gray-500 font-mono select-all">${log.userId}</div>
            </div>
          </td>
          <td class="p-4 font-medium text-white max-w-xs truncate">${escapeHtml(log.reason)}</td>
          <td class="p-4">
            <span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-white/5 text-gray-300 border border-white/5">
              ${log.moderatorId === 'AUTOMOD' ? '🤖 Automod' : '🛡️ Staff'}
            </span>
          </td>
          <td class="p-4 text-gray-400">${date}</td>
          <td class="p-4 text-center">
            <div class="flex items-center justify-center gap-2">
              <button 
                onclick="deleteWarning(${log.id})"
                title="Hapus strike tunggal ini"
                class="px-2.5 py-1 rounded bg-amber-500/10 border border-amber-500/25 text-amber-400 hover:bg-amber-500/20 hover:text-white transition-all font-medium text-[10px]"
              >
                <i class="fa-solid fa-trash-can mr-1"></i> Hapus
              </button>
              <button 
                onclick="resetUserWarnings('${log.userId}', '${escapeHtml(log.userTag)}')"
                title="Reset semua strike untuk pengguna ini"
                class="px-2.5 py-1 rounded bg-red-500/10 border border-red-500/25 text-red-400 hover:bg-red-500/20 hover:text-white transition-all font-medium text-[10px]"
              >
                <i class="fa-solid fa-user-slash mr-1"></i> Reset User
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  } catch (error) {
    if (error.message !== '401 Unauthorized') {
      tbody.innerHTML = `<tr><td colspan="5" class="p-6 text-center text-red-400 italic">${escapeHtml(error.message || 'Gagal mengambil data warning logs.')}</td></tr>`;
    }
  }
}

function toggleAddStrikeForm() {
  const form = document.getElementById('manual-strike-form');
  if (form) form.classList.toggle('hidden');
}

async function submitManualStrike() {
  if (!selectedGuildId) {
    showToast('Error', 'Silakan pilih server terlebih dahulu.', 'error');
    return;
  }
  const userIdInput = document.getElementById('manual-strike-userid');
  const reasonInput = document.getElementById('manual-strike-reason');
  const btn = document.getElementById('submit-strike-btn');

  const userId = userIdInput.value.trim();
  const reason = reasonInput.value.trim();

  if (!userId || !reason) {
    showToast('Error', 'User ID dan Alasan Strike wajib diisi.', 'error');
    return;
  }

  btn.disabled = true;
  btn.innerHTML = `<i class="fa-solid fa-spinner animate-spin"></i> Menyimpan...`;

  try {
    const response = await apiFetch(`/api/moderation/${selectedGuildId}/warnings`, {
      method: 'POST',
      body: { userId, reason }
    });

    if (response.ok) {
      showToast('Sukses', 'Strike berhasil ditambahkan!', 'success');
      userIdInput.value = '';
      reasonInput.value = '';
      toggleAddStrikeForm();
      loadWarnings();
    } else {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || 'Gagal menyimpan strike.');
    }
  } catch (error) {
    if (error.message !== '401 Unauthorized') {
      showToast('Gagal', error.message || 'Gagal terhubung ke API.', 'error');
    }
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<i class="fa-solid fa-gavel"></i> Simpan Strike`;
  }
}

async function deleteWarning(id) {
  if (!confirm(`Hapus log strike #${id}? Strike count pengguna ini akan berkurang.`)) return;

  try {
    const response = await apiFetch(`/api/moderation/${selectedGuildId}/warnings/${id}`, {
      method: 'DELETE'
    });
    if (response.ok) {
      showToast('Sukses', `Log strike #${id} berhasil dicabut.`, 'success');
      loadWarnings();
    } else {
      showToast('Error', 'Gagal mencabut strike.', 'error');
    }
  } catch (error) {
    if (error.message !== '401 Unauthorized') {
      showToast('Koneksi Gagal', 'Gagal menghubungi server.', 'error');
    }
  }
}

async function resetAllWarnings() {
  if (!confirm("⚠️ PERINGATAN: Apakah Anda yakin ingin menghapus seluruh log strike pelanggaran untuk SEMUA anggota di server ini? Tindakan ini tidak dapat dibatalkan!")) return;

  try {
    const response = await apiFetch(`/api/moderation/${selectedGuildId}/warnings/reset`, {
      method: 'DELETE'
    });
    if (response.ok) {
      showToast('Sukses', 'Seluruh log strike server berhasil di-reset.', 'success');
      loadWarnings();
    } else {
      showToast('Error', 'Gagal me-reset log strike.', 'error');
    }
  } catch (error) {
    if (error.message !== '401 Unauthorized') {
      showToast('Koneksi Gagal', 'Gagal menghubungi server.', 'error');
    }
  }
}

async function resetUserWarnings(userId, userTag) {
  if (!confirm(`Hapus seluruh log strike pelanggaran untuk user "${userTag}"? Jumlah strike user ini akan kembali menjadi 0.`)) return;

  try {
    const response = await apiFetch(`/api/moderation/${selectedGuildId}/warnings/user/${userId}`, {
      method: 'DELETE'
    });
    if (response.ok) {
      showToast('Sukses', `Seluruh strike untuk "${userTag}" berhasil di-reset.`, 'success');
      loadWarnings();
    } else {
      showToast('Error', 'Gagal me-reset strike user.', 'error');
    }
  } catch (error) {
    if (error.message !== '401 Unauthorized') {
      showToast('Koneksi Gagal', 'Gagal menghubungi server.', 'error');
    }
  }
}
