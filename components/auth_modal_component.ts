import React, { useState } from 'react';
import { UserRole } from '../types';
import { authService } from '../services/auth';
import { Button } from './Button';
import { Mail, Lock, User as UserIcon, Car } from 'lucide-react';

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isLogin) {
        await authService.signIn(email, password);
      } else {
        await authService.signUp(email, password, name, role);
        setError('Account created! Check your email to confirm (or login if confirmation disabled).');
      }
      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
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
                    required
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

            {/* Error/Success Message */}
            {error && (
              <div className={`border rounded-xl p-3 text-sm ${
                error.includes('created') 
                  ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-400'
                  : 'bg-red-500/10 border-red-500/50 text-red-400'
              }`}>
                {error}
              </div>
            )}

            {/* Submit Button */}
            <Button type="submit" fullWidth isLoading={loading} className="h-12 text-base">
              {isLogin ? 'Sign In' : 'Create Account'}
            </Button>

            {/* Toggle Login/Signup */}
            <div className="text-center">
              <button
                type="button"
                onClick={() => {
                  setIsLogin(!isLogin);
                  setError('');
                }}
                className="text-sm text-zinc-400 hover:text-emerald-400 transition-colors"
              >
                {isLogin ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
