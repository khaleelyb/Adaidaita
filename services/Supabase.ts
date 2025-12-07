import { RealtimeChannel } from '@supabase/supabase-js';
import { supabaseClient } from './supabaseClient';
import { INITIAL_MAP_CENTER } from '../constants';
import { Trip, TripStatus, Location } from '../types';

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
        }, {
          onConflict: 'driver_id' // Specify conflict target
        });
        
      if (error) {
        console.error('[Supabase] ❌ Failed to update driver location:', error);
      }
    } catch (error) {
      console.error('[Supabase] ❌ Error updating driver location:', error);
    }
  }

  /**
   * CRITICAL FIX #2: Improved subscription with proper cleanup and error handling
   * Subscribe to available trips (for Drivers)
   */
  subscribeToAvailableTrips(callback: (trip: Trip) => void) {
    const channelName = 'available-trips';
    console.log('[Supabase] 📡 Subscribing to available trips...');

    // Clean up existing subscription first
    if (this.channels.has(channelName)) {
      console.log('[Supabase] 🧹 Cleaning up existing subscription');
      const oldChannel = this.channels.get(channelName)!;
      supabaseClient.removeChannel(oldChannel);
      this.channels.delete(channelName);
    }

    // 1. Fetch any existing pending trips FIRST
    this.fetchExistingPendingTrips(callback);

    // 2. Set up realtime subscription for NEW trips
    const channel = supabaseClient
      .channel(channelName, {
        config: {
          broadcast: { self: false }
        }
      })
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'trips',
          filter: `status=eq.${TripStatus.SEARCHING}`
        },
        async (payload) => {
          console.log('[Supabase] 🔔 New trip INSERT detected:', payload);
          if (payload.new && payload.new.id) {
            // Fetch full trip details with relationships
            const fullTrip = await this.getTripById(payload.new.id);
            if (fullTrip && fullTrip.status === TripStatus.SEARCHING) {
              console.log('[Supabase] ✅ Notifying driver of new trip:', fullTrip.id);
              callback(fullTrip);
            }
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'trips',
          filter: `status=eq.${TripStatus.SEARCHING}`
        },
        async (payload) => {
          console.log('[Supabase] 🔄 Trip UPDATE to SEARCHING detected:', payload);
          // Handle case where trip was modified back to SEARCHING
          if (payload.new && payload.new.id && payload.new.status === TripStatus.SEARCHING) {
            const fullTrip = await this.getTripById(payload.new.id);
            if (fullTrip) {
              console.log('[Supabase] ✅ Notifying driver of updated trip:', fullTrip.id);
              callback(fullTrip);
            }
          }
        }
      )
      .subscribe((status, err) => {
        console.log(`[Supabase] 📡 Channel '${channelName}' status:`, status);
        
        if (err) {
          console.error(`[Supabase] ❌ Channel error:`, err);
        }

        if (status === 'SUBSCRIBED') {
          console.log('[Supabase] ✅ Successfully subscribed to available trips');
          this.reconnectAttempts = 0;
        } else if (status === 'CHANNEL_ERROR') {
          console.error('[Supabase] ❌ Channel error - attempting reconnect...');
          this.handleReconnect(() => this.subscribeToAvailableTrips(callback));
        } else if (status === 'TIMED_OUT') {
          console.error('[Supabase] ⏰ Channel timed out - attempting reconnect...');
          this.handleReconnect(() => this.subscribeToAvailableTrips(callback));
        }
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
   * CRITICAL FIX #3: Separate method to fetch existing trips
   */
  private async fetchExistingPendingTrips(callback: (trip: Trip) => void) {
    try {
      console.log('[Supabase] 🔍 Checking for existing pending trips...');
      
      const { data, error } = await supabaseClient
        .from('trips')
        .select('id')
        .eq('status', TripStatus.SEARCHING)
        .is('driver_id', null) // Only unassigned trips
        .order('created_at', { ascending: false })
        .limit(1);

      if (error) {
        console.error('[Supabase] ❌ Failed to fetch existing trips:', error);
        return;
      }

      if (data && data.length > 0) {
        console.log('[Supabase] 📥 Found existing pending trip:', data[0].id);
        const fullTrip = await this.getTripById(data[0].id);
        
        // Double-check it's still available
        if (fullTrip && fullTrip.status === TripStatus.SEARCHING && !fullTrip.driverId) {
          console.log('[Supabase] ✅ Notifying driver of existing trip');
          callback(fullTrip);
        }
      } else {
        console.log('[Supabase] ℹ️ No existing pending trips found');
      }
    } catch (err) {
      console.error('[Supabase] ❌ Error fetching existing trips:', err);
    }
  }

  /**
   * CRITICAL FIX #4: Improved trip subscription with better error handling
   */
  subscribe(channelName: string, callback: SubscriptionCallback) {
    console.log(`[Supabase] 📡 Subscribing to ${channelName}`);
    
    // Clean up existing channel
    if (this.channels.has(channelName)) {
      const oldChannel = this.channels.get(channelName)!;
      supabaseClient.removeChannel(oldChannel);
      this.channels.delete(channelName);
    }

    const channel = supabaseClient
      .channel(channelName, {
        config: {
          broadcast: { self: false }
        }
      })
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'trips'
        },
        async (payload) => {
          console.log('[Supabase] 🔄 Trip UPDATE received:', payload);
          if (payload.new && payload.new.id) {
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
          event: '*', // Listen to all events on driver_locations
          schema: 'public',
          table: 'driver_locations'
        },
        (payload) => {
          console.log('[Supabase] 📍 Driver location UPDATE:', payload);
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
      .subscribe((status, err) => {
        console.log(`[Supabase] 📡 Channel ${channelName} status:`, status);
        
        if (err) {
          console.error(`[Supabase] ❌ Subscription error:`, err);
        }

        if (status === 'SUBSCRIBED') {
          console.log(`[Supabase] ✅ Successfully subscribed to ${channelName}`);
          this.reconnectAttempts = 0;
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.error(`[Supabase] ❌ Channel ${status} - attempting reconnect...`);
          this.handleReconnect(() => this.subscribe(channelName, callback));
        }
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
   * CRITICAL FIX #5: Reconnection logic with exponential backoff
   */
  private handleReconnect(retryFn: () => void) {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[Supabase] ❌ Max reconnection attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 10000);
    
    console.log(`[Supabase] 🔄 Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
    
    setTimeout(() => {
      console.log('[Supabase] 🔄 Attempting reconnection...');
      retryFn();
    }, delay);
  }

  /**
   * CRITICAL FIX #6: Optimistic locking for trip acceptance
   * Create a new trip request
   */
  async createTrip(
    riderId: string, 
    pickup: string, 
    destination: string, 
    pickupCoords?: Location, 
    destinationCoords?: Location
  ): Promise<Trip> {
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
          pickup_lat: pickupCoords?.lat || INITIAL_MAP_CENTER.lat,
          pickup_lng: pickupCoords?.lng || INITIAL_MAP_CENTER.lng,
          created_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) {
        console.error('[Supabase] ❌ Trip creation failed:', error);
        throw new Error(`Failed to create trip: ${error.message}`);
      }

      console.log('[Supabase] ✅ Trip created successfully:', data.id);
      
      const fullTrip = await this.getTripById(data.id);
      return fullTrip || this.mapTrip(data);
    } catch (error: any) {
      console.error('[Supabase] ❌ Create trip error:', error);
      throw error;
    }
  }

  /**
   * CRITICAL FIX #7: Race condition prevention with optimistic locking
   * Driver accepts a trip - prevents double booking
   */
  async acceptTrip(tripId: string, driverId: string): Promise<Trip | null> {
    try {
      console.log('[Supabase] 🤝 Accepting trip...', { tripId, driverId });

      // Use a database transaction-like approach with filter
      const { data, error } = await supabaseClient
        .from('trips')
        .update({
          driver_id: driverId,
          status: TripStatus.ACCEPTED,
          accepted_at: new Date().toISOString()
        })
        .eq('id', tripId)
        .is('driver_id', null) // CRITICAL: Only update if no driver assigned yet
        .eq('status', TripStatus.SEARCHING) // CRITICAL: Only if still searching
        .select()
        .maybeSingle(); // Use maybeSingle instead of single to handle no match

      if (error) {
        console.error('[Supabase] ❌ Accept trip failed:', error);
        return null;
      }

      if (!data) {
        console.warn('[Supabase] ⚠️ Trip already accepted by another driver or no longer available');
        return null;
      }

      console.log('[Supabase] ✅ Trip accepted successfully:', data);
      
      // Initialize driver location
      await this.initializeDriverLocation(driverId);

      return await this.getTripById(tripId);
    } catch (error) {
      console.error('[Supabase] ❌ Accept trip error:', error);
      return null;
    }
  }

  /**
   * Update trip status with proper error handling
   */
  async updateTripStatus(tripId: string, status: TripStatus): Promise<Trip | null> {
    try {
      console.log('[Supabase] 🔄 Updating trip status...', { tripId, status });
      
      const updateData: any = { 
        status,
        updated_at: new Date().toISOString()
      };
      
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

      console.log('[Supabase] ✅ Trip status updated:', data.status);
      return await this.getTripById(tripId);
    } catch (error) {
      console.error('[Supabase] ❌ Update trip status error:', error);
      return null;
    }
  }

  /**
   * Get trip by ID with full relationships
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
   * Initialize driver location with current position
   */
  private async initializeDriverLocation(driverId: string) {
    try {
      const { error } = await supabaseClient
        .from('driver_locations')
        .upsert({
          driver_id: driverId,
          lat: INITIAL_MAP_CENTER.lat, 
          lng: INITIAL_MAP_CENTER.lng,
          bearing: 0,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'driver_id'
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
    console.log('[Supabase] 🧹 Cleaning up all subscriptions...');
    this.channels.forEach((channel, name) => {
      console.log(`[Supabase] 🔌 Removing channel: ${name}`);
      supabaseClient.removeChannel(channel);
    });
    this.channels.clear();
    this.reconnectAttempts = 0;
  }
}

export const supabase = new SupabaseService();
