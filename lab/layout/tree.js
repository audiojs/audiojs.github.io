// A layout as a tree, as docking editors keep one: a split holds panes in a row or a column, each with a weight; a set
// holds tabs, one of them shown. Every change returns a new tree in normal form: no empty set, no split of one pane, no
// split inside a split of its own direction (its panes join the outer one, sharing its weight).
let count = 0
const id = prefix => prefix + ++count

export const set = (tabs, active = tabs[0], key = id('set')) => ({ type: 'set', id: key, tabs: [...tabs], active })
export const split = (dir, children, weights = children.map(() => 1), key = id('split')) => ({ type: 'split', id: key, dir, children, weights: [...weights] })

// every set, in reading order
export const sets = node => !node ? [] : node.type === 'set' ? [node] : node.children.flatMap(sets)
export const where = (node, tab) => sets(node).find(s => s.tabs.includes(tab))
export const tabs = node => sets(node).flatMap(s => s.tabs)

export function normal(node) {
  if (!node) return null
  if (node.type === 'set') return node.tabs.length ? { ...node, active: node.tabs.includes(node.active) ? node.active : node.tabs[0] } : null
  const children = [], weights = []
  node.children.forEach((c, i) => {
    c = normal(c)
    if (!c) return
    if (c.type === 'split' && c.dir === node.dir) {
      const total = c.weights.reduce((a, b) => a + b, 0)
      c.children.forEach((cc, j) => { children.push(cc); weights.push(node.weights[i] * c.weights[j] / total) })
    } else { children.push(c); weights.push(node.weights[i]) }
  })
  if (!children.length) return null
  return children.length === 1 ? children[0] : { ...node, children, weights }
}

const map = (node, f) => node.type === 'set' ? f(node) : { ...node, children: node.children.map(c => map(c, f)) }

// the tree without `tab`; a set it leaves empty goes, and the tab shown there becomes its left neighbour
export function remove(node, tab) {
  return normal(map(node, s => {
    const i = s.tabs.indexOf(tab)
    if (i < 0) return s
    const rest = s.tabs.filter(t => t !== tab)
    return { ...s, tabs: rest, active: s.active === tab ? rest[Math.max(0, i - 1)] : s.active }
  }))
}
// `tab` shown in set `to`, at `index` (the end if none); taken from wherever it was
export function add(node, to, tab, index) {
  const target = sets(node).find(s => s.id === to)
  if (!target) return node
  const shift = index != null && target.tabs.indexOf(tab) > -1 && target.tabs.indexOf(tab) < index ? 1 : 0
  const without = target.tabs.length === 1 && target.tabs[0] === tab ? node : remove(node, tab)
  return normal(map(without, s => {
    if (s.id !== to) return s
    const rest = s.tabs.filter(t => t !== tab), at = index == null ? rest.length : Math.max(0, Math.min(rest.length, index - shift))
    rest.splice(at, 0, tab)
    return { ...s, tabs: rest, active: tab }
  }))
}
// `tab` in a new set on `side` (left, right, top, bottom) of set `to`, taken from wherever it was; a set cannot be
// split by its only tab
export function beside(node, to, side, tab, key) {
  const from = where(node, tab)
  if (!from || (from.id === to && from.tabs.length === 1)) return node
  const dir = side === 'left' || side === 'right' ? 'row' : 'col', first = side === 'left' || side === 'top'
  return normal(map(remove(node, tab), s => {
    if (s.id !== to) return s
    const fresh = set([tab], tab, key)
    return split(dir, first ? [fresh, s] : [s, fresh])
  }))
}
// `tab` in a new set along the outer `side` of the whole layout, taken from wherever it was
export function edge(node, side, tab, key) {
  const rest = where(node, tab) ? remove(node, tab) : node, fresh = set([tab], tab, key)
  if (!rest) return fresh
  const dir = side === 'left' || side === 'right' ? 'row' : 'col', first = side === 'left' || side === 'top'
  return normal(split(dir, first ? [fresh, rest] : [rest, fresh], first ? [1, 3] : [3, 1]))
}
// `tab` shown where it is
export const show =(node, tab) => map(node, s => s.tabs.includes(tab) ? { ...s, active: tab } : s)
// the weights of split `key`
export const weigh = (node, key, weights) => node.type === 'set' ? node : { ...node, weights: node.id === key ? [...weights] : node.weights, children: node.children.map(c => weigh(c, key, weights)) }
