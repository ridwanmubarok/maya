// Rules Creator Component Logic

function updateRulesPreview() {
  const title = (rulesTitleInput && rulesTitleInput.value) ? rulesTitleInput.value : '📜 ATURAN SERVER';
  const previewTitle = document.getElementById('rules-preview-title');
  if (previewTitle) previewTitle.innerText = title;
  
  const rawDesc = (rulesDescriptionInput && rulesDescriptionInput.value) ? rulesDescriptionInput.value : 'Tulis aturan di panel kiri...';
  const previewDesc = document.getElementById('rules-preview-description');
  if (previewDesc) previewDesc.innerHTML = parseMarkdown(rawDesc);
  
  const color = (rulesColorInput && rulesColorInput.value) ? rulesColorInput.value : '#5865F2';
  const previewCard = document.getElementById('rules-preview-card');
  if (previewCard) previewCard.style.borderColor = color;
  
  const thumbUrl = rulesThumbnailInput ? rulesThumbnailInput.value.trim() : '';
  const thumbContainer = document.getElementById('rules-preview-thumb-container');
  const thumbImg = document.getElementById('rules-preview-thumb');
  if (thumbUrl && thumbUrl.startsWith('http')) {
    if (thumbImg) thumbImg.src = thumbUrl;
    if (thumbContainer) thumbContainer.classList.remove('hidden');
  } else {
    if (thumbContainer) thumbContainer.classList.add('hidden');
  }
  
  const bannerUrl = rulesBannerInput ? rulesBannerInput.value.trim() : '';
  const bannerContainer = document.getElementById('rules-preview-banner-container');
  const bannerImg = document.getElementById('rules-preview-banner');
  if (bannerUrl && bannerUrl.startsWith('http')) {
    if (bannerImg) bannerImg.src = bannerUrl;
    if (bannerContainer) bannerContainer.classList.remove('hidden');
  } else {
    if (bannerContainer) bannerContainer.classList.add('hidden');
  }
}

async function sendRulesEmbed() {
  const sendBtn = document.getElementById('send-rules-btn');
  const originalHtml = sendBtn ? sendBtn.innerHTML : '';
  
  if (!rulesChannelSelect.value) {
    showToast('Error', 'Silakan pilih channel target terlebih dahulu.', 'error');
    return;
  }
  if (!rulesDescriptionInput.value.trim()) {
    showToast('Error', 'Isi rules/deskripsi tidak boleh kosong.', 'error');
    return;
  }

  if (sendBtn) {
    sendBtn.disabled = true;
    sendBtn.innerHTML = `<i class="fa-solid fa-spinner animate-spin text-sm"></i> Mengirim...`;
  }
  
  const payload = {
    channelId: rulesChannelSelect.value,
    title: rulesTitleInput.value,
    description: rulesDescriptionInput.value,
    color: rulesColorInput.value,
    thumbnailUrl: rulesThumbnailInput.value,
    bannerUrl: rulesBannerInput.value
  };

  try {
    const response = await apiFetch(`/api/configs/${selectedGuildId}/send-embed`, {
      method: 'POST',
      body: payload
    });

    if (response.ok) {
      showToast('Terkirim', 'Pesan embed berhasil diposting ke Discord!', 'success');
      rulesTitleInput.value = '';
      rulesDescriptionInput.value = '';
      rulesThumbnailInput.value = '';
      rulesBannerInput.value = '';
      updateRulesPreview();
    } else {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || 'Gagal mengirim embed.');
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
