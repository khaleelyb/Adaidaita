import { RealtimeChannel } from '@supabase/supabase-js';
import { supabaseClient } from './supabaseClient';
import { INITIAL_MAP_CENTER } from '../constants';
import { Trip, TripStatus } from '../types';

type SubscriptionCallback = (payload: any) => void;

class SupabaseService {
  private channels: Map<string, RealtimeChannel> = new Map();
  private locationInterval: any = null;

  /**
   * Set driver online status
   */
  async setDriverOnline(driverId: string, isOnline: boolean) {
    try {
      const { error } = await supabaseClient
        .from('users')
        .update({ is_online: isOnline })
        .eq('id', driverId);

      if (error) {
        console.error('[Supabase] ❌ Failed to update driver online status:', error);
      }
    } catch (error) {
      console.error('[Supabase] ❌ Error updating driver online status:', error);
    }
  }

  /**
   * Subscribe to available trips (for Drivers)
   */
  subscribeToAvailableTrips(callback: (trip: Trip) => void) {
    console.log('[Supabase] 📡 Subscribing to available trips...');
    const channelName = 'available-trips';

    const channel = supabaseClient
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'trips',
          filter: `status=eq.${TripStatus.SEARCHING}`
        },
        async (payload) => {
          console.log('[Supabase] 🔔 New trip request received:', payload);
          if (payload.new) {
            const fullTrip = await this.getTripById(payload.new.id);
            if (fullTrip) {
              callback(fullTrip);
            }
          }
        }
      )
      .subscribe();

    this.channels.set(channelName, channel);

    return {
      unsubscribe: () => {
        console.log(`[Supabase] 🔌 Unsubscribing from ${channelName}`);
        supabaseClient.removeChannel(channel);
        this.channels.delete(channelName);
      }
    };
  }

  /**
   * Subscribe to real-time updates for a specific trip and driver locations
   */
  subscribe(channelName: string, callback: SubscriptionCallback) {
    console.log(`[Supabase] 📡 Subscribing to ${channelName}`);

    if (this.channels.has(channelName)) {
      supabaseClient.removeChannel(this.channels.get(channelName)!);
      this.channels.delete(channelName);
    }

    const channel = supabaseClient
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'trips'
        },
        async (payload: any) => {
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
        (payload: any) => {
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
  async createTrip(
    riderId: string,
    pickup: string,
    destination: string,
    pickupCoords?: { lat: number, lng: number },
    destinationCoords?: { lat: number, lng: number }
  ): Promise<Trip> {
    try {
      console.log('[Supabase] 🚗 Creating trip...', { riderId, pickup, destination, pickupCoords });

      const fare = Math.floor(Math.random() * 2000) + 500;

      // Use real coords if available, otherwise fallback to constants (or 0,0)
      const pLat = pickupCoords?.lat || INITIAL_MAP_CENTER.lat;
      const pLng = pickupCoords?.lng || INITIAL_MAP_CENTER.lng;
      const dLat = destinationCoords?.lat || null;
      const dLng = destinationCoords?.lng || null;

      const { data, error } = await supabaseClient
        .from('trips')
        .insert({
          rider_id: riderId,
          pickup_location: pickup,
          destination_location: destination,
          status: TripStatus.SEARCHING,
          fare,
          pickup_lat: pLat,
          pickup_lng: pLng,
          // If you have columns for destination coords in DB, add them here
          // dest_lat: dLat,
          // dest_lng: dLng
        })
        .select()
        .single();

      if (error) {
        console.error('[Supabase] ❌ Trip creation failed:', error);
        throw new Error(`Failed to create trip: ${error.message}`);
      }

      console.log('[Supabase] ✅ Trip created:', data);

      const fullTrip = await this.getTripById(data.id);
      return fullTrip || this.mapTrip(data);
    } catch (error: any) {
      console.error('[Supabase] ❌ Create trip error:', error);
      throw error;
    }
  }

  /**
   * Driver accepts a trip
   */
  async acceptTrip(tripId: string, driverId: string): Promise<Trip | null> {
    try {
      console.log('[Supabase] 🤝 Accepting trip...', { tripId, driverId });

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
        console.error('[Supabase] ❌ Accept trip failed:', error);
        return null;
      }

      console.log('[Supabase] ✅ Trip accepted:', data);

      // Get the trip to know where to start the driver
      const trip = await this.getTripById(tripId);
      const startLat = trip?.pickupCoords?.lat || INITIAL_MAP_CENTER.lat;
      const startLng = trip?.pickupCoords?.lng || INITIAL_MAP_CENTER.lng;

      await this.initializeDriverLocation(driverId, startLat, startLng);
      this.startLocationUpdates(driverId, startLat, startLng);

      return trip;
    } catch (error) {
      console.error('[Supabase] ❌ Accept trip error:', error);
      return null;
    }
  }

  /**
   * Update trip status
   */
  async updateTripStatus(tripId: string, status: TripStatus): Promise<Trip | null> {
    try {
      const updateData: any = { status };

      if (status === TripStatus.ACCEPTED) {
        updateData.accepted_at = new Date().toISOString();
      } else if (status === TripStatus.IN_PROGRESS) {
        updateData.started_at = new Date().toISOString();
      } else if (status === TripStatus.COMPLETED) {
        updateData.completed_at = new Date().toISOString();
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

      return await this.getTripById(tripId);
    } catch (error) {
      console.error('[Supabase] ❌ Update trip status error:', error);
      return null;
    }
  }

  /**
   * Get trip by ID
   */
  async getTripById(tripId: string): Promise<Trip | null> {
    try {
      const { data, error } = await supabaseClient
        .from('trips')
        .select(`
          *,
          rider:rider_id(id, name, email, avatar_url, rating),
          driver:driver_id(id, name, email, avatar_url, vehicle_model, vehicle_plate, rating)
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
   * Initialize driver location (near pickup point)
   */
  private async initializeDriverLocation(driverId: string, lat?: number, lng?: number) {
    try {
      const startLat = (lat || INITIAL_MAP_CENTER.lat) - 0.002;
      const startLng = (lng || INITIAL_MAP_CENTER.lng) - 0.002;

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
      }
    } catch (error) {
      console.error('[Supabase] ❌ Initialize driver location error:', error);
    }
  }

  /**
   * Start simulating driver movement towards pickup
   */
  private startLocationUpdates(driverId: string, startLat?: number, startLng?: number) {
    if (this.locationInterval) {
      clearInterval(this.locationInterval);
    }

    let lat = (startLat || INITIAL_MAP_CENTER.lat) - 0.002;
    let lng = (startLng || INITIAL_MAP_CENTER.lng) - 0.002;
    let heading = 45;

    this.locationInterval = setInterval(async () => {
      try {
        const speed = 0.00015;
        const steering = (Math.random() - 0.5) * 15;
        heading = (heading + steering + 360) % 360;

        const rad = (90 - heading) * (Math.PI / 180);
        lat += Math.sin(rad) * speed;
        lng += Math.cos(rad) * speed;

        await supabaseClient
          .from('driver_locations')
          .upsert({
            driver_id: driverId,
            lat: lat,
            lng: lng,
            bearing: heading,
            updated_at: new Date().toISOString()
          });
      } catch (error) {
        // Ignore errors
      }
    }, 2000);
  }

  /**
   * Manually update driver location (for real GPS)
   */
  async updateDriverLocation(driverId: string, location: { lat: number, lng: number, bearing: number }) {
    try {
      const { error } = await supabaseClient
        .from('driver_locations')
        .upsert({
          driver_id: driverId,
          lat: location.lat,
          lng: location.lng,
          bearing: location.bearing,
          updated_at: new Date().toISOString()
        });

      if (error) {
        console.error('[Supabase] ❌ Update location failed:', error);
      }
    } catch (error) {
      console.error('[Supabase] ❌ Update driver location error:', error);
    }
  }

  private stopLocationUpdates() {

    if (this.locationInterval) {
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
      fare: data.fare,
      pickupCoords: (data.pickup_lat && data.pickup_lng) ? {
        lat: data.pickup_lat,
        lng: data.pickup_lng
      } : undefined,
      driverLocation: data.driver_locations ? {
        lat: data.driver_locations.lat,
        lng: data.driver_locations.lng,
        bearing: data.driver_locations.bearing
      } : undefined,
      rider: data.rider ? {
        name: data.rider.name,
        avatarUrl: data.rider.avatar_url,
        rating: data.rider.rating
      } : undefined,
      driver: data.driver ? {
        name: data.driver.name,
        avatarUrl: data.driver.avatar_url,
        vehicleModel: data.driver.vehicle_model,
        vehiclePlate: data.driver.vehicle_plate,
        rating: data.driver.rating
      } : undefined
    };
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
