import React, { useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useAuth, ApiError } from '../../auth/AuthContext';
import { NetworkError } from '../../api/client';

type Role = {
  id: string;
  label: string;
  shortLabel: string;
};

const ROLES: Role[] = [
  {
    id: 'central',
    label: 'General Manager',
    shortLabel: 'General Manager',
  },
  {
    id: 'zonal',
    label: 'Zonal Head',
    shortLabel: 'Zonal Head',
  },
  {
    id: 'regional',
    label: 'Regional Head',
    shortLabel: 'Regional Head',
  },
  {
    id: 'branch',
    label: 'Branch Head',
    shortLabel: 'Branch Head',
  },
];

export function LoginScreen() {
  const { login } = useAuth();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);

  const canSubmit =
    username.trim().length > 0 &&
    password.length > 0 &&
    !submitting;

  function selectRole(role: Role) {
    setErrorMessage(null);
    setSelectedRole(role);
  }

  function changeRole() {
    setErrorMessage(null);
    setSelectedRole(null);
  }

  async function handleSubmit() {
    if (!canSubmit) {
      return;
    }

    setErrorMessage(null);
    setSubmitting(true);

    try {
      // Role selection is currently UI-only.
      // The selected role is intentionally NOT sent to the backend.
      await login(username.trim(), password);

      // Navigation reacts automatically to auth state change.
    } catch (err) {
      if (err instanceof NetworkError) {
        setErrorMessage(err.message);
      } else if (
        err instanceof ApiError &&
        err.code === 'INVALID_CREDENTIALS'
      ) {
        setErrorMessage('Incorrect username or password.');
      } else if (err instanceof ApiError) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('Something went wrong. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* =====================================================
          BANK LOGO
      ====================================================== */}

      <View style={styles.branding}>
        <View style={styles.logoContainer}>
          <Image
            source={require('../../assets/header logo.png')}
            style={{
              width: '94%',
              height: '90%',
            }}
            resizeMode="contain"
          />
        </View>

        <Text style={styles.productName}>MSME - Utkarsh</Text>

        <View style={styles.accentLine} />

        <Text style={styles.productSubtitle}>
          Performance Evaluation System
        </Text>
      </View>

      {/* =====================================================
          MAIN CONTENT
      ====================================================== */}

      <View style={styles.content}>
        {!selectedRole ? (
          /* =================================================
             ROLE SELECTION
          ================================================== */

          <View style={styles.roleScreen}>
            <Text style={styles.sectionTitle}>Select your role</Text>

            <View style={styles.roleList}>
              {ROLES.map((role) => (
                <TouchableOpacity
                  key={role.id}
                  activeOpacity={0.78}
                  style={styles.roleCard}
                  onPress={() => selectRole(role)}
                  testID={`role-${role.id}`}
                >
                  <View style={styles.roleAccent} />

                  <View style={styles.roleIcon}>
                    <Text style={styles.roleIconText}>
                      {role.id === 'central'
                        ? 'GM'
                        : role.id === 'zonal'
                          ? 'ZH'
                          : role.id === 'regional'
                            ? 'RH'
                            : 'BH'}
                    </Text>
                  </View>

                  <Text style={styles.roleText}>{role.label}</Text>

                  <View style={styles.arrowContainer}>
                    <Text style={styles.arrow}>›</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ) : (
          /* =================================================
             LOGIN FORM
          ================================================== */

          <View style={styles.loginScreen}>
            <TouchableOpacity
              activeOpacity={0.7}
              style={styles.changeRoleButton}
              onPress={changeRole}
              disabled={submitting}
              testID="change-role-button"
            >
              <Text style={styles.changeRoleText}>‹ Change role</Text>
            </TouchableOpacity>

            <View style={styles.loginHeading}>
              <Text style={styles.loginCaption}>Signing in as</Text>

              <Text style={styles.selectedRole}>
                {selectedRole.shortLabel}
              </Text>

              <View style={styles.smallAccentLine} />
            </View>

            {/* USERNAME */}

            <Text style={styles.fieldLabel}>Username</Text>

            <TextInput
              style={styles.input}
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="Enter username"
              placeholderTextColor="#8A8F98"
              editable={!submitting}
              testID="login-username-input"
            />

            {/* PASSWORD */}

            <Text style={styles.fieldLabel}>Password</Text>

            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="Enter password"
              placeholderTextColor="#8A8F98"
              editable={!submitting}
              testID="login-password-input"
            />

            {/* ERROR */}

            {errorMessage ? (
              <Text
                style={styles.errorText}
                testID="login-error-message"
              >
                {errorMessage}
              </Text>
            ) : null}

            {/* SIGN IN */}

            <TouchableOpacity
              activeOpacity={0.82}
              style={[
                styles.button,
                !canSubmit && styles.buttonDisabled,
              ]}
              onPress={handleSubmit}
              disabled={!canSubmit}
              testID="login-submit-button"
            >
              <Text style={styles.buttonText}>
                {submitting ? 'Signing in...' : 'Sign In'}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  /* =========================================================
     PAGE
  ========================================================== */

  container: {
    flex: 1,
    backgroundColor: '#F6F9FC',
  },

  /* =========================================================
     BRANDING
  ========================================================== */

  branding: {
    alignItems: 'center',
    paddingTop: Platform.OS === 'android' ? 70 : 54,
    paddingHorizontal: 18,
  },

  logoContainer: {
    width: '100%',
    height: 108,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2EAF2',

    shadowColor: '#0B4A8B',
    shadowOpacity: 0.07,
    shadowRadius: 10,
    shadowOffset: {
      width: 0,
      height: 4,
    },

    elevation: 2,
  },

  productName: {
    marginTop: 35,
    fontSize: 30,
    fontWeight: '800',
    color: '#0B4A8B',
    letterSpacing: 0.2,
    textAlign: 'center',
  },

  accentLine: {
    width: 46,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#D7194B',
    marginTop: 9,
  },

  productSubtitle: {
    marginTop: 7,
    fontSize: 14,
    fontWeight: '500',
    color: '#6C7682',
    textAlign: 'center',
  },

  /* =========================================================
     CONTENT
  ========================================================== */

  content: {
    flex: 1,
    paddingHorizontal: 25,
  },

  /* =========================================================
     ROLE SELECTION
  ========================================================== */

  roleScreen: {
    flex: 1,
    paddingTop: 45,
  },

  sectionTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#172331',
    textAlign: 'center',
    letterSpacing: -0.3,
  },

  roleList: {
    marginTop: 10,
    gap: 13,
  },

  roleCard: {
    height: 68,
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,

    flexDirection: 'row',
    alignItems: 'center',

    borderWidth: 1,
    borderColor: '#E0E7EF',

    shadowColor: '#183B5B',
    shadowOpacity: 0.08,
    shadowRadius: 9,
    shadowOffset: {
      width: 0,
      height: 4,
    },

    elevation: 3,

    overflow: 'hidden',
  },

  roleAccent: {
    width: 4,
    height: '100%',
    backgroundColor: '#0B5CAB',
  },

  roleIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    marginLeft: 17,
    marginRight: 13,

    alignItems: 'center',
    justifyContent: 'center',

    backgroundColor: '#EAF2FB',
  },

  roleIconText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0B5CAB',
  },

  roleText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: '#202B38',
  },

  arrowContainer: {
    width: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 5,
  },

  arrow: {
    fontSize: 29,
    fontWeight: '300',
    color: '#0B5CAB',
    lineHeight: 31,
  },

  /* =========================================================
     LOGIN SCREEN
  ========================================================== */

  loginScreen: {
    flex: 1,
    paddingTop: 25,
  },

  changeRoleButton: {
    alignSelf: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 2,
  },

  changeRoleText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0B5CAB',
  },

  loginHeading: {
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 27,
  },

  loginCaption: {
    fontSize: 13,
    fontWeight: '500',
    color: '#7A8490',
  },

  selectedRole: {
    marginTop: 4,
    fontSize: 24,
    fontWeight: '700',
    color: '#0B4A8B',
    textAlign: 'center',
  },

  smallAccentLine: {
    width: 34,
    height: 3,
    borderRadius: 2,
    backgroundColor: '#D7194B',
    marginTop: 9,
    marginBottom: -25,
  },

  fieldLabel: {
    fontSize: 13,
    color: '#333333',
    marginBottom: 6,
    marginTop: 15,
  },

  input: {
    borderWidth: 1,
    borderColor: '#D0D5DD',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    backgroundColor: '#FFFFFF',
    color: '#1D2733',
  },

  errorText: {
    color: '#B42318',
    fontSize: 13,
    marginTop: 14,
    textAlign: 'center',
  },

  button: {
    backgroundColor: '#0B5CAB',
    borderRadius: 10,
    paddingVertical: 14,
    marginTop: 24,
    alignItems: 'center',

    shadowColor: '#0B5CAB',
    shadowOpacity: 0.18,
    shadowRadius: 7,
    shadowOffset: {
      width: 0,
      height: 4,
    },

    elevation: 3,
  },

  buttonDisabled: {
    backgroundColor: '#9CB8D8',
    shadowOpacity: 0,
    elevation: 0,
  },

  buttonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 16,
  },
});