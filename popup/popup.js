import { applyLanguage, getText, getBilingual } from '../lib/i18n.js';
import { getApiKey, getSessionData, setSessionData, clearSessionData } from '../lib/storage.js';

// ========== State ==========
let uploadedImages = []; // [{base64, mimeType, documentType, name}]
let currentLang = 'both'; // 'both' | 'hi' | 'en'
let lastScanResult = null; // {fieldDescriptors, mappings, extractedData}
let pickModeStartTime = 0;
let pickModePollingInterval = null;

// ========== DOM References ==========
const fileInput       = document.getElementById('fileInput');
const uploadBtn       = document.getElementById('uploadBtn');
const extractBtn      = document.getElementById('extractBtn');
const extractBtnText  = document.getElementById('extractBtnText');
const extractBtnSpinner = document.getElementById('extractBtnSpinner');
const thumbnailStrip  = document.getElementById('thumbnailStrip');
const step2           = document.getElementById('step2');
const step3           = document.getElementById('step3');
const reviewTableBody = document.getElementById('reviewTableBody');
const addFieldBtn     = document.getElementById('addFieldBtn');
const fillBtn         = document.getElementById('fillBtn');
const fillBtnText     = document.getElementById('fillBtnText');
const fillBtnSpinner  = document.getElementById('fillBtnSpinner');
const fillStatus      = document.getElementById('fillStatus');
const clearBtn        = document.getElementById('clearBtn');
const settingsBtn     = document.getElementById('settingsBtn');
const langToggle      = document.getElementById('langToggle');
const langLabel       = document.getElementById('langLabel');
const stepConnectors  = document.querySelectorAll('.step-connector');
// Phase 7 mapping review elements
const mappingSection      = document.getElementById('mappingSection');
const toggleMappingBtn    = document.getElementById('toggleMappingBtn');
const toggleMappingIcon   = document.getElementById('toggleMappingIcon');
const mappingContent      = document.getElementById('mappingContent');
const mappingTableBody    = document.getElementById('mappingTableBody');
const refillBtn           = document.getElementById('refillBtn');
const addMissingFieldBtn  = document.getElementById('addMissingFieldBtn');
const pickModeBanner      = document.getElementById('pickModeBanner');
const cancelPickBtn       = document.getElementById('cancelPickBtn');
const statusArea      = document.getElementById('statusArea');
const prevDataBanner  = document.getElementById('prevDataBanner');
const prevDataName    = document.getElementById('prevDataName');
const usePrevDataBtn  = document.getElementById('usePrevDataBtn');
const discardPrevBtn  = document.getElementById('discardPrevBtn');

// ========== Step Indicator ==========
function updateStepIndicator(step) {
  document.querySelectorAll('.step-dot').forEach((dot, i) => {
    dot.classList.remove('active', 'done');
    if (i + 1 < step) dot.classList.add('done');
    else if (i + 1 === step) dot.classList.add('active');
  });
  document.querySelectorAll('.step-line').forEach((line, i) => {
    line.classList.toggle('done', i + 1 < step);
  });
}

// ========== Offline Detection ==========
function checkOnlineStatus() {
  const banner = document.getElementById('offlineBanner');
  if (!navigator.onLine) {
    banner?.classList.add('show');
  } else {
    banner?.classList.remove('show');
  }
}
window.addEventListener('online', checkOnlineStatus);
window.addEventListener('offline', checkOnlineStatus);
checkOnlineStatus();

// ========== Retry Button ==========
function showRetryButton(action) {
  // Remove any existing retry button
  const existing = statusArea.querySelector('.retry-btn');
  if (existing) existing.remove();

  const retryBtn = document.createElement('button');
  retryBtn.className = 'btn btn-secondary btn-sm retry-btn';
  retryBtn.style.marginTop = '6px';
  retryBtn.textContent = 'पुनः प्रयास करें / Retry';
  retryBtn.onclick = action;
  statusArea.appendChild(retryBtn);
}

// ========== Field Count Badge ==========
function showFieldCount(count) {
  const badge = document.getElementById('fieldCountBadge');
  if (badge && count > 0) {
    badge.textContent = `${count} fields`;
    badge.style.display = 'inline-block';
  }
}

// ========== Language Toggle ==========
const langCycle = ['both', 'hi', 'en'];
const langLabels = { both: 'हि/En', hi: 'हि', en: 'En' };

function setLanguage(lang) {
  currentLang = lang;
  langLabel.textContent = langLabels[lang];
  applyLanguage(lang);
  chrome.storage.local.set({ language: lang });
}

langToggle.addEventListener('click', () => {
  const nextIndex = (langCycle.indexOf(currentLang) + 1) % langCycle.length;
  setLanguage(langCycle[nextIndex]);
});

// ========== Image Upload ==========
uploadBtn.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', (e) => {
  const files = Array.from(e.target.files);
  if (!files.length) return;

  files.forEach(file => {
    const isPdf = file.type === 'application/pdf';
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target.result;
      const base64 = dataUrl.split(',')[1];
      const mimeType = isPdf ? 'application/pdf' : (file.type || 'image/jpeg');

      const imgObj = {
        base64,
        mimeType,
        documentType: 'aadhaar',
        name: file.name,
        dataUrl: isPdf ? null : dataUrl, // PDFs have no image preview
        isPdf,
      };
      uploadedImages.push(imgObj);
      renderThumbnails();
      updateExtractBtn();
    };
    reader.readAsDataURL(file);
  });

  // Reset input so same files can be re-selected if needed
  fileInput.value = '';
});

function renderThumbnails() {
  thumbnailStrip.innerHTML = '';

  uploadedImages.forEach((img, idx) => {
    const item = document.createElement('div');
    item.className = 'thumbnail-item';

    let imgEl;
    if (img.isPdf) {
      imgEl = document.createElement('div');
      imgEl.className = 'thumbnail-img thumbnail-pdf';
      imgEl.title = img.name;
      imgEl.innerHTML = '📄<span class="pdf-label">PDF</span>';
    } else {
      imgEl = document.createElement('img');
      imgEl.src = img.dataUrl;
      imgEl.className = 'thumbnail-img';
      imgEl.alt = img.name;
    }

    const removeBtn = document.createElement('button');
    removeBtn.className = 'thumbnail-remove';
    removeBtn.innerHTML = '✕';
    removeBtn.title = 'हटाएं / Remove';
    removeBtn.addEventListener('click', () => {
      uploadedImages.splice(idx, 1);
      renderThumbnails();
      updateExtractBtn();
    });

    const typeSelect = document.createElement('select');
    typeSelect.className = 'thumbnail-type';
    const docTypes = [
      { value: 'aadhaar',   labelKey: 'docAadhaar' },
      { value: 'pan',       labelKey: 'docPan' },
      { value: 'marksheet', labelKey: 'docMarksheet' },
      { value: 'voter_id',  labelKey: 'docVoterId' },
      { value: 'other',     labelKey: 'docOther' },
    ];
    docTypes.forEach(dt => {
      const opt = document.createElement('option');
      opt.value = dt.value;
      opt.textContent = getBilingual(dt.labelKey);
      if (dt.value === img.documentType) opt.selected = true;
      typeSelect.appendChild(opt);
    });
    typeSelect.addEventListener('change', (e) => {
      uploadedImages[idx].documentType = e.target.value;
    });

    item.appendChild(imgEl);
    item.appendChild(removeBtn);
    item.appendChild(typeSelect);
    thumbnailStrip.appendChild(item);
  });

  thumbnailStrip.style.display = uploadedImages.length > 0 ? 'flex' : 'none';
}

function updateExtractBtn() {
  extractBtn.disabled = uploadedImages.length === 0;
}

// ========== Status Area ==========
function showStatus(message, type = 'info') {
  statusArea.textContent = message;
  statusArea.className = `status status-${type}`;
  statusArea.style.display = 'block';
}

function hideStatus() {
  statusArea.style.display = 'none';
}

// ========== Extract Button Loading State ==========
function setExtractBtnLoading(loading) {
  extractBtn.disabled = loading;
  extractBtnSpinner.style.display = loading ? 'inline-block' : 'none';
  extractBtnText.textContent = loading
    ? getBilingual('extracting')
    : getBilingual('extractBtn');
}

// ========== Image Preprocessing ==========
async function preprocessImage(file) {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.onload = () => {
      // Resize to max 1500px on longest side
      const maxSize = 1500;
      let { width, height } = img;
      if (width > maxSize || height > maxSize) {
        if (width > height) {
          height = Math.round(height * maxSize / width);
          width = maxSize;
        } else {
          width = Math.round(width * maxSize / height);
          height = maxSize;
        }
      }
      canvas.width = width;
      canvas.height = height;
      ctx.drawImage(img, 0, 0, width, height);
      // Convert to JPEG base64 (strip data URL prefix)
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      const base64 = dataUrl.split(',')[1];
      resolve({ base64, mimeType: 'image/jpeg' });
    };
    img.src = URL.createObjectURL(file);
  });
}

// ========== Error Message Lookup ==========
function getErrorMessage(errorCode) {
  const messages = {
    'NO_API_KEY': getBilingual('noApiKey'),
    'INVALID_API_KEY': getBilingual('invalidKey'),
    'RATE_LIMIT': 'Rate limit exceeded. Please wait a moment.',
    'NETWORK_ERROR': getBilingual('networkError'),
    'PARSE_ERROR': 'Could not parse AI response. Please try again.',
    'EMPTY_RESPONSE': 'AI returned empty response. Please try again.',
  };
  return messages[errorCode] || `Error: ${errorCode}`;
}

// ========== Extract Data ==========
async function handleExtractData() {
  if (uploadedImages.length === 0) {
    showStatus(getBilingual('noImages'), 'warning');
    return;
  }

  // Check API key first
  const apiKey = await getApiKey();
  if (!apiKey) {
    showStatus(getBilingual('noApiKey'), 'error');
    return;
  }

  setExtractBtnLoading(true);
  showStatus(getBilingual('extracting'), 'loading');

  try {
    // Collect processed images from state (already base64 from FileReader)
    // PDFs are sent as-is; images are sent as-is (already resized on upload if needed)
    const processedImages = uploadedImages.map(img => ({
      base64: img.base64,
      mimeType: img.mimeType,
      documentType: img.documentType,
      isPdf: img.isPdf || false,
    }));

    const response = await chrome.runtime.sendMessage({
      action: 'extractData',
      images: processedImages,
    });

    if (response.success) {
      // Save to session storage
      await setSessionData(response.data);
      // Render review table
      renderReviewTable(response.data);
      showStatus(`✅ ${Object.keys(response.data).length} fields extracted`, 'success');
    } else {
      const errorMsg = getErrorMessage(response.errorType || response.error);
      showStatus(errorMsg, 'error');
      showRetryButton(handleExtractData);
    }
  } catch (e) {
    showStatus(getBilingual('networkError'), 'error');
    showRetryButton(handleExtractData);
  } finally {
    setExtractBtnLoading(false);
  }
}

extractBtn.addEventListener('click', handleExtractData);

// ========== Previous Data Banner ==========
function showPrevDataBanner(sessionData) {
  const name = sessionData.full_name || sessionData.full_name_hindi || '';
  if (prevDataName && name) prevDataName.textContent = ` — ${name}`;
  prevDataBanner.style.display = 'flex';

  usePrevDataBtn.addEventListener('click', () => {
    prevDataBanner.style.display = 'none';
    renderReviewTable(sessionData);
    showStatus(`✅ ${Object.keys(sessionData).length} fields loaded from previous session`, 'success');
  }, { once: true });

  discardPrevBtn.addEventListener('click', async () => {
    prevDataBanner.style.display = 'none';
    await clearSessionData();
  }, { once: true });
}

// ========== Review Table ==========
/**
 * Renders the review table from a data object {fieldName: value, ...}
 */
export function renderReviewTable(data) {
  reviewTableBody.innerHTML = '';
  Object.entries(data).forEach(([field, value]) => {
    addReviewRow(field, value);
  });
  showStep2();
}

function addReviewRow(fieldName = '', value = '') {
  const tr = document.createElement('tr');

  const tdField = document.createElement('td');
  const fieldInput = document.createElement('input');
  fieldInput.type = 'text';
  fieldInput.className = 'field-name-input';
  fieldInput.value = fieldName;
  fieldInput.placeholder = 'Field / फ़ील्ड';
  tdField.appendChild(fieldInput);

  const tdValue = document.createElement('td');
  const valueInput = document.createElement('input');
  valueInput.type = 'text';
  valueInput.className = 'field-value-input';
  valueInput.value = value;
  valueInput.placeholder = 'Value / मान';
  tdValue.appendChild(valueInput);

  const tdAction = document.createElement('td');
  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'row-delete-btn';
  deleteBtn.innerHTML = '🗑';
  deleteBtn.title = 'हटाएं / Remove row';
  deleteBtn.addEventListener('click', () => {
    tr.remove();
    if (reviewTableBody.rows.length === 0) {
      // Hide step 2 and 3 if no rows left
    }
  });
  tdAction.appendChild(deleteBtn);

  tr.appendChild(tdField);
  tr.appendChild(tdValue);
  tr.appendChild(tdAction);
  reviewTableBody.appendChild(tr);
}

/**
 * Returns current table data as an object
 */
export function getReviewData() {
  const data = {};
  const rows = reviewTableBody.querySelectorAll('tr');
  rows.forEach(row => {
    const inputs = row.querySelectorAll('input');
    const key = inputs[0]?.value.trim();
    const val = inputs[1]?.value.trim();
    if (key) data[key] = val || '';
  });
  return data;
}

addFieldBtn.addEventListener('click', () => {
  addReviewRow('', '');
  // Focus the new row's field input
  const lastRow = reviewTableBody.lastElementChild;
  if (lastRow) lastRow.querySelector('.field-name-input')?.focus();
});

// ========== Step Visibility ==========
function showStep2() {
  step2.style.display = 'block';
  document.querySelector('.step-connector').style.display = 'block';
  updateStepIndicator(2);
  showStep3();
}

function showStep3() {
  step3.style.display = 'block';
  document.querySelector('.step-connector-2').style.display = 'block';
}

// ========== Fill Form ==========

function setFillBtnLoading(loading) {
  fillBtn.disabled = loading;
  fillBtnSpinner.style.display = loading ? 'inline-block' : 'none';
  fillBtnText.textContent = loading
    ? 'फ़ील्ड स्कैन हो रहे हैं... / Scanning fields...'
    : getBilingual('fillBtn');
}

async function handleFillForm() {
  // 1. Get current review table data (latest edits included)
  const extractedData = getReviewData();

  // 2. Guard: must have data
  if (!extractedData || Object.keys(extractedData).length === 0) {
    showFillStatus('❌ डेटा नहीं मिला / No data found. Please extract data first.', 'error');
    return;
  }

  setFillBtnLoading(true);
  updateStepIndicator(3);
  showFillStatus('फ़ील्ड स्कैन हो रहे हैं... / Scanning fields...', 'loading');

  // 3. After 1 second, if still waiting, update status to mapping message
  const mappingStatusTimer = setTimeout(() => {
    if (fillBtn.disabled) {
      fillBtnText.textContent = 'मैपिंग हो रही है... / Mapping fields...';
      showFillStatus('मैपिंग हो रही है... / Mapping fields...', 'loading');
    }
  }, 1000);

  try {
    const response = await chrome.runtime.sendMessage({
      action: 'scanAndFill',
      data: extractedData,
    });

    clearTimeout(mappingStatusTimer);

    if (!response) {
      showFillStatus('❌ कोई प्रतिक्रिया नहीं / No response from extension. Please try again.', 'error');
      return;
    }

    if (!response.success) {
      if (response.error === 'NO_FORM') {
        showFillStatus('❌ इस पेज पर कोई फॉर्म नहीं मिला / No form found on this page', 'error');
      } else if (response.error === 'NO_API_KEY') {
        showFillStatus(getBilingual('noApiKey'), 'error');
      } else {
        showFillStatus(`❌ ${response.error || 'Something went wrong'}`, 'error');
      }
      showRetryButton(handleFillForm);
      return;
    }

    const { filled = 0, total = 0, cacheHit = false, fieldCount = 0 } = response;

    if (fieldCount > 0) showFieldCount(fieldCount);

    if (cacheHit) {
      showFillStatus(
        `✅ कैश से मैपिंग मिली / Mapping from cache — ${filled}/${total} fields filled`,
        'success'
      );
    } else {
      showFillStatus(
        `✅ ${filled}/${total} फ़ील्ड भरे गए / fields filled`,
        'success'
      );
    }

    // Store last scan result and render mapping table
    if (response.mappings && response.fieldDescriptors) {
      lastScanResult = {
        fieldDescriptors: response.fieldDescriptors,
        mappings: response.mappings,
        extractedData: extractedData,
      };
      renderMappingTable(response.fieldDescriptors, response.mappings, extractedData);
      mappingSection.style.display = 'block';
    }
  } catch (e) {
    clearTimeout(mappingStatusTimer);
    showFillStatus(getBilingual('networkError'), 'error');
    showRetryButton(handleFillForm);
  } finally {
    setFillBtnLoading(false);
  }
}

fillBtn.addEventListener('click', handleFillForm);

// ========== Phase 7: Mapping Toggle ==========
toggleMappingBtn.addEventListener('click', () => {
  const isOpen = mappingContent.style.display !== 'none';
  mappingContent.style.display = isOpen ? 'none' : 'block';
  toggleMappingIcon.classList.toggle('open', !isOpen);
});

// ========== Phase 7: Render Mapping Table ==========
function renderMappingTable(fieldDescriptors, mappings, extractedData) {
  mappingTableBody.innerHTML = '';

  const dataKeys = Object.keys(extractedData || {});

  for (const mapping of mappings) {
    const { selector, value } = mapping;

    // Find the matching field descriptor for label
    const descriptor = fieldDescriptors.find(d => d.selector === selector) || {};
    const rawLabel = descriptor.label || descriptor.nearbyText || descriptor.name || selector;
    const fieldLabel = rawLabel.length > 30 ? rawLabel.slice(0, 30) + '…' : rawLabel;

    // Reverse-lookup: which extractedData key produced this value?
    let matchedKey = '__custom__';
    for (const [key, dataVal] of Object.entries(extractedData || {})) {
      if (String(dataVal) === String(value)) {
        matchedKey = key;
        break;
      }
    }

    const tr = document.createElement('tr');
    tr.dataset.selector = selector;

    // Col 1: field label
    const tdLabel = document.createElement('td');
    const labelSpan = document.createElement('span');
    labelSpan.className = 'field-label';
    labelSpan.title = rawLabel;
    labelSpan.textContent = fieldLabel;
    tdLabel.appendChild(labelSpan);

    // Col 2: data key dropdown
    const tdData = document.createElement('td');
    const dataSelect = document.createElement('select');
    dataSelect.className = 'data-key-select';
    // Add all extracted data keys
    for (const key of dataKeys) {
      const opt = document.createElement('option');
      opt.value = key;
      opt.textContent = key;
      if (key === matchedKey) opt.selected = true;
      dataSelect.appendChild(opt);
    }
    // Add "Custom..." option
    const customOpt = document.createElement('option');
    customOpt.value = '__custom__';
    customOpt.textContent = 'Custom... / कस्टम';
    if (matchedKey === '__custom__') customOpt.selected = true;
    dataSelect.appendChild(customOpt);
    tdData.appendChild(dataSelect);

    // Col 3: value input
    const tdValue = document.createElement('td');
    const valueInput = document.createElement('input');
    valueInput.type = 'text';
    valueInput.value = value;
    valueInput.dataset.customValue = value; // remember original for custom mode
    tdValue.appendChild(valueInput);

    // When dropdown changes, update the value input
    dataSelect.addEventListener('change', () => {
      if (dataSelect.value === '__custom__') {
        valueInput.value = valueInput.dataset.customValue || '';
        valueInput.focus();
      } else {
        const newVal = String(extractedData[dataSelect.value] ?? '');
        valueInput.dataset.customValue = newVal;
        valueInput.value = newVal;
      }
    });

    // Track custom edits
    valueInput.addEventListener('input', () => {
      valueInput.dataset.customValue = valueInput.value;
    });

    // Col 4: highlight button
    const tdHighlight = document.createElement('td');
    const highlightBtn = document.createElement('button');
    highlightBtn.className = 'highlight-btn';
    highlightBtn.title = 'पेज पर दिखाएं / Highlight on page';
    highlightBtn.textContent = '🔍';
    highlightBtn.addEventListener('click', () => {
      chrome.runtime.sendMessage({ action: 'highlightField', selector });
    });
    tdHighlight.appendChild(highlightBtn);

    tr.appendChild(tdLabel);
    tr.appendChild(tdData);
    tr.appendChild(tdValue);
    tr.appendChild(tdHighlight);
    mappingTableBody.appendChild(tr);
  }
}

// Add a picked field row to the mapping table
function addPickedFieldToMappingTable(descriptor) {
  if (!lastScanResult) return;
  const { extractedData } = lastScanResult;
  const dataKeys = Object.keys(extractedData || {});

  const selector = descriptor.selector || '';
  const rawLabel = descriptor.label || descriptor.placeholder || descriptor.name || selector;
  const fieldLabel = rawLabel.length > 30 ? rawLabel.slice(0, 30) + '…' : rawLabel;

  const tr = document.createElement('tr');
  tr.dataset.selector = selector;

  const tdLabel = document.createElement('td');
  const labelSpan = document.createElement('span');
  labelSpan.className = 'field-label';
  labelSpan.title = rawLabel;
  labelSpan.textContent = fieldLabel;
  tdLabel.appendChild(labelSpan);

  const tdData = document.createElement('td');
  const dataSelect = document.createElement('select');
  dataSelect.className = 'data-key-select';
  for (const key of dataKeys) {
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = key;
    dataSelect.appendChild(opt);
  }
  const customOpt = document.createElement('option');
  customOpt.value = '__custom__';
  customOpt.textContent = 'Custom... / कस्टम';
  dataSelect.appendChild(customOpt);
  tdData.appendChild(dataSelect);

  const tdValue = document.createElement('td');
  const valueInput = document.createElement('input');
  valueInput.type = 'text';
  valueInput.value = '';
  valueInput.dataset.customValue = '';
  tdValue.appendChild(valueInput);

  dataSelect.addEventListener('change', () => {
    if (dataSelect.value !== '__custom__') {
      const newVal = String(extractedData[dataSelect.value] ?? '');
      valueInput.dataset.customValue = newVal;
      valueInput.value = newVal;
    }
  });
  valueInput.addEventListener('input', () => {
    valueInput.dataset.customValue = valueInput.value;
  });

  const tdHighlight = document.createElement('td');
  const highlightBtn = document.createElement('button');
  highlightBtn.className = 'highlight-btn';
  highlightBtn.title = 'पेज पर दिखाएं / Highlight on page';
  highlightBtn.textContent = '🔍';
  highlightBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'highlightField', selector });
  });
  tdHighlight.appendChild(highlightBtn);

  tr.appendChild(tdLabel);
  tr.appendChild(tdData);
  tr.appendChild(tdValue);
  tr.appendChild(tdHighlight);
  mappingTableBody.appendChild(tr);
}

// ========== Phase 7: Re-fill with corrections ==========
refillBtn.addEventListener('click', handleRefill);

async function handleRefill() {
  if (!lastScanResult) {
    showFillStatus('❌ पहले फॉर्म भरें / Please fill the form first.', 'error');
    return;
  }

  // Build corrected mappings from table rows
  const rows = mappingTableBody.querySelectorAll('tr');
  const mappings = [];
  rows.forEach(row => {
    const selector = row.dataset.selector;
    if (!selector) return;
    const valueInput = row.querySelector('input[type="text"]');
    const value = valueInput ? valueInput.value.trim() : '';
    if (selector && value !== '') {
      mappings.push({ selector, value });
    }
  });

  if (mappings.length === 0) {
    showFillStatus('❌ कोई मैपिंग नहीं / No mappings to fill.', 'error');
    return;
  }

  refillBtn.disabled = true;
  showFillStatus('दोबारा भरा जा रहा है... / Re-filling...', 'info');

  try {
    const response = await chrome.runtime.sendMessage({
      action: 'refillWithMapping',
      mappings,
      urlPattern: lastScanResult.urlPattern || null,
    });

    if (response && response.success) {
      const { filled = 0, total = 0 } = response;
      showFillStatus(`✅ ${filled}/${total} फ़ील्ड दोबारा भरे / fields re-filled`, 'success');
      // Update stored mappings
      lastScanResult.mappings = mappings;
    } else {
      showFillStatus(`❌ ${(response && response.error) || 'Re-fill failed'}`, 'error');
    }
  } catch (e) {
    showFillStatus('❌ नेटवर्क त्रुटि / Network error', 'error');
  } finally {
    refillBtn.disabled = false;
  }
}

// ========== Phase 7: Pick Mode ==========
addMissingFieldBtn.addEventListener('click', async () => {
  pickModeBanner.style.display = 'flex';
  pickModeStartTime = Date.now();

  try {
    await chrome.runtime.sendMessage({ action: 'startPickMode' });
  } catch (e) {
    pickModeBanner.style.display = 'none';
    showFillStatus('❌ पिक मोड शुरू नहीं हुआ / Could not start pick mode', 'error');
    return;
  }

  pollForPickedField();
});

cancelPickBtn.addEventListener('click', async () => {
  stopPickMode();
  try {
    await chrome.runtime.sendMessage({ action: 'cancelPickMode' });
  } catch (e) { /* ignore */ }
});

function stopPickMode() {
  pickModeBanner.style.display = 'none';
  if (pickModePollingInterval) {
    clearInterval(pickModePollingInterval);
    pickModePollingInterval = null;
  }
}

function pollForPickedField() {
  // Stop any existing polling
  if (pickModePollingInterval) clearInterval(pickModePollingInterval);

  const startTime = pickModeStartTime;

  pickModePollingInterval = setInterval(async () => {
    try {
      const result = await chrome.storage.session.get(['pickedField', 'pickedAt']);
      if (result.pickedField && result.pickedAt > startTime) {
        clearInterval(pickModePollingInterval);
        pickModePollingInterval = null;
        await chrome.storage.session.remove(['pickedField', 'pickedAt']);
        addPickedFieldToMappingTable(result.pickedField);
        stopPickMode();
        // Ensure mapping section and content are visible
        mappingSection.style.display = 'block';
        mappingContent.style.display = 'block';
        toggleMappingIcon.classList.add('open');
      }
    } catch (e) { /* ignore */ }
  }, 500);

  // Stop polling after 30 seconds
  setTimeout(() => {
    if (pickModePollingInterval) {
      clearInterval(pickModePollingInterval);
      pickModePollingInterval = null;
      stopPickMode();
    }
  }, 30000);
}

// ========== Show Fill Status ==========
export function showFillStatus(message, type = 'info') {
  fillStatus.textContent = message;
  fillStatus.className = `fill-status status-${type}`;
  fillStatus.style.display = 'flex';
}

// ========== Clear Data ==========
clearBtn.addEventListener('click', async () => {
  uploadedImages = [];
  renderThumbnails();
  reviewTableBody.innerHTML = '';
  step2.style.display = 'none';
  step3.style.display = 'none';
  document.querySelector('.step-connector').style.display = 'none';
  document.querySelector('.step-connector-2').style.display = 'none';
  fillStatus.style.display = 'none';
  prevDataBanner.style.display = 'none';
  // Reset mapping section
  mappingSection.style.display = 'none';
  mappingContent.style.display = 'none';
  toggleMappingIcon.classList.remove('open');
  mappingTableBody.innerHTML = '';
  lastScanResult = null;
  stopPickMode();
  hideStatus();
  updateExtractBtn();
  await clearSessionData();
});

// ========== Settings ==========
settingsBtn.addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

// ========== Init ==========
(async () => {
  // Load saved language preference
  chrome.storage.local.get(['language'], (result) => {
    const savedLang = result.language || 'both';
    setLanguage(savedLang);
  });

  // Check for previous session data and show banner if present
  const sessionData = await getSessionData();
  if (sessionData && Object.keys(sessionData).length > 0) {
    showPrevDataBanner(sessionData);
  }
})();
