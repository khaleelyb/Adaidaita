import React from 'react';
import { WifiOff } from 'lucide-react';

export const OfflineIndicator: React.FC = () => {
  return (
    <div className="fixed top-0 left-0 right-0 z-50 animate-in slide-in-from-top duration-300">
      <div className="bg-amber-500 text-white px-4 py-3 text-center flex items-center justify-center space-x-2 shadow-lg">
        <WifiOff size={18} className="animate-pulse" />
        <span className="font-semibold text-sm">No Internet Connection</span>
      </div>
    </div>
  );
};