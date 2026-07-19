import { Router } from "express";
import * as jobController from '../controllers/job.controller.js'
import { validate } from '../middlewares/validate.js'
import { CreateJobSchema } from '../types/job.types.js'

const router = Router()

router.post('/', validate(CreateJobSchema), jobController.createJob)
router.get('/stats', jobController.getSystemStats)
router.get('/', jobController.getAllJobs)
router.get('/pending', jobController.getAllPendingJobs)

export default router