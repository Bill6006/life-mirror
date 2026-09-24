// The few line icons the themes use where they speed scanning: the tabs, the three blocks of the
// day, each commitment's kind and each Settings section. One set, drawn by hand, 24 units square,
// stroked in the text colour. Every theme gets the same markup; a theme that draws no icons hides
// them in styles.css. Always decorative: the words beside them carry the meaning.

const PATHS = {
  now: 'M12 3.8a8.2 8.2 0 1 0 0 16.4 8.2 8.2 0 0 0 0-16.4zM12 7.2V12h4',
  mirror: 'M4 18.5h16M6.5 15.5V10M10.5 15.5V6.5M14.5 15.5v-5M18.5 15.5V8',
  moves: 'M4 17.5l5-5 3.5 3.5L20 8.5M14.5 8.5H20V14',
  aims: 'M12 3.8a8.2 8.2 0 1 0 0 16.4 8.2 8.2 0 0 0 0-16.4zM12 7.6a4.4 4.4 0 1 0 0 8.8 4.4 4.4 0 0 0 0-8.8zM12 11a1 1 0 1 0 0 2 1 1 0 0 0 0-2z',
  settings: 'M4 7h9M17 7h3M4 17h3M11 17h9M15 5a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM9 15a2 2 0 1 0 0 4 2 2 0 0 0 0-4z',
  morning: 'M12 4v3M5.6 9.6l1.4 1.4M18.4 9.6 17 11M3 17.5h18M7.5 17.5a4.5 4.5 0 0 1 9 0',
  afternoon: 'M12 8.2a3.8 3.8 0 1 0 0 7.6 3.8 3.8 0 0 0 0-7.6zM12 3.5v2M12 18.5v2M3.5 12h2M18.5 12h2M6 6l1.4 1.4M16.6 16.6 18 18M6 18l1.4-1.4M16.6 7.4 18 6',
  evening: 'M19.5 14.2A7.8 7.8 0 1 1 9.8 4.5a6.2 6.2 0 0 0 9.7 9.7z',
  study: 'M5 5.8A2.3 2.3 0 0 1 7.3 3.5H19v15.2H7.3A2.3 2.3 0 0 0 5 21zM5 20.5V5.8',
  practice: 'M6.5 7.5v9M17.5 7.5v9M3.8 10v4M20.2 10v4M6.5 12h11',
  person: 'M9 5.2a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM3.8 19a5.2 5.2 0 0 1 10.4 0M16.8 6.8a2.4 2.4 0 1 0 0 4.8 2.4 2.4 0 0 0 0-4.8zM15.6 14.1a4.4 4.4 0 0 1 5 4.4',
  social: 'M9 5.2a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM3.8 19a5.2 5.2 0 0 1 10.4 0M16.8 6.8a2.4 2.4 0 1 0 0 4.8 2.4 2.4 0 0 0 0-4.8zM15.6 14.1a4.4 4.4 0 0 1 5 4.4',
  partner: 'M12 19.6s-7-4.3-7-9.8a3.9 3.9 0 0 1 7-2.4 3.9 3.9 0 0 1 7 2.4c0 5.5-7 9.8-7 9.8z',
  week: 'M6.8 5.2h10.4a3 3 0 0 1 3 3v8.6a3 3 0 0 1-3 3H6.8a3 3 0 0 1-3-3V8.2a3 3 0 0 1 3-3zM8.2 3.4v3.6M15.8 3.4v3.6M3.8 10h16.4',
  bell: 'M6.3 16.2v-4.8a5.7 5.7 0 0 1 11.4 0v4.8l1.4 1.8H4.9zM10.1 20.3a2 2 0 0 0 3.8 0',
  extras: 'M19.5 14.2A7.8 7.8 0 1 1 9.8 4.5a6.2 6.2 0 0 0 9.7 9.7z',
  spark: 'M12 3.8l1.7 4.9 4.9 1.7-4.9 1.7L12 17l-1.7-4.9-4.9-1.7 4.9-1.7zM18.5 16.5l.6 1.6 1.6.6-1.6.6-.6 1.6-.6-1.6-1.6-.6 1.6-.6z',
  compass: 'M12 3.8a8.2 8.2 0 1 0 0 16.4 8.2 8.2 0 0 0 0-16.4zM15.3 8.7l-2 4.6-4.6 2 2-4.6z',
  palette: 'M12 3.8a8.2 8.2 0 0 0 0 16.4c1.3 0 1.9-.8 1.9-1.7 0-1.2-1-1.6-1-2.6 0-.9.7-1.5 1.7-1.5h2.2a3.4 3.4 0 0 0 3.4-3.4c0-4-3.7-7.2-8.2-7.2zM8 11a1 1 0 1 0 0 2 1 1 0 0 0 0-2zM10.5 7.5a1 1 0 1 0 0 2 1 1 0 0 0 0-2zM14.5 7.5a1 1 0 1 0 0 2 1 1 0 0 0 0-2z',
  brain: 'M4.5 6.6A2.4 2.4 0 0 1 6.9 4.2h10.2a2.4 2.4 0 0 1 2.4 2.4v6.6a2.4 2.4 0 0 1-2.4 2.4H10l-4 3.6v-3.6h-.1M8.5 9h7M8.5 12h4.5',
  cloud: 'M7.2 18h9.9a3.9 3.9 0 0 0 .5-7.8A5.8 5.8 0 0 0 6.4 11a3.5 3.5 0 0 0 .8 7z',
  shield: 'M12 3.4 5.4 6.2v4.9c0 4.3 2.8 7.6 6.6 9.5 3.8-1.9 6.6-5.2 6.6-9.5V6.2z',
  type: 'M5 6.2h14M12 6.2v12.6M9.2 18.8h5.6',
  legend: 'M9 7.2h10.5M9 12h10.5M9 16.8h10.5M5.2 6.1a1.1 1.1 0 1 0 0 2.2 1.1 1.1 0 0 0 0-2.2zM5.2 10.9a1.1 1.1 0 1 0 0 2.2 1.1 1.1 0 0 0 0-2.2zM5.2 15.7a1.1 1.1 0 1 0 0 2.2 1.1 1.1 0 0 0 0-2.2z',
  info: 'M12 3.8a8.2 8.2 0 1 0 0 16.4 8.2 8.2 0 0 0 0-16.4zM12 11v5M12 8h.01',
  lock: 'M7 10.5V8a5 5 0 0 1 10 0v2.5M5.8 10.5h12.4v9H5.8z',
  clock: 'M12 3.8a8.2 8.2 0 1 0 0 16.4 8.2 8.2 0 0 0 0-16.4zM12 7.6V12l2.8 1.8',
  chev: 'm9.5 6 6 6-6 6',
  back: 'm14.5 6-6 6 6 6',
} as const

export type IconName = keyof typeof PATHS

export function Icon({ name, class: cls = '' }: { name: IconName; class?: string }) {
  return (
    <svg class={`ic ${cls}`.trim()} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
      <path d={PATHS[name]} />
    </svg>
  )
}
