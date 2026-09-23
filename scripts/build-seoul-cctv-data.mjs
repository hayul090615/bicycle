import { createReadStream, mkdirSync, writeFileSync } from 'node:fs'
import { createInterface } from 'node:readline'
import { resolve } from 'node:path'
import { gzipSync } from 'node:zlib'
import iconv from 'iconv-lite'

const input = process.argv[2]
if (!input) throw new Error('Usage: node scripts/build-seoul-cctv-data.mjs <nationwide-cctv.csv>')

function parseCsvLine(line) {
  const fields = []
  let field = ''
  let quoted = false
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i]
    if (char === '"') {
      if (quoted && line[i + 1] === '"') { field += '"'; i += 1 }
      else quoted = !quoted
    } else if (char === ',' && !quoted) {
      fields.push(field); field = ''
    } else field += char
  }
  fields.push(field)
  return fields
}

const reader = createInterface({ input: createReadStream(resolve(input)).pipe(iconv.decodeStream('cp949')), crlfDelay: Infinity })
let headers
const seoul = []
for await (const line of reader) {
  if (!headers) { headers = parseCsvLine(line).map((name) => name.replace(/^\uFEFF/, '').trim()); continue }
  const columns = parseCsvLine(line)
  const record = Object.fromEntries(headers.map((name, index) => [name, columns[index] ?? '']))
  if (!/^3\d{6}$/.test(record['개방자치단체코드'])) continue
  if (!(record['소재지도로명주소'].startsWith('서울특별시 ') || record['소재지지번주소'].startsWith('서울특별시 '))) continue
  const lat = Number(record['WGS84위도'])
  const lng = Number(record['WGS84경도'])
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < 37.3 || lat > 37.75 || lng < 126.65 || lng > 127.25) continue
  seoul.push({
    id: record['관리번호'], name: record['관리기관명'], address: record['소재지도로명주소'] || record['소재지지번주소'],
    purpose: record['설치목적구분'], cameras: record['카메라대수'], resolution: record['카메라화소수'],
    direction: record['촬영방면정보'], lat, lng, updatedAt: record['데이터기준일자'],
  })
}

const output = resolve('public/datasets/seoul-cctv.json.gz')
mkdirSync(resolve('public/datasets'), { recursive: true })
const latestRecordDate = seoul.reduce((latest, camera) => camera.updatedAt > latest ? camera.updatedAt : latest, '')
const payload = JSON.stringify({ source: 'MOIS National CCTV Standard Data', sourceUrl: 'https://www.data.go.kr/data/15013094/standard.do', downloadedAt: new Date().toISOString(), latestRecordDate, count: seoul.length, cameras: seoul })
writeFileSync(output, gzipSync(payload, { level: 9 }))
console.log(`Wrote ${seoul.length} Seoul camera locations to ${output}`)
