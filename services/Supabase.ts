import { RealtimeChannel } from '@supabase/supabase-js';
import { supabaseClient } from './supabaseClient';
import { INITIAL_MAP_CENTER } from '../constants';
import { Trip, TripStatus, Location } from '../types';

type SubscriptionCallback = (payload: any) => void;

class SupabaseService {
  private channels: Map<string, RealtimeChannel> = new Map();

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
   * Update Driver Location (Real from GPS)
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
        console.error('[Supabase] ❌ Failed to update driver location:', error);
      }
    } catch (error) {
      console.error('[Supabase] ❌ Error updating driver location:', error);
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
        async (payload) => {
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
  async createTrip(riderId: string, pickup: string, destination: string, pickupCoords?: Location, destinationCoords?: Location): Promise<Trip> {
    try {
      console.log('[Supabase] 🚗 Creating trip...', { riderId, pickup, destination });
      
      const fare = Math.floor(Math.random() * 2000) + 500; // Still simplified fare calc
      
      const { data, error } = await supabaseClient
        .from('trips')
        .insert({
          rider_id: riderId,
          pickup_location: pickup,
          destination_location: destination,
          status: TripStatus.SEARCHING,
          fare,
          pickup_lat: pickupCoords?.lat || INITIAL_MAP_CENTER.lat,
          pickup_lng: pickupCoords?.lng || INITIAL_MAP_CENTER.lng,
          dest_lat: destinationCoords?.lat || null,
          dest_lng: destinationCoords?.lng || null
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
      
      // Initialize driver location in DB to start tracking
      await this.initializeDriverLocation(driverId);

      return await this.getTripById(tripId);
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
   * Initialize driver location
   */
  private async initializeDriverLocation(driverId: string) {
    try {
      // Initialize with a default or current location if available
      // In a real app, the client would have already updated the location
      const { error } = await supabaseClient
        .from('driver_locations')
        .upsert({
          driver_id: driverId,
          lat: INITIAL_MAP_CENTER.lat, 
          lng: INITIAL_MAP_CENTER.lng,
          bearing: 0,
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
  }
}

export const supabase = new SupabaseService();
