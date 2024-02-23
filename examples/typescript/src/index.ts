import {
  createCandidAdapter,
  createActorManager,
  createReactorCore,
} from '@ic-reactor/core';
import { _SERVICE } from './declarations/icp-ledger';
import { agentManager } from './agent';
import { InterfaceFactory } from '@dfinity/candid/lib/cjs/idl';

const candidAdapter = createCandidAdapter({ agentManager });

const canisterId = 'ryjl3-tyaaa-aaaaa-aaaba-cai';

const fetchCandidInterface = async () => {
  console.log('Fetch Candid Interface -----------------');
  const { idlFactory } = await candidAdapter.getCandidDefinition(canisterId);

  return idlFactory;
};

const actorManager = async (idlFactory: InterfaceFactory) => {
  console.log('Actor Manager -----------------');
  const { callMethod } = createActorManager<_SERVICE>({
    agentManager,
    canisterId,
    idlFactory,
  });

  // Call a method
  const version = callMethod('name');

  console.log('Response from version method:', await version);
};

const reactorCore = async (idlFactory: InterfaceFactory) => {
  console.log('Reactor Core -----------------');

  const { queryCall } = createReactorCore<_SERVICE>({
    agentManager,
    canisterId,
    idlFactory,
  });

  // Call a method
  const { subscribe } = queryCall({
    functionName: 'name',
  });

  subscribe((state) => {
    if (state.loading) {
      console.log('Loading...');
      return;
    }
    console.log('Response from version method:', state.data);
  });
};

(async () => {
  const idlFactory = await fetchCandidInterface();
  await actorManager(idlFactory);
  await reactorCore(idlFactory);
})();
