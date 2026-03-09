// FillForm Service Worker
import { getApiKey, getCachedMapping, setCachedMapping } from '../lib/storage.js';
import { extractDataFromImages, mapFieldsToData } from '../lib/gemini.js';
import { normalizeUrl } from '../lib/url-pattern.js';

// ========== Cache Helpers ==========

/**
 * Check whether a cached mapping is still valid for the current page.
 * Valid = at least 80% of cached selectors are still present on the page.
 */
function isCacheValid(cachedMapping, currentFields) {
  const currentSelectors = new Set(currentFields.map(f => f.selector));
  const cachedSelectors = cachedMapping.fieldStructure || [];
  if (cachedSelectors.length === 0) return false;

  const matches = cachedSelectors.filter(s => currentSelectors.has(s)).length;
  return (matches / cachedSelectors.length) >= 0.8;
}

/**
 * Build fill instructions from a cached dataKeyMapping + current extracted data.
 * No LLM call needed.
 */
function buildFillInstructionsFromCache(cachedMapping, extractedData) {
  const mappings = [];
  for (const [selector, dataKey] of Object.entries(cachedMapping.dataKeyMapping)) {
    if (extractedData[dataKey] !== undefined) {
      mappings.push({ selector, value: String(extractedData[dataKey]) });
    }
  }
  return mappings;
}

/**
 * Reverse-lookup: for each fill instruction, find which extractedData key produced that value.
 * This is stored in the cache so future visits can skip the LLM call.
 */
function buildDataKeyMapping(fillInstructions, extractedData) {
  const dataKeyMapping = {};
  for (const { selector, value } of fillInstructions) {
    for (const [key, dataValue] of Object.entries(extractedData)) {
      const strVal = String(dataValue);
      if (strVal === value || strVal.includes(value) || value.includes(strVal)) {
        dataKeyMapping[selector] = key;
        break;
      }
    }
  }
  return dataKeyMapping;
}

// ========== Lifecycle ==========

chrome.runtime.onInstalled.addListener((details) => {
  console.log('FillForm installed', details.reason);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const { action } = message;

  if (action === 'extractData') {
    (async () => {
      try {
        const apiKey = await getApiKey();
        if (!apiKey) {
          sendResponse({ success: false, error: 'NO_API_KEY' });
          return;
        }

        const extractedData = await extractDataFromImages(apiKey, message.images);
        sendResponse({ success: true, data: extractedData });
      } catch (err) {
        sendResponse({
          success: false,
          error: err.message,
          errorType: err.code || 'UNKNOWN_ERROR',
        });
      }
    })();
    return true; // keep channel open for async sendResponse
  }

  if (action === 'scanFields') {
    // Relay to active tab's content script
    (async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) {
        sendResponse({ success: false, error: 'No active tab found' });
        return;
      }
      try {
        const result = await chrome.tabs.sendMessage(tab.id, { action: 'scanFields' });
        sendResponse(result);
      } catch (e) {
        sendResponse({ success: false, error: 'Content script not ready. Please refresh the page.' });
      }
    })();
    return true;
  }

  if (action === 'scanAndFill') {
    (async () => {
      // 1. Get active tab
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) {
        sendResponse({ success: false, error: 'No active tab found' });
        return;
      }

      // 2. Scan form fields via content script
      let scanResult;
      try {
        scanResult = await chrome.tabs.sendMessage(tab.id, { action: 'scanFields' });
      } catch (e) {
        sendResponse({ success: false, error: 'Content script not ready. Please refresh the page.' });
        return;
      }

      if (!scanResult || !scanResult.success) {
        sendResponse(scanResult || { success: false, error: 'Scan failed' });
        return;
      }

      // 3. Check for form fields
      const fieldDescriptors = scanResult.fields || [];
      if (fieldDescriptors.length === 0) {
        sendResponse({ success: false, error: 'NO_FORM' });
        return;
      }

      const extractedData = message.data || {};

      // 4. Get API key
      const apiKey = await getApiKey();
      if (!apiKey) {
        sendResponse({ success: false, error: 'NO_API_KEY' });
        return;
      }

      // 5. Normalize URL and check cache
      const urlPattern = normalizeUrl(tab.url);
      const cachedMapping = await getCachedMapping(urlPattern);

      let fillInstructions;
      let cacheHit = false;

      if (cachedMapping && isCacheValid(cachedMapping, fieldDescriptors)) {
        // 6a. Cache hit — build fill instructions without LLM call
        fillInstructions = buildFillInstructionsFromCache(cachedMapping, extractedData);
        cacheHit = true;
      } else {
        // 6b. Cache miss — call Gemini for mapping
        try {
          fillInstructions = await mapFieldsToData(apiKey, extractedData, fieldDescriptors);
        } catch (err) {
          sendResponse({
            success: false,
            error: err.message,
            errorType: err.code || 'MAPPING_ERROR',
          });
          return;
        }

        // Build and store the dataKeyMapping for future cache hits
        const dataKeyMapping = buildDataKeyMapping(fillInstructions, extractedData);
        const fieldStructure = fieldDescriptors.map(f => f.selector);
        await setCachedMapping(urlPattern, {
          urlPattern,
          fieldStructure,
          dataKeyMapping,
        });
        cacheHit = false;
      }

      // 7. Send fill instructions to content script
      let fillResult;
      try {
        fillResult = await chrome.tabs.sendMessage(tab.id, {
          action: 'fillFields',
          mappings: fillInstructions,
        });
      } catch (e) {
        sendResponse({ success: false, error: 'Filler not ready. Please refresh the page.' });
        return;
      }

      if (!fillResult || !fillResult.success) {
        sendResponse({ success: false, error: (fillResult && fillResult.error) || 'Fill failed' });
        return;
      }

      let totalFilled = fillResult.filled || 0;
      let totalFailed = fillResult.failed || 0;

      // 8. Second pass for cascading/dynamic fields
      //    If significantly more fields appeared after the first fill, re-scan and fill new ones.
      const newFieldCount = fillResult.newFieldCount || 0;
      if (newFieldCount >= fieldDescriptors.length + 3) {
        try {
          const reScan = await chrome.tabs.sendMessage(tab.id, { action: 'scanFields' });
          if (reScan.success && reScan.fields.length > fieldDescriptors.length) {
            const knownSelectors = new Set(fieldDescriptors.map(f => f.selector));
            const newFields = reScan.fields.filter(f => !knownSelectors.has(f.selector));

            if (newFields.length > 0) {
              const newMappings = await mapFieldsToData(apiKey, extractedData, newFields);
              if (newMappings && newMappings.length > 0) {
                const reFill = await chrome.tabs.sendMessage(tab.id, {
                  action: 'fillFields',
                  mappings: newMappings,
                });
                if (reFill && reFill.success) {
                  totalFilled += reFill.filled || 0;
                  totalFailed += reFill.failed || 0;
                }
              }
            }
          }
        } catch (secondPassErr) {
          // Second pass is best-effort; don't fail the whole operation
          console.warn('FillForm: second pass error', secondPassErr.message);
        }
      }

      sendResponse({
        success: true,
        filled: totalFilled,
        failed: totalFailed,
        total: fillInstructions.length,
        fieldCount: fieldDescriptors.length,
        cacheHit,
        mappings: fillInstructions,
        fieldDescriptors,
        urlPattern,
      });
    })();
    return true;
  }

  if (action === 'refillWithMapping') {
    (async () => {
      const { mappings, urlPattern } = message;
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) {
        sendResponse({ success: false, error: 'No active tab found' });
        return;
      }

      let fillResult;
      try {
        fillResult = await chrome.tabs.sendMessage(tab.id, { action: 'fillFields', mappings });
      } catch (e) {
        sendResponse({ success: false, error: 'Filler not ready. Please refresh the page.' });
        return;
      }

      if (!fillResult || !fillResult.success) {
        sendResponse({ success: false, error: (fillResult && fillResult.error) || 'Fill failed' });
        return;
      }

      // Update cache with manually-corrected mapping
      if (urlPattern) {
        try {
          const existing = await getCachedMapping(urlPattern);
          await setCachedMapping(urlPattern, {
            ...(existing || {}),
            fieldStructure: mappings.map(m => m.selector),
            manuallyCorrect: mappings,
            lastUsed: new Date().toISOString(),
          });
        } catch (e) {
          console.warn('FillForm: cache update error', e.message);
        }
      }

      sendResponse({ success: true, filled: fillResult.filled || 0, total: fillResult.total || mappings.length });
    })();
    return true;
  }

  if (action === 'highlightField') {
    (async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) {
        sendResponse({ success: false, error: 'No active tab found' });
        return;
      }
      try {
        const result = await chrome.tabs.sendMessage(tab.id, { action: 'highlightField', selector: message.selector });
        sendResponse(result);
      } catch (e) {
        sendResponse({ success: false, error: e.message });
      }
    })();
    return true;
  }

  if (action === 'startPickMode') {
    (async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) {
        sendResponse({ success: false, error: 'No active tab found' });
        return;
      }
      try {
        await chrome.tabs.sendMessage(tab.id, { action: 'startPickMode' });
        sendResponse({ success: true });
      } catch (e) {
        sendResponse({ success: false, error: e.message });
      }
    })();
    return true;
  }

  if (action === 'cancelPickMode') {
    (async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) {
        sendResponse({ success: false, error: 'No active tab found' });
        return;
      }
      try {
        await chrome.tabs.sendMessage(tab.id, { action: 'cancelPickMode' });
        sendResponse({ success: true });
      } catch (e) {
        sendResponse({ success: false, error: e.message });
      }
    })();
    return true;
  }

  if (action === 'fieldPicked') {
    (async () => {
      try {
        await chrome.storage.session.set({
          pickedField: message.descriptor,
          pickedAt: Date.now(),
        });
        sendResponse({ success: true });
      } catch (e) {
        sendResponse({ success: false, error: e.message });
      }
    })();
    return true;
  }

  // Unknown action
  sendResponse({ success: false, error: 'Not implemented yet' });
  return true;
});
