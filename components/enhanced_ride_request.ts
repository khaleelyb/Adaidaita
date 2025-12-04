import React, { useState, useRef, useEffect } from 'react';
import { Button } from './Button';
import { MapPin, Navigation, Clock, DollarSign, X } from 'lucide-react';

interface RideRequestPanelProps {
  pickup: string;
  setPickup: (val: string) => void;
  destination: string;
  setDestination: (val: string) => void;
  onRequest: () => void;
  isLoading: boolean;
  error?: string;
  disabled?: boolean;
}

export const RideRequestPanel: React.FC<RideRequestPanelProps> = ({
  pickup,
  setPickup,
  destination,
  setDestination,
  onRequest,
  isLoading,
  error,
  disabled = false
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [touchStart, setTouchStart] = useState(0);
  const [touchEnd, setTouchEnd] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);

  // Swipe to expand/collapse
  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStart(e.targetTouches[0].clientY);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientY);
  };

  const handleTouchEnd = () => {
    if (touchStart - touchEnd > 50) {
      // Swipe up
      setIsExpanded(true);
    }
    if (touchStart - touchEnd < -50) {
      // Swipe down
      setIsExpanded(false);
    }
  };

  // Estimate fare and time
  const estimatedFare = destination ? Math.floor(Math.random() * 2000) + 500 : 0;
  const estimatedTime = destination ? Math.floor(Math.random() * 10) + 5 : 0;

  return (
    <div 
      ref={panelRef}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      className={`bg-white rounded-t-3xl shadow-[0_-8px_30px_rgba(0,0,0,0.12)] transition-all duration-300 ${
        isExpanded ? 'p-6 pb-8' : 'p-6'
      } space-y-4 animate-in slide-in-from-bottom`}
    >
      {/* Drag Handle */}
      <div className="flex justify-center">
        <div className="w-12 h-1.5 bg-zinc-200 rounded-full cursor-grab active:cursor-grabbing" />
      </div>
      
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-zinc-800">Where to?</h2>
          {destination && !isExpanded && (
            <button 
              onClick={() => setIsExpanded(true)}
              className="text-emerald-600 text-sm font-semibold"
            >
              View Details
            </button>
          )}
        </div>
        
        {/* Inputs Container */}
        <div className="relative">
          {/* Connector Line */}
          <div className="absolute left-6 top-8 bottom-8 w-0.5 bg-gradient-to-b from-emerald-500 via-zinc-200 to-zinc-900 z-0" />

          {/* Pickup Input */}
          <div className="group flex items-center bg-zinc-50 p-4 rounded-2xl border-2 border-zinc-200 focus-within:ring-2 focus-within:ring-emerald-500/20 focus-within:border-emerald-500 transition-all mb-3 relative z-10">
            <div className="w-10 h-10 flex items-center justify-center bg-white rounded-xl shadow-sm border border-zinc-100 mr-3 text-emerald-600 flex-shrink-0">
              <div className="w-3 h-3 bg-emerald-500 rounded-full ring-4 ring-emerald-100" />
            </div>
            <div className="flex-1 min-w-0">
              <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block mb-0.5">Pickup</label>
              <input 
                value={pickup}
                onChange={(e) => setPickup(e.target.value)}
                className="bg-transparent w-full outline-none text-zinc-800 font-semibold placeholder-zinc-300 text-sm"
                placeholder="Current Location"
                disabled={disabled}
              />
            </div>
            {pickup && pickup !== 'Central Market' && (
              <button 
                onClick={() => setPickup('Central Market')}
                className="ml-2 p-1 hover:bg-zinc-200 rounded-full transition-colors flex-shrink-0"
              >
                <X size={16} className="text-zinc-400" />
              </button>
            )}
          </div>

          {/* Destination Input */}
          <div className="group flex items-center bg-zinc-50 p-4 rounded-2xl border-2 border-zinc-200 focus-within:ring-2 focus-within:ring-zinc-500/20 focus-within:border-zinc-500 transition-all relative z-10">
            <div className="w-10 h-10 flex items-center justify-center bg-white rounded-xl shadow-sm border border-zinc-100 mr-3 text-zinc-800 flex-shrink-0">
              <div className="w-3 h-3 bg-zinc-900 rounded-sm ring-4 ring-zinc-200" />
            </div>
            <div className="flex-1 min-w-0">
              <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block mb-0.5">Drop-off</label>
              <input 
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                className="bg-transparent w-full outline-none text-zinc-800 font-semibold placeholder-zinc-300 text-sm"
                placeholder="Where are you going?"
                disabled={disabled}
              />
            </div>
            {destination && (
              <button 
                onClick={() => setDestination('')}
                className="ml-2 p-1 hover:bg-zinc-200 rounded-full transition-colors flex-shrink-0"
              >
                <X size={16} className="text-zinc-400" />
              </button>
            )}
          </div>
        </div>

        {/* Trip Details (Expanded View) */}
        {isExpanded && destination && (
          <div className="grid grid-cols-2 gap-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="bg-emerald-50 rounded-xl p-3 border border-emerald-100">
              <div className="flex items-center text-emerald-700 mb-1">
                <DollarSign size={14} />
                <span className="text-xs font-semibold ml-1">Est. Fare</span>
              </div>
              <p className="text-lg font-bold text-emerald-900">₦{estimatedFare}</p>
            </div>
            <div className="bg-blue-50 rounded-xl p-3 border border-blue-100">
              <div className="flex items-center text-blue-700 mb-1">
                <Clock size={14} />
                <span className="text-xs font-semibold ml-1">Est. Time</span>
              </div>
              <p className="text-lg font-bold text-blue-900">{estimatedTime} min</p>
            </div>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="text-red-500 text-sm bg-red-50 p-3 rounded-xl border border-red-100 flex items-start animate-in fade-in slide-in-from-top-1 duration-200">
            <span className="mr-2">⚠️</span>
            <span>{error}</span>
          </div>
        )}
      </div>

      {/* Request Button */}
      <div className="pt-2">
        <Button 
          onClick={onRequest} 
          isLoading={isLoading} 
          fullWidth 
          className="h-14 text-lg shadow-emerald-500/25"
          disabled={disabled || !destination.trim()}
          icon={<Navigation size={20} />}
        >
          {isLoading ? 'Finding Driver...' : 'Request Ride'}
        </Button>
        {!destination.trim() && (
          <p className="text-xs text-zinc-400 text-center mt-2">Enter a destination to continue</p>
        )}
      </div>
    </div>
  );
};