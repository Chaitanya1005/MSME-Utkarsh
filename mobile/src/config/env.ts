// React Native does not read `.env` files the way Node.js does — there is
// no process.env at runtime by default. Rather than pull in a native
// config module for Phase 1 (spec section 46 warns against unnecessary
// complexity), this file centralizes the one thing Phase 1 actually needs
// to configure per-environment: the backend API base URL.
//
// IMPORTANT (Android emulator networking): `localhost` from inside the
// Android emulator refers to the emulator itself, not your development
// machine. The Android emulator's special alias for the host machine's
// localhost is 10.0.2.2. If you are testing on a PHYSICAL Android device
// instead (which spec section 45 expects), use your development
// machine's LAN IP address (e.g. 192.168.1.23) and make sure the device
// is on the same network and your firewall allows inbound connections on
// the backend's port.
//
// This value intentionally has no secrets in it — never put backend
// secrets (JWT_SECRET, DB credentials) in the mobile bundle (spec
// section 46).
const ANDROID_EMULATOR_HOST = '10.158.96.183';
const BACKEND_PORT = 4000;

// Replace this with your development machine's LAN IP when testing on a
// physical Android device, e.g. 'http://192.168.1.23:4000/api'.
export const API_BASE_URL = `http://${ANDROID_EMULATOR_HOST}:${BACKEND_PORT}/api`;

export const AUTH_TOKEN_STORAGE_KEY = 'MSME Utkarsh:auth-token';
