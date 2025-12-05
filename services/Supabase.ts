import { RealtimeChannel } from '@supabase/supabase-js';
import { supabaseClient } from './supabaseClient';
import { INITIAL_MAP_CENTER } from '../constants';
import { Trip, TripStatus } from '../types';

type SubscriptionCallback = (payload: any) => void;

class SupabaseService {
  private channels: Map<string, RealtimeChannel> = new Map();
  private locationInterval: any = null;

  /**
   * Subscribe to real-time updates for trips and driver locations
   */
  subscribe(channelName: string, callback: SubscriptionCallback) {
    console.log(`[Supabase] 📡 Subscribing to ${channelName}`);
    
    const channel = supabaseClient
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*', // Listen to all events (INSERT, UPDATE, DELETE)
          schema: 'public',
          table: 'trips'
        },
        async (payload) => {
          console.log('[Supabase] 🔄 Trip update received:', payload);
          
          if (payload.new) {
            const trip = await this.getTripById(payload.new.id);
            if (trip) {
              callback({
                event: 'trip_updated',
                payload: { trip }
              });
            }
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'driver_locations'
        },
        (payload) => {
          console.log('[Supabase] 📍 Driver location update:', payload);
          
          if (payload.new) {
            callback({
              event: 'location_update',
              payload: {
                lat: parseFloat(payload.new.lat),
                lng: parseFloat(payload.new.lng),
                bearing: parseFloat(payload.new.bearing || 0)
              }
            });
          }
        }
      )
      .subscribe((status) => {
        console.log(`[Supabase] Channel ${channelName} status:`, status);
      });

    this.channels.set(channelName, channel);

    return {
      unsubscribe: () => {
        console.log(`[Supabase] 🔌 Unsubscribing from ${channelName}`);
        const ch = this.channels.get(channelName);
        if (ch) {
          supabaseClient.removeChannel(ch);
          this.channels.delete(channelName);
        }
      }
    };
  }

  /**
   * Create a new trip request
   */
  async createTrip(riderId: string, pickup: string, destination: string): Promise<Trip> {
    try {
      console.log('[Supabase] 🚗 Creating trip...', { riderId, pickup, destination });
      
      const fare = Math.floor(Math.random() * 2000) + 500;
      
      const { data, error } = await supabaseClient
        .from('trips')
        .insert({
          rider_id: riderId,
          pickup_location: pickup,
          destination_location: destination,
          status: TripStatus.SEARCHING,
          fare,
          pickup_lat: INITIAL_MAP_CENTER.lat,
          pickup_lng: INITIAL_MAP_CENTER.lng
        })
        .select()
        .single();

      if (error) {
        console.error('[Supabase] ❌ Trip creation failed:', error);
        throw new Error(`Failed to create trip: ${error.message}`);
      }

      console.log('[Supabase] ✅ Trip created:', data);

      // Auto-assign driver after 3 seconds (simulating nearby driver search)
      setTimeout(() => {
        console.log('[Supabase] 🔍 Searching for nearby driver...');
        this.autoAssignDriver(data.id);
      }, 3000);

      return this.mapTrip(data);
    } catch (error: any) {
      console.error('[Supabase] ❌ Create trip error:', error);
      throw error;
    }
  }

  /**
   * Update trip status
   */
  async updateTripStatus(tripId: string, status: TripStatus): Promise<Trip | null> {
    try {
      console.log('[Supabase] 🔄 Updating trip status...', { tripId, status });
      
      const updateData: any = { status };
      
      // Add timestamps based on status
      if (status === TripStatus.ACCEPTED) {
        updateData.accepted_at = new Date().toISOString();
      } else if (status === TripStatus.IN_PROGRESS) {
        updateData.started_at = new Date().toISOString();
      } else if (status === TripStatus.COMPLETED) {
        updateData.completed_at = new Date().toISOString();
        // Stop location updates when trip completes
        this.stopLocationUpdates();
      }

      const { data, error } = await supabaseClient
        .from('trips')
        .update(updateData)
        .eq('id', tripId)
        .select()
        .single();

      if (error) {
        console.error('[Supabase] ❌ Status update failed:', error);
        return null;
      }

      console.log('[Supabase] ✅ Trip status updated:', data);
      return this.mapTrip(data);
    } catch (error) {
      console.error('[Supabase] ❌ Update trip status error:', error);
      return null;
    }
  }

  /**
   * Get trip by ID
   */
  private async getTripById(tripId: string): Promise<Trip | null> {
    try {
      const { data, error } = await supabaseClient
        .from('trips')
        .select(`
          *,
          rider:rider_id(id, name, email, avatar_url),
          driver:driver_id(id, name, email, avatar_url, vehicle_model, vehicle_plate)
        `)
        .eq('id', tripId)
        .single();

      if (error) {
        console.error('[Supabase] ❌ Get trip failed:', error);
        return null;
      }
      
      return this.mapTrip(data);
    } catch (error) {
      console.error('[Supabase] ❌ Get trip by ID error:', error);
      return null;
    }
  }

  /**
   * Auto-assign available driver to trip
   */
  private async autoAssignDriver(tripId: string) {
    try {
      console.log('[Supabase] 🔍 Looking for available driver...');
      
      // Find an online driver
      const { data: drivers, error: driverError } = await supabaseClient
        .from('users')
        .select('id, name, email')
        .eq('role', 'DRIVER')
        .eq('is_online', true)
        .limit(1);

      if (driverError) {
        console.error('[Supabase] ❌ Error finding driver:', driverError);
        return;
      }

      if (!drivers || drivers.length === 0) {
        console.warn('[Supabase] ⚠️ No online drivers available. Using default driver...');
        // Use Bob as default driver
        const driverId = '22222222-2222-2222-2222-222222222222';
        await this.assignDriverToTrip(tripId, driverId);
        return;
      }

      const driver = drivers[0];
      console.log('[Supabase] 👤 Found driver:', driver.name);
      await this.assignDriverToTrip(tripId, driver.id);
      
    } catch (error) {
      console.error('[Supabase] ❌ Auto-assign driver error:', error);
    }
  }

  /**
   * Assign specific driver to trip
   */
  private async assignDriverToTrip(tripId: string, driverId: string) {
    try {
      console.log('[Supabase] 🎯 Assigning driver to trip...', { tripId, driverId });
      
      const { data, error } = await supabaseClient
        .from('trips')
        .update({
          driver_id: driverId,
          status: TripStatus.ACCEPTED,
          accepted_at: new Date().toISOString()
        })
        .eq('id', tripId)
        .select()
        .single();

      if (error) {
        console.error('[Supabase] ❌ Driver assignment failed:', error);
        return;
      }

      console.log('[Supabase] ✅ Driver assigned successfully!', data);

      // Initialize driver location if not exists
      await this.initializeDriverLocation(driverId);
      
      // Start simulating driver movement
      this.startLocationUpdates(driverId);
      
    } catch (error) {
      console.error('[Supabase] ❌ Assign driver to trip error:', error);
    }
  }

  /**
   * Initialize driver location (near pickup point)
   */
  private async initializeDriverLocation(driverId: string) {
    try {
      console.log('[Supabase] 📍 Initializing driver location...');
      
      // Start driver 0.002 degrees away (roughly 200m)
      const startLat = INITIAL_MAP_CENTER.lat - 0.002;
      const startLng = INITIAL_MAP_CENTER.lng - 0.002;

      const { error } = await supabaseClient
        .from('driver_locations')
        .upsert({
          driver_id: driverId,
          lat: startLat,
          lng: startLng,
          bearing: 45,
          updated_at: new Date().toISOString()
        });

      if (error) {
        console.error('[Supabase] ❌ Initialize location failed:', error);
      } else {
        console.log('[Supabase] ✅ Driver location initialized');
      }
    } catch (error) {
      console.error('[Supabase] ❌ Initialize driver location error:', error);
    }
  }

  /**
   * Start simulating driver movement towards pickup
   */
  private startLocationUpdates(driverId: string) {
    // Clear any existing interval
    if (this.locationInterval) {
      clearInterval(this.locationInterval);
    }

    console.log('[Supabase] 🚗 Starting driver location updates...');

    let lat = INITIAL_MAP_CENTER.lat - 0.002;
    let lng = INITIAL_MAP_CENTER.lng - 0.002;
    let heading = 45; // Northeast towards pickup

    this.locationInterval = setInterval(async () => {
      try {
        // Simulate realistic movement
        const speed = 0.00015; // ~15m per update
        const steering = (Math.random() - 0.5) * 15; // Slight steering variations
        heading = (heading + steering + 360) % 360;

        // Convert heading to radians for calculation
        const rad = (90 - heading) * (Math.PI / 180);
        lat += Math.sin(rad) * speed;
        lng += Math.cos(rad) * speed;

        // Update location in database
        const { error } = await supabaseClient
          .from('driver_locations')
          .upsert({
            driver_id: driverId,
            lat: lat,
            lng: lng,
            bearing: heading,
            updated_at: new Date().toISOString()
          });

        if (error) {
          console.error('[Supabase] ❌ Location update failed:', error);
        } else {
          console.log('[Supabase] 📍 Driver location updated:', { lat: lat.toFixed(6), lng: lng.toFixed(6) });
        }
      } catch (error) {
        console.error('[Supabase] ❌ Location update error:', error);
      }
    }, 2000); // Update every 2 seconds
  }

  /**
   * Stop location updates
   */
  private stopLocationUpdates() {
    if (this.locationInterval) {
      console.log('[Supabase] ⏹️ Stopping location updates');
      clearInterval(this.locationInterval);
      this.locationInterval = null;
    }
  }

  /**
   * Map database trip to Trip type
   */
  private mapTrip(data: any): Trip {
    return {
      id: data.id,
      riderId: data.rider_id,
      driverId: data.driver_id,
      pickup: data.pickup_location,
      destination: data.destination_location,
      status: data.status,
      fare: data.fare
    };
  }

  /**
   * WebRTC Signaling - Send signal
   */
  send(channelName: string, event: string, payload: any) {
    console.log('[Supabase] 📞 Sending WebRTC signal:', { event, channelName });
    
    if (channelName.startsWith('call-')) {
      const tripId = channelName.replace('call-', '');
      
      supabaseClient.from('call_signals').insert({
        trip_id: tripId,
        signal_type: event,
        signal_data: payload,
        from_user_id: '11111111-1111-1111-1111-111111111111',
        to_user_id: '22222222-2222-2222-2222-222222222222'
      }).then(({ error }) => {
        if (error) {
          console.error('[Supabase] ❌ Signal send failed:', error);
        } else {
          console.log('[Supabase] ✅ Signal sent successfully');
        }
      });
    }
  }

  /**
   * Cleanup all subscriptions
   */
  cleanup() {
    console.log('[Supabase] 🧹 Cleaning up subscriptions...');
    this.channels.forEach((channel, name) => {
      supabaseClient.removeChannel(channel);
    });
    this.channels.clear();
    this.stopLocationUpdates();
  }
}

export const supabase = new SupabaseService();
