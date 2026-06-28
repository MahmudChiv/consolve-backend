import { SearchDto } from './dto/search.dto';
import { NearbySearchDto } from './dto/nearby-search.dto';
import { SearchService } from './search.service';
export declare class SearchController {
    private readonly searchService;
    constructor(searchService: SearchService);
    search(dto: SearchDto): Promise<Record<string, unknown>>;
    nearby(dto: NearbySearchDto): Promise<Record<string, unknown>>;
    getCategories(): Promise<Record<string, unknown>>;
    getProfile(profileId: string): Promise<Record<string, unknown>>;
}
