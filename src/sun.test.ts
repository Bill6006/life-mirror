import { describe, expect, it } from 'vitest'
import { parsePlace, placeText, sunUtc } from './sun'

// Part 35: sunrise and sunset from a coarse place, by NOAA's solar equations, checked against the
// published times for New York City (40.7, -74.0) and a polar day, in UTC so the check does not
// depend on the machine's own time zone.

const NYC = { lat: 40.7, lon: -74.0 }
const hhmm = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(Math.round(m % 60)).padStart(2, '0')}`
const near = (m: number, h: number, min: number, tol = 3) => Math.abs(m - (h * 60 + min)) <= tol

describe('the sun from where you are', () => {
  it('rises and sets within a few minutes of the published times, summer and winter', () => {
    // 2024-06-21: sunrise 5:25 EDT (09:25 UTC), sunset 8:31 pm EDT (00:31 UTC the next day).
    const june = sunUtc('2024-06-21', NYC)!
    expect(near(june.rise, 9, 25), hhmm(june.rise)).toBe(true)
    expect(near(june.set, 24, 31), hhmm(june.set)).toBe(true)
    // 2024-12-21: sunrise 7:16 EST (12:16 UTC), sunset 4:32 pm EST (21:32 UTC).
    const december = sunUtc('2024-12-21', NYC)!
    expect(near(december.rise, 12, 16), hhmm(december.rise)).toBe(true)
    expect(near(december.set, 21, 32), hhmm(december.set)).toBe(true)
  })

  it('says nothing on a day the sun neither rises nor sets', () => {
    expect(sunUtc('2024-06-21', { lat: 78.2, lon: 15.6 })).toBeNull()
    expect(sunUtc('2024-12-21', { lat: 78.2, lon: 15.6 })).toBeNull()
  })

  it('takes a place typed as latitude and longitude, rounded to one decimal, and nothing else', () => {
    expect(parsePlace('40.7128, -74.0060')).toEqual({ lat: 40.7, lon: -74 })
    expect(parsePlace(' 51.5 -0.1 ')).toEqual({ lat: 51.5, lon: -0.1 })
    expect(parsePlace('New York')).toBeNull()
    expect(parsePlace('95, 10')).toBeNull()
    expect(parsePlace('40, 200')).toBeNull()
    expect(placeText({ lat: 40.7, lon: -74 })).toBe('40.7, -74.0')
  })
})
