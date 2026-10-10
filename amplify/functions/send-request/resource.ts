import { defineFunction } from '@aws-amplify/backend';

export const sendRequest = defineFunction({
  name: 'send-request',
  entry: './handler.ts',
  timeoutSeconds: 15,
  environment: {
    // Both addresses must be verified in Amazon SES (see SETUP.md).
    TO_EMAIL: 'rent@markandtonysautos.com',
    FROM_EMAIL: 'rent@markandtonysautos.com',
  },
});
