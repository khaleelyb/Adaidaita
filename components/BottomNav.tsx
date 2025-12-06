import React from 'react';
import { Home, Grid, User } from 'lucide-react';

interface BottomNavProps {
  currentTab: string;
  onTabChange: (tab: string) => void;
  hasActiveTrip?: boolean;
}

export const BottomNav: React.FC<BottomNavProps> = ({ currentTab, onTabChange, hasActiveTrip }) => {
  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-zinc-100 px-6 py-2 pb-safe z-50 flex justify-between items-center shadow-[0_-4px_20px_rgba(0,0,0,0.05)]">
      <button 
        onClick={() => onTabChange('home')}
        className={`flex flex-col items-center p-2 rounded-xl transition-all ${
          currentTab === 'home' 
            ? 'text-emerald-600 bg-emerald-50' 
            : 'text-zinc-400 hover:text-zinc-600'
        }`}
      >
        <Home size={24} strokeWidth={currentTab === 'home' ? 2.5 : 2} />
        <span className="text-[10px] font-medium mt-1">Home</span>
      </button>

      <button 
        onClick={() => onTabChange('services')}
        className={`flex flex-col items-center p-2 rounded-xl transition-all ${
          currentTab === 'services' 
            ? 'text-emerald-600 bg-emerald-50' 
            : 'text-zinc-400 hover:text-zinc-600'
        }`}
      >
        <Grid size={24} strokeWidth={currentTab === 'services' ? 2.5 : 2} />
        <span className="text-[10px] font-medium mt-1">Services</span>
      </button>

      <button 
        onClick={() => onTabChange('account')}
        className={`flex flex-col items-center p-2 rounded-xl transition-all relative ${
          currentTab === 'account' 
            ? 'text-emerald-600 bg-emerald-50' 
            : 'text-zinc-400 hover:text-zinc-600'
        }`}
      >
        <User size={24} strokeWidth={currentTab === 'account' ? 2.5 : 2} />
        <span className="text-[10px] font-medium mt-1">Account</span>
        {/* Red dot for notification if needed */}
        {/* <div className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full border border-white"></div> */}
      </button>
    </div>
  );
};
