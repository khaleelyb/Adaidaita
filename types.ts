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
}

export interface WebRTCMessage {
  type: 'offer' | 'answer' | 'candidate' | 'end';
  payload: any;
}