// Every string a person can read in the app lives here (readings and their anchor phrases
// live in readings.json), so one test can check all of them against the plan's rule:
// a reading, never a verdict.
export const copy = {
  appName: 'Life Mirror',
  tabs: {
    now: 'Now',
    mirror: 'Mirror',
    moves: 'Moves',
    aims: 'Aims',
    settings: 'Settings',
  },
  blocks: {
    morning: 'Morning',
    afternoon: 'Afternoon',
    evening: 'Evening',
  },
  now: {
    notLogged: 'Not logged yet',
    checkIn: 'Check in',
    continue: 'Continue',
    logged: 'Logged {time}',
    incomplete: 'Incomplete · {n} of {total}',
    from: 'From {time}',
    earlier: 'Earlier',
  },
  checkin: {
    progress: '{block} · {n} of {total}',
    back: 'Back',
    close: 'Close',
    clear: 'Clear this answer',
  },
  summary: {
    logged: '{block} · logged {time}',
    incomplete: '{block} · incomplete',
    readings: 'Readings',
    notLogged: 'Not logged yet',
    finishFirst: 'Finish the readings and this card says what changed.',
    done: 'Done',
    delete: 'Delete this check-in',
    deleteConfirm: 'Tap again to delete it',
  },
  since: {
    heading: 'Since {when}',
    first: 'Your first reading. From the next one, this card says what changed.',
    sameDay: 'this {block}',
    yesterday: 'yesterday {block}',
    weekday: '{weekday} {block}',
    date: '{date}, {block}',
    up: '{name} up {amount}',
    down: '{name} down {amount}',
    unchanged: 'Unchanged: {list}',
    nothingShared: 'Nothing to compare with the last check-in.',
  },
  amounts: {
    step: ['one step', 'two steps', 'three steps', 'four steps'],
    band: ['one band', 'two bands', 'three bands', 'four bands'],
  },
  mirror: {
    note: 'Your own record, drawn. Arrives with Phase 4.',
  },
  moves: {
    note: 'One small move, with the reason for it. Arrives with Phase 6.',
  },
  aims: {
    note: 'Your protected next step. Arrives with Phase 7.',
  },
  settings: {
    wording: 'Wording',
    wordingNote: 'The 13 readings and their 65 phrases.',
    about: 'About',
    app: 'App',
    build: 'Build',
    builtAt: 'Built',
    run: 'Open the run that tested this build',
    runMissing: 'Built outside the pipeline, so there is no run to show.',
    testsOne: '{n} unit test passed before this build.',
    testsMany: '{n} unit tests passed before this build.',
    testsUnknown: 'Test count not recorded for this build.',
    data: 'Data',
    dataNote: 'Your check-ins are stored on this phone only. Nothing leaves it.',
    phase: 'Phase 1 of the build plan: the check-in.',
  },
  wording: {
    intro: 'Five phrases per reading, least to most. You pick a phrase, never a number.',
    sets: 'Morning asks all 13. Afternoon and evening ask mood, irritation, energy, hunger and stress.',
  },
} as const
