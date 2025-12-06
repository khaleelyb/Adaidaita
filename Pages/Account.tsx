import React from 'react';
import { User } from '../types';
import { LogOut, ChevronRight, Settings, CreditCard, Shield, HelpCircle, User as UserIcon } from 'lucide-react';

interface AccountProps {
  user: User;
  onLogout: () => void;
}

export const Account: React.FC<AccountProps> = ({ user, onLogout }) => {
  const menuItems = [
    { icon: <Settings size={20} />, label: 'Settings', desc: 'App preferences' },
    { icon: <CreditCard size={20} />, label: 'Payment Methods', desc: 'Manage cards & cash' },
    { icon: <Shield size={20} />, label: 'Safety & Privacy', desc: 'Trusted contacts, permissions' },
    { icon: <HelpCircle size={20} />, label: 'Help & Support', desc: 'FAQs, contact us' },
  ];

  return (
    <div className="flex-1 bg-zinc-50 min-h-screen pt-20 px-4 pb-24 overflow-y-auto">
      <div className="flex items-center space-x-4 mb-8">
        <div className="w-20 h-20 bg-zinc-200 rounded-full overflow-hidden border-4 border-white shadow-sm flex items-center justify-center">
          {user.avatarUrl ? (
            <img src={user.avatarUrl} alt="Profile" className="w-full h-full object-cover" />
          ) : (
            <UserIcon size={32} className="text-zinc-400" />
          )}
        </div>
        <div>
          <h2 className="text-2xl font-bold text-zinc-900">{user.name}</h2>
          <p className="text-zinc-500 text-sm">{user.email}</p>
          <div className="inline-flex items-center bg-emerald-100 text-emerald-700 text-xs font-bold px-2 py-1 rounded mt-2 uppercase tracking-wide">
            {user.role}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-8">
        <div className="bg-white p-4 rounded-xl shadow-sm border border-zinc-100 text-center">
          <p className="text-3xl font-bold text-zinc-900">{user.role === 'rider' ? '12' : '154'}</p>
          <p className="text-xs text-zinc-500 uppercase font-semibold mt-1">Trips</p>
        </div>
        <div className="bg-white p-4 rounded-xl shadow-sm border border-zinc-100 text-center">
          <p className="text-3xl font-bold text-zinc-900">{user.rating || '5.0'}</p>
          <p className="text-xs text-zinc-500 uppercase font-semibold mt-1">Rating</p>
        </div>
      </div>

      <div className="space-y-2">
        {menuItems.map((item, index) => (
          <button 
            key={index}
            className="w-full bg-white p-4 rounded-xl shadow-sm border border-zinc-100 flex items-center justify-between active:scale-[0.99] transition-transform"
          >
            <div className="flex items-center space-x-4">
              <div className="w-10 h-10 bg-zinc-50 rounded-full flex items-center justify-center text-zinc-600">
                {item.icon}
              </div>
              <div className="text-left">
                <p className="font-semibold text-zinc-900">{item.label}</p>
                <p className="text-xs text-zinc-500">{item.desc}</p>
              </div>
            </div>
            <ChevronRight size={20} className="text-zinc-300" />
          </button>
        ))}
      </div>

      <button 
        onClick={onLogout}
        className="w-full mt-8 bg-red-50 text-red-600 font-semibold p-4 rounded-xl flex items-center justify-center space-x-2 active:bg-red-100 transition-colors"
      >
        <LogOut size={20} />
        <span>Log Out</span>
      </button>
      
      <p className="text-center text-zinc-400 text-xs mt-8">Version 1.0.1</p>
    </div>
  );
};
