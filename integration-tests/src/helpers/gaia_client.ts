import {IgniteClient} from "@neutron-org/client-ts/src/client";
import {Module as CosmosAdminmoduleAdminmodule} from "@neutron-org/client-ts/src/cosmos.adminmodule.adminmodule";
import {Module as CosmosAuthV1Beta1} from "@neutron-org/client-ts/src/cosmos.auth.v1beta1";
import {Module as CosmosAuthzV1Beta1} from "@neutron-org/client-ts/src/cosmos.authz.v1beta1";
import {Module as CosmosBankV1Beta1} from "@neutron-org/client-ts/src/cosmos.bank.v1beta1";
import {Module as CosmosBaseTendermintV1Beta1} from "@neutron-org/client-ts/src/cosmos.base.tendermint.v1beta1";
import {Module as CosmosCrisisV1Beta1} from "@neutron-org/client-ts/src/cosmos.crisis.v1beta1";
import {Module as CosmosEvidenceV1Beta1} from "@neutron-org/client-ts/src/cosmos.evidence.v1beta1";
import {Module as CosmosFeegrantV1Beta1} from "@neutron-org/client-ts/src/cosmos.feegrant.v1beta1";
import {Module as CosmosParamsV1Beta1} from "@neutron-org/client-ts/src/cosmos.params.v1beta1";
import {Module as CosmosSlashingV1Beta1} from "@neutron-org/client-ts/src/cosmos.slashing.v1beta1";
import {Module as CosmosTxV1Beta1} from "@neutron-org/client-ts/src/cosmos.tx.v1beta1";
import {Module as CosmosUpgradeV1Beta1} from "@neutron-org/client-ts/src/cosmos.upgrade.v1beta1";
import {Module as CosmosVestingV1Beta1} from "@neutron-org/client-ts/src/cosmos.vesting.v1beta1";
import {Module as CosmwasmWasmV1} from "@neutron-org/client-ts/src/cosmwasm.wasm.v1";
import {Module as GaiaGlobalfeeV1Beta1} from "@neutron-org/client-ts/src/gaia.globalfee.v1beta1";
import {
    Module as IbcApplicationsInterchainAccountsControllerV1
} from "@neutron-org/client-ts/src/ibc.applications.interchain_accounts.controller.v1";
import {
    Module as IbcApplicationsInterchainAccountsHostV1
} from "@neutron-org/client-ts/src/ibc.applications.interchain_accounts.host.v1";
import {Module as IbcCoreChannelV1} from "@neutron-org/client-ts/src/ibc.core.channel.v1";
import {Module as IbcCoreClientV1} from "@neutron-org/client-ts/src/ibc.core.client.v1";
import {Module as IbcCoreConnectionV1} from "@neutron-org/client-ts/src/ibc.core.connection.v1";
import {
    Module as InterchainSecurityCcvConsumerV1
} from "@neutron-org/client-ts/src/interchain_security.ccv.consumer.v1";
import {
    Module as InterchainSecurityCcvProviderV1
} from "@neutron-org/client-ts/src/interchain_security.ccv.provider.v1";
import {Module as InterchainSecurityCcvV1} from "@neutron-org/client-ts/src/interchain_security.ccv.v1";
import {Module as RouterV1} from "@neutron-org/client-ts/src/router.v1";

export const GaiaClient = IgniteClient.plugin([
    CosmosAdminmoduleAdminmodule, CosmosAuthV1Beta1, CosmosAuthzV1Beta1, CosmosBankV1Beta1, CosmosBaseTendermintV1Beta1, CosmosCrisisV1Beta1, CosmosEvidenceV1Beta1, CosmosFeegrantV1Beta1, CosmosParamsV1Beta1, CosmosSlashingV1Beta1, CosmosTxV1Beta1, CosmosUpgradeV1Beta1, CosmosVestingV1Beta1, CosmwasmWasmV1, GaiaGlobalfeeV1Beta1, IbcApplicationsInterchainAccountsControllerV1, IbcApplicationsInterchainAccountsHostV1, IbcCoreChannelV1, IbcCoreClientV1, IbcCoreConnectionV1, InterchainSecurityCcvConsumerV1, InterchainSecurityCcvProviderV1, InterchainSecurityCcvV1, RouterV1
]);