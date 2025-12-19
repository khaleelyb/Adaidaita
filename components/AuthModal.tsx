import React, { useState, useEffect, useRef } from 'react';
import { UserRole } from '../types';
import { authService } from '../services/auth';
import { Button } from './Button';
import { Mail, Lock, User as UserIcon, Car, AlertCircle, CheckCircle } from 'lucide-react';

interface AuthModalProps {
  onSuccess: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ onSuccess }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [role, setRole] = useState<UserRole>(UserRole.RIDER);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [savingUserInfo, setSavingUserInfo] = useState(false);
  const [userInfoSaved, setUserInfoSaved] = useState(false);
  const isMounted = useRef(true);

  useEffect(() => {
    return () => {
      isMounted.current = false;
    };
  }, []);

  // Test credentials helper
  const fillTestCredentials = (userType: 'rider' | 'driver') => {
    if (userType === 'rider') {
      setEmail('alice@adaidaita.com');
      setPassword('password123');
    } else {
      setEmail('bob@adaidaita.com');
      setPassword('password123');
    }
    setError('');
    setSuccess('Test credentials filled. You can now sign in.');
  };

  const handleSaveUserInfo = async () => {
    setSavingUserInfo(true);
    setError('');
    try {
      const user = await authService.getCurrentUser();
      if (user) {
        setUserInfoSaved(true);
        setSuccess('User information saved successfully! ✓');
        setTimeout(() => {
          if (isMounted.current) onSuccess();
        }, 1000);
      } else {
        setError('Failed to save user information. Please try again.');
      }
    } catch (err: any) {
      console.error('[AuthModal] Error saving user info:', err);
      setError(err.message || 'Failed to save user information');
    } finally {
      if (isMounted.current) {
        setSavingUserInfo(false);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    // Validation
    if (!email.trim() || !password.trim()) {
      setError('Please fill in all fields');
      setLoading(false);
      return;
    }

    if (!isLogin && !name.trim()) {
      setError('Please enter your name');
      setLoading(false);
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      setLoading(false);
      return;
    }

    try {
      console.log(`[AuthModal] Attempting ${isLogin ? 'sign in' : 'sign up'}...`);
      
      if (isLogin) {
        await authService.signIn(email, password);
        if (isMounted.current) {
          setSuccess('Sign in successful! Loading your account...');
          setTimeout(() => {
            if (isMounted.current) onSuccess();
          }, 500);
        }
      } else {
        await authService.signUp(email, password, name, role);
        if (isMounted.current) {
          setSuccess('Account created successfully! You can now sign in.');
          setIsLogin(true);
          setPassword('');
        }
      }
    } catch (err: any) {
      console.error('[AuthModal] Auth error:', err);
      if (isMounted.current) {
        const errorMessage = err.message || 'Authentication failed. Please try again.';
        setError(errorMessage);
      }
    } finally {
      if (isMounted.current) {
        setLoading(false);
      }
    }
  };

  const toggleMode = () => {
    setIsLogin(!isLogin);
    setError('');
    setSuccess('');
  };

  return (
    <div className="min-h-screen bg-zinc-900 flex flex-col items-center justify-center p-6 text-white relative overflow-hidden">
      {/* Background Effects */}
      <div className="absolute top-0 left-0 w-full h-full opacity-10 bg-[radial-gradient(#22c55e_1px,transparent_1px)] [background-size:20px_20px]"></div>
      <div className="absolute w-[500px] h-[500px] bg-emerald-600 rounded-full blur-[150px] -top-32 -left-32 opacity-30 animate-pulse"></div>
      
      <div className="z-10 w-full max-w-md space-y-8">
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-6xl font-bold tracking-tighter bg-gradient-to-br from-white to-emerald-200 bg-clip-text text-transparent">
            Adaidaita
          </h1>
          <p className="text-zinc-400 font-medium tracking-wide">
            {isLogin ? 'Welcome back!' : 'Create your account'}
          </p>
        </div>

        {/* Auth Form */}
        <div className="bg-zinc-800/50 backdrop-blur-xl rounded-3xl p-8 border border-zinc-700/50 shadow-2xl">
          <form onSubmit={handleSubmit} className="space-y-6">
            
            {/* Role Selection (Sign Up Only) */}
            {!isLogin && (
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setRole(UserRole.RIDER)}
                  className={`flex-1 p-4 rounded-xl border-2 transition-all ${
                    role === UserRole.RIDER
                      ? 'border-emerald-500 bg-emerald-500/10'
                      : 'border-zinc-700 bg-zinc-800/50'
                  }`}
                >
                  <UserIcon className="w-6 h-6 mx-auto mb-2" />
                  <p className="text-sm font-semibold">Rider</p>
                </button>
                <button
                  type="button"
                  onClick={() => setRole(UserRole.DRIVER)}
                  className={`flex-1 p-4 rounded-xl border-2 transition-all ${
                    role === UserRole.DRIVER
                      ? 'border-emerald-500 bg-emerald-500/10'
                      : 'border-zinc-700 bg-zinc-800/50'
                  }`}
                >
                  <Car className="w-6 h-6 mx-auto mb-2" />
                  <p className="text-sm font-semibold">Driver</p>
                </button>
              </div>
            )}

            {/* Name Field (Sign Up Only) */}
            {!isLogin && (
              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-300">Full Name</label>
                <div className="relative">
                  <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" size={20} />
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full bg-zinc-900/50 border border-zinc-700 rounded-xl pl-12 pr-4 py-3 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    placeholder="John Doe"
                    required={!isLogin}
                  />
                </div>
              </div>
            )}

            {/* Email Field */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-300">Email</label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" size={20} />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-zinc-900/50 border border-zinc-700 rounded-xl pl-12 pr-4 py-3 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  placeholder="you@example.com"
                  required
                />
              </div>
            </div>

            {/* Password Field */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-300">Password</label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" size={20} />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-zinc-900/50 border border-zinc-700 rounded-xl pl-12 pr-4 py-3 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  placeholder="••••••••"
                  required
                  minLength={6}
                />
              </div>
            </div>

            {/* Success Message */}
            {success && (
              <div className="bg-emerald-500/10 border border-emerald-500/50 rounded-xl p-3 text-sm flex items-start animate-in fade-in slide-in-from-top duration-200">
                <CheckCircle size={18} className="text-emerald-400 mr-2 flex-shrink-0 mt-0.5" />
                <span className="text-emerald-400">{success}</span>
              </div>
            )}

            {/* Error Message */}
            {error && (
              <div className="bg-red-500/10 border border-red-500/50 rounded-xl p-3 text-sm flex items-start animate-in fade-in slide-in-from-top duration-200">
                <AlertCircle size={18} className="text-red-400 mr-2 flex-shrink-0 mt-0.5" />
                <span className="text-red-400">{error}</span>
              </div>
            )}

            {/* Submit Button */}
            <Button type="submit" fullWidth isLoading={loading} className="h-12 text-base">
              {loading 
                ? (isLogin ? 'Signing In...' : 'Creating Account...') 
                : (isLogin ? 'Sign In' : 'Create Account')
              }
            </Button>

            {/* Save User Info Button (shown after successful sign in) */}
            {success && isLogin && !userInfoSaved && (
              <Button 
                type="button" 
                fullWidth 
                isLoading={savingUserInfo} 
                className="h-12 text-base bg-emerald-600 hover:bg-emerald-700"
                onClick={handleSaveUserInfo}
              >
                {savingUserInfo ? 'Saving User Info...' : 'Save User Information'}
              </Button>
            )}

            {/* Toggle Login/Signup */}
            <div className="text-center">
              <button
                type="button"
                onClick={toggleMode}
                className="text-sm text-zinc-400 hover:text-emerald-400 transition-colors"
                disabled={loading}
              >
                {isLogin ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
              </button>
            </div>
          </form>

          {/* Test Credentials */}
          {isLogin && (
            <div className="mt-6 pt-6 border-t border-zinc-700">
              <p className="text-xs text-zinc-500 mb-3 text-center">Quick test with demo accounts:</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => fillTestCredentials('rider')}
                  className="px-3 py-2 bg-zinc-700 hover:bg-zinc-600 rounded-lg text-xs font-medium transition-colors active:scale-95"
                  disabled={loading}
                >
                  Test as Rider
                </button>
                <button
                  type="button"
                  onClick={() => fillTestCredentials('driver')}
                  className="px-3 py-2 bg-zinc-700 hover:bg-zinc-600 rounded-lg text-xs font-medium transition-colors active:scale-95"
                  disabled={loading}
                >
                  Test as Driver
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Debug Info */}
        <div className="text-center">
          <p className="text-xs text-zinc-600">
            Having trouble? Check the browser console for details (F12)
          </p>
        </div>
      </div>
    </div>
  );
};
