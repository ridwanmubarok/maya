// Automod & General Guild Config Component Logic

async function saveConfig() {
  if (!selectedGuildId) {
    showToast('Error', 'Silakan pilih server terlebih dahulu.', 'error');
    return;
  }
  const saveBtn = document.getElementById('save-btn');
  const originalHtml = saveBtn ? saveBtn.innerHTML : '';
  
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.innerHTML = `<i class="fa-solid fa-spinner animate-spin text-sm"></i> Menyimpan...`;
  }
  
  const payload = {
    welcomeChannelId: welcomeChannelSelect ? welcomeChannelSelect.value : '',
    moderationLogChannelId: automodLogChannelSelect ? automodLogChannelSelect.value : '',
    welcomeTitle: welcomeTitleInput ? welcomeTitleInput.value : '',
    welcomeMessage: welcomeMessageInput ? welcomeMessageInput.value : '',
    welcomeImage: welcomeImageInput ? welcomeImageInput.value : '',
    welcomeThumbnail: welcomeThumbnailCheckbox ? welcomeThumbnailCheckbox.checked : true,
    
    bannedWords: automodWordsInput ? automodWordsInput.value : '',
    maxStrikes: automodMaxStrikesInput ? automodMaxStrikesInput.value : 3,
    muteDuration: automodMuteDurationInput ? automodMuteDurationInput.value : 10,

    aiPersonality: aiPersonalityInput ? aiPersonalityInput.value : ''
  };
  
  try {
    const response = await apiFetch(`/api/configs/${selectedGuildId}`, {
      method: 'POST',
      body: payload
    });
    
    if (response.ok) {
      showToast('Tersimpan', 'Seluruh konfigurasi server berhasil disimpan.', 'success');
    } else {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || 'Terjadi kesalahan saat menyimpan config.');
    }
  } catch (error) {
    if (error.message !== '401 Unauthorized') {
      showToast('Gagal Menyimpan', error.message || 'Gagal terhubung ke API server.', 'error');
    }
  } finally {
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.innerHTML = originalHtml;
    }
  }
}
