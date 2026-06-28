import type { Response, Request } from 'express';
import type { JwtPayload } from '../common/decorators/current-user.decorator';
import { ChatMessageDto } from './dto/chat-message.dto';
import { UpdateLocationDto } from './dto/update-location.dto';
import { OnboardingService } from './onboarding.service';
export declare class OnboardingController {
    private readonly onboardingService;
    constructor(onboardingService: OnboardingService);
    getSession(user: JwtPayload, req: Request): Promise<object>;
    chat(dto: ChatMessageDto, user: JwtPayload, req: Request, res: Response): Promise<void>;
    finaliseLocation(dto: UpdateLocationDto, user: JwtPayload, req: Request): Promise<{
        message: string;
        data: object;
    }>;
}
