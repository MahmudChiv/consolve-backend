import { INotificationService } from '../interfaces/notification.interface';
export declare class NotificationMockService implements INotificationService {
    private readonly logger;
    notify(userId: string, userProfileId: string, type: string, title: string, message: string, data?: Record<string, unknown>): Promise<void>;
}
