
import React from 'react';
import { User, LogOut, Menu, Bell } from 'lucide-react';
import { User as UserType } from '../types';

interface HeaderProps {
  user: UserType;
  onLogout: () => void;
}

export const Header: React.FC<HeaderProps> = ({ user, onLogout }) => {
  return (
    <div className="absolute top-0 left-0 right-0 z-40 px-4 py-3">
      <div className="bg-white/90 backdrop-blur-md shadow-sm rounded-2xl p-3 flex justify-between items-center border border-white/20">
        <div className="flex items-center space-x-3">
          <div className="bg-emerald-100 p-2 rounded-xl text-emerald-700">
            <Menu size={20} />
          </div>
          <div>
            <h1 className="font-bold text-lg text-emerald-900 leading-tight">Adaidaita</h1>
            <p className="text-xs text-emerald-600 font-medium">Secure Rides</p>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <button className="relative p-2 text-zinc-500 hover:bg-zinc-100 rounded-full transition-colors">
            <Bell size={20} />
            <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full border-2 border-white"></span>
          </button>
          
          <div className="flex items-center space-x-2 bg-zinc-50 pl-1 pr-3 py-1 rounded-full border border-zinc-200">
            <img 
              src={user.avatarUrl} 
              alt="avatar" 
              className="w-8 h-8 rounded-full border border-white shadow-sm" 
            />
            <span className="text-sm font-semibold text-zinc-700 hidden sm:block">{user.name.split(' ')[0]}</span>
          </div>

          <button 
            onClick={onLogout} 
            className="p-2 text-zinc-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors"
          >
            <LogOut size={20} />
          </button>
        </div>
      </div>
    </div>
  );
};
