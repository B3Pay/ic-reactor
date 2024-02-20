/* eslint-disable no-console */
import { createCandidAdapter, createReActor } from '@ic-reactor/core';
import { VisitDetails, VisitFields } from '@ic-reactor/visitor';
import { agentManager } from './agent';
import type { _SERVICE } from './declarations/icp-ledger';

const candidAdapter = createCandidAdapter({ agentManager });

const canisterId = 'ryjl3-tyaaa-aaaaa-aaaba-cai';

(async () => {
  try {
    const { idlFactory } = await candidAdapter.getCandidDefinition(canisterId);
    const { queryCall, getPrincipal, visitFunction } = createReActor<_SERVICE>({
      agentManager,
      canisterId,
      idlFactory,
      withVisitor: true,
    });

    console.log(getPrincipal()); // null

    (async function () {
      const { dataPromise } = queryCall({ functionName: 'name' });
      console.log(await dataPromise); // { name: 'Internet Computer' }
    })();

    const { dataPromise, getState } = queryCall({
      functionName: 'symbol',
    });

    (async function () {
      const { loading, data, error } = getState();
      console.log(loading); // true
      console.log(data); // undefined
      console.log(error); // undefined
    })();

    const callData = await dataPromise;

    const logFields = async () => {
      const fieldClass = new VisitFields();
      const fields = visitFunction.icrc1_transfer(fieldClass);
      console.log(fields);
    };

    const logDetails = async () => {
      const fieldClass = new VisitDetails();
      const fields = visitFunction.icrc1_transfer(fieldClass);
      console.log(fields);
    };

    (async function () {
      const { loading, data, error } = getState();
      console.log(data); // { symbol: 'ICP' }
      console.log(callData); // { symbol: 'ICP' }
      console.log(loading); // false
      console.log(error); // undefined
      await logFields();
      await logDetails();
    })();
  } catch (error) {
    console.error(error);
  }
})();
