const translations = {
  hi: {
    appTitle: 'फॉर्म फिलर',
    step1Title: 'दस्तावेज़ अपलोड करें',
    uploadBtn: 'फोटो चुनें',
    extractBtn: 'डेटा निकालें',
    extracting: 'डेटा निकाला जा रहा है...',
    step2Title: 'डेटा जांचें',
    addFieldBtn: 'फ़ील्ड जोड़ें',
    step3Title: 'फॉर्म भरें',
    fillBtn: 'फॉर्म भरें',
    filling: 'फॉर्म भरा जा रहा है...',
    showMappingBtn: 'मैपिंग देखें',
    clearBtn: 'डेटा मिटाएं',
    settingsTitle: 'सेटिंग्स',
    noApiKey: 'API key नहीं मिली। सेटिंग्स में जाएं।',
    noImages: 'कृपया पहले दस्तावेज़ अपलोड करें',
    scanningFields: 'फ़ील्ड स्कैन हो रहे हैं...',
    mappingFields: 'मैपिंग हो रही है...',
    fieldsFilled: 'फ़ील्ड भरे गए',
    fieldsNotFilled: 'फ़ील्ड नहीं भरे जा सके',
    cacheHit: 'कैश से मैपिंग मिली',
    networkError: 'इंटरनेट कनेक्शन जांचें',
    invalidKey: 'API key गलत है',
    noForm: 'इस पेज पर कोई फॉर्म नहीं मिला',
    prevDataFound: 'पिछला डेटा मिला',
    usePrevData: 'पिछला डेटा उपयोग करें',
    startFresh: 'नया शुरू करें',
    // Field labels
    fullName: 'पूरा नाम',
    fatherName: 'पिता का नाम',
    motherName: 'माता का नाम',
    dob: 'जन्मतिथि',
    gender: 'लिंग',
    aadhaar: 'आधार नंबर',
    pan: 'पैन नंबर',
    phone: 'मोबाइल नंबर',
    email: 'ईमेल',
    address: 'पता',
    city: 'शहर',
    state: 'राज्य',
    pincode: 'पिन कोड',
    marks: 'अंक',
    percentage: 'प्रतिशत',
    rollNo: 'रोल नंबर',
    board: 'बोर्ड',
    school: 'विद्यालय',
    category: 'वर्ग',
    // Doc types
    docAadhaar: 'आधार',
    docPan: 'पैन',
    docMarksheet: 'मार्कशीट',
    docVoterId: 'वोटर आईडी',
    docOther: 'अन्य',
  },
  en: {
    appTitle: 'Form Filler',
    step1Title: 'Upload Documents',
    uploadBtn: 'Select Photos',
    extractBtn: 'Extract Data',
    extracting: 'Extracting data...',
    step2Title: 'Review Data',
    addFieldBtn: 'Add Field',
    step3Title: 'Fill Form',
    fillBtn: 'Fill Form',
    filling: 'Filling form...',
    showMappingBtn: 'Show Mapping',
    clearBtn: 'Clear Data',
    settingsTitle: 'Settings',
    noApiKey: 'API key not set. Go to Settings.',
    noImages: 'Please upload documents first',
    scanningFields: 'Scanning fields...',
    mappingFields: 'Mapping fields...',
    fieldsFilled: 'fields filled',
    fieldsNotFilled: 'fields could not be filled',
    cacheHit: 'Mapping found in cache',
    networkError: 'Check internet connection',
    invalidKey: 'Invalid API key',
    noForm: 'No form found on this page',
    prevDataFound: 'Previous data found',
    usePrevData: 'Use previous data',
    startFresh: 'Start fresh',
    fullName: 'Full Name',
    fatherName: 'Father\'s Name',
    motherName: 'Mother\'s Name',
    dob: 'Date of Birth',
    gender: 'Gender',
    aadhaar: 'Aadhaar Number',
    pan: 'PAN Number',
    phone: 'Mobile Number',
    email: 'Email',
    address: 'Address',
    city: 'City',
    state: 'State',
    pincode: 'PIN Code',
    marks: 'Marks',
    percentage: 'Percentage',
    rollNo: 'Roll Number',
    board: 'Board',
    school: 'School',
    category: 'Category',
    docAadhaar: 'Aadhaar',
    docPan: 'PAN',
    docMarksheet: 'Marksheet',
    docVoterId: 'Voter ID',
    docOther: 'Other',
  }
};

/**
 * Returns "हिंदी / English" bilingual format for a key
 */
export function getBilingual(key) {
  const hi = translations.hi[key] || key;
  const en = translations.en[key] || key;
  if (hi === en) return en;
  return `${hi} / ${en}`;
}

/**
 * Returns text in specified language
 */
export function getText(key, lang) {
  if (lang === 'hi') return translations.hi[key] || translations.en[key] || key;
  if (lang === 'en') return translations.en[key] || translations.hi[key] || key;
  return getBilingual(key);
}

/**
 * Applies language to all elements with data-i18n attribute
 * lang: 'hi' | 'en' | 'both'
 */
export function applyLanguage(lang) {
  const elements = document.querySelectorAll('[data-i18n]');
  elements.forEach(el => {
    const key = el.getAttribute('data-i18n');
    el.textContent = getText(key, lang === 'both' ? null : lang);
  });

  // Update placeholder texts
  const placeholderEls = document.querySelectorAll('[data-i18n-placeholder]');
  placeholderEls.forEach(el => {
    const key = el.getAttribute('data-i18n-placeholder');
    el.placeholder = getText(key, lang === 'both' ? null : lang);
  });
}

export { translations };
