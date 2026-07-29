const nodemailer = require('nodemailer');
const { env } = require('../config/env');

const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

const readableRole = (value) =>
  String(value || '')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

const emailConfigIssue = () => {
  if (!env.SMTP_HOST) return 'SMTP is not configured.';
  if (!env.MAIL_FROM && !env.SMTP_USER) return 'Mail sender is not configured.';
  if ((env.SMTP_USER && !env.SMTP_PASS) || (!env.SMTP_USER && env.SMTP_PASS)) {
    return 'SMTP username and password must be configured together.';
  }

  return null;
};

const createTransporter = () => {
  const secure = env.SMTP_SECURE === 'true';
  const port = Number(env.SMTP_PORT || (secure ? 465 : 587));

  return nodemailer.createTransport({
    host: env.SMTP_HOST,
    port,
    secure,
    auth: env.SMTP_USER
      ? {
          user: env.SMTP_USER,
          pass: env.SMTP_PASS,
        }
      : undefined,
  });
};

const sendUserInvitationEmail = async ({ user, plainPassword }) => {
  const configIssue = emailConfigIssue();
  if (configIssue) {
    return {
      sent: false,
      message: configIssue,
    };
  }

  const userId = user.id || user._id.toString();
  const subject = 'Your Worqi account is ready';
  const loginUrl = env.APP_URL;
  const role = readableRole(user.role);
  const lines = [
    `Hello ${user.name},`,
    '',
    'Your Worqi account has been created.',
    '',
    `Site link: ${loginUrl}`,
    `Login email: ${user.email}`,
    `User ID: ${userId}`,
    `Temporary password: ${plainPassword}`,
    `Role: ${role}`,
    '',
    'You will be asked to change this temporary password the first time you sign in.',
    'Keep these credentials private.',
  ];

  const htmlRows = [
    ['Site link', `<a href="${escapeHtml(loginUrl)}">${escapeHtml(loginUrl)}</a>`],
    ['Login email', escapeHtml(user.email)],
    ['User ID', escapeHtml(userId)],
    ['Temporary password', escapeHtml(plainPassword)],
    ['Role', escapeHtml(role)],
  ];

  try {
    const info = await createTransporter().sendMail({
      from: env.MAIL_FROM || env.SMTP_USER,
      to: user.email,
      subject,
      text: lines.join('\n'),
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.5;">
          <p>Hello ${escapeHtml(user.name)},</p>
          <p>Your Worqi account has been created.</p>
          <table cellpadding="6" cellspacing="0" style="border-collapse: collapse;">
            ${htmlRows
              .map(
                ([label, value]) =>
                  `<tr><td><strong>${escapeHtml(label)}</strong></td><td>${value}</td></tr>`
              )
              .join('')}
          </table>
          <p>You will be asked to change this temporary password the first time you sign in.</p>
          <p>Keep these credentials private.</p>
        </div>
      `,
    });

    const accepted = info.accepted || [];
    const rejected = info.rejected || [];

    console.log('User invitation email result:', {
      messageId: info.messageId,
      accepted,
      rejected,
    });

    if (rejected.length > 0) {
      return {
        sent: false,
        message: `Invitation email was rejected for: ${rejected.join(', ')}.`,
        messageId: info.messageId,
        accepted,
        rejected,
      };
    }

    return {
      sent: true,
      message:
        accepted.length > 0
          ? `Invitation email accepted by Gmail for: ${accepted.join(', ')}.`
          : 'Invitation email submitted to Gmail.',
      messageId: info.messageId,
      accepted,
      rejected,
    };
  } catch (error) {
    console.error('Failed to send user invitation email:', error);
    return {
      sent: false,
      message: 'Invitation email could not be sent. Check SMTP settings.',
    };
  }
};

module.exports = {
  sendUserInvitationEmail,
};
