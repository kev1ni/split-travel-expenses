export const TRAVEL_COUNTRIES = [
  { code: 'KR', name: '대한민국', defaultCurrency: 'KRW', flag: '🇰🇷' },
  { code: 'JP', name: '일본', defaultCurrency: 'JPY', flag: '🇯🇵' },
  { code: 'US', name: '미국', defaultCurrency: 'USD', flag: '🇺🇸' },
  { code: 'TH', name: '태국', defaultCurrency: 'THB', flag: '🇹🇭' },
  { code: 'VN', name: '베트남', defaultCurrency: 'VND', flag: '🇻🇳' },
  { code: 'FR', name: '프랑스', defaultCurrency: 'EUR', flag: '🇫🇷' },
  { code: 'IT', name: '이탈리아', defaultCurrency: 'EUR', flag: '🇮🇹' },
  { code: 'ES', name: '스페인', defaultCurrency: 'EUR', flag: '🇪🇸' },
  { code: 'GB', name: '영국', defaultCurrency: 'GBP', flag: '🇬🇧' },
  { code: 'TW', name: '대만', defaultCurrency: 'TWD', flag: '🇹🇼' },
  { code: 'SG', name: '싱가포르', defaultCurrency: 'SGD', flag: '🇸🇬' },
  { code: 'OTHER', name: '기타 국가', defaultCurrency: 'KRW', flag: '🌍' },
];

export function getCountryByCode(code) {
  return TRAVEL_COUNTRIES.find((country) => country.code === code) || null;
}
