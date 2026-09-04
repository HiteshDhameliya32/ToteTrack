# TCP Monitor — Complete Setup Guide

A step-by-step guide for setting up and running the TCP Monitor system on your computer.
No technical knowledge required — just follow each step carefully.

---

## What Is This System?

This system listens to cameras (or any TCP device) over the network, records their messages into a database, and lets you view live logs and send email reports — all from a web dashboard.

It has **4 parts** that work together:

| Part | What It Does |
|------|-------------|
| **Main API (app.js)** | Listens to cameras via TCP and saves data |
| **Dashboard (TCP-email-dashboard)** | Web page to view live logs and manage cameras |
| **Email Service (TCP-Email)** | Sends scheduled email reports |
| **Cleanup Service (TCP-node-cleanup)** | Automatically deletes old data |

---

## Database — SQLite (No Server Required)

> **This project uses SQLite instead of MySQL.**
> SQLite is a lightweight file-based database — **no installation, no server, no password needed**.
> All data is stored in a single file: **`tcp_logs.db`** at the project root.
> This file is created automatically the first time you run the application.

### What changed from MySQL

| MySQL (old) | SQLite (new) |
|-------------|-------------|
| Requires MySQL Server installed | No server needed — file only |
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` in `.env` | Single `DB_PATH=./tcp_logs.db` in `.env` |
| `mysql2` npm package | `sql.js` npm package (pure JavaScript, no compilation) |
| Database created with `CREATE DATABASE` | Database file created automatically on first run |
| Data stored in MySQL data directory | Data stored in `tcp_logs.db` at project root |

### Backup & Restore

Since data is just a single file, backup is simple:

- **Backup:** Copy `tcp_logs.db` anywhere you want to keep it safe
- **Restore:** Replace `tcp_logs.db` with your backup copy (stop the app first)
- **Reset:** Delete `tcp_logs.db` and restart — schema and seed data are re-created automatically

---

## Before You Start — Install These First

You need to install these programs on your computer **one time only**.

### Step 1 — Install Node.js

1. Open your web browser and go to: **https://nodejs.org**
2. Click the big green button that says **"LTS"** (recommended for most users)
3. Download and run the installer
4. Click **Next** on every screen and then **Install**
5. When finished, click **Finish**

**To check it worked:** Open the Start Menu, search for `cmd`, open **Command Prompt**, and type:
```
node --version
```
You should see a version number like `v20.x.x`. If you do, Node.js is installed.

> **No MySQL installation required.** The database is handled automatically by the app.

---

## Setting Up the Project

### Step 2 — Open the Project Folder

1. Find the project folder on your computer (the folder containing `app.js` and `setup.bat`)
2. Click on the address bar at the top of the File Explorer window
3. Type `cmd` and press **Enter** — a Command Prompt window opens inside that folder

---

### Step 3 — Configure the Settings File

The `.env` file controls how the system works. Open it with Notepad:

1. In the project folder, find the file named `.env`
2. Right-click on it → **Open with** → **Notepad**

Here are the settings you may need to change:

```
# ── Database (SQLite — file stored at project root) ──────
DB_PATH=./tcp_logs.db      ← Path to the SQLite database file
                             (created automatically, no changes needed)

# ── Ports ────────────────────────────────────────────────
API_PORT=8001              ← Main app runs on this port
EMAIL_PORT=4001            ← Email service runs on this port

# ── Migration Security ────────────────────────────────────
MIGRATE_API_KEY=tcp_migrate_secret  ← Change this before going public

# ── Email (for sending reports) ──────────────────────────
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your@gmail.com   ← Your Gmail address
SMTP_PASS=your_app_password ← Your Gmail App Password (see note below)
SMTP_FROM=TCP Monitor <your@gmail.com>

# ── Auto Cleanup ─────────────────────────────────────────
ENABLE_AUTO_CLEANUP=true   ← Set to "false" to disable auto-delete
DATA_RETENTION_DAYS=30     ← Delete data older than this many days
CLEANUP_TIME=11:00         ← Time of day to run cleanup (24-hour format)
```

> **Gmail App Password Note:** If you use Gmail for sending emails, you need a special App Password.
> Go to your Google Account → Security → 2-Step Verification → App passwords. Generate one and paste it in `SMTP_PASS`.

> **Port Note:** The Dashboard proxy automatically reads `API_PORT` and `EMAIL_PORT` from this `.env` file. You only need to change ports in one place.

Save the file after making changes.

---

## Running the System (Production)

### ✅ One-Click Setup — `setup.bat`

Double-click **`setup.bat`** in the project folder. This single file does everything:

| Step | What It Does |
|------|-------------|
| 1 | Installs all npm dependencies for all 4 services |
| 2 | Creates the SQLite database and runs all migrations |
| 3 | Verifies all 15 required tables exist |
| 4 | Checks database health (users, companies, permissions) |
| 5 | Starts test servers and verifies all API routes are registered |
| 6 | Builds the React dashboard for production |

When complete you will see:
```
============================================================
  TCP Monitor has been successfully configured!
  Please run start.bat to launch the production server.
============================================================
```

> Run `setup.bat` **once** on a new machine, or whenever you update the project.
>
> Unlike the old MySQL version, there is **no database connection step** — the SQLite file is created automatically.

---

### ✅ One-Click Start — `start.bat`

Double-click **`start.bat`** every time you want to start the system. It:

1. Validates your `.env` file exists
2. Confirms the SQLite database file exists
3. Confirms all 15 required tables are present
4. Starts all 4 services together in production mode

**You must run `setup.bat` at least once before using `start.bat`.**

---

## Database Migrations

The migration system runs automatically on every startup via `initSchema()` in `TCP-Email/src/models/schema.js`. It is safe to run multiple times — every step is idempotent (creates tables only if they don't exist, adds columns only if missing).

### What gets created (15 tables total)

| Tables |
|--------|
| `camera_configs`, `tcp_logs`, `app_settings` |
| `companies`, `users`, `permissions`, `user_permissions` |
| `audit_logs`, `email_schedules`, `email_recipients` |
| `smtp_settings`, `email_logs`, `system_notifications` |
| `tcp_messages`, `user_tcp_configs` |

### Manual Migration via API

You can also trigger migrations manually while the server is running:

**Browser (easiest):**
```
http://localhost:8001/api/migrate?key=tcp_migrate_secret
```

**Command Prompt:**
```
curl "http://localhost:8001/api/migrate?key=tcp_migrate_secret"
```

**PowerShell:**
```powershell
Invoke-RestMethod -Uri "http://localhost:8001/api/migrate?key=tcp_migrate_secret"
```

**Postman / Insomnia:**

| Field | Value |
|-------|-------|
| Method | `GET` or `POST` |
| URL | `http://localhost:8001/api/migrate` |
| GET param | `key = tcp_migrate_secret` |
| POST header | `X-Migrate-Key: tcp_migrate_secret` |

#### Success response example

```json
{
  "success": true,
  "message": "All migrations applied successfully (SQLite).",
  "elapsed_ms": 45,
  "default_credentials": {
    "email": "superadmin@tcp.com",
    "password": "Password123"
  }
}
```

#### Default login credentials (created automatically on first migration)

| Field | Value |
|-------|-------|
| Email | `superadmin@tcp.com` |
| Password | `Password123` |

> **Security note:** Change the default Super Admin password after first login.
> The migration key is set in `.env` as `MIGRATE_API_KEY`. Change it from the default `tcp_migrate_secret` before exposing the server on any network beyond your own computer.

---

## Using the Dashboard

Once the system is running, open your browser and go to:
```
http://localhost:5173
```

From the dashboard you can:
- **View live camera logs** as they come in
- **Add or remove cameras** (name, IP address, port number)
- **Enable or disable** individual cameras
- **Configure email reports** to be sent automatically
- **View camera connection status** (connected / listening / error)
- **Manage users and permissions** via the Super Admin account
- **View system notifications** and email logs

---

## Development Mode

If you are a developer and want live-reload while editing code:

```
npm run dev:all
```

This starts all 4 services in development mode with `nodemon` (auto-restart on file changes). Each service shows output in a different color.

| Color | Service |
|-------|---------|
| Cyan | Main API |
| Yellow | Cleanup Service |
| Green | Email Service |
| Magenta | Dashboard (Vite dev server) |

---

## NPM Scripts Reference

| Script | Command | What It Does |
|--------|---------|-------------|
| `npm start` | `node app.js` | Start Main API only |
| `npm run dev` | `nodemon app.js` | Start Main API with auto-reload |
| `npm run dev:all` | `concurrently …` | Start all 4 services in dev mode |
| `npm run start:all` | `concurrently …` | Start all 4 services in production mode |
| `npm run build:dashboard` | `npm run build --prefix TCP-email-dashboard` | Build React dashboard for production |

---

## Stopping the System

To stop the system, click on the Command Prompt window running `start.bat` and press **Ctrl + C**, then type `Y` and press **Enter** when asked.

---

## API Routes Reference

### Main API (port `API_PORT`, default `8001`)

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| `GET` | `/api/cameras` | No | List all camera configs |
| `POST` | `/api/cameras` | No | Create a new camera config |
| `PUT` | `/api/cameras/:id` | No | Update a camera config |
| `DELETE` | `/api/cameras/:id` | No | Delete a camera config |
| `GET` | `/api/logs` | No | Get recent TCP logs |
| `GET` | `/api/statuses` | No | Get live TCP connection statuses |
| `GET` | `/api/tcp-image` | No | Serve matched image file |
| `GET` | `/api/migrate` | Key | Run all database migrations |
| `POST` | `/api/migrate` | Key | Run all database migrations |
| `GET` | `/api/tcp-client-config` | JWT | Get user TCP client config |
| `PUT` | `/api/tcp-client-config` | JWT | Update user TCP client config |
| `POST` | `/api/tcp-client-config/disconnect` | JWT | Disconnect user TCP clients |
| `POST` | `/api/tcp-client-config/reconnect` | JWT | Reconnect user TCP clients |

### Email API (port `EMAIL_PORT`, default `4001`)

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| `POST` | `/api/auth/login` | No | Login |
| `GET` | `/api/auth/me` | JWT | Get current user |
| `GET` | `/api/companies` | JWT | List companies |
| `POST` | `/api/companies` | JWT | Create company |
| `GET` | `/api/users` | JWT | List users |
| `POST` | `/api/users` | JWT | Create user |
| `PUT` | `/api/users/:id` | JWT | Update user |
| `DELETE` | `/api/users/:id` | JWT | Delete user |
| `GET` | `/api/users/:id/permissions` | JWT | Get user permissions |
| `PUT` | `/api/users/:id/permissions` | JWT | Update user permissions |
| `GET` | `/api/schedules` | JWT | List email schedules |
| `POST` | `/api/schedules` | JWT | Create schedule |
| `PUT` | `/api/schedules/:id` | JWT | Update schedule |
| `DELETE` | `/api/schedules/:id` | JWT | Delete schedule |
| `GET` | `/api/emails` | JWT | List email recipients |
| `POST` | `/api/emails` | JWT | Add recipient |
| `PUT` | `/api/emails/:id` | JWT | Update recipient |
| `DELETE` | `/api/emails/:id` | JWT | Remove recipient |
| `GET` | `/api/email-logs` | JWT | View email send history |
| `POST` | `/api/email-logs/send-now` | JWT | Send email now |
| `GET` | `/api/dashboard/stats` | JWT | Dashboard statistics |
| `GET` | `/api/dashboard/enhanced-stats` | JWT | Enhanced statistics |
| `GET` | `/api/dashboard/charts/messages-trend` | JWT | Messages trend chart |
| `GET` | `/api/dashboard/charts/email-status` | JWT | Email status chart |
| `GET` | `/api/dashboard/charts/daily-records` | JWT | Daily records chart |
| `GET` | `/api/dashboard/charts/email-history` | JWT | Email history chart |
| `GET` | `/api/dashboard/charts/busy-hours` | JWT | Busy hours chart |
| `GET` | `/api/messages/pending` | JWT | Pending messages |
| `GET` | `/api/records` | JWT | All records |
| `GET` | `/api/records/recent` | JWT | Recent records |
| `POST` | `/api/records/send-selected` | JWT | Email selected records |
| `POST` | `/api/records/send-filtered` | JWT | Email filtered records |
| `GET` | `/api/settings/smtp` | JWT | Get SMTP settings |
| `PUT` | `/api/settings/smtp` | JWT | Update SMTP settings |
| `POST` | `/api/settings/test-email` | JWT | Send test email |
| `GET` | `/api/notifications` | JWT | List notifications |
| `GET` | `/api/notifications/unread-count` | JWT | Unread notification count |
| `PUT` | `/api/notifications/read-all` | JWT | Mark all notifications read |
| `PUT` | `/api/notifications/:id/read` | JWT | Mark notification as read |

---

## Troubleshooting

| Problem | What to Try |
|---------|-------------|
| `node` is not recognized | Reinstall Node.js and restart your computer |
| `setup.bat` fails at npm install | Make sure you have internet access and Node.js is installed |
| `setup.bat` fails at migration | Delete `tcp_logs.db` and run `setup.bat` again to rebuild from scratch |
| `setup.bat` fails at route check | Ensure ports `API_PORT` and `EMAIL_PORT` in `.env` are not already in use |
| `start.bat` says "database not found" | Run `setup.bat` first to create and migrate the database |
| `start.bat` says "validation failed" | Run `setup.bat` first to install and migrate everything |
| Dashboard shows proxy errors on startup | Wait 3–5 seconds and refresh — this is normal during the brief startup window |
| Email not sending | Double-check your Gmail address and App Password in `.env` |
| Port already in use | Another program is using that port — change `API_PORT` or `EMAIL_PORT` in `.env` |
| Dashboard cannot reach API | Confirm `API_PORT` and `EMAIL_PORT` in `.env` match what the servers are actually listening on |
| Data looks wrong after update | Back up `tcp_logs.db`, delete it, run `setup.bat` to get a fresh schema |

---

## Project Folder Structure

```
project/
├── app.js                    ← Main application entry point
├── .env                      ← All configuration settings (edit this)
├── tcp_logs.db               ← SQLite database file (auto-created on first run)
├── schema.sql                ← Schema reference (documentation only)
├── package.json              ← Root dependencies and npm scripts
├── setup.bat                 ← One-click setup: install + migrate + build
├── start.bat                 ← One-click start: validate + launch all services
├── scripts/
│   ├── setup-check.js        ← Full health check: DB, migrations, API routes
│   └── start-check.js        ← Pre-start validation: .env, DB file, tables
├── Src/
│   ├── services/             ← TCP server logic, logging
│   ├── models/               ← Database queries (camera_configs, tcp_logs)
│   ├── routes/               ← API endpoints (camera, migrate)
│   ├── controllers/          ← Request handlers
│   ├── client/               ← TCP client connections
│   └── config/
│       └── db.js             ← SQLite adapter (better-sqlite3 shim)
├── TCP-email-dashboard/      ← React web dashboard
│   ├── vite.config.js        ← Proxy config (reads ports from root .env)
│   ├── dist/                 ← Built production files (generated by setup.bat)
│   └── src/                  ← Dashboard source code
├── TCP-Email/                ← Email report service
│   └── src/
│       ├── app.js            ← Starts server, runs initSchema() on boot
│       ├── config/
│       │   └── db.js         ← SQLite adapter (shares tcp_logs.db)
│       └── models/
│           └── schema.js     ← Full schema init + column migrations + seed data
└── TCP-node-cleanup/         ← Auto data cleanup service
    └── Src/
        └── config/
            └── db.js         ← SQLite adapter (shares tcp_logs.db)
```

---

## Port Reference

| Service | Default Port | URL | Set In |
|---------|-------------|-----|--------|
| Main API | 8001 | http://localhost:8001 | `API_PORT` in `.env` |
| Email Service | 4001 | http://localhost:4001 | `EMAIL_PORT` in `.env` |
| Dashboard | 5173 | http://localhost:5173 | Fixed in `vite.config.js` |

> All backend ports can be changed in the `.env` file. The dashboard proxy automatically reads the new values — no other files need to be edited.

---

## SQLite Notes for Developers

### Shared database file
All three Node.js services (Main API, TCP-Email, TCP-node-cleanup) open the same `tcp_logs.db` file. `sql.js` loads the database into memory, and after every write the file is flushed back to disk automatically.

### mysql2 → sql.js compatibility shim
The `db.js` in each service wraps `sql.js`'s synchronous API in an async interface to look like `mysql2/promise`, so all existing `await db.execute(sql, params)` calls work unchanged. The shim handles:
- Returning `[rows, undefined]` for SELECT queries
- Returning `[{ insertId, affectedRows }, undefined]` for write queries
- Expanding array parameters for `IN (?)` queries automatically
- Persisting the in-memory database to `tcp_logs.db` after every write

### SQL syntax differences from MySQL

| MySQL | SQLite equivalent used in this project |
|-------|----------------------------------------|
| `DATE_SUB(NOW(), INTERVAL 1 HOUR)` | `datetime('now', '-1 hour')` |
| `DATE_FORMAT(col, '%H:00')` | `strftime('%H:00', col)` |
| `CURDATE()` | `date('now')` |
| `NOW()` | `datetime('now')` |
| `SUM(condition = 1)` | `SUM(CASE WHEN condition THEN 1 ELSE 0 END)` |
| `CAST(id AS CHAR)` | `CAST(id AS TEXT)` |
| `INSERT IGNORE` | `INSERT OR IGNORE` |
| `AUTO_INCREMENT` | `INTEGER PRIMARY KEY AUTOINCREMENT` |
| `TINYINT(1)` | `INTEGER` |
| `ENUM('a','b')` | `TEXT CHECK(col IN ('a','b'))` |
| `ON UPDATE CURRENT_TIMESTAMP` | Set `updated_at = datetime('now')` manually in UPDATE |
| `SMALLINT UNSIGNED` | `INTEGER` |

---

## Need Help?

If something is not working, check the `logs/` folder inside the project. Log files are named by date (e.g., `app-2026-08-19.log`) and contain detailed information about what went wrong.

Each sub-service also has its own `logs/` folder:
- `logs/` — Main API logs
- `TCP-Email/logs/` — Email service logs
- `TCP-node-cleanup/Src/logs/` — Cleanup service logs
