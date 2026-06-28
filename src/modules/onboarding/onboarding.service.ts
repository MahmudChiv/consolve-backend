/**
 * onboarding.service.ts
 *
 * Core AI onboarding business logic.
 *
 * Responsibilities:
 *  - Initialise or resume a Redis-backed onboarding session
 *  - Orchestrate the 5-step question flow with Google Gemini
 *  - Upsert Identity fields live after each answered question
 *  - Generate AI pricing intelligence (range format) and a TL;DR summary
 *  - Finalise onboarding by persisting location and marking COMPLETED
 *
 * Conversation Steps:
 *   0 → profession     ("What kind of trade or service do you offer?")
 *   1 → expertise      (narrow-down follow-up if step 0 was broad)
 *   2 → availability   (full-time / part-time + specifics)
 *   3 → experience     (years)
 *   4 → pricing        (AI-generated range, e.g. "₦5,000 – ₦15,000/hr")
 *   5 → summary        (AI-generated TL;DR — marks session complete)
 */
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  GoogleGenerativeAI,
  GenerativeModel,
  ChatSession,
} from '@google/generative-ai';
import { PrismaService } from '../common/prisma/prisma.service';
import { OnboardingSessionService } from './session/onboarding-session.service';
import { UpdateLocationDto } from './dto/update-location.dto';
import { OnboardingStatus, UserType } from '@prisma/client';
import type {
  OnboardingSession,
  IdentityState,
} from './interfaces/onboarding-session.interface';

/** Steps that extract a specific field when completed */
const STEP_FIELD_MAP: Record<number, keyof IdentityState> = {
  0: 'profession',
  1: 'expertise',
  2: 'availability',
  3: 'experience',
  4: 'pricing',
  5: 'summary',
};

@Injectable()
export class OnboardingService {
  private readonly logger = new Logger(OnboardingService.name);
  private readonly genAI: GoogleGenerativeAI;
  private readonly model: GenerativeModel;

  constructor(
    private readonly prismaService: PrismaService,
    private readonly sessionService: OnboardingSessionService,
    private readonly configService: ConfigService,
  ) {
    const apiKey = this.configService.get<string>('gemini.apiKey')!;
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = this.genAI.getGenerativeModel({
      model: 'gemini-1.5-flash',
      systemInstruction: this.buildSystemInstruction(),
    });
  }

  // ─── System Prompt ───────────────────────────────────────────────────────────

  private buildSystemInstruction(): string {
    return `
You are Consolve's friendly onboarding AI. Your job is to collect professional information from a new service provider or trader through a warm, conversational interview.

RULES:
1. Always greet the user by their first name on the very first message.
2. Follow this exact question sequence — do NOT skip or reorder:
   STEP 0: Ask what kind of trade or service they offer.
   STEP 1: If their step 0 answer is broad (e.g. "software engineer", "trader", "consultant"), ask a narrowing follow-up to pin down their specialty (e.g. "Are you a frontend, backend, or fullstack engineer?"). If their answer was already specific (e.g. "plumber", "pastry chef"), skip to STEP 2 by immediately asking the availability question.
   STEP 2: Ask about their availability (full-time, part-time). If part-time, ask a follow-up: do they prefer weekdays, weekends, or specific hours?
   STEP 3: Ask how many years of experience they have.
   STEP 4: Based on everything collected (profession, specialty, experience, market context in Nigeria), generate a realistic PRICE RANGE in Naira (₦). Present it as "Based on your profile, a fair rate would be ₦X,XXX – ₦XX,XXX per hour/item/project." Confirm with the user.
   STEP 5: Generate a warm, professional TL;DR summary (2–3 sentences) about the user as if writing their public bio. Then say the onboarding is complete.

3. After each answer, extract the relevant data field clearly in your response — the backend will parse it.
4. Be warm, professional, and concise. Never ask more than one question per turn.
5. Respond in JSON format ONLY when extracting data — otherwise respond in plain conversational text.

DATA EXTRACTION FORMAT (use this when you have collected a field):
When you have extracted a field, end your message with a JSON block like:
<<<DATA>>>
{"field": "profession", "value": "Software Engineer"}
<<<END>>>

For pricing, the field is "pricing" and the value should be the range string.
For summary, the field is "summary" and the value is the 2-3 sentence bio.
`.trim();
  }

  // ─── Core: Process a Text Message ───────────────────────────────────────────

  /**
   * Process one user message, stream Gemini's response back via an async generator.
   * Emits text chunks as they arrive, then persists extracted data to the DB.
   */
  async *processMessage(
    userId: string,
    userProfileId: string,
    userMessage: string,
    mode: 'text' | 'voice' = 'text',
  ): AsyncGenerator<{ type: 'chunk' | 'identity' | 'done'; data: string }> {
    // ── Load or create session ───────────────────────────────────────────────
    let session = await this.sessionService.get(userProfileId);

    if (!session) {
      // First time — validate the profile exists and user is eligible
      const profile = await this.prismaService.userProfile.findFirst({
        where: { id: userProfileId, userId },
        include: { user: true },
      });

      if (!profile) throw new NotFoundException('User profile not found');
      if (profile.type === UserType.CUSTOMER) {
        throw new ForbiddenException('Customers do not require AI onboarding');
      }

      session = await this.sessionService.create(
        userProfileId,
        userId,
        profile.firstName,
      );

      // Ensure Identity row exists
      await this.upsertIdentity(userId, userProfileId, {});

      // Mark onboarding as IN_PROGRESS
      await this.prismaService.userProfile.update({
        where: { id: userProfileId },
        data: { onboardingStatus: OnboardingStatus.IN_PROGRESS },
      });
    }

    // Update mode in session (handles mode-switch mid-session)
    session.lastMode = mode;
    session.lastActiveAt = new Date().toISOString();

    // ── Rebuild Gemini chat from history ─────────────────────────────────────
    const chat: ChatSession = this.model.startChat({
      history: session.conversationHistory.map((t) => ({
        role: t.role,
        parts: [{ text: t.content }],
      })),
    });

    // ── Stream Gemini response ────────────────────────────────────────────────
    const streamResult = await chat.sendMessageStream(userMessage);

    let fullResponse = '';
    for await (const chunk of streamResult.stream) {
      const text = chunk.text();
      fullResponse += text;

      // Strip the data block from the streamed text chunk before emitting
      const clean = text.replace(/<<<DATA>>>[\s\S]*?<<<END>>>/g, '').trim();
      if (clean) {
        yield { type: 'chunk', data: clean };
      }
    }

    // ── Persist conversation history ──────────────────────────────────────────
    session.conversationHistory.push({ role: 'user', content: userMessage });
    session.conversationHistory.push({ role: 'model', content: fullResponse });

    // ── Extract structured data from the response ─────────────────────────────
    const extracted = this.extractDataBlock(fullResponse);
    if (extracted) {
      const { field, value } = extracted;
      session.identityState[field as keyof IdentityState] = value;

      // Live upsert to DB so the client's side panel updates in real time
      await this.upsertIdentity(userId, userProfileId, session.identityState);

      // Advance step
      session.currentStep = Math.min(session.currentStep + 1, 5);

      // Emit the updated identity state to the client
      yield {
        type: 'identity',
        data: JSON.stringify(this.buildIdentityPayload(session.identityState)),
      };

      // If step 5 (summary) is done, mark onboarding complete
      if (field === 'summary') {
        await this.prismaService.userProfile.update({
          where: { id: userProfileId },
          data: { onboardingStatus: OnboardingStatus.COMPLETED },
        });
        await this.sessionService.del(userProfileId);
        yield { type: 'done', data: JSON.stringify(this.buildIdentityPayload(session.identityState)) };
        return;
      }
    }

    // Save updated session back to Redis
    await this.sessionService.save(session);
  }

  // ─── Initial Greeting ────────────────────────────────────────────────────────

  /**
   * Generate the opening greeting if the user has no session yet.
   * Called when the client connects with an empty message.
   */
  async *startSession(
    userId: string,
    userProfileId: string,
  ): AsyncGenerator<{ type: 'chunk' | 'identity' | 'done'; data: string }> {
    yield* this.processMessage(
      userId,
      userProfileId,
      '__START__', // sentinel — Gemini's system prompt handles this as the opening
      'text',
    );
  }

  // ─── Location Finalisation ───────────────────────────────────────────────────

  /**
   * PATCH /user/onboarding
   * Add location data to the Identity and mark onboarding COMPLETED.
   * This is called after the AI conversation is done.
   */
  async finaliseLocation(
    userId: string,
    userProfileId: string,
    dto: UpdateLocationDto,
  ): Promise<object> {
    const identity = await this.prismaService.identity.findUnique({
      where: { userProfileId },
    });

    if (!identity) {
      throw new BadRequestException(
        'AI onboarding must be completed before adding location.',
      );
    }

    const updated = await this.prismaService.identity.update({
      where: { userProfileId },
      data: {
        latitude: dto.latitude,
        longitude: dto.longitude,
        city: dto.city,
        state: dto.state,
        country: dto.country,
      },
    });

    // Mark profile as completed if not already
    await this.prismaService.userProfile.update({
      where: { id: userProfileId },
      data: { onboardingStatus: OnboardingStatus.COMPLETED },
    });

    this.logger.log(`Onboarding fully completed for profile ${userProfileId}`);
    return updated;
  }

  // ─── Session Status ──────────────────────────────────────────────────────────

  /**
   * Returns the current identity state for a profile.
   * Useful for the client to pre-populate the side panel on reconnect.
   */
  async getSessionState(userId: string, userProfileId: string): Promise<object> {
    const identity = await this.prismaService.identity.findUnique({
      where: { userProfileId },
    });

    const session = await this.sessionService.get(userProfileId);

    return {
      identity: identity ?? {},
      currentStep: session?.currentStep ?? 0,
      isComplete: !session && !!identity,
    };
  }

  // ─── Private Helpers ─────────────────────────────────────────────────────────

  /**
   * Parse the <<<DATA>>> ... <<<END>>> block from Gemini's response.
   */
  private extractDataBlock(
    text: string,
  ): { field: string; value: string } | null {
    const match = text.match(/<<<DATA>>>([\s\S]*?)<<<END>>>/);
    if (!match) return null;
    try {
      return JSON.parse(match[1].trim()) as { field: string; value: string };
    } catch {
      return null;
    }
  }

  /**
   * Upsert the Identity row with whichever fields are currently known.
   * Parses AI-extracted strings into the correct DB types:
   *   expertise  → String[]   (split on comma)
   *   experience → Int?       (extract leading integer)
   *   availability → Json?    (wrap in {description: ...})
   *   pricing    → Json?      (parse ₦X–₦Y range or wrap raw)
   *   latitude/longitude → Float? (already Float in DB, cast from string if needed)
   */
  private async upsertIdentity(
    userId: string,
    userProfileId: string,
    state: Partial<IdentityState>,
  ): Promise<void> {
    // ── expertise: "senator wear, agbada, ankara" → ["senator wear", "agbada", "ankara"]
    const expertise: string[] = state.expertise
      ? state.expertise
          .split(/[,;|]/)
          .map((s) => s.trim())
          .filter(Boolean)
      : [];

    // ── experience: "8 years" | "8" → 8
    let experience: number | undefined;
    if (state.experience) {
      const match = state.experience.match(/\d+/);
      experience = match ? parseInt(match[0], 10) : undefined;
    }

    // ── availability: "full-time, weekdays" → { description, type }
    let availability: object | undefined;
    if (state.availability) {
      const raw = state.availability.toLowerCase();
      availability = {
        description: state.availability,
        type: raw.includes('full') ? 'full-time' : 'part-time',
        ...(raw.includes('weekday') && { preferredDays: 'weekdays' }),
        ...(raw.includes('weekend') && { preferredDays: 'weekends' }),
      };
    }

    // ── pricing: "₦5,000 – ₦15,000/hr" → { min, max, currency, unit, raw }
    let pricing: object | undefined;
    if (state.pricing) {
      const raw = state.pricing;
      // Strip currency symbols and commas, extract numbers
      const nums = raw.replace(/[₦,\s]/g, ' ').match(/\d+/g);
      const unit = /\/hr/i.test(raw) ? 'per_hour'
        : /\/day/i.test(raw) ? 'per_day'
        : /\/item/i.test(raw) ? 'per_item'
        : 'per_project';

      pricing = nums && nums.length >= 2
        ? { min: parseInt(nums[0]), max: parseInt(nums[1]), currency: 'NGN', unit, raw }
        : nums && nums.length === 1
        ? { min: parseInt(nums[0]), currency: 'NGN', unit, raw }
        : { raw, currency: 'NGN', unit };
    }

    await this.prismaService.identity.upsert({
      where: { userProfileId },
      create: {
        userId,
        userProfileId,
        profession: state.profession,
        summary: state.summary,
        expertise,
        ...(experience !== undefined && { experience }),
        ...(availability !== undefined && { availability }),
        ...(pricing !== undefined && { pricing }),
      },
      update: {
        ...(state.profession !== undefined && { profession: state.profession }),
        ...(state.summary !== undefined && { summary: state.summary }),
        ...(state.expertise !== undefined && { expertise }),
        ...(experience !== undefined && { experience }),
        ...(availability !== undefined && { availability }),
        ...(pricing !== undefined && { pricing }),
      },
    });
  }

  /**
   * Build the public-facing identity payload emitted to the client after each field update.
   */
  private buildIdentityPayload(state: IdentityState): object {
    return {
      'TL;DR Summary': state.summary ?? null,
      Profession: state.profession ?? null,
      'Expertise/Specialty': state.expertise ?? null,
      'Pricing Intelligence': state.pricing ?? null,
      Experience: state.experience ?? null,
      Availability: state.availability ?? null,
    };
  }
}
