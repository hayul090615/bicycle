import { siteText } from '../services/tourTranslations'
import type { SiteLocale } from '../services/siteLocale'
/**
 * 계절에 맞는 지도 장식 나무 버튼을 만든다. 나무 이미지·그림자·가지 요소를 구성하고 선택한 나무 구간을 확대하는 작업 뒤 실행할 함수을 연결한다.
 */
import type { TourSeason } from '../data/touristRoutes'
import routeTreeSpriteUrl from '../assets/route-tree.png'

/** Create a small, season-aware tree billboard for the route map. */
export function createRouteTreeMarker(season: TourSeason, locale: SiteLocale, variation: number, onFocus: () => void) {
  const tree = document.createElement('button')
  tree.type = 'button'
  tree.className = `tour-map-tree tour-map-tree--${season} tour-map-tree--variation-${variation % 2}`
  tree.style.setProperty('--tree-sprite', `url("${routeTreeSpriteUrl}")`)
  tree.title = siteText(locale, 'Zoom to this tree', '이 나무가 있는 구간 확대')
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
  for (let index = 0; index < 8; index++) {
    const leaf = document.createElement('i')
    leaf.style.setProperty('--leaf-index', String(index))
    fallingLeaves.append(leaf)
  }
  tree.append(fallingLeaves)
  return tree
}
