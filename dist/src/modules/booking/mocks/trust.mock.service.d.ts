import { ITrustService } from '../interfaces/trust.interface';
export declare class TrustMockService implements ITrustService {
    private readonly logger;
    recalculate(providerProfileId: string): Promise<void>;
}
