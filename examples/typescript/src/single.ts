import { createCandidAdapter, createActorManager } from '@ic-reactor/core';
import { _SERVICE } from './declarations/icp-ledger';
import { agentManager } from './agent';

const candidAdapter = createCandidAdapter({ agentManager });

const canisterId = 'ryjl3-tyaaa-aaaaa-aaaba-cai';

(async () => {
  const { idlFactory } = await candidAdapter.getCandidDefinition(canisterId);

  const { callMethod } = createActorManager<_SERVICE>({
    agentManager,
    canisterId,
    idlFactory,
  });

  // await agentManager.authenticate();
  // const authClient = agentManager.getAuthClient();

  // authClient?.login({
  //   onSuccess: () => {
  //     console.log('Logged in successfully');
  //   },
  //   onError: (error) => {
  //     console.error('Failed to login:', error);
  //   },
  // });

  // Call a method
  const version = callMethod('name');

  console.log('Response from version method:', await version);
})();
