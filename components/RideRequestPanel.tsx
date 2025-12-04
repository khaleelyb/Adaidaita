import React from 'react';
import { Button } from './Button';

interface RideRequestPanelProps {
  pickup: string;
  setPickup: (val: string) => void;
  destination: string;
  setDestination: (val: string) => void;
  onRequest: () => void;
  isLoading: boolean;
  error?: string;
}

export const RideRequestPanel: React.FC<RideRequestPanelProps> = ({
  pickup,
  setPickup,
  destination,
  setDestination,
  onRequest,
  isLoading,
  error
}) => {
  return (
    <div className="bg-white rounded-t-3xl shadow-[0_-8px_30px_rgba(0,0,0,0.12)] p-6 space-y-6 animate-in slide-in-from-bottom duration-300">
      <div className="w-12 h-1.5 bg-zinc-200 rounded-full mx-auto mb-2" />
      
      <div className="space-y-4">
        <h2 className="text-xl font-bold text-zinc-800">Where to?</h2>
        
        <div className="relative">
          {/* Connector Line */}
          <div className="absolute left-6 top-8 bottom-8 w-0.5 bg-zinc-200 border-l border-dashed border-zinc-300" />

          {/* Pickup Input */}
          <div className="group flex items-center bg-zinc-50 p-3 rounded-2xl border border-zinc-200 focus-within:ring-2 focus-within:ring-emerald-500/20 focus-within:border-emerald-500 transition-all mb-3 relative z-10">
            <div className="w-10 h-10 flex items-center justify-center bg-white rounded-xl shadow-sm border border-zinc-100 mr-3 text-emerald-600">
              <div className="w-3 h-3 bg-emerald-500 rounded-full ring-4 ring-emerald-100" />
            </div>
            <div className="flex-1">
              <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block mb-0.5">Pickup</label>
              <input 
                value={pickup}
                onChange={(e) => setPickup(e.target.value)}
                className="bg-transparent w-full outline-none text-zinc-800 font-semibold placeholder-zinc-300"
                placeholder="Current Location"
              />
            </div>
          </div>

          {/* Destination Input */}
          <div className="group flex items-center bg-zinc-50 p-3 rounded-2xl border border-zinc-200 focus-within:ring-2 focus-within:ring-zinc-500/20 focus-within:border-zinc-500 transition-all relative z-10">
            <div className="w-10 h-10 flex items-center justify-center bg-white rounded-xl shadow-sm border border-zinc-100 mr-3 text-zinc-800">
              <div className="w-3 h-3 bg-zinc-900 rounded-sm ring-4 ring-zinc-200" />
            </div>
            <div className="flex-1">
              <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block mb-0.5">Drop-off</label>
              <input 
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                className="bg-transparent w-full outline-none text-zinc-800 font-semibold placeholder-zinc-300"
                placeholder="Where are you going?"
              />
            </div>
          </div>
        </div>

        {error && (
          <div className="text-red-500 text-sm bg-red-50 p-3 rounded-xl border border-red-100">
            {error}
          </div>
        )}
      </div>

      <div className="pt-2">
        <Button onClick={onRequest} isLoading={isLoading} fullWidth className="h-14 text-lg shadow-emerald-500/25">
          Find Driver
        </Button>
      </div>
    </div>
  );
};
