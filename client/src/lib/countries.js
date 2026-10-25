// ISO-3166 alpha-2 codes. Names come from the browser (Intl.DisplayNames), so no big data file.
const CODES = 'LK,IN,US,GB,AU,CA,AE,QA,SA,KW,OM,BH,MV,PK,BD,NP,SG,MY,JP,KR,IT,DE,FR,NZ,IL,CY,AF,AL,DZ,AD,AO,AR,AM,AT,AZ,BS,BY,BE,BZ,BJ,BT,BO,BA,BW,BR,BN,BG,BF,BI,KH,CM,CV,CF,TD,CL,CN,CO,KM,CG,CD,CR,CI,HR,CU,CZ,DK,DJ,DM,DO,EC,EG,SV,GQ,ER,EE,SZ,ET,FJ,FI,GA,GM,GE,GH,GR,GD,GT,GN,GW,GY,HT,HN,HK,HU,IS,ID,IR,IQ,IE,JM,JO,KZ,KE,KI,KG,LA,LV,LB,LS,LR,LY,LI,LT,LU,MO,MG,MW,ML,MT,MH,MR,MU,MX,FM,MD,MC,MN,ME,MA,MZ,MM,NA,NR,NL,NI,NE,NG,MK,NO,PW,PS,PA,PG,PY,PE,PH,PL,PT,PR,RO,RU,RW,KN,LC,VC,WS,SM,ST,SN,RS,SC,SL,SK,SI,SB,SO,ZA,SS,ES,SD,SR,SE,CH,SY,TW,TJ,TZ,TH,TL,TG,TO,TT,TN,TR,TM,TV,UG,UA,UY,UZ,VU,VE,VN,YE,ZM,ZW'.split(',');

const names = typeof Intl.DisplayNames === 'function' ? new Intl.DisplayNames(['en'], { type: 'region' }) : null;
export const countryName = code => (names ? names.of(code) : code) || code;

const TOP = 9; // first entries stay on top (local markets)
export const COUNTRIES = [
  ...CODES.slice(0, TOP).map(code => ({ code, name: countryName(code) })),
  ...CODES.slice(TOP).map(code => ({ code, name: countryName(code) })).sort((a, b) => a.name.localeCompare(b.name)),
];

export const LK_PROVINCES = ['Western', 'Central', 'Southern', 'Northern', 'Eastern', 'North Western', 'North Central', 'Uva', 'Sabaragamuwa'];

// Time zones of the main markets; a time zone says more about location than the browser language
const TZ = { 'Asia/Colombo': 'LK', 'Asia/Kolkata': 'IN', 'Asia/Calcutta': 'IN', 'Asia/Dubai': 'AE', 'Asia/Qatar': 'QA', 'Asia/Riyadh': 'SA', 'Asia/Kuwait': 'KW', 'Asia/Muscat': 'OM', 'Asia/Bahrain': 'BH', 'Indian/Maldives': 'MV', 'Asia/Karachi': 'PK', 'Asia/Dhaka': 'BD', 'Asia/Kathmandu': 'NP', 'Asia/Singapore': 'SG', 'Asia/Kuala_Lumpur': 'MY', 'Asia/Tokyo': 'JP', 'Asia/Seoul': 'KR', 'Europe/London': 'GB', 'Europe/Rome': 'IT', 'Europe/Berlin': 'DE', 'Europe/Paris': 'FR', 'Pacific/Auckland': 'NZ', 'Asia/Jerusalem': 'IL', 'Asia/Nicosia': 'CY' };

/** Only a fallback for local development: on the live site Cloudflare tells the server the real country. */
export function guessCountry() {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  if (TZ[tz]) return TZ[tz];
  if (tz.startsWith('Australia/')) return 'AU';
  const lang = (navigator.language || '').split('-')[1];
  if (lang && CODES.includes(lang)) return lang;
  return 'US';
}
