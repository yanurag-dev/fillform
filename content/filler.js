// content/filler.js
// Chrome Extension Content Script - Form Filler
// Handles all field types: text, select, date, radio, checkbox, textarea
// React/Angular compatible via native setter + synthetic events

(function () {
  'use strict';

  // ─── Native setters for React/Angular compat ──────────────────────────────

  const nativeInputSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
  const nativeTextareaSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
  const nativeSelectSetter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')?.set;

  function triggerEvents(element, events) {
    const eventList = events || ['input', 'change', 'blur'];
    for (const eventName of eventList) {
      const event = new Event(eventName, { bubbles: true, cancelable: true });
      element.dispatchEvent(event);
    }
    // Also trigger keyup for frameworks that listen to keyboard events
    element.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'Tab' }));
  }

  // ─── Field type detection ─────────────────────────────────────────────────

  function detectFieldType(element) {
    const tag = element.tagName.toLowerCase();
    if (tag === 'select') return 'select';
    if (tag === 'textarea') return 'textarea';
    const type = (element.type || 'text').toLowerCase();
    if (type === 'radio') return 'radio';
    if (type === 'checkbox') return 'checkbox';
    if (type === 'date') return 'date-native';
    // Check for text inputs acting as date fields
    if (['text', 'tel', 'number'].includes(type)) {
      const placeholder = (element.placeholder || '').toLowerCase();
      const name = (element.name || element.id || '').toLowerCase();
      if (placeholder.match(/dd.mm.yyyy|date|dob|birth/) || name.match(/dob|birth|date/)) {
        return 'date-text';
      }
    }
    return type; // text, email, tel, number, url, etc.
  }

  // ─── Date conversion ──────────────────────────────────────────────────────

  function convertDate(value, targetType, element) {
    // Input value can be in various formats: DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD, etc.
    let day, month, year;

    const dmyMatch = value.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
    const ymdMatch = value.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})$/);

    if (dmyMatch) {
      [, day, month, year] = dmyMatch;
    } else if (ymdMatch) {
      [, year, month, day] = ymdMatch;
    } else {
      return value; // Unknown format, return as-is
    }

    day = day.padStart(2, '0');
    month = month.padStart(2, '0');

    if (targetType === 'date-native') {
      return `${year}-${month}-${day}`; // YYYY-MM-DD for HTML5 date input
    }

    // For text-based date fields, detect expected format from placeholder
    const placeholder = element.placeholder || '';
    if (placeholder.match(/yyyy.mm.dd/i)) return `${year}-${month}-${day}`;
    if (placeholder.match(/mm.dd.yyyy/i)) return `${month}/${day}/${year}`;
    return `${day}/${month}/${year}`; // Default: DD/MM/YYYY (most common in India)
  }

  // ─── Fill functions per field type ────────────────────────────────────────

  function fillText(element, value) {
    try {
      if (nativeInputSetter) {
        nativeInputSetter.call(element, value);
      } else {
        element.value = value;
      }
    } catch (e) {
      element.value = value;
    }
    triggerEvents(element);
  }

  function fillTextarea(element, value) {
    try {
      if (nativeTextareaSetter) {
        nativeTextareaSetter.call(element, value);
      } else {
        element.value = value;
      }
    } catch (e) {
      element.value = value;
    }
    triggerEvents(element);
  }

  function fillSelect(element, value) {
    // Strategy 1: exact value match
    const exactOption = Array.from(element.options).find(o => o.value === value);
    if (exactOption) {
      try {
        if (nativeSelectSetter) nativeSelectSetter.call(element, exactOption.value);
        else element.value = exactOption.value;
      } catch (e) {
        element.value = exactOption.value;
      }
      triggerEvents(element, ['change']);
      return true;
    }

    // Strategy 2: case-insensitive value match
    const ciValueOption = Array.from(element.options).find(
      o => o.value.toLowerCase() === value.toLowerCase()
    );
    if (ciValueOption) {
      element.value = ciValueOption.value;
      triggerEvents(element, ['change']);
      return true;
    }

    // Strategy 3: text contains value (case-insensitive)
    const textOption = Array.from(element.options).find(
      o => o.text.toLowerCase().includes(value.toLowerCase())
    );
    if (textOption) {
      element.value = textOption.value;
      triggerEvents(element, ['change']);
      return true;
    }

    // Strategy 4: value contains option text (for when value is more verbose)
    const reverseOption = Array.from(element.options).find(o => {
      const optText = o.text.toLowerCase().trim();
      return optText.length > 2 && value.toLowerCase().includes(optText);
    });
    if (reverseOption) {
      element.value = reverseOption.value;
      triggerEvents(element, ['change']);
      return true;
    }

    return false; // Could not match
  }

  function fillDateNative(element, value) {
    const converted = convertDate(value, 'date-native', element);
    try {
      if (nativeInputSetter) nativeInputSetter.call(element, converted);
      else element.value = converted;
    } catch (e) {
      element.value = converted;
    }
    triggerEvents(element);
  }

  function fillDateText(element, value) {
    const converted = convertDate(value, 'date-text', element);
    try {
      if (nativeInputSetter) nativeInputSetter.call(element, converted);
      else element.value = converted;
    } catch (e) {
      element.value = converted;
    }
    triggerEvents(element);
  }

  function fillRadio(element, value) {
    // element is one radio in the group — find all radios with same name
    const name = element.name;
    let radios;
    if (name) {
      radios = document.querySelectorAll(`input[type="radio"][name="${CSS.escape(name)}"]`);
    } else {
      radios = [element]; // no name, treat as single
    }

    // Try to find matching radio by value (exact, case-insensitive, contains)
    let target = null;

    for (const radio of radios) {
      if (radio.value === value) { target = radio; break; }
    }
    if (!target) {
      for (const radio of radios) {
        if (radio.value.toLowerCase() === value.toLowerCase()) { target = radio; break; }
      }
    }
    if (!target) {
      for (const radio of radios) {
        // Check label text too
        const label = radio.id
          ? document.querySelector(`label[for="${CSS.escape(radio.id)}"]`)
          : null;
        const labelText = label?.innerText?.toLowerCase() || '';
        if (
          (labelText && labelText.includes(value.toLowerCase())) ||
          (labelText && value.toLowerCase().includes(labelText))
        ) {
          target = radio;
          break;
        }
      }
    }

    if (target) {
      target.checked = true;
      triggerEvents(target, ['change', 'click']);
      return true;
    }
    return false;
  }

  function fillCheckbox(element, value) {
    const shouldCheck = value === 'true' || value === true || value === '1' || value === 'yes';
    if (element.checked !== shouldCheck) {
      element.checked = shouldCheck;
      triggerEvents(element, ['change', 'click']);
    }
    return true;
  }

  // ─── Main fill orchestrator ───────────────────────────────────────────────

  async function fillAllFields(mappings) {
    const results = [];
    let filled = 0;
    let failed = 0;
    let notFound = 0;

    for (const { selector, value } of mappings) {
      // Small delay between fills to avoid overwhelming form validators
      await new Promise(r => setTimeout(r, 60));

      let element;
      try {
        element = document.querySelector(selector);
      } catch (e) {
        notFound++;
        results.push({ selector, status: 'invalid_selector', error: e.message });
        continue;
      }

      if (!element) {
        notFound++;
        results.push({ selector, status: 'not_found' });
        continue;
      }

      try {
        const fieldType = detectFieldType(element);
        let success = true;

        switch (fieldType) {
          case 'select':
            success = fillSelect(element, value);
            break;
          case 'radio':
            success = fillRadio(element, value);
            break;
          case 'checkbox':
            fillCheckbox(element, value);
            break;
          case 'date-native':
            fillDateNative(element, value);
            break;
          case 'date-text':
            fillDateText(element, value);
            break;
          case 'textarea':
            fillTextarea(element, value);
            break;
          default:
            fillText(element, value);
        }

        if (success !== false) {
          filled++;
          results.push({ selector, status: 'filled', fieldType });
        } else {
          failed++;
          results.push({ selector, status: 'no_match', fieldType, value });
        }
      } catch (e) {
        failed++;
        results.push({ selector, status: 'error', error: e.message });
      }
    }

    // After filling, wait 800ms and check if any new fields appeared (cascading dropdowns)
    await new Promise(r => setTimeout(r, 800));
    const newFieldCount = document.querySelectorAll(
      'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]),' +
      'select, textarea'
    ).length;

    return {
      filled,
      failed,
      notFound,
      total: mappings.length,
      results,
      newFieldCount // Let service worker decide if re-scan needed
    };
  }

  // ─── Toast notification ───────────────────────────────────────────────────

  function showToast(message, type) {
    const toastType = type || 'success';

    // Remove existing toast
    const existing = document.getElementById('fillform-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'fillform-toast';

    let bgColor;
    if (toastType === 'success') bgColor = '#10B981';
    else if (toastType === 'error') bgColor = '#EF4444';
    else bgColor = '#4F46E5';

    toast.style.cssText = [
      'position: fixed',
      'bottom: 24px',
      'right: 24px',
      'z-index: 999999',
      'padding: 12px 18px',
      'border-radius: 8px',
      "font-family: 'Noto Sans Devanagari', system-ui, sans-serif",
      'font-size: 14px',
      'font-weight: 500',
      'box-shadow: 0 4px 12px rgba(0,0,0,0.15)',
      'max-width: 320px',
      'line-height: 1.5',
      'transition: opacity 0.3s ease',
      'background: ' + bgColor,
      'color: white'
    ].join('; ');

    toast.textContent = message;
    document.body.appendChild(toast);

    // Auto-dismiss after 3 seconds
    setTimeout(function () {
      toast.style.opacity = '0';
      setTimeout(function () { toast.remove(); }, 300);
    }, 3000);
  }

  // ─── Pick mode ────────────────────────────────────────────────────────────

  var pickModeActive = false;
  var pickModeClickHandler = null;

  function simpleSelector(el) {
    if (el.id) return '#' + CSS.escape(el.id);
    if (el.name) return el.tagName.toLowerCase() + '[name="' + CSS.escape(el.name) + '"]';
    // Build a basic nth-child path as fallback
    var parts = [];
    var node = el;
    while (node && node !== document.body) {
      var tag = node.tagName.toLowerCase();
      var parent = node.parentElement;
      if (parent) {
        var siblings = Array.from(parent.children).filter(function(c) { return c.tagName === node.tagName; });
        var idx = siblings.indexOf(node) + 1;
        parts.unshift(tag + ':nth-of-type(' + idx + ')');
      } else {
        parts.unshift(tag);
      }
      node = parent;
    }
    return parts.join(' > ') || el.tagName.toLowerCase();
  }

  function startPickMode() {
    if (pickModeActive) return;
    pickModeActive = true;

    document.body.style.cursor = 'crosshair';

    var hint = document.createElement('div');
    hint.id = 'fillform-pick-hint';
    hint.style.cssText = [
      'position: fixed',
      'top: 10px',
      'left: 50%',
      'transform: translateX(-50%)',
      'background: #4F46E5',
      'color: white',
      'padding: 8px 16px',
      'border-radius: 20px',
      "font-family: 'Noto Sans Devanagari', system-ui, sans-serif",
      'font-size: 13px',
      'z-index: 999999',
      'box-shadow: 0 4px 12px rgba(0,0,0,0.2)',
      'pointer-events: none'
    ].join('; ');
    hint.textContent = '👆 फॉर्म फ़ील्ड पर क्लिक करें / Click on a form field';
    document.body.appendChild(hint);

    pickModeClickHandler = function(e) {
      var target = e.target;
      if (!['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)) return;

      e.preventDefault();
      e.stopPropagation();

      var descriptor = {
        selector: simpleSelector(target),
        tag: target.tagName.toLowerCase(),
        type: target.type || target.tagName.toLowerCase(),
        name: target.name || '',
        id: target.id || '',
        label: (target.labels && target.labels[0] && target.labels[0].innerText) || target.placeholder || target.name || '',
        placeholder: target.placeholder || '',
      };

      chrome.runtime.sendMessage({ action: 'fieldPicked', descriptor: descriptor });

      cancelPickMode();
    };

    document.addEventListener('click', pickModeClickHandler, true);
  }

  function cancelPickMode() {
    if (!pickModeActive) return;
    pickModeActive = false;
    document.body.style.cursor = '';
    var hint = document.getElementById('fillform-pick-hint');
    if (hint) hint.remove();
    if (pickModeClickHandler) {
      document.removeEventListener('click', pickModeClickHandler, true);
      pickModeClickHandler = null;
    }
  }

  // ─── Message listener ─────────────────────────────────────────────────────

  chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {

    if (message.action === 'startPickMode') {
      startPickMode();
      sendResponse({ success: true });
      return true;
    }

    if (message.action === 'cancelPickMode') {
      cancelPickMode();
      sendResponse({ success: true });
      return true;
    }

    if (message.action === 'fillFields') {
      const mappings = message.mappings;

      if (!mappings || mappings.length === 0) {
        sendResponse({ success: false, error: 'No mappings provided' });
        return true;
      }

      fillAllFields(mappings).then(function (result) {
        // Show toast on the page
        if (result.filled > 0) {
          showToast('\u2705 ' + result.filled + '/' + result.total + ' fields filled', 'success');
        } else {
          showToast('\u274C Could not fill fields. Please try again.', 'error');
        }
        sendResponse({ success: true, ...result });
      }).catch(function (e) {
        sendResponse({ success: false, error: e.message });
      });

      return true; // keep channel open for async
    }

    if (message.action === 'highlightField') {
      // Highlight a specific field on the page (Phase 7)
      try {
        const el = document.querySelector(message.selector);
        if (el) {
          const originalOutline = el.style.outline;
          const originalBackground = el.style.background;
          el.style.outline = '3px solid #4F46E5';
          el.style.background = '#EEF2FF';
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          setTimeout(function () {
            el.style.outline = originalOutline;
            el.style.background = originalBackground;
          }, 2000);
          sendResponse({ success: true });
        } else {
          sendResponse({ success: false, error: 'Element not found' });
        }
      } catch (e) {
        sendResponse({ success: false, error: e.message });
      }
      return true;
    }

  });

})();
