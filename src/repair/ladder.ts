// The evidence ladder's two words for a test's call (the learning repair, requirement 8), apart from the engine so the
// Worker can name them without the engine's own imports.

/** A test's rung on the evidence ladder. */
export type Level = 'none' | 'early' | 'likely' | 'established'
/** A call's direction: the move helps, makes little difference, or hurts; none while there is no call. */
export type Direction = 'helps' | 'little' | 'hurts' | null
