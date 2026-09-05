// Facts about this build, fixed when it was made. Shown on Settings → About so the
// deployed build can be matched against the pipeline run that tested it.
export type BuildStamp = {
  /** Full commit hash, or '' when built without git. */
  commit: string
  /** First seven characters of the hash, or 'unbuilt'. */
  shortCommit: string
  /** Link to the pipeline run that tested this build, or '' when built outside it. */
  runUrl: string
  /** Unit tests that passed before this build, or null when not recorded. */
  unitTests: number | null
  /** ISO time the bundle was produced. */
  builtAt: string
}

export const build: BuildStamp = {
  commit: __BUILD_COMMIT__,
  shortCommit: __BUILD_COMMIT__.slice(0, 7) || 'unbuilt',
  runUrl: __BUILD_RUN_URL__,
  unitTests: __BUILD_UNIT_TESTS__ === '' ? null : Number(__BUILD_UNIT_TESTS__),
  builtAt: __BUILD_TIME__,
}
