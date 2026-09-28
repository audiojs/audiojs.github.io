// Run: node --test 'lab/**/*.test.mjs'  (the layout tree the dock and the tabs keep: every change leaves it normal)
import test from 'node:test'
import assert from 'node:assert/strict'
import { set, split, sets, where, tabs, normal, remove, add, beside, edge, show, weigh } from './tree.js'

// the dock's default: script over console | the sound | rack and history over agent
const dock = () => split('row', [split('col', [set(['script'], 'script', 'a'), set(['console'], 'console', 'b')], [2, 1], 'left'), set(['view'], 'view', 'v'), split('col', [set(['rack', 'history'], 'rack', 'c'), set(['agent'], 'agent', 'd')], [3, 1], 'right')], [3, 5, 2], 'root')
// normal form: no empty set, no split of one, no split directly inside a split of its own direction, weights per pane
function isNormal(node, parent = null) {
  if (node.type === 'set') return node.tabs.length > 0 && node.tabs.includes(node.active)
  return node.children.length > 1 && node.weights.length === node.children.length && node.dir !== parent && node.children.every(c => isNormal(c, node.dir))
}
const shape = node => node.type === 'set' ? node.tabs.join('+') : `${node.dir}(${node.children.map(shape).join(' ')})`

test('the default is normal and holds every tab once', () => {
  const t = dock()
  assert.ok(isNormal(t))
  assert.deepEqual(tabs(t).sort(), ['agent', 'console', 'history', 'rack', 'script', 'view'])
  assert.equal(where(t, 'history').id, 'c')
})

test('removing the only tab of a set removes the set, and a split left with one pane becomes that pane', () => {
  const t = remove(dock(), 'console')
  assert.equal(shape(t), 'row(script view col(rack+history agent))')
  assert.ok(isNormal(t))
  const u = remove(remove(t, 'agent'), 'script')
  assert.equal(shape(u), 'row(view rack+history)')
})

test('removing the shown tab shows its left neighbour', () => {
  const t = remove(show(dock(), 'history'), 'history')
  assert.equal(where(t, 'rack').active, 'rack')
  const u = remove(dock(), 'rack')
  assert.equal(where(u, 'history').active, 'history')
})

test('adding a tab to a set shows it there and takes it from where it was', () => {
  const t = add(dock(), 'a', 'agent')
  assert.equal(shape(t), 'row(col(script+agent console) view rack+history)')
  assert.equal(where(t, 'agent').active, 'agent')
  assert.equal(tabs(t).filter(x => x === 'agent').length, 1)
  assert.ok(isNormal(t))
})

test('reordering within a set moves the tab to the index given', () => {
  const t = add(add(dock(), 'c', 'agent'), 'c', 'agent', 0)
  assert.deepEqual(where(t, 'agent').tabs, ['agent', 'rack', 'history'])
  const u = add(t, 'c', 'agent', 3)
  assert.deepEqual(where(u, 'agent').tabs, ['rack', 'history', 'agent'])
  assert.deepEqual(where(add(t, 'c', 'agent', 2), 'agent').tabs, ['rack', 'agent', 'history'])
})

test('a tab set beside another splits in the side’s direction, and joins an outer split of that direction', () => {
  const t = beside(dock(), 'v', 'right', 'history', 'e')
  assert.equal(shape(t), 'row(col(script console) view history col(rack agent))')
  assert.ok(isNormal(t))
  // the new pane shares the old pane's weight: the row's total is kept
  assert.equal(t.weights.reduce((a, b) => a + b), 10)
  const u = beside(dock(), 'v', 'bottom', 'history', 'e')
  assert.equal(shape(u), 'row(col(script console) col(view history) col(rack agent))')
  assert.ok(isNormal(u))
})

test('a set cannot be split by its only tab; moving a set’s last tab away removes the set', () => {
  const t = dock()
  assert.equal(beside(t, 'a', 'right', 'script'), t)
  const u = beside(t, 'c', 'bottom', 'script', 'e')
  assert.equal(shape(u), 'row(console view col(rack+history script agent))')
  assert.ok(isNormal(u))
})

test('a tab along the outer edge wraps the whole layout', () => {
  const t = edge(dock(), 'bottom', 'console', 'e')
  assert.equal(shape(t), 'col(row(script view col(rack+history agent)) console)')
  assert.ok(isNormal(t))
  assert.equal(shape(edge(dock(), 'right', 'agent', 'e')), 'row(col(script console) view rack+history agent)')
})

test('weights change only in the split named, and survive unrelated changes', () => {
  const t = weigh(dock(), 'left', [1, 4])
  assert.deepEqual(t.children[0].weights, [1, 4])
  assert.deepEqual(t.weights, [3, 5, 2])
  assert.deepEqual(add(t, 'c', 'agent').children[0].weights, [1, 4])
})

test('many random moves keep the tree normal and every tab in it once', () => {
  let t = dock(), seed = 7
  const r = n => (seed = seed * 16807 % 2147483647) % n, sides = ['left', 'right', 'top', 'bottom'], all = tabs(t).filter(x => x !== 'view')
  for (let i = 0; i < 2000; i++) {
    const tab = all[r(all.length)], target = sets(t)[r(sets(t).length)], k = r(4)
    t = k === 0 ? add(t, target.id, tab, r(4)) : k === 1 ? beside(t, target.id, sides[r(4)], tab) : k === 2 ? edge(t, sides[r(4)], tab) : show(t, tab)
    assert.ok(isNormal(t), `after move ${i}: ${shape(t)}`)
    assert.deepEqual(tabs(t).sort(), ['agent', 'console', 'history', 'rack', 'script', 'view'])
  }
})

test('normal() drops empty sets and flattens same-direction splits, keeping the outer weight', () => {
  const t = normal(split('row', [set([], null, 'x'), split('row', [set(['a']), set(['b'])], [1, 3]), set(['c'])], [5, 4, 2]))
  assert.equal(shape(t), 'row(a b c)')
  assert.deepEqual(t.weights, [1, 3, 2])
})
