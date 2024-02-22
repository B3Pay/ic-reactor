import { createReactorCore } from '@ic-reactor/core';
import { b3_system, canisterId, idlFactory } from './declarations/candid';

type Candid = typeof b3_system;

const store = createReactorCore<Candid>({
  canisterId,
  idlFactory,
});

// Usage example
(async () => {
  await store.authenticate();
  const { authClient } = store.getAuthState();

  authClient?.login({
    onSuccess: () => {
      console.log('Logged in successfully');
    },
    onError: (error) => {
      console.error('Failed to login:', error);
    },
  });
})();
