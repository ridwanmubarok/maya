// FRONTEND COMPONENT: MENFESS CONFIGURATION

function loadMenfessConfig(config, channels) {
  const enabledCheckbox = document.getElementById('menfess-enabled');
  const channelSelect = document.getElementById('menfess-channel');

  if (enabledCheckbox) {
    enabledCheckbox.checked = config.menfessEnabled !== false;
  }

  if (channelSelect) {
    channelSelect.innerHTML = `<option value="">Pilih Channel (Default: Channel Utama / System)</option>` +
      channels.map(c => `<option value="${c.id}" ${config.menfessChannelId === c.id ? 'selected' : ''}>#${escapeHtml(c.name)}</option>`).join('');
  }
}

async function saveMenfessConfig() {
  if (!selectedGuildId) {
    showToast('Pilih Server', 'Silakan pilih server terlebih dahulu.', 'error');
    return;
  }

  const enabled = document.getElementById('menfess-enabled')?.checked ?? true;
  const channelId = document.getElementById('menfess-channel')?.value || null;

  try {
    const res = await apiFetch(`/api/configs/${selectedGuildId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        menfessEnabled: enabled,
        menfessChannelId: channelId
      })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Gagal menyimpan pengaturan Menfess.');
    }

    showToast('Berhasil Disimpan', 'Pengaturan AI Menfess berhasil disimpan! 💌', 'success');
  } catch (error) {
    showToast('Gagal Menyimpan', error.message, 'error');
  }
}
