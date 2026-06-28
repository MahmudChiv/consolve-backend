import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService implements OnModuleInit {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter | null = null;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    const host = this.configService.get<string>('smtp.host');
    const port = this.configService.get<number>('smtp.port');
    const user = this.configService.get<string>('smtp.user');
    const pass = this.configService.get<string>('smtp.pass');
    const secure = this.configService.get<boolean>('smtp.secure') ?? false;

    if (host && user && pass) {
      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure,
        auth: {
          user,
          pass,
        },
      });
      this.logger.log(`Nodemailer transporter initialized for ${host}:${port}`);
    } else {
      this.logger.warn(
        'SMTP configurations (SMTP_HOST, SMTP_USER, SMTP_PASS) are not fully defined. MailService will run in Mock mode (console output only).',
      );
    }
  }

  async sendEmail(
    to: string,
    subject: string,
    text: string,
    html?: string,
  ): Promise<void> {
    const from =
      this.configService.get<string>('smtp.from') ||
      'Consolve <no-reply@consolve.dev>';

    if (this.transporter) {
      try {
        await this.transporter.sendMail({
          from,
          to,
          subject,
          text,
          html,
        });
        this.logger.log(`Email successfully sent to ${to} (Subject: ${subject})`);
      } catch (error) {
        this.logger.error(
          `Failed to send email to ${to}: ${error.message}`,
          error.stack,
        );
        const nodeEnv = this.configService.get<string>('nodeEnv') || 'development';
        if (nodeEnv !== 'production') {
          this.logger.warn(
            `[DEV FALLBACK] SMTP send failed. Displaying email in console to prevent request failure:\n` +
              `[MOCK EMAIL] From: ${from} | To: ${to} | Subject: ${subject}\nText Content:\n${text}${
                html ? `\nHTML Content:\n${html}` : ''
              }`,
          );
          return;
        }
        throw error;
      }
    } else {
      this.logger.log(
        `[MOCK EMAIL] From: ${from} | To: ${to} | Subject: ${subject}\nText Content:\n${text}${
          html ? `\nHTML Content:\n${html}` : ''
        }`,
      );
    }
  }

  async sendOtp(to: string, otp: string): Promise<void> {
    const subject = 'Consolve Verification Code';
    const text = `Your Consolve one-time verification code is: ${otp}. It will expire in 10 minutes.`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
        <h2 style="color: #333333; text-align: center;">Consolve Verification Code</h2>
        <p style="font-size: 16px; color: #555555;">Hello,</p>
        <p style="font-size: 16px; color: #555555;">Your one-time passcode (OTP) for verification is:</p>
        <div style="text-align: center; margin: 30px 0;">
          <span style="font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #000000; background-color: #f5f5f5; padding: 10px 20px; border-radius: 4px; border: 1px dashed #cccccc;">${otp}</span>
        </div>
        <p style="font-size: 14px; color: #888888; text-align: center;">This code will expire in 10 minutes. If you did not request this code, please ignore this email.</p>
        <hr style="border: 0; border-top: 1px solid #eeeeee; margin: 20px 0;" />
        <p style="font-size: 12px; color: #aaaaaa; text-align: center;">&copy; ${new Date().getFullYear()} Consolve. All rights reserved.</p>
      </div>
    `;
    await this.sendEmail(to, subject, text, html);
  }
}
