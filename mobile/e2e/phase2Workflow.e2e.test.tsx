/**
 * Gate 5 — Phase 2 end-to-end workflow, driven through the app's own screens.
 *
 * This renders the REAL screen components, the REAL AuthContext, the REAL API
 * client and the REAL React Query cache against a REAL running backend. Nothing
 * about the API layer is mocked: every request below is an actual HTTP call to
 * http://localhost:4000/api, hitting Postgres.
 *
 * WHAT THIS DOES NOT COVER (stated plainly rather than implied):
 *   - No Metro bundling, no native build, no device or emulator. Components are
 *     rendered by react-test-renderer, so native views are trees of objects,
 *     not pixels. Layout, gestures, and platform behaviour are NOT tested.
 *   - RootNavigator itself is stood in for by AppUnderTest below (same role
 *     routing), because the native-stack navigator needs native screens. The
 *     cbipes:// deep-link CONFIG in RootNavigator is therefore not exercised —
 *     this test injects the token the way the navigator would deliver it.
 *   - Linking.openURL is spied on: this environment has no WhatsApp to open.
 *
 * Requires: backend running on :4000 with the dev database seeded.
 * Run with:  npm run test:e2e
 */
import React, { useState } from 'react';
import { Linking, Text } from 'react-native';
import TestRenderer, { act, ReactTestInstance } from 'react-test-renderer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { AuthProvider, useAuth } from '../src/auth/AuthContext';
import { LoginScreen } from '../src/screens/Login/LoginScreen';
import { RMDashboardScreen } from '../src/screens/RMDashboard/RMDashboardScreen';
import { FollowUpScreen } from '../src/screens/FollowUp/FollowUpScreen';
import { BMHomeScreen } from '../src/screens/BMHome/BMHomeScreen';
import { FollowUpAccessScreen } from '../src/screens/FollowUpAccess/FollowUpAccessScreen';
import { setAuthToken } from '../src/api/client';
import { AUTH_TOKEN_STORAGE_KEY } from '../src/config/env';

jest.setTimeout(120000);

// The app's env module hardcodes a LAN IP for a physical Android device.
// Point it at the locally running backend instead of editing the source.
jest.mock('../src/config/env', () => ({
  API_BASE_URL: process.env.E2E_API_BASE_URL ?? 'http://localhost:4000/api',
  AUTH_TOKEN_STORAGE_KEY: 'MSME Utkarsh:auth-token',
}));

// AsyncStorage is native; use the package's own official jest mock so token
// persistence behaves like the real thing (in memory).
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

// Stand-in for RootNavigator: same role-based routing, no native stack.
function AppUnderTest({ deepLinkToken }: { deepLinkToken?: string }) {
  const { status, user } = useAuth();
  const [screen, setScreen] = useState<{ name: string; params?: Record<string, unknown> }>({
    name: 'default',
  });

  const navigation = {
    navigate: (name: string, params?: Record<string, unknown>) => setScreen({ name, params }),
    popToTop: () => setScreen({ name: 'default' }),
    goBack: () => setScreen({ name: 'default' }),
  };

  if (status === 'loading') return <Text testID="app-loading">loading</Text>;

  if (status === 'unauthenticated') {
    // The deep link is reachable without a session — that is its whole point.
    if (deepLinkToken) {
      return <FollowUpAccessScreen route={{ params: { token: deepLinkToken } }} />;
    }
    return <LoginScreen />;
  }

  if (user?.role === 'RM') {
    if (screen.name === 'FollowUp') {
      return (
        <FollowUpScreen
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          route={{ params: screen.params } as any}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          navigation={navigation as any}
        />
      );
    }
    return (
      <RMDashboardScreen
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        route={{ key: 'RMDashboard', name: 'RMDashboard', params: undefined } as any}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        navigation={navigation as any}
      />
    );
  }

  return <BMHomeScreen />;
}

function mount(deepLinkToken?: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  let renderer!: TestRenderer.ReactTestRenderer;
  TestRenderer.act(() => {
    renderer = TestRenderer.create(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <AppUnderTest deepLinkToken={deepLinkToken} />
        </AuthProvider>
      </QueryClientProvider>
    );
  });
  return renderer;
}

// Simulates picking up a different physical phone: no stored session, no
// in-memory token. Without this the BM tree would resume the RM's session.
async function useAFreshDevice() {
  setAuthToken(null);
  await AsyncStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
}

async function flush(ms = 60) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}

async function waitFor(label: string, predicate: () => boolean, timeoutMs = 20000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (predicate()) return;
    await flush();
  }
  throw new Error(`Timed out waiting for: ${label}`);
}

// Collects the rendered text. Walks only `children` — the rendered props
// contain circular references (context providers), so JSON.stringify is out.
function screenText(renderer: TestRenderer.ReactTestRenderer): string {
  const parts: string[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const visit = (node: any): void => {
    if (node === null || node === undefined) return;
    if (typeof node === 'string' || typeof node === 'number') {
      parts.push(String(node));
      return;
    }
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (node.children) visit(node.children);
  };
  visit(renderer.toJSON());
  return parts.join('');
}

// The rendered text of one subtree (e.g. a single branch row).
function textOf(instance: ReactTestInstance): string {
  const parts: string[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const visit = (node: any): void => {
    if (node === null || node === undefined) return;
    if (typeof node === 'string' || typeof node === 'number') {
      parts.push(String(node));
      return;
    }
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (node.props?.children !== undefined) visit(node.props.children);
  };
  instance.findAllByType(Text).forEach(visit);
  return parts.join('');
}

// testID lands on both the composite and its host element; take the first.
function byTestId(renderer: TestRenderer.ReactTestRenderer, testID: string): ReactTestInstance {
  const found = renderer.root.findAllByProps({ testID });
  if (found.length === 0) throw new Error(`No element with testID "${testID}"`);
  return found[0];
}

function hasTestId(renderer: TestRenderer.ReactTestRenderer, testID: string): boolean {
  return renderer.root.findAllByProps({ testID }).length > 0;
}

async function press(renderer: TestRenderer.ReactTestRenderer, testID: string) {
  const el = byTestId(renderer, testID);
  await act(async () => {
    el.props.onPress();
  });
}

async function type(renderer: TestRenderer.ReactTestRenderer, testID: string, value: string) {
  const el = byTestId(renderer, testID);
  await act(async () => {
    el.props.onChangeText(value);
  });
}

// ---------------------------------------------------------------------------

beforeAll(async () => {
  if (typeof globalThis.fetch !== 'function') {
    throw new Error('global fetch is unavailable — this test needs Node 18+');
  }
  const health = await fetch('http://localhost:4000/health');
  if (!health.ok) throw new Error('Backend is not healthy on :4000');
});

describe('Gate 5 — RM follow-up to BM access, through the app', () => {
  let capturedDeepLink: string | null = null;
  let branchName: string | null = null;
  let branchTestId: string | null = null;
  let bmName: string | null = null;

  it('RM logs in, sees their dashboard, and selects a branch to follow up', async () => {
    await useAFreshDevice();
    const app = mount();

    await waitFor('login screen', () => hasTestId(app, 'login-submit-button'));

    await type(app, 'login-username-input', 'rm.a1');
    await type(app, 'login-password-input', 'ChangeMe123!');
    await press(app, 'login-submit-button');

    // Real login -> real /auth/me -> real /rm/dashboard.
    await waitFor('RM dashboard', () => screenText(app).includes('Region A1'), 30000);
    const dashboard = screenText(app);
    expect(dashboard).toContain('Asha Verma');
    expect(dashboard).toContain('Branch A101');
    expect(dashboard).toContain('Branch A102');

    // No follow-up CTA until at least one branch is selected.
    expect(hasTestId(app, 'follow-up-cta')).toBe(false);

    const branchRow = app.root
      .findAllByProps({})
      .filter((n) => typeof n.props.testID === 'string' && n.props.testID.startsWith('branch-row-'))[0];
    const branchTestId: string = branchRow.props.testID;
    await press(app, branchTestId);

    await waitFor('follow-up CTA', () => hasTestId(app, 'follow-up-cta'));
    expect(screenText(app)).toContain('Follow up with 1 branch');

    // Into the follow-up composer.
    await press(app, 'follow-up-cta');
    await waitFor('follow-up composer', () => hasTestId(app, 'send-follow-up-button'));

    app.unmount();
  });

  it('RM composes and sends a WhatsApp follow-up; the app confirms it as sent', async () => {
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined as never);
    await useAFreshDevice();
    const app = mount();

    await waitFor('login screen', () => hasTestId(app, 'login-submit-button'));
    await type(app, 'login-username-input', 'rm.a1');
    await type(app, 'login-password-input', 'ChangeMe123!');
    await press(app, 'login-submit-button');
    await waitFor('RM dashboard', () => screenText(app).includes('Region A1'), 30000);

    const branchRow = app.root
      .findAllByProps({})
      .filter((n) => typeof n.props.testID === 'string' && n.props.testID.startsWith('branch-row-'))[0];
    const rowText = textOf(branchRow);
    branchTestId = branchRow.props.testID as string;
    branchName = rowText.match(/Branch A10\d/)?.[0] ?? null;
    bmName = rowText.match(/BM: ([A-Za-z ]+?)\d/)?.[1]?.trim() ?? null;
    expect(branchName).not.toBeNull();
    expect(bmName).not.toBeNull();
    await press(app, branchTestId);
    await press(app, 'follow-up-cta');
    await waitFor('follow-up composer', () => hasTestId(app, 'send-follow-up-button'));

    await press(app, 'channel-WHATSAPP');
    await type(app, 'custom-note-input', 'Gate 5 end-to-end run.');
    await press(app, 'send-follow-up-button');

    // Real POST /api/rm/follow-ups.
    await waitFor('follow-up result', () => screenText(app).includes('Follow-up initiated'), 30000);
    expect(screenText(app)).toContain('Awaiting send'); // StatusBadge label for PENDING

    // The "Open WhatsApp to send" button only exists because the backend
    // returned a deep link for this target.
    const openButton = app.root
      .findAllByProps({})
      .filter((n) => typeof n.props.testID === 'string' && n.props.testID.startsWith('open-whatsapp-'))[0];
    expect(openButton).toBeDefined();

    await act(async () => {
      openButton.props.onPress();
    });

    // The device "opened" WhatsApp...
    await waitFor('Linking.openURL called', () => openURL.mock.calls.length > 0);
    capturedDeepLink = openURL.mock.calls[0][0] as string;
    expect(capturedDeepLink).toMatch(/^https:\/\/wa\.me\//);

    // ...and the app then confirmed it server-side, flipping the badge.
    // This is the fix from Gate 3, exercised through the real screen.
    await waitFor(
      'target badge flips to Sent',
      () => screenText(app).includes('Sent') && !screenText(app).includes('Awaiting send'),
      20000
    );
    expect(screenText(app)).not.toContain('Open WhatsApp to send');

    openURL.mockRestore();
    app.unmount();
  });

  it('BM opens the link on a different device and lands in their own branch', async () => {
    expect(capturedDeepLink).not.toBeNull();
    const rawToken = decodeURIComponent(capturedDeepLink!).match(
      /cbipes:\/\/follow-up-access\/([0-9a-f]{64})/
    )?.[1];
    expect(rawToken).toBeDefined();

    await useAFreshDevice();
    const app = mount(rawToken);

    // FollowUpAccessScreen exchanges the token, AuthContext flips to
    // authenticated, and the BM's own screen renders — no password anywhere.
    await waitFor('BM home', () => screenText(app).includes('Branch Head'), 30000);
    const bmScreen = screenText(app);
    // The session belongs to THIS branch's BM — nobody typed a password.
    expect(bmScreen).toContain(bmName!);
    expect(bmScreen).toContain(branchName!);
    // Their own leads loaded under the link-issued session.
    await waitFor('BM leads', () => /lead|customer/i.test(screenText(app)), 20000);

    app.unmount();
  });

  it('RM reloads the dashboard and sees the branch marked as followed up', async () => {
    await useAFreshDevice();
    const app = mount();

    await waitFor('login screen', () => hasTestId(app, 'login-submit-button'));
    await type(app, 'login-username-input', 'rm.a1');
    await type(app, 'login-password-input', 'ChangeMe123!');
    await press(app, 'login-submit-button');
    await waitFor('RM dashboard', () => screenText(app).includes('Region A1'), 30000);

    // The round trip is visible to the RM two ways: the coarse status pill
    // moves to "Follow-up sent" (FOLLOW_UP_INITIATED), and the branch row
    // reports what became of the nudge — here, that the BM opened the link.
    await waitFor(
      'branch pill showing Follow-up sent',
      () => hasTestId(app, branchTestId!) && textOf(byTestId(app, branchTestId!)).includes('Follow-up sent'),
      20000
    );
    const rowText = textOf(byTestId(app, branchTestId!));
    expect(rowText).toContain(branchName!);
    expect(rowText).toContain('WhatsApp follow-up');
    expect(rowText).toContain('opened by the BM');

    app.unmount();
  });
});
