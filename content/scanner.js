// content/scanner.js
// Chrome Extension Content Script - Form Field Scanner
// DO NOT use import/export - content scripts don't support ES modules

(function () {
  'use strict';

  // ─── Unique selector generation ───────────────────────────────────────────

  function getUniqueSelector(element) {
    // 1. Try #id
    if (element.id) {
      const id = element.id.trim();
      if (id && document.querySelectorAll(`#${CSS.escape(id)}`).length === 1) {
        return `#${CSS.escape(id)}`;
      }
    }

    // 2. Try [name="..."]
    if (element.name) {
      const nameSelector = `${element.tagName.toLowerCase()}[name="${CSS.escape(element.name)}"]`;
      if (document.querySelectorAll(nameSelector).length === 1) {
        return nameSelector;
      }
    }

    // 3. Build path from element up to form or body
    function buildPath(el) {
      const parts = [];
      let current = el;
      while (current && current !== document.body) {
        let part = current.tagName.toLowerCase();
        if (current.id) {
          part = `#${CSS.escape(current.id)}`;
          parts.unshift(part);
          break;
        }
        const siblings = Array.from(current.parentElement?.children || [])
          .filter(s => s.tagName === current.tagName);
        if (siblings.length > 1) {
          const index = siblings.indexOf(current) + 1;
          part += `:nth-of-type(${index})`;
        }
        parts.unshift(part);
        current = current.parentElement;
        if (current?.tagName === 'FORM') {
          parts.unshift('form');
          break;
        }
      }
      return parts.join(' > ');
    }

    const path = buildPath(element);
    if (path && document.querySelectorAll(path).length === 1) return path;

    // 4. Fallback: assign a unique data attribute
    if (!element.dataset.fillformId) {
      element.dataset.fillformId = `ff_${Math.random().toString(36).slice(2, 9)}`;
    }
    return `[data-fillform-id="${element.dataset.fillformId}"]`;
  }

  // ─── Label detection ──────────────────────────────────────────────────────

  function getFieldLabel(element) {
    // 1. label[for=id]
    if (element.id) {
      const label = document.querySelector(`label[for="${CSS.escape(element.id)}"]`);
      if (label) return label.innerText.trim().slice(0, 100);
    }

    // 2. Ancestor label
    const ancestorLabel = element.closest('label');
    if (ancestorLabel) {
      const clone = ancestorLabel.cloneNode(true);
      clone.querySelectorAll('input, select, textarea').forEach(el => el.remove());
      const text = clone.innerText.trim();
      if (text) return text.slice(0, 100);
    }

    // 3. aria-label
    if (element.getAttribute('aria-label')) {
      return element.getAttribute('aria-label').trim().slice(0, 100);
    }

    // 4. aria-labelledby
    const labelledBy = element.getAttribute('aria-labelledby');
    if (labelledBy) {
      const labelEl = document.getElementById(labelledBy);
      if (labelEl) return labelEl.innerText.trim().slice(0, 100);
    }

    // 5. Previous sibling text
    let prev = element.previousElementSibling;
    if (prev && ['LABEL', 'SPAN', 'TD', 'TH', 'DIV', 'P', 'LEGEND'].includes(prev.tagName)) {
      const text = prev.innerText.trim();
      if (text) return text.slice(0, 100);
    }

    // 6. Parent's previous sibling (table layout)
    const parent = element.parentElement;
    if (parent) {
      const prevParent = parent.previousElementSibling;
      if (prevParent && ['TD', 'TH', 'DIV', 'LI'].includes(prevParent.tagName)) {
        const text = prevParent.innerText.trim();
        if (text) return text.slice(0, 100);
      }
    }

    return '';
  }

  // ─── Nearby text extraction ───────────────────────────────────────────────

  function getNearbyText(element) {
    const texts = [];

    // Walk up to find container
    let current = element.parentElement;
    let depth = 0;
    while (current && depth < 4) {
      const tag = current.tagName;
      if (['TD', 'TH', 'DIV', 'LI', 'P', 'FIELDSET', 'SECTION'].includes(tag)) {
        const clone = current.cloneNode(true);
        clone.querySelectorAll('input, select, textarea, script, style').forEach(el => el.remove());
        const text = clone.innerText.trim().replace(/\s+/g, ' ');
        if (text) texts.push(text);
        break;
      }
      current = current.parentElement;
      depth++;
    }

    // Previous sibling text
    const prev = element.previousElementSibling;
    if (prev) {
      const text = prev.innerText?.trim().replace(/\s+/g, ' ');
      if (text) texts.push(text);
    }

    return texts.join(' | ').slice(0, 150);
  }

  // ─── Field descriptor builder ─────────────────────────────────────────────

  function buildFieldDescriptor(element) {
    const tag = element.tagName.toLowerCase();
    const type = element.type?.toLowerCase() || tag;

    const descriptor = {
      selector: getUniqueSelector(element),
      tag,
      type,
      name: element.name || '',
      id: element.id || '',
      label: getFieldLabel(element),
      placeholder: element.placeholder || '',
      nearbyText: getNearbyText(element),
      required: element.required || false,
      currentValue: element.value || '',
    };

    // For <select>: add options
    if (tag === 'select') {
      descriptor.options = Array.from(element.options).map(opt => ({
        value: opt.value,
        text: opt.text.trim()
      })).filter(opt => opt.value !== ''); // skip blank/placeholder options
    }

    // For radio buttons: collect the whole group
    if (type === 'radio' && element.name) {
      const group = document.querySelectorAll(`input[type="radio"][name="${CSS.escape(element.name)}"]`);
      descriptor.radioGroup = {
        name: element.name,
        options: Array.from(group).map(radio => ({
          value: radio.value,
          label: getFieldLabel(radio) || getNearbyText(radio),
          checked: radio.checked
        }))
      };
    }

    return descriptor;
  }

  // ─── Visibility check ─────────────────────────────────────────────────────

  function isVisible(element) {
    const style = window.getComputedStyle(element);
    if (style.display === 'none') return false;
    if (style.visibility === 'hidden') return false;
    if (style.opacity === '0') return false;
    const rect = element.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return false;
    return true;
  }

  // ─── Main scanner ─────────────────────────────────────────────────────────

  function scanFormFields() {
    const EXCLUDED_TYPES = ['hidden', 'submit', 'button', 'reset', 'image', 'file'];

    const elements = Array.from(document.querySelectorAll('input, select, textarea'));

    const fields = [];
    const seenRadioGroups = new Set();

    for (const el of elements) {
      const type = (el.type || el.tagName).toLowerCase();
      if (EXCLUDED_TYPES.includes(type)) continue;

      if (el.disabled) continue;
      if (el.type === 'hidden') continue;
      if (!isVisible(el)) continue;

      // For radio buttons, only process the group once
      if (type === 'radio') {
        if (seenRadioGroups.has(el.name)) continue;
        seenRadioGroups.add(el.name);
      }

      try {
        const descriptor = buildFieldDescriptor(el);
        fields.push(descriptor);
      } catch (e) {
        // skip problematic elements
      }
    }

    return fields;
  }

  // ─── Iframe scanner ───────────────────────────────────────────────────────

  function scanIframes() {
    const iframeFields = [];
    const iframes = document.querySelectorAll('iframe');

    for (const iframe of iframes) {
      try {
        // Only accessible if same origin
        const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
        if (!iframeDoc) continue;

        const iframeElements = Array.from(iframeDoc.querySelectorAll('input, select, textarea'));
        const EXCLUDED_TYPES = ['hidden', 'submit', 'button', 'reset', 'image', 'file'];
        const seenGroups = new Set();

        for (const el of iframeElements) {
          const type = (el.type || el.tagName).toLowerCase();
          if (EXCLUDED_TYPES.includes(type) || el.disabled) continue;
          if (type === 'radio') {
            if (seenGroups.has(el.name)) continue;
            seenGroups.add(el.name);
          }
          try {
            const descriptor = buildFieldDescriptor(el);
            // Prefix selector to indicate it's in an iframe
            descriptor.selector = `iframe:nth-of-type(${Array.from(iframes).indexOf(iframe) + 1}) >>> ${descriptor.selector}`;
            descriptor.inIframe = true;
            iframeFields.push(descriptor);
          } catch(e) {}
        }
      } catch(e) {
        // Cross-origin iframe — skip silently
      }
    }

    return iframeFields;
  }

  // ─── Message listener ─────────────────────────────────────────────────────

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'scanFields') {
      try {
        const fields = scanFormFields();
        const iframeFields = scanIframes();
        const allFields = [...fields, ...iframeFields];
        sendResponse({ success: true, fields: allFields, count: allFields.length, url: window.location.href });
      } catch (e) {
        sendResponse({ success: false, error: e.message });
      }
      return true; // keep channel open for async
    }

    if (message.action === 'highlightField') {
      // Phase 7 feature - placeholder for now
      sendResponse({ success: true });
      return true;
    }
  });

})();
