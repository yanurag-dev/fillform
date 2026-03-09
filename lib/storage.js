// Keys used in chrome.storage.local
const KEYS = {
  API_KEY: 'gemini_api_key',
  MAPPINGS: 'field_mappings',
  LANGUAGE: 'language_preference',
  SESSION_DATA: 'session_extracted_data',
};

// --- API Key ---

export async function getApiKey() {
  const result = await chrome.storage.local.get(KEYS.API_KEY);
  return result[KEYS.API_KEY] ?? null;
}

export async function setApiKey(key) {
  await chrome.storage.local.set({ [KEYS.API_KEY]: key });
}

// --- Field Mapping Cache ---
// urlPattern is the normalized URL string
// mapping format: { fieldStructure: [...selectors], dataKeyMapping: { selector: dataKey }, lastUsed: ISO string }

export async function getCachedMapping(urlPattern) {
  const result = await chrome.storage.local.get(KEYS.MAPPINGS);
  const mappings = result[KEYS.MAPPINGS] ?? {};
  return mappings[urlPattern] ?? null;
}

export async function setCachedMapping(urlPattern, mapping) {
  const result = await chrome.storage.local.get(KEYS.MAPPINGS);
  const mappings = result[KEYS.MAPPINGS] ?? {};
  mappings[urlPattern] = { ...mapping, lastUsed: new Date().toISOString() };
  await chrome.storage.local.set({ [KEYS.MAPPINGS]: mappings });
}

export async function deleteCachedMapping(urlPattern) {
  const result = await chrome.storage.local.get(KEYS.MAPPINGS);
  const mappings = result[KEYS.MAPPINGS] ?? {};
  delete mappings[urlPattern];
  await chrome.storage.local.set({ [KEYS.MAPPINGS]: mappings });
}

export async function getAllMappings() {
  const result = await chrome.storage.local.get(KEYS.MAPPINGS);
  return result[KEYS.MAPPINGS] ?? {};
}

export async function clearAllMappings() {
  await chrome.storage.local.set({ [KEYS.MAPPINGS]: {} });
}

// --- Session Data (volatile, cleared on browser close) ---

export async function setSessionData(data) {
  await chrome.storage.session.set({ [KEYS.SESSION_DATA]: data });
}

export async function getSessionData() {
  const result = await chrome.storage.session.get(KEYS.SESSION_DATA);
  return result[KEYS.SESSION_DATA] ?? null;
}

export async function clearSessionData() {
  await chrome.storage.session.remove(KEYS.SESSION_DATA);
}

// --- Language Preference ---
// Returns 'both' | 'hi' | 'en', default 'both'

export async function getLanguagePreference() {
  const result = await chrome.storage.local.get(KEYS.LANGUAGE);
  return result[KEYS.LANGUAGE] ?? 'both';
}

export async function setLanguagePreference(lang) {
  await chrome.storage.local.set({ [KEYS.LANGUAGE]: lang });
}
