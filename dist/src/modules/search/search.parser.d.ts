import { ConfigService } from '@nestjs/config';
export interface ParsedIntent {
    profession: string | null;
    location: string | null;
    experienceMin: number | null;
    specialties: string[];
    urgency: 'now' | 'scheduled' | 'unspecified';
    priceMax: number | null;
}
export declare class SearchParser {
    private readonly configService;
    private readonly logger;
    private readonly model;
    constructor(configService: ConfigService);
    parseIntent(query: string): Promise<ParsedIntent>;
    keywordFallback(query: string): ParsedIntent;
}
