import { Request, Response } from 'express';
import { env } from '../config/env';

// A plain HTML landing page for the follow-up access link — distinct
// from the JSON API at /api/follow-up-access/:token (used by the
// mobile app's own token exchange). This page exists for exactly one
// reason: WhatsApp only renders http(s):// URLs as tappable links; the
// actual cbipes://follow-up-access/<token> deep link (which the app's
// AndroidManifest already handles correctly — see the intent-filter
// comment there) is never clickable when sent as raw text. This page
// gives the message a real https:// link to show, which then hands off
// into the app via that same working scheme, with a plain-language
// fallback if the app isn't installed yet.
//
// Deliberately does NOT touch the FollowUpTarget's status/accessedAt —
// that still only happens when the app itself calls the JSON API to
// exchange the token (services/followUp.service.ts#exchangeAccessToken).
// This page is just a redirect surface, not part of the access-grant
// logic, so simply *viewing* it (e.g. a WhatsApp link-preview crawler
// loading it) can never falsely mark a follow-up as accessed.
export function followUpLandingHandler(req: Request, res: Response) {
  const { token } = req.params;
  const deepLink = `cbipes://follow-up-access/${encodeURIComponent(token)}`;
  const apkUrl = env.apkDownloadUrl;

  res.status(200).type('html').send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>MSME Utkarsh — Follow-Up Access</title>
<meta http-equiv="refresh" content="0; url=${deepLink}" />
<style>
  body { font-family: -apple-system, Roboto, Arial, sans-serif; background: #F5F8FC; margin: 0; padding: 32px 20px; text-align: center; color: #172B4D; }
  .logo { font-size: 15px; font-weight: 800; color: #0B5CAB; letter-spacing: 0.3px; }
  h1 { font-size: 20px; margin: 24px 0 8px; }
  p { font-size: 14px; color: #6B7C93; line-height: 1.5; margin: 0 0 24px; }
  .btn { display: inline-block; background: #0B5CAB; color: #FFFFFF; text-decoration: none; font-weight: 700; font-size: 15px; padding: 14px 28px; border-radius: 12px; }
  .fallback { margin-top: 36px; padding-top: 24px; border-top: 1px solid #E1E8F0; }
  .fallback p { margin-bottom: 12px; }
  .fallback a { color: #0B5CAB; font-weight: 700; text-decoration: none; }
</style>
</head>
<body>
  <div class="logo">MSME UTKARSH</div>
  <h1>Opening your follow-up…</h1>
  <p>If the app doesn't open automatically, tap the button below.</p>
  <a class="btn" href="${deepLink}">Open MSME Utkarsh App</a>

  <div class="fallback">
    <p>Don't have the app installed yet?</p>
    <a href="${apkUrl}">Download MSME Utkarsh</a>
  </div>
</body>
</html>`);
}
