// Welcome Embed Logic & Preview Updates

function parseMarkdown(text) {
  if (!text) return '';
  let parsed = escapeHtml(text);
  parsed = parsed.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  parsed = parsed.replace(/__(.*?)__/g, '<u>$1</u>');
  parsed = parsed.replace(/\*(.*?)\*/g, '<em>$1</em>');
  parsed = parsed.replace(/_(.*?)_/g, '<em>$1</em>');
  parsed = parsed.replace(/\n/g, '<br>');
  return parsed;
}

function updateEmbedPreview() {
  const title = welcomeTitleInput ? (welcomeTitleInput.value || '👋 Selamat Datang!') : '👋 Selamat Datang!';
  if (previewTitle) previewTitle.innerText = title;
  
  let rawDesc = welcomeMessageInput ? (welcomeMessageInput.value || '') : '';
  if (!rawDesc) {
    rawDesc = "Selamat datang **{username}** di **{guildName}**!\n\nKamu adalah member ke-**{memberCount}** di server ini.";
  }
  
  const currentGuildNameElem = document.getElementById('current-guild-name');
  const guildName = currentGuildNameElem ? currentGuildNameElem.innerText : 'Server Discord';

  const parsedDesc = rawDesc
    .replace(/{username}/g, "RidwanMubarok")
    .replace(/{guildName}/g, guildName)
    .replace(/{memberCount}/g, "42");
    
  if (previewDescription) previewDescription.innerHTML = parseMarkdown(parsedDesc);
  
  if (welcomeThumbnailCheckbox) {
    if (welcomeThumbnailCheckbox.checked) {
      if (previewThumbnailContainer) previewThumbnailContainer.classList.remove('hidden');
    } else {
      if (previewThumbnailContainer) previewThumbnailContainer.classList.add('hidden');
    }
  }
  
  const imageUrl = welcomeImageInput ? welcomeImageInput.value.trim() : '';
  if (imageUrl) {
    if (previewImage) previewImage.src = imageUrl;
    if (previewImageContainer) previewImageContainer.classList.remove('hidden');
  } else {
    if (previewImageContainer) previewImageContainer.classList.add('hidden');
  }
}
