import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../auth/AuthContext';
import { LoadingState, ErrorState } from '../../components/StatusStates';
import { ApiError, NetworkError } from '../../api/client';

// Reached only via the cbipes://follow-up-access/:token deep link sent in
// a Phase 2 follow-up message (spec section 15). This screen has exactly
// one job: exchange the opaque token for a real session, then get out of
// the way — RootNavigator reacts to the resulting authenticated state and
// routes to BMHomeScreen automatically, the same as after a normal login.
export function FollowUpAccessScreen({ route }: { route: { params?: { token?: string } } }) {
  const { loginWithAccessToken } = useAuth();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const token = route.params?.token;

  useEffect(() => {
    let cancelled = false;

    async function exchange() {
      if (!token) {
        setErrorMessage('This link is missing its access code.');
        return;
      }
      try {
        await loginWithAccessToken(token);
        // On success, AuthContext's state flips to 'authenticated' and
        // RootNavigator re-renders past this screen — nothing else to do.
      } catch (err) {
        if (cancelled) return;
        if (err instanceof NetworkError) {
          setErrorMessage(err.message);
        } else if (err instanceof ApiError && err.code === 'ACCESS_TOKEN_EXPIRED') {
          setErrorMessage('This follow-up link has expired. Ask your Regional Head to resend it.');
        } else if (err instanceof ApiError) {
          setErrorMessage(err.message);
        } else {
          setErrorMessage('This link could not be used. Please try again or contact your Regional Head.');
        }
      }
    }

    exchange();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  if (errorMessage) {
    return (
      <View style={styles.container}>
        <ErrorState message={errorMessage} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <LoadingState label="Verifying your access link..." />
      <Text style={styles.hint}>This will only take a moment.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F6F9' },
  hint: { textAlign: 'center', color: '#888888', fontSize: 12, marginTop: -12 },
});
