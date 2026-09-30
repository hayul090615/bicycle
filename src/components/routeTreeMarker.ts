import type { TourSeason } from '../data/touristRoutes'
import routeTreeSpriteUrl from '../assets/route-tree.png'

/** Create a small, season-aware tree billboard for the route map. */
export function createRouteTreeMarker(season: TourSeason, locale: 'en' | 'ko', variation: number, onFocus: () => void) {
  const tree = document.createElement('button')
  tree.type = 'button'
  tree.className = `tour-map-tree tour-map-tree--${season} tour-map-tree--variation-${variation % 2}`
  tree.style.setProperty('--tree-sprite', `url("${routeTreeSpriteUrl}")`)
  tree.title = locale === 'ko' ? '이 나무가 있는 구간 확대' : 'Zoom to this tree'
  tree.setAttribute('aria-label', tree.title)
  tree.addEventListener('click', event => {
    event.stopPropagation()
    onFocus()
  })

  const shadow = document.createElement('i')
  shadow.className = 'tour-map-tree-shadow'
  const sprite = document.createElement('span')
  sprite.className = 'tour-map-tree-sprite'
  const trunk = document.createElement('i')
  trunk.className = 'tour-map-tree-trunk'
  tree.append(shadow, sprite, trunk)

  for (const branch of ['left', 'right', 'upper-left', 'upper-right']) {
    const limb = document.createElement('i')
    limb.className = `tour-map-tree-branch tour-map-tree-branch--${branch}`
    tree.append(limb)
  }

  const rearCrown = document.createElement('b')
  rearCrown.className = 'tour-map-tree-crown tour-map-tree-crown--rear'
  const mainCrown = document.createElement('b')
  mainCrown.className = 'tour-map-tree-crown tour-map-tree-crown--main'
  tree.append(rearCrown, mainCrown)

  for (let index = 0; index < 7; index++) {
    const cluster = document.createElement('em')
    cluster.className = `tour-map-tree-leaf-cluster tour-map-tree-leaf-cluster--${index + 1}`
    tree.append(cluster)
  }
  const fallingLeaves = document.createElement('span')
  fallingLeaves.className = 'tour-map-tree-falling-leaves'
  for (let index = 0; index < 3; index++) {
    const leaf = document.createElement('i')
    leaf.style.setProperty('--leaf-index', String(index))
    fallingLeaves.append(leaf)
  }
  tree.append(fallingLeaves)
  return tree
}
