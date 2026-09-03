# Yemden Task Management Backend

Node.js + Express + MongoDB API for the internal project/task management MVP.

## What This Backend Includes

- JWT login with bcrypt password hashing
- Default admin seeder
- User management APIs
- Project APIs
- Task APIs with status update
- Monthly calendar task API
- Dashboard summary API
- Cursor-paginated list APIs with bounded page sizes
- Dynamic admin-managed roles with priority, task scope, action permissions,
  visible task statuses, and allowed status changes

## Folder Structure

```text
backend/
  src/
    config/       MongoDB and environment setup
    controllers/  API business logic
    middleware/   Auth, role, and error middleware
    models/       Mongoose schemas
    routes/       Express route files
    seed/         Admin seed script
    utils/        Small shared helpers
    app.js        Express app setup
    server.js     Server startup
```

## First-Time Setup

Run these commands from the backend server project:

```bash
cd /Users/techprospero/Development/Projects/yemden_task_management_server
npm install
```

Create or update `.env`:

```env
NODE_ENV=development
PORT=5001
MONGO_URI=mongodb://127.0.0.1:27017/yemden_task_management
JWT_SECRET=replace_with_a_long_random_secret_before_production
JWT_EXPIRES_IN=7d
ADMIN_NAME=Admin
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=Admin@12345
APP_URL=https://march-depth-abreast.ngrok-free.dev/#/login?from=/dashboard
CORS_ORIGINS=http://localhost:8080

# Optional SMTP settings for user invitation emails.
SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
MAIL_FROM="Yemden Task Management <no-reply@example.com>"
```

When SMTP is configured, creating a user sends an invitation email with the site link, login email, internal user ID, role, and temporary password. If SMTP is not configured, user creation still succeeds and the API returns that the email was skipped.

## MongoDB Options

For local MongoDB, make sure MongoDB is running before starting the backend:

```bash
mongod --version
```

If you use MongoDB Atlas, replace `MONGO_URI` in `.env` with your Atlas connection string.

## Create Default Admin

```bash
npm run seed:admin
```

Default login from `.env`:

```text
Email: admin@example.com
Password: Admin@12345
```

## Start Development Server

```bash
npm run dev
```

The backend runs at:

```text
http://localhost:5001
```

Health check:

```bash
curl http://localhost:5001/api/health
```

## Test Login With curl

```bash
curl -X POST http://localhost:5001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"Admin@12345"}'
```

Copy the `token` from the response and use it like this:

```bash
curl http://localhost:5001/api/auth/me \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

## Useful Commands

```bash
npm run dev        # start backend with auto-restart using node --watch
npm start          # start backend normally
npm run seed:admin # create/update default admin user
npm run check      # JavaScript syntax checks for production entry points
npm test           # configuration and deployment-safety tests
```

## Production Deployment Helpers

Production deployment templates live in `deploy/`:

- `deploy/production.env.example` lists the required production variables.
- `deploy/nginx/yemden-api.conf.example` proxies HTTPS traffic to Node on port 5001.
- `ecosystem.config.js` runs exactly one API process so the local uploads folder and reminder worker remain consistent.

The server refuses to start with `NODE_ENV=production` when required secrets,
HTTPS URLs, or allowed CORS origins are missing or unsafe.

### Migrate old upload URLs

After backing up and restoring MongoDB, preview old localhost/ngrok upload URLs:

```bash
UPLOAD_PUBLIC_ORIGIN=https://api.example.com \
LEGACY_UPLOAD_ORIGINS=http://localhost:5001,https://march-depth-abreast.ngrok-free.dev \
npm run migrate:upload-origins
```

The command is a dry run by default. Apply only after verifying the backup and
reported counts:

```bash
UPLOAD_PUBLIC_ORIGIN=https://api.example.com \
LEGACY_UPLOAD_ORIGINS=http://localhost:5001,https://march-depth-abreast.ngrok-free.dev \
npm run migrate:upload-origins -- --apply
```

## Main API Paths

```text
POST /api/auth/login
GET  /api/auth/me

GET    /api/roles
POST   /api/roles
PUT    /api/roles/:id
DELETE /api/roles/:id

POST   /api/users
GET    /api/users?limit=25&cursor=OPAQUE_CURSOR
GET    /api/users/options
GET    /api/users/:id
PUT    /api/users/:id
DELETE /api/users/:id

POST   /api/projects
GET    /api/projects?limit=25&cursor=OPAQUE_CURSOR
GET    /api/projects/options
GET    /api/projects/:id
PUT    /api/projects/:id
DELETE /api/projects/:id

POST   /api/tasks
GET    /api/tasks?limit=25&cursor=OPAQUE_CURSOR
GET    /api/tasks/:id
GET    /api/tasks/project/:projectId
GET    /api/tasks/my-tasks
PATCH  /api/tasks/:id/status
GET    /api/tasks/calendar?month=7&year=2026

GET /api/dashboard/summary
```

Task lists accept either the existing single-project filter
`project=PROJECT_ID` or a multi-project filter with comma-separated IDs:

```text
GET /api/tasks?projects=PROJECT_ID_1,PROJECT_ID_2
```

The built-in admin, manager, employee, and social-media-handler roles are
created automatically the first time role-aware authentication runs. Existing
users keep their current role key, so no one-off role migration is required.
Only admins can create, edit, or delete role definitions. A role cannot be
deleted while users are assigned to it, and the admin role always retains full
access.

## Pagination

Tasks, project tasks, users, projects, notifications, and task collaboration
streams use cursor pagination. `limit` defaults to 25 and is capped at 100 for
main lists. Pass the returned `pageInfo.nextCursor` unchanged to request the
next page:

```json
{
  "tasks": [],
  "pageInfo": {
    "limit": 25,
    "hasNext": true,
    "nextCursor": "opaque-value"
  }
}
```

The `/users/options` and `/projects/options` routes are lightweight feeds for
authorized form dropdowns. They are separate from management-table pagination
so a table page never removes valid assignment choices.

Task collaboration returns independent cursors under `pageInfo.comments`,
`pageInfo.documents`, and `pageInfo.activities`. Use `section=comments`,
`section=documents`, or `section=activities` when loading older records to avoid
re-fetching the other sections.
# yemden_task_server
