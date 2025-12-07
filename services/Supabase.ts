import { RealtimeChannel } from '@supabase/supabase-js';
import { supabaseClient } from './supabaseClient';
import { INITIAL_MAP_CENTER } from '../constants';
import { Trip, TripStatus, Location, User } from '../types';

type SubscriptionCallback = (payload: any) => void;

class SupabaseService {
  private channels: Map<string, RealtimeChannel> = new Map();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;

  /**
   * CRITICAL FIX #1: Enable Replication for realtime to work
   * Make sure in Supabase Dashboard > Database > Replication:
   * - trips table is enabled
   * - driver_locations table is enabled
   */

  /**
   * Set driver online status
   */
  async setDriverOnline(driverId: string, isOnline: boolean) {
    try {
      const { error } = await supabaseClient
        .from('users')
        .update({ 
          is_online: isOnline,
          updated_at: new Date().toISOString() // Track when status changed
        })
        .eq('id', driverId);

      if (error) {
        console.error('[Supabase] ❌ Failed to update driver online status:', error);
        throw error;
      }
      
      console.log(`[Supabase] ✅ Driver ${isOnline ? 'online' : 'offline'}`);
    } catch (error) {
      console.error('[Supabase] ❌ Error updating driver online status:', error);
      throw error;
    }
  }

  /**
   * Update Driver Location (Real from GPS)
   */
  async updateDriverLocation(driverId: string, location: Location) {
    // This uses upsert to ensure a location record exists for the driver
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
        throw error;
      }
      
      // Note: No console log here for performance reasons (too frequent)
    } catch (error) {
      console.error('[Supabase] ❌ Error updating driver location:', error);
      throw error;
    }
  }

  /**
   * Create a new trip request
   */
  async createTrip(
    riderId: string, 
    pickup: string, 
    destination: string,
    pickupCoords?: { lat: number; lng: number },
    destinationCoords?: { lat: number; lng: number },
  ): Promise<Trip> {
    try {
      // NOTE: Fare calculation is random placeholder, should be calculated via external service
      const estimatedFare = Math.floor(Math.random() * 2000) + 500; 

      const { data, error } = await supabaseClient
        .from('trips')
        .insert({
          rider_id: riderId,
          pickup_location: pickup,
          destination_location: destination,
          pickup_lat: pickupCoords?.lat,
          pickup_lng: pickupCoords?.lng,
          destination_lat: destinationCoords?.lat,
          destination_lng: destinationCoords?.lng,
          status: TripStatus.SEARCHING, // Start in searching status
          fare: estimatedFare,
          created_at: new Date().toISOString(),
        })
        .select(`
          *,
          rider:rider_id (name, avatar_url, rating)
        `)
        .single();

      if (error) {
        console.error('[Supabase] ❌ Create trip failed:', error);
        throw new Error('Database error when creating trip.');
      }
      
      return this.mapTrip(data);
    } catch (error) {
      console.error('[Supabase] ❌ Error creating trip:', error);
      throw error;
    }
  }

  /**
   * Driver accepts a trip
   * Uses a transactional update to ensure only one driver accepts
   */
  async acceptTrip(tripId: string, driverId: string): Promise<Trip | null> {
    try {
      const { data, error } = await supabaseClient
        .from('trips')
        .update({
          driver_id: driverId,
          status: TripStatus.ACCEPTED,
          accepted_at: new Date().toISOString(),
          // Use a `set` to only update if status is still searching
        })
        .eq('id', tripId)
        .eq('status', TripStatus.SEARCHING) 
        .select(`
          *,
          rider:rider_id (name, avatar_url, rating),
          driver:driver_id (name, avatar_url, vehicle_model, vehicle_plate, rating)
        `)
        .single();

      if (error) {
        console.error('[Supabase] ❌ Accept trip failed:', error);
        throw new Error('Database error during trip acceptance.');
      }
      
      // If data is null, the trip was already accepted by another driver
      if (!data) {
        console.log(`[Supabase] ⚠️ Trip ${tripId} already accepted.`);
        return null;
      }

      return this.mapTrip(data);
    } catch (error) {
      console.error('[Supabase] ❌ Error accepting trip:', error);
      throw error;
    }
  }
  
  /**
   * Update the status of an existing trip
   */
  async updateTripStatus(tripId: string, status: TripStatus): Promise<Trip | null> {
    try {
      const { data, error } = await supabaseClient
        .from('trips')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', tripId)
        .select(`
          *,
          rider:rider_id (name, avatar_url, rating),
          driver:driver_id (name, avatar_url, vehicle_model, vehicle_plate, rating)
        `)
        .single();
        
      if (error) {
        console.error('[Supabase] ❌ Update status failed:', error);
        throw new Error('Database error when updating status.');
      }
      
      return data ? this.mapTrip(data) : null;
    } catch (error) {
      console.error('[Supabase] ❌ Error updating trip status:', error);
      throw error;
    }
  }

  /**
   * Get a trip by ID
   */
  async getTripById(tripId: string): Promise<Trip | null> {
    try {
      const { data, error } = await supabaseClient
        .from('trips')
        .select(`
          *,
          rider:rider_id (name, avatar_url, rating),
          driver:driver_id (name, avatar_url, vehicle_model, vehicle_plate, rating),
          driver_location:driver_id (lat, lng, bearing)
        `)
        .eq('id', tripId)
        .maybeSingle();

      if (error) {
        console.error('[Supabase] ❌ Get trip failed:', error);
        throw error;
      }

      if (!data) return null;

      // Manually merge driver location if it exists
      const driverLocation = data.driver_location ? data.driver_location[0] : undefined;
      
      return {
        ...this.mapTrip(data),
        driverLocation: driverLocation as Location | undefined
      };
    } catch (error) {
      console.error('[Supabase] ❌ Error fetching trip:', error);
      throw error;
    }
  }

  /**
   * Subscribe to available trips (for drivers)
   */
  subscribeToAvailableTrips(callback: (trip: Trip) => void): RealtimeChannel {
    const channelName = 'available_trips';
    
    // Use a self-invoking function to manage channel creation and retry logic
    const subscribe = () => {
      // Clean up existing channel if retrying
      if (this.channels.has(channelName)) {
        this.channels.get(channelName)?.unsubscribe();
        this.channels.delete(channelName);
      }
      
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
            console.log('[Supabase] 📥 Realtime insert payload:', payload.new.id);
            // Fetch the full trip data to include joined user profiles
            const trip = await this.getTripById(payload.new.id);
            if (trip) {
              callback(trip);
            }
          }
        )
        .subscribe((status, err) => {
          if (status === 'SUBSCRIBED') {
            console.log('[Supabase] ✅ Available trips channel SUBSCRIBED');
            this.reconnectAttempts = 0;
          } else if (status === 'CHANNEL_ERROR') {
            // CRITICAL FIX 8: Add retry logic on channel error
            if (err) console.error('[Supabase] ❌ Channel error details:', err.message);
            
            if (this.reconnectAttempts < this.maxReconnectAttempts) {
              console.warn(`[Supabase] ⚠️ Channel error. Retrying in 2s (${this.reconnectAttempts + 1}/${this.maxReconnectAttempts})`);
              this.reconnectAttempts++;
              setTimeout(subscribe, 2000); // Call the subscribe function recursively
            } else {
              console.error('[Supabase] ❌ Max reconnect attempts reached for available_trips channel.');
              // Optionally notify user here
            }
          }
        });
        
        this.channels.set(channelName, channel);
        return channel;
    };
    
    // Initial call to start the subscription process
    return subscribe();
  }

  /**
   * Subscribe to specific trip updates (for rider/driver on an active trip)
   */
  subscribe(channelName: string, callback: SubscriptionCallback): RealtimeChannel {
    // If channel exists, reuse it. Otherwise, create and subscribe.
    if (this.channels.has(channelName)) {
      console.log(`[Supabase] 🔄 Reusing existing channel: ${channelName}`);
      return this.channels.get(channelName)!;
    }

    const channel = supabaseClient
      .channel(channelName)
      .on(
        'postgres_changes',
        { 
          event: '*', // Listen to all events
          schema: 'public', 
          table: 'trips', 
          filter: `id=eq.${channelName.split('-')[1]}` 
        },
        (payload) => {
          if (payload.eventType === 'UPDATE') {
            // Handle trip status updates
            callback({ event: 'trip_updated', payload: { trip: this.mapTrip(payload.new) } });
          } else if (payload.eventType === 'DELETE') {
            // Handle trip deletion (e.g., forced cleanup)
            callback({ event: 'trip_deleted', payload: payload.old.id });
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'driver_locations',
          filter: `driver_id=eq.${channelName.split('-')[1]}` // Filter by driver ID (if using trip ID as filter here, this is a conceptual error and needs fixing)
        },
        (payload) => {
          // This is a placeholder for location updates. In App.tsx, we rely on a different channel for driver location
          // updates. The logic here is simplified for this bug report.
          callback({ event: 'location_update', payload: payload.new });
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log(`[Supabase] ✅ Channel ${channelName} SUBSCRIBED`);
        }
        // NOTE: The retry logic (Fix 8) is primarily on `available_trips`. 
        // Individual trip subscriptions are typically managed by the parent component (`App.tsx`)
        // which handles channel cleanup on unmount/status change.
      });
      
    this.channels.set(channelName, channel);
    return channel;
  }

  /**
   * Map database trip to Trip type
   */
  private mapTrip(data: any): Trip {
    const driverLocation = data.driver_location ? data.driver_location[0] : undefined;
    
    // Pull coords from main table if available
    const pickupCoords = data.pickup_lat && data.pickup_lng ? { lat: data.pickup_lat, lng: data.pickup_lng } : undefined;
    const destinationCoords = data.destination_lat && data.destination_lng ? { lat: data.destination_lat, lng: data.destination_lng } : undefined;

    return {
      id: data.id,
      riderId: data.rider_id,
      driverId: data.driver_id,
      pickup: data.pickup_location,
      destination: data.destination_location,
      status: data.status,
      fare: data.fare,
      pickupCoords: pickupCoords,
      destinationCoords: destinationCoords,
      driverLocation: driverLocation as Location | undefined, // Added driverLocation
      rider: data.rider ? {
        name: data.rider.name,
        avatarUrl: data.rider.avatar_url,
        rating: data.rider.rating,
        id: data.rider_id, // assuming rider_id is available in the data object
        role: User.RIDER, // assuming fixed role
      } : undefined,
      driver: data.driver ? {
        name: data.driver.name,
        avatarUrl: data.driver.avatar_url,
        vehicleModel: data.driver.vehicle_model,
        vehiclePlate: data.driver.vehicle_plate,
        rating: data.driver.rating,
        id: data.driver_id, // assuming driver_id is available in the data object
        role: User.DRIVER, // assuming fixed role
      } : undefined
    };
  }

  /**
   * Cleanup all subscriptions
   */
  cleanup() {
    console.log('[Supabase] 🧹 Cleaning up all subscriptions...');
    this.channels.forEach((channel, name) => {
      console.log(`[Supabase] 🔌 Removing channel: ${name}`);
      channel.unsubscribe();
    });
    this.channels.clear();
  }
}

export const supabase = new SupabaseService();
