/**
 * 서버리스 환경에서 사용할 Express 앱을 구성한다. 대여소·블로그·화장실·방문 기록 API 경로를 연결하고 실행 환경에 앱을 내보낸다.
 */
import express from 'express'
import nearbyBikes from './nearby-bikes.js'
import blogSearch from './blog-search.js'
import seoulToilets from './seoul-toilets.js'
import siteVisit from './site-visit.js'

const app = express()

app.all('/api/nearby-bikes', nearbyBikes)
app.get('/api/blog-search', blogSearch)
app.get('/api/seoul-toilets', seoulToilets)
app.post('/api/site-visit', siteVisit)
app.use((_request, response) => response.status(404).json({ error: 'not_found' }))

export default app
