import { createReactorStore } from '@ic-reactor/core';
import { candid, canisterId, idlFactory } from './declarations/candid';

type Candid = typeof candid;

const { agentManager, callMethod } = createReactorStore<Candid>({
  canisterId,
  idlFactory,
});

// Usage example
await agentManager.authenticate();
const authClient = agentManager.getAuthClient();

authClient?.login({
  onSuccess: () => {
    console.log('Logged in successfully');
  },
  onError: (error) => {
    console.error('Failed to login:', error);
  },
});

// Call a method
const version = callMethod('version');

console.log('Response from version method:', await version);
