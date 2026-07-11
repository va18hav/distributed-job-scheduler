# Distributed Job Scheduler

A background task execution system built using **TypeScript, Node.js, and PostgreSQL**. 

This project implements a task queue directly on top of a relational database, handling concurrency, worker crash recovery, and task prioritization at the SQL transactional level.

---

## Tech Stack
- **Backend**: TypeScript, Node.js (Express)
- **Database**: PostgreSQL with Prisma ORM
- **Infrastructure**: Docker & Docker Compose

---

## Core Features

### 1. Concurrency Control (`SKIP LOCKED`)
To prevent multiple worker nodes from picking up the same task, the application uses PostgreSQL row-level locks via `FOR UPDATE SKIP LOCKED`. This allows multiple workers to poll the database concurrently without blocking each other.

### 2. Worker Crash Recovery
If a worker process crashes mid-task, its heartbeat stops. The task acquisition query automatically checks for expired locks (older than 30 seconds) and re-assigns them to active workers in a single transaction.

### 3. Heartbeat Updates
While executing a job, workers periodically ping the database to update the `lockedAt` timestamp, confirming they are still running.

### 4. Priority & Delayed Jobs
Tasks can be scheduled with custom priorities and delayed start times (`availableAt`). Workers automatically process higher-priority tasks first and respect execution barriers.

---

## Quick Start (Docker Compose)

The database, scheduler API, and worker nodes are containerized and can be started together.

### 1. Start the services
Run the following command at the root of the project:
```bash
docker compose up --build
```

### 2. Access points
- **Scheduler API**: [http://localhost:3000](http://localhost:3000)
- **Postgres Database**: `localhost:5432`

---

## Architecture & API Docs
For database schemas, diagrams, SQL queries, and API endpoint examples, see [ARCHITECTURE.md](ARCHITECTURE.md).
