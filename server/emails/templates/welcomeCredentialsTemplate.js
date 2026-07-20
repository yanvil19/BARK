const welcomeCredentialsHtml = ({ name, email, tempPassword, loginUrl }) => `
  <div style="font-family: Arial, sans-serif; background:#f6f7fb; padding:24px;">
    <div style="max-width:640px; margin:0 auto; background:#ffffff; border:1px solid #e6e8f0; border-radius:10px; overflow:hidden;">
      <div style="background:#35408e; color:#fad227; padding:16px 20px; font-weight:800;">
        Welcome to NU BARK!
      </div>
      <div style="padding:20px; color:#1f2430;">
        <p style="margin:0 0 16px;">Hello ${name},</p>
        <p style="margin:0 0 16px;">An account has been created for you on the NU BARK platform by your department. You can use the following credentials to log in for the first time:</p>

        <table style="width:100%; border-collapse:collapse; font-size:14px;">
          <tr>
            <td style="padding:10px 0; color:#6b7280; width:160px;">Email</td> 
            <td style="padding:10px 0; font-weight:700;">${email}</td>
          </tr>
          <tr>
            <td style="padding:10px 0; color:#6b7280;">Temporary Password</td>
            <td style="padding:10px 0; font-weight:700;">${tempPassword}</td>
          </tr>
        </table>

        <p style="margin:16px 0 0; color:#6b7280; font-size:13px;">
          <em>You will be required to change this password immediately upon your first login.</em>
        </p>

        <p style="text-align:center; margin:24px 0 4px;">
          <a href="${loginUrl}" style="display:inline-block; padding:12px 24px; background:#35408e; color:#fad227; text-decoration:none; border-radius:8px; font-weight:800;">
            Log In to NU BARK
          </a>
        </p>

        <p style="margin:14px 0 0; color:#6b7280; font-size:13px;">
          This is an automated message from the NU BARK system. Please do not reply to this email.
        </p>
      </div>
    </div>
  </div>
`;

module.exports = { welcomeCredentialsHtml };