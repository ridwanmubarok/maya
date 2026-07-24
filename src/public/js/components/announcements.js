// Stream & Game Share Creator Component Logic

function updateAnnouncePreview() {
  const title = (announceTitleInput && announceTitleInput.value) ? announceTitleInput.value : '🔴 LIVE STREAMING SEKARANG!';
  const previewTitle = document.getElementById('announce-preview-title');
  if (previewTitle) previewTitle.innerText = title;
  
  const rawDesc = (announceDescriptionInput && announceDescriptionInput.value) ? announceDescriptionInput.value : 'Tulis pesan pengumuman di panel kiri...';
  const previewDesc = document.getElementById('announce-preview-description');
  if (previewDesc) previewDesc.innerHTML = parseMarkdown(rawDesc);
  
  const color = (announceColorInput && announceColorInput.value) ? announceColorInput.value : '#F04747';
  const previewCard = document.getElementById('announce-preview-card');
  if (previewCard) previewCard.style.borderColor = color;
  
  const thumbUrl = announceThumbnailInput ? announceThumbnailInput.value.trim() : '';
  const thumbContainer = document.getElementById('announce-preview-thumb-container');
  const thumbImg = document.getElementById('announce-preview-thumb');
  if (thumbUrl && thumbUrl.startsWith('http')) {
    if (thumbImg) thumbImg.src = thumbUrl;
    if (thumbContainer) thumbContainer.classList.remove('hidden');
  } else {
    if (thumbContainer) thumbContainer.classList.add('hidden');
  }
  
  const bannerUrl = announceBannerInput ? announceBannerInput.value.trim() : '';
  const bannerContainer = document.getElementById('announce-preview-banner-container');
  const bannerImg = document.getElementById('announce-preview-banner');
  if (bannerUrl && bannerUrl.startsWith('http')) {
    if (bannerImg) bannerImg.src = bannerUrl;
    if (bannerContainer) bannerContainer.classList.remove('hidden');
  } else {
    if (bannerContainer) bannerContainer.classList.add('hidden');
  }

  const btnLabel = announceBtnLabelInput ? announceBtnLabelInput.value.trim() : '';
  const btnUrl = announceBtnUrlInput ? announceBtnUrlInput.value.trim() : '';
  const btnContainer = document.getElementById('announce-preview-btn-container');
  const btnElement = document.getElementById('announce-preview-btn');
  if (btnLabel && btnUrl && btnUrl.startsWith('http')) {
    if (btnElement) btnElement.innerText = btnLabel;
    if (btnContainer) btnContainer.classList.remove('hidden');
  } else {
    if (btnContainer) btnContainer.classList.add('hidden');
  }
}

async function sendAnnouncement() {
  const sendBtn = document.getElementById('send-announce-btn');
  const originalHtml = sendBtn ? sendBtn.innerHTML : '';
  
  if (!announceChannelSelect.value) {
    showToast('Error', 'Silakan pilih channel target terlebih dahulu.', 'error');
    return;
  }
  if (!announceDescriptionInput.value.trim()) {
    showToast('Error', 'Pesan pengumuman tidak boleh kosong.', 'error');
    return;
  }

  if (sendBtn) {
    sendBtn.disabled = true;
    sendBtn.innerHTML = `<i class="fa-solid fa-spinner animate-spin text-sm"></i> Mengirim...`;
  }
  
  const payload = {
    channelId: announceChannelSelect.value,
    title: announceTitleInput.value,
    description: announceDescriptionInput.value,
    color: announceColorInput.value,
    thumbnailUrl: announceThumbnailInput.value,
    bannerUrl: announceBannerInput.value,
    buttonLabel: announceBtnLabelInput.value,
    buttonUrl: announceBtnUrlInput.value
  };

  try {
    const response = await apiFetch(`/api/configs/${selectedGuildId}/send-embed`, {
      method: 'POST',
      body: payload
    });

    if (response.ok) {
      showToast('Terkirim', 'Pesan pengumuman berhasil diposting ke Discord!', 'success');
      announceTitleInput.value = '';
      announceDescriptionInput.value = '';
      announceThumbnailInput.value = '';
      announceBannerInput.value = '';
      announceBtnLabelInput.value = '';
      announceBtnUrlInput.value = '';
      updateAnnouncePreview();
    } else {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || 'Gagal mengirim pengumuman.');
    }
  } catch (error) {
    if (error.message !== '401 Unauthorized') {
      showToast('Gagal Mengirim', error.message || 'Gagal terhubung ke API server.', 'error');
    }
  } finally {
    if (sendBtn) {
      sendBtn.disabled = false;
      sendBtn.innerHTML = originalHtml;
    }
  }
}
