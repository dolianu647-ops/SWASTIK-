# SWASTIK v4 — working social-platform starter

This package is a functional prototype with a browser UI and a Node.js backend. It uses only Node's built-in modules, so there is no `npm install` step.

## Included
- Signup/login/logout with hashed passwords and session cookies
- Home feed and search
- Create text/image posts (client-side resize; server validates type/size)
- Like/unlike, comments, follow/unfollow
- User profiles and basic profile editing
- Notifications for likes/comments/follows/messages
- One-to-one conversations and messages
- Delete your own posts
- JSON persistence and local media storage
- Health check at `/health`
- Responsive mobile-first UI and PWA manifest/service worker
- Basic security headers, request limits and simple rate limiting

## Run locally
1. Install Node.js 20+.
2. Open this folder in a terminal.
3. Run `node server.js`.
4. Open `http://localhost:3000` in Chrome.

Demo accounts:
- `ashu` / `Demo@123`
- `riya` / `Demo@123`
- `rahul` / `Demo@123`

## Deploy
Any Node.js host that supports a persistent filesystem can run this package. Start command: `node server.js`. The service listens on the `PORT` environment variable (default 3000).

For a real public social network, do not rely on a single JSON file forever. Move users/posts/messages to a managed database and move media to object storage before a larger launch. Enable HTTPS and keep production secrets outside the repo.

## Android / Play Store
The web app can later be wrapped in an Android project after its public HTTPS URL is live. The Android Play Store submission must meet Google's current target API and testing requirements; the web backend must be online first so the Android app has a stable URL to load.
