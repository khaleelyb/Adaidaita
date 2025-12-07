import React, { useEffect, useState, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L, { LatLngTuple, Marker as LeafletMarker } from 'leaflet';
import { Location, UserRole } from '../types';
import { Search, X, MapPin, Navigation2 } from 'lucide-react';
import { INITIAL_MAP_CENTER } from '../constants';
import 'leaflet/dist/leaflet.css';

// --- CRITICAL FIX 4: Fix Leaflet default marker icons ---
// This is necessary in many modern React/Webpack setups
if ((L.Icon.Default.prototype as any)._getIconUrl) { // FIX: Added conditional check
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

// Custom Icon for Driver
const driverIcon = new L.Icon({
  iconUrl: '/car-icon.png', // Assuming you have a small car icon image
  iconSize: [32, 32],
  iconAnchor: [16, 16], // center the icon
  popupAnchor: [0, -16]
});

// Custom Icon for Pickup
const pickupIcon = new L.Icon({
  iconUrl: '/pickup-icon.png',
  iconSize: [32, 32],
  iconAnchor: [16, 32],
});

// Custom Icon for Destination
const destinationIcon = new L.Icon({
  iconUrl: '/destination-icon.png',
  iconSize: [32, 32],
  iconAnchor: [16, 32],
});


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
      map.fitBounds(points, { padding: [50, 50], maxZoom: 15, animate: true, duration: 1.5 });
    } else if (driverLocation) {
       // If only driver is present (e.g., rider viewing driver's location before booking)
       map.setView([driverLocation.lat, driverLocation.lng], 16, { animate: true, duration: 1.5 });
    }

  }, [map, pickupCoords, destinationCoords, driverLocation]);


  // 2. Update Driver Marker position and bearing
  useEffect(() => {
    if (driverLocation) {
      const { lat, lng, bearing } = driverLocation;
      const latlng: LatLngTuple = [lat, lng];

      if (!driverMarkerRef.current) {
        // Create marker if it doesn't exist
        driverMarkerRef.current = L.marker(latlng, { 
          icon: driverIcon, 
          rotationAngle: bearing || 0 // Use a leaflet plugin for rotation
        }).addTo(map);
        // Map.panTo(latlng, { animate: true, duration: 1 }); // Center on driver initially
      } else {
        // Update position and rotation
        driverMarkerRef.current.setLatLng(latlng);
        // Assuming L.marker supports rotation through a plugin or custom implementation
        if ((driverMarkerRef.current as any).setRotationAngle) {
          (driverMarkerRef.current as any).setRotationAngle(bearing || 0);
        }
      }
      
      // Keep map centered on driver if searching
      if (isSearching) {
        map.panTo(latlng, { animate: true, duration: 0.5 });
      }
    } else if (driverMarkerRef.current) {
      // Remove marker if driver location is cleared
      map.removeLayer(driverMarkerRef.current);
      driverMarkerRef.current = null;
    }
    
  }, [map, driverLocation, isSearching]);
  
  // 3. Routing (Placeholder - Real routing uses external API or service)
  useEffect(() => {
    // In a real app, this would call a routing API (e.g., OSRM, GraphHopper)
    // to get a Polyline of coordinates for the route.
    if (pickupCoords && destinationCoords) {
      // Dummy route for visualization
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
      {/* Route Polyline (will be updated by the useEffect hook) */}
      <Polyline positions={routeRef.current} color="#059669" weight={6} opacity={0.7} />

      {/* Pickup Marker */}
      {pickupCoords && (
        <Marker position={[pickupCoords.lat, pickupCoords.lng]} icon={pickupIcon}>
          <Popup>Pickup Location</Popup>
        </Marker>
      )}

      {/* Destination Marker */}
      {destinationCoords && (
        <Marker position={[destinationCoords.lat, destinationCoords.lng]} icon={destinationIcon}>
          <Popup>Destination</Popup>
        </Marker>
      )}
    </>
  );
});

// --- Main MapVisualizer Component ---

// FIX 17: Memoize MapVisualizer to prevent excessive re-renders
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
  
  // Local state for coordinates if not passed as props (e.g., rider only has location names)
  const [localPickupCoords, setLocalPickupCoords] = useState<{ lat: number; lng: number } | undefined>(propPickupCoords);
  const [localDestCoords, setLocalDestCoords] = useState<{ lat: number; lng: number } | undefined>(propDestinationCoords);
  
  // State for geocoded results
  const [geocodedDest, setGeocodedDest] = useState<{ lat: number; lng: number, name: string } | null>(null);

  // Search Bar State
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<NominatimResult[]>([]);
  const [isSearchingLocation, setIsSearchingLocation] = useState(false);
  const [isSearchVisible, setIsSearchVisible] = useState(false);
  const searchTimeoutRef = useRef<NodeJS.Timeout>();

  const finalPickupCoords = propPickupCoords || localPickupCoords;
  const finalDestinationCoords = propDestinationCoords || localDestCoords || (geocodedDest ? { lat: geocodedDest.lat, lng: geocodedDest.lng } : undefined);
  
  // --- Auto-Geocoding for Destination Input ---
  // If destination is a string but coords are missing, try to geocode it automatically
  useEffect(() => {
    // Use geocodedDest in dependency array (Fix 5)
    if (destination && !propDestinationCoords && !localDestCoords && !geocodedDest) {
      console.log(`[Geocode] 🔍 Attempting to geocode: ${destination}`);
      
      const geocode = async () => {
        try {
          const response = await fetch(
            `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(destination)}&countrycodes=ng&limit=1`,
            {
              headers: {
                'User-Agent': 'Adaidaita/1.0 (Geocode)' // CRITICAL FIX 6: Added User-Agent
              }
            }
          );
          const data: NominatimResult[] = await response.json();
          
          if (data && data.length > 0) {
            const result = data[0];
            const coords = { lat: parseFloat(result.lat), lng: parseFloat(result.lon) };
            console.log('[Geocode] ✅ Found coordinates:', coords);
            setGeocodedDest({ ...coords, name: result.display_name });
          } else {
            console.log('[Geocode] ❌ No coordinates found for destination');
          }
        } catch (error) {
          console.error('[Geocode] ❌ Geocoding error:', error);
        }
      };

      // Simple debounce to prevent rapid fire geocoding
      const timer = setTimeout(geocode, 1000); 

      return () => clearTimeout(timer);
    }
  }, [destination, propDestinationCoords, localDestCoords, geocodedDest]); // CRITICAL FIX 5: Added geocodedDest

  // --- Location Search Handler (Nominatim) ---
  const handleSearch = (query: string) => {
    setSearchQuery(query);
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (query.length < 3) {
      setSearchResults([]);
      return;
    }

    setIsSearchingLocation(true);
    
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const response = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&countrycodes=ng&limit=5`,
          {
            headers: {
              'User-Agent': 'Adaidaita/1.0 (Search)' // CRITICAL FIX 6: Added User-Agent
            }
          }
        );
        const data: NominatimResult[] = await response.json();
        setSearchResults(data);
      } catch (error) {
        console.error('Search failed:', error);
        setSearchResults([]);
      } finally {
        setIsSearchingLocation(false);
      }
    }, 500); // 500ms debounce
  };

  const handleSearchSelect = (result: NominatimResult) => {
    const coords = { lat: parseFloat(result.lat), lng: parseFloat(result.lon) };
    if (onLocationSelect) {
      onLocationSelect(result.display_name, coords);
    }
    // Clear search state and close modal/panel
    setSearchQuery('');
    setSearchResults([]);
    setIsSearchVisible(false);
    setGeocodedDest(null); // Clear geocoded state to allow new geocoding if needed
  };
  
  // --- Determine Map Center ---
  let initialCenter: LatLngTuple;
  if (finalPickupCoords) {
    initialCenter = [finalPickupCoords.lat, finalPickupCoords.lng];
  } else if (driverLocation) {
    initialCenter = [driverLocation.lat, driverLocation.lng];
  } else {
    // Default fallback (e.g., center of Nigeria)
    initialCenter = INITIAL_MAP_CENTER as LatLngTuple; 
  }
  
  // --- Main Render ---
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
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        
        <MapUpdater 
          pickupCoords={finalPickupCoords}
          destinationCoords={finalDestinationCoords}
          driverLocation={driverLocation}
          isSearching={isSearching || false}
        />
        
      </MapContainer>

      {/* Floating Search Button/Bar */}
      {role === UserRole.RIDER && !finalDestinationCoords && (
        <div className="absolute top-4 left-4 right-4 z-10 md:left-auto md:right-8 md:w-96">
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
                />
                <button 
                  onClick={() => setIsSearchVisible(false)}
                  className="p-1 text-zinc-500 hover:text-zinc-800 transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Search Results */}
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
                    className="w-full text-left px-4 py-3 text-sm text-zinc-600 hover:bg-emerald-50 hover:text-emerald-700 transition-colors border-b border-zinc-50 last:border-0 flex items-center group"
                  >
                    <div className="p-1.5 bg-zinc-100 rounded-full mr-3 group-hover:bg-emerald-100 transition-colors">
                      <MapPin size={12} className="text-zinc-500 group-hover:text-emerald-600" />
                    </div>
                    <span className="truncate">{result.display_name}</span>
                  </button>
                ))}
                
                {!isSearchingLocation && searchResults.length === 0 && searchQuery.length >= 3 && (
                  <div className="px-4 py-8 text-center">
                    <p className="text-xs text-zinc-400 italic">No locations found</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Add pulse animation keyframes for location update visual feedback */}
      <style>{`
        @keyframes pulse-loc {
          0% {
            box-shadow: 0 0 0 0 rgba(5, 150, 105, 0.4);
          }
          70% {
            box-shadow: 0 0 0 10px rgba(5, 150, 105, 0);
          }
          100% {
            box-shadow: 0 0 0 0 rgba(5, 150, 105, 0);
          }
        }
      `}</style>
    </div>
  );
}, (prevProps, nextProps) => {
  // FIX 17: Custom comparison to prevent re-render on irrelevant state changes
  // Only re-render if:
  // 1. Coordinates change (pickup/destination)
  // 2. Driver location changes
  // 3. Trip status changes (which affects isSearching)
  // 4. Role changes
  
  const areCoordsEqual = (c1?: {lat: number, lng: number}, c2?: {lat: number, lng: number}) => 
    c1?.lat === c2?.lat && c1?.lng === c2?.lng;
    
  const areLocationsEqual = (l1?: Location, l2?: Location) => 
    l1?.lat === l2?.lat && l1?.lng === l2?.lng && l1?.bearing === l2?.bearing;

  return prevProps.role === nextProps.role &&
         areCoordsEqual(prevProps.pickupCoords, nextProps.pickupCoords) &&
         areCoordsEqual(prevProps.destinationCoords, nextProps.destinationCoords) &&
         areLocationsEqual(prevProps.driverLocation, nextProps.driverLocation) &&
         prevProps.isSearching === nextProps.isSearching &&
         prevProps.pickup === nextProps.pickup &&
         prevProps.destination === nextProps.destination;
});
