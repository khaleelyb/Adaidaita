import { ICE_SERVERS } from '../constants';
import { supabaseClient } from './supabaseClient';
import { v4 as uuidv4 } from 'uuid';

export class WebRTCService {
  private peerConnection: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;
  private tripId: string;
  private currentUserId: string;
  private targetUserId: string;
  private onRemoteStreamCallback: ((stream: MediaStream) => void) | null = null;
  private onCallEndCallback: (() => void) | null = null;
  private onIncomingCallCallback: (() => void) | null = null;
  
  // FIX 7: Use RTCIceCandidate for type safety
  private candidateQueue: RTCIceCandidate[] = []; 
  
  private channel: any = null;
  private isInitiator: boolean = false;
  private isChannelReady: boolean = false;
  private hasRemoteDescription: boolean = false;
  private isListening: boolean = false;
  
  // New properties for handling incoming call state
  private pendingOffer: any = null;
  private preAnswerCandidates: any[] = []; // Array of non-RTCIceCandidate objects (for signaling)

  constructor(tripId: string, currentUserId: string, targetUserId: string) {
    this.tripId = tripId;
    this.currentUserId = currentUserId;
    this.targetUserId = targetUserId;
    
    console.log('[WebRTC] 🚀 Initialized', {
      tripId,
      currentUserId: currentUserId.substring(0, 8),
      targetUserId: targetUserId.substring(0, 8)
    });
  }

  // --- Public Methods ---

  /**
   * Start listening for incoming signals (offers/answers/candidates)
   */
  public startListening(): Promise<void> {
    this.isListening = true;
    return this.setupSignalingChannel();
  }

  /**
   * Starts media streams and initiates the offer/call process.
   */
  public async initiateCall(): Promise<MediaStream> {
    this.isInitiator = true;
    const stream = await this.startLocalStream();
    this.localStream = stream;
    this.initPeerConnection();
    await this.setupSignalingChannel();
    await this.createOffer();
    return stream;
  }

  /**
   * Answers an incoming call offer.
   */
  public async answerCall(): Promise<MediaStream> {
    this.isInitiator = false;
    const stream = await this.startLocalStream();
    this.localStream = stream;
    this.initPeerConnection();
    
    if (this.pendingOffer) {
      await this.processSignal({ type: 'offer', sdp: this.pendingOffer.sdp });
    }
    
    // Process candidates that arrived before the answer
    this.preAnswerCandidates.forEach(candidate => {
      this.processSignal({ type: 'candidate', candidate });
    });
    this.preAnswerCandidates = [];
    this.pendingOffer = null;

    return stream;
  }
  
  /**
   * Cleanup method to release resources and stop listening
   */
  public destroy() {
    this.endCall(false); // End call without sending 'end' signal
    this.isListening = false;
    if (this.channel) {
      this.channel.unsubscribe();
      this.channel = null;
    }
    this.isChannelReady = false;
    console.log('[WebRTC] 🗑️ Service destroyed');
  }

  // --- Internal PeerConnection Setup ---

  private async startLocalStream(): Promise<MediaStream> {
    if (this.localStream) return this.localStream;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      return stream;
    } catch (error) {
      console.error('[WebRTC] ❌ Failed to get local media stream:', error);
      throw new Error('Failed to get camera and microphone access. Check permissions.');
    }
  }

  private initPeerConnection() {
    if (this.peerConnection) return;

    this.peerConnection = new RTCPeerConnection({
      iceServers: ICE_SERVERS, // Imported from constants
    });

    // 1. Add local tracks to the connection
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        this.peerConnection!.addTrack(track, this.localStream!);
      });
    }

    // 2. Handle remote track event
    this.peerConnection.ontrack = (event) => {
      console.log('[WebRTC] 🎵 Remote track received');
      if (event.streams && event.streams[0]) {
        this.remoteStream = event.streams[0];
        if (this.onRemoteStreamCallback) {
          this.onRemoteStreamCallback(event.streams[0]);
        }
      }
    };
    
    // 3. Gather ICE candidates
    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        console.log('[WebRTC] 📤 Sending ICE candidate');
        this.sendSignal('candidate', {
          candidate: event.candidate.candidate,
          sdpMid: event.candidate.sdpMid,
          sdpMLineIndex: event.candidate.sdpMLineIndex,
        });
      }
    };
    
    // 4. Handle ICE connection state changes
    this.peerConnection.oniceconnectionstatechange = () => {
      console.log(`[WebRTC] 🧊 ICE State: ${this.peerConnection!.iceConnectionState}`);
      if (
        this.peerConnection!.iceConnectionState === 'disconnected' || 
        this.peerConnection!.iceConnectionState === 'failed' ||
        this.peerConnection!.iceConnectionState === 'closed'
      ) {
        // Automatically end call on connection failure
        console.log('[WebRTC] ❌ Connection failed, ending call.');
        this.endCall(false);
      }
    };
  }

  // --- Signaling (SDP & ICE) ---

  private async createOffer() {
    try {
      const offer = await this.peerConnection!.createOffer();
      await this.peerConnection!.setLocalDescription(offer);
      
      console.log('[WebRTC] 📧 Sending offer');
      this.sendSignal('offer', { sdp: this.peerConnection!.localDescription!.sdp });
    } catch (error) {
      console.error('[WebRTC] ❌ Error creating offer:', error);
    }
  }

  private async createAnswer() {
    try {
      const answer = await this.peerConnection!.createAnswer();
      await this.peerConnection!.setLocalDescription(answer);
      
      console.log('[WebRTC] 📧 Sending answer');
      this.sendSignal('answer', { sdp: this.peerConnection!.localDescription!.sdp });
    } catch (error) {
      console.error('[WebRTC] ❌ Error creating answer:', error);
    }
  }

  private async processSignal(signal: any) {
    if (!this.peerConnection) {
      console.warn('[WebRTC] ⚠️ PeerConnection not initialized, dropping signal:', signal.type);
      return;
    }

    try {
      if (signal.type === 'offer') {
        if (this.isInitiator) {
          console.error('[WebRTC] ❌ Received offer as initiator, ignoring.');
          return;
        }
        
        console.log('[WebRTC] 📥 Received offer');
        const remoteDesc = new RTCSessionDescription({ type: 'offer', sdp: signal.sdp });
        await this.peerConnection.setRemoteDescription(remoteDesc);
        this.hasRemoteDescription = true;
        
        // If we are answering, proceed to create and send answer
        if (this.localStream) {
           await this.createAnswer();
           this.processCandidateQueue();
        } else {
          // If we haven't started local stream yet, wait to answer
          this.pendingOffer = signal;
          if (this.onIncomingCallCallback) {
            this.onIncomingCallCallback(); // Trigger the modal/answer UI
          }
        }
        
      } else if (signal.type === 'answer') {
        if (!this.isInitiator) {
          console.error('[WebRTC] ❌ Received answer as non-initiator, ignoring.');
          return;
        }

        console.log('[WebRTC] 📥 Received answer');
        const remoteDesc = new RTCSessionDescription({ type: 'answer', sdp: signal.sdp });
        await this.peerConnection.setRemoteDescription(remoteDesc);
        this.hasRemoteDescription = true;
        this.processCandidateQueue();
        
      } else if (signal.type === 'candidate') {
        const candidate = new RTCIceCandidate(signal.candidate);
        
        if (this.hasRemoteDescription) {
          console.log('[WebRTC] 📥 Adding immediate ICE candidate');
          await this.peerConnection.addIceCandidate(candidate);
        } else if (this.localStream) {
          // We've initiated PC but haven't set remote description yet, queue it.
          console.log('[WebRTC] 🧊 Queuing ICE candidate (waiting for SDP)');
          this.candidateQueue.push(candidate);
        } else {
          // No local stream yet (we are the receiver and waiting to answer)
          console.log('[WebRTC] 🧊 Queuing ICE candidate (pre-answer)');
          this.preAnswerCandidates.push(signal.candidate);
        }
        
      } else if (signal.type === 'end') {
        console.log('[WebRTC] 🛑 Received END signal, ending call.');
        this.endCall(false);
      }
    } catch (error) {
      console.error('[WebRTC] ❌ Error processing signal:', error);
    }
  }

  // CRITICAL FIX 7: Thread-Safe ICE Candidate Queue Processing
  private async processCandidateQueue() {
    if (this.candidateQueue.length === 0) return;
    
    // FIX: Copy the array before iteration and clear the original
    const queue = [...this.candidateQueue]; 
    this.candidateQueue = [];
    
    console.log(`[WebRTC] 🧊 Processing ${queue.length} queued candidates...`);
    
    for (const candidate of queue) {
      try {
        await this.peerConnection!.addIceCandidate(candidate);
      } catch (error) {
        console.error('[WebRTC] ❌ Error adding queued candidate:', error);
      }
    }
  }

  // --- Signaling Channel (Supabase Realtime) ---

  private setupSignalingChannel(): Promise<void> {
    return new Promise(async (resolve, reject) => {
      // Channel name uses both user IDs to ensure only the two parties communicate
      const channelName = `call-${this.tripId}-${this.currentUserId}-${this.targetUserId}`;
      const reversedChannelName = `call-${this.tripId}-${this.targetUserId}-${this.currentUserId}`;

      if (this.channel) {
        console.log('[WebRTC] 🔄 Signaling channel already set up.');
        resolve();
        return;
      }

      this.channel = supabaseClient
        .channel(channelName)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'call_signals',
            filter: `target_user_id=eq.${this.currentUserId}`
          },
          (payload: any) => {
            const signal = payload.new;
            if (signal.sender_user_id === this.targetUserId) {
              this.processSignal(signal.payload);
            } else {
              console.log('[WebRTC] ⚠️ Ignoring signal from unknown sender:', signal.sender_user_id);
            }
          }
        )
        .subscribe((status, err) => {
          if (status === 'SUBSCRIBED') {
            console.log('[WebRTC] ✅ Signaling channel SUBSCRIBED');
            this.isChannelReady = true;
            resolve();
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            console.error('[WebRTC] ❌ Channel error:', err);
            reject(err);
          }
        });
    });
  }

  private async sendSignal(type: string, payload: any) {
    if (!this.isChannelReady) {
      console.warn(`[WebRTC] ⚠️ Channel not ready, dropping signal: ${type}`);
      return;
    }

    try {
      const { error } = await supabaseClient
        .from('call_signals')
        .insert({
          id: uuidv4(),
          trip_id: this.tripId,
          sender_user_id: this.currentUserId,
          target_user_id: this.targetUserId,
          type: type,
          payload: payload,
          created_at: new Date().toISOString()
        });

      if (error) {
        console.error('[WebRTC] ❌ Failed to send signal:', error);
      }
    } catch (error) {
      console.error('[WebRTC] ❌ Exception while sending signal:', error);
    }
  }
  
  // --- Stream Control & Call Management ---
  
  public endCall(sendSignal: boolean = true) {
    console.log('[WebRTC] 📵 Ending call...', { sendSignal });

    if (sendSignal && this.isChannelReady) {
      this.sendSignal('end', {});
    }

    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        track.stop();
      });
      this.localStream = null;
    }

    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }

    this.remoteStream = null;
    this.candidateQueue = [];
    this.preAnswerCandidates = [];
    this.pendingOffer = null;
    this.hasRemoteDescription = false;

    console.log('[WebRTC] ✅ Call cleanup complete');

    if (this.onCallEndCallback) {
      this.onCallEndCallback();
    }
    
    // Keep listening for new calls if we are in listener mode
    if (this.isListening && !this.isInitiator && !this.isChannelReady) {
      console.log('[WebRTC] 🔄 Restarting listener...');
      this.setupSignalingChannel(); // Re-establish channel if it was closed
    }
  }

  // --- Callback Registration ---

  onRemoteStream(callback: (stream: MediaStream) => void) {
    this.onRemoteStreamCallback = callback;
  }
  
  onIncomingCall(callback: () => void) {
    this.onIncomingCallCallback = callback;
  }

  onCallEnd(callback: () => void) {
    this.onCallEndCallback = callback;
  }
}
