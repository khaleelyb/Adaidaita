import React from 'react';
import { Car } from 'lucide-react';

export const LoadingScreen: React.FC = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-900 via-zinc-900 to-zinc-900 flex items-center justify-center relative overflow-hidden">
      {/* Animated background */}
      <div className="absolute inset-0 opacity-20">
        <div className="absolute w-96 h-96 bg-emerald-600 rounded-full blur-3xl -top-48 -left-48 animate-pulse"></div>
        <div className="absolute w-96 h-96 bg-emerald-600 rounded-full blur-3xl -bottom-48 -right-48 animate-pulse delay-700"></div>
      </div>

      <div className="text-center space-y-6 z-10">
        {/* Logo animation */}
        <div className="relative">
          <div className="w-24 h-24 bg-emerald-500/20 rounded-full animate-ping absolute inset-0 mx-auto"></div>
          <div className="w-24 h-24 bg-emerald-600 rounded-full flex items-center justify-center mx-auto relative shadow-2xl shadow-emerald-500/50">
            <Car size={48} className="text-white animate-bounce" />
          </div>
        </div>

        {/* App name */}
        <div>
          <h1 className="text-5xl font-bold tracking-tighter bg-gradient-to-br from-white via-emerald-100 to-emerald-300 bg-clip-text text-transparent mb-2">
            Adaidaita
          </h1>
          <p className="text-emerald-300 font-medium text-lg animate-pulse">
            Loading your ride...
          </p>
        </div>

        {/* Loading bar */}
        <div className="w-64 h-1.5 bg-zinc-800 rounded-full overflow-hidden mx-auto">
          <div className="h-full bg-gradient-to-r from-emerald-500 to-emerald-300 rounded-full animate-loading-bar"></div>
        </div>
      </div>

      <style>{`
        @keyframes loading-bar {
          0% { width: 0%; margin-left: 0%; }
          50% { width: 75%; margin-left: 0%; }
          100% { width: 0%; margin-left: 100%; }
        }
        .animate-loading-bar {
          animation: loading-bar 1.5s ease-in-out infinite;
        }
        .delay-700 {
          animation-delay: 700ms;
        }
      `}</style>
    </div>
  );
};