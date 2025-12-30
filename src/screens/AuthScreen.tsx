import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Image,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Session } from '@supabase/supabase-js';
import { useThemeColors } from '../styles/theme';
import { supabase } from '../lib/supabase';
import { ALLOW_SIGNUP } from '../lib/featureFlags';
import Constants from 'expo-constants';
import * as WebBrowser from 'expo-web-browser';
import { makeRedirectUri } from 'expo-auth-session';
import AsyncStorage from '@react-native-async-storage/async-storage';

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

  useEffect(() => {
    if (!ALLOW_SIGNUP && mode === 'signUp') {
      setMode('signIn');
    }
  }, [mode]);

  useEffect(() => {
    loadSavedEmail();
  }, []);

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

  return (
    <KeyboardAvoidingView
      style={[styles.authContainer, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <ScrollView 
        contentContainerStyle={styles.authScrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Logo at Top */}
        <View style={styles.authTopLogoContainer}>
          <View style={[styles.authTopLogoCircle, { backgroundColor: colors.cardBackground }]}>
            <Image
              source={require('../../assets/CWMLogo.png')}
              style={styles.authTopLogoImage}
              resizeMode="contain"
            />
          </View>
        </View>

        {/* Title with Mascot Sitting On It */}
        <View style={styles.authTitleWithMascot}>
          <Text style={[styles.authMainTitleWithMascot, { color: colors.textPrimary }]}>Close With Mario</Text>
          <Image
            source={require('../../assets/LO.png')}
            style={styles.authMascotSitting}
            resizeMode="contain"
          />
          <Text style={[styles.authSubtitleWithMascot, { color: colors.textSecondary }]}>Your mortgage workflow simplified.</Text>
          <Text style={[styles.authWelcomeText, { color: colors.textSecondary }]}>
            {mode === 'signIn' ? 'Welcome back! Sign in to continue' : 'Create your account to get started'}
          </Text>
        </View>

        {/* Form Container */}
        <View style={styles.authFormCompact}>
          <TextInput
            style={[styles.authInputCompact, { backgroundColor: colors.cardBackground, borderColor: colors.border, color: colors.textPrimary }]}
            placeholder="Email address"
            placeholderTextColor={colors.textSecondary}
            autoCapitalize="none"
            keyboardType="email-address"
            textContentType="username"
            autoComplete="email"
            value={email}
            onChangeText={setEmail}
          />

          <TextInput
            style={[styles.authInputCompact, { backgroundColor: colors.cardBackground, borderColor: colors.border, color: colors.textPrimary }]}
            placeholder="Password"
            placeholderTextColor={colors.textSecondary}
            secureTextEntry
            autoCapitalize="none"
            textContentType="password"
            autoComplete="password"
            value={password}
            onChangeText={setPassword}
          />

          {authError && (
            <View style={styles.authErrorContainer}>
              <Text style={styles.authErrorText}>⚠️ {authError}</Text>
            </View>
          )}

          <TouchableOpacity
            style={[styles.authSignInButtonCompact, authLoading && styles.authButtonDisabled]}
            onPress={handleEmailPasswordAuth}
            disabled={authLoading}
            activeOpacity={0.8}
          >
            <Text style={styles.authSignInButtonText}>
              {authLoading ? 'Please wait...' : mode === 'signIn' ? 'Sign In' : 'Create Account'}
            </Text>
          </TouchableOpacity>

          {ALLOW_SIGNUP && (
            <TouchableOpacity
              onPress={() => setMode(mode === 'signIn' ? 'signUp' : 'signIn')}
              style={styles.authSignUpLinkCompact}
            >
              <Text style={styles.authSignUpText}>
                {mode === 'signIn' ? "Don't have an account? " : 'Already have an account? '}
                <Text style={styles.authSignUpTextBold}>
                  {mode === 'signIn' ? 'Sign up' : 'Sign in'}
                </Text>
              </Text>
            </TouchableOpacity>
          )}

          <Text style={styles.authOrTextCompact}>OR</Text>

          <TouchableOpacity
            style={[styles.authGoogleButtonCompact, { backgroundColor: colors.cardBackground, borderColor: colors.border }, authLoading && styles.authButtonDisabled]}
            onPress={handleGoogleSignIn}
            disabled={authLoading}
            activeOpacity={0.8}
          >
            <Text style={styles.authGoogleIconNew}>G</Text>
            <Text style={[styles.authGoogleButtonTextNew, { color: colors.textPrimary }]}>Continue with Google</Text>
          </TouchableOpacity>

          <Text style={[styles.authCreateAccountHint, { color: colors.textSecondary }]}>
            Don't have an account? Create one at closewithmario.com
          </Text>
        </View>

        {/* Version Info */}
        <Text style={styles.authVersionText}>
          v{Constants.expoConfig?.version} (Build {Constants.expoConfig?.ios?.buildNumber})
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  authContainer: {
    flex: 1,
    backgroundColor: '#E8DFF5',
  },
  authScrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: Platform.OS === 'ios' ? 80 : 60,
    paddingBottom: 20,
  },
  authTopLogoContainer: {
    alignItems: 'center',
    marginBottom: 30,
  },
  authTopLogoCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
  },
  authTopLogoImage: {
    width: 70,
    height: 70,
  },
  authTitleWithMascot: {
    alignItems: 'center',
    marginBottom: 24,
    position: 'relative',
  },
  authMainTitleWithMascot: {
    fontSize: 40,
    fontWeight: '800',
    color: '#1F2937',
    textAlign: 'center',
    marginBottom: -30,
    zIndex: 1,
  },
  authMascotSitting: {
    width: 180,
    height: 180,
    zIndex: 2,
    marginBottom: -20,
  },
  authSubtitleWithMascot: {
    fontSize: 15,
    color: '#6B7280',
    textAlign: 'center',
    zIndex: 1,
  },
  authWelcomeText: {
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'center',
    marginTop: 8,
    fontWeight: '500',
  },
  authFormCompact: {
    width: '100%',
  },
  authInputCompact: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 14,
    marginBottom: 12,
    fontSize: 15,
    color: '#1F2937',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  authSignInButtonCompact: {
    backgroundColor: '#7C3AED',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 4,
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  authSignUpLinkCompact: {
    marginTop: 14,
    alignItems: 'center',
    paddingVertical: 4,
  },
  authOrTextCompact: {
    textAlign: 'center',
    fontSize: 13,
    color: '#9CA3AF',
    fontWeight: '600',
    marginVertical: 14,
  },
  authGoogleButtonCompact: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
    marginBottom: 8,
  },
  authVersionText: {
    fontSize: 11,
    color: '#9CA3AF',
    textAlign: 'center',
    marginTop: 20,
    marginBottom: 10,
    fontWeight: '500',
  },
  authErrorContainer: {
    backgroundColor: '#FEE2E2',
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#DC2626',
  },
  authErrorText: {
    fontSize: 13,
    color: '#991B1B',
    fontWeight: '600',
  },
  authButtonDisabled: {
    opacity: 0.6,
  },
  authSignInButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  authSignUpText: {
    fontSize: 15,
    color: '#374151',
    fontWeight: '500',
  },
  authSignUpTextBold: {
    color: '#7C3AED',
    fontWeight: '700',
  },
  authGoogleIconNew: {
    fontSize: 20,
    fontWeight: '700',
    color: '#4285F4',
    marginRight: 12,
  },
  authGoogleButtonTextNew: {
    color: '#1F2937',
    fontSize: 16,
    fontWeight: '600',
  },
  authCreateAccountHint: {
    fontSize: 12,
    color: '#9CA3AF',
    textAlign: 'center',
    marginTop: 12,
    fontWeight: '400',
  },
});
