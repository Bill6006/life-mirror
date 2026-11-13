// What the record holds that no kind counts, each with why (the counted foundation, 2026-11-12): with the kinds, the
// written list of every kind of record, marked covered or deliberately left out. No imports, so the Worker's lookup
// reads the same list the phone does (2026-11-13).

export const LEFT_OUT: readonly { id: string; label: string; reason: string }[] = [
  { id: 'journal', label: 'the nightly journal', reason: 'never evidence: a statement from it carries no number, level or cause' },
  { id: 'voice', label: 'voice recordings', reason: 'they stay on the phone' },
  { id: 'ask', label: 'past Ask conversations', reason: 'no lookup yet' },
  { id: 'path.changes', label: 'the log of changes to a Path', reason: 'no lookup yet' },
  { id: 'partner.monthly', label: 'the Partner Path monthly check', reason: 'no lookup yet' },
  { id: 'path.other', label: 'steps of the Speaking Path and of generated Paths', reason: 'listed by their own lookup, only the steps done, and counted as no kind' },
  { id: 'chip.outside', label: 'the old "outside a while today" chip', reason: 'no longer asked; kept as it was recorded and never read as time in nature' },
  { id: 'caffeine.old', label: 'the old caffeine yes-or-no chips', reason: 'amount unknown; replaced by the reported bands' },
  { id: 'notes', label: 'words in notes', reason: 'counted by their own lookup, as words and never as events; that lookup is not built yet' },
]
