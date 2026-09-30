import express from 'express'
import nearbyBikes from './nearby-bikes.js'

const app = express()

app.all('/api/nearby-bikes', nearbyBikes)
app.use((_request, response) => response.status(404).json({ error: 'not_found' }))

export default app
