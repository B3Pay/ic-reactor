---
editUrl: false
next: true
prev: true
title: API Reference
description: Generated API reference documentation
---

## Classes

- [ClientManager](classes/ClientManager.md)
- [DisplayReactor](classes/DisplayReactor.md)
- [DisplayCodecVisitor](classes/DisplayCodecVisitor.md)
- [CallError](classes/CallError.md)
- [CanisterError](classes/CanisterError.md)
- [ValidationError](classes/ValidationError.md)
- [Reactor](classes/Reactor.md)

## Interfaces

- [ActorDisplayCodec](interfaces/ActorDisplayCodec.md)
- [ApiError](interfaces/ApiError.md)
- [ValidationIssue](interfaces/ValidationIssue.md)
- [ClientManagerParameters](interfaces/ClientManagerParameters.md)
- [AgentState](interfaces/AgentState.md)
- [AuthState](interfaces/AuthState.md)
- [UpdateAgentParameters](interfaces/UpdateAgentParameters.md)
- [DefaultActorType](interfaces/DefaultActorType.md)
- [TransformArgsRegistry](interfaces/TransformArgsRegistry.md)
- [TransformReturnRegistry](interfaces/TransformReturnRegistry.md)
- [ActorMethodCodecs](interfaces/ActorMethodCodecs.md)
- [ReactorQueryParams](interfaces/ReactorQueryParams.md)
- [ReactorCallParams](interfaces/ReactorCallParams.md)
- [PollingConfig](interfaces/PollingConfig.md)

## Type Aliases

- [ValidationResult](type-aliases/ValidationResult.md)
- [Validator](type-aliases/Validator.md)
- [DisplayValidator](type-aliases/DisplayValidator.md)
- [DisplayReactorParameters](type-aliases/DisplayReactorParameters.md)
- [BlobType](type-aliases/BlobType.md)
- [NullishType](type-aliases/NullishType.md)
- [DisplayCommonType](type-aliases/DisplayCommonType.md)
- [DisplayOf](type-aliases/DisplayOf.md)
- [DisplayCodec](type-aliases/DisplayCodec.md)
- [BaseActor](type-aliases/BaseActor.md)
- [FunctionName](type-aliases/FunctionName.md)
- [FunctionType](type-aliases/FunctionType.md)
- [CanisterId](type-aliases/CanisterId.md)
- [ActorMethodParameters](type-aliases/ActorMethodParameters.md)
- [ActorMethodReturnType](type-aliases/ActorMethodReturnType.md)
- [ReactorParameters](type-aliases/ReactorParameters.md)
- [ActorMethodType](type-aliases/ActorMethodType.md)
- [ArgsType](type-aliases/ArgsType.md)
- [TransformKey](type-aliases/TransformKey.md)
- [ReactorArgs](type-aliases/ReactorArgs.md)
- [ReactorReturnOk](type-aliases/ReactorReturnOk.md)
- [ReactorReturnErr](type-aliases/ReactorReturnErr.md)
- [UnwrapOkErrResult](type-aliases/UnwrapOkErrResult.md)
- [OkResult](type-aliases/OkResult.md)
- [ErrResult](type-aliases/ErrResult.md)
- [IsOkErrResultType](type-aliases/IsOkErrResultType.md)
- [UnionToTuple](type-aliases/UnionToTuple.md)
- [IsBlobType](type-aliases/IsBlobType.md)
- [IsOptionalType](type-aliases/IsOptionalType.md)
- [IsCandidVariant](type-aliases/IsCandidVariant.md)
- [CandidVariantToIntersection](type-aliases/CandidVariantToIntersection.md)
- [CandidVariantKey](type-aliases/CandidVariantKey.md)
- [CandidVariantValue](type-aliases/CandidVariantValue.md)
- [CandidVariant](type-aliases/CandidVariant.md)
- [CandidKeyValue](type-aliases/CandidKeyValue.md)

## Variables

- [REMOTE_HOSTS](variables/REMOTE_HOSTS.md)
- [LOCAL_HOSTS](variables/LOCAL_HOSTS.md)
- [IC_HOST_NETWORK_URI](variables/IC_HOST_NETWORK_URI.md)
- [LOCAL_HOST_NETWORK_URI](variables/LOCAL_HOST_NETWORK_URI.md)
- [IC_INTERNET_IDENTITY_PROVIDER](variables/IC_INTERNET_IDENTITY_PROVIDER.md)
- [LOCAL_INTERNET_IDENTITY_PROVIDER](variables/LOCAL_INTERNET_IDENTITY_PROVIDER.md)
- [VERSION](variables/VERSION.md)

## Functions

- [fromZodSchema](functions/fromZodSchema.md)
- [didToDisplayCodec](functions/didToDisplayCodec.md)
- [didToDisplayCodecs](functions/didToDisplayCodecs.md)
- [transformArgsWithCodec](functions/transformArgsWithCodec.md)
- [transformResultWithCodec](functions/transformResultWithCodec.md)
- [didTypeFromArray](functions/didTypeFromArray.md)
- [isCanisterError](functions/isCanisterError.md)
- [isCallError](functions/isCallError.md)
- [isValidationError](functions/isValidationError.md)
- [createNullVariant](functions/createNullVariant.md)
- [createVariant](functions/createVariant.md)
- [getVariantKeyValue](functions/getVariantKeyValue.md)
- [getVariantKey](functions/getVariantKey.md)
- [getVariantValue](functions/getVariantValue.md)
- [isKeyMatchVariant](functions/isKeyMatchVariant.md)
- [generateKey](functions/generateKey.md)
- [isInLocalOrDevelopment](functions/isInLocalOrDevelopment.md)
- [getProcessEnvNetwork](functions/getProcessEnvNetwork.md)
- [getNetworkByHostname](functions/getNetworkByHostname.md)
- [extractOkResult](functions/extractOkResult.md)
- [isNullish](functions/isNullish.md)
- [nonNullish](functions/nonNullish.md)
- [uint8ArrayToHex](functions/uint8ArrayToHex.md)
- [hexToUint8Array](functions/hexToUint8Array.md)
- [createPollingStrategy](functions/createPollingStrategy.md)
