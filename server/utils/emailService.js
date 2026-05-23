const sendEmail = async (args, userArg = null) => {
  const to = args?.to;
  const subject = args?.subject;
  const html = args?.html;
  const user = args?.user ?? userArg ?? null;

  if (user && user.receiveEmails === false) {
    return { success: false, reason: 'Email notifications disabled for this user' };
  }

  try {
    const apiKey = process.env.BREVO_API_KEY;
    const emailFrom = process.env.EMAIL_FROM;

    if (!apiKey) {
      throw new Error('BREVO_API_KEY is not set in environment variables');
    }

    if (!emailFrom) {
      throw new Error('EMAIL_FROM is not set in environment variables');
    }

    const payload = {
      sender: {
        name: 'BARK',
        email: emailFrom
      },
      to: [
        {
          email: to
        }
      ],
      subject,
      htmlContent: html
    };

    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': apiKey
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(
        `Brevo API error: ${response.status} - ${
          errorData.message || JSON.stringify(errorData)
        }`
      );
    }

    return { success: true };
  } catch (error) {
    console.error('Brevo sendEmail error:', error);
    return { success: false, error };
  }
};

module.exports = { sendEmail };
