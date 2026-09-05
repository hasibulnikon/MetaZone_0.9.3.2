const apiTabs = document.getElementById('apiTabs');
const apiKeyList = document.getElementById('apiKeyList');
const keyCardTemplate = document.getElementById('keyCardTemplate');

let providersCache = [];
let activeProvider = null;

// v0.9.x (Part 21): validate_key_live() now returns immediately with a
// request_id and delivers the real ok/message pair later as a
// "key_validated" event (see bridge.py) -- this wraps that back into a
// Promise so call sites below can keep the exact same
// `const res = await requestValidateKey(...)` shape they had when the
// call was synchronous. pendingValidations maps request_id -> resolve,
// one shared listener handles every in-flight validation regardless of
// which key/button triggered it.
const pendingValidations = new Map();
BackendEvents.on('key_validated', (p) => {
  const resolve = pendingValidations.get(p.request_id);
  if (!resolve) return;
  pendingValidations.delete(p.request_id);
  resolve({ ok: p.ok, message: p.message });
});
function requestValidateKey(provider, key) {
  return new Promise(async (resolve) => {
    const started = await pywebview.api.validate_key_live(provider, key);
    if (!started.request_id) { resolve({ ok: false, message: 'Could not start validation' }); return; }
    pendingValidations.set(started.request_id, resolve);
  });
}

async function loadProviders() {
  const res = await pywebview.api.get_provider_summary();
  providersCache = res.providers;
  if (!activeProvider) activeProvider = providersCache[0]?.provider;
  renderTabs();
  renderProvider();
}

function renderTabs() {
  apiTabs.innerHTML = providersCache.map(p =>
    `<button class="api-tab ${p.provider === activeProvider ? 'active' : ''}" data-provider="${p.provider}">
       ${p.provider} <span class="api-tab-count">●${p.active_count}</span>
     </button>`
  ).join('');
  apiTabs.querySelectorAll('.api-tab').forEach(btn => {
    btn.addEventListener('click', () => { activeProvider = btn.dataset.provider; renderTabs(); renderProvider(); });
  });
}

function renderProvider() {
  const p = providersCache.find(x => x.provider === activeProvider);
  if (!p) return;

  document.getElementById('apiProviderName').textContent = p.provider;
  document.getElementById('apiGetKeyBtn').onclick = () => window.open(p.key_url, '_blank');
  document.getElementById('applyAllCount').textContent = p.keys.length;

  const modelSel = document.getElementById('apiModelSelect');
  modelSel.innerHTML = p.models.map(([label, id]) => `<option value="${id}">${label}</option>`).join('');
  modelSel.value = p.current_model;
  modelSel.onchange = async () => { await pywebview.api.set_provider_model(p.provider, modelSel.value); };

  document.getElementById('btnApplyModelAll').onclick = async () => {
    await pywebview.api.set_provider_model(p.provider, modelSel.value);
    loadProviders();
  };

  document.getElementById('apiSaveKeyBtn').onclick = async () => {
    const input = document.getElementById('apiNewKeyInput');
    const val = input.value.trim();
    if (!val) return;
    const res = await pywebview.api.add_api_key(p.provider, val);
    const status = document.getElementById('apiKeyValidateStatus');
    if (!res.ok) { status.textContent = res.error || 'Could not save.'; return; }
    input.value = ''; status.textContent = '';
    loadProviders();
  };

  // Live validation on blur -- informational only, never blocks Save
  // (matches the original's FocusOut-triggered check).
  document.getElementById('apiNewKeyInput').onblur = async (e) => {
    const val = e.target.value.trim();
    const status = document.getElementById('apiKeyValidateStatus');
    if (val.length < 8) { status.textContent = ''; return; }
    status.textContent = '⟳ Checking…';
    const res = await requestValidateKey(p.provider, val);
    status.textContent = res.ok ? '✓ Valid' : `✗ ${res.message || 'Invalid'}`;
  };

  document.getElementById('btnActivateAll').onclick = async () => {
    await pywebview.api.set_all_keys_active(p.provider, true); loadProviders();
  };
  document.getElementById('btnDeactivateAll').onclick = async () => {
    await pywebview.api.set_all_keys_active(p.provider, false); loadProviders();
  };

  apiKeyList.innerHTML = '';
  if (!p.keys.length) {
    apiKeyList.innerHTML = '<div class="hint-text">No keys saved yet.</div>';
    return;
  }
  p.keys.forEach((k, idx) => {
    const card = keyCardTemplate.content.firstElementChild.cloneNode(true);
    card.classList.toggle('key-card-active', k.active);
    const maskedEl = card.querySelector('.key-masked');
    maskedEl.textContent = k.masked;
    card.querySelector('.key-active-pill').style.display = k.active ? '' : 'none';

    let shown = false;
    card.querySelector('.key-eye-btn').addEventListener('click', () => {
      shown = !shown;
      maskedEl.textContent = shown ? k.key : k.masked;
    });
    card.querySelector('.key-copy-btn').addEventListener('click', () => {
      navigator.clipboard.writeText(k.key);
    });
    const testBtn = card.querySelector('.key-test-btn');
    testBtn.addEventListener('click', async () => {
      testBtn.textContent = '⟳…';
      const res = await requestValidateKey(p.provider, k.key);
      testBtn.textContent = res.ok ? '✓ OK' : '✗ Bad';
    });

    const toggleBtn = card.querySelector('.key-toggle-btn');
    toggleBtn.textContent = k.active ? 'Deactivate' : 'Activate';
    toggleBtn.addEventListener('click', async () => {
      await pywebview.api.set_key_active(p.provider, idx, !k.active);
      loadProviders();
    });

    card.querySelector('.key-delete-btn').addEventListener('click', async () => {
      await pywebview.api.delete_api_key(p.provider, idx);
      loadProviders();
    });

    apiKeyList.appendChild(card);
  });
}

document.querySelector('[data-page="settings"]').addEventListener('click', loadProviders);
onPywebviewReady(loadProviders);
