import React, { useMemo } from 'react';
import { Loader2, Zap } from 'lucide-react';

interface RideRequestPanelProps {
  pickup: string;
  setPickup: (value: string) => void;
  destination: string;
  setDestination: (value: string) => void;
  onRequest: () => void;
  isLoading: boolean;
  error?: string;
  
  // Assumed props from App.tsx to enable Fix 10
  pickupCoords?: { lat: number; lng: number };
  destinationCoords?: { lat: number; lng: number };
}

// NOTE: This function is required for CRITICAL FIX 10 to work.
// It must be defined or imported in this file, or globally available.
// A simple Haversine formula implementation is assumed.
const calculateDistance = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
  const R = 6371; // Radius of Earth in km
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLng = (lng2 - lng1) * (Math.PI / 180);
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distance in km
};


export const RideRequestPanel: React.FC<RideRequestPanelProps> = ({
  pickup,
  setPickup,
  destination,
  setDestination,
  onRequest,
  isLoading,
  error,
  pickupCoords,
  destinationCoords,
}) => {
  
  // CRITICAL FIX 10: Replace random fare with distance-based calculation
  const estimatedFare = useMemo(() => {
    if (!pickupCoords || !destinationCoords) return 0;

    const distance = calculateDistance(
      pickupCoords.lat, pickupCoords.lng,
      destinationCoords.lat, destinationCoords.lng
    );

    // Calculation: 500 NGN base + 200 NGN per kilometer
    // Ensure the result is an integer
    return Math.floor(500 + (distance * 200)); 
  }, [pickupCoords, destinationCoords]);


  const isReadyToRequest = !!destination;

  return (
    <div className="bg-white rounded-2xl shadow-xl p-6 border border-zinc-100">
      <h2 className="text-2xl font-bold text-zinc-900 mb-5">Where to?</h2>

      <div className="space-y-4 mb-6">
        {/* Pickup Input */}
        <div className="flex items-center space-x-3 bg-zinc-50 p-3 rounded-xl border border-zinc-100">
          <div className="w-2 h-2 rounded-full bg-emerald-600"></div>
          <input
            type="text"
            placeholder="Pickup Location"
            value={pickup}
            onChange={(e) => setPickup(e.target.value)}
            onFocus={() => {
              // Set focus behavior: Allow changing pickup if not 'Current Location'
              if (pickup === 'Current Location') {
                setPickup('');
              }
            }}
            onBlur={() => {
              // Restore 'Current Location' if field is left empty
              if (pickup.trim() === '') {
                setPickup('Current Location');
              }
            }}
            className="flex-1 bg-transparent text-zinc-800 focus:outline-none focus:ring-0 p-0 text-base"
            readOnly={pickup === 'Current Location'} // Optionally prevent editing the 'Current Location' label
          />
        </div>

        {/* Destination Input */}
        <div className="flex items-center space-x-3 bg-zinc-50 p-3 rounded-xl border border-zinc-100">
          <div className="w-2 h-2 rounded-full bg-red-500"></div>
          <input
            type="text"
            placeholder="Enter Destination"
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            className="flex-1 bg-transparent text-zinc-800 focus:outline-none focus:ring-0 p-0 text-base"
          />
        </div>
      </div>
      
      {/* Estimated Fare Display */}
      <div className={`flex justify-between items-center px-4 py-3 rounded-xl mb-6 transition-all duration-300 ${
        estimatedFare > 0 ? 'bg-emerald-50 border border-emerald-200' : 'bg-zinc-50 border border-zinc-100'
      }`}>
        <div className="flex items-center space-x-2">
          <Zap size={20} className="text-emerald-600" />
          <p className="text-sm font-semibold text-zinc-700">Estimated Fare</p>
        </div>
        <p className="text-xl font-bold text-emerald-800">
          {estimatedFare > 0 ? `${estimatedFare.toLocaleString()} NGN` : '--'}
        </p>
      </div>

      {/* Request Button */}
      <button
        onClick={onRequest}
        disabled={isLoading || !isReadyToRequest || estimatedFare === 0}
        className={`w-full py-4 rounded-xl font-bold text-lg transition-all shadow-lg ${
          isLoading || !isReadyToRequest || estimatedFare === 0
            ? 'bg-zinc-300 text-zinc-600 cursor-not-allowed'
            : 'bg-emerald-600 text-white hover:bg-emerald-700 active:scale-[0.98]'
        }`}
      >
        {isLoading ? (
          <div className="flex items-center justify-center">
            <Loader2 size={24} className="animate-spin mr-2" />
            Requesting Ride...
          </div>
        ) : (
          'Request Ride Now'
        )}
      </button>

      {/* Error Message */}
      {error && (
        <p className="mt-4 text-sm text-red-600 text-center">{error}</p>
      )}
    </div>
  );
};
