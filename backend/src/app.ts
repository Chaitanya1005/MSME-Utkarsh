import express, { Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import authRoutes from './routes/auth.routes';
import orgRoutes from './routes/org.routes';
import leadRoutes from './routes/lead.routes';
import dashboardRoutes from './routes/dashboard.routes';
import followUpRoutes from './routes/followUp.routes';
import followUpAccessRoutes from './routes/followUpAccess.routes';
import bmLeadUpdateRoutes from './routes/bmLeadUpdate.routes';
import voiceUpdateRoutes from './routes/voiceUpdate.routes';
import { rmCallingRoutes, bmCallingRoutes } from './routes/calling.routes';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { env, isTest } from './config/env';
import whatsappWebhookRoutes from './routes/whatsappWebhook.routes';
import performanceRoutes from './routes/performance.routes';
export function createApp(): Express {
  const app = express();

  app.use(helmet());
  app.use(
    cors({
      origin: env.corsAllowedOrigins.length > 0 ? env.corsAllowedOrigins : true,
    })
  );
  // Default express.json() body limit (100kb) is far too small for a
  // base64-encoded voice recording (spec Phase 5 section 17's audio
  // contract) — raised specifically for that, not raised without reason.
  app.use(express.json({ limit: '15mb' }));

  if (!isTest) {
    app.use(morgan('dev'));
  }

  app.get('/health', (_req, res) => {
    res.status(200).json({ success: true, data: { status: 'ok' } });
  });
  app.use('/api/performance', performanceRoutes);
  app.use('/api/auth', authRoutes);
  app.use('/api/org', orgRoutes);
  app.use('/api/leads', leadRoutes);
  // Phase 2 additions — additive only, no existing route above is touched.
  app.use('/api/rm/dashboard', dashboardRoutes);
  app.use('/api/rm/follow-ups', followUpRoutes);
  app.use('/api/follow-up-access', followUpAccessRoutes);
  // Phase 3/4 additions — additive only, no existing route above is touched.
  app.use('/api/bm', bmLeadUpdateRoutes);
  app.use('/api/bm/voice-updates', voiceUpdateRoutes);
  // Phase 5 additions — additive only.
  app.use('/api/rm', rmCallingRoutes);
  app.use('/api/bm', bmCallingRoutes);
app.use('/api/webhooks/whatsapp', whatsappWebhookRoutes);
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
