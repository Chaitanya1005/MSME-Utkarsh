import React from 'react';
import { ActivityIndicator, Image, StyleSheet, Text, View } from 'react-native';

// Shown while AuthContext resolves the stored session (status ===
// 'loading') — the brief moment between app launch and either the role
// selection screen (unauthenticated) or a dashboard (authenticated).
// Replaces what used to be a blank white flash with the same branding
// LoginScreen uses.
export function SplashScreen() {
  return (
    <View style={styles.container}>
      <View style={styles.logoContainer}>
        <Image
          source={require('../../assets/header logo.png')}
          style={styles.logo}
          resizeMode="contain"
        />
      </View>

      <Text style={styles.productName}>MSME - Utkarsh</Text>
      <View style={styles.accentLine} />
      <Text style={styles.productSubtitle}>Performance Evaluation System</Text>

      <ActivityIndicator style={styles.spinner} color="#FFFFFF" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B3D91',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  logoContainer: {
    width: 220,
    height: 90,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOpacity: 0.2,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  logo: { width: '86%', height: '80%' },
  productName: {
    marginTop: 28,
    fontSize: 26,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.2,
    textAlign: 'center',
  },
  accentLine: {
    width: 46,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#7FE0AC',
    marginTop: 10,
  },
  productSubtitle: {
    marginTop: 9,
    fontSize: 13,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.75)',
    textAlign: 'center',
  },
  spinner: { marginTop: 36 },
});
