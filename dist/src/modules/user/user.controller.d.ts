import type { JwtPayload } from '../common/decorators/current-user.decorator';
import { CreateProfileDto } from './dto/create-profile.dto';
import { UserService } from './user.service';
export declare class UserController {
    private readonly userService;
    constructor(userService: UserService);
    updateProfile(dto: CreateProfileDto, user: JwtPayload): Promise<{
        message: string;
        data: {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            userId: string;
            firstName: string;
            lastName: string;
            gender: import("@prisma/client").$Enums.Gender;
            type: import("@prisma/client").$Enums.UserType;
            avatarUrl: string | null;
            onboardingStatus: import("@prisma/client").$Enums.OnboardingStatus;
        }[];
    }>;
    getProfiles(user: JwtPayload): Promise<{
        message: string;
        data: {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            userId: string;
            firstName: string;
            lastName: string;
            gender: import("@prisma/client").$Enums.Gender;
            type: import("@prisma/client").$Enums.UserType;
            avatarUrl: string | null;
            onboardingStatus: import("@prisma/client").$Enums.OnboardingStatus;
        }[];
    }>;
}
