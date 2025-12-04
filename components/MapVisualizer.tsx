import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { Location, UserRole } from '../types';
import { Search, X, MapPin } from 'lucide-react';
import { INITIAL_MAP_CENTER } from '../constants';

// Fix for default Leaflet marker icons in React
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

let DefaultIcon = L.icon({
    iconUrl: icon,
    shadowUrl: iconShadow,
    iconAnchor: [12, 41]
});

L.Marker.prototype.options.icon = DefaultIcon;

interface MapVisualizerProps {
  role: UserRole;
  driverLocation?: Location;
  pickup?: string;
  isSearching?: boolean;
  onLocationSelect?: (locationName: string) => void;
}

// Mock coordinates for the search demo (Kano, Nigeria)
const MOCKED_LOCATIONS: Record<string, { lat: number; lng: number }> = {
  "Central Market": { lat: 12.0000, lng: 8.5900 },
  "Mallam Aminu Kano Int'l Airport": { lat: 12.0444, lng: 8.5323 },
  "Bayero University": { lat: 11.9804, lng: 8.4287 },
  "Shoprite Kano": { lat: 11.9742, lng: 8.5398 },
  "Emir's Palace": { lat: 11.9964, lng: 8.5167 },
  "State Road": { lat: 11.9880, lng: 8.5400 },
  "Nassarawa Hospital": { lat: 12.0050, lng: 8.5500 }
};

const POPULAR_LOCATIONS = Object.keys(MOCKED_LOCATIONS);

// Component to handle map movement when props change
const MapUpdater: React.FC<{ center: [number, number]; zoom?: number }> = ({ center, zoom }) => {
  const map = useMap();
  useEffect(() => {
    map.flyTo(center, zoom || map.getZoom());
  }, [center, zoom, map]);
  return null;
};

// Custom Car Icon
const createCarIcon = (rotation: number = 0) => L.divIcon({
  className: 'custom-marker-icon',
  html: `
    <div style="transform: rotate(${rotation}deg); width: 40px; height: 60px; display: flex; align-items: center; justify-content: center;">
      <div class="relative w-8 h-12 bg-emerald-600 rounded-md shadow-xl border-2 border-white flex flex-col items-center justify-between py-1">
        <div class="w-6 h-1.5 bg-emerald-800/50 rounded-sm"></div>
        <div class="w-6 h-2 bg-emerald-900/50 rounded-sm"></div>
        <div class="absolute -top-8 left-1/2 -translate-x-1/2 w-12 h-20 bg-emerald-400/20 blur-xl rounded-full"></div>
      </div>
    </div>
  `,
  iconSize: [40, 60],
  iconAnchor: [20, 30]
});

// Custom Pickup Icon
const createPickupIcon = () => L.divIcon({
  className: 'custom-marker-icon',
  html: `
    <div class="flex flex-col items-center justify-center -translate-y-6">
      <div class="bg-white p-2 rounded-full shadow-lg border-2 border-emerald-500">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="text-emerald-600"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
      </div>
      <div class="w-2 h-8 bg-emerald-500/50 rounded-full blur-sm -mt-2"></div>
    </div>
  `,
  iconSize: [40, 40],
  iconAnchor: [20, 40]
});

export const MapVisualizer: React.FC<MapVisualizerProps> = ({ 
  role, 
  driverLocation, 
  pickup,
  isSearching,
  onLocationSelect
}) => {
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  
  // Default center
  const [mapCenter, setMapCenter] = useState<[number, number]>([INITIAL_MAP_CENTER.lat, INITIAL_MAP_CENTER.lng]);

  // Update map center when driver moves
  useEffect(() => {
    if (driverLocation) {
      setMapCenter([driverLocation.lat, driverLocation.lng]);
    }
  }, [driverLocation]);

  const handleSearchSelect = (loc: string) => {
    if (onLocationSelect) {
      onLocationSelect(loc);
    }
    const coords = MOCKED_LOCATIONS[loc];
    if (coords) {
      setMapCenter([coords.lat, coords.lng]);
    }
    setSearchQuery("");
    setIsSearchOpen(false);
  };

  const filteredLocations = POPULAR_LOCATIONS.filter(loc => 
    loc.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="relative w-full h-full bg-zinc-100">
      
      <MapContainer 
        center={mapCenter} 
        zoom={14} 
        scrollWheelZoom={true} 
        zoomControl={false}
        className="w-full h-full z-0"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        
        <MapUpdater center={mapCenter} />

        {/* Driver Marker */}
        {driverLocation && (
          <Marker 
            position={[driverLocation.lat, driverLocation.lng]} 
            icon={createCarIcon(driverLocation.bearing)}
          >
          </Marker>
        )}

        {/* Pickup Marker (if static location is selected) */}
        {!driverLocation && (
          <Marker 
            position={mapCenter} 
            icon={createPickupIcon()}
          >
            <Popup className="font-semibold">{pickup || "Current Location"}</Popup>
          </Marker>
        )}
      </MapContainer>

      {/* Searching Pulse Animation Overlay */}
      {isSearching && (
        <div className="absolute inset-0 flex items-center justify-center z-0 pointer-events-none">
          <div className="w-96 h-96 bg-emerald-500/10 rounded-full animate-ping absolute"></div>
        </div>
      )}

      {/* Controls Layer */}
      {onLocationSelect && !isSearching && (
        <div className="absolute top-24 left-4 z-[400] flex flex-col items-start space-y-2">
          {!isSearchOpen ? (
             <button 
               onClick={() => setIsSearchOpen(true)}
               className="bg-white p-3 rounded-xl shadow-xl border border-zinc-100 text-zinc-600 hover:text-emerald-600 transition-all active:scale-95"
             >
               <Search size={20} />
             </button>
          ) : (
            <div className="bg-white rounded-2xl shadow-xl border border-zinc-100 w-72 overflow-hidden animate-in fade-in slide-in-from-left-4 duration-200">
              <div className="flex items-center p-3 border-b border-zinc-100">
                <Search size={16} className="text-zinc-400 ml-1" />
                <input 
                  autoFocus
                  className="flex-1 bg-transparent border-none outline-none text-sm px-3 text-zinc-800 placeholder-zinc-400"
                  placeholder="Where to?"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                <button onClick={() => setIsSearchOpen(false)} className="p-1 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 rounded-full">
                  <X size={16} />
                </button>
              </div>
              <div className="max-h-60 overflow-y-auto">
                {filteredLocations.map((loc, idx) => (
                  <button 
                    key={idx}
                    onClick={() => handleSearchSelect(loc)}
                    className="w-full text-left px-4 py-3 text-sm text-zinc-600 hover:bg-emerald-50 hover:text-emerald-700 transition-colors border-b border-zinc-50 last:border-0 flex items-center group"
                  >
                    <div className="p-1.5 bg-zinc-100 rounded-full mr-3 group-hover:bg-emerald-100 transition-colors">
                      <MapPin size={12} className="text-zinc-500 group-hover:text-emerald-600" />
                    </div>
                    {loc}
                  </button>
                ))}
                {filteredLocations.length === 0 && (
                  <div className="px-4 py-8 text-center">
                    <p className="text-xs text-zinc-400 italic">No locations found</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
