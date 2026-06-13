import { defineFunction, secret } from '@aws-amplify/backend';

export const anthropicProxy = defineFunction({
  name: 'anthropic-proxy',
  entry: './handler.ts',
  environment: {
    ANTHROPIC_API_KEY: secret('ANTHROPIC_API_KEY'),
  },
  timeoutSeconds: 30,
  memoryMB: 256,
});
