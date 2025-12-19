import React, { useEffect } from 'react';
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react';

export interface Toast {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  title: string;
  message: string;
  duration?: number;
}

interface NotificationToastProps {
  toasts: Toast[];
  onRemove: (id: string) => void;
}

export const NotificationToast: React.FC<NotificationToastProps> = ({ toasts, onRemove }) => {
  return (
    <div className="fixed top-4 right-4 z-50 max-w-sm space-y-3">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`
            flex gap-3 p-4 rounded-xl shadow-lg border animate-in slide-in-from-right-full duration-300
            ${toast.type === 'success' ? 'bg-emerald-50 border-emerald-200' : ''}
            ${toast.type === 'error' ? 'bg-red-50 border-red-200' : ''}
            ${toast.type === 'info' ? 'bg-blue-50 border-blue-200' : ''}
            ${toast.type === 'warning' ? 'bg-yellow-50 border-yellow-200' : ''}
          `}
        >
          <div className="flex-shrink-0 pt-0.5">
            {toast.type === 'success' && <CheckCircle className="w-5 h-5 text-emerald-600" />}
            {toast.type === 'error' && <AlertCircle className="w-5 h-5 text-red-600" />}
            {toast.type === 'info' && <Info className="w-5 h-5 text-blue-600" />}
            {toast.type === 'warning' && <AlertTriangle className="w-5 h-5 text-yellow-600" />}
          </div>
          
          <div className="flex-1">
            <h4 className={`
              font-semibold text-sm mb-0.5
              ${toast.type === 'success' ? 'text-emerald-900' : ''}
              ${toast.type === 'error' ? 'text-red-900' : ''}
              ${toast.type === 'info' ? 'text-blue-900' : ''}
              ${toast.type === 'warning' ? 'text-yellow-900' : ''}
            `}>
              {toast.title}
            </h4>
            <p className={`text-xs ${
              toast.type === 'success' ? 'text-emerald-700' : ''
            }${
              toast.type === 'error' ? 'text-red-700' : ''
            }${
              toast.type === 'info' ? 'text-blue-700' : ''
            }${
              toast.type === 'warning' ? 'text-yellow-700' : ''
            }`}>
              {toast.message}
            </p>
          </div>
          
          <button
            onClick={() => onRemove(toast.id)}
            className="flex-shrink-0 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  );
};
