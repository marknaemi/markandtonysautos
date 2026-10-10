import { defineStorage } from '@aws-amplify/backend';

export const storage = defineStorage({
  name: 'carPhotos',
  access: (allow) => ({
    'car-photos/*': [
      allow.guest.to(['read']),
      allow.authenticated.to(['read', 'write', 'delete']),
    ],
  }),
});
