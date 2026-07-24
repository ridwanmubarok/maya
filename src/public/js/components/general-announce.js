// General Announcement Creator Component Logic

function updateGeneralAnnouncePreview() {
  const title = (genAnnounceTitleInput && genAnnounceTitleInput.value) ? genAnnounceTitleInput.value : '📢 PENGUMUMAN PENTING';
  const previewTitle = document.getElementById('general-announce-preview-title');
  if (previewTitle) previewTitle.innerText = title;
  
  const rawDesc = (genAnnounceDescriptionInput && genAnnounceDescriptionInput.value) ? genAnnounceDescriptionInput.value : 'Tulis isi pengumuman di panel kiri...';
  const previewDesc = document.getElementById('general-announce-preview-description');
  if (previewDesc) previewDesc.innerHTML = parseMarkdown(rawDesc);
  
  const color = (genAnnounceColorInput && genAnnounceColorInput.value) ? genAnnounceColorInput.value : '#E67E22';
  const previewCard = document.getElementById('general-announce-preview-card');
  if (previewCard) previewCard.style.borderColor = color;

  const mentionVal = genAnnounceMentionSelect ? genAnnounceMentionSelect.value : 'none';
  const pingMock = document.getElementById('general-announce-preview-ping');
  if (pingMock) {
    if (mentionVal === 'everyone') {
      pingMock.innerText = '@everyone';
      pingMock.classList.remove('hidden');
    } else if (mentionVal === 'here') {
      pingMock.innerText = '@here';
      pingMock.classList.remove('hidden');
    } else {
      pingMock.classList.add('hidden');
    }
  }
  
  const thumbUrl = genAnnounceThumbnailInput ? genAnnounceThumbnailInput.value.trim() : '';
  const thumbContainer = document.getElementById('general-announce-preview-thumb-container');
  const thumbImg = document.getElementById('general-announce-preview-thumb');
  if (thumbUrl && thumbUrl.startsWith('http')) {
    if (thumbImg) thumbImg.src = thumbUrl;
    if (thumbContainer) thumbContainer.classList.remove('hidden');
  } else {
    if (thumbContainer) thumbContainer.classList.add('hidden');
  }
  
  const bannerUrl = genAnnounceBannerInput ? genAnnounceBannerInput.value.trim() : '';
  const bannerContainer = document.getElementById('general-announce-preview-banner-container');
  const bannerImg = document.getElementById('general-announce-preview-banner');
  if (bannerUrl && bannerUrl.startsWith('http')) {
    if (bannerImg) bannerImg.src = bannerUrl;
    if (bannerContainer) bannerContainer.classList.remove('hidden');
  } else {
    if (bannerContainer) bannerContainer.classList.add('hidden');
  }

  const btnLabel = genAnnounceBtnLabelInput ? genAnnounceBtnLabelInput.value.trim() : '';
  const btnUrl = genAnnounceBtnUrlInput ? genAnnounceBtnUrlInput.value.trim() : '';
  const btnContainer = document.getElementById('general-announce-preview-btn-container');
  const btnElement = document.getElementById('general-announce-preview-btn');
  if (btnLabel && btnUrl && btnUrl.startsWith('http')) {
    if (btnElement) btnElement.innerText = btnLabel;
    if (btnContainer) btnContainer.classList.remove('hidden');
  } else {
    if (btnContainer) btnContainer.classList.add('hidden');
  }
}

async function sendGeneralAnnouncement() {
  const sendBtn = document.getElementById('send-general-announce-btn');
  const originalHtml = sendBtn ? sendBtn.innerHTML : '';
  
  if (!genAnnounceChannelSelect.value) {
    showToast('Error', 'Silakan pilih channel target terlebih dahulu.', 'error');
    return;
  }
  if (!genAnnounceDescriptionInput.value.trim()) {
    showToast('Error', 'Pesan pengumuman tidak boleh kosong.', 'error');
    return;
  }

  if (sendBtn) {
    sendBtn.disabled = true;
    sendBtn.innerHTML = `<i class="fa-solid fa-spinner animate-spin text-sm"></i> Mengirim...`;
  }
  
  const payload = {
    channelId: genAnnounceChannelSelect.value,
    title: genAnnounceTitleInput.value,
    description: genAnnounceDescriptionInput.value,
    color: genAnnounceColorInput.value,
    thumbnailUrl: genAnnounceThumbnailInput.value,
    bannerUrl: genAnnounceBannerInput.value,
    buttonLabel: genAnnounceBtnLabelInput.value,
    buttonUrl: genAnnounceBtnUrlInput.value,
    mention: genAnnounceMentionSelect.value
  };

  try {
    const response = await apiFetch(`/api/configs/${selectedGuildId}/send-embed`, {
      method: 'POST',
      body: payload
    });

    if (response.ok) {
      showToast('Terkirim', 'Pengumuman resmi berhasil diposting ke Discord!', 'success');
      genAnnounceTitleInput.value = '';
      genAnnounceDescriptionInput.value = '';
      genAnnounceThumbnailInput.value = '';
      genAnnounceBannerInput.value = '';
      genAnnounceBtnLabelInput.value = '';
      genAnnounceBtnUrlInput.value = '';
      genAnnounceMentionSelect.value = 'none';
      updateGeneralAnnouncePreview();
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
