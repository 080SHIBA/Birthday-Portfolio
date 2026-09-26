import { createClient } from '@supabase/supabase-js';

const $ = (selector, root = document) => root.querySelector(selector);
const supabaseClient = createClient('https://ltebzkjhbcyqkrfefmvd.supabase.co', 'sb_publishable_CbWHJx9Tr4t0Qj6Z5YxvPA_1l0Bgo0m');
const pageSize = 10;
let offset = 0, hasMore = true, loadingWishes = false, voiceBlob = null, recorder = null, recordChunks = [];
const visitorId = localStorage.getItem('birthdayVisitorId') || crypto.randomUUID();
localStorage.setItem('birthdayVisitorId', visitorId);
const hearted = new Set(JSON.parse(localStorage.getItem('heartedBirthdayWishes') || '[]'));
const galleryCodeHash = '24e4762ee5def527869d188dbccaac88424bcac95b9efce7765b1bc5bcba30b3';
const galleryPasscodeValue = '15091974';
const galleryPromptCooldownMs = 30_000;
let lastGalleryPromptAt = 0;
const guestbookEnabled = Boolean(supabaseClient);
const notificationsEnabled = () => 'Notification' in window && Notification.permission === 'granted';
const showBrowserNotification = (message) => {
  if (!notificationsEnabled()) return;
  new Notification('Birthday guestbook', {
    body: message,
    tag: 'birthday-guestbook-comment'
  });
};

const target = new Date(new Date().getFullYear(), 8, 26);
if (target < new Date()) target.setFullYear(target.getFullYear() + 1);
function tick() { const remaining = Math.max(0, target - new Date()); [['days', 864e5], ['hours', 36e5], ['minutes', 6e4], ['seconds', 1e3]].forEach(([id, unit], index) => { const value = index ? Math.floor(remaining / unit) % [24, 60, 60][index - 1] : Math.floor(remaining / unit); $(`#${id}`).textContent = String(value).padStart(2, '0'); }); }
tick();

function audioUrl(path) { return path && supabaseClient ? supabaseClient.storage.from('birthday-voices').getPublicUrl(path).data.publicUrl : null; }
function saveHearts() { localStorage.setItem('heartedBirthdayWishes', JSON.stringify([...hearted])); }
function animateIn(card) { requestAnimationFrame(() => card.classList.add('is-visible')); }
function renderWish(wish, heartCount = 0, comments = []) {
  const item = $('#wishTemplate').content.cloneNode(true);
  const card = $('.wish-card', item), heart = $('.heart-button', item);
  const commentsList = $('.wish-comments-list', item);
  const commentForm = $('.wish-comment-form', item);
  card.dataset.wishId = wish.id;
  $('.wish-initial', item).textContent = wish.name[0].toUpperCase(); $('.wish-name', item).textContent = wish.name; $('.wish-text', item).textContent = wish.message;
  const date = new Date(wish.created_at); $('time', item).textContent = Number.isNaN(date.valueOf()) ? 'just now' : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  if (wish.audio_path) { const player = $('.wish-audio', item); player.src = audioUrl(wish.audio_path); player.hidden = false; }
  commentsList.innerHTML = '';
  if (!comments.length) {
    const empty = document.createElement('li');
    empty.className = 'wish-comment-empty';
    empty.textContent = 'No comments yet.';
    commentsList.appendChild(empty);
  } else {
    comments.forEach((comment) => {
      const commentItem = document.createElement('li');
      const commentName = document.createElement('span');
      const commentText = document.createElement('p');
      commentItem.className = 'wish-comment-item';
      commentName.className = 'wish-comment-name';
      commentName.textContent = comment.name || 'Visitor';
      commentText.textContent = comment.message;
      commentItem.append(commentName, commentText);
      commentsList.appendChild(commentItem);
    });
  }
  commentForm.dataset.wishId = wish.id;
  commentForm.addEventListener('submit', handleWishCommentSubmit);
  $('.heart-count', item).textContent = heartCount; heart.classList.toggle('is-hearted', hearted.has(wish.id)); heart.setAttribute('aria-pressed', String(hearted.has(wish.id)));
  heart.addEventListener('click', () => addHeart(wish.id, heart));
  $('#wishWall').append(item); animateIn($('#wishWall').lastElementChild);
}
async function getHeartCounts(ids) {
  if (!ids.length || !supabaseClient) return new Map();
  const { data } = await supabaseClient.from('birthday_reactions').select('wish_id').in('wish_id', ids);
  return (data || []).reduce((counts, reaction) => counts.set(reaction.wish_id, (counts.get(reaction.wish_id) || 0) + 1), new Map());
}
async function updateTotal() {
  if (!supabaseClient) return;
  const { count } = await supabaseClient.from('birthday_wishes').select('*', { count: 'exact', head: true });
  if (count !== null) { $('#wishTotal').textContent = count; $('#wishMessageTotal').textContent = count; }
}
async function getCommentsByWish(ids) {
  if (!ids.length || !supabaseClient) return new Map();
  const { data } = await supabaseClient.from('birthday_comments').select('id, wish_id, name, message, created_at').in('wish_id', ids).order('created_at', { ascending: true });
  return (data || []).reduce((commentsMap, comment) => {
    const list = commentsMap.get(comment.wish_id) || [];
    list.push(comment);
    commentsMap.set(comment.wish_id, list);
    return commentsMap;
  }, new Map());
}
async function loadWishes(reset = false) {
  if (!guestbookEnabled) {
    $('#wishWall').innerHTML = '<p class="wall-status">The guestbook is temporarily offline. The rest of the birthday page is still working.</p>';
    return;
  }
  if (loadingWishes || (!hasMore && !reset)) return; loadingWishes = true;
  if (reset) { offset = 0; hasMore = true; $('#wishWall').innerHTML = ''; }
  const { data, error } = await supabaseClient.from('birthday_wishes').select('id, name, message, audio_path, created_at').order('created_at', { ascending: false }).range(offset, offset + pageSize - 1);
  if (error) { $('#wishWall').innerHTML = '<p class="wall-status">The guestbook is getting ready. Run the setup SQL, then refresh this page.</p>'; console.error(error); loadingWishes = false; return; }
  const hearts = await getHeartCounts(data.map((wish) => wish.id));
  const commentsByWish = await getCommentsByWish(data.map((wish) => wish.id));
  data.forEach((wish) => renderWish(wish, hearts.get(wish.id) || 0, commentsByWish.get(wish.id) || [])); offset += data.length; hasMore = data.length === pageSize; loadingWishes = false; updateTotal();
}
async function handleWishCommentSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const input = $('.wish-comment-input', form);
  const message = input.value.trim();
  if (!message) return;
  if (!supabaseClient) {
    input.value = '';
    input.placeholder = 'Guestbook is unavailable right now.';
    return;
  }
  const wishId = form.dataset.wishId;
  const { error } = await supabaseClient.from('birthday_comments').insert({ wish_id: wishId, name: 'Visitor', message: message.slice(0, 160) });
  if (error) {
    console.error(error);
    const detail = /does not exist|relation .*birthday_comments/i.test(error.message) ? 'Run the SQL in supabase-setup.sql to create the comments table.' : 'Your comment could not be sent right now. Please try again.';
    input.value = '';
    input.placeholder = detail;
    input.focus();
    return;
  }
  form.reset();
  await loadWishes(true);
}
async function addHeart(wishId, button) {
  if (!supabaseClient || hearted.has(wishId)) return;
  button.disabled = true;
  const { error } = await supabaseClient.from('birthday_reactions').insert({ wish_id: wishId, visitor_id: visitorId });
  if (!error) { hearted.add(wishId); saveHearts(); button.classList.add('is-hearted'); button.setAttribute('aria-pressed', 'true'); $('.heart-count', button).textContent = Number($('.heart-count', button).textContent) + 1; }
  else console.error(error);
  button.disabled = false;
}
function confetti() { const colors = ['var(--color-orange)', 'var(--color-white)', 'var(--color-orange-hover)']; for (let index = 0; index < 70; index += 1) { const piece = document.createElement('i'); piece.className = 'confetti'; piece.style.left = `${Math.random() * 100}vw`; piece.style.setProperty('--drift', `${Math.random() * 16 - 8}vw`); piece.style.background = colors[index % colors.length]; piece.style.animationDelay = `${Math.random() * .3}s`; $('.confetti-layer').append(piece); setTimeout(() => piece.remove(), 1000); } }
async function hash(value) { const bytes = new TextEncoder().encode(value); const digest = await crypto.subtle.digest('SHA-256', bytes); return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join(''); }
function openGalleryViewer(tile) { const image = $('img', tile); const viewer = $('#galleryViewer'); $('#galleryViewerImage').src = image.currentSrc || image.src; $('#galleryViewerImage').alt = image.alt; $('#galleryViewerCaption').textContent = $('figcaption', tile).textContent; viewer.showModal(); }
function setUpGalleryViewer() { document.querySelectorAll('#bentoGrid .bento-tile').forEach((tile) => { if (tile.dataset.viewerBound) return; tile.dataset.viewerBound = 'true'; tile.tabIndex = 0; tile.setAttribute('role', 'button'); tile.setAttribute('aria-label', `View photo: ${$('figcaption', tile).textContent}`); tile.addEventListener('click', () => openGalleryViewer(tile)); tile.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openGalleryViewer(tile); } }); }); }
function unlockGallery() { const grid = $('#bentoGrid'); if (!grid.children.length) grid.append($('#galleryTemplate').content.cloneNode(true)); setUpGalleryViewer(); grid.hidden = false; $('#galleryGate').hidden = true; sessionStorage.setItem('birthdayGalleryUnlocked', 'true'); const prompt = $('#exitPrompt'); if (prompt && prompt.open) prompt.close(); }
if (sessionStorage.getItem('birthdayGalleryUnlocked') === 'true') unlockGallery();
$('#galleryForm').addEventListener('submit', async (event) => { event.preventDefault(); const input = $('#galleryPasscode'); const error = $('#galleryError'); if (await hash(input.value) === galleryCodeHash) { unlockGallery(); return; } error.textContent = 'That passcode is not quite right. Please try again.'; input.select(); });

$('#nameInput').addEventListener('input', (event) => { $('#conversation').innerHTML = `<p class="bot-line">Lovely to meet you, ${event.target.value || 'friend'}! Now, what birthday joy would you like to send?</p>`; });
$('#wishForm').addEventListener('submit', async (event) => { event.preventDefault(); const submit = $('#wishForm button[type="submit"]'), name = $('#nameInput').value.trim(), message = $('#wishInput').value.trim(); if (!name || !message) return; submit.disabled = true; submit.textContent = 'Adding your wish…'; let audioPath = null; try { if (!supabaseClient) { throw new Error('Guestbook is unavailable.'); } if (voiceBlob) { audioPath = `${crypto.randomUUID()}.webm`; const { error } = await supabaseClient.storage.from('birthday-voices').upload(audioPath, voiceBlob, { contentType: 'audio/webm', upsert: false }); if (error) throw error; } const { error } = await supabaseClient.from('birthday_wishes').insert({ name, message, audio_path: audioPath }); if (error) throw error; await loadWishes(true); $('#wishForm').reset(); voiceBlob = null; $('#voicePreview').hidden = true; $('#recordButton').textContent = '◉ Add a voice note'; $('#conversation').innerHTML = '<p class="bot-line">Your wish is on the wall. Thank you for being part of my day!</p>'; confetti(); $('#giftPrompt').showModal(); } catch (error) { console.error(error); $('#conversation').innerHTML = '<p class="bot-line">I could not save that yet. Please try again after the guestbook setup is complete.</p>'; } finally { submit.disabled = false; submit.innerHTML = 'Add to card <span>↗</span>'; } });
$('#recordButton').onclick = async () => { if (!navigator.mediaDevices) return alert('Voice recording is not supported in this browser.'); if (recorder?.state === 'recording') { recorder.stop(); return; } try { const stream = await navigator.mediaDevices.getUserMedia({ audio: true }); recordChunks = []; recorder = new MediaRecorder(stream); recorder.ondataavailable = (event) => recordChunks.push(event.data); recorder.onstop = () => { voiceBlob = new Blob(recordChunks, { type: 'audio/webm' }); const preview = $('#voicePreview'); preview.src = URL.createObjectURL(voiceBlob); preview.hidden = false; $('#recordButton').textContent = '◉ Voice note attached'; $('#recordButton').classList.remove('recording'); stream.getTracks().forEach((track) => track.stop()); }; recorder.start(); $('#recordButton').textContent = '■ Stop recording'; $('#recordButton').classList.add('recording'); } catch { alert('Please allow microphone access to add a voice note.'); } };

document.querySelectorAll('[data-share]').forEach((button) => { button.onclick = async () => { const url = location.href; if (button.dataset.share === 'copy') { await navigator.clipboard?.writeText(url); button.textContent = 'Copied!'; setTimeout(() => { button.textContent = 'Copy link'; }, 1200); } else if (button.dataset.share === 'whatsapp') open(`https://wa.me/?text=${encodeURIComponent(`Come celebrate with me! ${url}`)}`, '_blank'); else open(`https://twitter.com/intent/tweet?text=${encodeURIComponent('Come celebrate with me!')}&url=${encodeURIComponent(url)}`, '_blank'); }; });
document.querySelectorAll('[data-copy-account]').forEach((button) => { button.onclick = async () => { await navigator.clipboard?.writeText(button.dataset.copyAccount); button.innerHTML = 'Account number copied <span>✓</span>'; setTimeout(() => { button.innerHTML = 'Copy account number <span>↗</span>'; }, 1600); }; });

$('#celebrateButton').onclick = confetti;
const enableNotificationsButton = $('#enableNotificationsButton');
if (enableNotificationsButton) {
  if (!('Notification' in window)) {
    enableNotificationsButton.hidden = true;
  } else if (Notification.permission === 'granted') {
    enableNotificationsButton.textContent = 'Notifications enabled';
    enableNotificationsButton.disabled = true;
  }
  enableNotificationsButton.addEventListener('click', async () => {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'granted') return;
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      enableNotificationsButton.textContent = 'Notifications enabled';
      enableNotificationsButton.disabled = true;
      showBrowserNotification('Notifications are now enabled for new comments.');
    }
  });
}
$('#dismissGiftPrompt').onclick = () => $('#giftPrompt').close();
$('#closeGalleryViewer').onclick = () => $('#galleryViewer').close();
$('#galleryViewer').addEventListener('click', (event) => { if (event.target === $('#galleryViewer')) $('#galleryViewer').close(); });
const revealPasscode = () => {
  const reveal = $('#passcodeReveal');
  const value = $('#passcodeValue');
  if (!reveal || !value) return;
  value.textContent = galleryPasscodeValue;
  reveal.hidden = false;
};
const startGalleryPromptCooldown = () => {
  lastGalleryPromptAt = Date.now();
};
const showExitPrompt = () => {
  const prompt = $('#exitPrompt');
  const galleryUnlocked = sessionStorage.getItem('birthdayGalleryUnlocked') === 'true';
  const now = Date.now();
  if (galleryUnlocked || prompt.open) return;
  if (lastGalleryPromptAt && now - lastGalleryPromptAt < galleryPromptCooldownMs) return;
  prompt.showModal();
};
$('#galleryPasscode').addEventListener('pointerdown', showExitPrompt);
$('#galleryPasscode').addEventListener('focus', showExitPrompt);
$('#exitPrompt').addEventListener('click', (event) => {
  if (event.target === $('#exitPrompt')) {
    $('#exitPrompt').close();
    $('#galleryPasscode').blur();
  }
});
$('#exitPrompt').addEventListener('close', () => {
  $('#galleryPasscode').blur();
});
$('#stayOnPage').onclick = () => {
  revealPasscode();
};
$('#copyPasscodeFromPrompt').onclick = async () => {
  try {
    await navigator.clipboard.writeText(galleryPasscodeValue);
    startGalleryPromptCooldown();
    const copyButton = $('#copyPasscodeFromPrompt');
    const original = copyButton.textContent;
    copyButton.textContent = '✓';
    setTimeout(() => { copyButton.textContent = original; }, 1200);
  } catch (error) {
    console.error(error);
  }
};
new IntersectionObserver(([entry]) => { if (entry.isIntersecting) loadWishes(); }, { rootMargin: '360px' }).observe($('#wishSentinel'));
if (supabaseClient) {
  supabaseClient.channel('birthday-live-updates').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'birthday_wishes' }, () => loadWishes(true)).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'birthday_reactions' }, () => loadWishes(true)).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'birthday_comments' }, () => {
    loadWishes(true);
    showBrowserNotification('Someone just left a comment on a birthday wish.');
  }).subscribe();
}
loadWishes(true); setTimeout(confetti, 350);
