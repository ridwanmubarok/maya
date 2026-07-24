// Reaction Roles Component Logic

function addRrOptionRow(roleId = '', label = '', emoji = '', style = 'Primary') {
  const container = document.getElementById('rr-options-container');
  if (!container) return;
  const rowId = `rr-row-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;

  const rolesOptionsHtml = guildRoles.map(r => 
    `<option value="${r.id}" data-name="${escapeHtml(r.name)}" ${r.id === roleId ? 'selected' : ''}>@${escapeHtml(r.name)}</option>`
  ).join('');

  const row = document.createElement('div');
  row.id = rowId;
  row.className = 'flex flex-wrap items-center gap-2 p-3 rounded-xl bg-white/2 border border-white/5 text-xs';
  row.innerHTML = `
    <div class="flex-1 min-w-[140px]">
      <select class="rr-role-select w-full px-3 py-2 rounded-lg glass-input text-white outline-none appearance-none cursor-pointer text-xs" onchange="onRrRoleSelectChange(this)">
        <option value="">-- Pilih Role --</option>
        ${rolesOptionsHtml}
      </select>
    </div>
    <div class="flex-1 min-w-[120px]">
      <input type="text" value="${escapeHtml(label)}" placeholder="Label Tombol" class="rr-label-input w-full px-3 py-2 rounded-lg glass-input text-white outline-none text-xs">
    </div>
    <div class="w-20">
      <input type="text" value="${escapeHtml(emoji)}" placeholder="Emoji (e.g. 🎮)" class="rr-emoji-input w-full px-3 py-2 rounded-lg glass-input text-white outline-none text-xs text-center">
    </div>
    <div class="w-28">
      <select class="rr-style-select w-full px-3 py-2 rounded-lg glass-input text-white outline-none appearance-none cursor-pointer text-xs">
        <option value="Primary" ${style === 'Primary' ? 'selected' : ''}>Blurple</option>
        <option value="Secondary" ${style === 'Secondary' ? 'selected' : ''}>Abu-abu</option>
        <option value="Success" ${style === 'Success' ? 'selected' : ''}>Hijau</option>
        <option value="Danger" ${style === 'Danger' ? 'selected' : ''}>Merah</option>
      </select>
    </div>
    <button type="button" onclick="document.getElementById('${rowId}').remove()" class="w-8 h-8 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 flex items-center justify-center transition-all shrink-0" title="Hapus Tombol">
      <i class="fa-solid fa-times"></i>
    </button>
  `;

  container.appendChild(row);
}

function onRrRoleSelectChange(selectElem) {
  const selectedOption = selectElem.options[selectElem.selectedIndex];
  const roleName = selectedOption ? selectedOption.getAttribute('data-name') : '';
  const row = selectElem.closest('div.flex');
  if (row && roleName) {
    const labelInput = row.querySelector('.rr-label-input');
    if (labelInput && !labelInput.value) {
      labelInput.value = roleName;
    }
  }
}

async function loadReactionRoles() {
  const list = document.getElementById('rr-menus-list');
  if (!list) return;
  if (!selectedGuildId) {
    list.innerHTML = `<div class="p-6 text-center text-amber-400/90 text-xs italic bg-amber-500/5 rounded-xl border border-amber-500/10"><i class="fa-solid fa-hand-pointer mr-1.5"></i> Silakan pilih server di sidebar sebelah kiri terlebih dahulu.</div>`;
    return;
  }
  list.innerHTML = `<div class="text-center py-6 text-gray-500 text-xs italic"><i class="fa-solid fa-spinner animate-spin mr-1"></i> Memuat panel...</div>`;

  try {
    const response = await apiFetch(`/api/reaction-roles/${selectedGuildId}`);
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || 'Gagal memuat panel Reaction Roles.');
    }
    const data = await response.json();
    const menus = data.menus || [];

    if (menus.length === 0) {
      list.innerHTML = `<div class="text-center py-6 text-gray-500 text-xs italic">Belum ada panel Reaction Role aktif di server ini.</div>`;
      return;
    }

    list.innerHTML = menus.map(m => `
      <div class="p-3.5 rounded-xl bg-white/2 border border-white/5 flex flex-col gap-2.5">
        <div class="flex items-start justify-between gap-2">
          <div>
            <h4 class="font-bold text-white text-xs">${escapeHtml(m.title)}</h4>
            <div class="text-[10px] text-gray-400 mt-0.5">${m.options ? m.options.length : 0} Tombol Role • ID: ${m.id.substring(0, 8)}</div>
          </div>
          <button onclick="deleteReactionRoleMenu('${m.id}')" class="px-2 py-1 rounded bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 transition-all font-medium text-[10px]">
            <i class="fa-solid fa-trash mr-1"></i> Hapus
          </button>
        </div>
        <div class="flex flex-wrap gap-1.5 pt-1">
          ${(m.options || []).map(o => `
            <span class="px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-[10px] text-gray-300 font-medium flex items-center gap-1">
              ${o.emoji ? o.emoji : '🏷️'} ${escapeHtml(o.label || o.roleName)}
            </span>
          `).join('')}
        </div>
      </div>
    `).join('');
  } catch (error) {
    if (error.message !== '401 Unauthorized') {
      list.innerHTML = `<div class="text-center py-6 text-red-400 text-xs">${escapeHtml(error.message || 'Gagal memuat panel Reaction Roles.')}</div>`;
    }
  }
}

async function createReactionRoleMenu() {
  const createBtn = document.getElementById('create-rr-btn');
  const originalHtml = createBtn ? createBtn.innerHTML : '';

  const channelId = rrChannelSelect ? rrChannelSelect.value : '';
  const title = rrTitleInput ? rrTitleInput.value.trim() : '';
  const description = rrDescriptionInput ? rrDescriptionInput.value.trim() : '';
  const color = rrColorInput ? rrColorInput.value : '#5865F2';

  if (!channelId) {
    showToast('Error', 'Silakan pilih channel target terlebih dahulu.', 'error');
    return;
  }
  if (!title) {
    showToast('Error', 'Judul panel tidak boleh kosong.', 'error');
    return;
  }

  // Collect options rows
  const optionRows = document.querySelectorAll('#rr-options-container > div');
  const options = [];

  optionRows.forEach(row => {
    const roleSelect = row.querySelector('.rr-role-select');
    const labelInput = row.querySelector('.rr-label-input');
    const emojiInput = row.querySelector('.rr-emoji-input');
    const styleSelect = row.querySelector('.rr-style-select');

    if (roleSelect && roleSelect.value) {
      const selectedOption = roleSelect.options[roleSelect.selectedIndex];
      const roleName = selectedOption ? selectedOption.getAttribute('data-name') : 'Role';
      options.push({
        roleId: roleSelect.value,
        roleName: roleName,
        label: labelInput ? labelInput.value.trim() || roleName : roleName,
        emoji: emojiInput ? emojiInput.value.trim() : '',
        style: styleSelect ? styleSelect.value : 'Primary'
      });
    }
  });

  if (options.length === 0) {
    showToast('Error', 'Minimal tambahkan 1 tombol role untuk dikirim.', 'error');
    return;
  }

  if (createBtn) {
    createBtn.disabled = true;
    createBtn.innerHTML = `<i class="fa-solid fa-spinner animate-spin text-sm"></i> Mengirim...`;
  }

  try {
    const response = await apiFetch(`/api/reaction-roles/${selectedGuildId}`, {
      method: 'POST',
      body: {
        channelId,
        title,
        description,
        color,
        options
      }
    });

    if (response.ok) {
      showToast('Sukses', 'Panel Reaction Role berhasil terkirim ke Discord!', 'success');
      loadReactionRoles();
    } else {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || 'Gagal membuat panel Reaction Role.');
    }
  } catch (error) {
    if (error.message !== '401 Unauthorized') {
      showToast('Gagal Membuat', error.message || 'Gagal terhubung ke API server.', 'error');
    }
  } finally {
    if (createBtn) {
      createBtn.disabled = false;
      createBtn.innerHTML = originalHtml;
    }
  }
}

async function deleteReactionRoleMenu(menuId) {
  if (!confirm('Apakah Anda yakin ingin menghapus panel Reaction Role ini? Pesan tombol di Discord juga akan dihapus.')) return;

  try {
    const response = await apiFetch(`/api/reaction-roles/${selectedGuildId}/${menuId}`, {
      method: 'DELETE'
    });

    if (response.ok) {
      showToast('Sukses', 'Panel Reaction Role berhasil dihapus.', 'success');
      loadReactionRoles();
    } else {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || 'Gagal menghapus panel Reaction Role.');
    }
  } catch (error) {
    if (error.message !== '401 Unauthorized') {
      showToast('Gagal Menghapus', error.message || 'Gagal terhubung ke API server.', 'error');
    }
  }
}
