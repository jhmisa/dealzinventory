import assert from 'node:assert/strict'
import { coverCrop, formatYen, gridLayout, slideInfoFromShowcase } from './product-slide'

// coverCrop: landscape image into square cell — crops the sides.
const lc = coverCrop(2000, 1000, 1080, 1080)
assert.equal(lc.sh, 1000)
assert.equal(lc.sw, 1000)
assert.equal(lc.sx, 500)
assert.equal(lc.sy, 0)

// coverCrop: portrait image into square cell — crops top/bottom.
const pc = coverCrop(1000, 2000, 1080, 1080)
assert.equal(pc.sw, 1000)
assert.equal(pc.sh, 1000)
assert.equal(pc.sx, 0)
assert.equal(pc.sy, 500)

// coverCrop: already square → whole image.
assert.deepEqual(coverCrop(800, 800, 1080, 1080), { sx: 0, sy: 0, sw: 800, sh: 800 })

// coverCrop: non-square cell (wide) — source rect matches cell aspect.
const wc = coverCrop(1000, 1000, 1080, 540)
assert.equal(wc.sw, 1000)
assert.equal(wc.sh, 500)
assert.equal(wc.sy, 250)

// formatYen
assert.equal(formatYen(129800), '¥129,800')
assert.equal(formatYen(0), '¥0')

// gridLayout: cell count matches n, all cells within bounds, no overlap.
for (const n of [1, 2, 3, 4, 5, 6, 9]) {
  const cells = gridLayout(n, 1080, 8)
  assert.equal(cells.length, n, `n=${n} count`)
  for (const c of cells) {
    assert.ok(c.x >= 0 && c.y >= 0 && c.x + c.w <= 1080.001 && c.y + c.h <= 1080.001, `n=${n} in bounds`)
    assert.ok(c.w > 100 && c.h > 100, `n=${n} cells usable size`)
  }
  for (let i = 0; i < cells.length; i++)
    for (let j = i + 1; j < cells.length; j++) {
      const a = cells[i], b = cells[j]
      const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
      assert.ok(!overlap, `n=${n} cells ${i},${j} must not overlap`)
    }
}
// gridLayout caps at 9.
assert.equal(gridLayout(12, 1080, 8).length, 9)
// 1 image fills the whole canvas.
assert.deepEqual(gridLayout(1, 1080, 8)[0], { x: 0, y: 0, w: 1080, h: 1080 })

// slideInfoFromShowcase: effective price + struck original when discounted.
const info = slideInfoFromShowcase({
  item_code: 'B000047', description: 'Apple MacBook Pro M2 16GB 512GB',
  selling_price: 148000, discount: 10000, condition_grade: 'A',
})
assert.equal(info.price, 138000)
assert.equal(info.originalPrice, 148000)
assert.equal(info.code, 'B000047')
assert.equal(info.grade, 'A')

// no discount → no originalPrice; null price stays null.
const plain = slideInfoFromShowcase({ item_code: 'P000001', description: 'x', selling_price: 5000, discount: null, condition_grade: null })
assert.equal(plain.price, 5000)
assert.equal(plain.originalPrice, undefined)
const nul = slideInfoFromShowcase({ item_code: 'P000002', description: 'x', selling_price: null, discount: null, condition_grade: 'B' })
assert.equal(nul.price, null)

console.log('product-slide tests passed')
