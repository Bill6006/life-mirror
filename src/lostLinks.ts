import { db, type Intention, type Offer, type Outcome } from './db'

// Sync safety (2026-10-02). A cleared phone that handed out ids the cloud already held wrote new offers
// over old ones, and the records that named an old offer by its id now name the new one: an answer
// reads as the answer to a move offered after it. Such a link is taken back here and never guessed at. The record keeps everything it holds; the id it named stays in
// lostOfferId; its offerId turns negative, an id no offer can have, so nothing joins it to the wrong move
// again. Nothing is deleted and nothing is filled in.

/** An answer cannot come before the move it answers: the offer under its id is a later one. */
export function answerPredatesOffer(x: Pick<Outcome, 'at'>, offer: Pick<Offer, 'at'> | undefined): boolean {
  return offer !== undefined && offer.at > x.at
}

/** A plan is started by an offer of its own day: one of another day took the id. */
export function planOfAnotherDay(p: Pick<Intention, 'day'>, offer: Pick<Offer, 'day'> | undefined): boolean {
  return offer !== undefined && offer.day !== p.day
}

/** Takes back every bent link, in one transaction that syncs like any change. Returns the ids changed; a second run finds nothing. */
export async function unlinkLost(): Promise<{ outcomes: number[]; intentions: number[] }> {
  return db.transaction('rw', [db.offers, db.outcomes, db.intentions], async () => {
    const offers = new Map((await db.offers.toArray()).map((o) => [o.id as number, o]))
    const outcomes: number[] = []
    const intentions: number[] = []
    for (const x of await db.outcomes.toArray()) {
      if (!answerPredatesOffer(x, offers.get(x.offerId))) continue
      await db.outcomes.put({ ...x, offerId: -x.offerId, lostOfferId: x.offerId })
      outcomes.push(x.id as number)
    }
    for (const p of await db.intentions.toArray()) {
      if (p.offerId === null || !planOfAnotherDay(p, offers.get(p.offerId))) continue
      // Still started: an offer did start it; which one is what was lost.
      await db.intentions.put({ ...p, offerId: -p.offerId, lostOfferId: p.offerId })
      intentions.push(p.id as number)
    }
    return { outcomes, intentions }
  })
}
