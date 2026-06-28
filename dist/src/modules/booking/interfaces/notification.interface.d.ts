export declare const NOTIFICATION_SERVICE = "NOTIFICATION_SERVICE";
export interface INotificationService {
    notify(userId: string, userProfileId: string, type: string, title: string, message: string, data?: Record<string, unknown>): Promise<void>;
}
