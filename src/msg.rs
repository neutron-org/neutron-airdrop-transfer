use cosmwasm_schema::{cw_serde, QueryResponses};
use cosmwasm_std::Uint128;
use neutron_sdk::sudo::msg::RequestPacketTimeoutHeight;

#[cw_serde]
pub struct InstantiateMsg {
    // connection_id between neutron-1 and cosmoshub-4 to make IBC transactions
    pub connection_id: String,

    // airdrop contract address that we claim neutrons from
    pub airdrop_address: String,

    // neutron to cosmoshub transfer channel id
    pub channel_id_to_hub: String,

    // IBC denom of neutron that was sent over our `cosmoshub_channel`
    pub ibc_neutron_denom: String,

    /// timeout for ica transactions
    pub ica_timeout_seconds: u64,
}

#[cw_serde]
pub enum ExecuteMsg {
    /// Creates ICA. Can be called if ICA is not created or channel was closed.
    CreateHubICA {},

    /// Step 1. Claim unclaimed airdrops and send them to this contract.
    ClaimUnclaimed {},

    /// Step 2. Requires ICA to be created. Send funds to ICA account.
    SendClaimedTokensToICA {
        timeout_height: RequestPacketTimeoutHeight,
    },

    /// Step 3. Requires ICA to be created and open. Fund cosmoshub community pool with sent funds.
    FundCommunityPool {},
}

#[cw_serde]
#[derive(QueryResponses)]
pub enum QueryMsg {
    #[returns(crate::state::Stage)]
    Stage {},

    #[returns(Option<crate::state::InterchainAccount>)]
    InterchainAccount {},

    #[returns(cosmwasm_std::Uint128)]
    TransferAmount {},

    #[returns(bool)]
    InterchainTxInProgress {},

    #[returns(Vec<crate::state::IbcCallbackState>)]
    IbcCallbackStates {},
}

/// MigrateMsg is for testing purposes only!
#[cw_serde]
pub struct MigrateMsg {
    /// timeout for ica transactions
    pub ica_timeout_seconds: Option<u64>,

    /// fund community pool amount
    pub transfer_amount: Option<Uint128>,

    /// IBC of untrn on gaia network
    pub ibc_neutron_denom: Option<String>,

    // ica address to send funds to
    pub ica_address: Option<String>,
}
