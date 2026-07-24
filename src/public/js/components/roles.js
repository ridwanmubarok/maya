// Roles Manager Component Logic

async function loadRoles() {
  const tbody = document.getElementById('roles-table-body');
  if (!tbody) return;
  if (!selectedGuildId) {
    tbody.innerHTML = `<tr><td colspan="5" class="p-6 text-center text-amber-400/90 italic bg-amber-500/5"><i class="fa-solid fa-hand-pointer mr-1.5"></i> Silakan pilih server di sidebar sebelah kiri terlebih dahulu.</td></tr>`;
    return;
  }
  tbody.innerHTML = `<tr><td colspan="5" class="p-6 text-center text-gray-500 italic"><i class="fa-solid fa-spinner animate-spin mr-1"></i> Loading roles list...</td></tr>`;

  try {
    const response = await apiFetch(`/api/roles/${selectedGuildId}`);

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || 'Gagal mengambil daftar role.');
    }
    const { roles } = await response.json();
    
    if (!roles || roles.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" class="p-6 text-center text-gray-500 italic">Tidak ada role ditemukan di server ini.</td></tr>`;
      return;
    }

    tbody.innerHTML = roles.map(role => {
      const typeStr = role.managed ? 'Integrasi 🤖' : 'Umum 👥';
      const isEveryone = role.name === '@everyone';
      return `
        <tr class="border-b border-white/5 hover:bg-white/2 transition-colors">
          <td class="p-4 font-semibold text-white">${escapeHtml(role.name)}</td>
          <td class="p-4 flex items-center gap-2">
            <span class="w-4 h-4 rounded border border-white/10" style="background-color: ${role.color}"></span>
            <span class="font-mono text-gray-400 text-[10px]">${role.color}</span>
          </td>
          <td class="p-4 text-gray-300 font-medium">${role.memberCount} Anggota</td>
          <td class="p-4 text-gray-400">${typeStr}</td>
          <td class="p-4 text-center">
            ${isEveryone || role.managed
              ? `<span class="text-[10px] text-gray-500 italic">Terkunci</span>`
              : `<button 
                  onclick="deleteRole('${role.id}')"
                  class="px-2 py-1 rounded bg-red-500/10 border border-red-500/25 text-red-400 hover:bg-red-500/20 hover:text-white transition-all font-medium text-[10px]"
                >
                  <i class="fa-solid fa-trash-can mr-1"></i> Hapus
                </button>`
            }
          </td>
        </tr>
      `;
    }).join('');
  } catch (error) {
    if (error.message !== '401 Unauthorized') {
      tbody.innerHTML = `<tr><td colspan="5" class="p-6 text-center text-red-400 italic">${escapeHtml(error.message || 'Gagal mengambil data role server.')}</td></tr>`;
    }
  }
}

async function createRole() {
  const createBtn = document.getElementById('create-role-btn');
  const originalHtml = createBtn ? createBtn.innerHTML : '';
  
  if (!newRoleNameInput.value.trim()) {
    showToast('Error', 'Nama role tidak boleh kosong.', 'error');
    return;
  }

  if (createBtn) {
    createBtn.disabled = true;
    createBtn.innerHTML = `<i class="fa-solid fa-spinner animate-spin text-sm"></i> Membuat...`;
  }

  const payload = {
    name: newRoleNameInput.value,
    color: newRoleColorInput.value,
    hoist: newRoleHoistCheckbox.checked
  };

  try {
    const response = await apiFetch(`/api/roles/${selectedGuildId}`, {
      method: 'POST',
      body: payload
    });

    if (response.ok) {
      showToast('Sukses', 'Role baru berhasil dibuat!', 'success');
      newRoleNameInput.value = '';
      newRoleHoistCheckbox.checked = false;
      loadRoles();
    } else {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || 'Gagal membuat role.');
    }
  } catch (error) {
    if (error.message !== '401 Unauthorized') {
      showToast('Gagal Membuat Role', error.message || 'Gagal terhubung ke API server.', 'error');
    }
  } finally {
    if (createBtn) {
      createBtn.disabled = false;
      createBtn.innerHTML = originalHtml;
    }
  }
}

async function deleteRole(roleId) {
  if (!confirm('Apakah Anda yakin ingin menghapus role ini dari server Discord?')) return;

  try {
    const response = await apiFetch(`/api/roles/${selectedGuildId}/${roleId}`, {
      method: 'DELETE'
    });

    if (response.ok) {
      showToast('Sukses', 'Role berhasil dihapus dari server.', 'success');
      loadRoles();
    } else {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || 'Gagal menghapus role.');
    }
  } catch (error) {
    if (error.message !== '401 Unauthorized') {
      showToast('Gagal Menghapus Role', error.message || 'Gagal terhubung ke API server.', 'error');
    }
  }
}
