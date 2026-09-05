// Every string a person can read in the app lives here, so one test can check all of
// them against the plan's rule: a reading, never a verdict.
export const copy = {
  appName: 'Life Mirror',
  tabs: {
    now: 'Now',
    mirror: 'Mirror',
    moves: 'Moves',
    aims: 'Aims',
    settings: 'Settings',
  },
  now: {
    status: 'Not logged yet',
    note: 'Nothing to read yet. The first check-in arrives with the next phase.',
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
    dataNote: 'Nothing is stored yet. When it is, it stays on this phone.',
    phase: 'Phase 0 of the build plan: the live shell.',
  },
} as const
