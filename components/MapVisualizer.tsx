import React, { useEffect, useState, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap, useMapEvents } from 'react-leaflet';
import L, { LatLngTuple, Marker as LeafletMarker } from 'leaflet';
import { Location, UserRole } from '../types';
import { Search, X, MapPin, Navigation2, Crosshair } from 'lucide-react';
import { INITIAL_MAP_CENTER } from '../constants';
import 'leaflet/dist/leaflet.css';

// --- CRITICAL FIX: Fix Leaflet default marker icons ---
if ((L.Icon.Default.prototype as any)._getIconUrl) {
  delete (L.Icon.Default.prototype as any)._getIconUrl;
}
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
  onLocationSelect?: (locationName: string, coords: { lat: number; lng: number }) => void;
  pickupCoords?: { lat: number; lng: number };
  destinationCoords?: { lat: number; lng: number };
}

interface NominatimResult {
  display_name: string;
  lat: string;
  lon: string;
}

// Custom Icons
const driverIcon = new L.Icon({
  iconUrl: 'https://cdn-icons-png.flaticon.com/512/3097/3097180.png', // Temporary placeholder
  iconSize: [32, 32],
  iconAnchor: [16, 16],
  popupAnchor: [0, -16]
});

const pickupIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

const destinationIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});


/**
 * Subcomponent to handle map clicks for selecting destination
 */
const MapClickHandler: React.FC<{ 
  onSelect: (name: string, coords: { lat: number, lng: number }) => void;
  role: UserRole;
  isTripActive: boolean;
}> = ({ onSelect, role, isTripActive }) => {
  useMapEvents({
    click(e) {
      if (role === UserRole.RIDER && !isTripActive) {
        console.log('[Map] 📍 Clicked at:', e.latlng);
        // We use a specific placeholder name so App.tsx knows to reverse geocode it
        onSelect(
          `Selected Location (${e.latlng.lat.toFixed(4)}, ${e.latlng.lng.toFixed(4)})`,
          { lat: e.latlng.lat, lng: e.latlng.lng }
        );
      }
    },
  });
  return null;
};

/**
 * Subcomponent to handle map movement, coordinate processing, and routing.
 */
const MapUpdater: React.FC<{ 
  pickupCoords: { lat: number; lng: number } | undefined;
  destinationCoords: { lat: number; lng: number } | undefined;
  driverLocation: Location | undefined;
  isSearching: boolean;
}> = React.memo(({ pickupCoords, destinationCoords, driverLocation, isSearching }) => {
  const map = useMap();
  const routeRef = useRef<LatLngTuple[]>([]);
  const driverMarkerRef = useRef<LeafletMarker | null>(null);

  // 1. Fit bounds to show both pickup and destination
  useEffect(() => {
    const points: LatLngTuple[] = [];

    if (pickupCoords) {
      points.push([pickupCoords.lat, pickupCoords.lng]);
    }
    if (destinationCoords) {
      points.push([destinationCoords.lat, destinationCoords.lng]);
    }

    if (points.length > 0) {
      // Add a small padding to the bounds
      map.fitBounds(points, { padding: [50, 50], maxZoom: 16, animate: true, duration: 1.0 });
    } else if (driverLocation) {
       map.setView([driverLocation.lat, driverLocation.lng], 16, { animate: true, duration: 1.0 });
    } else if (pickupCoords) {
      map.setView([pickupCoords.lat, pickupCoords.lng], 16, { animate: true });
    }

  }, [map, pickupCoords, destinationCoords, driverLocation]);


  // 2. Update Driver Marker position and bearing
  useEffect(() => {
    if (driverLocation) {
      const { lat, lng, bearing } = driverLocation;
      const latlng: LatLngTuple = [lat, lng];

      if (!driverMarkerRef.current) {
        driverMarkerRef.current = L.marker(latlng, { 
          icon: driverIcon, 
          // @ts-ignore
          rotationAngle: bearing || 0 
        }).addTo(map);
      } else {
        driverMarkerRef.current.setLatLng(latlng);
        // @ts-ignore
        if (driverMarkerRef.current.setRotationAngle) {
          // @ts-ignore
          driverMarkerRef.current.setRotationAngle(bearing || 0);
        }
      }
      
      if (isSearching) {
        map.panTo(latlng, { animate: true, duration: 0.5 });
      }
    } else if (driverMarkerRef.current) {
      map.removeLayer(driverMarkerRef.current);
      driverMarkerRef.current = null;
    }
    
  }, [map, driverLocation, isSearching]);
  
  // 3. Routing Placeholder
  useEffect(() => {
    if (pickupCoords && destinationCoords) {
      routeRef.current = [
        [pickupCoords.lat, pickupCoords.lng],
        [destinationCoords.lat, destinationCoords.lng],
      ] as LatLngTuple[];
    } else {
      routeRef.current = [];
    }
  }, [pickupCoords, destinationCoords]);

  return (
    <>
      <Polyline positions={routeRef.current} color="#059669" weight={6} opacity={0.7} dashArray="10, 10" />

      {pickupCoords && (
        <Marker position={[pickupCoords.lat, pickupCoords.lng]} icon={pickupIcon}>
          <Popup>Pickup Location</Popup>
        </Marker>
      )}

      {destinationCoords && (
        <Marker position={[destinationCoords.lat, destinationCoords.lng]} icon={destinationIcon}>
          <Popup>Destination</Popup>
        </Marker>
      )}
    </>
  );
});

/**
 * Locate Me Button Control
 */
const LocateControl: React.FC<{ 
  onLocate: (coords: { lat: number, lng: number }) => void 
}> = ({ onLocate }) => {
  const map = useMap();
  const [loading, setLoading] = useState(false);

  const handleClick = () => {
    setLoading(true);
    map.locate({ setView: true, maxZoom: 16 })
      .on('locationfound', (e) => {
        setLoading(false);
        onLocate({ lat: e.latlng.lat, lng: e.latlng.lng });
      })
      .on('locationerror', () => {
        setLoading(false);
        alert('Could not access your location.');
      });
  };

  return (
    <button
      onClick={handleClick}
      className="absolute bottom-24 right-4 z-[400] bg-white p-3 rounded-full shadow-lg text-zinc-600 hover:text-emerald-600 transition-colors md:bottom-32 md:right-8"
      title="Locate Me"
    >
      {loading ? (
        <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
      ) : (
        <Crosshair size={24} />
      )}
    </button>
  );
};

// --- Main Component ---

export const MapVisualizer: React.FC<MapVisualizerProps> = React.memo(({
  role,
  driverLocation,
  pickup,
  destination,
  isSearching,
  onLocationSelect,
  pickupCoords: propPickupCoords,
  destinationCoords: propDestinationCoords,
}) => {
  
  const [localPickupCoords, setLocalPickupCoords] = useState<{ lat: number; lng: number } | undefined>(propPickupCoords);
  const [localDestCoords, setLocalDestCoords] = useState<{ lat: number; lng: number } | undefined>(propDestinationCoords);
  const [geocodedDest, setGeocodedDest] = useState<{ lat: number; lng: number, name: string } | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<NominatimResult[]>([]);
  const [isSearchingLocation, setIsSearchingLocation] = useState(false);
  const [isSearchVisible, setIsSearchVisible] = useState(false);
  const searchTimeoutRef = useRef<NodeJS.Timeout>();

  const finalPickupCoords = propPickupCoords || localPickupCoords;
  const finalDestinationCoords = propDestinationCoords || localDestCoords || (geocodedDest ? { lat: geocodedDest.lat, lng: geocodedDest.lng } : undefined);
  
  // Update local coords if props change
  useEffect(() => {
    if (propPickupCoords) setLocalPickupCoords(propPickupCoords);
  }, [propPickupCoords]);

  useEffect(() => {
    if (propDestinationCoords) setLocalDestCoords(propDestinationCoords);
  }, [propDestinationCoords]);

  // --- Auto-Geocoding ---
  useEffect(() => {
    if (destination && !propDestinationCoords && !localDestCoords && !geocodedDest) {
      const geocode = async () => {
        try {
          const response = await fetch(
            `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(destination)}&countrycodes=ng&limit=1`,
            { headers: { 'User-Agent': 'Adaidaita/1.0' } }
          );
          const data: NominatimResult[] = await response.json();
          if (data && data.length > 0) {
            setGeocodedDest({ 
              lat: parseFloat(data[0].lat), 
              lng: parseFloat(data[0].lon), 
              name: data[0].display_name 
            });
          }
        } catch (error) {
          console.error('[Geocode] ❌ Error:', error);
        }
      };
      const timer = setTimeout(geocode, 1000); 
      return () => clearTimeout(timer);
    }
  }, [destination, propDestinationCoords, localDestCoords, geocodedDest]);

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    if (query.length < 3) { setSearchResults([]); return; }
    setIsSearchingLocation(true);
    
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const response = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&countrycodes=ng&limit=5`,
          { headers: { 'User-Agent': 'Adaidaita/1.0' } }
        );
        const data = await response.json();
        setSearchResults(data);
      } catch (error) { setSearchResults([]); } 
      finally { setIsSearchingLocation(false); }
    }, 500);
  };

  const handleSearchSelect = (result: NominatimResult) => {
    const coords = { lat: parseFloat(result.lat), lng: parseFloat(result.lon) };
    if (onLocationSelect) onLocationSelect(result.display_name, coords);
    setSearchQuery('');
    setSearchResults([]);
    setIsSearchVisible(false);
    setGeocodedDest(null);
  };
  
  let initialCenter: LatLngTuple;
  if (finalPickupCoords) {
    initialCenter = [finalPickupCoords.lat, finalPickupCoords.lng];
  } else if (driverLocation) {
    initialCenter = [driverLocation.lat, driverLocation.lng];
  } else {
    initialCenter = INITIAL_MAP_CENTER as LatLngTuple; 
  }
  
  return (
    <div className="w-full h-full relative">
      <MapContainer 
        center={initialCenter} 
        zoom={13} 
        style={{ height: '100%', width: '100%' }}
        scrollWheelZoom={true}
        className="z-0"
      >
        <TileLayer
          attribution='&copy; OpenStreetMap contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        
        <MapUpdater 
          pickupCoords={finalPickupCoords}
          destinationCoords={finalDestinationCoords}
          driverLocation={driverLocation}
          isSearching={isSearching || false}
        />

        {onLocationSelect && (
          <MapClickHandler 
            onSelect={onLocationSelect} 
            role={role} 
            isTripActive={!!isSearching || !!driverLocation} // Disable click if trip active
          />
        )}

        <LocateControl 
          onLocate={(coords) => {
            // Also update local state to ensure marker appears immediately
            if (!propPickupCoords) setLocalPickupCoords(coords);
          }} 
        />
        
      </MapContainer>

      {/* Floating Search Button/Bar */}
      {role === UserRole.RIDER && !finalDestinationCoords && (
        <div className="absolute top-4 left-4 right-4 z-[400] md:left-auto md:right-8 md:w-96">
          {!isSearchVisible ? (
            <button 
              onClick={() => setIsSearchVisible(true)}
              className="w-full bg-white rounded-xl shadow-xl p-4 flex items-center justify-between text-zinc-600 hover:shadow-2xl transition-all"
            >
              <span className="font-semibold text-zinc-900 truncate">{destination || 'Where are you going?'}</span>
              <Search size={20} className="text-emerald-600" />
            </button>
          ) : (
            <div className="bg-white rounded-xl shadow-2xl p-2">
              <div className="flex items-center border-b border-zinc-100 p-2">
                <Search size={20} className="text-zinc-400 mr-2" />
                <input
                  type="text"
                  placeholder="Enter destination..."
                  value={searchQuery}
                  onChange={(e) => handleSearch(e.target.value)}
                  className="flex-1 border-none outline-none focus:ring-0 text-zinc-900"
                  autoFocus
                />
                <button onClick={() => setIsSearchVisible(false)} className="p-1 text-zinc-500">
                  <X size={20} />
                </button>
              </div>

              <div className="max-h-64 overflow-y-auto">
                {isSearchingLocation && (
                  <div className="flex items-center justify-center p-4">
                    <div className="w-4 h-4 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mr-2"></div>
                    <span className="text-sm text-zinc-500">Searching...</span>
                  </div>
                )}
                
                {!isSearchingLocation && searchResults.map((result, idx) => (
                  <button 
                    key={idx}
                    onClick={() => handleSearchSelect(result)}
                    className="w-full text-left px-4 py-3 text-sm text-zinc-600 hover:bg-emerald-50 border-b border-zinc-50 flex items-center"
                  >
                    <MapPin size={12} className="mr-3 text-zinc-400" />
                    <span className="truncate">{result.display_name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}, (prev, next) => {
  const coordsEq = (a?: any, b?: any) => a?.lat === b?.lat && a?.lng === b?.lng;
  return prev.role === next.role &&
         coordsEq(prev.pickupCoords, next.pickupCoords) &&
         coordsEq(prev.destinationCoords, next.destinationCoords) &&
         coordsEq(prev.driverLocation, next.driverLocation) &&
         prev.isSearching === next.isSearching &&
         prev.pickup === next.pickup &&
         prev.destination === next.destination;
});
