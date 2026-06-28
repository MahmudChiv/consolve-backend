export interface JwtPayload {
    sub: string;
    phoneNumber: string;
    iat?: number;
    exp?: number;
}
export declare const CurrentUser: (...dataOrPipes: unknown[]) => ParameterDecorator;
