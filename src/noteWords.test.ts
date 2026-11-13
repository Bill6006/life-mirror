import { describe, expect, it } from 'vitest'
import { coarseOf, holdsWords, NOTE_WORD_LONGEST, NOTE_WORD_SHORTEST, NOTE_WORDS_MOST, parseNoteWords } from './noteWords'

// Words searched for in notes (2026-11-13): whole words only, the rule the Worker's lookup and the answer's checker share.

describe('the words of a search', () => {
  it('are one to five words or phrases, separated by commas, each said once', () => {
    expect(parseNoteWords('yell')).toEqual({ ok: true, words: ['yell'] })
    expect(parseNoteWords(' yell , yelled,  yelled at ')).toEqual({ ok: true, words: ['yell', 'yelled', 'yelled at'] })
    // Said twice, case aside, it is searched once; an empty place between commas is nothing.
    expect(parseNoteWords('Yell,yell,,YELL')).toEqual({ ok: true, words: ['Yell'] })
    // Any run of spaces inside a phrase is one space; a curly apostrophe is the plain one.
    expect(parseNoteWords('didn’t   sleep')).toEqual({ ok: true, words: ["didn't sleep"] })
    expect(parseNoteWords('self-care, 5k')).toEqual({ ok: true, words: ['self-care', '5k'] })
  })

  it('are refused when there are none, more than five, or one is too short, too long or holds another character', () => {
    expect(parseNoteWords('')).toEqual({ ok: false, reason: 'q: the words to search for' })
    expect(parseNoteWords(' , ,')).toEqual({ ok: false, reason: 'q: the words to search for' })
    expect(parseNoteWords('a,b,c,d,e,f'.replace(/\w/g, (c) => c + c))).toEqual({ ok: false, reason: 'at most 5 words or phrases in one search' })
    expect(parseNoteWords('aa,bb,cc,dd,ee')).toMatchObject({ ok: true })
    expect(parseNoteWords('y')).toEqual({ ok: false, reason: 'each word or phrase is 2 to 40 characters' })
    expect(parseNoteWords('y'.repeat(41))).toEqual({ ok: false, reason: 'each word or phrase is 2 to 40 characters' })
    expect(parseNoteWords('y'.repeat(40))).toMatchObject({ ok: true })
    for (const bad of ['yell%', 'ye_ll', 'yell"', 'yell.', '-yell', "yell'", 'ye*', 'a(b)', 'x\\y', 'yell;drop']) expect(parseNoteWords(bad), bad).toEqual({ ok: false, reason: 'a word or phrase holds letters, digits, spaces, apostrophes and hyphens only' })
    // The limits, stated as they are.
    expect([NOTE_WORDS_MOST, NOTE_WORD_SHORTEST, NOTE_WORD_LONGEST]).toEqual([5, 2, 40])
  })
})

describe('a whole word', () => {
  it('is found only where no letter or digit stands beside it', () => {
    expect(holdsWords('I yell at the tv', 'yell')).toBe(true)
    // Inside a longer word it is not the word: no stems, no endings.
    for (const text of ['I yelled at him', 'yelling again', 'a yellow day', 'unyell', 'yell2', '2yell']) expect(holdsWords(text, 'yell'), text).toBe(false)
    // Beside punctuation, at the start and the end of the note, and of a line.
    for (const text of ['Yell.', 'yell', '(yell)', '"yell"', 'yell, then quiet', 'quiet, then yell', 'so\nyell\nagain', 'yell-fest', 'a yell!', 'it’s a yell']) expect(holdsWords(text, 'yell'), text).toBe(true)
  })

  it('is found whatever its letter case, an accented letter included', () => {
    expect(holdsWords('YELLED at him', 'yelled')).toBe(true)
    expect(holdsWords('yelled at him', 'Yelled')).toBe(true)
    expect(holdsWords('at the CAFÉ again', 'café')).toBe(true)
    // An accented letter beside it is a letter: the word is not whole.
    expect(holdsWords('cafés', 'café')).toBe(false)
    expect(holdsWords('école', 'cole')).toBe(false)
  })

  it('is a phrase whose words may be any space apart, a line break among them', () => {
    expect(holdsWords('I yelled at him', 'yelled at')).toBe(true)
    expect(holdsWords('I yelled\nat him', 'yelled at')).toBe(true)
    expect(holdsWords('I yelled   at him', 'yelled  at')).toBe(true)
    expect(holdsWords('I yelled, at him', 'yelled at')).toBe(false)
    expect(holdsWords('I yelled attic', 'yelled at')).toBe(false)
    // Either apostrophe is the same apostrophe, in the note and in the words.
    expect(holdsWords('I didn’t sleep', "didn't sleep")).toBe(true)
    expect(holdsWords("I didn't sleep", 'didn’t sleep')).toBe(true)
    // A character that means something to a pattern is read as itself.
    expect(holdsWords('self-care day', 'self-care')).toBe(true)
    expect(holdsWords('selfXcare day', 'self-care')).toBe(false)
    expect(holdsWords('anything', '')).toBe(false)
  })
})

describe('what the database is asked for first', () => {
  it('is the longest run of plain letters and digits in the words, or nothing when there is none of two', () => {
    expect(coarseOf('yell')).toBe('yell')
    expect(coarseOf('yelled at')).toBe('yelled')
    expect(coarseOf("didn't sleep")).toBe('sleep')
    expect(coarseOf('self-care')).toBe('self')
    // Only plain letters are matched by the database whatever the case: an accented word is left to the reader.
    expect(coarseOf('café')).toBe('caf')
    expect(coarseOf('été')).toBeNull()
    expect(coarseOf('5k')).toBe('5k')
  })
})
