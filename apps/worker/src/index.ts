import { startWorker } from "./worker.js";

import { config } from 'dotenv'
config()

async function bootstrap() {
    await startWorker();
}

bootstrap().catch((err) => {
    console.error("Worker failed to start:", err);
    process.exit(1);
});