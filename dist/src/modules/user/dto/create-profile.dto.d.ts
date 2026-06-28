import { UserType, Gender } from '@prisma/client';
export declare class CreateProfileDto {
    firstName: string;
    lastName: string;
    gender: Gender;
    types: UserType[];
    avatarUrl?: string;
}
