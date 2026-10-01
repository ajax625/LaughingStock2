const { execSync } = require('child_process');

let commitHash = 'de0bd2c';
try {
  commitHash = execSync('git rev-parse --short HEAD').toString().trim();
} catch (e) {}

const now = new Date();
const formattedDate = now.toLocaleDateString('en-US', {
  timeZone: 'America/Los_Angeles',
  month: '2-digit',
  day: '2-digit',
  year: 'numeric',
});
const formattedTime = now.toLocaleTimeString('en-US', {
  timeZone: 'America/Los_Angeles',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
}).toLowerCase().replace(' ', '');

const versionStr = `v1.0.${commitHash}`;
const buildDateStr = `${formattedDate} ${formattedTime} PST`;

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_APP_VERSION: versionStr,
    NEXT_PUBLIC_BUILD_DATE: buildDateStr,
  },
};

module.exports = nextConfig;
