const ENGLISH_NAME_PARTS: Array<[string, string]> = [
  ['서울숲', 'Seoul Forest'],
  ['한강공원', 'Hangang Park'],
  ['문화센터', 'Culture Center'],
  ['문화회관', 'Cultural Center'],
  ['주민센터', 'Community Center'],
  ['초등학교', 'Elementary School'],
  ['중학교', 'Middle School'],
  ['고등학교', 'High School'],
  ['대학교', 'University'],
  ['도서관', 'Library'],
  ['체육센터', 'Sports Center'],
  ['복지관', 'Welfare Center'],
  ['구청', 'District Office'],
  ['시청', 'City Hall'],
  ['아파트', 'Apartments'],
  ['주차장', 'Parking Lot'],
  ['사거리', 'Intersection'],
  ['출구', 'Exit'],
  ['입구', 'Entrance'],
  ['공원', 'Park'],
  ['병원', 'Hospital'],
  ['시장', 'Market'],
  ['역', 'Station'],
  ['센터', 'Center'],
  ['앞', 'Front'],
]

const INITIALS = ['g', 'kk', 'n', 'd', 'tt', 'r', 'm', 'b', 'pp', 's', 'ss', '', 'j', 'jj', 'ch', 'k', 't', 'p', 'h']
const VOWELS = ['a', 'ae', 'ya', 'yae', 'eo', 'e', 'yeo', 'ye', 'o', 'wa', 'wae', 'oe', 'yo', 'u', 'wo', 'we', 'wi', 'yu', 'eu', 'ui', 'i']
const FINALS = ['', 'k', 'k', 'ks', 'n', 'nj', 'nh', 't', 'l', 'lk', 'lm', 'lb', 'ls', 'lt', 'lp', 'lh', 'm', 'p', 'ps', 't', 't', 'ng', 't', 't', 'k', 't', 'p', 't']

function romanizeHangul(value: string) {
  return [...value].map(character => {
    const code = character.charCodeAt(0) - 0xac00
    if (code < 0 || code > 11171) return character
    const initial = Math.floor(code / 588)
    const vowel = Math.floor((code % 588) / 28)
    const final = code % 28
    return `${INITIALS[initial]}${VOWELS[vowel]}${FINALS[final]}`
  }).join('')
}

function titleCase(value: string) {
  return value.replace(/\b[a-z]/g, character => character.toUpperCase())
}

export function localizeBikeStationName(name: string, locale: string) {
  if (locale !== 'en' || !/[가-힣]/.test(name)) return name
  let english = name
  for (const [korean, translated] of ENGLISH_NAME_PARTS) english = english.replaceAll(korean, ` ${translated} `)
  english = english.replace(/[가-힣]+/g, match => romanizeHangul(match))
    .replace(/\s+/g, ' ')
    .trim()
  return titleCase(english)
}
