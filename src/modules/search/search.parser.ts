/**
 * search.parser.ts
 *
 * Isolates Gemini intent parsing logic from the main service.
 *
 * Workflow:
 *  1. Send raw query to Gemini 1.5 Flash with a structured extraction prompt
 *  2. Parse the JSON response
 *  3. On ANY failure (network, API key, parse error), fall back to a
 *     deterministic keyword extractor — the user NEVER sees an error
 */
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  GoogleGenerativeAI,
  GenerativeModel,
} from '@google/generative-ai';

export interface ParsedIntent {
  profession: string | null;
  location: string | null;
  experienceMin: number | null;
  specialties: string[];
  urgency: 'now' | 'scheduled' | 'unspecified';
  priceMax: number | null;
}

/** Common Nigerian cities / states for keyword fallback */
const NIGERIAN_LOCATIONS = [
  'lagos', 'abuja', 'ibadan', 'kano', 'akure', 'benin', 'enugu',
  'port harcourt', 'calabar', 'warri', 'jos', 'kaduna', 'owerri',
  'asaba', 'uyo', 'abeokuta', 'ilorin', 'oyo', 'onitsha', 'maiduguri',
  'zaria', 'ondo', 'sokoto', 'minna', 'makurdi', 'bauchi', 'yola',
];

const EXTRACTION_PROMPT = (query: string) => `
You are a search intent parser for a Nigerian marketplace app called Consolve.
Parse this search query and return ONLY valid JSON — no markdown, no explanation.

Query: "${query}"

Return this exact JSON structure:
{
  "profession": "string or null — type of service provider needed, normalised to lowercase English (e.g. tailor, electrician, plumber)",
  "location": "string or null — Nigerian city or state mentioned",
  "experienceMin": "number or null — minimum years of experience if mentioned",
  "specialties": ["array of specific skills or services mentioned"],
  "urgency": "now|scheduled|unspecified",
  "priceMax": "number or null — maximum price in Naira if mentioned"
}

Pidgin translation rules:
- "wey dey" = who does / that does
- "for" = in / at (location)
- "make" / "dey make" = who makes
- "good work" = high quality / experienced

Return ONLY the JSON object.
`.trim();

@Injectable()
export class SearchParser {
  private readonly logger = new Logger(SearchParser.name);
  private readonly model: GenerativeModel;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('gemini.apiKey')!;
    const genAI = new GoogleGenerativeAI(apiKey);
    this.model = genAI.getGenerativeModel({
      model: 'gemini-1.5-flash',
      generationConfig: { responseMimeType: 'application/json' },
    });
  }

  /**
   * Parse a raw search query into structured intent.
   * Falls back to keyword extraction if Gemini fails.
   */
  async parseIntent(query: string): Promise<ParsedIntent> {
    try {
      const result = await this.model.generateContent(EXTRACTION_PROMPT(query));
      const text = result.response
        .text()
        .trim()
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();

      const parsed = JSON.parse(text) as ParsedIntent;

      // Validate shape — ensure required fields exist
      return {
        profession: parsed.profession ?? null,
        location: parsed.location ?? null,
        experienceMin:
          typeof parsed.experienceMin === 'number' ? parsed.experienceMin : null,
        specialties: Array.isArray(parsed.specialties) ? parsed.specialties : [],
        urgency: (['now', 'scheduled', 'unspecified'] as const).includes(
          parsed.urgency as 'now' | 'scheduled' | 'unspecified',
        )
          ? (parsed.urgency as 'now' | 'scheduled' | 'unspecified')
          : 'unspecified',
        priceMax:
          typeof parsed.priceMax === 'number' ? parsed.priceMax : null,
      };
    } catch (err) {
      this.logger.warn(
        `Gemini intent parsing failed — using keyword fallback. Reason: ${err instanceof Error ? err.message : String(err)}`,
      );
      return this.keywordFallback(query);
    }
  }

  /**
   * Deterministic keyword fallback when Gemini is unavailable.
   * Extracts location from a known list and takes the first non-location
   * word as the profession guess.
   */
  keywordFallback(query: string): ParsedIntent {
    const lowerQuery = query.toLowerCase();

    // Find a known Nigerian location in the query
    let location: string | null = null;
    for (const city of NIGERIAN_LOCATIONS) {
      if (lowerQuery.includes(city)) {
        location = city;
        break;
      }
    }

    // Extract years of experience if mentioned
    const expMatch = lowerQuery.match(/(\d+)\s*(?:years?|yrs?)/);
    const experienceMin = expMatch ? parseInt(expMatch[1]) : null;

    // First meaningful word as profession guess (strip stop words)
    const stopWords = new Set([
      'find', 'me', 'a', 'an', 'the', 'i', 'need', 'want', 'looking',
      'for', 'near', 'in', 'at', 'trusted', 'good', 'best', 'urgent',
    ]);
    const profession =
      lowerQuery
        .split(/\s+/)
        .filter((w) => w.length > 2 && !stopWords.has(w) && !/\d/.test(w))
        .shift() ?? null;

    const urgency = lowerQuery.includes('urgent') || lowerQuery.includes('now')
      ? 'now'
      : 'unspecified';

    return {
      profession,
      location,
      experienceMin,
      specialties: [],
      urgency,
      priceMax: null,
    };
  }
}
