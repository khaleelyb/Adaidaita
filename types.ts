export enum UserRole {
  RIDER = 'RIDER',
  DRIVER = 'DRIVER',
}

export enum TripStatus {
  IDLE = 'IDLE',
  SEARCHING = 'SEARCHING',
  ACCEPTED = 'ACCEPTED',
  ARRIVED = 'ARRIVED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  avatarUrl?: string;
  // Driver specific fields (optional on User base type for convenience)
  vehicleModel?: string;
  vehiclePlate?: string;
  rating?: number;
}

export interface Location {
  lat: number;
  lng: number;
  bearing?: number;
}

export interface Driver extends User {
  vehicleModel: string;
  vehiclePlate: string;
  rating: number;
  location: Location;
  isOnline: boolean;
}

export interface Trip {
  id: string;
  riderId: string;
  driverId?: string;
  pickup: string;
  destination: string;
  status: TripStatus;
  fare: number;
  driverLocation?: Location;
  
  // Expanded details
  rider?: {
    name: string;
    avatarUrl?: string;
    rating?: number;
    phone?: string;
  };
  driver?: {
    name: string;
    avatarUrl?: string;
    vehicleModel?: string;
    vehiclePlate?: string;
    rating?: number;
    phone?: string;
  };
}

export interface WebRTCMessage {
  type: 'offer' | 'answer' | 'candidate' | 'end';
  payload: any;
}

// Add global OneSignal type definition
declare global {
  interface Window {
    OneSignalDeferred: any[];
    OneSignal: any;
  }
}
