// Escout options page — lets each user store their own Etsy Open API v3
// credentials locally via chrome.storage.sync. Nothing here is sent
// anywhere except read back by background.js when it calls Etsy's API.

const keystringInput = document.getElementById('keystring');
const sharedSecretInput = document.getElementById('sharedSecret');
const saveButton = document.getElementById('save');
const statusEl = document.getElementById('status');

async function load() {
  const { etsyKeystring, etsySharedSecret } = await chrome.storage.sync.get([
    'etsyKeystring',
    'etsySharedSecret',
  ]);
  if (etsyKeystring) keystringInput.value = etsyKeystring;
  if (etsySharedSecret) sharedSecretInput.value = etsySharedSecret;
}

function showStatus(text, isError) {
  statusEl.textContent = text;
  statusEl.className = isError ? 'status-error' : 'status-ok';
  setTimeout(() => {
    statusEl.textContent = '';
    statusEl.className = '';
  }, 2500);
}

async function save() {
  const etsyKeystring = keystringInput.value.trim();
  const etsySharedSecret = sharedSecretInput.value.trim();

  if (!etsyKeystring || !etsySharedSecret) {
    showStatus('Both fields are required.', true);
    return;
  }

  await chrome.storage.sync.set({ etsyKeystring, etsySharedSecret });
  showStatus('Saved ✓', false);
}

saveButton.addEventListener('click', save);
load();
