import { Injectable, Logger } from '@nestjs/common';
import { INotificationService } from '../interfaces/notification.interface';

@Injectable()
export class NotificationMockService implements INotificationService {
  private readonly logger = new Logger(NotificationMockService.name);

  async notify(
    userId: string,
    userProfileId: string,
    type: string,
    title: string,
    message: string,
    data?: Record<string, unknown>,
  ): Promise<void> {
    this.logger.log(`[MOCK NOTIFICATION] userId=${userId} profileId=${userProfileId} type=${type} title="${title}" msg="${message}" data=${JSON.stringify(data ?? {})}`);
  }
}