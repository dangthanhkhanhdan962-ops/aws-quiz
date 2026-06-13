import { type ClientSchema, a, defineData } from '@aws-amplify/backend';

const schema = a.schema({
  QuizSession: a
    .model({
      userId:   a.string().required(),
      level:    a.string().required(),
      mode:     a.string().required(),   // 'exam' | 'design'
      company:  a.string(),
      scenario: a.string().required(),
      answer:   a.string(),              // selected option or truncated free-text
      score:    a.integer().required(),
      feedback: a.string(),              // JSON string: { isCorrect?, explanation?, correct?, improve?, solution? }
    })
    .authorization((allow) => [allow.guest()]),
});

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: 'identityPool',
  },
});
