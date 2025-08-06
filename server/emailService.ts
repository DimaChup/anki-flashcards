import { MailService } from '@sendgrid/mail';

if (!process.env.SENDGRID_API_KEY) {
  console.warn("SENDGRID_API_KEY not found. Email functionality will not work.");
}

const mailService = new MailService();
if (process.env.SENDGRID_API_KEY) {
  mailService.setApiKey(process.env.SENDGRID_API_KEY);
}

interface EmailParams {
  to: string;
  subject: string;
  html: string;
  from?: string;
}

export async function sendEmail(params: EmailParams): Promise<boolean> {
  if (!process.env.SENDGRID_API_KEY) {
    console.error('Cannot send email: SENDGRID_API_KEY not configured');
    return false;
  }

  try {
    await mailService.send({
      to: params.to,
      from: params.from || 'noreply@your-domain.com', // Replace with your verified sender
      subject: params.subject,
      html: params.html,
    });
    return true;
  } catch (error) {
    console.error('SendGrid email error:', error);
    return false;
  }
}

export function generateVerificationEmail(name: string, verificationUrl: string): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <title>Verify Your Email</title>
    </head>
    <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="color: white; margin: 0;">Welcome to our Multilingual Learning Platform!</h1>
        </div>
        
        <div style="background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px;">
            <h2 style="color: #333;">Hello ${name}!</h2>
            
            <p style="color: #666; font-size: 16px; line-height: 1.5;">
                Thank you for signing up! To get started with your personalized language learning journey, 
                please verify your email address by clicking the button below.
            </p>
            
            <div style="text-align: center; margin: 30px 0;">
                <a href="${verificationUrl}" 
                   style="background: #667eea; color: white; padding: 15px 30px; text-decoration: none; 
                          border-radius: 5px; font-weight: bold; display: inline-block;">
                    Verify Email Address
                </a>
            </div>
            
            <p style="color: #666; font-size: 14px;">
                If the button doesn't work, copy and paste this link into your browser:
                <br><br>
                <a href="${verificationUrl}" style="color: #667eea; word-break: break-all;">${verificationUrl}</a>
            </p>
            
            <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
            
            <p style="color: #999; font-size: 12px; text-align: center;">
                This verification link will expire in 24 hours. If you didn't create an account, 
                you can safely ignore this email.
            </p>
        </div>
    </body>
    </html>
  `;
}

export function generatePasswordResetEmail(name: string, resetUrl: string): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <title>Reset Your Password</title>
    </head>
    <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="color: white; margin: 0;">Reset Your Password</h1>
        </div>
        
        <div style="background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px;">
            <h2 style="color: #333;">Hello ${name}!</h2>
            
            <p style="color: #666; font-size: 16px; line-height: 1.5;">
                We received a request to reset your password. Click the button below to create a new password.
            </p>
            
            <div style="text-align: center; margin: 30px 0;">
                <a href="${resetUrl}" 
                   style="background: #dc3545; color: white; padding: 15px 30px; text-decoration: none; 
                          border-radius: 5px; font-weight: bold; display: inline-block;">
                    Reset Password
                </a>
            </div>
            
            <p style="color: #666; font-size: 14px;">
                If the button doesn't work, copy and paste this link into your browser:
                <br><br>
                <a href="${resetUrl}" style="color: #dc3545; word-break: break-all;">${resetUrl}</a>
            </p>
            
            <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
            
            <p style="color: #999; font-size: 12px; text-align: center;">
                This password reset link will expire in 1 hour. If you didn't request this reset, 
                you can safely ignore this email.
            </p>
        </div>
    </body>
    </html>
  `;
}