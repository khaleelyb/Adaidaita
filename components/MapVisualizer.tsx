import React, { useEffect, useState, useRef, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, Polyline } from 'react-leaflet';
import L from 'leaflet';
import { Location, UserRole } from '../types';
import { Search, X, MapPin, Locate } from 'lucide-react';
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
  destination?: string;
  isSearching?: boolean;
  onLocationSelect?: (locationName: string) => void;
}

// Mock coordinates fallback
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

// Component to handle map movement
const MapController: React.FC<{ 
  center?: [number, number]; 
  zoom?: number; 
  pickupCoords?: [number, number] | null; 
  destCoords?: [number, number] | null; 
}> = ({ center, zoom, pickupCoords, destCoords }) => {
  const map = useMap();

  useEffect(() => {
    if (pickupCoords && destCoords) {
      // Fit bounds to show both pickup and destination (route view)
      const bounds = L.latLngBounds([pickupCoords, destCoords]);
      map.fitBounds(bounds, { padding: [50, 50], animate: true });
    } else if (center) {
      // Default fly to center
      map.flyTo(center, zoom || map.getZoom());
    }
  }, [center, zoom, pickupCoords, destCoords, map]);

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

// Custom Pickup Icon (Green)
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

// Custom Destination Icon (Red)
const createDestinationIcon = () => L.divIcon({
  className: 'custom-marker-icon',
  html: `
    <div class="flex flex-col items-center justify-center -translate-y-6">
      <div class="bg-white p-2 rounded-full shadow-lg border-2 border-red-500">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="text-red-500"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
      </div>
      <div class="w-2 h-8 bg-red-500/50 rounded-full blur-sm -mt-2"></div>
    </div>
  `,
  iconSize: [40, 40],
  iconAnchor: [20, 40]
});

export const MapVisualizer: React.FC<MapVisualizerProps> = ({ 
  role, 
  driverLocation, 
  pickup,
  destination,
  isSearching,
  onLocationSelect
}) => {
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  
  // Coordinates state
  const [mapCenter, setMapCenter] = useState<[number, number]>([INITIAL_MAP_CENTER.lat, INITIAL_MAP_CENTER.lng]);
  const [pickupCoords, setPickupCoords] = useState<[number, number] | null>(null);
  const [destCoords, setDestCoords] = useState<[number, number] | null>(null);

  // Helper to fetch coordinates (Nominatim or Mock)
  const getCoordinates = useCallback(async (address: string) => {
    // 1. Check Mock Data
    if (MOCKED_LOCATIONS[address]) {
      return MOCKED_LOCATIONS[address];
    }
    
    // 2. Real Geocoding via Nominatim
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}`);
      const data = await response.json();
      if (data && data.length > 0) {
        return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
      }
    } catch (error) {
      console.warn("Geocoding failed:", error);
    }
    return null;
  }, []);

  // Effect: Handle Pickup Geocoding
  useEffect(() => {
    if (!pickup) return;
    
    // Special case for "Current Location"
    if (pickup === 'Current Location' && 'geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const { latitude, longitude } = pos.coords;
          setPickupCoords([latitude, longitude]);
          setMapCenter([latitude, longitude]);
        },
        (err) => console.warn(err)
      );
      return;
    }

    getCoordinates(pickup).then(coords => {
      if (coords) {
        setPickupCoords([coords.lat, coords.lng]);
        setMapCenter([coords.lat, coords.lng]);
      }
    });
  }, [pickup, getCoordinates]);

  // Effect: Handle Destination Geocoding
  useEffect(() => {
    if (!destination) {
      setDestCoords(null);
      return;
    }
    
    getCoordinates(destination).then(coords => {
      if (coords) {
        setDestCoords([coords.lat, coords.lng]);
      }
    });
  }, [destination, getCoordinates]);

  // Effect: Update Map Center based on Driver Location
  useEffect(() => {
    if (driverLocation) {
      setMapCenter([driverLocation.lat, driverLocation.lng]);
    }
  }, [driverLocation]);

  // Initial Geolocation on Mount (if no pickup is set yet)
  useEffect(() => {
    if (!pickup && 'geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition((pos) => {
        const { latitude, longitude } = pos.coords;
        setMapCenter([latitude, longitude]);
      });
    }
  }, []);

  const handleSearchSelect = (loc: string) => {
    if (onLocationSelect) {
      onLocationSelect(loc);
    }
    setSearchQuery("");
    setIsSearchOpen(false);
  };

  const handleLocateMe = () => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const { latitude, longitude } = pos.coords;
          setMapCenter([latitude, longitude]);
          // If the user wants to set pickup to current location
          if (onLocationSelect) {
            // We can't reverse geocode easily without API key in some services, 
            // but we can assume the map center is enough visual feedback 
            // OR set a special value "Current Location"
            onLocationSelect("Current Location");
          }
        },
        (err) => alert("Could not get your location. Please enable GPS.")
      );
    } else {
      alert("Geolocation is not supported by your browser");
    }
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
        
        {/* Controls map view (flying, bounds) */}
        <MapController 
          center={mapCenter} 
          pickupCoords={pickupCoords} 
          destCoords={destCoords}
        />

        {/* Route Line (Polyline) */}
        {pickupCoords && destCoords && (
          <Polyline 
            positions={[pickupCoords, destCoords]} 
            color="#10b981" 
            dashArray="10, 10" 
            weight={4}
            opacity={0.6}
          />
        )}

        {/* Driver Marker */}
        {driverLocation && (
          <Marker 
            position={[driverLocation.lat, driverLocation.lng]} 
            icon={createCarIcon(driverLocation.bearing)}
          />
        )}

        {/* Pickup Marker */}
        {pickupCoords && !driverLocation && (
          <Marker 
            position={pickupCoords} 
            icon={createPickupIcon()}
          >
            <Popup className="font-semibold">{pickup || "Pickup"}</Popup>
          </Marker>
        )}

        {/* Destination Marker */}
        {destCoords && (
          <Marker 
            position={destCoords} 
            icon={createDestinationIcon()}
          >
            <Popup className="font-semibold">{destination || "Destination"}</Popup>
          </Marker>
        )}

      </MapContainer>

      {/* Searching Pulse Animation Overlay */}
      {isSearching && (
        <div className="absolute inset-0 flex items-center justify-center z-0 pointer-events-none">
          <div className="w-96 h-96 bg-emerald-500/10 rounded-full animate-ping absolute"></div>
        </div>
      )}

      {/* Locate Me Button */}
      <button 
        onClick={handleLocateMe}
        className="absolute top-4 right-4 z-[400] bg-white p-3 rounded-full shadow-lg text-zinc-600 hover:text-emerald-600 active:scale-95 transition-all"
        title="Locate Me"
      >
        <Locate size={20} />
      </button>

      {/* Search Controls (only if needed) */}
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
                <button 
                  onClick={handleLocateMe}
                  className="w-full text-left px-4 py-3 text-sm text-emerald-600 font-semibold hover:bg-emerald-50 transition-colors border-b border-zinc-50 flex items-center"
                >
                   <Locate size={12} className="mr-3" />
                   Current Location
                </button>
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
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
