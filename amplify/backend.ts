import { defineBackend } from '@aws-amplify/backend';
import { FunctionUrl, FunctionUrlAuthType } from 'aws-cdk-lib/aws-lambda';
import { auth } from './auth/resource';
import { data } from './data/resource';
import { anthropicProxy } from './functions/anthropic-proxy/resource';

const backend = defineBackend({
  auth,
  data,
  anthropicProxy,
});

const fnUrl = new FunctionUrl(
  backend.anthropicProxy.resources.lambda.stack,
  'AnthropicProxyFnUrl',
  {
    function: backend.anthropicProxy.resources.lambda,
    authType: FunctionUrlAuthType.NONE,
    // No CORS here — handler.ts adds Access-Control-Allow-Origin: * on every response
    // to avoid duplicate headers that browsers reject
  }
);

backend.addOutput({
  custom: {
    anthropicProxyUrl: fnUrl.url,
  },
});
