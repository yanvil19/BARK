const welcomeCredentialsHtml = ({ name, email, tempPassword, loginUrl }) => `
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #002147; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
        .content { padding: 20px; border: 1px solid #ddd; border-top: none; border-radius: 0 0 5px 5px; }
        .credentials { background: #f9f9f9; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #002147; }
        .button { display: inline-block; padding: 10px 20px; background: #002147; color: white; text-decoration: none; border-radius: 5px; font-weight: bold; }
        .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #666; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h2>Welcome to NU-BOARD</h2>
        </div>
        <div class="content">
            <p>Hello ${name},</p>
            <p>An account has been created for you on the NU-BOARD platform by your department.</p>
            <p>You can use the following credentials to log in for the first time:</p>
            
            <div class="credentials">
                <p style="margin: 5px 0;"><strong>Email:</strong> ${email}</p>
                <p style="margin: 5px 0;"><strong>Temporary Password:</strong> ${tempPassword}</p>
            </div>
            
            <p><em>Note: You will be required to change this password immediately upon your first login.</em></p>
            
            <p style="text-align: center; margin: 30px 0;">
                <a href="${loginUrl}" class="button" style="color: white;">Log In to NU-BOARD</a>
            </p>
        </div>
        <div class="footer">
            <p>This is an automated message from the NU-BOARD system. Please do not reply to this email.</p>
        </div>
    </div>
</body>
</html>
`;

module.exports = { welcomeCredentialsHtml };
