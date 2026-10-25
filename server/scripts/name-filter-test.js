// Name filter tests (no server needed): node scripts/name-filter-test.js
import { isBadName } from '../src/badwords.js';

const BLOCK = [
  'fuck', 'FuckYou', 'fvck boy', 'f_u_c_k', 'fuuuuck', 'Sh1t', 'b1tch', 'b!tch', 'Big Ass', 'BigAss', 'ass_lover',
  'hotsex', 's3xy', 'SEXY_GIRL', 'p0rn', 'nude pics', 'escort lk', 'xxx', 'Admin', 'ChatNow Support', 'Moderator',
  'mod', 'teen girl', '16yo', 'girl 15 yrs', 'little kid', 'pakaya', 'Huththa', 'ponnaya123', 'kariya', 'wesi',
  'Paka', 'puka', 'nigga', 'k1llyourself', 'cumshot', 'cum', 'r4pe', 'pussy cat',
];
const ALLOW = [
  'Kasun', 'Nimali', 'Ruwan', 'Essex boy', 'Middlesex', 'Classic', 'Assam', 'Bassist', 'Grass', 'Grape', 'Title',
  'Peacock', 'Hancock', 'Dickens', 'Analyst', 'Document', 'Cucumber', 'Kariyawasam', 'Virginia', 'Torpedo',
  'Pakistani', 'Sunny', 'Dilusha', 'Model', 'Modern', 'Kidney', 'Childish Gambino', 'Shiitake', 'Eighteen',
  'Bob', 'Mr Bean', 'Coffee Lover', 'Gamer_99', 'Tharushi 22', 'Saman 1995', 'Colombo guy',
];

let fails = 0;
for (const n of BLOCK) if (!isBadName(n)) { console.log(`FAIL  should block: "${n}"`); fails++; }
for (const n of ALLOW) if (isBadName(n)) { console.log(`FAIL  should allow: "${n}"`); fails++; }
console.log(fails ? `\nName filter: ${fails} FAILED` : `Name filter: ${BLOCK.length} blocked, ${ALLOW.length} allowed: ALL PASSED\n`);
process.exit(fails ? 1 : 0);
