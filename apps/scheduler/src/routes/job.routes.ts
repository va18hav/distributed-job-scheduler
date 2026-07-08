import { Router } from "express";
import * as jobController from '../controllers/job.controller.js'

const router = Router()

router.post('/', jobController.createJob)
router.get('/', jobController.getAllJobs)
router.get('/pending', jobController.getAllPendingJobs)


export default router