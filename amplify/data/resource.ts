import { type ClientSchema, a, defineData } from '@aws-amplify/backend';
import { sendRequest } from '../functions/send-request/resource';

const schema = a.schema({
  CarStatus: a.enum(['available', 'rented', 'hidden']),

  Car: a
    .model({
      year: a.integer(),
      make: a.string().required(),
      model: a.string().required(),
      category: a.string(),
      tag: a.string(),
      status: a.ref('CarStatus'),
      description: a.string(),
      seats: a.integer(),
      odometer: a.integer(),
      fuel: a.string(),
      minAge: a.integer(),
      deposit: a.float(),
      milesPerDay: a.integer(),
      milesPerMonth: a.integer(),
      dailyRate: a.float(),
      multiDayRate: a.float(),
      weeklyRate: a.float(),
      monthlyRate: a.float(),
      // S3 paths under car-photos/. The first one is the cover photo.
      photos: a.string().array(),
      sortOrder: a.integer(),
    })
    .authorization((allow) => [
      allow.guest().to(['read']),
      allow.authenticated(),
    ]),

  requestBooking: a
    .mutation()
    .arguments({
      name: a.string().required(),
      phone: a.string().required(),
      email: a.string(),
      car: a.string(),
      pickupDate: a.string().required(),
      returnDate: a.string().required(),
      notes: a.string(),
      website: a.string(), // honeypot: real visitors leave this empty
    })
    .returns(a.json())
    .authorization((allow) => [allow.guest(), allow.authenticated()])
    .handler(a.handler.function(sendRequest)),
});

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: 'identityPool',
  },
});
