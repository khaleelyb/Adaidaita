import { ICE_SERVERS } from '../constants';
import { supabase } from './Supabase';

export class WebRTCService {
  private peerConnection: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;
  private tripId: string;
  private currentUserId: string;
  private targetUserId: string;
  private onRemoteStreamCallback: ((stream: MediaStream) => void) | null = null;
  private onCallEndCallback: (() => void) | null = null;
  private candidateQueue: RTCIceCandidate[] = [];
  private subscription: { unsubscribe: () => void } | null = null;
  private isInitiator: boolean = false;

  constructor(tripId: string, currentUserId: string, targetUserId: string) {
    this.tripId = tripId;
    this.currentUserId = currentUserId;
    this.targetUserId = targetUserId;
    
    console.log('[WebRTC] Initialized', {
      tripId,
      currentUserId,
      targetUserId
    });
  }

  async startCall(isCaller: boolean): Promise<MediaStream> {
    this.isInitiator = isCaller;
    console.log(`[WebRTC] Starting call as ${isCaller ? 'CALLER' : 'RECEIVER'}`);

    // 1. Get Local Media
    try {
      console.log('[WebRTC] Requesting media devices...');
      this.localStream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user'
        }, 
        audio: {
          echoCancellation: true,
          noiseSuppression: true
        }
      });
      console.log('[WebRTC] ✅ Local stream obtained');
    } catch (e) {
      console.error('[WebRTC] ❌ Error accessing media:', e);
      throw new Error('Cannot access camera/microphone. Please check permissions.');
    }

    // 2. Create Peer Connection
    console.log('[WebRTC] Creating peer connection...');
    this.peerConnection = new RTCPeerConnection({ 
      iceServers: ICE_SERVERS,
      iceCandidatePoolSize: 10
    });
    console.log('[WebRTC] ✅ Peer connection created');

    // 3. Add Local Tracks
    console.log('[WebRTC] Adding local tracks...');
    this.localStream.getTracks().forEach(track => {
      if (this.localStream && this.peerConnection) {
        const sender = this.peerConnection.addTrack(track, this.localStream);
        console.log(`[WebRTC] Added ${track.kind} track:`, track.id);
      }
    });

    // 4. Handle Remote Stream
    this.peerConnection.ontrack = (event) => {
      console.log('[WebRTC] 📥 Received remote track:', event.track.kind);
      
      if (event.streams && event.streams[0]) {
        if (!this.remoteStream) {
          console.log('[WebRTC] ✅ Remote stream established');
          this.remoteStream = event.streams[0];
          if (this.onRemoteStreamCallback) {
            this.onRemoteStreamCallback(this.remoteStream);
          }
        }
      }
    };

    // 5. Handle ICE Candidates
    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        console.log('[WebRTC] 📤 Sending ICE candidate');
        supabase.send(
          `call-${this.tripId}`, 
          'candidate', 
          { candidate: event.candidate.toJSON() },
          this.currentUserId,
          this.targetUserId
        );
      } else {
        console.log('[WebRTC] ICE gathering complete');
      }
    };

    // 6. Connection State Monitoring
    this.peerConnection.oniceconnectionstatechange = () => {
      const state = this.peerConnection?.iceConnectionState;
      console.log('[WebRTC] ICE connection state:', state);
      
      if (state === 'disconnected' || state === 'failed' || state === 'closed') {
        console.warn('[WebRTC] Connection lost:', state);
        this.endCall();
      } else if (state === 'connected') {
        console.log('[WebRTC] ✅ ICE connection established');
      }
    };

    this.peerConnection.onconnectionstatechange = () => {
      const state = this.peerConnection?.connectionState;
      console.log('[WebRTC] Connection state:', state);
      
      if (state === 'connected') {
        console.log('[WebRTC] ✅ Peer connection established');
      }
    };

    this.peerConnection.onsignalingstatechange = () => {
      console.log('[WebRTC] Signaling state:', this.peerConnection?.signalingState);
    };

    // 7. Setup Signaling Listeners BEFORE creating offer/answer
    console.log('[WebRTC] Setting up signaling channel...');
    this.subscription = supabase.subscribeToSignaling(
      `call-${this.tripId}`, 
      this.currentUserId,
      async ({ event, payload, from }) => {
        console.log(`[WebRTC] 📨 Received signal: ${event} from ${from}`);
        
        if (!this.peerConnection) {
          console.warn('[WebRTC] Received signal but no peer connection');
          return;
        }

        try {
          if (event === 'offer' && !this.isInitiator) {
            console.log('[WebRTC] 📥 Processing offer...');
            
            if (this.peerConnection.signalingState !== 'stable') {
              console.warn('[WebRTC] Not in stable state, ignoring offer');
              return;
            }

            await this.peerConnection.setRemoteDescription(
              new RTCSessionDescription(payload.sdp)
            );
            console.log('[WebRTC] ✅ Remote description set (offer)');
            
            // Process queued candidates
            await this.processCandidateQueue();
            
            // Create answer
            console.log('[WebRTC] Creating answer...');
            const answer = await this.peerConnection.createAnswer();
            await this.peerConnection.setLocalDescription(answer);
            console.log('[WebRTC] ✅ Local description set (answer)');
            
            // Send answer
            console.log('[WebRTC] 📤 Sending answer...');
            await supabase.send(
              `call-${this.tripId}`, 
              'answer', 
              { sdp: answer },
              this.currentUserId,
              this.targetUserId
            );
            console.log('[WebRTC] ✅ Answer sent');
          } 
          else if (event === 'answer' && this.isInitiator) {
            console.log('[WebRTC] 📥 Processing answer...');
            
            if (this.peerConnection.signalingState === 'stable') {
              console.warn('[WebRTC] Already in stable state, ignoring answer');
              return;
            }

            await this.peerConnection.setRemoteDescription(
              new RTCSessionDescription(payload.sdp)
            );
            console.log('[WebRTC] ✅ Remote description set (answer)');
            
            // Process queued candidates
            await this.processCandidateQueue();
          } 
          else if (event === 'candidate') {
            console.log('[WebRTC] 📥 Received ICE candidate');
            
            const candidate = new RTCIceCandidate(payload.candidate);
            
            if (this.peerConnection.remoteDescription && 
                this.peerConnection.remoteDescription.type) {
              try {
                await this.peerConnection.addIceCandidate(candidate);
                console.log('[WebRTC] ✅ ICE candidate added');
              } catch (e) {
                console.error('[WebRTC] ❌ Error adding ICE candidate:', e);
              }
            } else {
              console.log('[WebRTC] Queueing ICE candidate (no remote description yet)');
              this.candidateQueue.push(candidate);
            }
          }
          else if (event === 'end') {
            console.log('[WebRTC] 📞 Call ended by remote peer');
            this.endCall(false);
          }
        } catch (err) {
          console.error(`[WebRTC] ❌ Error handling ${event}:`, err);
        }
      }
    );

    // Small delay to ensure signaling is ready
    await new Promise(resolve => setTimeout(resolve, 500));

    // 8. If Caller, Create and Send Offer
    if (isCaller) {
      try {
        console.log('[WebRTC] Creating offer...');
        const offer = await this.peerConnection.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: true
        });
        
        await this.peerConnection.setLocalDescription(offer);
        console.log('[WebRTC] ✅ Local description set (offer)');
        
        console.log('[WebRTC] 📤 Sending offer...');
        await supabase.send(
          `call-${this.tripId}`, 
          'offer', 
          { sdp: offer },
          this.currentUserId,
          this.targetUserId
        );
        console.log('[WebRTC] ✅ Offer sent');
      } catch (err) {
        console.error('[WebRTC] ❌ Error creating/sending offer:', err);
        throw err;
      }
    } else {
      console.log('[WebRTC] Waiting for offer from caller...');
    }

    return this.localStream;
  }

  private async processCandidateQueue() {
    if (!this.peerConnection) return;
    
    console.log(`[WebRTC] Processing ${this.candidateQueue.length} queued candidates...`);

    const queue = [...this.candidateQueue];
    this.candidateQueue = [];

    for (const candidate of queue) {
      try {
        if (this.peerConnection.remoteDescription) {
          await this.peerConnection.addIceCandidate(candidate);
          console.log('[WebRTC] ✅ Queued candidate added');
        } else {
          console.warn('[WebRTC] Cannot add candidate - no remote description');
          this.candidateQueue.push(candidate);
        }
      } catch (e) {
        console.error('[WebRTC] ❌ Error adding queued candidate:', e);
      }
    }
  }

  onRemoteStream(callback: (stream: MediaStream) => void) {
    this.onRemoteStreamCallback = callback;
  }

  onCallEnd(callback: () => void) {
    this.onCallEndCallback = callback;
  }

  endCall(emitSignal: boolean = true) {
    console.log('[WebRTC] Ending call...', { emitSignal });

    if (emitSignal && this.peerConnection) {
      console.log('[WebRTC] 📤 Sending end signal...');
      supabase.send(
        `call-${this.tripId}`, 
        'end', 
        {},
        this.currentUserId,
        this.targetUserId
      ).catch(err => console.error('[WebRTC] Failed to send end signal:', err));
    }

    // Stop local stream
    if (this.localStream) {
      console.log('[WebRTC] Stopping local stream...');
      this.localStream.getTracks().forEach(track => {
        track.stop();
        console.log(`[WebRTC] Stopped ${track.kind} track`);
      });
    }

    // Close peer connection
    if (this.peerConnection) {
      console.log('[WebRTC] Closing peer connection...');
      this.peerConnection.close();
    }

    // Unsubscribe from signaling
    if (this.subscription) {
      console.log('[WebRTC] Unsubscribing from signaling...');
      this.subscription.unsubscribe();
    }

    // Clear state
    this.peerConnection = null;
    this.localStream = null;
    this.remoteStream = null;
    this.candidateQueue = [];

    console.log('[WebRTC] ✅ Call cleanup complete');

    // Trigger callback
    if (this.onCallEndCallback) {
      this.onCallEndCallback();
    }
  }
              }
