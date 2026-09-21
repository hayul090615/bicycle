const HANGUL_SYLLABLE = /^[\uAC00-\uD7A3]$/u
const HANGUL_JAMO = /^[\u1100-\u11FF\u3130-\u318F\uA960-\uA97F\uD7B0-\uD7FF]$/u

export const toCharacters = (text: string) => Array.from(text.normalize('NFC'))

export const isCompletedInputUnit = (character: string) =>
  HANGUL_SYLLABLE.test(character) || !HANGUL_JAMO.test(character)

const ROMAN_INITIALS = ['g', 'kk', 'n', 'd', 'tt', 'r', 'm', 'b', 'pp', 's', 'ss', '', 'j', 'jj', 'ch', 'k', 't', 'p', 'h']
const ROMAN_VOWELS = ['a', 'ae', 'ya', 'yae', 'eo', 'e', 'yeo', 'ye', 'o', 'wa', 'wae', 'oe', 'yo', 'u', 'wo', 'we', 'wi', 'yu', 'eu', 'ui', 'i']
const ROMAN_FINALS = ['', 'k', 'k', 'ks', 'n', 'nj', 'nh', 't', 'l', 'lk', 'lm', 'lp', 'ls', 'lt', 'lp', 'lh', 'm', 'p', 'ps', 't', 't', 'ng', 't', 't', 'k', 't', 'p', 'h']

export function romanizeHangul(text: string) {
  const romanized = toCharacters(text).map((character) => {
    const code = character.charCodeAt(0)
    if (code < 0xac00 || code > 0xd7a3) return character
    const syllable = code - 0xac00
    const initial = Math.floor(syllable / 588)
    const vowel = Math.floor((syllable % 588) / 28)
    const final = syllable % 28
    return `${ROMAN_INITIALS[initial]}${ROMAN_VOWELS[vowel]}${ROMAN_FINALS[final]}`
  }).join('')
  return romanized.replace(/(^|\s)([a-z])/gu, (_, space: string, letter: string) => `${space}${letter.toUpperCase()}`)
}

export interface InputAnalysis {
  inputCharacters: string[]
  targetCharacters: string[]
  validPrefixLength: number
  firstWrongIndex: number
  isWrong: boolean
  isComplete: boolean
  progress: number
}

export function analyzeInput(input: string, target: string): InputAnalysis {
  const inputCharacters = toCharacters(input)
  const targetCharacters = toCharacters(target)
  let validPrefixLength = 0

  for (let index = 0; index < inputCharacters.length && index < targetCharacters.length; index += 1) {
    const character = inputCharacters[index]
    if (!isCompletedInputUnit(character) || character !== targetCharacters[index]) break
    validPrefixLength += 1
  }

  const firstWrongIndex = inputCharacters.findIndex(
    (character, index) => index >= targetCharacters.length ||
      (isCompletedInputUnit(character) && character !== targetCharacters[index]),
  )
  const isWrong = firstWrongIndex !== -1
  const isComplete = !isWrong && validPrefixLength === targetCharacters.length

  return {
    inputCharacters,
    targetCharacters,
    validPrefixLength,
    firstWrongIndex,
    isWrong,
    isComplete,
    progress: targetCharacters.length === 0 ? 1 : validPrefixLength / targetCharacters.length,
  }
}
