function passwordResetTemplate(otp) {
  const safeOtp = String(otp || '').trim();

  return {
    subject: 'Your password reset code',
    html: `
      <div style="font-family: Arial, sans-serif; background:#f6f7fb; padding:24px;">
        <div style="max-width:520px; margin:0 auto; background:#ffffff; border:1px solid #e6e8f0; border-radius:10px; overflow:hidden;">
          <div style="background:#35408e; color:#fad227; padding:16px 20px; font-weight:700;">
            Password Reset
          </div>
          <div style="padding:20px; color:#1f2430;">
            <p style="margin:0 0 12px;">Use the code below to reset your password:</p>
            <div style="display:inline-block; padding:12px 16px; border-radius:10px; background:#f1f2f7; border:1px solid #e6e8f0; font-size:24px; letter-spacing:6px; font-weight:800;">
              ${safeOtp}
            </div>
            <p style="margin:14px 0 0; color:#6b7280; font-size:13px;">
              This code expires in <strong>10 minutes</strong>. If you didn't request this, you can ignore this email.
            </p>
          </div>
        </div>
      </div>
    `,
  };
}

module.exports = { passwordResetTemplate };

