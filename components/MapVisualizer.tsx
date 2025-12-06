import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import { Location, UserRole } from '../types';
import { Search, X, MapPin, Navigation2 } from 'lucide-react';
import { INITIAL_MAP_CENTER } from '../constants';

// CRITICAL: Fix Leaflet default marker icons
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

interface MapVisualizerProps {
  role: UserRole;
  driverLocation?: Location;
  pickup?: string;
  destination?: string;
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

// Component to handle map movement and auto-fit bounds
const MapUpdater: React.FC<{ 
  center: [number, number]; 
  zoom?: number;
  pickupCoords?: [number, number] | null;
  destinationCoords?: [number, number] | null;
  driverCoords?: [number, number] | null;
}> = ({ center, zoom, pickupCoords, destinationCoords, driverCoords }) => {
  const map = useMap();
  
  useEffect(() => {
    try {
      // If we have multiple points, fit bounds to show them all
      if (pickupCoords && destinationCoords) {
        const bounds = L.latLngBounds([pickupCoords, destinationCoords]);
        
        // Include driver location if available
        if (driverCoords) {
          bounds.extend(driverCoords);
        }
        
        map.fitBounds(bounds, { 
          padding: [80, 80],
          maxZoom: 15,
          animate: true,
          duration: 1
        });
      } else {
        map.flyTo(center, zoom || 14, {
          animate: true,
          duration: 1
        });
      }
    } catch (error) {
      console.error('Map update error:', error);
    }
  }, [center, zoom, pickupCoords, destinationCoords, driverCoords, map]);
  
  return null;
};

// Custom Car Icon
const createCarIcon = (rotation: number = 0) => {
  return L.divIcon({
    className: 'custom-car-marker',
    html: `
      <div style="transform: rotate(${rotation}deg); width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;">
        <div style="width: 28px; height: 28px; background-color: #059669; border-radius: 6px; box-shadow: 0 4px 12px rgba(0,0,0,0.3); border: 2px solid white; display: flex; align-items: center; justify-content: center;">
          <span style="color: white; font-size: 18px;">🚗</span>
        </div>
      </div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 16]
  });
};

// Custom Current Location Icon (Blue Dot)
const createCurrentLocationIcon = () => {
  return L.divIcon({
    className: 'custom-location-marker',
    html: `
      <div style="position: relative; width: 20px; height: 20px;">
        <div style="width: 16px; height: 16px; background-color: #3b82f6; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 8px rgba(0,0,0,0.3);"></div>
        <div style="position: absolute; inset: 0; background-color: rgba(59, 130, 246, 0.3); border-radius: 50%; animation: pulse 2s infinite;"></div>
      </div>
    `,
    iconSize: [20, 20],
    iconAnchor: [10, 10]
  });
};

// Custom Destination Icon (Red marker)
const createDestinationIcon = () => {
  return L.divIcon({
    className: 'custom-destination-marker',
    html: `
      <div style="width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;">
        <span style="font-size: 32px; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));">📍</span>
      </div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 32]
  });
};

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
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const [mapCenter, setMapCenter] = useState<[number, number]>([INITIAL_MAP_CENTER.lat, INITIAL_MAP_CENTER.lng]);
  const [isMapReady, setIsMapReady] = useState(false);

  // Get user's current location
  useEffect(() => {
    if (navigator.geolocation) {
      console.log('Requesting geolocation...');
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const coords: [number, number] = [position.coords.latitude, position.coords.longitude];
          console.log('Got user location:', coords);
          setUserLocation(coords);
          setMapCenter(coords);
        },
        (error) => {
          console.warn('Geolocation error:', error);
          // Fallback to default location
          const fallback: [number, number] = [INITIAL_MAP_CENTER.lat, INITIAL_MAP_CENTER.lng];
          setUserLocation(fallback);
          setMapCenter(fallback);
        },
        {
          enableHighAccuracy: false,
          timeout: 5000,
          maximumAge: 0
        }
      );
    } else {
      // No geolocation available
      const fallback: [number, number] = [INITIAL_MAP_CENTER.lat, INITIAL_MAP_CENTER.lng];
      setUserLocation(fallback);
      setMapCenter(fallback);
    }
  }, []);

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

  // Get coordinates for pickup and destination
  const pickupCoords: [number, number] | null = pickup && MOCKED_LOCATIONS[pickup] 
    ? [MOCKED_LOCATIONS[pickup].lat, MOCKED_LOCATIONS[pickup].lng]
    : userLocation;
    
  const destinationCoords: [number, number] | null = destination && MOCKED_LOCATIONS[destination]
    ? [MOCKED_LOCATIONS[destination].lat, MOCKED_LOCATIONS[destination].lng]
    : null;

  const driverCoords: [number, number] | null = driverLocation 
    ? [driverLocation.lat, driverLocation.lng]
    : null;

  // Calculate estimated distance and time
  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  };

  const distance = pickupCoords && destinationCoords
    ? calculateDistance(pickupCoords[0], pickupCoords[1], destinationCoords[0], destinationCoords[1])
    : 0;

  const estimatedTime = Math.round(distance * 2.5); // Rough estimate: 2.5 min per km

  console.log('Map render:', {
    mapCenter,
    userLocation,
    pickupCoords,
    destinationCoords,
    driverCoords,
    distance
  });

  return (
    <div className="relative w-full h-full bg-zinc-100">
      
      <MapContainer 
        center={mapCenter} 
        zoom={14} 
        scrollWheelZoom={true} 
        zoomControl={false}
        style={{ width: '100%', height: '100%' }}
        className="z-0"
        whenReady={() => {
          console.log('Map is ready!');
          setIsMapReady(true);
        }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          errorTileUrl="https://tile.openstreetmap.org/0/0/0.png"
        />
        
        <MapUpdater 
          center={mapCenter} 
          pickupCoords={pickupCoords}
          destinationCoords={destinationCoords}
          driverCoords={driverCoords}
        />

        {/* Route Line */}
        {pickupCoords && destinationCoords && (
          <Polyline 
            positions={[pickupCoords, destinationCoords]}
            pathOptions={{
              color: '#059669',
              weight: 4,
              opacity: 0.8,
              dashArray: '10, 10',
              lineCap: 'round',
              lineJoin: 'round'
            }}
          />
        )}

        {/* User's Current Location (Blue Dot) */}
        {userLocation && !driverLocation && (
          <Marker 
            position={userLocation} 
            icon={createCurrentLocationIcon()}
          >
            <Popup>Your Location</Popup>
          </Marker>
        )}

        {/* Destination Marker */}
        {destinationCoords && (
          <Marker 
            position={destinationCoords} 
            icon={createDestinationIcon()}
          >
            <Popup>{destination}</Popup>
          </Marker>
        )}

        {/* Driver Marker */}
        {driverCoords && (
          <Marker 
            position={driverCoords} 
            icon={createCarIcon(driverLocation?.bearing || 0)}
          >
            <Popup>Driver Location</Popup>
          </Marker>
        )}
      </MapContainer>

      {/* Loading Overlay */}
      {!isMapReady && (
        <div className="absolute inset-0 bg-white flex items-center justify-center z-50">
          <div className="text-center">
            <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-zinc-600 font-medium">Loading map...</p>
          </div>
        </div>
      )}

      {/* Searching Pulse Animation Overlay */}
      {isSearching && isMapReady && (
        <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
          <div className="w-96 h-96 bg-emerald-500/10 rounded-full animate-ping"></div>
        </div>
      )}

      {/* Trip Info Overlay */}
      {pickupCoords && destinationCoords && distance > 0 && isMapReady && (
        <div className="absolute top-24 right-4 z-40 bg-white rounded-xl shadow-lg p-3 border border-zinc-100">
          <div className="flex items-center gap-2 mb-1">
            <Navigation2 size={16} className="text-emerald-600" />
            <span className="text-xs font-bold text-zinc-600">ROUTE INFO</span>
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-zinc-500">Distance:</span>
              <span className="text-sm font-bold text-zinc-900">{distance.toFixed(1)} km</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-zinc-500">Est. Time:</span>
              <span className="text-sm font-bold text-zinc-900">{estimatedTime} min</span>
            </div>
          </div>
        </div>
      )}

      {/* Controls Layer */}
      {onLocationSelect && !isSearching && isMapReady && (
        <div className="absolute top-24 left-4 z-40 flex flex-col items-start space-y-2">
          {!isSearchOpen ? (
             <button 
               onClick={() => setIsSearchOpen(true)}
               className="bg-white p-3 rounded-xl shadow-xl border border-zinc-100 text-zinc-600 hover:text-emerald-600 transition-all active:scale-95"
             >
               <Search size={20} />
             </button>
          ) : (
            <div className="bg-white rounded-2xl shadow-xl border border-zinc-100 w-72 overflow-hidden">
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

      {/* Add pulse animation keyframes */}
      <style>{`
        @keyframes pulse {
          0%, 100% {
            opacity: 0.3;
            transform: scale(1);
          }
          50% {
            opacity: 0.1;
            transform: scale(1.5);
          }
        }
      `}</style>
    </div>
  );
};
