import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { RedisService } from '../common/redis/redis.service';
import { NotificationType } from '@prisma/client';
import { INotificationService } from '../booking/interfaces/notification.interface';

const UNREAD_CACHE_PREFIX = 'notif:unread:';
const UNREAD_CACHE_TTL = 60; // 1 minute

@Injectable()
export class NotificationService implements INotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Send a notification. Implements INotificationService.
   */
  async notify(
    userId: string,
    userProfileId: string,
    type: string,
    title: string,
    message: string,
    data?: Record<string, unknown>,
  ): Promise<void> {
    // Cast string type to NotificationType enum safely
    const notifType = type as NotificationType;

    await this.prisma.notification.create({
      data: {
        userId,
        userProfileId,
        type: notifType,
        title,
        message,
        data: (data || {}) as any,
      },
    });

    // Invalidate Redis unread count cache
    const cacheKey = `${UNREAD_CACHE_PREFIX}${userId}`;
    await this.redis.del(cacheKey);

    this.logger.log(`Notification sent to user ${userId} / profile ${userProfileId} of type ${type}`);
  }

  /**
   * GET /notifications
   * Returns paginated notifications for current user.
   */
  async getNotifications(
    userId: string,
    query: { isRead?: boolean; page?: number; limit?: number },
  ) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.max(1, Math.min(100, query.limit ?? 20));
    const skip = (page - 1) * limit;

    const where: any = { userId };
    if (query.isRead !== undefined) {
      where.isRead = query.isRead;
    }

    const [items, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.notification.count({ where }),
    ]);

    return {
      items,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * PATCH /notifications/:id/read
   * Marks single notification as read.
   */
  async markRead(id: string, userId: string) {
    const notification = await this.prisma.notification.findFirst({
      where: { id, userId },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    const updated = await this.prisma.notification.update({
      where: { id },
      data: { isRead: true },
    });

    // Invalidate Redis unread count cache
    const cacheKey = `${UNREAD_CACHE_PREFIX}${userId}`;
    await this.redis.del(cacheKey);

    return updated;
  }

  /**
   * PATCH /notifications/read-all
   * Marks all as read.
   */
  async markAllRead(userId: string) {
    await this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });

    // Invalidate Redis unread count cache
    const cacheKey = `${UNREAD_CACHE_PREFIX}${userId}`;
    await this.redis.del(cacheKey);

    return { success: true, message: 'All notifications marked as read' };
  }

  /**
   * GET /notifications/unread-count
   * Returns unread count cached for 1 minute in Redis.
   */
  async getUnreadCount(userId: string): Promise<{ count: number }> {
    const cacheKey = `${UNREAD_CACHE_PREFIX}${userId}`;

    // Try cache first
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return { count: parseInt(cached, 10) };
    }

    const count = await this.prisma.notification.count({
      where: { userId, isRead: false },
    });

    // Cache the result for 1 minute
    await this.redis.set(cacheKey, count.toString(), UNREAD_CACHE_TTL);

    return { count };
  }
}
