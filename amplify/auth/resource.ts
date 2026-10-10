import { defineAuth } from '@aws-amplify/backend';

// Owner accounts only. Self sign-up is turned off in backend.ts, so Mark and Tony
// are added by hand in the Cognito console. Site visitors browse as guests.
export const auth = defineAuth({
  loginWith: {
    email: true,
  },
});
