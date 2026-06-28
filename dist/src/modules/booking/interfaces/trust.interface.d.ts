export declare const TRUST_SERVICE = "TRUST_SERVICE";
export interface ITrustService {
    recalculate(providerProfileId: string): Promise<void>;
}
