import {
  getApiKey,
  setApiKey,
  getLanguagePreference,
  setLanguagePreference,
  getAllMappings,
  deleteCachedMapping,
  clearAllMappings,
} from '../lib/storage.js';

// ============================================================
// Helpers
// ============================================================

function setStatus(el, message, type /* 'success' | 'error' | 'loading' | '' */) {
  el.textContent = message;
  el.className = 'status-message';
  if (type) el.classList.add(type);
}

function clearStatusAfter(el, ms = 3000) {
  setTimeout(() => {
    el.textContent = '';
    el.className = 'status-message';
  }, ms);
}

function formatDate(isoString) {
  if (!isoString) return '—';
  try {
    return new Date(isoString).toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return isoString;
  }
}

// ============================================================
// API Key Section
// ============================================================

const apiKeyInput = document.getElementById('apiKeyInput');
const toggleApiKeyBtn = document.getElementById('toggleApiKey');
const saveApiKeyBtn = document.getElementById('saveApiKey');
const testApiKeyBtn = document.getElementById('testApiKey');
const apiKeyStatus = document.getElementById('apiKeyStatus');

async function loadApiKey() {
  const key = await getApiKey();
  if (key) {
    // Show a masked version — keep first 8 chars, rest as dots
    apiKeyInput.value = key;
    apiKeyInput.type = 'password';
  }
}

toggleApiKeyBtn.addEventListener('click', () => {
  const isPassword = apiKeyInput.type === 'password';
  apiKeyInput.type = isPassword ? 'text' : 'password';
  toggleApiKeyBtn.textContent = isPassword ? '🙈' : '👁️';
});

saveApiKeyBtn.addEventListener('click', async () => {
  const key = apiKeyInput.value.trim();
  if (!key) {
    setStatus(apiKeyStatus, '⚠️ कृपया API key दर्ज करें / Please enter an API key', 'error');
    clearStatusAfter(apiKeyStatus);
    return;
  }
  await setApiKey(key);
  setStatus(apiKeyStatus, '✅ सेव हो गया / Saved', 'success');
  clearStatusAfter(apiKeyStatus, 3000);
});

testApiKeyBtn.addEventListener('click', async () => {
  const key = apiKeyInput.value.trim();
  if (!key) {
    setStatus(apiKeyStatus, '⚠️ पहले API key दर्ज करें / Enter API key first', 'error');
    clearStatusAfter(apiKeyStatus);
    return;
  }

  setStatus(apiKeyStatus, '🔄 टेस्ट हो रहा है... / Testing...', 'loading');
  testApiKeyBtn.disabled = true;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`
    );

    if (response.ok) {
      setStatus(apiKeyStatus, '✅ API key सही है / API key is valid', 'success');
    } else {
      let errMsg = `HTTP ${response.status}`;
      try {
        const body = await response.json();
        errMsg = body?.error?.message ?? errMsg;
      } catch {
        // ignore parse error
      }
      setStatus(
        apiKeyStatus,
        `❌ API key गलत है / Invalid API key — ${errMsg}`,
        'error'
      );
    }
  } catch (err) {
    setStatus(
      apiKeyStatus,
      `❌ नेटवर्क त्रुटि / Network error — ${err.message}`,
      'error'
    );
  } finally {
    testApiKeyBtn.disabled = false;
    clearStatusAfter(apiKeyStatus, 5000);
  }
});

// ============================================================
// Language Section
// ============================================================

const languageStatus = document.getElementById('languageStatus');
const saveLanguageBtn = document.getElementById('saveLanguage');

async function loadLanguagePreference() {
  const lang = await getLanguagePreference(); // 'both' | 'hi' | 'en'
  const radios = document.querySelectorAll('input[name="language"]');
  for (const radio of radios) {
    radio.checked = radio.value === lang;
  }
}

saveLanguageBtn.addEventListener('click', async () => {
  const selected = document.querySelector('input[name="language"]:checked');
  if (!selected) return;
  await setLanguagePreference(selected.value);
  setStatus(languageStatus, '✅ सेव हो गया / Saved', 'success');
  clearStatusAfter(languageStatus, 3000);
});

// ============================================================
// Cached Mappings Section
// ============================================================

const mappingsCount = document.getElementById('mappingsCount');
const mappingsTableBody = document.getElementById('mappingsTableBody');
const clearAllBtn = document.getElementById('clearAllMappings');
const mappingsStatus = document.getElementById('mappingsStatus');

async function renderMappings() {
  const mappings = await getAllMappings();
  const entries = Object.entries(mappings);

  // Update count
  const count = entries.length;
  mappingsCount.textContent = `${count} मैपिंग कैश्ड / ${count} mappings cached`;

  // Render table rows
  if (count === 0) {
    mappingsTableBody.innerHTML = `
      <tr class="empty-row">
        <td colspan="3">कोई मैपिंग नहीं / No mappings cached</td>
      </tr>`;
    return;
  }

  // Sort by lastUsed descending
  entries.sort(([, a], [, b]) => {
    return new Date(b.lastUsed ?? 0) - new Date(a.lastUsed ?? 0);
  });

  mappingsTableBody.innerHTML = entries
    .map(([pattern, mapping]) => {
      const truncated =
        pattern.length > 50 ? pattern.slice(0, 50) + '…' : pattern;
      const dateStr = formatDate(mapping.lastUsed);
      // Escape pattern for use as data attribute
      const escaped = pattern.replace(/"/g, '&quot;');
      return `
        <tr>
          <td class="url-cell" title="${escaped}">${truncated}</td>
          <td class="date-cell">${dateStr}</td>
          <td>
            <button
              class="btn btn-sm btn-danger delete-mapping-btn"
              data-pattern="${escaped}"
            >🗑️ Delete</button>
          </td>
        </tr>`;
    })
    .join('');

  // Attach delete listeners
  mappingsTableBody.querySelectorAll('.delete-mapping-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const pattern = btn.dataset.pattern;
      await deleteCachedMapping(pattern);
      setStatus(mappingsStatus, '✅ मैपिंग मिटाई / Mapping deleted', 'success');
      clearStatusAfter(mappingsStatus, 2500);
      await renderMappings();
    });
  });
}

clearAllBtn.addEventListener('click', async () => {
  const confirmed = window.confirm(
    'क्या आप सभी कैश्ड मैपिंग मिटाना चाहते हैं?\nAre you sure you want to clear all cached mappings?'
  );
  if (!confirmed) return;
  await clearAllMappings();
  setStatus(mappingsStatus, '✅ सभी मैपिंग मिटाई / All mappings cleared', 'success');
  clearStatusAfter(mappingsStatus, 3000);
  await renderMappings();
});

// ============================================================
// Back Link
// ============================================================

document.getElementById('backLink').addEventListener('click', (e) => {
  e.preventDefault();
  // Try to close the tab / go back; if opened as options page, window.close() works.
  if (window.opener) {
    window.close();
  } else {
    window.close();
  }
});

// ============================================================
// Init
// ============================================================

async function init() {
  await Promise.all([
    loadApiKey(),
    loadLanguagePreference(),
    renderMappings(),
  ]);
}

init();
