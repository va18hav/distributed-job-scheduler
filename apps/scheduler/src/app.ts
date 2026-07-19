import express from "express";
import dotenv from 'dotenv';
import { pinoHttp } from 'pino-http';
import { logger } from './utils/logger.js';
import jobRoutes from './routes/job.routes.js';
import { errorHandler } from './middlewares/errorHandler.js';

dotenv.config()

const app = express()

app.use(pinoHttp({ logger }))
app.use(express.json())

app.use('/job', jobRoutes)

// Error boundary registered at the end of stack
app.use(errorHandler)

export default app
