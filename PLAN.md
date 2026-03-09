# FillForm — Phase-wise Implementation Plan

## Overview

A Chrome Extension that helps cyber cafe operators fill repetitive government/education forms by extracting data from document photos (Aadhaar, marksheet, PAN, etc.) using Gemini AI and auto-filling web forms. Bilingual UI (Hindi/English).

---

## Phase 1: Extension Skeleton + Bilingual Popup UI

### Goal
Get a working Chrome extension that opens a bilingual popup with the complete UI layout (non-functional buttons).

### Tasks

1. **Create `manifest.json`**
   - Manifest V3
   - Permissions: `activeTab`, `storage`
   - Host permissions: `https://*/*`, `http://*/*`
   - Register popup, service worker, content scripts, settings page
   - Add placeholder icons (16, 48, 128)

2. **Create `popup/popup.html`**
   - Header with extension name "FillForm / फॉर्म फिलर" + settings icon + language toggle (हि/En)
   - Step 1 section: "दस्तावेज़ अपलोड करें / Upload Documents"
     - File input (accept `image/*`, multiple)
     - Thumbnail preview strip for uploaded images
     - Document type tag per image (Aadhaar, PAN, Marksheet, Other)
     - "डेटा निकालें / Extract Data" button
   - Step 2 section: "डेटा जांचें / Review Data"
     - Editable two-column table (field name | value)
     - Each row has an edit icon and delete icon
     - "फ़ील्ड जोड़ें / Add Field" button
   - Step 3 section: "फॉर्म भरें / Fill Form"
     - "फॉर्म भरें / Fill Form" button
     - Status area for progress messages
     - Expandable "मैपिंग देखें / Show Mapping" section (placeholder)
   - Footer: "डेटा मिटाएं / Clear Data" button

3. **Create `popup/popup.css`**
   - Clean, modern look suitable for popup width (~380px)
   - Step-by-step visual flow (numbered steps with icons)
   - Thumbnail grid for uploaded images
   - Editable table styling
   - Button styles (primary, secondary, danger)
   - Loading spinner styles
   - Responsive within popup constraints
   - Hindi font support (system fonts: Noto Sans Devanagari fallback)

4. **Create `popup/popup.js`**
   - Language toggle functionality (switch between Hindi-only, English-only, both)
   - Save language preference to `chrome.storage.local`
   - Image upload preview (read files, show thumbnails, assign document type tags)
   - Add/remove field rows in the review table
   - Wire up "Clear Data" button to reset all UI state
   - All buttons wired to show "Coming soon" alerts (functionality added in later phases)

5. **Create `lib/i18n.js`**
   - Translation dictionary for both languages (hi/en)
   - Keys for all UI strings:
     - `appTitle`, `uploadTitle`, `uploadBtn`, `extractBtn`
     - `reviewTitle`, `addFieldBtn`
     - `fillTitle`, `fillBtn`, `showMappingBtn`
     - `clearBtn`, `settingsTitle`
     - Field labels: `name`, `fatherName`, `motherName`, `dob`, `gender`, `address`, `aadhaar`, `pan`, `phone`, `email`, `marks`, `rollNo`, `board`, `school`, `passingYear`, `percentage`, `category`
     - Status messages: `extracting`, `extracted`, `scanning`, `mapping`, `filling`, `filled`, `error`, `noApiKey`
   - `setLanguage(lang)` function that updates all `[data-i18n]` elements
   - `getBilingual(key)` function that returns "हिंदी / English" format

6. **Create placeholder icons**
   - Simple colored squares or basic icons (16x16, 48x48, 128x128 PNG)

7. **Create `background/service-worker.js`**
   - Empty service worker with basic `chrome.runtime.onInstalled` listener
   - Console log to verify it loads

8. **Create `content/scanner.js` and `content/filler.js`**
   - Empty placeholder files with message listeners that respond with `{status: "not implemented"}`

### Deliverables
- Extension loads in Chrome via `chrome://extensions` (developer mode)
- Popup opens with full bilingual UI layout
- Language toggle works and preference is saved
- Image upload shows thumbnails with document type tags
- Add/remove field rows works in review table
- Clear button resets UI
- Settings icon opens settings page (blank for now)

### Files Created
```
fillform/
├── manifest.json
├── background/service-worker.js
├── content/scanner.js
├── content/filler.js
├── popup/popup.html
├── popup/popup.css
├── popup/popup.js
├── lib/i18n.js
├── icons/icon16.png
├── icons/icon48.png
└── icons/icon128.png
```

---

## Phase 2: Settings Page + Storage Layer

### Goal
A working settings page where the user can enter/test their Gemini API key, and a storage abstraction layer for all data persistence.

### Tasks

1. **Create `lib/storage.js`**
   - `getApiKey()` → returns Promise<string|null>
   - `setApiKey(key)` → saves to `chrome.storage.local`
   - `getCachedMapping(urlPattern)` → returns Promise<object|null>
   - `setCachedMapping(urlPattern, mapping)` → saves to `chrome.storage.local`
   - `deleteCachedMapping(urlPattern)` → removes one cached mapping
   - `getAllMappings()` → returns Promise<object> of all cached mappings
   - `clearAllMappings()` → wipes all cached mappings
   - `setSessionData(data)` → saves extracted data to `chrome.storage.session`
   - `getSessionData()` → retrieves extracted data from `chrome.storage.session`
   - `clearSessionData()` → wipes session data
   - `getLanguagePreference()` / `setLanguagePreference(lang)`

2. **Create `settings/settings.html`**
   - Bilingual page title "सेटिंग्स / Settings"
   - Section 1: Gemini API Key
     - Password input field for API key
     - Show/hide toggle
     - "सेव करें / Save" button
     - "टेस्ट करें / Test API Key" button with status indicator (✅/❌)
     - Help text: "Get your API key from ai.google.dev" with link
   - Section 2: Cached Mappings
     - Table listing all cached URL patterns with delete buttons
     - "सभी मिटाएं / Clear All Cache" button
     - Show count of cached mappings
   - Section 3: Language
     - Radio buttons: Hindi only / English only / Both (दोनों)
   - Back to extension link

3. **Create `settings/settings.css`**
   - Full-page layout (not popup, opens as options page)
   - Consistent styling with popup
   - Table styling for cached mappings list

4. **Create `settings/settings.js`**
   - Load saved API key on page open (show masked)
   - Save API key on button click
   - Test API key: make a trivial Gemini API call (`models.list` or a simple `generateContent` with "hello"), show success/failure
   - Load and display all cached mappings
   - Delete individual mappings
   - Clear all mappings with confirmation
   - Language preference save/load

5. **Update `popup/popup.js`**
   - Import and use `storage.js` instead of direct `chrome.storage` calls
   - Settings icon opens settings page via `chrome.runtime.openOptionsPage()`
   - Check for API key on popup open; show warning if not set
   - Use `storage.getSessionData()` to restore extracted data if popup was reopened

6. **Create `lib/url-pattern.js`**
   - `normalizeUrl(url)` function:
     - Parse URL, keep protocol + host + pathname
     - Strip query parameters and hash fragments
     - Replace numeric path segments with `*` (e.g., `/form/12345/step1` → `/form/*/step1`)
     - Return normalized string as cache key
   - `isSamePattern(url1, url2)` → boolean comparison

### Deliverables
- Settings page accessible from popup gear icon
- API key can be saved, loaded, tested
- Cache management works (list, delete, clear)
- Language preference persists across sessions
- Session storage preserves extracted data across popup close/reopen
- URL pattern normalization works correctly

### Files Created/Modified
```
New:
├── lib/storage.js
├── lib/url-pattern.js
├── settings/settings.html
├── settings/settings.css
└── settings/settings.js

Modified:
├── popup/popup.js (use storage.js, add API key check)
└── manifest.json (add options_page if not already)
```

---

## Phase 3: Gemini Integration — Document Data Extraction

### Goal
Upload document photos → Gemini Vision API extracts structured data → displayed in editable review table.

### Tasks

1. **Create `lib/gemini.js`**
   - `extractDataFromImages(apiKey, images)` function:
     - `images`: array of `{base64, mimeType, documentType}`
     - Calls Gemini Flash vision model endpoint: `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent`
     - Request body: system instruction + user message with inline images
     - Extraction prompt (see below)
     - Parse response, extract JSON from text
     - Handle errors: invalid API key, rate limit, malformed response
     - Return structured data object

   - Extraction prompt design:
     ```
     You are a document data extractor for Indian identity and education documents.
     Documents may be in Hindi, English, or bilingual.

     Extract ALL personal information from the provided document images.
     Return a single flat JSON object with these possible keys (include only those found):

     Personal:
     - full_name, full_name_hindi, father_name, father_name_hindi, mother_name
     - dob (DD/MM/YYYY format), gender (Male/Female/Other)
     - aadhaar_number (XXXX XXXX XXXX format), pan_number
     - phone, email

     Address:
     - address_line1, address_line2, city, district, state, pincode

     Education:
     - board_name, school_name, exam_name, roll_number
     - marks_obtained, total_marks, percentage, grade, passing_year

     Other:
     - category (General/OBC/SC/ST/EWS)
     - blood_group, voter_id, passport_number

     Return ONLY valid JSON. No markdown, no explanation.
     ```

   - Image preprocessing:
     - Validate base64 data
     - Check file size (warn if > 4MB per image)
     - Support JPEG, PNG, WebP

2. **Update `background/service-worker.js`**
   - Import `gemini.js`
   - Handle message `{action: "extractData", images: [...]}`:
     - Get API key from storage
     - Call `extractDataFromImages()`
     - Return extracted data or error
   - Handle errors gracefully (no API key, network failure, etc.)

3. **Update `popup/popup.js`**
   - Wire "Extract Data" button:
     - Collect uploaded images as base64
     - Show loading spinner + "डेटा निकाला जा रहा है... / Extracting data..."
     - Send message to service worker
     - On success: populate review table with extracted data
     - On error: show bilingual error message
   - Image preprocessing before upload:
     - Resize large images using canvas (max 1500px on longest side)
     - Convert to JPEG for smaller size
     - Show file size indicator per thumbnail
   - Review table population:
     - Each extracted field shown as editable row
     - Field names shown bilingually (e.g., "नाम / Name")
     - Empty fields from extraction are omitted
     - Dad can edit any value inline
   - Save extracted data to `chrome.storage.session` after extraction

4. **Add error handling UI**
   - No API key → show message with link to settings
   - Network error → "इंटरनेट कनेक्शन जांचें / Check internet connection"
   - Invalid API key → "API key गलत है / Invalid API key"
   - Extraction failed → "डेटा नहीं निकल पाया / Could not extract data, कृपया मैन्युअल भरें / please fill manually"

### Deliverables
- Upload 1-3 document photos → see extracted data in review table within 3-5 seconds
- Extracted data is editable
- Data persists in session storage across popup close/reopen
- Error states handled with bilingual messages
- Works with Aadhaar, PAN, marksheet images

### Files Created/Modified
```
New:
├── lib/gemini.js

Modified:
├── background/service-worker.js (add extractData handler)
└── popup/popup.js (wire extraction flow)
```

### Testing
- Test with sample Aadhaar card image → verify name, DOB, Aadhaar number extracted
- Test with marksheet image → verify marks, roll number, board extracted
- Test with multiple documents at once → verify all data merged
- Test error cases: no API key, wrong API key, no internet

---

## Phase 4: Form Scanner (Content Script)

### Goal
Content script scans any webpage form and produces a clean, structured description of all form fields.

### Tasks

1. **Implement `content/scanner.js`**
   - Listen for message `{action: "scanFields"}`
   - `scanFormFields()` function:
     - Query all `input`, `select`, `textarea` elements
     - Exclude: `type="hidden"`, `type="submit"`, `type="button"`, `type="reset"`, `disabled` elements
     - For each visible field, build a descriptor:

       ```js
       {
         selector: String,    // unique CSS selector
         type: String,        // input type / "select" / "textarea"
         name: String,        // name attribute
         id: String,          // id attribute
         label: String,       // associated <label> text
         placeholder: String, // placeholder attribute
         nearbyText: String,  // text from surrounding elements (max 150 chars)
         required: Boolean,
         currentValue: String,
         // For <select>:
         options: [{value, text}],
         // For radio buttons:
         radioGroup: {name, options: [{value, label}]}
       }
       ```

   - **Unique selector generation** (priority order):
     1. `#id` if id exists and is unique
     2. `[name="fieldname"]` if name is unique
     3. CSS path: `form:nth-of-type(1) > div:nth-child(3) > input`
     4. Fallback: generate a temporary `data-fillform-id` attribute

   - **Label detection** (priority order):
     1. `<label for="fieldId">` matching by id
     2. Parent `<label>` wrapping the input
     3. Previous sibling element's text
     4. Parent `<td>` previous `<td>` or `<th>` text (common in gov forms using tables)
     5. `aria-label` or `aria-labelledby`

   - **Nearby text extraction**:
     - Walk up the DOM to nearest `td`, `th`, `div`, `li`, `p`
     - Get `innerText` of that container, truncated to 150 chars
     - Also check previous sibling text
     - This catches Hindi labels that aren't properly linked via `<label>`

   - **Radio button grouping**:
     - Group all radios with the same `name` attribute
     - For each radio, find its label (next sibling text, parent label, nearby span)
     - Return as a group with all options

   - **Iframe handling**:
     - Detect iframes on the page
     - If same-origin, scan inside them too
     - If cross-origin, skip (can't access) and note in response

2. **Update `background/service-worker.js`**
   - Handle message `{action: "scanAndFill", data: extractedData}`:
     - Get active tab ID
     - Send `{action: "scanFields"}` to content script in that tab
     - Receive field descriptors
     - Log them for now (mapping happens in Phase 5)
     - Return field descriptors to popup for debugging

3. **Add debug view in popup**
   - After clicking "Fill Form", show count of fields found
   - Optional expandable section showing raw field descriptors (for debugging during development, can be hidden later)

### Deliverables
- Content script accurately scans any form and returns structured descriptors
- Handles table-based layouts (common in Indian gov sites)
- Detects Hindi labels via nearby text
- Groups radio buttons correctly
- Handles dropdown options
- Works on 5+ different real government form websites

### Files Modified
```
Modified:
├── content/scanner.js (full implementation)
├── background/service-worker.js (add scan handler)
└── popup/popup.js (add debug field count display)
```

### Testing (Real Websites)
- Test on a simple HTML form
- Test on an Indian government portal (e.g., scholarship form, exam registration)
- Test on a form with table-based layout
- Test on a form with Hindi labels
- Test on a form with dropdowns and radio buttons
- Verify all fields are captured with meaningful labels/nearbyText

---

## Phase 5: Gemini Field Mapping

### Goal
Use Gemini to intelligently map extracted customer data to scanned form fields, with caching.

### Tasks

1. **Add `mapFieldsToData()` to `lib/gemini.js`**
   - Function signature: `mapFieldsToData(apiKey, extractedData, fieldDescriptors)`
   - Calls Gemini Flash (text-only, no vision needed)
   - Mapping prompt:
     ```
     You are a form-filling assistant for Indian government and education forms.

     Given extracted user data and form field descriptors, determine which data
     value goes into which form field.

     User data:
     {extractedData}

     Form fields on the page:
     {fieldDescriptors}

     Rules:
     1. For <select> fields, return the exact option VALUE that best matches.
        Do fuzzy matching — "Male" matches "M" or "पुरुष".
     2. For date fields, detect expected format from placeholder or field context.
        Default format for Indian forms: DD/MM/YYYY.
        If the field type is "date" (HTML5), use YYYY-MM-DD.
     3. For radio buttons, return the value attribute of the correct option.
     4. For checkboxes, return "true" or "false".
     5. Split address intelligently if form has separate address line 1, line 2,
        city, district, state, pincode fields.
     6. Field labels may be in Hindi, English, or both. Match semantically.
     7. If no extracted data matches a field, omit it from results.
     8. Handle common field variations:
        - "Guardian Name" / "अभिभावक का नाम" → father_name
        - "S/O, D/O, W/O" → father_name
        - "Permanent Address" vs "Correspondence Address" → same address unless both present
        - "Mobile No" / "मोबाइल नंबर" → phone

     Return a JSON array: [{"selector": "css_selector", "value": "value_to_fill"}]
     Return ONLY valid JSON. No markdown, no explanation.
     ```

   - Response parsing:
     - Extract JSON from response text (handle possible markdown wrapping)
     - Validate each mapping has both `selector` and `value`
     - Return parsed array

2. **Implement caching in `background/service-worker.js`**
   - Before calling Gemini for mapping:
     1. Normalize current URL using `url-pattern.js`
     2. Check `storage.getCachedMapping(urlPattern)`
     3. If cache exists AND field selectors match the current scan → use cache
        - "Match" means: >80% of cached selectors still exist on the page
     4. If cache miss or stale → call Gemini → cache the result
   - Cache structure stored:
     ```json
     {
       "urlPattern": "https://example.gov.in/scholarship/*/apply",
       "fieldStructure": ["#name", "#dob", "#father", ...],
       "dataKeyMapping": {
         "#name": "full_name",
         "#dob": "dob",
         "#father": "father_name"
       },
       "lastUsed": "2026-03-09T..."
     }
     ```
   - On cache hit: instead of sending raw field descriptors to Gemini, apply the cached `dataKeyMapping` to current extracted data and produce the fill instructions directly (no LLM call needed)
   - On cache miss with LLM response: extract the dataKey mapping from the LLM response and store it

3. **Update `background/service-worker.js` — complete `scanAndFill` flow**
   - Full flow:
     1. Send `scanFields` to content script → receive field descriptors
     2. Normalize URL → check cache
     3. If cache hit → build fill instructions from cache + extracted data
     4. If cache miss → call `mapFieldsToData()` → cache the mapping
     5. Send `fillFields` to content script (Phase 6 will implement the filler)
     6. Return result to popup (fields mapped count, cache status)

4. **Update `popup/popup.js`**
   - Show mapping status:
     - "फ़ील्ड स्कैन हो रहे हैं... / Scanning fields..." (during scan)
     - "24 फ़ील्ड मिले / 24 fields found" (after scan)
     - "मैपिंग हो रही है... / Mapping fields..." (during LLM call)
     - "कैश से मैपिंग मिली / Mapping found in cache" (if cached)
     - "मैपिंग तैयार / Mapping ready" (after LLM response)

### Deliverables
- Gemini accurately maps extracted data to form fields
- Caching works: second visit to same form type uses cached mapping (no LLM call)
- Hindi/English form labels handled correctly
- Address splitting works (line1, line2, city, state, pincode)
- Date format detection and conversion works
- Dropdown/radio value matching works

### Files Created/Modified
```
Modified:
├── lib/gemini.js (add mapFieldsToData)
├── background/service-worker.js (complete scanAndFill with caching)
└── popup/popup.js (mapping status messages)
```

### Testing
- Test mapping on 3+ different form websites
- Test cache: fill same form twice, verify second time skips LLM call
- Test with Hindi-only labels
- Test address splitting across multiple fields
- Test date format conversion
- Test dropdown matching (English value with Hindi options and vice versa)

---

## Phase 6: Form Filler (All Field Types)

### Goal
Content script receives fill instructions and correctly fills every type of form field, including React/Angular compatibility.

### Tasks

1. **Implement `content/filler.js`**
   - Listen for message `{action: "fillFields", mappings: [{selector, value}]}`
   - For each mapping, in sequence (with 50ms delay between fields):

   - **Text / Email / Tel / Number / Textarea:**
     ```js
     function fillTextInput(element, value) {
       // React/Angular compatible setter
       const nativeSetter = Object.getOwnPropertyDescriptor(
         window.HTMLInputElement.prototype, 'value'
       )?.set || Object.getOwnPropertyDescriptor(
         window.HTMLTextAreaElement.prototype, 'value'
       )?.set;

       if (nativeSetter) {
         nativeSetter.call(element, value);
       } else {
         element.value = value;
       }

       element.dispatchEvent(new Event('input', { bubbles: true }));
       element.dispatchEvent(new Event('change', { bubbles: true }));
       element.dispatchEvent(new Event('blur', { bubbles: true }));
       element.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
     }
     ```

   - **Select / Dropdown:**
     ```js
     function fillSelect(element, value) {
       // Try exact value match
       let option = Array.from(element.options).find(o => o.value === value);
       // Try case-insensitive text match
       if (!option) {
         option = Array.from(element.options).find(
           o => o.text.toLowerCase().includes(value.toLowerCase())
         );
       }
       // Try partial match
       if (!option) {
         option = Array.from(element.options).find(
           o => value.toLowerCase().includes(o.text.toLowerCase())
         );
       }
       if (option) {
         element.value = option.value;
         element.dispatchEvent(new Event('change', { bubbles: true }));
       }
     }
     ```

   - **Date inputs:**
     ```js
     function fillDate(element, value) {
       if (element.type === 'date') {
         // HTML5 date input expects YYYY-MM-DD
         const converted = convertToISO(value); // DD/MM/YYYY → YYYY-MM-DD
         nativeSetter.call(element, converted);
       } else {
         // Text input acting as date field
         nativeSetter.call(element, value); // LLM already formatted it
       }
       element.dispatchEvent(new Event('input', { bubbles: true }));
       element.dispatchEvent(new Event('change', { bubbles: true }));
     }
     ```

   - **Radio buttons:**
     ```js
     function fillRadio(selector, value) {
       // selector points to the radio group, value is the option to select
       const radios = document.querySelectorAll(`input[name="${name}"]`);
       for (const radio of radios) {
         if (radio.value === value || radio.labels?.[0]?.innerText?.includes(value)) {
           radio.checked = true;
           radio.dispatchEvent(new Event('change', { bubbles: true }));
           radio.dispatchEvent(new Event('click', { bubbles: true }));
           break;
         }
       }
     }
     ```

   - **Checkboxes:**
     ```js
     function fillCheckbox(element, value) {
       const shouldCheck = value === 'true' || value === true;
       if (element.checked !== shouldCheck) {
         element.checked = shouldCheck;
         element.dispatchEvent(new Event('change', { bubbles: true }));
         element.dispatchEvent(new Event('click', { bubbles: true }));
       }
     }
     ```

   - **Main fill orchestrator:**
     ```js
     async function fillAllFields(mappings) {
       let filled = 0;
       let failed = 0;
       const results = [];

       for (const {selector, value} of mappings) {
         const element = document.querySelector(selector);
         if (!element) {
           failed++;
           results.push({selector, status: 'not_found'});
           continue;
         }

         try {
           const type = detectFieldType(element);
           switch(type) {
             case 'select': fillSelect(element, value); break;
             case 'radio': fillRadio(element, value); break;
             case 'checkbox': fillCheckbox(element, value); break;
             case 'date': fillDate(element, value); break;
             default: fillTextInput(element, value);
           }
           filled++;
           results.push({selector, status: 'filled'});
         } catch(e) {
           failed++;
           results.push({selector, status: 'error', error: e.message});
         }

         await new Promise(r => setTimeout(r, 50)); // 50ms delay
       }

       return {filled, failed, total: mappings.length, results};
     }
     ```

2. **Handle dynamic/cascading fields**
   - Some forms show new fields after a dropdown changes (e.g., State → District)
   - After filling a select, wait 500ms for any new fields to load
   - Re-scan if new fields appeared
   - Send back to service worker for re-mapping if needed
   - Implementation: after initial fill, wait 1 second, re-scan, compare field count. If new fields appeared, notify popup.

3. **Update `background/service-worker.js`**
   - After mapping, send `fillFields` to content script
   - Receive fill results
   - If dynamic fields detected, do a second round (re-scan, re-map only new fields, fill again)
   - Return final results to popup

4. **Update `popup/popup.js`**
   - Show fill progress:
     - "फॉर्म भरा जा रहा है... / Filling form..."
     - "✅ 22/24 फ़ील्ड भरे गए / 22/24 fields filled"
     - If some failed: "⚠️ 2 फ़ील्ड नहीं भरे जा सके / 2 fields could not be filled"
   - Color-coded status (green = success, yellow = partial, red = failed)

### Deliverables
- All field types filled correctly (text, select, date, radio, checkbox)
- React/Angular sites work (native setter + event dispatch)
- Dynamic/cascading fields handled (second fill round)
- Fill results reported back to popup with counts
- 50ms delay between fills prevents form validation issues

### Files Modified
```
Modified:
├── content/filler.js (full implementation)
├── background/service-worker.js (add fill orchestration)
└── popup/popup.js (fill progress UI)
```

### Testing
- Test on a simple HTML form with all field types
- Test on a React-based form
- Test on a government form with cascading dropdowns (State → District)
- Test date filling (DD/MM/YYYY and YYYY-MM-DD formats)
- Test radio buttons with Hindi labels
- Test select with partial matching
- Verify events are dispatched correctly (form validation triggers)

---

## Phase 7: Mapping Review + Manual Override UI

### Goal
Dad can see, review, and correct the field mapping. Corrections update the cache for future use.

### Tasks

1. **Add mapping review table to `popup/popup.html`**
   - Expandable section "मैपिंग देखें / Show Mapping"
   - Table with columns:
     - Form field (label from the page, truncated)
     - Mapped to (dropdown of available extracted data fields)
     - Value (what will be filled)
     - Status icon (✅ filled, ❌ not found, ⚠️ no match)
   - "Highlight on page" — clicking a row highlights the corresponding field on the webpage (yellow border flash)

2. **Implement manual override in `popup/popup.js`**
   - Each mapping row has a dropdown to reassign which data field maps to which form field
   - "कोई नहीं / None" option to skip a field
   - Custom value text input as fallback
   - "दोबारा भरें / Re-fill with corrections" button:
     - Takes the corrected mapping
     - Sends directly to filler (no LLM call)
     - Updates the cache for this URL pattern

3. **Add field highlighting in `content/filler.js`**
   - Listen for message `{action: "highlightField", selector: "..."}`
   - Add a temporary yellow border + scroll into view
   - Remove highlight after 2 seconds

4. **Cache update logic in `background/service-worker.js`**
   - When user corrects a mapping and re-fills:
     - Update the cached `dataKeyMapping` for this URL pattern
     - Next visit, corrected mapping is used directly

5. **Add "फ़ील्ड जोड़ें / Add Missing Field" in mapping table**
   - If a form field wasn't detected by the scanner, dad can click a button
   - Extension enters "pick mode" — dad clicks on the form field on the page
   - Content script captures the clicked element's selector
   - Dad assigns a data field to it
   - This is added to the mapping and cache

### Deliverables
- Mapping table shows all form field ↔ data field connections
- Dad can correct wrong mappings via dropdown
- Corrections update cache for future visits
- Field highlighting helps dad identify which form field is which
- Pick mode allows adding missed fields
- Re-fill with corrections works without LLM call

### Files Modified
```
Modified:
├── popup/popup.html (add mapping review section)
├── popup/popup.css (mapping table styles)
├── popup/popup.js (override logic, pick mode)
├── content/filler.js (add highlight + pick mode)
└── background/service-worker.js (cache update on override)
```

---

## Phase 8: Multi-Page Support, Polish, and Edge Cases

### Goal
Handle multi-page forms, iframe forms, and polish the entire experience for daily cyber cafe use.

### Tasks

1. **Multi-page form support**
   - Extracted data persists in `chrome.storage.session` across popup close/reopen
   - When popup opens, check for existing session data:
     - If exists, skip directly to Step 3 (Fill Form)
     - Show "पिछला डेटा मिला / Previous data found" with option to use it or start fresh
   - After filling page 1 and navigating to page 2:
     - Dad opens popup → session data is there → clicks "Fill Form" → fills page 2
   - Works seamlessly across as many pages as needed
   - "डेटा मिटाएं / Clear Data" explicitly ends the session

2. **Iframe handling**
   - Update `manifest.json`: add `"all_frames": true` to content scripts
   - Scanner checks for iframes and scans same-origin frames
   - Filler can target fields inside iframes
   - Handle common government portal pattern: main form in an iframe

3. **Error recovery and edge cases**
   - Network timeout handling (10 second timeout on Gemini calls)
   - Retry button on failure ("पुनः प्रयास करें / Retry")
   - Partial extraction: if some documents fail, show what was extracted and let dad fill the rest
   - Empty form detection: if no form fields found, show "इस पेज पर कोई फॉर्म नहीं मिला / No form found on this page"
   - Already-filled fields: option to skip fields that already have values

4. **Performance optimization**
   - Image compression before upload (resize to max 1500px, JPEG quality 80%)
   - Debounce fill operations
   - Lazy load mapping review table

5. **UX Polish**
   - Loading animations/spinners for each step
   - Success animations (checkmark) when form is filled
   - Keyboard shortcut: `Alt+F` to trigger fill from any page
   - Auto-focus management in popup
   - Tooltip on hover for truncated text
   - Step indicators showing current progress (Step 1 ✅ → Step 2 ✅ → Step 3 🔄)
   - Sound notification on fill completion (optional, can be disabled)

6. **Notification/Toast system**
   - Content script shows a small toast notification on the page:
     - "✅ 22/24 फ़ील्ड भरे गए / fields filled" (bottom-right corner, auto-dismiss after 3s)
   - Helpful when popup closes unexpectedly

7. **Documentation**
   - Brief usage guide inside the settings page (bilingual)
   - "कैसे उपयोग करें / How to Use" section with numbered steps
   - Troubleshooting: common issues and solutions

8. **Final testing checklist**
   - [ ] Extension loads without errors
   - [ ] API key save/load/test works
   - [ ] Document upload + extraction works (Aadhaar, PAN, Marksheet)
   - [ ] Multiple document extraction merges data correctly
   - [ ] Review table is editable
   - [ ] Form scanning works on 5+ government sites
   - [ ] Field mapping is accurate
   - [ ] Caching works (second visit = no LLM call)
   - [ ] All field types fill correctly (text, select, date, radio, checkbox)
   - [ ] React/Angular sites work
   - [ ] Dynamic/cascading fields handled
   - [ ] Manual override works and updates cache
   - [ ] Multi-page forms work (session data persists)
   - [ ] Language toggle works throughout
   - [ ] Error handling is user-friendly
   - [ ] No customer data persisted after "Clear Data"
   - [ ] Extension works offline for cached mappings (only extraction needs internet)

### Files Modified
```
Modified:
├── manifest.json (all_frames, keyboard shortcut)
├── popup/popup.html (multi-page data restore UI)
├── popup/popup.css (polish, animations)
├── popup/popup.js (multi-page, error recovery, polish)
├── content/scanner.js (iframe support)
├── content/filler.js (iframe support, toast notifications)
├── background/service-worker.js (keyboard shortcut handler)
└── settings/settings.html (usage guide)
```

---

## Summary

| Phase | Focus | Key Output |
|---|---|---|
| 1 | Extension skeleton + bilingual UI | Working popup with full layout |
| 2 | Settings + storage layer | API key management, caching infrastructure |
| 3 | Document extraction via Gemini | Upload photos → structured data |
| 4 | Form field scanning | Content script reads any form accurately |
| 5 | LLM field mapping + caching | Gemini maps data to form fields, cached |
| 6 | Form filling engine | All field types filled correctly |
| 7 | Manual override UI | Dad can review and correct mappings |
| 8 | Multi-page, polish, edge cases | Production-ready for daily use |

**Total estimated effort: 5-7 days of development**
