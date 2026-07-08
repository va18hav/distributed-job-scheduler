import express from "express";
import dotenv from 'dotenv'
import jobRoutes from './routes/job.routes.js'

dotenv.config()

const app = express()

app.use(express.json())

app.use('/job', jobRoutes)

export default app
