import express from "express";
import dotenv from 'dotenv';
import jobRoutes from './routes/job.routes.js';
import { errorHandler } from './middlewares/errorHandler.js';

dotenv.config()

const app = express()

app.use(express.json())
app.use('/job', jobRoutes)
app.use(errorHandler)

export default app
