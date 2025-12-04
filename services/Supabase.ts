import { RealtimeChannel } from '@supabase/supabase-js';
import { supabaseClient } from './supabaseClient';
import { INITIAL_MAP_CENTER } from '../constants';
import { Trip, TripStatus } from '../types';

type SubscriptionCallback = (payload: any) => void;

class SupabaseService {
  private channels: Map<string, RealtimeChannel> = new Map();
  private locationInterval: any = null;

  subscribe(channelName: string, callback: SubscriptionCallback) {
    const tripId = channelName.replace('trip-', '').replace('call-', '');
    
    const channel = supabaseClient
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'trips',
          filter: `id=eq.${tripId}`
        },
        async (payload) => {
          const trip = await this.getTripById(tripId);
          if (trip) {
            callback({
              event: 'trip_accepted',
              payload: { trip }
            });
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
      .subscribe();

    this.channels.set(channelName, channel);

    return {
      unsubscribe: () => {
        const ch = this.channels.get(channelName);
        if (ch) {
          supabaseClient.removeChannel(ch);
          this.channels.delete(channelName);
        }
      }
    };
  }

  async createTrip(riderProfileId: string, pickup: string, destination: string): Promise<Trip> {
    const fare = Math.floor(Math.random() * 2000) + 500;
    
    // Get the actual authenticated user ID
    const { data: { session } } = await supabaseClient.auth.getSession();
    
    if (!session?.user) {
      throw new Error("You must be logged in to request a ride.");
    }

    console.log("Creating trip...", {
      authUserId: session.user.id,
      profileId: riderProfileId
    });

    // Try inserting with the Auth User ID first (Common RLS pattern: auth.uid() = rider_id)
    // We ignore the passed 'riderProfileId' for the INSERT to satisfy potential RLS policies 
    // that check against auth.uid(). 
    // If the database actually requires the Profile ID, this might need a schema adjustment or 
    // the RLS policy should be: rider_id IN (select id from users where auth_user_id = auth.uid())
    const { data, error } = await supabaseClient
      .from('trips')
      .insert({
        rider_id: session.user.id, // Using Auth ID to pass RLS
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
      console.error('Error creating trip with Auth ID:', error);
      
      // Fallback: If FK violation (e.g. rider_id must be profile ID), try using profile ID
      // This only works if RLS allows it.
      if (error.code === '23503') { // Foreign key violation
         console.warn("Auth ID failed FK check. Retrying with Profile ID...");
         const { data: retryData, error: retryError } = await supabaseClient
          .from('trips')
          .insert({
            rider_id: riderProfileId,
            pickup_location: pickup,
            destination_location: destination,
            status: TripStatus.SEARCHING,
            fare,
            pickup_lat: INITIAL_MAP_CENTER.lat,
            pickup_lng: INITIAL_MAP_CENTER.lng
          })
          .select()
          .single();
          
          if (retryError) throw retryError;
          // Auto-assign driver after 3 seconds
          setTimeout(() => this.autoAssignDriver(retryData.id), 3000);
          return this.mapTrip(retryData);
      }

      throw error;
    }

    // Auto-assign driver after 3 seconds
    setTimeout(() => this.autoAssignDriver(data.id), 3000);

    return this.mapTrip(data);
  }

  async updateTripStatus(tripId: string, status: TripStatus): Promise<Trip | null> {
    const { data, error } = await supabaseClient
      .from('trips')
      .update({ status })
      .eq('id', tripId)
      .select()
      .single();

    if (error) {
      console.error('Error updating trip:', error);
      return null;
    }

    if (status === TripStatus.COMPLETED || status === TripStatus.IDLE) {
      this.stopLocationUpdates();
    }

    return this.mapTrip(data);
  }

  private async getTripById(tripId: string): Promise<Trip | null> {
    const { data, error } = await supabaseClient
      .from('trips')
      .select('*')
      .eq('id', tripId)
      .single();

    if (error) {
      console.error('Error fetching trip:', error);
      return null;
    }
    
    return this.mapTrip(data);
  }

  private async autoAssignDriver(tripId: string) {
    // In a real app, this would be backend logic finding an available driver
    // For this demo, we'll try to find an existing driver or use a placeholder
    const driverId = '22222222-2222-2222-2222-222222222222';
    
    const { error } = await supabaseClient
      .from('trips')
      .update({
        driver_id: driverId,
        status: TripStatus.ACCEPTED
      })
      .eq('id', tripId);

    if (error) {
      console.error('Error assigning driver:', error);
      return;
    }

    console.log('✅ Driver assigned to trip:', tripId);

    await this.initializeDriverLocation(driverId);
    this.startLocationUpdates(driverId);
  }

  private async initializeDriverLocation(driverId: string) {
    const startLat = INITIAL_MAP_CENTER.lat - 0.002;
    const startLng = INITIAL_MAP_CENTER.lng - 0.002;

    const { error } = await supabaseClient
      .from('driver_locations')
      .upsert({
        driver_id: driverId,
        lat: startLat,
        lng: startLng,
        bearing: 45
      });

    if (error) {
      console.error('Error initializing driver location:', error);
    }
  }

  private startLocationUpdates(driverId: string) {
    if (this.locationInterval) {
      clearInterval(this.locationInterval);
    }

    let lat = INITIAL_MAP_CENTER.lat - 0.002;
    let lng = INITIAL_MAP_CENTER.lng - 0.002;
    let heading = 45;

    this.locationInterval = setInterval(async () => {
      const speed = 0.00015;
      const steering = (Math.random() - 0.5) * 20;
      heading = (heading + steering + 360) % 360;

      const rad = (90 - heading) * (Math.PI / 180);
      lat += Math.sin(rad) * speed;
      lng += Math.cos(rad) * speed;

      const { error } = await supabaseClient
        .from('driver_locations')
        .upsert({
          driver_id: driverId,
          lat,
          lng,
          bearing: heading
        });

      if (error) {
        console.error('Error updating location:', error);
      }
    }, 1000);
  }

  private stopLocationUpdates() {
    if (this.locationInterval) {
      clearInterval(this.locationInterval);
      this.locationInterval = null;
    }
  }

  private mapTrip(data: any): Trip {
    return {
      id: data.id,
      riderId: data.rider_id,
      driverId: data.driver_id,
      pickup: data.pickup_location,
      destination: data.destination_location,
      status: data.status,
      fare: data.fare,
      driverLocation: data.driver_lat ? {
        lat: parseFloat(data.driver_lat),
        lng: parseFloat(data.driver_lng),
        bearing: parseFloat(data.driver_bearing || 0)
      } : undefined
    };
  }

  // WebRTC Signaling
  send(channelName: string, event: string, payload: any) {
    if (channelName.startsWith('call-')) {
      const tripId = channelName.replace('call-', '');
      
      supabaseClient.from('call_signals').insert({
        trip_id: tripId,
        signal_type: event,
        signal_data: payload,
        from_user_id: '11111111-1111-1111-1111-111111111111',
        to_user_id: '22222222-2222-2222-2222-222222222222'
      }).then(({ error }) => {
        if (error) console.error('Error sending signal:', error);
      });
    }
  }
}

export const supabase = new SupabaseService();
