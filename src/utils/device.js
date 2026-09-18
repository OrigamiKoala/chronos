// Detects whether the current device is a Chromebook (ChromeOS)
export function isChromebook() {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;

  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.has('chromebook')) {
    const val = urlParams.get('chromebook');
    return val !== '0' && val !== 'false';
  }

  try {
    if (localStorage.getItem('force_chromebook') === 'true') return true;
    if (localStorage.getItem('force_chromebook') === 'false') return false;
  } catch (e) {
    void e;
  }

  if (navigator.userAgentData?.platform && /Chrome\s*OS/i.test(navigator.userAgentData.platform)) {
    return true;
  }

  const ua = navigator.userAgent || '';
  if (/\bCrOS\b/i.test(ua) || /Chromebook/i.test(ua) || /ChromeOS/i.test(ua)) {
    return true;
  }

  return false;
}
