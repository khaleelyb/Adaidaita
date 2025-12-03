import { ICE_SERVERS } from '../constants';
import { supabase } from './supabase';  // ← Changed from mockSupabase

export class WebRTCService {
  private peerConnection: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;
  private tripId: string;
  private onRemoteStreamCallback: ((stream: MediaStream) => void) | null = null;
  private onCallEndCallback: (() => void) | null = null;
  private candidateQueue: RTCIceCandidate[] = [];

  constructor(tripId: string) {
    this.tripId = tripId;
  }

  async startCall(isCaller: boolean): Promise<MediaStream> {
    // 1. Get Local Media
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    } catch (e) {
      console.error("Error accessing media devices", e);
      throw e;
    }

    // 2. Create Peer Connection
    this.peerConnection = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    // 3. Add Tracks
    this.localStream.getTracks().forEach(track => {
      if (this.localStream && this.peerConnection) {
        this.peerConnection.addTrack(track, this.localStream);
      }
    });

    // 4. Handle Remote Stream
    this.peerConnection.ontrack = (event) => {
      if (event.streams && event.streams[0]) {
        this.remoteStream = event.streams[0];
        if (this.onRemoteStreamCallback) {
          this.onRemoteStreamCallback(this.remoteStream);
        }
      }
    };

    // 5. Handle ICE Candidates
    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        supabase.send(`call-${this.tripId}`, 'candidate', { candidate: event.candidate });
      }
    };

    // 6. Connection state handling
    this.peerConnection.onconnectionstatechange = () => {
      console.log('Connection state:', this.peerConnection?.connectionState);
      if (this.peerConnection?.connectionState === 'disconnected' ||
          this.peerConnection?.connectionState === 'failed' ||
          this.peerConnection?.connectionState === 'closed') {
        this.endCall();
      }
    };

    // 7. Setup Signaling Listeners
    supabase.subscribe(`call-${this.tripId}`, async ({ event, payload }) => {
      if (!this.peerConnection) return;

      try {
        if (event === 'offer' && !isCaller) {
          await this.peerConnection.setRemoteDescription(new RTCSessionDescription(payload.sdp));
          await this.processCandidateQueue();
          const answer = await this.peerConnection.createAnswer();
          await this.peerConnection.setLocalDescription(answer);
          supabase.send(`call-${this.tripId}`, 'answer', { sdp: answer });
        } 
        else if (event === 'answer' && isCaller) {
          await this.peerConnection.setRemoteDescription(new RTCSessionDescription(payload.sdp));
          await this.processCandidateQueue();
        } 
        else if (event === 'candidate') {
          const candidate = new RTCIceCandidate(payload.candidate);
          if (this.peerConnection.remoteDescription && this.peerConnection.remoteDescription.type) {
            try {
              await this.peerConnection.addIceCandidate(candidate);
            } catch (e) {
              console.error("Error adding ice candidate", e);
            }
          } else {
            this.candidateQueue.push(candidate);
          }
        }
        else if (event === 'end') {
          this.endCall(false);
        }
      } catch (err) {
        console.error("Error handling WebRTC event:", event, err);
      }
    });

    // 8. If Caller, Create Offer
    if (isCaller) {
      const offer = await this.peerConnection.createOffer();
      await this.peerConnection.setLocalDescription(offer);
      supabase.send(`call-${this.tripId}`, 'offer', { sdp: offer });
    }

    return this.localStream;
  }

  private async processCandidateQueue() {
    if (!this.peerConnection) return;

    while (this.candidateQueue.length > 0) {
      const candidate = this.candidateQueue.shift();
      if (candidate) {
        try {
          if (this.peerConnection.remoteDescription) {
            await this.peerConnection.addIceCandidate(candidate);
          } else {
            console.warn("Dropping queued candidate: Remote description still null");
          }
        } catch (e) {
          console.error("Error adding queued ice candidate", e);
        }
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
    if (emitSignal) {
      supabase.send(`call-${this.tripId}`, 'end', {});
    }

    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
    }

    if (this.peerConnection) {
      this.peerConnection.close();
    }

    this.peerConnection = null;
    this.localStream = null;
    this.remoteStream = null;
    this.candidateQueue = [];

    if (this.onCallEndCallback) {
      this.onCallEndCallback();
    }
  }
}
