import assert from 'node:assert/strict'

let nextId = 0
// 実際に提示された皿だけを購入する。クライアントから完成デッキは渡さない。
export async function finishPurchases(request, read, buy = true) {
  let snapshot = await read()
  assert.ok(snapshot.draft)
  const send = command => request('draft:action', {
    draftId: snapshot.draft.draftId, expectedRevision: snapshot.draft.revision,
    actionId: `purchase-helper-${++nextId}`, ...command,
  })
  if (buy) {
    for (let count = 0; count < 24; count++) {
      const draft = snapshot.draft
      if (!draft || draft.you.completed || draft.you.deck.length >= 20) break
      const offer = draft.offers.filter(offer => offer.card).sort((a, b) => b.card.attack - a.card.attack)
        .find(offer => !offer.sold && offer.card.price <= draft.you.budget)
      if (!offer) break
      const reply = await send({ type: 'buy', offerId: offer.id })
      assert.ok(reply.ok || reply.error === 'draft_offer_expired', JSON.stringify(reply))
      snapshot = await read()
    }
  }
  assert.deepEqual(await send({ type: 'complete' }), { ok: true })
}
