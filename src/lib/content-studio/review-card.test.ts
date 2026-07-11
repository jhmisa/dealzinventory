import assert from 'node:assert/strict'
import { wrapText, starString, REVIEW_CARD_STYLES } from './review-card'

// Wrap splits on words and respects the char budget.
const w1 = wrapText('the quick brown fox jumps', 10, 5)
assert.ok(w1.every((l) => l.length <= 10), 'each line within budget')
assert.deepEqual(w1, ['the quick', 'brown fox', 'jumps'])

// Single very-long text truncates to maxLines with an ellipsis on the last line.
const long = wrapText('alpha beta gamma delta epsilon zeta eta theta', 11, 2)
assert.equal(long.length, 2)
assert.ok(long[long.length - 1].endsWith('…'), 'overflow marked with ellipsis')

// Short text that fits leaves no ellipsis.
assert.deepEqual(wrapText('great phone', 30, 5), ['great phone'])
assert.ok(!wrapText('great phone', 30, 5)[0].endsWith('…'))

// Stars: filled + empty to 5, clamped.
assert.equal(starString(4), '★★★★☆')
assert.equal(starString(5), '★★★★★')
assert.equal(starString(0), '☆☆☆☆☆')
assert.equal(starString(9), '★★★★★')
assert.equal(starString(null), '☆☆☆☆☆')

// Every style has the four palette roles.
for (const style of ['forest', 'ink', 'paper'] as const) {
  const p = REVIEW_CARD_STYLES[style]
  assert.ok(p.bg && p.fg && p.accent && p.sub, `${style} palette complete`)
}

console.log('review-card.test.ts: all assertions passed')
