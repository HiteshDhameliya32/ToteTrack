const nodemailer = require("nodemailer");
const { getSmtpSettings } = require("../models/email.model");

async function createTransporter(companyId) {
  const smtp = await getSmtpSettings(companyId);

  if (!smtp) {
    throw new Error("SMTP settings not configured. Please configure SMTP in settings.");
  }

  console.log("================================");
  console.log(`SMTP SETTINGS FOR COMPANY ${companyId}:`, smtp);
  console.log("HOST:", smtp.host);
  console.log("PORT:", smtp.port);
  console.log("USER:", smtp.user);
  console.log("================================");

  return nodemailer.createTransport({
    host: String(smtp.host).trim(),
    port: Number(smtp.port),
    secure: Number(smtp.port) === 465,
    auth: {
      user: String(smtp.user).trim(),
      pass: String(smtp.pass).trim(),
    },
    tls: {
      rejectUnauthorized: false,
    },
  });
}

module.exports = { createTransporter };