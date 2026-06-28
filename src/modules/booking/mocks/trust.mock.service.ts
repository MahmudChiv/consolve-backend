import { Injectable, Logger } from '@nestjs/common';
import { ITrustService } from '../interfaces/trust.interface';

@Injectable()
export class TrustMockService implements ITrustService {
  private readonly logger = new Logger(TrustMockService.name);

  async recalculate(providerProfileId: string): Promise<void> {
    this.logger.log(`[MOCK TRUST] recalculate providerProfileId=${providerProfileId}`);
  }
}