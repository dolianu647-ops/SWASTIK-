# SWASTIK deployment checklist

## 1. Upload
Upload this whole `swastik_v4` folder to a Node.js host with a persistent filesystem.

## 2. Start command
`node server.js`

## 3. Required environment
`NODE_ENV=production`

The host should provide `PORT` automatically. The server listens on `0.0.0.0`.

## 4. First test
Open:
`https://YOUR-HOST/health`

You should receive JSON containing `ok: true` and `name: "SWASTIK"`.

## 5. Then test the website
Open the HTTPS home URL and create a new account. Test post, image, like, comment, follow, profile edit, notifications and messages.

## 6. Before public launch
Use a managed database and object storage, add a content-report/block flow, stronger abuse prevention, backups, logging/monitoring, email/password recovery, privacy policy and terms, and a moderation process. Do not expose database files publicly.

## 7. Android
Only after the HTTPS website is stable, package it as an Android app and point the app at that HTTPS URL. For a new Google Play submission in 2026, Google currently requires Android 16 / API 36 or higher as the target API for new apps and updates; Google also requires a closed test with at least 12 opted-in testers for 14 continuous days for qualifying new personal developer accounts before production access.
