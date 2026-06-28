import { UserProfile } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreateProfileDto } from './dto/create-profile.dto';
export declare class UserService {
    private readonly prismaService;
    private readonly logger;
    constructor(prismaService: PrismaService);
    createProfile(userId: string, dto: CreateProfileDto): Promise<UserProfile[]>;
    getProfiles(userId: string): Promise<UserProfile[]>;
}
