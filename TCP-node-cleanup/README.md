# TCP-Node Cleanup Service

Standalone cleanup service for tcp-node that handles database and log retention using scheduled CRON jobs.

## Project Structure

```
Src/
├── app.js          # Main entry point
├── config/
│   └── db.js      # Database connection pool
└── jobs/
    └── cleanup.job.js  # Cleanup job definition
```

## Installation

```bash
npm install
```

## Usage

```bash
npm start   # Start the cleanup service
npm run dev # Run in development mode
```

## Features

- **MySQL Cleanup**: Automatically deletes old messages from the database based on retention days
- **Log File Cleanup**: Removes old log files based on date
- **Scheduled Execution**: Uses CRON to run at a specified time daily

## Environment Variables

Required environment variables (copy from `.env.example`):

- `DB_HOST` - MySQL database host
- `DB_PORT` - MySQL database port
- `DB_USER` - MySQL user
- `DB_PASSWORD` - MySQL password
- `DB_NAME` - MySQL database name
- `ENABLE_AUTO_CLEANUP` - Set to `true` to enable cleanup
- `DATA_RETENTION_DAYS` - Number of days to retain data (default: 15)
- `CLEANUP_TIME` - Time to run cleanup in HH:MM format (default: "00:00")

## Running Both Services

For complete functionality, run both services in separate terminals:

```bash
# Terminal 1 - Main TCP Service
cd d:\TCP-node
npm install
npm start

# Terminal 2 - Cleanup Service
cd d:\TCP-node-cleanup
npm install
npm start
```

Ensure they share the same database and log directory configuration.
