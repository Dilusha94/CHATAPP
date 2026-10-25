// Name filter for nicknames and group names. Edit the lists below as you see abuse
// (lowercase, letters only). Chat messages are NOT filtered, only the names people pick.
//
// How a name is checked:
//   1. Look-alike characters are mapped back (0→o, 1→i, 3→e, 4/@→a, 5/$→s, 7→t, 8→b, vv→w)
//      and everything that isn't a letter is dropped, so "F_u.c-k", "fvck" and "s3x" are caught.
//   2. Known innocent words (SAFE) are removed first, so "Essex" or "Peacock" still pass.
//   3. ANYWHERE words are blocked wherever they appear, also with stretched letters ("fuuuck").
//   4. WHOLE words are blocked only as a separate word ("ass" blocks "Big Ass" / "BigAss"
//      but not "Classic" or "Assam"), because they hide inside many normal words.
//   5. Ages under 18 in the name ("16yo", "15 yrs") are blocked: this is an 18+ site.

const ANYWHERE = [
  // pretending to be staff
  'admin', 'moderator', 'support', 'official', 'staff', 'chatnow', 'owner',
  // sexual / under-age
  'sex', 'porn', 'nude', 'naked', 'horny', 'hookup', 'escort', 'onlyfans', 'nsfw', 'xxx', 'boob', 'pussy',
  'penis', 'vagina', 'dick', 'cock', 'blowjob', 'handjob', 'milf', 'incest', 'pedo', 'paedo', 'loli', 'teen',
  'young', 'underage', 'schoolgirl', 'schoolboy', 'virgin', 'fetish', 'bdsm', 'camgirl', 'webcam', 'sugardaddy', 'sugarbaby',
  'cumshot', 'cumslut',
  // English insults and slurs
  'fuck', 'shit', 'bitch', 'cunt', 'whore', 'slut', 'bastard', 'asshole', 'arsehole', 'nigger', 'nigga', 'faggot',
  'retard', 'motherf', 'wanker', 'bollock', 'twat', 'prick', 'douche', 'jackass', 'dumbass', 'killyourself',
  // Sinhala insults in English letters (Singlish): ask a Sinhala speaker to review and extend
  'pakaya', 'pakaa', 'huththa', 'huththi', 'huttha', 'hutta', 'hutto', 'ponnaya', 'ponnayo', 'kariya', 'kariyo',
  'keriya', 'wesige', 'vesige', 'wesi', 'vesi', 'kimba', 'pimpiya',
];

const WHOLE = new Set([
  'mod', 'ass', 'tit', 'tits', 'cum', 'rape', 'anal', 'kid', 'kids', 'child', 'minor',
  'fuk', 'fck', 'fag', 'hoe', 'hoes', 'piss', 'kys',
  'paka', 'puka', 'pukaya', 'hukanna', 'hukapan',
]);

// Innocent words that contain a blocked word; removed before checking
const SAFE = [
  'essex', 'sussex', 'middlesex', 'wessex', 'sextant', 'sextet', 'dickens', 'dickson', 'dickinson', 'benedick',
  'peacock', 'hancock', 'cockpit', 'cocktail', 'cockroach', 'hitchcock', 'babcock', 'scunthorpe', 'shiitake',
  'shitake', 'kariyawasam', 'virginia', 'torpedo', 'lollipop', 'eighteen', 'nineteen', 'canteen', 'youngster',
];

// "16yo", "15 yrs", "17y", "9 years"
const UNDER_AGE = /(^|[^0-9])(1[0-7]|[1-9])\s*(yo|y\/o|yrs?|years?|y)(?![a-z])/i;

const LEET = { '0': 'o', '1': 'i', '!': 'i', '|': 'i', '3': 'e', '4': 'a', '@': 'a', '5': 's', '$': 's', '7': 't', '8': 'b', '9': 'g', '+': 't' };
const letters = s => s.toLowerCase().replace(/[0-9!|@$+]/g, c => LEET[c]).replace(/vv/g, 'w').replace(/[^a-z]/g, '');
const stripSafe = s => SAFE.reduce((out, w) => out.split(w).join(''), s);
// Each letter may be stretched ("fuuuck"), but never shortened ("bob" is not "boob")
const stretch = w => w.split('').map(c => c + '+').join('');
const ANYWHERE_RE = new RegExp(ANYWHERE.map(stretch).join('|'));
const WHOLE_RE = new RegExp(`^(${[...WHOLE].map(stretch).join('|')})$`);

/** true when a nickname / group name contains a blocked word */
export function isBadName(name) {
  const raw = String(name || '');
  if (UNDER_AGE.test(raw)) return true;
  const all = stripSafe(letters(raw));
  if (ANYWHERE_RE.test(all) || ANYWHERE_RE.test(all.replace(/v/g, 'u'))) return true; // "fvck" -> "fuck"
  // whole words: split on spaces, _ - . and camelCase ("BigAss" -> big, ass)
  return raw.replace(/([a-z])([A-Z])/g, '$1 $2').split(/[\s_\-.]+/).some(t => WHOLE_RE.test(letters(t)));
}
