import { ICE_SERVERS } from '../constants';
import { supabaseClient } from './supabaseClient';

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
  private channel: any = null;
  private isInitiator: boolean = false;
  private isChannelReady: boolean = false;
  private hasRemoteDescription: boolean = false;

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

  async startCall(isCaller: boolean): Promise<MediaStream> {
    this.isInitiator = isCaller;
    console.log(`[WebRTC] 📞 Starting call as ${isCaller ? 'CALLER' : 'RECEIVER'}`);

    // 1. Get Local Media FIRST
    try {
      console.log('[WebRTC] 🎥 Requesting media devices...');
      this.localStream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user'
        }, 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      console.log('[WebRTC] ✅ Local stream obtained');
    } catch (e: any) {
      console.error('[WebRTC] ❌ Media access error:', e);
      throw new Error('Cannot access camera/microphone. Please grant permissions and try again.');
    }

    // 2. Setup Signaling Channel
    await this.setupSignalingChannel();

    // 3. Create Peer Connection
    console.log('[WebRTC] 🔗 Creating peer connection...');
    this.peerConnection = new RTCPeerConnection({ 
      iceServers: ICE_SERVERS,
      iceCandidatePoolSize: 10,
      bundlePolicy: 'max-bundle',
      rtcpMuxPolicy: 'require'
    });

    // 4. Add Local Tracks
    this.localStream.getTracks().forEach(track => {
      if (this.localStream && this.peerConnection) {
        this.peerConnection.addTrack(track, this.localStream);
        console.log(`[WebRTC] ➕ Added ${track.kind} track`);
      }
    });

    // 5. Handle Remote Stream
    this.remoteStream = new MediaStream();
    this.peerConnection.ontrack = (event) => {
      console.log('[WebRTC] 📥 Received remote track:', event.track.kind);
      
      event.track.onunmute = () => {
        console.log('[WebRTC] 🔊 Track unmuted:', event.track.kind);
        if (!this.remoteStream) {
          this.remoteStream = new MediaStream();
        }
        this.remoteStream.addTrack(event.track);
        
        if (this.onRemoteStreamCallback && this.remoteStream.getTracks().length > 0) {
          console.log('[WebRTC] 🎉 Remote stream ready with', this.remoteStream.getTracks().length, 'tracks');
          this.onRemoteStreamCallback(this.remoteStream);
        }
      };
      
      // Also add track immediately
      if (this.remoteStream) {
        this.remoteStream.addTrack(event.track);
      }
    };

    // 6. Handle ICE Candidates
    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        console.log('[WebRTC] 📤 Sending ICE candidate');
        this.sendSignal('candidate', {
          candidate: event.candidate.toJSON()
        });
      } else {
        console.log('[WebRTC] ✅ ICE gathering complete');
      }
    };

    // 7. Monitor Connection States
    this.peerConnection.oniceconnectionstatechange = () => {
      const state = this.peerConnection?.iceConnectionState;
      console.log('[WebRTC] 🔌 ICE state:', state);
      
      if (state === 'connected' || state === 'completed') {
        console.log('[WebRTC] ✅ Peer-to-peer connection established!');
      } else if (state === 'disconnected') {
        console.warn('[WebRTC] ⚠️ Connection disconnected, waiting for reconnection...');
      } else if (state === 'failed') {
        console.error('[WebRTC] ❌ Connection failed');
        this.endCall();
      } else if (state === 'closed') {
        console.log('[WebRTC] 🔒 Connection closed');
      }
    };

    this.peerConnection.onconnectionstatechange = () => {
      const state = this.peerConnection?.connectionState;
      console.log('[WebRTC] 🔄 Connection state:', state);
      
      if (state === 'connected') {
        console.log('[WebRTC] 🎉 Fully connected!');
      }
    };

    this.peerConnection.onsignalingstatechange = () => {
      console.log('[WebRTC] 📡 Signaling state:', this.peerConnection?.signalingState);
    };

    // 8. Wait for channel to be ready
    console.log('[WebRTC] ⏳ Waiting for signaling channel...');
    await this.waitForChannelReady();

    // 9. If Caller, Create Offer
    if (isCaller) {
      console.log('[WebRTC] 📞 Caller initiating offer...');
      await this.createAndSendOffer();
    } else {
      console.log('[WebRTC] 📱 Receiver waiting for offer...');
    }

    return this.localStream;
  }

  private async waitForChannelReady(timeout: number = 5000): Promise<void> {
    const startTime = Date.now();
    while (!this.isChannelReady) {
      if (Date.now() - startTime > timeout) {
        throw new Error('Signaling channel timeout');
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    console.log('[WebRTC] ✅ Signaling channel ready!');
  }

  private async setupSignalingChannel() {
    const channelName = `webrtc-${this.tripId}`;
    console.log('[WebRTC] 📡 Setting up broadcast channel:', channelName);

    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Channel setup timeout'));
      }, 10000);

      this.channel = supabaseClient
        .channel(channelName, {
          config: {
            broadcast: { 
              self: false,
              ack: false 
            },
            presence: { key: this.currentUserId }
          }
        })
        .on('broadcast', { event: 'signal' }, ({ payload }) => {
          this.handleSignal(payload);
        })
        .on('presence', { event: 'sync' }, () => {
          const state = this.channel.presenceState();
          const users = Object.keys(state).length;
          console.log('[WebRTC] 👥 Presence sync:', users, 'users');
          
          if (users >= 2) {
            console.log('[WebRTC] ✅ Both peers present!');
          }
        })
        .on('presence', { event: 'join' }, ({ key }) => {
          console.log('[WebRTC] 👋 User joined:', key.substring(0, 8));
        })
        .on('presence', { event: 'leave' }, ({ key }) => {
          console.log('[WebRTC] 👋 User left:', key.substring(0, 8));
        })
        .subscribe(async (status: string) => {
          console.log('[WebRTC] 📡 Channel status:', status);
          
          if (status === 'SUBSCRIBED') {
            clearTimeout(timeout);
            console.log('[WebRTC] ✅ Channel subscribed!');
            
            try {
              await this.channel.track({
                user_id: this.currentUserId,
                online_at: new Date().toISOString()
              });
              
              this.isChannelReady = true;
              resolve();
            } catch (error) {
              console.error('[WebRTC] ❌ Error tracking presence:', error);
              this.isChannelReady = true;
              resolve();
            }
          } else if (status === 'CHANNEL_ERROR') {
            clearTimeout(timeout);
            console.error('[WebRTC] ❌ Channel error!');
            reject(new Error('Channel error'));
          } else if (status === 'TIMED_OUT') {
            clearTimeout(timeout);
            console.error('[WebRTC] ❌ Channel timeout!');
            reject(new Error('Channel timeout'));
          }
        });
    });
  }

  private sendSignal(type: string, data: any) {
    if (!this.channel || !this.isChannelReady) {
      console.error('[WebRTC] ❌ Cannot send signal: channel not ready');
      return;
    }

    const signal = {
      type,
      data,
      from: this.currentUserId,
      to: this.targetUserId,
      timestamp: Date.now()
    };

    console.log(`[WebRTC] 📤 Sending signal: ${type}`);
    
    this.channel.send({
      type: 'broadcast',
      event: 'signal',
      payload: signal
    }).then(() => {
      console.log(`[WebRTC] ✅ Signal sent: ${type}`);
    }).catch((error: any) => {
      console.error(`[WebRTC] ❌ Failed to send signal: ${type}`, error);
    });
  }

  private async handleSignal(signal: any) {
    if (signal.to !== this.currentUserId) {
      return;
    }

    console.log(`[WebRTC] 📨 Received signal: ${signal.type} from ${signal.from.substring(0, 8)}`);

    if (!this.peerConnection) {
      console.warn('[WebRTC] ⚠️ Received signal but peer connection not ready');
      return;
    }

    try {
      if (signal.type === 'offer' && !this.isInitiator) {
        await this.handleOffer(signal.data);
      } else if (signal.type === 'answer' && this.isInitiator) {
        await this.handleAnswer(signal.data);
      } else if (signal.type === 'candidate') {
        await this.handleCandidate(signal.data);
      } else if (signal.type === 'end') {
        console.log('[WebRTC] 📞 Call ended by remote peer');
        this.endCall(false);
      }
    } catch (error) {
      console.error(`[WebRTC] ❌ Error handling ${signal.type}:`, error);
    }
  }

  private async createAndSendOffer() {
    if (!this.peerConnection) return;

    try {
      console.log('[WebRTC] 📝 Creating offer...');
      const offer = await this.peerConnection.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true
      });
      
      console.log('[WebRTC] 📋 Offer created:', {
        type: offer.type,
        sdpLength: offer.sdp?.length
      });
      
      await this.peerConnection.setLocalDescription(offer);
      console.log('[WebRTC] ✅ Local description set (offer)');
      
      this.sendSignal('offer', { sdp: offer });
      console.log('[WebRTC] ✅ Offer sent to remote peer');
    } catch (error) {
      console.error('[WebRTC] ❌ Error creating offer:', error);
      throw error;
    }
  }

  private async handleOffer(data: any) {
    if (!this.peerConnection) return;

    try {
      console.log('[WebRTC] 📥 Processing offer...');
      
      await this.peerConnection.setRemoteDescription(
        new RTCSessionDescription(data.sdp)
      );
      this.hasRemoteDescription = true;
      console.log('[WebRTC] ✅ Remote description set (offer)');
      
      // Process queued candidates
      await this.processCandidateQueue();
      
      // Create answer
      console.log('[WebRTC] 📝 Creating answer...');
      const answer = await this.peerConnection.createAnswer();
      
      console.log('[WebRTC] 📋 Answer created:', {
        type: answer.type,
        sdpLength: answer.sdp?.length
      });
      
      await this.peerConnection.setLocalDescription(answer);
      console.log('[WebRTC] ✅ Local description set (answer)');
      
      // Send answer
      this.sendSignal('answer', { sdp: answer });
      console.log('[WebRTC] ✅ Answer sent to remote peer');
    } catch (error) {
      console.error('[WebRTC] ❌ Error handling offer:', error);
    }
  }

  private async handleAnswer(data: any) {
    if (!this.peerConnection) return;

    try {
      console.log('[WebRTC] 📥 Processing answer...');
      
      await this.peerConnection.setRemoteDescription(
        new RTCSessionDescription(data.sdp)
      );
      this.hasRemoteDescription = true;
      console.log('[WebRTC] ✅ Remote description set (answer)');
      
      // Process queued candidates
      await this.processCandidateQueue();
    } catch (error) {
      console.error('[WebRTC] ❌ Error handling answer:', error);
    }
  }

  private async handleCandidate(data: any) {
    if (!this.peerConnection) return;

    try {
      const candidate = new RTCIceCandidate(data.candidate);
      
      if (this.hasRemoteDescription) {
        await this.peerConnection.addIceCandidate(candidate);
        console.log('[WebRTC] ✅ ICE candidate added');
      } else {
        console.log('[WebRTC] 📦 Queueing ICE candidate (no remote description yet)');
        this.candidateQueue.push(candidate);
      }
    } catch (error) {
      console.error('[WebRTC] ❌ Error adding candidate:', error);
    }
  }

  private async processCandidateQueue() {
    if (!this.peerConnection || this.candidateQueue.length === 0) return;
    
    console.log(`[WebRTC] 📦 Processing ${this.candidateQueue.length} queued candidates`);

    const queue = [...this.candidateQueue];
    this.candidateQueue = [];

    for (const candidate of queue) {
      try {
        await this.peerConnection.addIceCandidate(candidate);
        console.log('[WebRTC] ✅ Queued candidate added');
      } catch (error) {
        console.error('[WebRTC] ❌ Error adding queued candidate:', error);
      }
    }
  }

  onRemoteStream(callback: (stream: MediaStream) => void) {
    this.onRemoteStreamCallback = callback;
  }

  onCallEnd(callback: () => void) {
    this.onCallEndCallback = callback;
  }

  endCall(sendSignal: boolean = true) {
    console.log('[WebRTC] 📵 Ending call...', { sendSignal });

    if (sendSignal && this.channel && this.isChannelReady) {
      this.sendSignal('end', {});
    }

    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        track.stop();
        console.log(`[WebRTC] 🛑 Stopped ${track.kind} track`);
      });
      this.localStream = null;
    }

    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
      console.log('[WebRTC] 🔒 Peer connection closed');
    }

    if (this.channel) {
      supabaseClient.removeChannel(this.channel);
      this.channel = null;
      console.log('[WebRTC] 📡 Channel unsubscribed');
    }

    this.remoteStream = null;
    this.candidateQueue = [];
    this.isChannelReady = false;
    this.hasRemoteDescription = false;

    console.log('[WebRTC] ✅ Call cleanup complete');

    if (this.onCallEndCallback) {
      this.onCallEndCallback();
    }
  }
}
