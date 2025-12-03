import { Trip, TripStatus, UserRole, Location } from '../types';
import { INITIAL_MAP_CENTER } from '../constants';

// This class mimics the behavior of Supabase Realtime channels and DB calls
// to allow the UI to function without a live backend connection.

type SubscriptionCallback = (payload: any) => void;

class MockSupabase {
  private channels: Map<string, Set<SubscriptionCallback>> = new Map();
  private activeTrip: Trip | null = null;
  private tripUpdateInterval: any = null;

  constructor() {}

  // --- Realtime Simulation ---

  subscribe(channelName: string, callback: SubscriptionCallback) {
    if (!this.channels.has(channelName)) {
      this.channels.set(channelName, new Set());
    }
    this.channels.get(channelName)?.add(callback);

    console.log(`[Supabase] Subscribed to ${channelName}`);
    
    return {
      unsubscribe: () => {
        this.channels.get(channelName)?.delete(callback);
        console.log(`[Supabase] Unsubscribed from ${channelName}`);
      }
    };
  }

  send(channelName: string, event: string, payload: any) {
    // Simulate network latency
    setTimeout(() => {
      const subscribers = this.channels.get(channelName);
      if (subscribers) {
        subscribers.forEach(cb => cb({ event, payload }));
      }
    }, 100);
  }

  // --- Database Simulation ---

  async createTrip(riderId: string, pickup: string, destination: string): Promise<Trip> {
    return new Promise((resolve) => {
      setTimeout(() => {
        const newTrip: Trip = {
          id: `trip-${Date.now()}`,
          riderId,
          pickup,
          destination,
          status: TripStatus.SEARCHING,
          fare: Math.floor(Math.random() * 2000) + 500,
        };
        this.activeTrip = newTrip;
        resolve(newTrip);
        
        // Simulate a driver accepting after 3 seconds
        this.simulateDriverAcceptance(newTrip.id);
      }, 800);
    });
  }

  async updateTripStatus(tripId: string, status: TripStatus): Promise<Trip | null> {
     return new Promise((resolve) => {
       setTimeout(() => {
         if (this.activeTrip && this.activeTrip.id === tripId) {
           this.activeTrip.status = status;
           // Notify listeners
           this.send(`trip-${tripId}`, 'status_change', { status });
           resolve(this.activeTrip);
         } else {
           resolve(null);
         }
       }, 500);
     });
  }

  // --- Internal Simulation Logic ---

  private simulateDriverAcceptance(tripId: string) {
    setTimeout(() => {
      if (this.activeTrip && this.activeTrip.id === tripId) {
        this.activeTrip.status = TripStatus.ACCEPTED;
        this.activeTrip.driverId = 'driver-456';
        
        // Start slightly offset from center
        const startLat = INITIAL_MAP_CENTER.lat - 0.002;
        const startLng = INITIAL_MAP_CENTER.lng - 0.002;
        
        this.activeTrip.driverLocation = { lat: startLat, lng: startLng, bearing: 45 }; 
        
        // Notify Rider
        this.send(`trip-${tripId}`, 'trip_accepted', { 
          trip: this.activeTrip,
          driverId: 'driver-456' 
        });

        // Start transmitting simulated driver location
        this.startDriverLocationUpdates(tripId);
      }
    }, 4000);
  }

  private startDriverLocationUpdates(tripId: string) {
    if (this.tripUpdateInterval) clearInterval(this.tripUpdateInterval);
    
    // Start state
    let lat = INITIAL_MAP_CENTER.lat - 0.002;
    let lng = INITIAL_MAP_CENTER.lng - 0.002;
    let heading = 45; // Degrees
    
    this.tripUpdateInterval = setInterval(() => {
      if (!this.activeTrip || this.activeTrip.status === TripStatus.COMPLETED || this.activeTrip.status === TripStatus.IDLE) {
        clearInterval(this.tripUpdateInterval);
        return;
      }

      // Smooth Car Movement Logic
      const speed = 0.00015; // ~15m per second (approx 50km/h scale)
      
      // Add slight randomness to steering to simulate driving on roads
      const steering = (Math.random() - 0.5) * 20; // +/- 10 degrees turn
      heading = (heading + steering + 360) % 360;

      // Convert heading to radians (0 is North/Up)
      // Map logic: North is +Lat, East is +Lng.
      // Standard trig: 0 is East. So we adjust.
      // Heading 0 (North) -> dy > 0.
      // We'll use standard navigation bearing: 0 = North, 90 = East.
      const rad = (90 - heading) * (Math.PI / 180);

      lat += Math.sin(rad) * speed; 
      lng += Math.cos(rad) * speed;

      const location: Location = { lat, lng, bearing: heading };
      this.send(`trip-${tripId}`, 'location_update', location);
    }, 1000); // 1Hz updates for smooth UI
  }
}

export const supabase = new MockSupabase();