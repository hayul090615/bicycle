import express from 'express'
import nearbyBikes from './nearby-bikes.js'
import blogSearch from './blog-search.js'
import seoulToilets from './seoul-toilets.js'

const app = express()

app.all('/api/nearby-bikes', nearbyBikes)
app.get('/api/blog-search', blogSearch)
app.get('/api/seoul-toilets', seoulToilets)
app.use((_request, response) => response.status(404).json({ error: 'not_found' }))

export default app
