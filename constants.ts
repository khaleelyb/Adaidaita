import { UserRole } from './types';

export const APP_NAME = "Adaidaita";

// Median.co / WebRTC TURN Configuration
export const ICE_SERVERS = [
  { urls: 'stun:global.stun.median.co:3478' },
];

// Supabase Configuration
export const SUPABASE_CONFIG = {
  url: "https://bqvhiorqxiomjinlngtv.supabase.co",
  anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJxdmhpb3JxeGlvbWppbmxuZ3R2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ3ODM3NzcsImV4cCI6MjA4MDM1OTc3N30.hbJ0a5JIQJ4RFR8E5U9P4dwPChpB9XJzl4a_NjkOnBA"
};

// OneSignal Push Notifications
export const ONE_SIGNAL_APP_ID = "c4cf2adf-2e4c-44d8-abd0-d7536ba28fd6";

// Initial map center (Kano, Nigeria)
export const INITIAL_MAP_CENTER = {
  lat: 12.0022,
  lng: 8.5920 
};
