export function supportsNativeCollector() {
  const version = /(?:^|\s)NTripAndroid\/(\d+)\.(\d+)(?:\.\d+)?(?=\s|$)/.exec(navigator.userAgent);
  return Boolean(version && (Number(version[1]) > 0 || Number(version[2]) >= 5));
}
