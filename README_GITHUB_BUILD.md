# SWASTIK — Cloud Android Build

This project is prepared to build in GitHub Actions without CodeOnTheGo or Android Studio.

## What the workflow creates

- `SWASTIK-debug.apk` — test install on an Android phone.
- `SWASTIK-release-unsigned.aab` — release App Bundle build, not yet signed for Google Play upload.

## GitHub steps

1. Upload this project's files into the `SWASTIK` GitHub repository, keeping the `.github/workflows/build-android.yml` path.
2. Open the repository's **Actions** tab.
3. Open **Build SWASTIK Android**.
4. Tap **Run workflow** and select `main`.
5. When the green check appears, open that run and download **SWASTIK-Android-Builds** from Artifacts.

## Important

The release AAB produced here is unsigned. Google Play requires a properly signed app bundle. Do not upload a keystore or signing password to a public GitHub repository.
