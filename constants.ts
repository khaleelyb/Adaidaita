export const APP_NAME = "Adaidaita";

// Median.co / WebRTC TURN Configuration
export const ICE_SERVERS = [
  { urls: 'stun:global.stun.median.co:3478' },
  // In a real app, you would fetch these creds from your secure backend API
  // {
  //   urls: 'turn:global.turn.median.co:3478',
  //   username: 'MEDIAN_USERNAME',
  //   credential: 'MEDIAN_PASSWORD'
  // }
];

export const SUPABASE_CONFIG = {
  url: "https://bqvhiorqxiomjinlngtv.supabase.co",
  anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJxdmhpb3JxeGlvbWppbmxuZ3R2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ3ODM3NzcsImV4cCI6MjA4MDM1OTc3N30.hbJ0a5JIQJ4RFR8E5U9P4dwPChpB9XJzl4a_NjkOnBA"
};

export const ONE_SIGNAL_APP_ID = "c4cf2adf-2e4c-44d8-abd0-d7536ba28fd6";

export const MOCK_RIDER_USER = {
  id: 'rider-123',
  email: 'rider@adaidaita.com',
  name: 'Alice Rider',
  role: 'RIDER',
  avatarUrl: 'https://picsum.photos/200'
};

export const MOCK_DRIVER_USER = {
  id: 'driver-456',
  email: 'driver@adaidaita.com',
  name: 'Bob Driver',
  role: 'DRIVER',
  vehicleModel: 'Toyota Corolla',
  vehiclePlate: 'KAN-552',
  rating: 4.8,
  avatarUrl: 'https://picsum.photos/201'
};

// Initial map center (e.g., Lagos or Kano)
export const INITIAL_MAP_CENTER = {
  lat: 12.0022,
  lng: 8.5920 
};