/**
 * onboarding.gateway.ts
 *
 * WebSocket gateway for the VOICE chat mode of AI onboarding.
 *
 * Pipeline:
 *   Client (browser mic via MediaRecorder)
 *     → WS binary frames (raw audio, e.g. webm/opus)
 *     → Deepgram STT (DeepgramClient v1 socket)
 *     → OnboardingService.processMessage() (Gemini AI)
 *     → ElevenLabs TTS (streamed synthesis)
 *     → WS binary frames back to client (MP3 audio)
 *       (client plays with Web Audio API — no server-side buffering)
 *
 * Mode-switch edge-case:
 *   The gateway reads the same Redis session as the text-chat controller.
 *   When a user switches from text → voice mid-session, the gateway picks up
 *   at session.currentStep seamlessly.
 *
 * Events (client → server):
 *   'join'        { userProfileId: string, userId: string }  — initialise session
 *   'audio_chunk' ArrayBuffer                                — raw mic audio
 *   'end_stream'  (none)                                     — end of utterance
 *
 * Events (server → client):
 *   'transcript'  { text: string, isFinal: boolean }
 *   'ai_text'     { chunk: string }
 *   'audio_chunk' ArrayBuffer (binary frame)
 *   'identity'    { ...fields }
 *   'done'        { ...fields }
 *   'error'       { message: string }
 */
import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  WsException,
} from '@nestjs/websockets';
import { Server, WebSocket } from 'ws';
import { DeepgramClient, ListenV1SmartFormat, ListenV1InterimResults, ListenV1VadEvents } from '@deepgram/sdk';
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import { ConfigService } from '@nestjs/config';
import { OnboardingService } from './onboarding.service';
import { OnboardingSessionService } from './session/onboarding-session.service';

interface JoinPayload {
  userProfileId: string;
  userId: string;
}

/** In-memory per-socket context (cleared on disconnect) */
interface SocketContext {
  userProfileId: string;
  userId: string;
  /** Dynamically created Deepgram V1Socket — typed as `any` to avoid deep internal imports */
  deepgramSocket: any;
  pendingTranscript: string;
}

@WebSocketGateway({
  path: '/ws/onboarding',
  cors: { origin: '*', credentials: true },
})
export class OnboardingGateway implements OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(OnboardingGateway.name);
  private readonly socketContextMap = new Map<WebSocket, SocketContext>();

  constructor(
    private readonly onboardingService: OnboardingService,
    private readonly sessionService: OnboardingSessionService,
    private readonly configService: ConfigService,
  ) {}

  // ─── Lifecycle ───────────────────────────────────────────────────────────────

  handleDisconnect(client: WebSocket): void {
    const ctx = this.socketContextMap.get(client);
    if (ctx?.deepgramSocket) {
      ctx.deepgramSocket.close();
    }
    this.socketContextMap.delete(client);
    this.logger.log('Voice client disconnected');
  }

  // ─── join ────────────────────────────────────────────────────────────────────

  @SubscribeMessage('join')
  async handleJoin(
    @MessageBody() payload: JoinPayload,
    @ConnectedSocket() client: WebSocket,
  ): Promise<void> {
    const { userProfileId, userId } = payload;

    this.socketContextMap.set(client, {
      userProfileId,
      userId,
      deepgramSocket: null,
      pendingTranscript: '',
    });

    // Bootstrap session if not exists (first join)
    const session = await this.sessionService.get(userProfileId);
    if (!session) {
      // Trigger session creation + opening greeting via processMessage
      const iter = this.onboardingService.processMessage(
        userId,
        userProfileId,
        '__START__',
        'voice',
      );
      await this.consumeAIStream(client, iter);
    }

    this.logger.log(`Voice session joined: profile=${userProfileId}`);
  }

  // ─── audio_chunk ─────────────────────────────────────────────────────────────

  @SubscribeMessage('audio_chunk')
  async handleAudioChunk(
    @MessageBody() data: Buffer,
    @ConnectedSocket() client: WebSocket,
  ): Promise<void> {
    const ctx = this.socketContextMap.get(client);
    if (!ctx) throw new WsException('Must send "join" before streaming audio');

    // Lazily initialise the Deepgram connection per utterance
    if (!ctx.deepgramSocket) {
      ctx.deepgramSocket = await this.createDeepgramSocket(client, ctx);
    }

    ctx.deepgramSocket.sendMedia(data);
  }

  // ─── end_stream ──────────────────────────────────────────────────────────────

  @SubscribeMessage('end_stream')
  handleEndStream(@ConnectedSocket() client: WebSocket): void {
    const ctx = this.socketContextMap.get(client);
    if (!ctx?.deepgramSocket) return;
    ctx.deepgramSocket.sendFinalize({ type: 'Finalize' });
    ctx.deepgramSocket.close();
    ctx.deepgramSocket = null;
  }

  // ─── Private: Deepgram V1 Socket ─────────────────────────────────────────────

  private async createDeepgramSocket(
    client: WebSocket,
    ctx: SocketContext,
  ): Promise<any> {
    const deepgramClient = new DeepgramClient({
      apiKey: this.configService.get<string>('deepgram.apiKey')!,
    });

    const socket = await deepgramClient.listen.v1.connect({
      Authorization: this.configService.get<string>('deepgram.apiKey')!,
      model: 'nova-2',
      language: 'en',
      smart_format: ListenV1SmartFormat.True,
      interim_results: ListenV1InterimResults.True,
      utterance_end_ms: '1000',
      vad_events: ListenV1VadEvents.True,
    });

    socket.on('open', () => {
      this.logger.debug('Deepgram socket open');
    });

    socket.on('message', async (response) => {
      // Transcript message
      if (response.type === 'Results') {
        const result = response as {
          type: string;
          channel: { alternatives: Array<{ transcript: string }> };
          is_final: boolean;
        };
        const transcript =
          result.channel?.alternatives?.[0]?.transcript ?? '';
        const isFinal = result.is_final;

        if (transcript) {
          this.send(client, 'transcript', { text: transcript, isFinal });
        }

        if (isFinal && transcript.trim()) {
          ctx.pendingTranscript = transcript.trim();

          try {
            const iter = this.onboardingService.processMessage(
              ctx.userId,
              ctx.userProfileId,
              ctx.pendingTranscript,
              'voice',
            );
            await this.consumeAIStream(client, iter);
          } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Unknown error';
            this.logger.error('Voice pipeline error', err);
            this.send(client, 'error', { message });
          }

          ctx.pendingTranscript = '';
        }
      }
    });

    socket.on('error', (err) => {
      this.logger.error('Deepgram error', err);
      this.send(client, 'error', { message: 'Speech recognition error' });
    });

    socket.on('close', () => {
      this.logger.debug('Deepgram socket closed');
    });

    socket.connect();
    return socket;
  }

  // ─── Private: AI Stream Consumer ────────────────────────────────────────────

  private async consumeAIStream(
    client: WebSocket,
    iter: AsyncGenerator<{ type: 'chunk' | 'identity' | 'done'; data: string }>,
  ): Promise<void> {
    let fullAiText = '';

    for await (const event of iter) {
      if (event.type === 'chunk') {
        fullAiText += event.data;
        this.send(client, 'ai_text', { chunk: event.data });
      } else if (event.type === 'identity') {
        this.send(client, 'identity', JSON.parse(event.data));
      } else if (event.type === 'done') {
        this.send(client, 'done', JSON.parse(event.data));
      }
    }

    // Stream TTS for the complete AI response
    if (fullAiText) {
      await this.synthesiseAndStream(client, fullAiText);
    }
  }

  // ─── Private: ElevenLabs TTS Streaming ──────────────────────────────────────

  /**
   * Streams TTS audio directly back to the client as binary WebSocket frames.
   * No buffering — each chunk forwarded immediately as it arrives from ElevenLabs.
   */
  private async synthesiseAndStream(
    client: WebSocket,
    text: string,
  ): Promise<void> {
    const elevenlabs = new ElevenLabsClient({
      apiKey: this.configService.get<string>('elevenlabs.apiKey')!,
    });

    const voiceId = this.configService.get<string>('elevenlabs.voiceId')!;

    try {
      const audioStream = await elevenlabs.textToSpeech.stream(voiceId, {
        text,
        modelId: 'eleven_multilingual_v2',
        outputFormat: 'mp3_44100_128',
      });

      for await (const chunk of audioStream) {
        if (client.readyState === WebSocket.OPEN) {
          // Binary frame — client decodes with Web Audio API
          client.send(chunk, { binary: true });
        }
      }
    } catch (err) {
      this.logger.error('ElevenLabs TTS error', err);
      this.send(client, 'error', { message: 'Text-to-speech unavailable' });
    }
  }

  // ─── Utility ─────────────────────────────────────────────────────────────────

  private send(client: WebSocket, event: string, data: unknown): void {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ event, data }));
    }
  }
}
