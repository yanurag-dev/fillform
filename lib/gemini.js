// FillForm — Gemini API integration

const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
const VISION_MODEL = 'gemini-2.0-flash';

const EXTRACTION_PROMPT = `You are a document data extractor for Indian identity and education documents.
Documents may be in Hindi, English, or bilingual.

Extract ALL personal information from the provided document images.
Return a single flat JSON object with these possible keys (include only those found):

Personal:
- full_name, full_name_hindi, father_name, father_name_hindi, mother_name
- dob (format: DD/MM/YYYY), gender (Male/Female/Other)
- aadhaar_number (format: XXXX XXXX XXXX), pan_number
- phone, email

Address:
- address_line1, address_line2, city, district, state, pincode

Education:
- board_name, school_name, exam_name, roll_number
- marks_obtained, total_marks, percentage, grade, passing_year

Other:
- category (General/OBC/SC/ST/EWS), blood_group
- voter_id, passport_number

Rules:
- If a field is not visible in any document, omit it entirely
- Clean the data: remove extra spaces, fix obvious OCR errors
- For Aadhaar: format as "XXXX XXXX XXXX" (4-4-4 groups)
- Return ONLY valid JSON. No markdown, no explanation, no code blocks.`;

/**
 * Attempt to parse JSON from a text string.
 * Tries direct parse, then markdown code blocks, then brace extraction.
 * @param {string} text
 * @returns {Object}
 */
function parseJsonFromText(text) {
  // 1. Try direct parse
  try {
    return JSON.parse(text);
  } catch (_) { /* fall through */ }

  // 2. Try extracting from ```json ... ``` blocks
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    try {
      return JSON.parse(codeBlockMatch[1].trim());
    } catch (_) { /* fall through */ }
  }

  // 3. Find first { and last } and parse that substring
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try {
      return JSON.parse(text.slice(firstBrace, lastBrace + 1));
    } catch (_) { /* fall through */ }
  }

  const err = new Error('Could not parse JSON from Gemini response');
  err.code = 'PARSE_ERROR';
  throw err;
}

/**
 * Extract structured data from document images using Gemini Vision
 * @param {string} apiKey - Gemini API key
 * @param {Array} images - [{base64, mimeType, documentType}]
 * @returns {Promise<Object>} - Extracted data as flat JSON object
 */
export async function extractDataFromImages(apiKey, images) {
  const url = `${GEMINI_BASE_URL}/models/${VISION_MODEL}:generateContent?key=${apiKey}`;

  // Build the parts array: one inline_data part per image, then the text prompt
  const imageParts = images.map(img => ({
    inline_data: {
      mime_type: img.mimeType || 'image/jpeg',
      data: img.base64,
    }
  }));

  const requestBody = {
    system_instruction: {
      parts: [{
        text: 'You are an expert at reading Indian government and education documents. Extract data accurately from the provided images.'
      }]
    },
    contents: [{
      parts: [
        ...imageParts,
        { text: EXTRACTION_PROMPT }
      ]
    }],
    generationConfig: {
      temperature: 0.1,
      responseMimeType: 'application/json',
    }
  };

  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });
  } catch (networkErr) {
    const err = new Error('Network error: ' + networkErr.message);
    err.code = 'NETWORK_ERROR';
    throw err;
  }

  if (response.status === 400 || response.status === 403) {
    const err = new Error('Invalid API key or unauthorized request');
    err.code = 'INVALID_API_KEY';
    throw err;
  }

  if (response.status === 429) {
    const err = new Error('Rate limit exceeded. Please wait a moment and try again.');
    err.code = 'RATE_LIMIT';
    throw err;
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    const err = new Error(`Gemini API error ${response.status}: ${body}`);
    err.code = 'NETWORK_ERROR';
    throw err;
  }

  const json = await response.json();

  // Extract text from response
  const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    const err = new Error('Gemini returned an empty response');
    err.code = 'EMPTY_RESPONSE';
    throw err;
  }

  return parseJsonFromText(text);
}

const MAPPING_PROMPT = `You are a form-filling assistant for Indian government and education forms.

Given extracted user data and form field descriptors from a webpage, determine which data value should go into which form field.

User data (JSON):
{extractedData}

Form fields found on the page (JSON):
{fieldDescriptors}

Instructions:
1. For <select> fields, return the exact option VALUE (not text) that best matches. Do fuzzy/semantic matching — "Male" matches "M", "पुरुष", "MALE". Use the options array provided.
2. For date fields: detect expected format from placeholder or field context. Default for Indian forms: DD/MM/YYYY. If field type is "date" (HTML5 native), use YYYY-MM-DD format.
3. For radio buttons: the descriptor has a radioGroup with options. Return the VALUE attribute of the correct option to check.
4. For checkboxes: return "true" or "false".
5. Split address intelligently: if form has separate fields for address_line1, address_line2, city, district, state, pincode — distribute the address data accordingly.
6. Field labels may be in Hindi, English, or both. Match semantically.
7. "Guardian/अभिभावक/S.O./D/O/W/O" → father_name
8. "Permanent Address" and "Correspondence Address" → use the same address unless both are present with different values.
9. If no extracted data matches a field, omit it from the result.
10. For percentage fields, include the % sign only if the field expects it (check placeholder/label).

Return a JSON array ONLY: [{"selector": "css_selector", "value": "value_to_fill"}]
No markdown, no explanation.`;

/**
 * Map extracted document data to form field selectors using Gemini
 * @param {string} apiKey - Gemini API key
 * @param {Object} extractedData - Flat key-value object from document extraction
 * @param {Array} fieldDescriptors - Array of field descriptor objects from the scanner
 * @returns {Promise<Array>} - Array of {selector, value} objects
 */
export async function mapFieldsToData(apiKey, extractedData, fieldDescriptors) {
  const url = `${GEMINI_BASE_URL}/models/${VISION_MODEL}:generateContent?key=${apiKey}`;

  // Build compact representation of field descriptors — drop currentValue to reduce tokens
  const compactDescriptors = fieldDescriptors.map(f => {
    const compact = {
      selector: f.selector,
      type: f.type,
      label: f.label,
      placeholder: f.placeholder,
      nearbyText: f.nearbyText,
      required: f.required,
    };
    if (f.options) compact.options = f.options;
    if (f.radioGroup) compact.radioGroup = f.radioGroup;
    return compact;
  });

  const prompt = MAPPING_PROMPT
    .replace('{extractedData}', JSON.stringify(extractedData, null, 2))
    .replace('{fieldDescriptors}', JSON.stringify(compactDescriptors, null, 2));

  const requestBody = {
    system_instruction: {
      parts: [{
        text: 'You are an expert at mapping user data to HTML form fields for Indian government and education portals.'
      }]
    },
    contents: [{
      parts: [{ text: prompt }]
    }],
    generationConfig: {
      temperature: 0.1,
      responseMimeType: 'application/json',
    }
  };

  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });
  } catch (networkErr) {
    const err = new Error('Network error: ' + networkErr.message);
    err.code = 'NETWORK_ERROR';
    throw err;
  }

  if (response.status === 400 || response.status === 403) {
    const err = new Error('Invalid API key or unauthorized request');
    err.code = 'INVALID_API_KEY';
    throw err;
  }

  if (response.status === 429) {
    const err = new Error('Rate limit exceeded. Please wait a moment and try again.');
    err.code = 'RATE_LIMIT';
    throw err;
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    const err = new Error(`Gemini API error ${response.status}: ${body}`);
    err.code = 'NETWORK_ERROR';
    throw err;
  }

  const json = await response.json();

  const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    const err = new Error('Gemini returned an empty response');
    err.code = 'EMPTY_RESPONSE';
    throw err;
  }

  // Parse the JSON array response — try direct parse first, then extraction helpers
  let mappings;
  try {
    mappings = JSON.parse(text);
  } catch (_) {
    // Try extracting from markdown code block or first [...] bracket pair
    const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      try { mappings = JSON.parse(codeBlockMatch[1].trim()); } catch (_) { /* fall through */ }
    }
    if (!mappings) {
      const firstBracket = text.indexOf('[');
      const lastBracket = text.lastIndexOf(']');
      if (firstBracket !== -1 && lastBracket > firstBracket) {
        try { mappings = JSON.parse(text.slice(firstBracket, lastBracket + 1)); } catch (_) { /* fall through */ }
      }
    }
  }

  if (!Array.isArray(mappings)) {
    const err = new Error('Could not parse mapping JSON array from Gemini response');
    err.code = 'PARSE_ERROR';
    throw err;
  }

  // Validate each entry has selector and value
  return mappings.filter(m => m && typeof m.selector === 'string' && m.value !== undefined);
}
