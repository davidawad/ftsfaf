/**
 * Server context for sharing state across routes
 */

import { Layer } from 'effect';
import { makeDatabaseLayer } from '../runtime/db/layer.js';
import { DATABASE_PATH } from '../utils/constants.js';

interface ServerContext {
  workDir: string;
  dbLayer: Layer.Layer<any, never, any>;
}

let serverContext: ServerContext | null = null;

export function initServerContext(workDir: string) {
  serverContext = {
    workDir,
    dbLayer: makeDatabaseLayer(DATABASE_PATH),
  };
}

export function getServerContext(): ServerContext {
  if (!serverContext) {
    throw new Error('Server context not initialized');
  }
  return serverContext;
}
