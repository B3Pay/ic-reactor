// @ts-nocheck
/* eslint-disable no-console */
import { createReactor } from '@ic-reactor/core';
import candidA from './declarations/candidA';
import candidB from './declarations/candidB';
import { agentManager } from './agent';

await agentManager.authenticate();
const { authClient } = agentManager.getAuthState();

authClient?.login({
  onSuccess: () => {
    console.log('Logged in successfully');
  },
  onError: (error) => {
    console.error('Failed to login:', error);
  },
});

type CandidA = typeof candidA.candidA;
type CandidB = typeof candidB.candidB;

const actorA = createReactor<CandidA>({
  agentManager,
  canisterId: candidA.canisterId,
  idlFactory: candidA.idlFactory,
  withProcessEnv: true,
});
const actorB = createReactor<CandidB>({
  agentManager,
  canisterId: candidB.canisterId,
  idlFactory: candidB.idlFactory,
  withProcessEnv: true,
});

const { dataPromise: versionActorA } = actorA.queryCall({
  functionName: 'version',
});
console.log('Response from CanisterA method:', await versionActorA);

const { dataPromise: versionActorB } = actorB.queryCall({
  functionName: 'version',
});
console.log('Response from CanisterB method:', await versionActorB);
