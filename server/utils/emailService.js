const { Resend } = require('resend');

let resendClient;

const getResendClient = () => {
  if (!resendClient) {
    resendClient = new Resend(process.env.RESEND_API_KEY);
  }
  return resendClient;
};

const sendEmail = async (args, userArg = null) => {
  const to = args?.to;
  const subject = args?.subject;
  const html = args?.html;
  const user = args?.user ?? userArg ?? null;

  if (user && user.receiveEmails === false) {
    return { success: false, reason: 'Email notifications disabled for this user' };
  }

  try {
    const resend = getResendClient();

    await resend.emails.send({
      from: process.env.EMAIL_FROM,
      to,
      subject,
      html
    });

    return { success: true };
  } catch (error) {
    console.error('Resend sendEmail error:', error);
    return { success: false, error };
  }
};

module.exports = { sendEmail };
