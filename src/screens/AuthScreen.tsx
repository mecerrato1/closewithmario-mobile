import React, { useState, useEffect } from 'react';
import {
  AppState,
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Image,
  Alert,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { Session } from '@supabase/supabase-js';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useThemeColors } from '../styles/theme';
import { supabase } from '../lib/supabase';
import { ALLOW_SIGNUP } from '../lib/featureFlags';
import Constants from 'expo-constants';
import * as WebBrowser from 'expo-web-browser';
import { makeRedirectUri } from 'expo-auth-session';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as AppleAuthentication from 'expo-apple-authentication';
import {
  checkBiometricCapabilities,
  isBiometricLoginEnabled,
  getStoredEmail,
  saveBiometricCredentials,
  biometricSignIn,
  clearBiometricCredentials,
} from '../lib/secure-auth-storage';

// This must match:
// - app.json: "scheme": "com.closewithmario.mobile"
// - Supabase URL config: com.closewithmario.mobile://auth/callback
const redirectTo = makeRedirectUri({
  scheme: 'com.closewithmario.mobile',
  path: 'auth/callback',
});

export type AuthScreenProps = {
  onAuth: (session: Session) => void;
};

const SAVED_EMAIL_KEY = '@auth_saved_email';

export default function AuthScreen({ onAuth }: AuthScreenProps) {
  const { colors, isDark } = useThemeColors();
  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  // Biometric state
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [biometricType, setBiometricType] = useState<string>('Face ID');
  const [biometricEmail, setBiometricEmail] = useState<string | null>(null);
  const [biometricLoading, setBiometricLoading] = useState(false);

  useEffect(() => {
    if (!ALLOW_SIGNUP && mode === 'signUp') {
      setMode('signIn');
    }
  }, [mode]);

  useEffect(() => {
    loadSavedEmail();
    initBiometrics();
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        loadSavedEmail();
        initBiometrics();
      }
    });

    return () => subscription.remove();
  }, []);

  const initBiometrics = async () => {
    try {
      const caps = await checkBiometricCapabilities();
      const canBiometric = caps.isAvailable;
      setBiometricAvailable(canBiometric);
      setBiometricType(caps.biometricType);

      if (canBiometric) {
        const enabled = await isBiometricLoginEnabled();
        setBiometricEnabled(enabled);
        if (enabled) {
          const storedEmail = await getStoredEmail();
          setBiometricEmail(storedEmail);
        } else {
          setBiometricEmail(null);
        }
      } else {
        setBiometricEnabled(false);
        setBiometricEmail(null);
      }
    } catch (error) {
      console.log('[Auth] Failed to init biometrics:', error);
    }
  };

  const loadSavedEmail = async () => {
    try {
      const savedEmail = await AsyncStorage.getItem(SAVED_EMAIL_KEY);
      if (savedEmail) {
        setEmail(savedEmail);
      }
    } catch (error) {
      console.log('[Auth] Failed to load saved email:', error);
    }
  };

  const saveEmail = async (emailToSave: string) => {
    try {
      await AsyncStorage.setItem(SAVED_EMAIL_KEY, emailToSave);
    } catch (error) {
      console.log('[Auth] Failed to save email:', error);
    }
  };

  const handleEmailPasswordAuth = async () => {
    setAuthError(null);
    setAuthLoading(true);

    try {
      if (mode === 'signIn') {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) {
          setAuthError(error.message);
        } else if (data.session) {
          // Save email for next time
          await saveEmail(email);
          // Save credentials for biometric sign-in (stored in iOS Keychain)
          const biometricSaved = await saveBiometricCredentials(email, password);
          setBiometricEnabled(biometricSaved);
          setBiometricEmail(biometricSaved ? email : null);
          onAuth(data.session);
        }
      } else {
        if (!ALLOW_SIGNUP) {
          setAuthError('Account creation is disabled. Please sign in.');
          setMode('signIn');
          return;
        }
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
        });

        if (error) {
          setAuthError(error.message);
        } else if (data.session) {
          // Save email for next time
          await saveEmail(email);
          onAuth(data.session);
        } else {
          // Save email even on sign up
          await saveEmail(email);
          setAuthError(
            'Sign up successful. If email confirmation is required, confirm then sign in.'
          );
          setMode('signIn');
        }
      }
    } catch (e: any) {
      setAuthError(e?.message || 'Unexpected error');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleAppleSignIn = async () => {
    setAuthError(null);
    setAuthLoading(true);

    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });

      if (!credential.identityToken) {
        setAuthError('No identity token returned from Apple.');
        return;
      }

      // Sign in with Supabase using the Apple ID token
      const { data, error } = await supabase.auth.signInWithIdToken({
        provider: 'apple',
        token: credential.identityToken,
      });

      if (error) {
        console.log('Supabase Apple auth error:', error.message);
        setAuthError(error.message);
        return;
      }

      if (data.session) {
        onAuth(data.session);
      } else {
        setAuthError('Apple sign-in did not complete.');
      }
    } catch (err: any) {
      if (err.code === 'ERR_REQUEST_CANCELED') {
        // User canceled the sign-in flow
        console.log('Apple sign-in canceled by user');
      } else {
        console.error('Apple sign-in error:', err);
        setAuthError(err?.message || 'Apple sign-in failed.');
      }
    } finally {
      setAuthLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setAuthError(null);
    setAuthLoading(true);

    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo,
          skipBrowserRedirect: true,
        },
      });

      if (error) {
        console.log('Supabase OAuth error:', error.message);
        setAuthError(error.message);
        return;
      }

      const authUrl = data?.url;
      if (!authUrl) {
        console.log('No auth URL returned from Supabase.');
        setAuthError('Failed to start Google login.');
        return;
      }

      console.log('Opening Google auth session:', authUrl);

      const result = await WebBrowser.openAuthSessionAsync(
        authUrl,
        redirectTo
      );

      console.log('AuthSession result:', result);

      if (result.type !== 'success' || !result.url) {
        setAuthError('Google sign-in did not complete. Please try again.');
        return;
      }

      // Parse tokens from URL fragment (implicit flow)
      const url = result.url;
      const params = new URLSearchParams(url.split('#')[1]);
      const accessToken = params.get('access_token');
      const refreshToken = params.get('refresh_token');

      if (!accessToken || !refreshToken) {
        console.log('No tokens found in redirect URL');
        setAuthError('Failed to get authentication tokens.');
        return;
      }

      // Set the session using the tokens
      const { data: sessionData, error: sessionError } =
        await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });

      if (sessionError) {
        console.log('Set session error:', sessionError);
        setAuthError(sessionError.message);
        return;
      }

      console.log('Supabase session set successfully:', sessionData);

      if (sessionData.session) {
        onAuth(sessionData.session);
      } else {
        setAuthError('Google sign-in did not complete.');
      }
    } catch (err: any) {
      console.error('Google OAuth error:', err);
      setAuthError(err?.message || 'Unexpected error.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleBiometricSignIn = async () => {
    setAuthError(null);
    setBiometricLoading(true);

    try {
      const result = await biometricSignIn();

      if (!result.success || !result.email || !result.password) {
        if (result.error && result.error !== 'Authentication cancelled.') {
          setAuthError(result.error);
        }
        return;
      }

      // Sign in with stored credentials
      const { data, error } = await supabase.auth.signInWithPassword({
        email: result.email,
        password: result.password,
      });

      if (error) {
        // If credentials are invalid, clear biometric data
        if (error.message?.includes('Invalid') || error.message?.includes('credentials')) {
          await clearBiometricCredentials();
          setBiometricEnabled(false);
          setBiometricEmail(null);
          setAuthError('Saved credentials are no longer valid. Please sign in with your password.');
        } else {
          setAuthError(error.message);
        }
        return;
      }

      if (data.session) {
        onAuth(data.session);
      }
    } catch (error: any) {
      console.error('[Auth] Biometric sign-in error:', error);
      if (error?.message && error.message !== 'Authentication cancelled.') {
        setAuthError(error.message);
      }
    } finally {
      setBiometricLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    const resetEmail = email.trim();
    if (!resetEmail) {
      Alert.alert('Enter your email', 'Please type your email address above, then tap Forgot password again.');
      return;
    }

    Alert.alert(
      'Reset Password',
      `Send a password reset link to ${resetEmail}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send',
          onPress: async () => {
            try {
              const { error } = await supabase.auth.resetPasswordForEmail(resetEmail);
              if (error) {
                Alert.alert('Error', error.message);
              } else {
                Alert.alert('Check your email', `We sent a password reset link to ${resetEmail}.`);
              }
            } catch (e: any) {
              Alert.alert('Error', e?.message || 'Failed to send reset email.');
            }
          },
        },
      ]
    );
  };

  const isAnyLoading = authLoading || biometricLoading;
  const showBiometricSection = mode === 'signIn' && Platform.OS === 'ios';
  const biometricReady = biometricAvailable && biometricEnabled;
  const biometricHelperText = biometricReady
    ? biometricEmail
      ? `Use ${biometricType} for ${biometricEmail}.`
      : `Use ${biometricType} to sign in faster on this device.`
    : biometricAvailable
      ? `Sign in with your password once on this device to enable ${biometricType}. If it stays disabled, this build may not have secure storage available yet.`
      : `${biometricType} is not available in the current simulator or build.`;

  return (
    <View style={[s.container, { backgroundColor: isDark ? colors.background : '#F3F0FF' }]}>
      {!isDark && (
        <LinearGradient
          colors={['#F3F0FF', '#EDE9FE', '#E8E0FF']}
          style={StyleSheet.absoluteFill}
        />
      )}
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={s.keyboardView}>
        <ScrollView
          contentContainerStyle={s.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Logo */}
          <View style={s.logoRow}>
            <Image
              source={require('../../assets/CWMLogo.png')}
              style={s.logoImage}
              resizeMode="contain"
            />
          </View>

          {/* Tagline */}
          <Text style={[s.tagline, { color: colors.textSecondary }]}>
            Your mortgage workflow simplified.
          </Text>

          {/* Welcome */}
          <View style={s.welcomeSection}>
            <Text style={[s.welcomeTitle, { color: colors.textPrimary }]}>
              Welcome back
            </Text>
          </View>

          {/* Login Card */}
          <View style={[s.loginCard, { backgroundColor: colors.cardBackground }]}>
            {/* Email */}
            <View style={s.fieldGroup}>
              <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>EMAIL</Text>
              <View style={s.inputWrapper}>
                <Ionicons name="mail-outline" size={18} color="#94A3B8" style={s.inputIcon} />
                <TextInput
                  style={[s.input, s.inputWithIcon, { backgroundColor: isDark ? colors.background : '#FAFAFE', borderColor: isDark ? colors.border : '#DDD6FE', color: colors.textPrimary }]}
                  placeholder="you@company.com"
                  placeholderTextColor="#94A3B8"
                  autoCapitalize="none"
                  keyboardType="email-address"
                  textContentType="username"
                  autoComplete="email"
                  value={email}
                  onChangeText={setEmail}
                  editable={!isAnyLoading}
                />
              </View>
            </View>

            {/* Password */}
            <View style={s.fieldGroup}>
              <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>PASSWORD</Text>
              <View style={s.inputWrapper}>
                <Ionicons name="lock-closed-outline" size={18} color="#94A3B8" style={s.inputIcon} />
                <TextInput
                  style={[s.input, s.inputWithIcon, { backgroundColor: isDark ? colors.background : '#FAFAFE', borderColor: isDark ? colors.border : '#DDD6FE', color: colors.textPrimary, paddingRight: 72 }]}
                  placeholder="Enter your password"
                  placeholderTextColor="#94A3B8"
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  textContentType="password"
                  autoComplete="password"
                  value={password}
                  onChangeText={setPassword}
                  editable={!isAnyLoading}
                />
                <TouchableOpacity style={s.visibilityToggle} onPress={() => setShowPassword(!showPassword)} disabled={isAnyLoading}>
                  <Ionicons name={showPassword ? 'eye-outline' : 'eye-off-outline'} size={20} color="#94A3B8" />
                </TouchableOpacity>
              </View>
            </View>

            {/* Forgot Password */}
            {mode === 'signIn' && (
              <TouchableOpacity onPress={handleForgotPassword} disabled={isAnyLoading} style={s.forgotLink}>
                <Text style={s.forgotText}>Forgot password?</Text>
              </TouchableOpacity>
            )}

            {/* Error */}
            {authError && (
              <View style={s.errorBanner}>
                <Ionicons name="warning-outline" size={15} color="#991B1B" style={{ marginRight: 6 }} />
                <Text style={s.errorText}>{authError}</Text>
              </View>
            )}

            {/* Sign In Button */}
            <TouchableOpacity
              onPress={handleEmailPasswordAuth}
              disabled={isAnyLoading}
              activeOpacity={0.85}
              style={isAnyLoading ? s.buttonDisabled : undefined}
            >
              <LinearGradient
                colors={['#8B5CF6', '#7C3AED', '#6D28D9']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={s.signInButton}
              >
                {authLoading ? (
                  <Text style={s.signInButtonText}>Signing in...</Text>
                ) : (
                  <>
                    <Text style={s.signInButtonText}>
                      {mode === 'signIn' ? 'Sign In' : 'Create Account'}
                    </Text>
                    <Ionicons name="arrow-forward" size={20} color="#F59E0B" style={{ marginLeft: 6 }} />
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>

            {/* Biometric Sign In — inside card */}
            {showBiometricSection && (
              <View style={s.biometricWrap}>
                <View style={s.biometricDivider}>
                  <View style={[s.biometricDividerLine, { backgroundColor: colors.border }]} />
                  <Text style={[s.biometricDividerText, { color: '#94A3B8' }]}>or</Text>
                  <View style={[s.biometricDividerLine, { backgroundColor: colors.border }]} />
                </View>
                <TouchableOpacity
                  style={[
                    s.biometricButton,
                    !biometricReady && s.biometricButtonDisabled,
                    isAnyLoading && s.buttonDisabled,
                  ]}
                  onPress={handleBiometricSignIn}
                  disabled={isAnyLoading || !biometricReady}
                  activeOpacity={0.7}
                >
                  {biometricLoading ? (
                    <ActivityIndicator size="small" color="#7C3AED" />
                  ) : (
                    <>
                      <Ionicons
                        name="finger-print-outline"
                        size={24}
                        color={biometricReady ? '#7C3AED' : '#A78BFA'}
                      />
                      <Text
                        style={[
                          s.biometricButtonText,
                          !biometricReady && s.biometricButtonTextDisabled,
                        ]}
                      >
                        Use {biometricType}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
                <Text style={s.biometricHelperText}>{biometricHelperText}</Text>
              </View>
            )}

            {ALLOW_SIGNUP && (
              <TouchableOpacity
                onPress={() => setMode(mode === 'signIn' ? 'signUp' : 'signIn')}
                style={s.switchModeLink}
              >
                <Text style={[s.switchModeText, { color: colors.textSecondary }]}>
                  {mode === 'signIn' ? "Don't have an account? " : 'Already have an account? '}
                  <Text style={s.switchModeBold}>{mode === 'signIn' ? 'Sign up' : 'Sign in'}</Text>
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {/* OAuth Divider */}
          <View style={s.oauthDivider}>
            <View style={[s.oauthDividerLine, { backgroundColor: colors.border }]} />
            <Text style={[s.oauthDividerText, { color: '#94A3B8' }]}>or continue with</Text>
            <View style={[s.oauthDividerLine, { backgroundColor: colors.border }]} />
          </View>

          {/* OAuth Buttons */}
          <View style={s.oauthRow}>
            <TouchableOpacity
              style={[s.oauthButton, { backgroundColor: colors.cardBackground, borderColor: colors.border }, isAnyLoading && s.buttonDisabled]}
              onPress={handleGoogleSignIn}
              disabled={isAnyLoading}
              activeOpacity={0.85}
            >
              <View style={s.googleIconCircle}>
                <Text style={s.googleG}>G</Text>
              </View>
              <Text style={[s.oauthButtonText, { color: colors.textPrimary }]}>Google</Text>
            </TouchableOpacity>

            {Platform.OS === 'ios' && (
              <TouchableOpacity
                style={[s.oauthButton, { backgroundColor: colors.cardBackground, borderColor: colors.border }, isAnyLoading && s.buttonDisabled]}
                onPress={handleAppleSignIn}
                disabled={isAnyLoading}
                activeOpacity={0.85}
              >
                <Ionicons name="logo-apple" size={19} color={colors.textPrimary} />
                <Text style={[s.oauthButtonText, { color: colors.textPrimary }]}>Apple</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Bottom Hint */}
          <TouchableOpacity onPress={() => Linking.openURL('https://closewithmario.com/login?tab=signup')}>
            <Text style={[s.bottomHint, { color: colors.textSecondary }]}>
              Need an account?{' '}
              <Text style={s.bottomHintLink}>Create one here</Text>
            </Text>
          </TouchableOpacity>

          {/* Version */}
          <Text style={s.versionText}>
            v{Constants.expoConfig?.version} (Build {Constants.expoConfig?.ios?.buildNumber})
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 28,
    paddingTop: Platform.OS === 'ios' ? 12 : 10,
    paddingBottom: Platform.OS === 'ios' ? 18 : 14,
  },

  // Logo
  logoRow: {
    alignItems: 'center',
    marginBottom: 16,
  },
  logoImage: {
    width: 108,
    height: 108,
  },

  // Tagline
  tagline: {
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center' as const,
    marginBottom: 8,
  },

  // Welcome
  welcomeSection: {
    alignItems: 'center',
    marginBottom: 20,
  },
  welcomeTitle: {
    fontSize: 40,
    fontWeight: '800',
    letterSpacing: -1.4,
  },

  // Login Card
  loginCard: {
    borderRadius: 22,
    padding: 20,
    gap: 16,
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.12,
    shadowRadius: 28,
    elevation: 6,
  },
  fieldGroup: {
    gap: 5,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  inputWrapper: {
    position: 'relative',
    justifyContent: 'center',
  },
  inputIcon: {
    position: 'absolute',
    left: 14,
    zIndex: 1,
  },
  input: {
    height: 52,
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 15,
    fontWeight: '500',
  },
  inputWithIcon: {
    paddingLeft: 42,
  },
  visibilityToggle: {
    position: 'absolute',
    right: 42,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },

  // Error
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEE2E2',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderLeftWidth: 3,
    borderLeftColor: '#DC2626',
  },
  errorText: {
    fontSize: 13,
    color: '#991B1B',
    fontWeight: '600',
    flex: 1,
  },

  // Forgot password
  forgotLink: {
    alignSelf: 'flex-end',
    marginTop: -6,
  },
  forgotText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#7C3AED',
  },

  // Sign In Button
  signInButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 52,
    borderRadius: 12,
    shadowColor: '#6D28D9',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 5,
  },
  signInButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  buttonDisabled: {
    opacity: 0.6,
  },

  // Switch mode
  switchModeLink: {
    alignItems: 'center',
    paddingVertical: 2,
  },
  switchModeText: {
    fontSize: 14,
    fontWeight: '500',
  },
  switchModeBold: {
    color: '#7C3AED',
    fontWeight: '700',
  },

  // OAuth Divider
  oauthDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 16,
  },
  oauthDividerLine: {
    flex: 1,
    height: 1,
  },
  oauthDividerText: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // OAuth Buttons
  oauthRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },
  oauthButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 50,
    borderRadius: 12,
    borderWidth: 1.5,
  },
  googleIconCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  googleG: {
    fontSize: 14,
    fontWeight: '800',
    color: '#4285F4',
    marginTop: -1,
  },
  oauthButtonText: {
    fontSize: 15,
    fontWeight: '700',
  },

  // Bottom
  bottomHint: {
    fontSize: 12.5,
    textAlign: 'center',
    marginTop: 18,
    fontWeight: '500',
  },
  bottomHintLink: {
    color: '#7C3AED',
    fontWeight: '700',
  },
  versionText: {
    fontSize: 10,
    color: '#94A3B8',
    textAlign: 'center',
    marginTop: 8,
    fontWeight: '500',
  },

  // Biometric
  biometricWrap: {
    alignItems: 'center',
    gap: 0,
  },
  biometricDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    width: '100%',
    marginBottom: 10,
  },
  biometricDividerLine: {
    flex: 1,
    height: 1,
  },
  biometricDividerText: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'lowercase',
  },
  biometricButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    height: 50,
    width: '100%',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#E9E0FF',
    backgroundColor: '#F9F5FF',
  },
  biometricButtonDisabled: {
    backgroundColor: '#F5F3FF',
    borderColor: '#DDD6FE',
  },
  biometricButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#7C3AED',
  },
  biometricButtonTextDisabled: {
    color: '#8B5CF6',
  },
  biometricHelperText: {
    marginTop: 8,
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
    color: '#7C3AED',
    opacity: 0.78,
  },
});
