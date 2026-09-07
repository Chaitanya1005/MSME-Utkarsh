// React Native does not read `.env` files the way Node.js does — there is
// no process.env at runtime by default. Rather than pull in a native
// config module for Phase 1 (spec section 46 warns against unnecessary
// complexity), this file centralizes the one thing Phase 1 actually needs
// to configure per-environment: the backend API base URL.
//
// __DEV__ is a real-value global React Native/Expo sets for you — true
// when running through Metro (npx expo start / Expo Go / a dev client),
// false in any release build (an EAS "preview"/"production" APK, or a
// local `./gradlew assembleRelease`). This is what makes a release APK
// automatically talk to the deployed backend with zero manual steps at
// build time, instead of needing the previous "run the backend on your
// laptop and connect the phone to it" workflow.
//
// IMPORTANT (dev-mode LAN networking only): `localhost` from inside the
// Android emulator refers to the emulator itself, not your development
// machine — its alias for the host machine's localhost is 10.0.2.2. If
// you are testing on a PHYSICAL Android device via Expo Go instead
// (which spec section 45 expects), use your development machine's LAN
// IP address and make sure the device is on the same Wi-Fi network and
// your firewall allows inbound connections on the backend's port. This
// only matters for `__DEV__` — a built APK never uses it.
const DEV_LAN_HOST = '10.147.115.183';
const DEV_BACKEND_PORT = 4000;

// The deployed backend (Render). Update this if the Render service is
// ever renamed — Render URLs are always https://<service-name>.onrender.com.
const PRODUCTION_API_BASE_URL = 'https://msme-utkarsh-backend.onrender.com/api';

// This value intentionally has no secrets in it — never put backend
// secrets (JWT_SECRET, DB credentials) in the mobile bundle (spec
// section 46).
export const API_BASE_URL = __DEV__
  ? `http://${DEV_LAN_HOST}:${DEV_BACKEND_PORT}/api`
  : PRODUCTION_API_BASE_URL;

export const AUTH_TOKEN_STORAGE_KEY = 'MSME Utkarsh:auth-token';
