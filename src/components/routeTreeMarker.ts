import type { TourSeason } from '../data/touristRoutes'
import routeTreeSpriteUrl from '../assets/route-tree.png'

/** Create a small, season-aware tree billboard for the route map. */
export function createRouteTreeMarker(season: TourSeason, locale: 'en' | 'ko', variation = 0) {
  const tree = document.createElement('span')
  tree.className = `tour-map-tree tour-map-tree--${season} tour-map-tree--variation-${variation % 2}`
  tree.style.setProperty('--tree-sprite', `url("${routeTreeSpriteUrl}")`)
  tree.setAttribute('role', 'img')
  tree.setAttribute('aria-label', locale === 'ko' ? '\uC790\uC804\uAC70 \uAE38\uAC00 \uACC4\uC808 \uB098\uBB34' : 'Seasonal tree beside the bicycle route')
  tree.title = locale === 'ko' ? '\uC790\uC804\uAC70 \uAE38 \uC591\uCABD\uC5D0 \uBC30\uCE58\uB41C \uACC4\uC808 \uB098\uBB34' : 'Seasonal tree along both sides of the route'

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
  return tree
}
