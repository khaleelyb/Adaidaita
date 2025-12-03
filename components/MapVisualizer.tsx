
import React, { useEffect, useState } from 'react';
import { Location, UserRole } from '../types';
import { MapPin, Compass, Search, X } from 'lucide-react';
import { INITIAL_MAP_CENTER } from '../constants';

interface MapVisualizerProps {
  role: UserRole;
  driverLocation?: Location;
  pickup?: string;
  isSearching?: boolean;
  onLocationSelect?: (locationName: string) => void;
}

// Visual scaling factor: converts lat/lng delta to pixels
const MAP_SCALE = 60000; 

// Mock locations for map search
const POPULAR_LOCATIONS = [
  "Central Market",
  "Mallam Aminu Kano Int'l Airport",
  "Bayero University",
  "Shoprite Kano",
  "Emir's Palace",
  "State Road",
  "Nassarawa Hospital"
];

export const MapVisualizer: React.FC<MapVisualizerProps> = ({ 
  role, 
  driverLocation, 
  pickup,
  isSearching,
  onLocationSelect
}) => {
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  
  // Calculate Position Relative to Center (Pickup/User)
  const getCarStyle = () => {
    if (!driverLocation) return { display: 'none' };

    const latDiff = driverLocation.lat - INITIAL_MAP_CENTER.lat;
    const lngDiff = driverLocation.lng - INITIAL_MAP_CENTER.lng;

    // Projection: Y is inverted (Screen Y increases downwards, Latitude increases upwards)
    const y = -latDiff * MAP_SCALE;
    const x = lngDiff * MAP_SCALE;

    return {
      transform: `translate(${x}px, ${y}px) rotate(${driverLocation.bearing || 0}deg)`,
      transition: 'transform 1000ms linear' // Linear transition matches the 1s update interval
    };
  };

  const handleSearchSelect = (loc: string) => {
    if (onLocationSelect) {
      onLocationSelect(loc);
    }
    setSearchQuery("");
    setIsSearchOpen(false);
  };

  const filteredLocations = POPULAR_LOCATIONS.filter(loc => 
    loc.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="relative w-full h-full bg-[#e5e7eb] overflow-hidden flex items-center justify-center">
      
      {/* 1. Base Map Layer (Grid & Blocks) */}
      <div className="absolute inset-0 opacity-40" style={{
        backgroundImage: 'linear-gradient(#cbd5e1 1px, transparent 1px), linear-gradient(90deg, #cbd5e1 1px, transparent 1px)',
        backgroundSize: '40px 40px'
      }}></div>

      {/* 2. Stylized Roads (Static Decoration) */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-30">
        <defs>
          <filter id="glow">
             <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
             <feMerge>
                 <feMergeNode in="coloredBlur"/>
                 <feMergeNode in="SourceGraphic"/>
             </feMerge>
          </filter>
        </defs>
        <path d="M0 500 Q 400 600, 800 500" stroke="white" strokeWidth="20" fill="none" />
        <path d="M400 0 L 400 1000" stroke="white" strokeWidth="20" fill="none" />
        <circle cx="400" cy="500" r="150" stroke="white" strokeWidth="10" fill="none" opacity="0.5" />
      </svg>

      {/* 3. Driver Vehicle (Live) */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div 
          className="absolute z-20 will-change-transform"
          style={getCarStyle()}
        >
          {/* Car Body */}
          <div className="relative w-10 h-16 bg-emerald-600 rounded-lg shadow-2xl border-2 border-white/50 flex flex-col items-center justify-between py-1 z-20">
             <div className="w-8 h-2 bg-emerald-800/30 rounded-sm"></div>
             <div className="w-8 h-3 bg-emerald-900/50 rounded-sm"></div>
             
             {/* Roof/Windshield indicator */}
             <div className="w-6 h-4 bg-emerald-900/20 rounded-sm mb-1"></div>
          </div>

          {/* Headlights (Beam Effect) */}
          <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-48 h-32 bg-[conic-gradient(from_0deg_at_50%_100%,transparent_40deg,rgba(255,255,200,0.3)_45deg,rgba(255,255,200,0.3)_55deg,transparent_60deg)] opacity-60 pointer-events-none z-10" 
               style={{ transform: 'rotate(180deg)' }}>
          </div>
          
          {/* Label */}
          <div className="absolute top-full left-1/2 -translate-x-1/2 mt-3 transform -rotate-[var(--rotation)] z-30">
             <div className="bg-white/90 backdrop-blur text-[10px] px-2 py-0.5 rounded shadow-sm text-emerald-800 font-bold whitespace-nowrap border border-emerald-100">
               {driverLocation ? 'Driver' : ''}
             </div>
          </div>
        </div>
      </div>

      {/* 4. Pickup Location Marker (Center) */}
      {pickup && (
        <div className="absolute z-10 flex flex-col items-center transform -translate-y-1/2">
           <div className="bg-white/90 backdrop-blur px-3 py-1.5 rounded-lg shadow-lg mb-2 border border-zinc-100 flex items-center space-x-2 animate-bounce-slight">
             <span className="text-xs font-bold text-zinc-800">{pickup}</span>
           </div>
           <div className="relative">
             <MapPin className="w-10 h-10 text-zinc-900 fill-zinc-900 drop-shadow-2xl" />
             <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-4 h-1.5 bg-black/20 blur-sm rounded-full"></div>
           </div>
        </div>
      )}

      {/* 5. Searching Pulse Animation */}
      {isSearching && (
        <div className="absolute inset-0 flex items-center justify-center z-0 pointer-events-none">
          <div className="w-[400px] h-[400px] border border-emerald-500/20 rounded-full animate-ping absolute"></div>
          <div className="w-[200px] h-[200px] border border-emerald-500/30 rounded-full animate-ping delay-75 absolute"></div>
        </div>
      )}

      {/* 6. Controls Layer */}
      
      {/* Search Widget */}
      {onLocationSelect && !isSearching && (
        <div className="absolute top-24 left-4 z-40 flex flex-col items-start space-y-2">
          {!isSearchOpen ? (
             <button 
               onClick={() => setIsSearchOpen(true)}
               className="bg-white/90 backdrop-blur p-3 rounded-xl shadow-lg border border-zinc-100 text-zinc-600 hover:text-emerald-600 transition-all active:scale-95"
             >
               <Search size={20} />
             </button>
          ) : (
            <div className="bg-white/95 backdrop-blur rounded-2xl shadow-xl border border-zinc-100 w-64 overflow-hidden animate-in fade-in slide-in-from-left-4 duration-200">
              <div className="flex items-center p-2 border-b border-zinc-100">
                <Search size={16} className="text-zinc-400 ml-2" />
                <input 
                  autoFocus
                  className="flex-1 bg-transparent border-none outline-none text-sm px-2 py-2 text-zinc-800 placeholder-zinc-400"
                  placeholder="Find on map..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                <button onClick={() => setIsSearchOpen(false)} className="p-1 text-zinc-400 hover:text-zinc-600">
                  <X size={16} />
                </button>
              </div>
              <div className="max-h-48 overflow-y-auto">
                {filteredLocations.map((loc, idx) => (
                  <button 
                    key={idx}
                    onClick={() => handleSearchSelect(loc)}
                    className="w-full text-left px-4 py-3 text-sm text-zinc-600 hover:bg-emerald-50 hover:text-emerald-700 transition-colors border-b border-zinc-50 last:border-0 flex items-center"
                  >
                    <MapPin size={14} className="mr-2 opacity-50" />
                    {loc}
                  </button>
                ))}
                {filteredLocations.length === 0 && (
                  <div className="px-4 py-3 text-xs text-zinc-400 italic">No locations found</div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Compass */}
      <div className="absolute top-24 right-4 bg-white/90 backdrop-blur p-2 rounded-xl shadow-lg border border-zinc-100 text-zinc-500">
        <Compass size={24} className="animate-pulse" />
      </div>
    </div>
  );
};
