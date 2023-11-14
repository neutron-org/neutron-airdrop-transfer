use cosmwasm_schema::{cw_serde, QueryResponses};
use cosmwasm_std::Uint128;

#[cw_serde]
pub struct InstantiateMsg {
    // connection_id between neutron-1 and cosmoshub-4 to make IBC transactions
    pub connection_id: String,

    // neutron to cosmoshub transfer channel id
    pub transfer_channel_id: String,

    // IBC denom of neutron that was sent over our `cosmoshub_channel`
    pub ibc_neutron_denom: String,

    /// relative timeout for ica transactions
    pub ibc_timeout_seconds: u64,
}

#[cw_serde]
pub enum ExecuteMsg {
    /// Creates ICA. Can be called if ICA is not created or channel was closed.
    CreateHubICA {},

    /// Requires ICA to be created and open. Sends funds to ICA account.
    SendClaimedTokensToICA {},

    /// Requires ICA to be created and open. Funds cosmoshub community pool with given `amount` of funds.
    FundCommunityPool { amount: Uint128 },
}

#[cw_serde]
#[derive(QueryResponses)]
pub enum QueryMsg {
    #[returns(Option<crate::state::InterchainAccount>)]
    InterchainAccount {},

    #[returns(Vec<crate::state::IbcCallbackState>)]
    IbcCallbackStates {},
}

/// MigrateMsg is for testing purposes only!
#[cw_serde]
pub struct MigrateMsg {
    /// timeout for ica transactions
    pub ibc_timeout_seconds: Option<u64>,

    // ica address to send funds to
    pub ica_address: Option<String>,
}
