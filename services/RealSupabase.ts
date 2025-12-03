import { createClient } from '@supabase/supabase-js';
import { SUPABASE_CONFIG } from '../constants';
import { Trip, TripStatus, Location } from '../types';

// Initialize real Supabase client
const supabase = createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);

export class RealSupabase {
  // Subscribe to realtime changes
  subscribe(channelName: string, callback: (data: any) => void) {
    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', 
        { 
          event: '*', 
          schema: 'public',
          table: 'trips' 
        }, 
        (payload) => {
          callback(payload);
        }
      )
      .subscribe();

    return {
      unsubscribe: () => {
        supabase.removeChannel(channel);
      }
    };
  }

  // Create a new trip
  async createTrip(riderId: string, pickup: string, destination: string): Promise<Trip> {
    const fare = Math.floor(Math.random() * 2000) + 500;
    
    const { data, error } = await supabase
      .from('trips')
      .insert({
        rider_id: riderId,
        pickup_location: pickup,
        destination_location: destination,
        status: TripStatus.SEARCHING,
        fare
      })
      .select()
      .single();

    if (error) throw error;

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

  // Update trip status
  async updateTripStatus(tripId: string, status: TripStatus): Promise<Trip | null> {
    const { data, error } = await supabase
      .from('trips')
      .update({ status })
      .eq('id', tripId)
      .select()
      .single();

    if (error) {
      console.error('Error updating trip:', error);
      return null;
    }

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

  // Update driver location
  async updateDriverLocation(driverId: string, location: Location) {
    const { error } = await supabase
      .from('driver_locations')
      .upsert({
        driver_id: driverId,
        lat: location.lat,
        lng: location.lng,
        bearing: location.bearing || 0
      });

    if (error) {
      console.error('Error updating location:', error);
    }
  }
}

export const realSupabase = new RealSupabase();
